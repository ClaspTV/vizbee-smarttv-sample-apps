import { services } from '@/services/ServiceContainer';

export interface RadioOption {
  value: string;
  label: string;
}

export interface RadioGroupOptions {
  label: string;
  options: ReadonlyArray<RadioOption>;
  initialValue: string;
  onChange: (value: string) => void;
}

// Mutually-exclusive group of focusable options; each is its own focusable
// element so spatial nav moves between them. ENTER selects.
export function createRadioGroup(opts: RadioGroupOptions): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className = 'radio-group';

  const labelEl = document.createElement('div');
  labelEl.className = 'radio-group__label';
  labelEl.textContent = opts.label;
  wrapper.appendChild(labelEl);

  const list = document.createElement('div');
  list.className = 'radio-group__options';
  wrapper.appendChild(list);

  let value = opts.initialValue;

  const optionEls = opts.options.map((option) => {
    const btn = document.createElement('button');
    btn.className = 'radio-option';
    btn.setAttribute('data-focusable', 'true');
    btn.setAttribute('tabindex', '-1');
    btn.dataset.value = option.value;

    const dot = document.createElement('span');
    dot.className = 'radio-option__dot';
    const text = document.createElement('span');
    text.className = 'radio-option__label';
    text.textContent = option.label;
    btn.appendChild(dot);
    btn.appendChild(text);

    list.appendChild(btn);

    const select = (): void => {
      if (value === option.value) return;
      value = option.value;
      render();
      opts.onChange(value);
    };

    btn.addEventListener('click', select);
    btn.dataset.select = '1'; // marker for the remote-key handler below
    btn.addEventListener('vizbee:select', select);

    return btn;
  });

  const render = (): void => {
    for (const btn of optionEls) {
      const on = btn.dataset.value === value;
      btn.setAttribute('aria-checked', String(on));
      btn.classList.toggle('radio-option--selected', on);
    }
  };
  render();

  // Single remote-key subscription for the group: dispatches ENTER to the
  // focused option. Auto-cleans when the group leaves the DOM.
  const off = services().remoteKeys.on(({ action }) => {
    if (action !== 'ENTER') return;
    const focused = document.activeElement;
    if (focused instanceof HTMLElement && optionEls.includes(focused as HTMLButtonElement)) {
      focused.dispatchEvent(new CustomEvent('vizbee:select'));
    }
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

// First focusable option in a group, for SettingsPage's initial focus.
export function firstFocusableOption(group: HTMLElement): HTMLElement | undefined {
  return group.querySelector<HTMLElement>('.radio-option') ?? undefined;
}
