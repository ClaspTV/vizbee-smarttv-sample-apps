import { PlatformName } from '@/core/platform/PlatformAdapter';

// Logical actions decoupled from raw KeyboardEvent.keyCode values.
// Pages and components subscribe to actions, never to keycodes.
export type RemoteAction =
  | 'UP'
  | 'DOWN'
  | 'LEFT'
  | 'RIGHT'
  | 'ENTER'
  | 'BACK'
  | 'HOME'
  | 'PLAY'
  | 'PAUSE'
  | 'PLAY_PAUSE'
  | 'STOP'
  | 'FAST_FORWARD'
  | 'REWIND';

// Strategy pattern: per-platform keycode → action map.
// Most TVs share the desktop arrow keys; specific platforms add transport keys.
const COMMON_NAVIGATION: Record<number, RemoteAction> = {
  37: 'LEFT',
  38: 'UP',
  39: 'RIGHT',
  40: 'DOWN',
  13: 'ENTER',
  8: 'BACK',
  27: 'BACK',
};

const TIZEN_KEYS: Record<number, RemoteAction> = {
  ...COMMON_NAVIGATION,
  10009: 'BACK', // Samsung remote BACK
  415: 'PLAY',
  19: 'PAUSE',
  10252: 'PLAY_PAUSE',
  413: 'STOP',
  417: 'FAST_FORWARD',
  412: 'REWIND',
};

const WEBOS_KEYS: Record<number, RemoteAction> = {
  ...COMMON_NAVIGATION,
  461: 'BACK', // webOS remote BACK
  415: 'PLAY',
  19: 'PAUSE',
  413: 'STOP',
  417: 'FAST_FORWARD',
  412: 'REWIND',
};

const VIZIO_KEYS: Record<number, RemoteAction> = {
  ...COMMON_NAVIGATION,
  // Vizio SmartCast remote uses standard media keys via DOM keycodes.
  179: 'PLAY_PAUSE',
  413: 'STOP',
  417: 'FAST_FORWARD',
  412: 'REWIND',
};

const XBOX_KEYS: Record<number, RemoteAction> = {
  ...COMMON_NAVIGATION,
  // Xbox controller keys exposed via Windows.System.VirtualKey;
  // GamepadA = 0xC3 (195), GamepadB = 0xC4 (196).
  195: 'ENTER',
  196: 'BACK',
};

// FireTV remote in a Cordova Android WebView. The BACK button is intercepted
// natively (see hooks/after_platform_add/override-back-button.js) and
// re-delivered as a synthetic keydown with keyCode 4 (Android KEYCODE_BACK).
// Transport keys follow the same codes as other TV platforms.
const FIRETV_KEYS: Record<number, RemoteAction> = {
  ...COMMON_NAVIGATION,
  4: 'BACK',    // Android KEYCODE_BACK — injected synthetically by native hook
  415: 'PLAY',
  19: 'PAUSE',
  179: 'PLAY_PAUSE',
  413: 'STOP',
  417: 'FAST_FORWARD',
  412: 'REWIND',
};

const DESKTOP_KEYS: Record<number, RemoteAction> = {
  ...COMMON_NAVIGATION,
  32: 'PLAY_PAUSE', // Space
};

export function getKeymap(platform: PlatformName): Record<number, RemoteAction> {
  switch (platform) {
    case 'tizen':
      return TIZEN_KEYS;
    case 'webos':
      return WEBOS_KEYS;
    case 'viziosmartcast':
      return VIZIO_KEYS;
    case 'xbox':
      return XBOX_KEYS;
    case 'firetv':
      return FIRETV_KEYS;
    case 'desktop':
    default:
      return DESKTOP_KEYS;
  }
}
