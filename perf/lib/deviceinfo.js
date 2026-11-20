// @ts-check
'use strict';

import { spawnSync } from 'node:child_process';

/**
 * Best-effort device details for the report's "Device & run" table.
 * Vizio reads the companion deviceInfo over CDP; webOS uses `ares-device -i`;
 * Tizen uses `sdb capability`. Always returns an object (may be partial).
 *
 * @param {import('./platforms.js').Platform} platform
 * @param {{ dev?: any, device?: string, serial?: string, npmPackage?: string, withVizbee?: boolean }} opts
 * @returns {Promise<Record<string,string>>}
 */
export async function captureDeviceInfo(platform, opts = {}) {
  const sdkVariant = opts.withVizbee
    ? `${opts.npmPackage || 'script'} (elementless npm)`
    : 'n/a (SDK stripped for baseline)';
  try {
    if (platform.key === 'vizio' && opts.dev) {
      const cdp = await opts.dev.attach();
      const q = async (/** @type {string} */ e) => {
        try {
          return await cdp.evaluate(e);
        } catch {
          return null;
        }
      };
      const raw = await q(
        'JSON.stringify((window.VIZIO&&window.VIZIO._deviceInfoStore&&window.VIZIO._deviceInfoStore._deviceInfoObject)||{})',
      );
      const o = raw ? JSON.parse(raw) : {};
      const screen = await q('screen.width+" x "+screen.height');
      return prune({
        Model: o.MODEL_NAME ? `Vizio ${o.MODEL_NAME}` : 'Vizio SmartCast',
        Platform: 'VizioSmartCast',
        'Firmware / API': o.API_VERSION,
        Screen: screen,
        'SDK variant': sdkVariant,
      });
    }
    if (platform.key === 'webos') {
      const r = spawnSync('ares-device', ['-i', '-d', opts.device || 'lg2023'], { encoding: 'utf8' });
      const txt = `${r.stdout ?? ''}`;
      const g = (/** @type {string} */ k) => (txt.match(new RegExp(k + '\\s*:\\s*(.+)')) || [])[1]?.trim();
      return prune({
        Model: g('modelName') ? `LG ${g('modelName')}` : 'LG webOS TV',
        Platform: 'webOS TV',
        'webOS SDK': g('sdkVersion'),
        Firmware: g('firmwareVersion'),
        'Board / chipset': g('boardType'),
        'SDK variant': sdkVariant,
      });
    }
    if (platform.key === 'tizen') {
      const args = opts.serial ? ['-s', opts.serial, 'capability'] : ['capability'];
      const r = spawnSync('sdb', args, { encoding: 'utf8' });
      const txt = `${r.stdout ?? ''}`;
      const g = (/** @type {string} */ k) => (txt.match(new RegExp(k + ':\\s*(.+)')) || [])[1]?.trim();
      return prune({
        Model: g('device_name') || 'Samsung Tizen TV',
        Platform: 'Samsung Tizen',
        'Platform version': g('platform_version'),
        'CPU arch': g('cpu_arch'),
        'SDK variant': sdkVariant,
      });
    }
  } catch {
    /* best-effort */
  }
  return prune({ Platform: platform.label, 'SDK variant': sdkVariant });
}

/** @param {Record<string, string|null|undefined>} o */
function prune(o) {
  /** @type {Record<string,string>} */
  const out = {};
  for (const [k, v] of Object.entries(o)) if (v) out[k] = String(v);
  return out;
}
