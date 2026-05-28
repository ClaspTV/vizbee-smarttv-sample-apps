import { Logger } from '@/services/logger/Logger';
import { findVideo, registerVideo } from '@/data/videos';
import { services } from '@/services/ServiceContainer';
import { fetchSdkDeploymentDate, formatSdkTimestamp } from '@/services/sdkDeploymentDate';
import type { PlatformName } from '@/core/platform/PlatformAdapter';
import type { FeatureFlags } from '@/services/feature-flags/flags';

// vizbee.js is loaded as an external <script> in index.html and exposes
// the global window.vizbee. No npm package; types come from the SDK guide.
declare global {
  interface Window {
    // SDK has no published .d.ts — narrow surface used here is described
    // in the integration guide at developer.vizbee.tv.
    vizbee?: any;
  }
}

export interface VizbeeVideoMeta {
  id: string;
  title: string;
  url: string;
  description?: string;
  posterUrl?: string;
  isLive?: boolean;
}

export interface VizbeePlayerBinding {
  videoEl: HTMLVideoElement;
  onPlay: () => void;
  onPause: () => void;
  onSeek: (timeSec: number) => void;
  onStop: () => void;
}

export interface IVizbeeService {
  init(appId: string): void;
  setVideo(meta: VizbeeVideoMeta, binding: VizbeePlayerBinding): void;
  setVideoStop(): void;
  reset(): void;
}

export class VizbeeService implements IVizbeeService {
  private readonly log = new Logger('VizbeeService');
  private initialized = false;
  private currentAdapter: any = null;
  // The SDK <script> URL actually loaded (script builds only; null for npm /
  // bundled builds, where the SDK has no S3 URL to date-stamp).
  private loadedSdkUrl: string | null = null;
  private deploymentDatePromise: Promise<string | null> | null = null;

  init(appId: string): void {
    if (this.initialized) {
      this.log.warn('init called twice; ignoring');
      return;
    }
    this.initialized = true;
    void this.startWhenReady(appId);
  }

  private async startWhenReady(appId: string): Promise<void> {
    const platform = services().platform.name;

    // Load the SDK two ways depending on the build:
    //  - npm build: bundle it from node_modules (build-time __SDK_NPM_PACKAGE__),
    //    a side-effect import that populates window.vizbee.
    //  - script build: inject the right SDK <script> URL for the platform.
    try {
      if (__SDK_NPM_PACKAGE__) {
        const loaded = await loadBundledSdk();
        if (!loaded) {
          this.log.warn('no bundled SDK for this build target; continuity disabled', {
            pkg: __SDK_NPM_PACKAGE__,
          });
          return;
        }
        this.log.info('using bundled Vizbee SDK', { pkg: __SDK_NPM_PACKAGE__ });
      } else {
        const sdkUrl = this.resolveSdkUrl(platform);
        if (!sdkUrl) {
          this.log.info('no Vizbee SDK URL for platform; continuity disabled', { platform });
          return;
        }
        this.loadedSdkUrl = sdkUrl;
        await loadScript(sdkUrl);
      }
    } catch (e) {
      this.log.error('failed to load Vizbee SDK', e);
      return;
    }

    const ok = await waitForSdk();
    if (!ok) {
      this.log.warn('SDK not available on window.vizbee; continuity disabled');
      return;
    }
    try {
      const ctx = window.vizbee.continuity.ContinuityContext.getInstance();
      ctx.start(appId);
      ctx.getAppAdapter().setDeeplinkHandler((info: any) => this.onDeeplink(info));
      this.log.info('continuity started', { appId });
    } catch (e) {
      this.log.error('continuity start failed', e);
    }
  }

  // Tizen and webOS ship 4 SDK builds selectable in Settings (full/light ×
  // ES5/ES6); the `vizbeeSdk` flag picks one. Other platforms ship a single
  // build, so the flag doesn't apply and they fall back to their per-platform URL.
  private resolveSdkUrl(platform: PlatformName): string | undefined {
    const variants = SDK_URL_BY_VARIANT[platform];
    if (variants) {
      return variants[services().flags.get('vizbeeSdk')];
    }
    return SDK_URL_BY_PLATFORM[platform];
  }

  private onDeeplink(videoInfo: any): void {
    // The SDK passes a VideoInfo instance (getters: guid, videoUrl, title,
    // imgUrl, desc, isLive, startTime, deeplink, customMetadata).
    const guid: string = videoInfo?.guid ?? '';
    const videoUrl: string = videoInfo?.videoUrl ?? '';
    const deeplink: string = videoInfo?.deeplink ?? '';
    const startTimeSec = Math.max(0, (videoInfo?.startTime ?? 0) / 1000);
    this.log.info('deeplink received', {
      guid,
      title: videoInfo?.title,
      videoUrl,
      deeplink,
      isLive: videoInfo?.isLive,
      startTimeSec,
      customMetadata: videoInfo?.customMetadata,
    });

    if (!guid) {
      this.log.warn('deeplink: missing guid; ignoring', videoInfo);
      return;
    }

    // 1) Exact catalog match on the guid, or 2) the trailing media-id segment
    // (mobile guids are often "category:vod::media:{mediaId}").
    const mediaId = guid.split(':').pop() ?? guid;
    let video = findVideo(guid) ?? findVideo(mediaId);

    // 3) Not in the catalog — play the cast payload directly using the URL the
    // mobile sent. Register it so the player can resolve it by id.
    if (!video) {
      if (!videoUrl) {
        this.log.warn(
          'deeplink: no catalog match and no videoUrl to play',
          { guid, mediaId, deeplink },
        );
        return;
      }
      video = {
        id: guid,
        title: videoInfo?.title || 'Cast video',
        description: videoInfo?.desc || '',
        posterUrl: videoInfo?.imgUrl || '',
        videoUrl,
        durationSec: 0,
      };
      registerVideo(video);
      this.log.info('deeplink: registered cast video', { id: video.id, videoUrl });
    }

    this.log.info('deeplink: navigating to player', { id: video.id });
    services().router.navigate(`/player/${encodeURIComponent(video.id)}`);
  }

  setVideo(meta: VizbeeVideoMeta, binding: VizbeePlayerBinding): void {
    if (!window.vizbee?.continuity) return;
    this.log.debug('setVideo', { id: meta.id, title: meta.title, isLive: !!meta.isLive });
    try {
      const ctx = window.vizbee.continuity.ContinuityContext.getInstance();
      const adapter = new window.vizbee.continuity.adapters.PlayerAdapter();
      adapter.setPlayerType(window.vizbee.continuity.adapters.PlayerType.HTML);
      adapter.setPlayerElement(binding.videoEl);
      adapter.setPlayHandler(() => binding.onPlay());
      adapter.setPauseHandler(() => binding.onPause());
      adapter.setSeekHandler((timeMs: number) => binding.onSeek(timeMs / 1000));
      adapter.setStopHandler(() => binding.onStop());

      const info = new window.vizbee.continuity.messages.VideoInfo();
      info.guid = `category:${meta.isLive ? 'live' : 'vod'}::media:${meta.id}`;
      info.title = meta.title;
      info.subtitle = '';
      info.desc = meta.description ?? '';
      info.imgUrl = meta.posterUrl ?? '';
      info.isLive = !!meta.isLive;
      info.videoUrl = meta.url;

      ctx.setPlayerAdapterWithVideoInfo(adapter, info);
      this.currentAdapter = adapter;
    } catch (e) {
      this.log.error('setVideo failed', e);
    }
  }

  setVideoStop(): void {
    if (!window.vizbee?.continuity) return;
    this.log.debug('setVideoStop');
    try {
      const ctx = window.vizbee.continuity.ContinuityContext.getInstance();
      ctx.stopVideo();
      if (this.currentAdapter) {
        ctx.removePlayerAdapter(this.currentAdapter);
        this.currentAdapter = null;
      }
    } catch (e) {
      this.log.error('setVideoStop failed', e);
    }
  }

  reset(): void {
    this.setVideoStop();
    this.initialized = false;
  }

  // The deployment date+time of the loaded continuity SDK, shown next to the
  // version in Settings → Device. Memoised.
  //  - script builds: the S3/CloudFront Last-Modified of the loaded <script>.
  //  - npm builds: the SDK is bundled into the app, so its "deployment" moment
  //    is when the app was built (__BUILD_TIME__).
  // null only if neither applies or the header can't be read.
  sdkDeploymentDate(): Promise<string | null> {
    if (this.loadedSdkUrl) {
      this.deploymentDatePromise ??= fetchSdkDeploymentDate(this.loadedSdkUrl);
      return this.deploymentDatePromise;
    }
    if (__SDK_NPM_PACKAGE__) {
      return Promise.resolve(formatSdkTimestamp(new Date(__BUILD_TIME__)));
    }
    return Promise.resolve(null);
  }
}

// Each TV platform ships its own SDK build; loading the wrong one yields a
// broken handshake. `desktop` is intentionally absent — App.ts gates init off.
// `tizen` and `webos` are resolved via SDK_URL_BY_VARIANT (Settings flag).
//
// XBOX NOTE: the URL below points at the legacy Xbox SDK that reaches into the
// EdgeHTML WinRT JS bridge (Windows.Networking.Connectivity, Windows.System.*,
// Windows.UI.WebUI.WebUIApplication, etc.). The new Xbox shell at
// platforms/xbox/shell/ hosts WebView2 (Chromium), where window.Windows.* does
// NOT exist — calls into this build will throw and break pairing / device info
// reporting. Swap this to the WebView2-compatible Xbox SDK build once it's
// published by the Vizbee SDK team (or wire a host-object bridge in
// MainPage.xaml.cs to proxy the WinRT calls).
const SDK_URL_BY_PLATFORM: Partial<Record<PlatformName, string>> = {
  viziosmartcast: 'https://sdk.claspws.tv/vizio_smartcast/v7/vizbee.js',
  xbox: 'https://sdk.claspws.tv/xbox_one/v7/vizbee.js',
};

// Platforms that expose the 4 selectable builds (full/light × ES5/ES6) via the
// `vizbeeSdk` Settings flag. Each full build serves both ES5 and ES6 from one
// URL; the light builds are split by target. Platforms absent here ship a
// single build and fall back to SDK_URL_BY_PLATFORM.
const SDK_URL_BY_VARIANT: Partial<Record<PlatformName, Record<FeatureFlags['vizbeeSdk'], string>>> = {
  tizen: {
    'full-es5': 'https://sdk.claspws.tv/v7/vizbee.js',
    'full-es6': 'https://sdk.claspws.tv/v7/vizbee.js',
    'light-es5': 'https://vzb-origin-dev.s3.us-east-1.amazonaws.com/sdk/test/vizbee_vtv_sdk_v2_tizen_html_native.js',
    'light-es6': 'https://vzb-origin-dev.s3.us-east-1.amazonaws.com/sdk/test/vizbee_vtv_sdk_v2_tizen_html_native_es6.js',
  },
  webos: {
    'full-es5': 'https://sdk.claspws.tv/lg_webos/v7/vizbee.js',
    'full-es6': 'https://sdk.claspws.tv/lg_webos/v7/vizbee.js',
    'light-es5': 'https://vzb-origin-dev.s3.us-east-1.amazonaws.com/sdk/test/vizbee_vtv_sdk_v2_lgwebos_html_native.js',
    'light-es6': 'https://vzb-origin-dev.s3.us-east-1.amazonaws.com/sdk/test/vizbee_vtv_sdk_v2_lgwebos_html_native_es6.js',
  },
};

// Import the bundled SDK for npm builds. __SDK_NPM_PACKAGE__ is a build-time
// constant (Vite define); the literal import is required so the bundler
// includes the package, and the branch tree-shakes away in builds where the
// constant is empty (script builds). Each package is a side-effect module that
// populates window.vizbee. Add a branch per package as more ship.
async function loadBundledSdk(): Promise<boolean> {
  if (__SDK_NPM_PACKAGE__ === 'vizbee-qa-sdk-tizen-es5') {
    await import('vizbee-qa-sdk-tizen-es5');
    return true;
  }
  if (__SDK_NPM_PACKAGE__ === 'vizbee-qa-sdk-lgwebos-es6') {
    await import('vizbee-qa-sdk-lgwebos-es6');
    return true;
  }
  return false;
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[data-vizbee-sdk="${src}"]`)) {
      resolve();
      return;
    }
    const el = document.createElement('script');
    el.src = src;
    el.async = true;
    el.dataset.vizbeeSdk = src;
    el.onload = () => resolve();
    el.onerror = () => reject(new Error(`failed to load ${src}`));
    document.head.appendChild(el);
  });
}

// onload should fire before window.vizbee is missing, but a few TV browsers
// expose the global one microtask later. Short backoff covers that.
async function waitForSdk(maxAttempts = 30, initialDelay = 100): Promise<boolean> {
  let delay = initialDelay;
  for (let i = 0; i < maxAttempts; i++) {
    if (window.vizbee?.continuity?.ContinuityContext) return true;
    await new Promise((r) => setTimeout(r, delay));
    delay = Math.min(delay * 1.5, 500);
  }
  return false;
}
