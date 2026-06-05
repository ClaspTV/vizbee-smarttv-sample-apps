import { Logger } from '@/services/logger/Logger';
import { findVideo, registerVideo } from '@/data/videos';
import { services } from '@/services/ServiceContainer';
import { fetchSdkDeploymentDate, formatSdkTimestamp } from '@/services/sdkDeploymentDate';
import { sdkOrigin } from '@/services/sdkEnv';
import type { PlatformName } from '@/core/platform/PlatformAdapter';
import type { VizbeeSDK } from '@vizbeetv/sdk/samsung';

// The continuity SDK populates the global window.vizbee (whether loaded via the
// external <script> or the @vizbeetv/sdk npm package). Its public surface is now
// typed by the package's shipped declarations. `homesso` is a separate SDK that
// also attaches to window.vizbee and is left loosely typed here.
declare global {
  interface Window {
    vizbee?: VizbeeSDK & { homesso?: any };
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
    if (!window.vizbee) return;
    try {
      const ctx = window.vizbee.continuity.ContinuityContext.getInstance();
      ctx.start(appId);
      ctx.getAppAdapter().setDeeplinkHandler((info) => this.onDeeplink(info));
      this.log.info('continuity started', { appId });
    } catch (e) {
      this.log.error('continuity start failed', e);
    }
  }

  // Compose the SDK <script> URL from two orthogonal axes:
  //   - `sdkEnv`    → the origin host (dev/qa/prod) — see services/sdkEnv.ts
  //   - `vizbeeSdk` → full vs light, ES5 vs ES6 (the path under that origin)
  // Tizen/webOS/Xbox expose all four variants in Settings; Vizio ships a single
  // monolithic build, and desktop has none (App.ts gates init off → undefined).
  private resolveSdkUrl(platform: PlatformName): string | undefined {
    const env = services().flags.get('sdkEnv');
    const origin = sdkOrigin(env);

    // Vizio: single monolithic build at the env origin root (no full/light).
    if (platform === 'viziosmartcast') return `${origin}/v7/vizbee.js`;

    const segment = SDK_LIGHT_SEGMENT[platform];
    if (!segment) return undefined;

    const variant = services().flags.get('vizbeeSdk');
    // full = the monolithic SDK at the origin root (one file serves ES5 + ES6).
    if (variant.startsWith('full')) return `${origin}/v7/vizbee.js`;
    // light = the per-target build under /<segment>/; ES6 adds an /es6/ segment.
    // DEV serves the newer "directsync" light builds under an extra /sdk/
    // segment (…/sdk/lg/v7/…); qa/prod don't have that path (they 403/404), so
    // the prefix is dev-only. Switch env to Dev in Settings (or ?ff_sdkEnv=dev)
    // to load it.
    const devPrefix = env === 'dev' ? 'sdk/' : '';
    const es6 = variant.endsWith('es6') ? 'es6/' : '';
    return `${origin}/${devPrefix}${segment}/${es6}v7/vizbee.js`;
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
      const adapter = new window.vizbee.continuity.adapters.PlayerAdapter(
        window.vizbee.continuity.adapters.PlayerType.HTML,
        binding.videoEl,
      );
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

// Per-platform path segment for the `light` (per-target) SDK builds, under the
// selected env origin. `desktop` is intentionally absent — App.ts gates init
// off — as is Vizio, which ships a single monolithic build (no full/light).
//
// XBOX NOTE: the `full` build is the legacy SDK that reaches into the EdgeHTML
// WinRT JS bridge (Windows.Networking.Connectivity, Windows.System.*,
// Windows.UI.WebUI.WebUIApplication, etc.). The new Xbox shell at
// platforms/xbox/shell/ hosts WebView2 (Chromium), where window.Windows.* does
// NOT exist — calls into that build will throw and break pairing / device info
// reporting. The `light` builds are the WebView2-compatible @vizbeetv/sdk xbox
// bundles; prefer those on the WebView2 shell (or wire a host-object bridge in
// MainPage.xaml.cs to proxy the WinRT calls for the full build).
const SDK_LIGHT_SEGMENT: Partial<Record<PlatformName, string>> = {
  tizen: 'samsung',
  webos: 'lg',
  xbox: 'xbox',
};

// Import the bundled SDK for npm builds. __SDK_NPM_PACKAGE__ is a build-time
// constant (Vite define); the literal import is required so the bundler
// includes the package, and the branch tree-shakes away in builds where the
// constant is empty (script builds). Each package is a side-effect module that
// populates window.vizbee. Add a branch per package as more ship.
async function loadBundledSdk(): Promise<boolean> {
  if (__SDK_NPM_PACKAGE__ === '@vizbeetv/sdk/samsung') {
    await import('@vizbeetv/sdk/samsung');
    return true;
  }
  if (__SDK_NPM_PACKAGE__ === '@vizbeetv/sdk/samsung/es6') {
    await import('@vizbeetv/sdk/samsung/es6');
    return true;
  }
  if (__SDK_NPM_PACKAGE__ === '@vizbeetv/sdk/lg') {
    await import('@vizbeetv/sdk/lg');
    return true;
  }
  if (__SDK_NPM_PACKAGE__ === '@vizbeetv/sdk/lg/es6') {
    await import('@vizbeetv/sdk/lg/es6');
    return true;
  }
  if (__SDK_NPM_PACKAGE__ === '@vizbeetv/sdk/xbox') {
    await import('@vizbeetv/sdk/xbox');
    return true;
  }
  if (__SDK_NPM_PACKAGE__ === '@vizbeetv/sdk/xbox/es6') {
    await import('@vizbeetv/sdk/xbox/es6');
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
