import { createToggle } from '@/components/Toggle';
import { createRadioGroup, firstFocusableOption } from '@/components/RadioGroup';
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

  for (const key of keys) {
    // npmModule is surfaced through the build-aware "Vizbee SDK" row below,
    // not as its own row.
    if (key === 'npmModule') continue;

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
          if (optionsKey === 'vizbeeSdk') promptSdkReload(value);
          else if (optionsKey === 'npmModule') promptModuleSwitch(value);
          else if (optionsKey === 'appBuild') promptBuildSwitch(value);
        },
      });
      initialFocus = firstFocusableOption(row);
    } else {
      row = createToggle({
        label: FLAG_LABELS[key],
        initialValue: current as boolean,
        onChange: (value) => flags.set(key, value as never),
      });
      initialFocus = row;
    }
    if (!firstFocus) firstFocus = initialFocus;
    list.appendChild(row);
  }

  section.appendChild(sectionTitle);
  section.appendChild(list);

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
  // Which build is actually running, where it loaded from, and when it was
  // built — so "deployed one, launched another" is verifiable at a glance.
  appendInfo(infoList, 'Build', buildLabel(info.platform));
  appendInfo(infoList, 'Source', `${window.location.origin}${window.location.pathname}`);
  appendInfo(infoList, 'Built', __BUILD_TIME__);

  infoSection.appendChild(infoTitle);
  infoSection.appendChild(infoList);

  // Two-column body: feature flags on the left, device info on the right.
  const body = document.createElement('div');
  body.className = 'settings-body';
  body.appendChild(section);
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

  return () => off();
}

// The Vizbee SDK <script> is injected once at boot, so switching builds only
// takes effect on a fresh load. Offer an immediate reload to apply the picked
// build now; "Later" keeps the selection (persisted) for the next launch.
function promptSdkReload(value: string): void {
  const label = (FLAG_OPTIONS.vizbeeSdk?.find((o) => o.value === value)?.label ?? '')
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

function appendInfo(parent: HTMLElement, label: string, value: string): void {
  const dt = document.createElement('dt');
  dt.textContent = label;
  const dd = document.createElement('dd');
  dd.textContent = value;
  parent.appendChild(dt);
  parent.appendChild(dd);
}
