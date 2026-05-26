import { services } from '@/services/ServiceContainer';

export interface TextPromptOptions {
  title: string;
  value: string;
  saveLabel?: string;
  cancelLabel?: string;
  onSave: (value: string) => void;
  onCancel?: () => void;
}

// Modal text editor for TV. Reliable text entry without depending on the
// on-screen-keyboard's blur/enter quirks: an <input> (auto-focused → the TV
// IME opens) plus explicit Save / Cancel buttons. While the input is focused,
// RemoteKeyService ignores it so typing works; once the IME closes (input
// blurs) focus moves to Save, so there's always a clear way to commit. The
// capture owns the remote, so LEFT/RIGHT move between buttons, ENTER activates,
// BACK cancels. Reuses the .confirm-overlay / .confirm-dialog styles.
export function showTextPrompt(opts: TextPromptOptions): void {
  const prevActive = document.activeElement as HTMLElement | null;

  const overlay = document.createElement('div');
  overlay.className = 'confirm-overlay';

  const dialog = document.createElement('div');
  dialog.className = 'confirm-dialog';
  dialog.setAttribute('role', 'dialog');
  overlay.appendChild(dialog);

  const titleEl = document.createElement('h2');
  titleEl.className = 'confirm-dialog__title';
  titleEl.textContent = opts.title;
  dialog.appendChild(titleEl);

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'confirm-dialog__input';
  input.value = opts.value;
  input.setAttribute('autocapitalize', 'off');
  input.setAttribute('autocomplete', 'off');
  input.spellcheck = false;
  dialog.appendChild(input);

  const actions = document.createElement('div');
  actions.className = 'confirm-dialog__actions';
  dialog.appendChild(actions);

  const saveBtn = document.createElement('button');
  saveBtn.className = 'focusable-btn';
  saveBtn.textContent = opts.saveLabel ?? 'Save';

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'focusable-btn';
  cancelBtn.textContent = opts.cancelLabel ?? 'Cancel';

  actions.appendChild(saveBtn);
  actions.appendChild(cancelBtn);

  const buttons = [saveBtn, cancelBtn];
  let index = 0;
  const paint = (): void => {
    buttons.forEach((b, i) => b.classList.toggle('is-focused', i === index));
    buttons[index].focus({ preventScroll: true });
  };
  // Return to the text box (re-opens the on-screen keyboard on TV).
  const focusInput = (): void => {
    input.focus();
    input.select();
  };

  let closed = false;
  const close = (): void => {
    if (closed) return;
    closed = true;
    release();
    overlay.remove();
    prevActive?.focus({ preventScroll: true });
  };
  const save = (): void => {
    const v = input.value.trim();
    close();
    if (v) opts.onSave(v);
  };
  const cancel = (): void => {
    close();
    opts.onCancel?.();
  };

  // Owns the remote — but only actually fires when the input is NOT focused
  // (a focused input is bypassed by RemoteKeyService), i.e. when on the buttons.
  const release = services().remoteKeys.capture(({ action }) => {
    switch (action) {
      case 'LEFT':
        index = Math.max(0, index - 1);
        paint();
        break;
      case 'RIGHT':
        index = Math.min(buttons.length - 1, index + 1);
        paint();
        break;
      case 'UP':
        focusInput(); // buttons row → back up to the text box
        break;
      case 'DOWN':
        // already on the buttons row — nothing below
        break;
      case 'ENTER':
        if (index === 0) save();
        else cancel();
        break;
      case 'BACK':
        cancel();
        break;
    }
  });

  // While editing, the input handles its own keys.
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      save();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancel();
    } else if (e.key === 'ArrowDown') {
      // Single-line input — DOWN moves to the Save/Cancel buttons.
      e.preventDefault();
      index = 0;
      paint();
    }
  });
  // When the on-screen keyboard closes (input blurs), surface Save so there's
  // always a visible, focusable way to commit.
  input.addEventListener('blur', () => {
    if (!closed) paint();
  });
  saveBtn.addEventListener('click', save);
  cancelBtn.addEventListener('click', cancel);

  document.body.appendChild(overlay);
  // Focus the input first → opens the TV on-screen keyboard / lets desktop type.
  input.focus();
  input.select();
}
