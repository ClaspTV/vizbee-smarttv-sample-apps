import { Router } from './Router';
import { renderHomePage } from '@/features/home/HomePage';
import { renderPlayerPage } from '@/features/player/PlayerPage';
import { renderProfilePage } from '@/features/profile/ProfilePage';
import { renderSettingsPage } from '@/features/settings/SettingsPage';
import { createNavMenu } from '@/components/NavMenu';
import { services } from '@/services/ServiceContainer';
import { Logger } from '@/services/logger/Logger';

const log = new Logger('App');

// App layout: persistent left-rail menu + content area into which pages render.
// The menu lives across page transitions so navigation state stays put.
//
//   ┌──────────┬──────────────────────────────┐
//   │          │                              │
//   │  NavMenu │     <main class="content">   │
//   │  (rail)  │     ← page renders here →    │
//   │          │                              │
//   └──────────┴──────────────────────────────┘
//
// The Player page adds .app-layout--immersive to hide the menu during playback.
export function startApp(root: HTMLElement, router: Router): void {
  root.innerHTML = '';

  const layout = document.createElement('div');
  layout.className = 'app-layout';

  const { element: menu } = createNavMenu();
  layout.appendChild(menu);

  const content = document.createElement('main');
  content.className = 'app-content';
  layout.appendChild(content);

  root.appendChild(layout);

  router.register('/home', () => renderHomePage(content));
  router.register('/profile', () => renderProfilePage(content));
  router.register('/settings', () => renderSettingsPage(content));
  router.register('/player/:id', (params) => renderPlayerPage(content, params));

  // Vizbee only makes sense on the real TV platforms; desktop is for local dev.
  if (services().platform.name === 'desktop') {
    log.info('Vizbee skipped on desktop platform');
  } else {
    services().vizbee.init(services().config.get().vizbeeAppId);
  }

  // HomeSSO modal preview: load the HomeSSO SDK so the Settings toggles can
  // trigger its sign-in toasts with dummy data. Runs on every platform
  // (including desktop) so the modal UI can be previewed during local dev.
  void services().homeSSO.init();

  router.start('/home');
}
