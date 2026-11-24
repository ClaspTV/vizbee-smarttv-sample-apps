// @ts-check
'use strict';

/**
 * Per-platform config. Capture is identical across platforms (CDP); only the
 * Vite build mode, the elementless npm package, and how we attach differ.
 *
 * @typedef {{
 *   key: 'vizio' | 'webos' | 'tizen',
 *   label: string,
 *   mode: string,
 *   elPackage: { es5: string, es6: string },
 *   device: 'vizio' | 'webos' | 'tizen',
 *   validated: boolean
 * }} Platform
 */

/** @type {Record<'vizio' | 'webos' | 'tizen', Platform>} */
export const PLATFORMS = {
  vizio: {
    key: 'vizio',
    label: 'Vizio',
    mode: 'viziosmartcast',
    elPackage: { es5: '@vizbeetv/sdk/vizio-el/es5', es6: '@vizbeetv/sdk/vizio-el/es6' },
    device: 'vizio',
    validated: true,
  },
  webos: {
    key: 'webos',
    label: 'LG webOS',
    mode: 'webos',
    elPackage: { es5: '@vizbeetv/sdk/lg-el/es5', es6: '@vizbeetv/sdk/lg-el/es6' },
    device: 'webos',
    validated: true,
  },
  tizen: {
    key: 'tizen',
    label: 'Samsung Tizen',
    mode: 'tizen',
    elPackage: { es5: '@vizbeetv/sdk/samsung-el/es5', es6: '@vizbeetv/sdk/samsung-el/es6' },
    device: 'tizen',
    // Validated end-to-end on a 2019 UN49RU8000 (Tizen 5.0 / Chromium 63).
    validated: true,
  },
};

/** @param {string} key @returns {Platform} */
export function getPlatform(key) {
  const p = PLATFORMS[/** @type {'vizio'} */ (key)];
  if (!p) throw new Error(`unknown platform "${key}" (vizio | webos | tizen)`);
  return p;
}
