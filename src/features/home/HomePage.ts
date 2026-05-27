import { VIDEOS, VideoInfo } from '@/data/videos';
import { createVideoCard } from '@/components/VideoCard';
import { createFocusableButton } from '@/components/FocusableButton';
import { showConfirmDialog } from '@/components/ConfirmDialog';
import { services } from '@/services/ServiceContainer';

// Layout: full-bleed hero (mirrors the focused card) + horizontal carousel.
// As the user moves focus across cards, the hero updates to reflect the
// currently-focused video — so the hero is a "preview" of the focused tile.
export function renderHomePage(root: HTMLElement): () => void {
  root.innerHTML = '';

  const page = document.createElement('div');
  page.className = 'home-page';

  // Hero shell — content is filled in by updateHero(). One hidden ref to
  // the currently-featured video lets the Play button stay correct as the
  // hero swaps.
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

  // Rails. Two stacked horizontal carousels demonstrate the multi-row
  // pattern: as the user moves DOWN, the page scrolls to center the focused
  // row (FocusManager.setFocus → scrollIntoView 'center'). For a real
  // catalog you'd render one rail per category from your data layer.
  const renderRail = (title: string): HTMLElement => {
    const section = document.createElement('section');
    section.className = 'rail';
    // FocusManager uses this to anchor vertical scroll to the rail's top
    // (instead of centering the focused card). Result: when focus moves
    // into a rail, that rail snaps to the top of the rails area and the
    // previous rail scrolls fully out — no half-visible card edges.
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
      // Native DOM focus is dispatched by FocusManager.setFocus() (which
      // calls el.focus()). Listening here keeps HomePage decoupled from it.
      card.addEventListener('focus', () => updateHero(v));
      railTrack.appendChild(card);
    }

    section.appendChild(railTitle);
    section.appendChild(railTrack);
    return section;
  };

  // Hero stays fixed at the top; only the rails area scrolls. As focus moves
  // between cards, the hero updates to reflect the focused video — but it
  // never moves out of view.
  const railsArea = document.createElement('div');
  railsArea.className = 'home-page__rails';
  railsArea.appendChild(renderRail('Continue exploring'));
  railsArea.appendChild(renderRail('Trending now'));

  page.appendChild(hero);
  page.appendChild(railsArea);
  root.appendChild(page);

  // Initial focus on the hero CTA.
  services().focus.setFocus(playBtn);

  // BACK on Home is the app's root exit point — confirm first so an accidental
  // press doesn't drop the user out. Defaults focus to "Stay" for safety.
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
