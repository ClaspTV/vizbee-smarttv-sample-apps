import { VideoInfo } from '@/data/videos';
import { services } from '@/services/ServiceContainer';

export interface VideoCardOptions {
  video: VideoInfo;
  onActivate: (video: VideoInfo) => void;
}

export function createVideoCard(opts: VideoCardOptions): HTMLElement {
  const card = document.createElement('button');
  card.className = 'video-card';
  card.setAttribute('data-focusable', 'true');
  card.setAttribute('tabindex', '-1');
  card.dataset.videoId = opts.video.id;

  const poster = document.createElement('div');
  poster.className = 'video-card__poster';
  poster.style.backgroundImage = `url(${opts.video.posterUrl})`;

  const title = document.createElement('div');
  title.className = 'video-card__title';
  title.textContent = opts.video.title;

  const duration = document.createElement('div');
  duration.className = 'video-card__duration';
  duration.textContent = formatDuration(opts.video.durationSec);

  card.appendChild(poster);
  card.appendChild(title);
  card.appendChild(duration);

  const activate = () => opts.onActivate(opts.video);
  card.addEventListener('click', activate);

  const off = services().remoteKeys.on(({ action }) => {
    if (action === 'ENTER' && document.activeElement === card) activate();
  });
  const observer = new MutationObserver(() => {
    if (!card.isConnected) {
      off();
      observer.disconnect();
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });

  return card;
}

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}
