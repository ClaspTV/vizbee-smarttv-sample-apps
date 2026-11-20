// @ts-check
'use strict';

import { spawn } from 'node:child_process';
import { Cdp } from '../cdp.js';

/**
 * LG webOS device over CDP. `ares-inspect` tunnels the app's inspector to a
 * local port; we read /json there for the page target, then drive it like any
 * other CDP page (same capture code as Vizio).
 *
 * UNTESTED on-device — mechanics follow @webosose/ares-cli; validate the
 * ares-inspect URL parsing on a real webOS TV, then flip validated:true.
 */
export class WebosDevice {
  /** @param {{ device?: string, appId: string }} opts */
  constructor({ device = 'emulator', appId }) {
    this.device = device;
    this.appId = appId;
    /** @type {Cdp | null} */
    this.cdp = null;
    /** @type {import('node:child_process').ChildProcess | null} */
    this.inspectProc = null;
    /** @type {string | null} */
    this.inspectorBase = null;
  }

  /** @returns {Promise<string>} inspector base url (http://127.0.0.1:PORT) */
  async _startInspector() {
    if (this.inspectorBase) return this.inspectorBase;
    // detached: own process group, so close() can kill ares-inspect AND the ssh
    // tunnel it spawns (killing the node parent alone leaves the tunnel behind).
    const proc = spawn('ares-inspect', ['--device', this.device, '--app', this.appId], {
      detached: true,
    });
    this.inspectProc = proc;
    const base = await new Promise((resolve, reject) => {
      let buf = '';
      const onData = (/** @type {Buffer} */ b) => {
        buf += b.toString();
        const m = buf.match(/https?:\/\/[^\s]*?:(\d+)\b/);
        if (m) resolve(`http://127.0.0.1:${m[1]}`);
      };
      proc.stdout.on('data', onData);
      proc.stderr.on('data', onData);
      proc.on('exit', (c) => reject(new Error(`ares-inspect exited ${c}`)));
      setTimeout(() => reject(new Error('ares-inspect: no inspector URL in 15s')), 15000);
    });
    this.inspectorBase = base;
    return base;
  }

  /** @returns {Promise<any[]>} */
  async listTargets() {
    const base = await this._startInspector();
    const res = await fetch(`${base}/json`, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`/json HTTP ${res.status}`);
    return /** @type {any[]} */ (await res.json());
  }

  /** @returns {Promise<boolean>} */
  async reachable() {
    try {
      await this.listTargets();
      return true;
    } catch {
      return false;
    }
  }

  /** @returns {Promise<any|undefined>} */
  async pageTarget() {
    const targets = await this.listTargets();
    return targets.find((t) => t.type === 'page') ?? targets[0];
  }

  /** @returns {Promise<Cdp>} */
  async attach() {
    const page = await this.pageTarget();
    if (!page?.webSocketDebuggerUrl) throw new Error('no page target on webOS device');
    const cdp = new Cdp(page.webSocketDebuggerUrl);
    await cdp.connect();
    this.cdp = cdp;
    return cdp;
  }

  /** @param {string} url */
  async navigate(url) {
    const c = this._cdp();
    await c.send('Page.enable');
    await c.send('Page.navigate', { url });
  }

  async reload() {
    const c = this._cdp();
    await c.send('Page.enable');
    await c.send('Page.reload', {});
  }

  /** @returns {Cdp} */
  _cdp() {
    if (!this.cdp) throw new Error('not attached');
    return this.cdp;
  }

  close() {
    this.cdp?.close();
    this.cdp = null;
    const pid = this.inspectProc?.pid;
    if (pid) {
      try {
        process.kill(-pid, 'SIGTERM');
      } catch {
        try {
          this.inspectProc?.kill();
        } catch {
          /* ignore */
        }
      }
    }
    this.inspectProc = null;
    this.inspectorBase = null;
  }
}
