import { services } from '@/services/ServiceContainer';
import { showTextPrompt } from '@/components/TextPrompt';

export interface TextFieldOptions {
  label: string;
  value: string;
  // Called when the user saves a changed, non-empty value.
  onCommit: (value: string) => void;
}

// Focusable settings row (label + value). ENTER/click opens a modal editor
// with an explicit Save — reliable text entry on TV.
export function createTextField(opts: TextFieldOptions): HTMLElement {
  let value = opts.value;

  const wrapper = document.createElement('div');
  wrapper.className = 'text-field';
  wrapper.setAttribute('data-focusable', 'true');
  wrapper.setAttribute('tabindex', '-1');

  const labelEl = document.createElement('div');
  labelEl.className = 'text-field__label';
  labelEl.textContent = opts.label;

  const valueEl = document.createElement('div');
  valueEl.className = 'text-field__value';
  valueEl.textContent = value;

  wrapper.appendChild(labelEl);
  wrapper.appendChild(valueEl);

  const edit = (): void => {
    showTextPrompt({
      title: opts.label,
      value,
      onSave: (next) => {
        if (next === value) return;
        value = next;
        valueEl.textContent = next;
        opts.onCommit(next);
      },
    });
  };

  // ENTER on the focused row opens the editor (scoped to this wrapper).
  const off = services().remoteKeys.on(({ action }) => {
    if (action === 'ENTER' && document.activeElement === wrapper) edit();
  });
  wrapper.addEventListener('click', edit);

  const observer = new MutationObserver(() => {
    if (!wrapper.isConnected) {
      off();
      observer.disconnect();
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });

  return wrapper;
}
