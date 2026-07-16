import { VIDEOS, VideoInfo } from '@/data/videos';
import { createVideoCard } from '@/components/VideoCard';
import { createFocusableButton } from '@/components/FocusableButton';
import { showConfirmDialog } from '@/components/ConfirmDialog';
import { services } from '@/services/ServiceContainer';

// Layout: full-bleed hero + horizontal carousels. The hero previews whichever
// card is currently focused.
export function renderHomePage(root: HTMLElement): () => void {
  root.innerHTML = '';

  const page = document.createElement('div');
  page.className = 'home-page';

  // Hero shell — filled by updateHero(). `featured` tracks the current video so
  // the Play button stays correct as the hero swaps.
  let featured: VideoInfo = VIDEOS[0];

  const hero = document.createElement('section');
  hero.className = 'hero';

  const heroInner = document.createElement('div');
  heroInner.className = 'hero__inner';

  const heroBadge = document.createElement('span');
  heroBadge.className = 'hero__badge';
  heroBadge.textContent = 'Featured';

  const heroTitle = document.createElement('h1');
  heroTitle.className = 'hero__title';

  const heroDesc = document.createElement('p');
  heroDesc.className = 'hero__desc';

  const heroActions = document.createElement('div');
  heroActions.className = 'hero__actions';

  const playBtn = createFocusableButton({
    label: '▶  Play now',
    className: 'focusable-btn--primary',
    onActivate: () => services().router.navigate(`/player/${featured.id}`),
  });
  heroActions.appendChild(playBtn);

  heroInner.appendChild(heroBadge);
  heroInner.appendChild(heroTitle);
  heroInner.appendChild(heroDesc);
  heroInner.appendChild(heroActions);
  hero.appendChild(heroInner);

  const updateHero = (video: VideoInfo): void => {
    if (featured.id === video.id) return;
    featured = video;
    hero.style.backgroundImage =
      `linear-gradient(90deg, rgba(7,9,12,0.85) 0%, rgba(7,9,12,0.4) 50%, rgba(7,9,12,0.1) 100%), url(${video.posterUrl})`;
    heroTitle.textContent = video.title;
    heroDesc.textContent = video.description;
    // Trigger a brief fade-in on the text so the swap feels intentional.
    heroInner.classList.remove('hero__inner--enter');
    // Force reflow so the animation restarts.
    void heroInner.offsetWidth;
    heroInner.classList.add('hero__inner--enter');
  };

  // Initial fill (no animation needed; first paint).
  hero.style.backgroundImage =
    `linear-gradient(90deg, rgba(7,9,12,0.85) 0%, rgba(7,9,12,0.4) 50%, rgba(7,9,12,0.1) 100%), url(${featured.posterUrl})`;
  heroTitle.textContent = featured.title;
  heroDesc.textContent = featured.description;

  // Rails. Two stacked carousels demonstrate the multi-row pattern; moving DOWN
  // scrolls the focused row into view. A real catalog would render one per category.
  const renderRail = (title: string): HTMLElement => {
    const section = document.createElement('section');
    section.className = 'rail';
    // Anchors vertical scroll to the rail's top (not the focused card), so the
    // rail snaps to the top of the rails area with no half-visible card edges.
    section.setAttribute('data-scroll-anchor', '');

    const railTitle = document.createElement('h2');
    railTitle.className = 'rail__title';
    railTitle.textContent = title;

    const railTrack = document.createElement('div');
    railTrack.className = 'rail__track';

    for (const v of VIDEOS) {
      const card = createVideoCard({
        video: v,
        onActivate: (video) => services().router.navigate(`/player/${video.id}`),
      });
      // Listening to native focus (fired by FocusManager) keeps HomePage decoupled.
      card.addEventListener('focus', () => updateHero(v));
      railTrack.appendChild(card);
    }

    section.appendChild(railTitle);
    section.appendChild(railTrack);
    return section;
  };

  // Hero stays fixed at the top; only the rails area scrolls.
  const railsArea = document.createElement('div');
  railsArea.className = 'home-page__rails';
  railsArea.appendChild(renderRail('Continue exploring'));
  railsArea.appendChild(renderRail('Trending now'));

  page.appendChild(hero);
  page.appendChild(railsArea);
  root.appendChild(page);

  // Initial focus on the hero CTA.
  services().focus.setFocus(playBtn);

  // BACK on Home is the root exit point — confirm first, defaulting focus to "Stay".
  const offBack = services().remoteKeys.on(({ action }) => {
    if (action !== 'BACK') return;
    showConfirmDialog({
      title: 'Exit app?',
      message: 'Are you sure you want to close the app?',
      confirmLabel: 'Exit',
      cancelLabel: 'Stay',
      defaultFocus: 'cancel',
      onConfirm: () => services().platform.exit(),
    });
  });

  return () => {
    offBack();
  };
}
