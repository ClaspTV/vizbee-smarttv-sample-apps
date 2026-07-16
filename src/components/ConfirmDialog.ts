import { services } from '@/services/ServiceContainer';

export interface ConfirmDialogOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  // Button focused on open. Default 'confirm'; use 'cancel' for risky actions.
  defaultFocus?: 'confirm' | 'cancel';
  onConfirm: () => void;
  onCancel?: () => void;
}

// Modal TV confirmation. Captures remote input while open (LEFT/RIGHT switch,
// ENTER activates, BACK cancels); restores prior focus on close.
export function showConfirmDialog(opts: ConfirmDialogOptions): void {
  const prevActive = document.activeElement as HTMLElement | null;

  const overlay = document.createElement('div');
  overlay.className = 'confirm-overlay';

  const dialog = document.createElement('div');
  dialog.className = 'confirm-dialog';
  dialog.setAttribute('role', 'alertdialog');
  overlay.appendChild(dialog);

  const titleEl = document.createElement('h2');
  titleEl.className = 'confirm-dialog__title';
  titleEl.textContent = opts.title;
  dialog.appendChild(titleEl);

  if (opts.message) {
    const msgEl = document.createElement('p');
    msgEl.className = 'confirm-dialog__message';
    msgEl.textContent = opts.message;
    dialog.appendChild(msgEl);
  }

  const actions = document.createElement('div');
  actions.className = 'confirm-dialog__actions';
  dialog.appendChild(actions);

  // Reuse focusable-btn styling; focus is driven manually below (no
  // data-focusable). Both buttons neutral — focus is the only active cue.
  const confirmBtn = document.createElement('button');
  confirmBtn.className = 'focusable-btn';
  confirmBtn.textContent = opts.confirmLabel ?? 'Confirm';

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'focusable-btn';
  cancelBtn.textContent = opts.cancelLabel ?? 'Cancel';

  actions.appendChild(confirmBtn);
  actions.appendChild(cancelBtn);

  const buttons = [confirmBtn, cancelBtn];
  let index = opts.defaultFocus === 'cancel' ? 1 : 0;
  const paint = (): void => {
    buttons.forEach((b, i) => b.classList.toggle('is-focused', i === index));
    buttons[index].focus({ preventScroll: true });
  };

  let closed = false;
  const close = (): void => {
    if (closed) return;
    closed = true;
    release();
    overlay.remove();
    prevActive?.focus({ preventScroll: true });
  };

  const confirm = (): void => {
    close();
    opts.onConfirm();
  };
  const cancel = (): void => {
    close();
    opts.onCancel?.();
  };

  const release = services().remoteKeys.capture(({ action }) => {
    switch (action) {
      case 'LEFT':
      case 'UP':
        index = Math.max(0, index - 1);
        paint();
        break;
      case 'RIGHT':
      case 'DOWN':
        index = Math.min(buttons.length - 1, index + 1);
        paint();
        break;
      case 'ENTER':
        if (index === 0) confirm();
        else cancel();
        break;
      case 'BACK':
        cancel();
        break;
    }
  });

  // Pointer activation for desktop dev (remote ENTER handled via capture).
  confirmBtn.addEventListener('click', confirm);
  cancelBtn.addEventListener('click', cancel);

  document.body.appendChild(overlay);
  paint();
}
