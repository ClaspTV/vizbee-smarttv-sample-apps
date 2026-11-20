// @ts-check
'use strict';

import { VizioDevice } from './vizio.js';
import { WebosDevice } from './webos.js';
import { TizenDevice } from './tizen.js';

/**
 * Common device interface the runner/deep-dive depend on. Vizio is validated;
 * webOS and Tizen are interface-compatible but need on-device validation.
 * @typedef {{
 *   attach: () => Promise<import('../cdp.js').Cdp>,
 *   navigate: (url: string) => Promise<void>,
 *   reload: () => Promise<void>,
 *   reachable: () => Promise<boolean>,
 *   pageTarget: () => Promise<any>,
 *   close: () => void
 * }} Device
 */

/**
 * @param {import('../platforms.js').Platform} platform
 * @param {{ ip?: string, appId?: string, device?: string }} [opts]
 * @returns {Device}
 */
export function makeDevice(platform, opts = {}) {
  const appId = opts.appId ?? 'com.vizbee.dev.samplewebapp';
  switch (platform.device) {
    case 'vizio':
      return new VizioDevice(opts.ip ?? '127.0.0.1');
    case 'webos':
      return new WebosDevice({ device: opts.device ?? 'lg_2023', appId });
    case 'tizen':
      return new TizenDevice({ appId });
    default:
      throw new Error(`no device adapter for ${platform.device}`);
  }
}
