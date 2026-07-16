import { Logger } from '@/services/logger/Logger';
import { findVideo, registerVideo } from '@/data/videos';
import { services } from '@/services/ServiceContainer';
import { fetchSdkDeploymentDate, formatSdkTimestamp } from '@/services/sdkDeploymentDate';
import { sdkOrigin } from '@/services/sdkEnv';
import type { PlatformName } from '@/core/platform/PlatformAdapter';
// window.vizbee is typed by @vizbeetv/sdk-qa/samsung; homesso is bridged in via
// module augmentation in src/types/global.d.ts (no casts needed).
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
  // Push a player state change to the SDK (elementless mode only; no-op in
  // element mode). Values: PlayerState strings ('playing', 'paused', …).
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

    // Load the SDK per build: npm builds bundle it from node_modules
    // (__SDK_NPM_PACKAGE__); script builds inject the platform's <script> URL.
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

  // Compose the SDK <script> URL from `sdkEnv` (origin host) and `vizbeeSdk`
  // (full/light × ES5/ES6 path). Elementless mode uses the dev-origin -el builds.
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
    // DEV also prefixes an extra /sdk/ segment (qa/prod lack that path).
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
        isLive: videoInfo?.isLive,
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
    // correlate the cast; else fall back to the standard format.
    const sdkGuid = this.deeplinkGuidMap.get(meta.id)
      ?? `category:${meta.isLive ? 'live' : 'vod'}::media:${meta.id}`;
    this.log.debug('setVideo', { id: meta.id, sdkGuid, title: meta.title, isLive: !!meta.isLive, isElementless });
    if (isElementless) this.log.info('elementless mode: using getVideoInfo() polling (no media element)');
    try {
      const ctx = window.vizbee.continuity.ContinuityContext.getInstance();

      // Remove the previous adapter before registering the new video, so the
      // sender doesn't see stale title/image during loading.
      if (this.currentAdapter) {
        try { ctx.removePlayerAdapter(this.currentAdapter); } catch (_) {}
        this.currentAdapter = null;
      }

      // Adapter API differs by SDK version; HTMLPlayerAdapter presence flags the
      // new API. Always use PlayerAdapter for elementless (never BasePlayerAdapter).
      const adapters = window.vizbee.continuity.adapters as any;
      const { PlayerAdapter } = window.vizbee.continuity.adapters;
      const isNewSdkApi = !!adapters.HTMLPlayerAdapter;

      let adapter: any;
      if (isElementless) {
        // Element-less: no media element. PlayerPage drives state via
        // notifyPlayerState(); this getter only supplies position + duration.
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
        if (reason !== 'stop_implicit' && reason !== 'stop_reason_before_next_video') {
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

  // Deployment date of the loaded continuity SDK (Settings → Device), memoised:
  // script builds use the <script> Last-Modified; npm builds use __BUILD_TIME__.
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

// Per-platform path segment for the `light` SDK builds (Vizio/desktop absent).
// Xbox: prefer light on WebView2; the full build needs EdgeHTML WinRT globals.
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
// constant; literal imports let the bundler include the package and tree-shake.
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
  // Element-less builds (samsung-el / lg-el / xbox-el) — the only ones exposing
  // the elementless status pipeline (notifyPlayerState). Mirrors resolveSdkUrl().
  if (__SDK_NPM_PACKAGE__ === '@vizbeetv/sdk-qa/samsung-el/es5') {
    await import('@vizbeetv/sdk-qa/samsung-el/es5');
    return true;
  }
  if (__SDK_NPM_PACKAGE__ === '@vizbeetv/sdk-qa/samsung-el/es6') {
    await import('@vizbeetv/sdk-qa/samsung-el/es6');
    return true;
  }
  if (__SDK_NPM_PACKAGE__ === '@vizbeetv/sdk-qa/lg-el/es5') {
    await import('@vizbeetv/sdk-qa/lg-el/es5');
    return true;
  }
  if (__SDK_NPM_PACKAGE__ === '@vizbeetv/sdk-qa/lg-el/es6') {
    await import('@vizbeetv/sdk-qa/lg-el/es6');
    return true;
  }
  if (__SDK_NPM_PACKAGE__ === '@vizbeetv/sdk-qa/xbox-el/es5') {
    await import('@vizbeetv/sdk-qa/xbox-el/es5');
    return true;
  }
  if (__SDK_NPM_PACKAGE__ === '@vizbeetv/sdk-qa/xbox-el/es6') {
    await import('@vizbeetv/sdk-qa/xbox-el/es6');
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
