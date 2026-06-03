import { createToggle } from '@/components/Toggle';
import { createRadioGroup, firstFocusableOption } from '@/components/RadioGroup';
import { createTextField } from '@/components/TextField';
import { showConfirmDialog } from '@/components/ConfirmDialog';
import { buildLabel, currentBuild, targetUrl } from '@/core/platform/appBuild';
import { services } from '@/services/ServiceContainer';
import { DEFAULT_FLAGS, FLAG_LABELS, FLAG_OPTIONS, FlagKey } from '@/services/feature-flags/flags';

export function renderSettingsPage(root: HTMLElement): () => void {
  root.innerHTML = '';

  const page = document.createElement('div');
  page.className = 'settings-page';

  // Header
  const header = document.createElement('header');
  header.className = 'settings-header';
  const title = document.createElement('h1');
  title.className = 'settings-header__title';
  title.textContent = 'Settings';
  const subtitle = document.createElement('p');
  subtitle.className = 'settings-header__subtitle';
  subtitle.textContent = 'Toggle features for this device. Changes are saved instantly.';
  header.appendChild(title);
  header.appendChild(subtitle);

  // Section: Feature flags
  const section = document.createElement('section');
  section.className = 'settings-section';

  const sectionTitle = document.createElement('h2');
  sectionTitle.className = 'settings-section__title';
  sectionTitle.textContent = 'Feature flags';

  const list = document.createElement('div');
  list.className = 'settings-list';

  const flags = services().flags;
  const build = currentBuild(services().platform.name);
  const keys = Object.keys(DEFAULT_FLAGS) as FlagKey[];
  let firstFocus: HTMLElement | undefined;

  // First option: the Vizbee App ID. It's read at boot by VizbeeService.init,
  // so a change persists and reloads (like the SDK/build switches).
  const appIdField = createTextField({
    label: 'Vizbee App ID',
    value: services().config.get().vizbeeAppId,
    onCommit: (value) => {
      services().config.setVizbeeAppId(value);
      promptAppIdReload();
    },
  });
  list.appendChild(appIdField);
  firstFocus = appIdField;

  for (const key of keys) {
    // npmModule is surfaced through the build-aware "Vizbee SDK" row below;
    // homeSSOStyle / homeSSOLocale render in the HomeSSO preview section. None
    // of these is a plain row.
    if (key === 'npmModule' || key === 'homeSSOStyle' || key === 'homeSSOLocale') continue;

    // Build-aware "Vizbee SDK" row: the script build picks the SDK <script>
    // variant (vizbeeSdk); the npm build picks which bundled module to load
    // (npmModule → …/es5 vs /es6). Same row + label, different options/flag.
    const optionsKey: FlagKey = key === 'vizbeeSdk' && build === 'npm' ? 'npmModule' : key;
    const current = flags.get(optionsKey);
    const options = FLAG_OPTIONS[optionsKey];
    let row: HTMLElement;
    let initialFocus: HTMLElement | undefined;
    if (options && typeof current === 'string') {
      row = createRadioGroup({
        label: FLAG_LABELS[key],
        options,
        initialValue: current,
        // Cast: set's overload narrows per key, but the loop's K is widened.
        onChange: (value) => {
          flags.set(optionsKey, value as never);
          if (optionsKey === 'vizbeeSdk') promptSdkReload('vizbeeSdk', value);
          else if (optionsKey === 'sdkEnv') promptSdkReload('sdkEnv', value);
          else if (optionsKey === 'npmModule') promptModuleSwitch(value);
          else if (optionsKey === 'appBuild') promptBuildSwitch(value);
        },
      });
      initialFocus = firstFocusableOption(row);
    } else {
      // Toggle path (boolean flags). No boolean flags exist right now, so this
      // is currently unused — Boolean() keeps it valid for when one is added.
      row = createToggle({
        label: FLAG_LABELS[key],
        initialValue: Boolean(current),
        onChange: (value) => flags.set(key, value as never),
      });
      initialFocus = row;
    }
    if (!firstFocus) firstFocus = initialFocus;
    list.appendChild(row);
  }

  section.appendChild(sectionTitle);
  section.appendChild(list);

  // Section: HomeSSO modal preview. These toggles drive the HomeSSO SDK's own
  // sign-in toasts (rendered bottom-right by the SDK) with dummy data, so the
  // modal UI can be previewed/enhanced without a real paired phone. They are
  // momentary preview controls — not persisted feature flags. The SDK shows one
  // toast at a time, so turning one on replaces whatever was showing.
  const ssoSection = document.createElement('section');
  ssoSection.className = 'settings-section';

  const ssoTitle = document.createElement('h2');
  ssoTitle.className = 'settings-section__title';
  ssoTitle.textContent = 'HomeSSO modal preview';

  const ssoList = document.createElement('div');
  ssoList.className = 'settings-list';

  // Style selector (SDK default vs DAZN) — backed by the persisted homeSSOStyle
  // flag; HomeSSOService.applyModalConfig() reads it at show time.
  ssoList.appendChild(
    createRadioGroup({
      label: FLAG_LABELS.homeSSOStyle,
      options: FLAG_OPTIONS.homeSSOStyle!,
      initialValue: flags.get('homeSSOStyle'),
      onChange: (value) => flags.set('homeSSOStyle', value as never),
    }),
  );

  // Localization (LTR default vs RTL) — backed by the persisted homeSSOLocale
  // flag; applied at show time via the modal config's `direction`.
  ssoList.appendChild(
    createRadioGroup({
      label: FLAG_LABELS.homeSSOLocale,
      options: FLAG_OPTIONS.homeSSOLocale!,
      initialValue: flags.get('homeSSOLocale'),
      onChange: (value) => flags.set('homeSSOLocale', value as never),
    }),
  );

  const homeSSO = services().homeSSO;
  const ssoModals: ReadonlyArray<{ label: string; show: () => void }> = [
    { label: 'Informational modal', show: () => homeSSO.showInformational() },
    { label: 'Progress modal', show: () => homeSSO.showProgress() },
    { label: 'Success modal', show: () => homeSSO.showSuccess() },
  ];
  for (const modal of ssoModals) {
    ssoList.appendChild(
      createToggle({
        label: modal.label,
        initialValue: false,
        onChange: (on) => (on ? modal.show() : homeSSO.hide()),
      }),
    );
  }

  ssoSection.appendChild(ssoTitle);
  ssoSection.appendChild(ssoList);

  // Section: Device info (right-hand column — see .settings-body)
  const infoSection = document.createElement('section');
  infoSection.className = 'settings-section settings-section--device';

  const infoTitle = document.createElement('h2');
  infoTitle.className = 'settings-section__title';
  infoTitle.textContent = 'Device';

  const info = services().platform.getDeviceInfo();
  const infoList = document.createElement('dl');
  infoList.className = 'settings-info';
  appendInfo(infoList, 'Platform', info.platform);
  if (info.model) appendInfo(infoList, 'Model', info.model);
  if (info.version) appendInfo(infoList, 'Version', info.version);
  appendInfo(infoList, 'App', services().config.get().appName);
  appendInfo(infoList, 'App Version', __APP_VERSION__);
  appendInfo(infoList, 'App ID', services().config.get().vizbeeAppId);
  // Reported by the loaded SDK (window.VZB.VERSION); '—' until it loads / on
  // desktop. The deployment date (S3 Last-Modified) is fetched async and
  // appended in brackets, e.g. "7.8.35 (May 27, 2026)".
  const sdkVersion = window.VZB?.VERSION ?? null;
  const sdkDd = appendInfo(infoList, 'SDK Version', sdkVersion ?? '—');
  if (sdkVersion) {
    void services().vizbee.sdkDeploymentDate().then((date) => {
      if (date) sdkDd.textContent = `${sdkVersion} (${date})`;
    });
  }
  // HomeSSO SDK: version + deployment date (in brackets) + ES variant (which
  // mirrors the Vizbee SDK selection). Reads window.vizbee.homesso.VERSION;
  // bundles predating that export report "unknown". '—' before it loads,
  // "loading…" while registering. Date arrives async (see below).
  const sso = services().homeSSO.status();
  const buildSsoValue = (date: string | null): string => {
    if (!sso.variant) return '—';
    const ver = sso.ready ? (sso.version ?? 'unknown') : 'loading…';
    const datePart = date ? ` (${date})` : '';
    return `${ver}${datePart} · ${sso.variant.toUpperCase()}`;
  };
  const ssoDd = appendInfo(infoList, 'HomeSSO SDK', buildSsoValue(null));
  if (sso.variant && sso.ready) {
    void services().homeSSO.deploymentDate().then((date) => {
      if (date) ssoDd.textContent = buildSsoValue(date);
    });
  }
  // HomeSSO account (app-owned state). Live-updates if the user signs in/out
  // (e.g. a phone completes sign-in, or Sign out on the Profile page) while
  // Settings is open.
  const accountValue = (state = services().homeSSO.authState()): string =>
    state.account ? `Signed in as ${state.account.login}` : 'Not signed in';
  const accountDd = appendInfo(infoList, 'HomeSSO Account', accountValue());
  const offAuth = services().homeSSO.onAuthChange((state) => {
    accountDd.textContent = accountValue(state);
  });
  // Which build is actually running, where it loaded from, and when it was
  // built — so "deployed one, launched another" is verifiable at a glance.
  appendInfo(infoList, 'Build', buildLabel(info.platform));
  appendInfo(infoList, 'Source', `${window.location.origin}${window.location.pathname}`);
  appendInfo(infoList, 'Built', __BUILD_TIME__);

  infoSection.appendChild(infoTitle);
  infoSection.appendChild(infoList);

  // Two-column body: left column stacks feature flags + HomeSSO preview;
  // device info sits on the right.
  const main = document.createElement('div');
  main.className = 'settings-main';
  main.appendChild(section);
  main.appendChild(ssoSection);

  const body = document.createElement('div');
  body.className = 'settings-body';
  body.appendChild(main);
  body.appendChild(infoSection);

  page.appendChild(header);
  page.appendChild(body);
  root.appendChild(page);

  // Initial focus on the first focusable element in the flags list.
  if (firstFocus) services().focus.setFocus(firstFocus);

  // BACK action: route home (menu also reachable via LEFT).
  const off = services().remoteKeys.on(({ action }) => {
    if (action === 'BACK') services().router.back('/home');
  });

  return () => {
    off();
    offAuth();
  };
}

// The App ID is read once at boot by VizbeeService.init, so a change applies on
// the next load. Offer an immediate reload; "Later" keeps it for next launch.
function promptAppIdReload(): void {
  showConfirmDialog({
    title: 'Apply Vizbee App ID?',
    message: 'The app will reload to start with the new App ID.',
    confirmLabel: 'Reload now',
    cancelLabel: 'Later',
    onConfirm: () => window.location.reload(),
  });
}

// The Vizbee SDK <script> is injected once at boot, so switching the build
// (vizbeeSdk) or its origin env (sdkEnv) only takes effect on a fresh load.
// Offer an immediate reload to apply the picked value now; "Later" keeps the
// selection (persisted) for the next launch.
function promptSdkReload(key: 'vizbeeSdk' | 'sdkEnv', value: string): void {
  const label = (FLAG_OPTIONS[key]?.find((o) => o.value === value)?.label ?? '')
    .replace(/^Use\s+/, '') || 'The selected SDK';
  showConfirmDialog({
    title: 'Reload to apply SDK?',
    message: `Switching to "${label}" takes effect after a reload. Reload now?`,
    confirmLabel: 'Reload now',
    cancelLabel: 'Later',
    onConfirm: () => window.location.reload(),
  });
}

// The script and npm builds are separate apps at different hosted URLs, so
// switching means reloading into the other URL (not an in-place reload). Only
// possible when hosted on webOS/Tizen; off-device buildUrl() returns null and
// the selection just persists for the next hosted launch (applied at boot).
function promptBuildSwitch(value: string): void {
  // Switching to npm lands on the currently-selected module folder (es5/es6).
  const target = targetUrl(
    services().platform.name,
    value as 'script' | 'npm',
    services().flags.get('npmModule'),
  );
  if (!target) return;
  const label = (FLAG_OPTIONS.appBuild?.find((o) => o.value === value)?.label ?? '')
    .replace(/^Use\s+/, '') || 'the selected build';
  showConfirmDialog({
    title: 'Switch app build?',
    message: `The app will reload into "${label}". Reload now?`,
    confirmLabel: 'Reload now',
    cancelLabel: 'Later',
    onConfirm: () => window.location.replace(target),
  });
}

// npm build only: switching ES5 ⇄ ES6 reloads into the other module folder
// (…/webos-with-nodemodule/es5 vs /es6) — separate hosted apps, so a redirect.
function promptModuleSwitch(value: string): void {
  const target = targetUrl(services().platform.name, 'npm', value as 'es5' | 'es6');
  if (!target) return;
  const label = (FLAG_OPTIONS.npmModule?.find((o) => o.value === value)?.label ?? '')
    .replace(/^Use\s+/, '') || 'the selected module';
  showConfirmDialog({
    title: 'Switch module?',
    message: `The app will reload into "${label}". Reload now?`,
    confirmLabel: 'Reload now',
    cancelLabel: 'Later',
    onConfirm: () => window.location.replace(target),
  });
}

// Returns the value cell so callers can patch it later (e.g. appending an
// SDK deployment date once its async fetch resolves).
function appendInfo(parent: HTMLElement, label: string, value: string): HTMLElement {
  const dt = document.createElement('dt');
  dt.textContent = label;
  const dd = document.createElement('dd');
  dd.textContent = value;
  parent.appendChild(dt);
  parent.appendChild(dd);
  return dd;
}
