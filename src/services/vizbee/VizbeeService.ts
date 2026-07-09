import { Logger } from '@/services/logger/Logger';
import { findVideo, registerVideo } from '@/data/videos';
import { services } from '@/services/ServiceContainer';
import { fetchSdkDeploymentDate, formatSdkTimestamp } from '@/services/sdkDeploymentDate';
import { sdkOrigin } from '@/services/sdkEnv';
import type { PlatformName } from '@/core/platform/PlatformAdapter';
// window.vizbee is typed by @vizbeetv/sdk-qa/samsung (global Window augmentation
// in samsung.d.ts). The homesso namespace is bridged in via the VizbeeSDK module
// augmentation in src/types/global.d.ts — both continuity and homesso are
// accessible on window.vizbee without casts.
import '@vizbeetv/sdk-qa/samsung';

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
  // Push a player state change to the SDK immediately (elementless mode only;
  // no-op in element mode where the SDK reads state from the media element).
  // Use the PlayerState string values: 'loading', 'started', 'playing',
  // 'paused', 'buffering', 'ended', 'interrupted', 'error'.
  notifyPlayerState(state: string): void;
  reset(): void;
}

export class VizbeeService implements IVizbeeService {
  private readonly log = new Logger('VizbeeService');
  private initialized = false;
  private currentAdapter: any = null;
  // Maps video.id → original SDK guid as sent by the mobile, so setVideo can
  // echo back the exact guid the sender used rather than reconstructing it.
  private readonly deeplinkGuidMap = new Map<string, string>();
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
        const isElementless = services().flags.get('playerElement') === 'elementless';
        this.log.info('loading Vizbee SDK', { url: sdkUrl, mode: isElementless ? 'elementless' : 'element' });
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
  //
  // When `playerElement` is 'elementless', the dedicated elementless builds are
  // used instead (samsung-el / lg-el / xbox-el). These are currently only
  // available on the dev origin, so that origin is used for all environments.
  private resolveSdkUrl(platform: PlatformName): string | undefined {
    if (services().flags.get('playerElement') === 'elementless') {
      const esVariant = services().flags.get('vizbeeSdk').endsWith('es6') ? 'es6' : 'es5';
      return SDK_ELEMENTLESS_URL[esVariant][platform];
    }

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

    // Remember the exact guid the mobile used so setVideo can echo it back.
    this.deeplinkGuidMap.set(video.id, guid);
    this.log.info('deeplink: navigating to player', { id: video.id });
    services().router.navigate(`/player/${encodeURIComponent(video.id)}`);
  }

  setVideo(meta: VizbeeVideoMeta, binding: VizbeePlayerBinding): void {
    if (!window.vizbee?.continuity) return;
    const isElementless = services().flags.get('playerElement') === 'elementless';
    // Use the exact guid the mobile sent (stored on deeplink) so the SDK can
    // correlate the cast. Fall back to the standard format for locally-initiated
    // playback where no deeplink guid was recorded.
    const sdkGuid = this.deeplinkGuidMap.get(meta.id)
      ?? `category:${meta.isLive ? 'live' : 'vod'}::media:${meta.id}`;
    this.log.debug('setVideo', { id: meta.id, sdkGuid, title: meta.title, isLive: !!meta.isLive, isElementless });
    if (isElementless) this.log.info('elementless mode: using getVideoInfo() polling (no media element)');
    try {
      const ctx = window.vizbee.continuity.ContinuityContext.getInstance();

      // Remove the previous adapter (if any) before registering the new video.
      // This clears old metadata so the sender doesn't see stale title/image
      // during the new video's loading/buffering phase.
      if (this.currentAdapter) {
        try { ctx.removePlayerAdapter(this.currentAdapter); } catch (_) {}
        this.currentAdapter = null;
      }

      // Adapters map differs between SDK versions. HTMLPlayerAdapter presence is
      // the discriminator — it only exists in the new API:
      //
      //   old SDK:  PlayerAdapter('html')           |  PlayerAdapter('html', element)
      //   new SDK:  PlayerAdapter('html')           |  HTMLPlayerAdapter(element)
      //
      // Both old and new SDKs use PlayerAdapter for elementless — the SDK's
      // _isValidPlayerAdapter check is instanceof PlayerAdapter, so BasePlayerAdapter
      // (old SDK type) must never be used; it does not pass that check.
      const adapters = window.vizbee.continuity.adapters as any;
      const { PlayerAdapter } = window.vizbee.continuity.adapters;
      const isNewSdkApi = !!adapters.HTMLPlayerAdapter;

      let adapter: any;
      if (isElementless) {
        // Element-less mode: no media element passed to the adapter.
        // PlayerPage drives all state via notifyPlayerState(); the poller only
        // reads position + duration from this getter.
        adapter = isNewSdkApi
          ? new PlayerAdapter('html')
          : new (PlayerAdapter as any)('html');
        adapter.setVideoInfoGetter(() => {
          const el = binding.videoEl;
          const s = new window.vizbee!.continuity.messages.VideoStatus();
          s.guid = sdkGuid;
          s.currentPosition = (el.currentTime || 0) * 1000;
          s.duration = (el.duration || 0) * 1000;
          s.isLive = !!meta.isLive;
          s.state = el.paused ? 'paused' : 'playing';
          return s;
        });
      } else {
        adapter = isNewSdkApi
          ? new adapters.HTMLPlayerAdapter(binding.videoEl)
          : new (PlayerAdapter as any)('html', binding.videoEl);
      }

      adapter.setPlayHandler(() => {
        this.log.info('player event: play');
        binding.onPlay();
      });
      adapter.setPauseHandler(() => {
        this.log.info('player event: pause');
        binding.onPause();
      });
      adapter.setSeekHandler((timeMs: number) => {
        this.log.info('player event: seek', { timeSec: Math.round(timeMs / 100) / 10 });
        binding.onSeek(timeMs / 1000);
      });
      adapter.setStopHandler((reason?: string) => {
        this.log.info('player event: stop', { reason });
        if (reason !== 'stop_implicit') {
          this.log.info('player event: stop → calling onStop()');
          binding.onStop();
        } else {
          this.log.info('player event: stop_implicit → ignoring onStop()');
        }
      });

      const info = new window.vizbee.continuity.messages.VideoInfo();
      info.guid = sdkGuid;
      info.title = meta.title;
      info.subtitle = '';
      info.desc = meta.description ?? '';
      info.imgUrl = meta.posterUrl ?? '';
      info.isLive = !!meta.isLive;
      info.videoUrl = meta.url;

      // Register adapter + VideoInfo FIRST so the mobile has the correct
      // title/image before any state notification arrives.
      ctx.setPlayerAdapterWithVideoInfo(adapter, info);
      this.currentAdapter = adapter;
    } catch (e) {
      this.log.error('setVideo failed', e);
    }
  }

  notifyPlayerState(state: string): void {
    if (services().flags.get('playerElement') !== 'elementless') return;
    if (!this.currentAdapter || !window.vizbee?.continuity) return;
    this.log.info('notifyPlayerState', { state });
    try {
      const ctx = window.vizbee.continuity.ContinuityContext.getInstance();
      (ctx as any).notifyPlayerState(state);
    } catch (e) {
      this.log.error('notifyPlayerState failed', { state, e });
    }
  }

  setVideoStop(): void {
    if (!window.vizbee?.continuity) return;
    this.log.debug('setVideoStop');
    try {
      const ctx = window.vizbee.continuity.ContinuityContext.getInstance();
      const isElementless = services().flags.get('playerElement') === 'elementless';

      if (isElementless && this.currentAdapter) {
        // Push INTERRUPTED immediately via the new push API, then clean up.
        // No timeout needed — removePlayerAdapter() also auto-signals INTERRUPTED.
        const { PlayerState } = window.vizbee.continuity.messages;
        const adapter = this.currentAdapter;
        this.currentAdapter = null;
        try {
          (ctx as any).notifyPlayerState(PlayerState.INTERRUPTED);
          this.log.info('elementless: notified INTERRUPTED');
          ctx.removePlayerAdapter(adapter);
        } catch (e) {
          this.log.error('elementless: stop failed', e);
        }
        return;
      }

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

// Element-less SDK builds — dev origin only. ES variant mirrors the vizbeeSdk flag.
const SDK_ELEMENTLESS_URL: Record<'es5' | 'es6', Partial<Record<PlatformName, string>>> = {
  es5: {
    tizen: 'https://vzb-origin-dev.s3.amazonaws.com/samsung-el/v7/vizbee.js',
    webos: 'https://vzb-origin-dev.s3.amazonaws.com/lg-el/v7/vizbee.js',
    xbox: 'https://vzb-origin-dev.s3.amazonaws.com/xbox-el/v7/vizbee.js',
  },
  es6: {
    tizen: 'https://vzb-origin-dev.s3.amazonaws.com/samsung-el/es6/v7/vizbee.js',
    webos: 'https://vzb-origin-dev.s3.amazonaws.com/lg-el/es6/v7/vizbee.js',
    xbox: 'https://vzb-origin-dev.s3.amazonaws.com/xbox-el/es6/v7/vizbee.js',
  },
};

// Import the bundled SDK for npm builds. __SDK_NPM_PACKAGE__ is a build-time
// constant (Vite define); the literal import is required so the bundler
// includes the package, and the branch tree-shakes away in builds where the
// constant is empty (script builds). Each package is a side-effect module that
// populates window.vizbee. Add a branch per package as more ship.
async function loadBundledSdk(): Promise<boolean> {
  if (__SDK_NPM_PACKAGE__ === '@vizbeetv/sdk-qa/samsung') {
    await import('@vizbeetv/sdk-qa/samsung');
    return true;
  }
  if (__SDK_NPM_PACKAGE__ === '@vizbeetv/sdk-qa/samsung/es6') {
    await import('@vizbeetv/sdk-qa/samsung/es6');
    return true;
  }
  if (__SDK_NPM_PACKAGE__ === '@vizbeetv/sdk-qa/lg') {
    await import('@vizbeetv/sdk-qa/lg');
    return true;
  }
  if (__SDK_NPM_PACKAGE__ === '@vizbeetv/sdk-qa/lg/es6') {
    await import('@vizbeetv/sdk-qa/lg/es6');
    return true;
  }
  if (__SDK_NPM_PACKAGE__ === '@vizbeetv/sdk-qa/xbox') {
    await import('@vizbeetv/sdk-qa/xbox');
    return true;
  }
  if (__SDK_NPM_PACKAGE__ === '@vizbeetv/sdk-qa/xbox/es6') {
    await import('@vizbeetv/sdk-qa/xbox/es6');
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
