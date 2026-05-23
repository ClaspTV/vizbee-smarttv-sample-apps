import { services } from '@/services/ServiceContainer';

export interface ToggleOptions {
  label: string;
  initialValue: boolean;
  onChange: (value: boolean) => void;
}

export function createToggle(opts: ToggleOptions): HTMLElement {
  const wrapper = document.createElement('button');
  wrapper.className = 'toggle';
  wrapper.setAttribute('data-focusable', 'true');
  wrapper.setAttribute('tabindex', '-1');

  let value = opts.initialValue;

  const labelEl = document.createElement('span');
  labelEl.className = 'toggle__label';
  labelEl.textContent = opts.label;

  const switchEl = document.createElement('span');
  switchEl.className = 'toggle__switch';

  wrapper.appendChild(labelEl);
  wrapper.appendChild(switchEl);

  const render = (): void => {
    wrapper.setAttribute('aria-pressed', String(value));
    wrapper.classList.toggle('toggle--on', value);
  };
  render();

  const flip = (): void => {
    value = !value;
    render();
    opts.onChange(value);
  };

  wrapper.addEventListener('click', flip);

  const off = services().remoteKeys.on(({ action }) => {
    if (action === 'ENTER' && document.activeElement === wrapper) flip();
  });
  const observer = new MutationObserver(() => {
    if (!wrapper.isConnected) {
      off();
      observer.disconnect();
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });

  return wrapper;
}
