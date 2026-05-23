import { createToggle } from '@/components/Toggle';
import { createRadioGroup, firstFocusableOption } from '@/components/RadioGroup';
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
  const keys = Object.keys(DEFAULT_FLAGS) as FlagKey[];
  let firstFocus: HTMLElement | undefined;

  for (const key of keys) {
    const current = flags.get(key);
    const options = FLAG_OPTIONS[key];
    let row: HTMLElement;
    let initialFocus: HTMLElement | undefined;
    if (options && typeof current === 'string') {
      row = createRadioGroup({
        label: FLAG_LABELS[key],
        options,
        initialValue: current,
        // Cast: set's overload narrows per key, but the loop's K is widened.
        onChange: (value) => flags.set(key, value as never),
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

  // Section: Device info
  const infoSection = document.createElement('section');
  infoSection.className = 'settings-section';

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

  infoSection.appendChild(infoTitle);
  infoSection.appendChild(infoList);

  page.appendChild(header);
  page.appendChild(section);
  page.appendChild(infoSection);
  root.appendChild(page);

  // Initial focus on the first focusable element in the flags list.
  if (firstFocus) services().focus.setFocus(firstFocus);

  // BACK action: route home (menu also reachable via LEFT).
  const off = services().remoteKeys.on(({ action }) => {
    if (action === 'BACK') services().router.back('/home');
  });

  return () => off();
}

function appendInfo(parent: HTMLElement, label: string, value: string): void {
  const dt = document.createElement('dt');
  dt.textContent = label;
  const dd = document.createElement('dd');
  dd.textContent = value;
  parent.appendChild(dt);
  parent.appendChild(dd);
}
