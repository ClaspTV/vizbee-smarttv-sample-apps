// @ts-check
'use strict';

import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LEGACY_POLYFILLS } from './legacy-polyfills.js';

/** Repo root (perf/ lives one level under it). */
export const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/** @returns {string} first non-internal IPv4, so the TV can reach a local serve */
export function lanIp() {
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const ni of ifaces[name] ?? []) {
      if (ni.family === 'IPv4' && !ni.internal) return ni.address;
    }
  }
  return '127.0.0.1';
}

/**
 * @typedef {{
 *   withVizbee: boolean,
 *   npmPackage?: string,
 *   mode?: string,
 *   outDir: string,
 *   minify?: boolean,
 *   perfHooks?: boolean
 * }} BuildOpts
 */

/**
 * Build a variant via env-driven Vite defines. The repo is never modified:
 * "without Vizbee" is VZB_ENABLED=false (continuity init gated off), "with" sets
 * the elementless npm package so it is bundled and loaded. Pass minify:false for
 * deep-dive builds so profiles carry real function names.
 * @param {BuildOpts} opts
 * @returns {string} absolute path of the built dir
 */
export function buildVariant({
  withVizbee,
  npmPackage = '',
  mode = 'viziosmartcast',
  outDir,
  minify = true,
  mux = false,
  muxEnvKey = '',
  perfHooks = false,
}) {
  const env = {
    ...process.env,
    VZB_ENABLED: withVizbee ? 'true' : 'false',
    VIZBEE_SDK_NPM_PACKAGE: withVizbee ? npmPackage : '',
    MUX_ENABLED: mux ? 'true' : 'false',
    MUX_ENV_KEY: muxEnvKey || process.env.MUX_ENV_KEY || '',
    PERF_HOOKS: perfHooks ? 'true' : '',
  };
  const args = ['vite', 'build', '--mode', mode, '--outDir', outDir];
  if (!minify) args.push('--minify', 'false');
  // Tizen 5.0 (2019) is Chromium 63: chrome63 target, one bundle, no plugin-legacy,
  // inline polyfills, optional local SDK swap (see perf/vite.legacy.config.ts).
  if (mode === 'tizen') args.push('--config', 'perf/vite.legacy.config.ts');
  const r = spawnSync('npx', args, {
    cwd: REPO,
    env,
    encoding: 'utf8',
  });
  if (r.status !== 0) {
    throw new Error(`vite build failed (${outDir}):\n${r.stdout ?? ''}\n${r.stderr ?? ''}`);
  }
  const abs = path.resolve(REPO, outDir);
  if (mode === 'tizen') {
    const html = path.join(abs, 'index.html');
    const src = fs.readFileSync(html, 'utf8');
    if (!src.includes('__legacyPolyfills')) fs.writeFileSync(html, src.replace('<head>', `<head>${LEGACY_POLYFILLS}`));
  }
  return abs;
}

/**
 * Serve a built dir with `vite preview` on the LAN. Returns the URL the TV
 * should load and a stop fn.
 * @param {string} outDir
 * @param {number} port
 * @returns {Promise<{ url: string, stop: () => void }>}
 */
export function serve(outDir, port) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      'npx',
      ['vite', 'preview', '--outDir', outDir, '--host', '--port', String(port), '--strictPort'],
      // Own process group: `npx` wraps vite in `npm exec`, and killing only the
      // wrapper orphans vite on the port (the next case would then get the old build).
      { cwd: REPO, detached: true },
    );
    const stop = () => {
      try {
        if (child.pid) process.kill(-child.pid, 'SIGTERM');
      } catch {
        child.kill();
      }
    };
    let settled = false;
    const finish = () => {
      settled = true;
      resolve({ url: `http://${lanIp()}:${port}/`, stop });
    };
    const onData = (/** @type {Buffer} */ b) => {
      if (!settled && /Local:|Network:/.test(b.toString())) finish();
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.on('exit', (code) => {
      if (!settled) reject(new Error(`vite preview exited ${code}`));
    });
    setTimeout(() => {
      if (!settled) finish();
    }, 8000);
  });
}
