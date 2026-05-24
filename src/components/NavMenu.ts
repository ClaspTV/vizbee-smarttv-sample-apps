import { services } from '@/services/ServiceContainer';
import logoUrl from '@/assets/logo.svg';

// Persistent left-rail menu. Fixed-width (always shows icon + label) — keeps
// item bounding rects stable so spatial navigation doesn't pick stale
// positions during transitions.
//
// The Player page hides the entire menu via .app-layout--immersive.

interface MenuItem {
  id: string;
  label: string;
  // Inline SVG markup. Unicode glyphs (⌂, ⚙) tofu out on Vizio's older
  // WebKit fallback fonts, so we ship the icons as actual vectors.
  iconSvg: string;
  route: string;
}

const ICON_HOME = `<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11.5L12 4l9 7.5"/><path d="M5 10v10h14V10"/></svg>`;
const ICON_GEAR = `<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>`;

const ITEMS: readonly MenuItem[] = [
  { id: 'home', label: 'Home', iconSvg: ICON_HOME, route: '/home' },
  { id: 'settings', label: 'Settings', iconSvg: ICON_GEAR, route: '/settings' },
];

export function createNavMenu(): { element: HTMLElement; dispose: () => void } {
  const menu = document.createElement('nav');
  menu.className = 'nav-menu';

  const brand = document.createElement('div');
  brand.className = 'nav-menu__brand';

  const logoEl = document.createElement('img');
  logoEl.className = 'nav-menu__logo';
  logoEl.src = logoUrl;
  logoEl.alt = '';

  const wordmark = document.createElement('span');
  wordmark.className = 'nav-menu__wordmark';
  wordmark.textContent = 'Vizbee';

  brand.appendChild(logoEl);
  brand.appendChild(wordmark);

  const list = document.createElement('div');
  list.className = 'nav-menu__list';

  const itemEls: HTMLElement[] = [];
  for (const item of ITEMS) {
    const btn = document.createElement('button');
    btn.className = 'nav-menu__item';
    btn.dataset.route = item.route;
    btn.setAttribute('data-focusable', 'true');
    btn.setAttribute('tabindex', '-1');
    btn.setAttribute('aria-label', item.label);

    const icon = document.createElement('span');
    icon.className = 'nav-menu__icon';
    icon.innerHTML = item.iconSvg;

    const label = document.createElement('span');
    label.className = 'nav-menu__label';
    label.textContent = item.label;

    btn.appendChild(icon);
    btn.appendChild(label);

    btn.addEventListener('click', () => services().router.navigate(item.route));

    list.appendChild(btn);
    itemEls.push(btn);
  }

  menu.appendChild(brand);
  menu.appendChild(list);

  // Active-route highlight. Driven by the router's change event (the router is
  // in-memory; there's no location.hash to watch).
  const updateActive = (path: string): void => {
    for (const el of itemEls) {
      const route = el.dataset.route ?? '';
      el.classList.toggle('nav-menu__item--active', path === route);
    }
  };
  updateActive(services().router.getCurrentPath() || '/home');
  const offChange = services().router.onChange(({ path }) => updateActive(path));

  // ENTER on a focused menu item navigates. RemoteKeyService preventsDefault
  // on ENTER, so the native <button> click doesn't fire on TV — wire it here.
  const off = services().remoteKeys.on(({ action }) => {
    if (action !== 'ENTER') return;
    const el = document.activeElement as HTMLElement | null;
    if (!el || !menu.contains(el)) return;
    const route = el.dataset.route;
    if (route) services().router.navigate(route);
  });

  return {
    element: menu,
    dispose: () => {
      offChange();
      off();
    },
  };
}
