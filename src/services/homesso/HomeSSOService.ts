import { Logger } from '@/services/logger/Logger';
import { services } from '@/services/ServiceContainer';
import { fetchSdkDeploymentDate } from '@/services/sdkDeploymentDate';

// The HomeSSO SDK is loaded as an external <script>, same model as the main
// Vizbee SDK (VizbeeService). It's a side-effect bundle that self-registers
// window.vizbee.homesso once window.vizbee exists — otherwise it waits for the
// VIZBEE_SDK_READY event that the main SDK fires.
//
// ES5/ES6 follows the Vizbee SDK selection via the `vizbeeSdk` flag's es5/es6
// suffix. HomeSSO ships only script variants, so npm app builds map to the
// script variant too (not the npmModule split) — for now. Loaded from the
// origin bucket (vzb-origin-dev) so the dev/test builds are reachable from
// every network.
const HOMESSO_SDK_BASE =
  'https://vzb-origin-dev.s3.amazonaws.com/homesso-sdk/test/vizbee_homesso';

type EsVariant = 'es5' | 'es6';

// es5 vs es6 for the HomeSSO script, taken from the vizbeeSdk flag's suffix
// (full-es5 | full-es6 | light-es5 | light-es6). npm builds map here too.
function resolveEsVariant(): EsVariant {
  return services().flags.get('vizbeeSdk').endsWith('es6') ? 'es6' : 'es5';
}

const homeSSOUrl = (variant: EsVariant): string => `${HOMESSO_SDK_BASE}.${variant}.js`;

// Dummy values that drive the modal preview — there is no real paired phone.
const PREVIEW_SIGN_IN_TYPE = 'preview-signin';

// Two toast styles selectable in Settings (the `homeSSOStyle` flag):
//
//  - DAZN: border + box-shadow + spacing matched to the DAZN HomeSSO mockups —
//    accent-green border/glow, more breathing room inside the card (padding),
//    inset from the screen corner (edgeMargin → the toast's bottom/right
//    offset), and rounded corners (borderRadius). NOTE: explicit px values
//    bypass the SDK's screen-scaling, so they're calibrated to the 1920×1080
//    design reference (the common TV resolution).
//
//  - DEFAULT: every key set to null so the SDK falls back to its built-in
//    look. The snackbar reads each option as `options?.x || <scaled default>`,
//    so null resets it; the SDK's deepMerge skips `undefined` but honours
//    `null`, which is why we reset with null rather than undefined.
//
// Both objects carry the same keys so switching one way fully overrides the
// other (setCommonModalConfig merges into a persisted singleton).
const DAZN_STYLE = {
  borderColor: '#1ed679',
  borderWidth: '1px',
  boxShadow: '0 0 24px rgba(30, 214, 121, 0.55)',
  padding: '28px 32px',
  edgeMargin: '40px',
  borderRadius: '16px',
};
const DEFAULT_STYLE = {
  borderColor: null,
  borderWidth: null,
  boxShadow: null,
  padding: null,
  edgeMargin: null,
  borderRadius: null,
};

// Per-modal preview strings (the `homeSSOLocale` flag). The SDK's localization
// feature handles layout direction only (LTR vs RTL); the *text* is the
// integrator's responsibility. So the RTL option swaps in Arabic to demonstrate
// genuine right-to-left rendering — right-aligned, words flowing R→L — rather
// than English text that merely right-aligns. The `ltr` strings mirror the
// SDK's English defaults so switching back restores the out-of-box copy
// (deepMerge needs the explicit string; it skips `undefined`). Progress has no
// title in either language. Applied via the per-modal config setters since the
// three modals carry different text.
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

// Bridges the sample app to the HomeSSO SDK's sign-in toasts. This is a
// *preview-only* integration: it loads the SDK and triggers its modals with
// fake data so the modal UI can be enhanced without the full sign-in flow (no
// session, no mobile sender). The real flow — setSignInInfoGetter /
// setSignInHandler / init() — is intentionally NOT wired here.
export class HomeSSOService {
  private readonly log = new Logger('HomeSSOService');
  private initialized = false;
  private ready = false;
  private shimmed = false;
  private variant: EsVariant | null = null;
  private version: string | null = null;
  private loadedUrl: string | null = null;
  private deploymentDatePromise: Promise<string | null> | null = null;

  async init(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;

    // On the TV platforms the main Vizbee SDK provides window.vizbee (and fires
    // VIZBEE_SDK_READY), so the homesso script sets itself up off that. On
    // desktop there is no main SDK, so stub window.vizbee — the toast UI needs
    // no continuity session, only the homesso namespace to exist.
    if (services().platform.name === 'desktop' && !window.vizbee) {
      window.vizbee = {};
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
  }

  // Snapshot for Settings → Device: which ES variant was loaded (mirrored from
  // the Vizbee SDK selection), the SDK version (null on bundles that predate
  // the VERSION export), and whether the SDK finished registering.
  status(): { ready: boolean; variant: EsVariant | null; version: string | null } {
    return { ready: this.ready, variant: this.variant, version: this.version };
  }

  // The deployment date (S3 Last-Modified) of the loaded HomeSSO bundle, shown
  // next to the version in Settings → Device. Memoised; null until the SDK
  // script URL is known, or if the header can't be read.
  deploymentDate(): Promise<string | null> {
    if (!this.loadedUrl) return Promise.resolve(null);
    this.deploymentDatePromise ??= fetchSdkDeploymentDate(this.loadedUrl);
    return this.deploymentDatePromise;
  }

  // Apply the Settings-selected toast config via the UI manager:
  //  - style: DAZN vs the SDK's default look (`homeSSOStyle` flag);
  //  - localization: LTR vs RTL layout (`homeSSOLocale` flag → `direction`).
  // setCommonModalConfig merges into every modal type, so one call configures
  // the informational, progress and success toasts alike. Called before each
  // show() so the toast always reflects the current flags.
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

    // Localized strings to match the direction: Arabic for RTL so the words
    // actually flow right-to-left, the SDK's English defaults for LTR. The three
    // modals carry different text, so set each via its own config setter.
    // CAVEAT: the SDK's VizbeeHomeSSOManager.updateSuccessUI() re-hardcodes the
    // English success title/description on every onSuccess, clobbering this
    // success override — so the success toast stays English until that SDK
    // method is fixed to respect setSuccessSignInModalConfig (informational and
    // progress localize correctly). The call is kept so it works once it is.
    const text = rtl ? PREVIEW_TEXT.rtl : PREVIEW_TEXT.ltr;
    ui.setInformationalSignInModalConfig?.(text.informational);
    ui.setProgressSignInModalConfig?.(text.progress);
    ui.setSuccessSignInModalConfig?.(text.success);
  }

  // --- Modal preview controls ------------------------------------------------
  // Each method drives the SDK's *real* UI code path (VizbeeHomeSSOManager →
  // VizbeeSnackbar), only with dummy data. The toasts render bottom-right, as
  // the SDK ships them; positioning is intentionally left to the SDK.

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

  // "Mobile Sign In Successful!" — auto-dismisses after the SDK's success
  // duration (~10s). customData.email is required for the SDK to treat it as a
  // real success in the full flow; harmless here.
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
    // onProgress/onSuccess/onFailure first call vizbeeMessagingClient.send() to
    // notify the mobile sender — which throws with no paired phone. Inject a
    // no-op client once so the code reaches the toast-rendering step.
    if (!this.shimmed) {
      m.vizbeeMessagingClient = m.vizbeeMessagingClient ?? { send: () => {}, addReceiver: () => {} };
      this.shimmed = true;
    }
    return m;
  }
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

// The script's onload fires before it has finished registering its namespace
// (and on TV it may still be waiting for VIZBEE_SDK_READY), so poll with a
// short backoff for window.vizbee.homesso to appear.
async function waitForHomeSSO(maxAttempts = 40, initialDelay = 100): Promise<boolean> {
  let delay = initialDelay;
  for (let i = 0; i < maxAttempts; i++) {
    if (window.vizbee?.homesso?.HomeSSOContext) return true;
    await new Promise((r) => setTimeout(r, delay));
    delay = Math.min(delay * 1.5, 500);
  }
  return false;
}
