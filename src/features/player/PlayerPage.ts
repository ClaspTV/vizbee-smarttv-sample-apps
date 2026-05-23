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
  const togglePlay = (): void => {
    if (videoEl.paused) videoEl.play().catch((e) => console.warn('video.play() rejected', e?.name, e?.message));
    else videoEl.pause();
  };

  services().vizbee.setVideo(
    {
      id: video.id,
      title: video.title,
      url: video.videoUrl,
      description: video.description,
      posterUrl: video.posterUrl,
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

  // Progress + time
  videoEl.addEventListener('timeupdate', () => {
    const cur = videoEl.currentTime || 0;
    const dur = videoEl.duration || video.durationSec;
    if (dur && isFinite(dur)) {
      progressFill.style.width = `${(cur / dur) * 100}%`;
    }
    timeEl.textContent = `${formatTime(cur)} / ${formatTime(dur)}`;
  });

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
        seekBack();
        break;
      case 'FAST_FORWARD':
        seekForward();
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
        services().vizbee.setVideoStop();
        services().router.back('/home');
        break;
      default:
        break;
    }
  });

  return () => {
    offRemote();
    window.clearTimeout(hideTimer);
    services().vizbee.setVideoStop();
    videoEl.pause();
    videoEl.removeEventListener('play', syncPlayLabel);
    videoEl.removeEventListener('pause', syncPlayLabel);
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
