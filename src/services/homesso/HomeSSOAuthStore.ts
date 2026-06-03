import { EventEmitter } from '@/core/events/EventEmitter';
import { Logger } from '@/services/logger/Logger';

// App-owned HomeSSO account state.
//
// The HomeSSO SDK does NOT persist the user, expose a current-user getter, or
// emit sign-in state events — the integrating app owns all of that. This store
// is that owner: it holds who's signed in, persists it across launches, and is
// the single source of truth feeding both the SDK's `setSignInInfoGetter` (so
// the SDK knows whether to start a sign-in) and the Profile page UI.
//
// Persistence mirrors FeatureFlagService: a single JSON blob in localStorage.
// The `pending` reg-code is transient (a sign-in in flight) — it lives in memory
// only, never persisted.

export interface HomeSSOAccount {
  // The sign-in type this account was established with (e.g. 'email', 'mvpd').
  // Must match the `signInType` a mobile sender requests for the SDK to treat
  // the device as already signed in for that type.
  loginType: string;
  // The user's login identifier — an email address in the sample.
  login: string;
  userName?: string;
  userId?: string;
  // Auth token returned by the HomeSSO backend's poll success. Sent as the
  // Authorization header when signing out. Persisted with the account.
  authToken?: string;
}

// A sign-in currently in progress: the reg code the user enters on their phone.
// Surfaced on the Profile page while the SDK shows its progress toast.
export interface PendingSignIn {
  regcode: string;
  signInType: string;
}

export interface AuthState {
  account: HomeSSOAccount | null;
  pending: PendingSignIn | null;
}

// Shape the SDK's `setSignInInfoGetter` expects back (matched structurally —
// the script-loaded SDK ships no published .d.ts). See VizbeeSignInInfo in
// @vizbeetv/homesso-sdk: userLoginType + isSignedIn are required.
export interface VizbeeSignInInfo {
  userLoginType: string;
  isSignedIn: boolean;
  userLogin: string;
  userName?: string;
}

const STORAGE_KEY = 'vsw.homesso.account.v1';

type AuthEvents = {
  change: AuthState;
};

export class HomeSSOAuthStore {
  private account: HomeSSOAccount | null = null;
  private pending: PendingSignIn | null = null;
  private readonly emitter = new EventEmitter<AuthEvents>();
  private readonly log = new Logger('HomeSSOAuthStore');

  constructor() {
    this.account = this.load();
  }

  get(): AuthState {
    return { account: this.account, pending: this.pending };
  }

  isSignedIn(): boolean {
    return this.account !== null;
  }

  // Subscribe to any account/pending change (Profile UI, Settings device line).
  onChange(listener: (state: AuthState) => void): () => void {
    return this.emitter.on('change', listener);
  }

  // Sign-in completed: persist the account and clear any in-flight reg code.
  signedIn(account: HomeSSOAccount): void {
    this.account = account;
    this.pending = null;
    this.persist();
    this.log.info('signed in', { loginType: account.loginType, login: account.login });
    this.emit();
  }

  // Sign-out: the SDK has no sign-out API, so the app simply drops local state.
  signOut(): void {
    if (!this.account && !this.pending) return;
    this.account = null;
    this.pending = null;
    this.persist();
    this.log.info('signed out');
    this.emit();
  }

  setPending(pending: PendingSignIn): void {
    this.pending = pending;
    this.emit();
  }

  clearPending(): void {
    if (!this.pending) return;
    this.pending = null;
    this.emit();
  }

  // What the SDK's setSignInInfoGetter returns: the device's current sign-in
  // state per login type. One entry for the sample's single account model.
  getSignInInfo(): VizbeeSignInInfo[] {
    if (!this.account) {
      // No account yet — report the default login type as signed-out so the SDK
      // proceeds with a sign-in for any incoming request.
      return [{ userLoginType: 'email', isSignedIn: false, userLogin: '' }];
    }
    return [
      {
        userLoginType: this.account.loginType,
        isSignedIn: true,
        userLogin: this.account.login,
        userName: this.account.userName,
      },
    ];
  }

  private emit(): void {
    this.emitter.emit('change', this.get());
  }

  private load(): HomeSSOAccount | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as HomeSSOAccount;
      if (parsed && typeof parsed.login === 'string' && typeof parsed.loginType === 'string') {
        return parsed;
      }
    } catch (e) {
      this.log.warn('failed to read account from localStorage', e);
    }
    return null;
  }

  private persist(): void {
    try {
      if (this.account) localStorage.setItem(STORAGE_KEY, JSON.stringify(this.account));
      else localStorage.removeItem(STORAGE_KEY);
    } catch (e) {
      this.log.warn('failed to persist account', e);
    }
  }
}
