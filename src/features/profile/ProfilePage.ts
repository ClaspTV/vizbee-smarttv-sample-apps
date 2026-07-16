import { createFocusableButton } from '@/components/FocusableButton';
import { showConfirmDialog } from '@/components/ConfirmDialog';
import { services } from '@/services/ServiceContainer';
import type { AuthState } from '@/services/homesso/HomeSSOAuthStore';

// Profile page: renders app-owned HomeSSO account state (sign-out) or the sign-in
// explainer when signed out. Subscribes to onAuthChange and rebuilds in place.
export function renderProfilePage(root: HTMLElement): () => void {
  root.innerHTML = '';

  const page = document.createElement('div');
  page.className = 'profile-page';

  const header = document.createElement('header');
  header.className = 'profile-header';
  const title = document.createElement('h1');
  title.className = 'profile-header__title';
  title.textContent = 'Profile';
  const subtitle = document.createElement('p');
  subtitle.className = 'profile-header__subtitle';
  subtitle.textContent = 'Your HomeSSO sign-in for this device.';
  header.appendChild(title);
  header.appendChild(subtitle);

  const body = document.createElement('div');
  body.className = 'profile-body';

  page.appendChild(header);
  page.appendChild(body);
  root.appendChild(page);

  const homeSSO = services().homeSSO;

  // Rebuild the body for the current state and focus its primary action.
  const rebuild = (state: AuthState): void => {
    body.innerHTML = '';
    const focusTarget: HTMLElement | null = state.account
      ? renderSignedIn(body, state)
      : renderSignedOut(body, state);
    if (focusTarget) services().focus.setFocus(focusTarget);
  };

  rebuild(homeSSO.authState());
  const offAuth = homeSSO.onAuthChange(rebuild);

  // BACK routes home (the menu is also reachable via LEFT).
  const offBack = services().remoteKeys.on(({ action }) => {
    if (action === 'BACK') services().router.back('/home');
  });

  return () => {
    offAuth();
    offBack();
  };
}

// Signed-in view: avatar + identity + sign-out. Returns the button to focus.
function renderSignedIn(body: HTMLElement, state: AuthState): HTMLElement {
  const account = state.account!;
  const display = account.userName || account.login;

  const card = document.createElement('section');
  card.className = 'profile-card profile-card--account';

  const avatar = document.createElement('div');
  avatar.className = 'profile-avatar';
  avatar.textContent = initialOf(display);

  const identity = document.createElement('div');
  identity.className = 'profile-identity';

  const name = document.createElement('h2');
  name.className = 'profile-identity__name';
  name.textContent = display;

  const email = document.createElement('p');
  email.className = 'profile-identity__email';
  email.textContent = account.login;

  const via = document.createElement('p');
  via.className = 'profile-identity__meta';
  via.textContent = `Signed in via ${account.loginType}`;

  identity.appendChild(name);
  identity.appendChild(email);
  identity.appendChild(via);

  const head = document.createElement('div');
  head.className = 'profile-card__head';
  head.appendChild(avatar);
  head.appendChild(identity);

  const actions = document.createElement('div');
  actions.className = 'profile-card__actions';
  const signOutBtn = createFocusableButton({
    label: 'Sign out',
    onActivate: () =>
      showConfirmDialog({
        title: 'Sign out?',
        message: `You'll be signed out of ${account.login} on this device.`,
        confirmLabel: 'Sign out',
        cancelLabel: 'Cancel',
        defaultFocus: 'cancel',
        onConfirm: () => services().homeSSO.signOut(),
      }),
  });
  actions.appendChild(signOutBtn);

  card.appendChild(head);
  card.appendChild(actions);
  body.appendChild(card);

  return signOutBtn;
}

// Signed-out view: explainer + optional in-flight reg code. Sign-in is driven
// from the phone (no on-TV action), so there's no button to focus — returns null.
function renderSignedOut(body: HTMLElement, state: AuthState): HTMLElement | null {
  const card = document.createElement('section');
  card.className = 'profile-card profile-card--signed-out';

  const avatar = document.createElement('div');
  avatar.className = 'profile-avatar profile-avatar--empty';
  avatar.setAttribute('aria-hidden', 'true');
  avatar.innerHTML = ICON_PERSON;

  const identity = document.createElement('div');
  identity.className = 'profile-identity';

  const name = document.createElement('h2');
  name.className = 'profile-identity__name';
  name.textContent = "You're not signed in";

  const hint = document.createElement('p');
  hint.className = 'profile-identity__email';
  hint.textContent = state.pending
    ? 'Open your mobile app, connect to this device, and enter the code below to finish signing in.'
    : 'Use your mobile app to sign in to this device: open the app on your phone, connect to this TV, and sign in.';

  identity.appendChild(name);
  identity.appendChild(hint);

  const head = document.createElement('div');
  head.className = 'profile-card__head';
  head.appendChild(avatar);
  head.appendChild(identity);
  card.appendChild(head);

  // In-flight reg code the user enters on their phone; shown only while a sign-in is pending.
  if (state.pending) {
    const reg = document.createElement('div');
    reg.className = 'profile-regcode';
    const regLabel = document.createElement('span');
    regLabel.className = 'profile-regcode__label';
    regLabel.textContent = 'Enter this code in your mobile app';
    const regValue = document.createElement('span');
    regValue.className = 'profile-regcode__value';
    regValue.textContent = state.pending.regcode;
    reg.appendChild(regLabel);
    reg.appendChild(regValue);
    card.appendChild(reg);
  }

  body.appendChild(card);

  // No on-TV action — sign-in completes on the phone.
  return null;
}

function initialOf(text: string): string {
  const ch = text.trim().charAt(0);
  return ch ? ch.toUpperCase() : '?';
}

const ICON_PERSON = `<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1"/></svg>`;
