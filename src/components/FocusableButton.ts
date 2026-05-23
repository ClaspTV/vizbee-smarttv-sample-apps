import { services } from '@/services/ServiceContainer';

// Minimal focusable button. The data-focusable attribute is the contract
// FocusManager looks for; everything else is presentation. on('click') maps
// to the ENTER remote action automatically because the button receives DOM
// focus and Enter dispatches a click in modern browsers.
export interface FocusableButtonOptions {
  label: string;
  onActivate: () => void;
  className?: string;
}

export function createFocusableButton(opts: FocusableButtonOptions): HTMLElement {
  const btn = document.createElement('button');
  btn.className = `focusable-btn ${opts.className ?? ''}`.trim();
  btn.textContent = opts.label;
  btn.setAttribute('data-focusable', 'true');
  btn.setAttribute('tabindex', '-1');

  btn.addEventListener('click', opts.onActivate);

  // ENTER from the remote: focused element receives keydown; the global
  // RemoteKeyService preventsDefault, so wire ENTER explicitly.
  const off = services().remoteKeys.on(({ action }) => {
    if (action === 'ENTER' && document.activeElement === btn) {
      opts.onActivate();
    }
  });
  // Cleanup if the button is removed from DOM.
  const observer = new MutationObserver(() => {
    if (!btn.isConnected) {
      off();
      observer.disconnect();
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });

  return btn;
}
