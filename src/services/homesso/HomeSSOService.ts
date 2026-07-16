import { Logger } from '@/services/logger/Logger';
import { services } from '@/services/ServiceContainer';
import { fetchSdkDeploymentDate } from '@/services/sdkDeploymentDate';
import { sdkOrigin } from '@/services/sdkEnv';
import { HomeSSOAuthStore, type AuthState, type HomeSSOAccount } from './HomeSSOAuthStore';

// The HomeSSO SDK is an external side-effect <script> that self-registers
// window.vizbee.homesso. ES variant follows `vizbeeSdk`; origin follows `sdkEnv`.
const HOMESSO_SDK_MAJOR = 'v1';

type EsVariant = 'es5' | 'es6';

// es5 vs es6 for the HomeSSO script, taken from the vizbeeSdk flag's suffix
// (full-es5 | full-es6 | light-es5 | light-es6). npm builds map here too.
function resolveEsVariant(): EsVariant {
  return services().flags.get('vizbeeSdk').endsWith('es6') ? 'es6' : 'es5';
}

const homeSSOUrl = (variant: EsVariant): string =>
  `${sdkOrigin(services().flags.get('sdkEnv'))}/homesso/${variant}/${HOMESSO_SDK_MAJOR}/vizbee.js`;

// Dummy values that drive the modal preview — there is no real paired phone.
const PREVIEW_SIGN_IN_TYPE = 'preview-signin';

// Default sign-in type for the flow. A real integration may receive several
// (email, mvpd, …) from the mobile sender; this sample uses one.
const DEFAULT_SIGN_IN_TYPE = 'email';

// Vizbee HomeSSO device-code backend (endpoints: /accountregcode, /poll,
// /signout). TV issues a reg code, relays it to the phone, polls until done.
const HOMESSO_API_BASE = 'https://homesso.vizbee.tv/v1';
const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 90_000;
// A stable per-install device id for the backend, prefixed like Roku's
// "roku:<channelClientId>". Persisted so reg-code issuance and polling agree.
const DEVICE_ID_KEY = 'vsw.homesso.deviceId';

// Two toast styles via the `homeSSOStyle` flag: DAZN (border/glow/spacing from
// the DAZN mockups) and DEFAULT (keys reset so the SDK uses its built-in look).
const DAZN_STYLE = {
  borderColor: '#1ed679',
  borderWidth: '1px',
  boxShadow: '0 0 24px rgba(30, 214, 121, 0.55)',
  padding: '28px 32px',
  edgeMargin: '40px',
  borderRadius: '16px',
};
const DEFAULT_STYLE = {
  borderColor: undefined,
  borderWidth: undefined,
  boxShadow: undefined,
  padding: undefined,
  edgeMargin: undefined,
  borderRadius: undefined,
};

// Per-modal preview strings (`homeSSOLocale` flag). The SDK localizes layout
// direction only; RTL swaps in Arabic, LTR mirrors the SDK's English defaults.
type ModalText = { titleText?: string; descriptionText: string };
const PREVIEW_TEXT: Record<
  'ltr' | 'rtl',
  { informational: ModalText; progress: ModalText; success: ModalText }
> = {
  ltr: {
    informational: {
      titleText: 'Mobile Sign In',
      descriptionText: 'Please use your mobile app to complete the sign in process.',
    },
    progress: { descriptionText: 'Signing in using your mobile app ...' },
    success: {
      titleText: 'Mobile Sign In Successful!',
      descriptionText: 'Cast or select any content to start watching.',
    },
  },
  rtl: {
    informational: {
      titleText: 'تسجيل الدخول عبر الهاتف',
      descriptionText: 'يرجى استخدام تطبيق هاتفك لإكمال عملية تسجيل الدخول.',
    },
    progress: { descriptionText: 'جارٍ تسجيل الدخول عبر تطبيق هاتفك ...' },
    success: {
      titleText: 'تم تسجيل الدخول بنجاح!',
      descriptionText: 'يمكنك اختيار أي محتوى لبدء المشاهدة.',
    },
  },
};

// Bridges the sample app to the HomeSSO SDK: the real device-code sign-in flow
// (wireRealFlow + HomeSSOAuthStore) and the dummy-data modal preview in Settings.
export class HomeSSOService {
  private readonly log = new Logger('HomeSSOService');
  private initialized = false;
  private ready = false;
  private shimmed = false;
  private variant: EsVariant | null = null;
  private version: string | null = null;
  private loadedUrl: string | null = null;
  private deploymentDatePromise: Promise<string | null> | null = null;

  // App-owned account state (the SDK doesn't persist the user); source of truth
  // for the sign-in-info getter and the Profile page. See HomeSSOAuthStore.
  private readonly auth = new HomeSSOAuthStore();

  // Bumped on each sign-in request; the poll loop stops when its captured
  // generation no longer matches (a newer request, or sign-out, supersedes it).
  private signInGeneration = 0;
  private deviceIdCache: string | null = null;

  async init(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;

    // On TV the main Vizbee SDK provides window.vizbee; on desktop there's none,
    // so stub it — the toast UI needs only the homesso namespace, no continuity.
    if (services().platform.name === 'desktop' && !window.vizbee) {
      // Desktop has no continuity SDK; stub a minimal object so the homesso
      // namespace has somewhere to attach. Cast past the full SDK type.
      window.vizbee = {} as NonNullable<Window['vizbee']>;
    }

    this.variant = resolveEsVariant();
    this.loadedUrl = homeSSOUrl(this.variant);
    try {
      await loadScript(this.loadedUrl);
    } catch (e) {
      this.log.error('failed to load HomeSSO SDK', e);
      return;
    }

    this.ready = await waitForHomeSSO();
    if (!this.ready) {
      this.log.warn('HomeSSO SDK not available on window.vizbee.homesso; modal preview disabled');
      return;
    }
    // VERSION is set on the namespace by the SDK build (@rollup/plugin-replace).
    // Older bundles predate it, so it may be undefined → reported as unknown.
    this.version = window.vizbee?.homesso?.VERSION ?? null;
    this.log.info('HomeSSO SDK ready', { variant: this.variant, version: this.version });

    // Wire the real sign-in flow only when the continuity SDK is present —
    // manager.init() needs the continuity session. Otherwise preview-only.
    if (window.vizbee?.continuity) {
      this.wireRealFlow();
    } else {
      this.log.info('HomeSSO continuity session absent; modal preview only (no sign-in flow)');
    }
  }

  // Register the sign-in-info getter + handler and open the continuity session.
  // Uses the manager directly (not this.manager(), which shims messaging).
  private wireRealFlow(): void {
    const ctx = window.vizbee?.homesso?.HomeSSOContext?.getInstance?.();
    const m = ctx?.getHomeSSOManager?.();
    if (!m) {
      this.log.warn('cannot wire HomeSSO real flow; manager unavailable');
      return;
    }
    // The SDK calls this before deciding whether to start a sign-in: it reports
    // the device's current per-type sign-in state from our auth store.
    m.setSignInInfoGetter?.(() => Promise.resolve(this.auth.getSignInInfo()));
    // Invoked when a paired mobile sender requests sign-in on this device.
    m.setSignInHandler?.((info: any, cb: (status: any) => void) => this.handleSignIn(info, cb));
    try {
      m.init?.();
      this.log.info('HomeSSO real sign-in flow wired (continuity session)');
    } catch (e) {
      this.log.warn('HomeSSO manager.init() failed; real sender sign-in disabled', e);
    }
  }

  // Snapshot for Settings → Device: loaded ES variant, SDK version (null on
  // older bundles), and whether the SDK finished registering.
  status(): { ready: boolean; variant: EsVariant | null; version: string | null } {
    return { ready: this.ready, variant: this.variant, version: this.version };
  }

  // Deployment date (S3 Last-Modified) of the loaded HomeSSO bundle for Settings
  // → Device. Memoised; null until the URL is known or if the header is absent.
  deploymentDate(): Promise<string | null> {
    if (!this.loadedUrl) return Promise.resolve(null);
    this.deploymentDatePromise ??= fetchSdkDeploymentDate(this.loadedUrl);
    return this.deploymentDatePromise;
  }

  // Apply the Settings-selected toast config (style via `homeSSOStyle`, LTR/RTL
  // via `homeSSOLocale`) to all modal types. Called before each show().
  private applyModalConfig(): void {
    const ui = window.vizbee?.homesso?.HomeSSOContext?.getInstance?.()?.getHomeSSOUIManager?.();
    if (!ui?.setCommonModalConfig) {
      this.log.warn('HomeSSO UI manager unavailable; skipping modal config');
      return;
    }
    const flags = services().flags;
    const style = flags.get('homeSSOStyle') === 'dazn' ? DAZN_STYLE : DEFAULT_STYLE;
    const rtl = flags.get('homeSSOLocale') === 'rtl';
    ui.setCommonModalConfig({ ...style, direction: rtl ? 'rtl' : 'ltr' });

    // Localized strings per direction (Arabic for RTL), set per modal. CAVEAT:
    // the SDK re-hardcodes the English success text, so success stays English.
    const text = rtl ? PREVIEW_TEXT.rtl : PREVIEW_TEXT.ltr;
    ui.setInformationalSignInModalConfig?.(text.informational);
    ui.setProgressSignInModalConfig?.(text.progress);
    ui.setSuccessSignInModalConfig?.(text.success);
  }

  // --- Modal preview controls ------------------------------------------------
  // Each method drives the SDK's real UI code path with dummy data.

  // "Please use your mobile app to complete the sign in process." Shown by
  // onProgress when the remote is not yet signed in (isRemoteSignedIn=false).
  showInformational(): void {
    const m = this.manager();
    const msgs = this.messages();
    if (!m || !msgs) return;
    this.applyModalConfig();
    m.isRemoteSignedIn = false;
    m.onProgress(new msgs.ProgressStatus(PREVIEW_SIGN_IN_TYPE, { regcode: 'DEMO-1234' }));
  }

  // "Signing in using your mobile app …" (animated icon). Shown by onProgress
  // when the remote is signed in (isRemoteSignedIn=true).
  showProgress(): void {
    const m = this.manager();
    const msgs = this.messages();
    if (!m || !msgs) return;
    this.applyModalConfig();
    m.isRemoteSignedIn = true;
    m.onProgress(new msgs.ProgressStatus(PREVIEW_SIGN_IN_TYPE, { regcode: 'DEMO-1234' }));
  }

  // "Mobile Sign In Successful!" — auto-dismisses (~10s). customData.email is
  // required for the SDK to treat it as a real success; harmless here.
  showSuccess(): void {
    const m = this.manager();
    const msgs = this.messages();
    if (!m || !msgs) return;
    this.applyModalConfig();
    m.onSuccess(new msgs.SuccessStatus(PREVIEW_SIGN_IN_TYPE, 'preview-user', { email: 'demo@vizbee.tv' }));
  }

  // Dismiss the current toast. onFailure → updateFailureUI → snackbar.hide().
  hide(): void {
    const m = this.manager();
    const msgs = this.messages();
    if (!m || !msgs) return;
    m.onFailure(new msgs.FailureStatus(PREVIEW_SIGN_IN_TYPE, true, 'preview dismissed'));
  }

  // --- Account state (app-owned) ---------------------------------------------
  // The SDK doesn't store the user; these expose our auth store to Profile/Settings.

  authState(): AuthState {
    return this.auth.get();
  }

  isSignedIn(): boolean {
    return this.auth.isSignedIn();
  }

  onAuthChange(listener: (state: AuthState) => void): () => void {
    return this.auth.onChange(listener);
  }

  // Sign out: drop local state, stop any in-flight poll, and notify the backend.
  // The SDK has no sign-out API — the app owns the session.
  signOut(): void {
    const account = this.auth.get().account;
    this.signInGeneration++; // supersede any active poll
    this.auth.signOut();
    if (account?.authToken) void this.backendSignOut(account.authToken);
  }

  // --- Sign-in flow (Vizbee HomeSSO device-code backend) ---------------------

  // Handler for setSignInHandler: invoked when a mobile sender requests sign-in.
  // Issues a reg code, relays it via the toast, polls until the phone completes.
  private handleSignIn(signInInfo: any, statusCallback: (status: any) => void): void {
    const signInType: string = signInInfo?.signInType || DEFAULT_SIGN_IN_TYPE;
    this.log.info('HomeSSO sign-in request received', {
      signInType,
      deviceType: signInInfo?.deviceType,
      remoteSignedIn: signInInfo?.isSignedIn,
    });
    void this.runBackendSignIn(signInType, statusCallback);
  }

  // Reg code → progress toast → poll → success/failure, against homesso.vizbee.tv.
  private async runBackendSignIn(signInType: string, emit: (status: any) => void): Promise<void> {
    const msgs = this.messages();
    if (!msgs) return;
    const generation = ++this.signInGeneration; // a new request supersedes older polls

    try {
      const regcode = await this.requestRegCode();
      if (!regcode || generation !== this.signInGeneration) return;

      this.auth.setPending({ regcode, signInType });
      emit(new msgs.ProgressStatus(signInType, { regcode }));

      const result = await this.pollForSignIn(regcode, generation);
      if (generation !== this.signInGeneration) return; // superseded mid-poll
      if (!result) {
        this.auth.clearPending();
        emit(new msgs.FailureStatus(signInType, true, 'sign-in timed out'));
        return;
      }

      const account: HomeSSOAccount = {
        loginType: signInType,
        login: result.email,
        userId: result.email,
        authToken: result.authToken,
      };
      this.auth.signedIn(account);
      emit(new msgs.SuccessStatus(signInType, result.email, { email: result.email }));
    } catch (e) {
      if (generation !== this.signInGeneration) return;
      this.auth.clearPending();
      this.log.error('HomeSSO sign-in failed', e);
      emit(new msgs.FailureStatus(signInType, false, String(e)));
    }
  }

  // POST /v1/accountregcode { deviceId } → { code }
  private async requestRegCode(): Promise<string | null> {
    const res = await fetch(`${HOMESSO_API_BASE}/accountregcode`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId: this.deviceId() }),
    });
    if (!res.ok) throw new Error(`accountregcode HTTP ${res.status}`);
    const data = await res.json();
    return data?.code ?? null;
  }

  // Poll POST /v1/accountregcode/poll every POLL_INTERVAL_MS until done or
  // POLL_TIMEOUT_MS. Returns null on timeout or if superseded.
  private async pollForSignIn(
    regcode: string,
    generation: number,
  ): Promise<{ email: string; authToken: string } | null> {
    const deadline = Date.now() + POLL_TIMEOUT_MS;
    while (Date.now() < deadline) {
      if (generation !== this.signInGeneration) return null;
      try {
        const res = await fetch(`${HOMESSO_API_BASE}/accountregcode/poll`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ deviceId: this.deviceId(), regCode: regcode }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data?.status === 'done') {
            return { email: data.email, authToken: data.authToken };
          }
        }
      } catch (e) {
        this.log.warn('HomeSSO poll request failed; retrying', e);
      }
      await delay(POLL_INTERVAL_MS);
    }
    return null;
  }

  // POST /v1/signout {} with Authorization: <authToken>. Best-effort.
  private async backendSignOut(authToken: string): Promise<void> {
    try {
      await fetch(`${HOMESSO_API_BASE}/signout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: authToken },
        body: '{}',
      });
    } catch (e) {
      this.log.warn('HomeSSO signout request failed', e);
    }
  }

  // Stable per-install device id for the backend, e.g. "tizen:ab12…". Persisted
  // so reg-code issuance and polling use the same value across the flow.
  private deviceId(): string {
    if (this.deviceIdCache) return this.deviceIdCache;
    let id: string | null = null;
    try {
      id = localStorage.getItem(DEVICE_ID_KEY);
    } catch {
      /* ignore */
    }
    if (!id) {
      const rand =
        (globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)).replace(/-/g, '');
      id = `${services().platform.name}:${rand}`;
      try {
        localStorage.setItem(DEVICE_ID_KEY, id);
      } catch {
        /* ignore */
      }
    }
    this.deviceIdCache = id;
    return id;
  }

  private messages(): any {
    return window.vizbee?.homesso?.messages;
  }

  private manager(): any {
    const ctx = window.vizbee?.homesso?.HomeSSOContext?.getInstance?.();
    const m = ctx?.getHomeSSOManager?.();
    if (!m) {
      this.log.warn('HomeSSO manager unavailable; SDK not ready');
      return null;
    }
    // onProgress/onSuccess/onFailure call vizbeeMessagingClient.send() first,
    // which throws with no paired phone; inject a no-op client so the toast renders.
    if (!this.shimmed) {
      (m as any).vizbeeMessagingClient = (m as any).vizbeeMessagingClient ?? { send: () => {}, addReceiver: () => {} };
      this.shimmed = true;
    }
    return m;
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[data-homesso-sdk="${src}"]`)) {
      resolve();
      return;
    }
    const el = document.createElement('script');
    el.src = src;
    el.async = true;
    el.dataset.homessoSdk = src;
    el.onload = () => resolve();
    el.onerror = () => reject(new Error(`failed to load ${src}`));
    document.head.appendChild(el);
  });
}

// onload fires before the namespace is registered (and TV may await
// VIZBEE_SDK_READY), so poll with a short backoff for window.vizbee.homesso.
async function waitForHomeSSO(maxAttempts = 40, initialDelay = 100): Promise<boolean> {
  let delay = initialDelay;
  for (let i = 0; i < maxAttempts; i++) {
    if (window.vizbee?.homesso?.HomeSSOContext) return true;
    await new Promise((r) => setTimeout(r, delay));
    delay = Math.min(delay * 1.5, 500);
  }
  return false;
}
