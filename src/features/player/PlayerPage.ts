import { findVideo } from '@/data/videos';
import { services } from '@/services/ServiceContainer';
import { createFocusableButton } from '@/components/FocusableButton';

const SEEK_STEP_SEC = 10;

export function renderPlayerPage(
  root: HTMLElement,
  params: Record<string, string>,
): () => void {
  root.innerHTML = '';
  const id = params.id;
  const video = findVideo(id);
  if (!video) {
    services().router.navigate('/home');
    return () => {};
  }

  const page = document.createElement('div');
  page.className = 'player-page';

  const videoEl = document.createElement('video');
  videoEl.className = 'player__video';
  videoEl.poster = video.posterUrl;
  videoEl.preload = 'auto';
  videoEl.autoplay = true;
  const detachSource = attachVideoSource(videoEl, video.videoUrl);
  // Explicit play() backs up the autoplay attribute — TV browsers vary on
  // whether the attribute alone fires after a hash-route navigation, where
  // the home-page click's user-gesture context has already been consumed.
  videoEl.play().catch((e) => console.warn('autoplay rejected', e?.name, e?.message));

  // Overlay (gradient + metadata + controls)
  const overlay = document.createElement('div');
  overlay.className = 'player__overlay';

  const meta = document.createElement('div');
  meta.className = 'player__meta';
  const title = document.createElement('h1');
  title.className = 'player__title';
  title.textContent = video.title;
  const desc = document.createElement('p');
  desc.className = 'player__desc';
  desc.textContent = video.description;
  meta.appendChild(title);
  meta.appendChild(desc);

  const controls = document.createElement('div');
  controls.className = 'player__controls';
  const timeEl = document.createElement('span');
  timeEl.className = 'player__time';
  timeEl.textContent = '0:00 / --:--';
  const progress = document.createElement('div');
  progress.className = 'player__progress';
  progress.setAttribute('data-focusable', 'true');
  progress.setAttribute('data-claim-axes', 'x');
  progress.setAttribute('tabindex', '-1');
  progress.setAttribute('role', 'slider');
  progress.setAttribute('aria-label', 'Seek');
  const progressFill = document.createElement('div');
  progressFill.className = 'player__progress-fill';
  progress.appendChild(progressFill);

  const seekBy = (deltaSec: number): void => {
    const dur = videoEl.duration || video.durationSec;
    videoEl.currentTime = Math.max(0, Math.min(dur, (videoEl.currentTime || 0) + deltaSec));
  };
  const seekBack = (): void => seekBy(-SEEK_STEP_SEC);
  const seekForward = (): void => seekBy(SEEK_STEP_SEC);

  // Smooth seek for REWIND / FAST_FORWARD (Prime Video style):
  //   • First keydown  → jump SEEK_STEP_SEC, start setInterval animation
  //   • Each keydown   → extends the "still held" debounce window
  //   • setInterval    → advances visual position at 15 % of total duration/s
  //   • keyup          → commit immediately (most reliable release signal)
  //   • 200 ms silence → fallback commit (TV remotes that suppress keyup)
  //
  // Uses setInterval (not rAF) because some TV WebViews throttle rAF
  // while a media element is active.
  // Speed is percentage-based so a 10-min and a 2-min video feel the same.
  let pendingSeekTime: number | undefined;
  let seekDirection: -1 | 1 | 0 = 0;
  let seekAnimInterval: number | undefined;
  let seekCommitTimer: number | undefined;
  let seekLastMs = 0;
  const SEEK_SPEED_PCT = 15; // % of total duration per real-second held

  const updateSeekBar = (t: number): void => {
    const dur = videoEl.duration || video.durationSec;
    if (dur && isFinite(dur)) {
      progressFill.style.width = `${Math.max(0, Math.min(100, (t / dur) * 100))}%`;
    }
    timeEl.textContent = `${formatTime(t)} / ${formatTime(dur)}`;
  };

  const stopSeekAnim = (): void => {
    window.clearInterval(seekAnimInterval);
    seekAnimInterval = undefined;
    seekLastMs = 0;
  };

  const commitSeek = (): void => {
    stopSeekAnim();
    window.clearTimeout(seekCommitTimer);
    seekDirection = 0;
    progressFill.classList.remove('player__progress-fill--scrubbing');
    if (pendingSeekTime !== undefined) {
      videoEl.currentTime = pendingSeekTime;
      pendingSeekTime = undefined;
    }
  };

  const onSeekKeyDown = (direction: -1 | 1): void => {
    if (pendingSeekTime === undefined) {
      // First press: jump immediately and start the animation.
      const dur = videoEl.duration || video.durationSec;
      pendingSeekTime = Math.max(0, Math.min(dur || 0, (videoEl.currentTime ?? 0) + direction * SEEK_STEP_SEC));
      seekDirection = direction;
      // Disable CSS transition so interval ticks render as instant width
      // changes. Works on WebKit (Tizen/webOS) via the !important class rule.
      progressFill.classList.add('player__progress-fill--scrubbing');
      updateSeekBar(pendingSeekTime);
      stopSeekAnim();
      seekLastMs = performance.now();
      seekAnimInterval = window.setInterval(() => {
        if (pendingSeekTime === undefined || seekDirection === 0) return;
        const now = performance.now();
        const dt = (now - seekLastMs) / 1000;
        seekLastMs = now;
        const dur = videoEl.duration || video.durationSec;
        const speedSec = ((dur || 0) * SEEK_SPEED_PCT) / 100;
        pendingSeekTime = Math.max(0, Math.min(dur || 0, pendingSeekTime + seekDirection * speedSec * dt));
        updateSeekBar(pendingSeekTime);
      }, 50);
    } else if (seekDirection !== direction) {
      seekDirection = direction; // direction reversed mid-hold
    }
    // Each keydown (repeat or not) proves key is still held — push back commit.
    window.clearTimeout(seekCommitTimer);
    seekCommitTimer = window.setTimeout(commitSeek, 800);
  };

  // keyup is the most reliable "key released" signal on platforms that fire it.
  // commitSeek is idempotent so double-firing with the debounce is harmless.
  const onSeekKeyUp = (e: KeyboardEvent): void => {
    const seekKeyCodes = new Set([412, 417, 179]); // REWIND, FF, PLAY_PAUSE
    if (pendingSeekTime !== undefined && seekKeyCodes.has(e.keyCode)) {
      commitSeek();
    }
  };
  window.addEventListener('keyup', onSeekKeyUp, true);
  const togglePlay = (): void => {
    if (videoEl.paused) videoEl.play().catch((e) => console.warn('video.play() rejected', e?.name, e?.message));
    else videoEl.pause();
  };

  // Leave the player and return to the previous screen (Home). Shared by the
  // STOP/BACK keys and the end-of-playback handler below.
  // Guard prevents double-navigation when both 'ended' and the timeupdate
  // fallback fire in the same tick (common on Tizen/Android WebView HLS).
  let exited = false;
  const exitPlayer = (): void => {
    if (exited) return;
    exited = true;
    services().vizbee.setVideoStop();
    services().router.back('/home');
  };

  services().vizbee.setVideo(
    {
      id: video.id,
      title: video.title,
      url: video.videoUrl,
      description: video.description,
      posterUrl: video.posterUrl,
      isLive: video.isLive,
    },
    {
      videoEl,
      onPlay: () => videoEl.play().catch((e) => console.warn('video.play() rejected', e?.name, e?.message)),
      onPause: () => videoEl.pause(),
      onSeek: (timeSec) => {
        const dur = videoEl.duration || video.durationSec;
        videoEl.currentTime = Math.max(0, Math.min(dur, timeSec));
      },
      onStop: () => {
        videoEl.pause();
        services().router.back('/home');
      },
    },
  );

  const buttons = document.createElement('div');
  buttons.className = 'player__buttons';
  const rewindBtn = createFocusableButton({
    label: `« ${SEEK_STEP_SEC}s`,
    className: 'focusable-btn--ghost player__btn',
    onActivate: seekBack,
  });
  const playPauseBtn = createFocusableButton({
    label: 'Play',
    className: 'focusable-btn--primary player__btn player__btn--play',
    onActivate: togglePlay,
  });
  const forwardBtn = createFocusableButton({
    label: `${SEEK_STEP_SEC}s »`,
    className: 'focusable-btn--ghost player__btn',
    onActivate: seekForward,
  });
  buttons.appendChild(rewindBtn);
  buttons.appendChild(playPauseBtn);
  buttons.appendChild(forwardBtn);

  controls.appendChild(timeEl);
  controls.appendChild(progress);
  controls.appendChild(buttons);

  overlay.appendChild(meta);
  overlay.appendChild(controls);

  page.appendChild(videoEl);
  page.appendChild(overlay);
  root.appendChild(page);

  // Immersive mode: hide the side menu while in playback. Spatial focus nav
  // stays *active* so LEFT/RIGHT moves between the rewind/play/forward
  // buttons; direct seek is on the dedicated REWIND/FAST_FORWARD remote keys.
  const layout = document.querySelector<HTMLElement>('.app-layout');
  layout?.classList.add('app-layout--immersive');
  services().focus.setFocus(playPauseBtn);

  // Reflect playback state in the play/pause label.
  const syncPlayLabel = (): void => {
    playPauseBtn.textContent = videoEl.paused ? 'Play' : 'Pause';
  };
  videoEl.addEventListener('play', syncPlayLabel);
  videoEl.addEventListener('pause', syncPlayLabel);

  // VOD finished — return to the previous page automatically. (Live streams
  // don't fire 'ended', so this is a no-op for them.)
  const onEnded = (): void => exitPlayer();
  videoEl.addEventListener('ended', onEnded);

  // Push player state to the Vizbee SDK. notifyPlayerState() is a no-op in
  // element mode — only active in elementless mode where the SDK has no media
  // element to read from. This mirrors what real host apps do: call from their
  // own player callbacks rather than relying on event listener wiring in the SDK.
  const vzb = services().vizbee;
  const onVzbLoadStart    = (): void => vzb.notifyPlayerState('loading');
  const onVzbLoadedMeta   = (): void => vzb.notifyPlayerState('started');
  const onVzbPlaying      = (): void => vzb.notifyPlayerState('playing');
  const onVzbPause        = (): void => { if (!videoEl.ended) vzb.notifyPlayerState('paused'); };
  const onVzbEnded        = (): void => vzb.notifyPlayerState('ended');
  const onVzbWaiting      = (): void => vzb.notifyPlayerState('buffering');
  const onVzbError        = (): void => vzb.notifyPlayerState('error');
  videoEl.addEventListener('loadstart',      onVzbLoadStart);
  videoEl.addEventListener('loadedmetadata', onVzbLoadedMeta);
  videoEl.addEventListener('playing',        onVzbPlaying);
  videoEl.addEventListener('pause',          onVzbPause);
  videoEl.addEventListener('ended',          onVzbEnded);
  videoEl.addEventListener('waiting',        onVzbWaiting);
  videoEl.addEventListener('error',          onVzbError);
  // loadstart fires when src is set — before setVideo() is called — so push
  // the initial state now that VideoInfo is registered with the SDK.
  vzb.notifyPlayerState('loading');

  // Auto-hide overlay after a few seconds of no input.
  let hideTimer: number | undefined;
  const showOverlay = (): void => {
    page.classList.remove('player-page--idle');
    window.clearTimeout(hideTimer);
    hideTimer = window.setTimeout(() => {
      page.classList.add('player-page--idle');
    }, 3500);
  };
  showOverlay();

  // Progress + time — skip visual update while a debounced seek is pending
  // (seekByDebounced already updated the display to the preview position).
  videoEl.addEventListener('timeupdate', () => {
    const cur = videoEl.currentTime || 0;
    const dur = videoEl.duration || video.durationSec;
    if (pendingSeekTime === undefined) {
      if (dur && isFinite(dur)) {
        progressFill.style.width = `${(cur / dur) * 100}%`;
      }
      timeEl.textContent = `${formatTime(cur)} / ${formatTime(dur)}`;
    }

    // Fallback for TV browsers that don't reliably fire 'ended' for HLS VOD.
    // Threshold 1 s gives HLS a full segment's worth of headroom.
    const actualDur = videoEl.duration;
    if (isFinite(actualDur) && actualDur > 0 && cur >= actualDur - 1.0) {
      exitPlayer();
    }
  });

  // Belt-and-suspenders: poll for videoEl.ended every 500 ms. Catches the
  // case where both 'ended' and timeupdate stop firing before the threshold.
  const endedPoll = window.setInterval(() => {
    if (videoEl.ended) exitPlayer();
  }, 500);

  // Global remote shortcuts. ENTER goes to the focused button (FocusableButton
  // handles it); LEFT/RIGHT move focus between buttons UNLESS the progress
  // bar is focused, in which case it claims the x-axis and we seek instead.
  // Key repeat (held arrow) gives a fine 1s step so holding feels like a
  // continuous scrub; a single tap jumps SEEK_STEP_SEC.
  const offRemote = services().remoteKeys.on(({ action, originalEvent }) => {
    showOverlay();
    switch (action) {
      case 'PLAY':
        videoEl.play().catch((e) => console.warn('video.play() rejected', e?.name, e?.message));
        break;
      case 'PAUSE':
        videoEl.pause();
        break;
      case 'PLAY_PAUSE':
        togglePlay();
        break;
      case 'REWIND':
        onSeekKeyDown(-1);
        break;
      case 'FAST_FORWARD':
        onSeekKeyDown(1);
        break;
      case 'LEFT':
        if (document.activeElement === progress) {
          seekBy(originalEvent.repeat ? -1 : -SEEK_STEP_SEC);
        }
        break;
      case 'RIGHT':
        if (document.activeElement === progress) {
          seekBy(originalEvent.repeat ? 1 : SEEK_STEP_SEC);
        }
        break;
      case 'STOP':
      case 'BACK':
        exitPlayer();
        break;
      default:
        break;
    }
  });

  return () => {
    offRemote();
    window.clearTimeout(hideTimer);
    stopSeekAnim();
    window.clearTimeout(seekCommitTimer);
    window.clearInterval(endedPoll);
    window.removeEventListener('keyup', onSeekKeyUp, true);
    pendingSeekTime = undefined;
    seekDirection = 0;
    services().vizbee.setVideoStop();
    videoEl.pause();
    videoEl.removeEventListener('play', syncPlayLabel);
    videoEl.removeEventListener('pause', syncPlayLabel);
    videoEl.removeEventListener('ended', onEnded);
    videoEl.removeEventListener('loadstart',      onVzbLoadStart);
    videoEl.removeEventListener('loadedmetadata', onVzbLoadedMeta);
    videoEl.removeEventListener('playing',        onVzbPlaying);
    videoEl.removeEventListener('pause',          onVzbPause);
    videoEl.removeEventListener('ended',          onVzbEnded);
    videoEl.removeEventListener('waiting',        onVzbWaiting);
    videoEl.removeEventListener('error',          onVzbError);
    detachSource();
    videoEl.removeAttribute('src');
    videoEl.load();
    layout?.classList.remove('app-layout--immersive');
  };
}

// HLS streams play natively on Safari/iOS/tvOS and most smart-TV browsers
// (Tizen, webOS, Roku). Desktop Chrome/Firefox/Edge need an MSE-based shim,
// so we lazy-load HLS.js from a CDN only on those browsers — TV bundles
// never download it. Returns a detach fn for cleanup.
function attachVideoSource(videoEl: HTMLVideoElement, url: string): () => void {
  const isHls = /\.m3u8(\?|$)/i.test(url);
  const nativeHls = videoEl.canPlayType('application/vnd.apple.mpegurl') !== '';
  if (!isHls || nativeHls) {
    videoEl.src = url;
    return () => {};
  }
  let hls: { destroy: () => void } | undefined;
  loadHlsJs()
    .then((Hls) => {
      if (!Hls.isSupported()) {
        videoEl.src = url; // Last-ditch — will likely fail, but no worse.
        return;
      }
      const instance = new Hls();
      instance.loadSource(url);
      instance.attachMedia(videoEl);
      hls = instance;
    })
    .catch(() => {
      videoEl.src = url;
    });
  return () => hls?.destroy();
}

interface HlsStatic {
  new (): { loadSource: (url: string) => void; attachMedia: (el: HTMLVideoElement) => void; destroy: () => void };
  isSupported: () => boolean;
}
let hlsLoader: Promise<HlsStatic> | undefined;
function loadHlsJs(): Promise<HlsStatic> {
  if (hlsLoader) return hlsLoader;
  hlsLoader = new Promise<HlsStatic>((resolve, reject) => {
    const existing = (window as unknown as { Hls?: HlsStatic }).Hls;
    if (existing) {
      resolve(existing);
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/hls.js@1.5.13/dist/hls.min.js';
    script.async = true;
    script.onload = () => {
      const loaded = (window as unknown as { Hls?: HlsStatic }).Hls;
      if (loaded) resolve(loaded);
      else reject(new Error('hls.js loaded but window.Hls missing'));
    };
    script.onerror = () => reject(new Error('hls.js script failed to load'));
    document.head.appendChild(script);
  });
  return hlsLoader;
}

function formatTime(sec: number): string {
  if (!sec || !isFinite(sec)) return '--:--';
  const total = Math.floor(sec);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(h ? 2 : 1, '0');
  const ss = String(s).padStart(2, '0');
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}
