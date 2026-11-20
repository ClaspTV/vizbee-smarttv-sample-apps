// @ts-check
'use strict';

import { spawnSync } from 'node:child_process';
import { Cdp } from '../cdp.js';

/**
 * Samsung Tizen device over CDP. `sdb shell 0 debug <appId>` returns the web
 * inspector port on the TV; we forward it locally with `sdb forward` and read
 * /json there, then drive the page like Vizio (same capture code).
 *
 * UNTESTED on-device — mechanics follow Tizen Studio's web inspector flow;
 * validate the `sdb debug` port parsing on a real Tizen TV, then flip
 * validated:true.
 */
export class TizenDevice {
  /** @param {{ appId: string, localPort?: number }} opts */
  constructor({ appId, localPort = 7011 }) {
    this.appId = appId;
    this.localPort = localPort;
    /** @type {Cdp | null} */
    this.cdp = null;
    this.forwarded = false;
  }

  /** Launch-into-debug + forward the inspector port locally. @returns {string} base url */
  _forward() {
    if (this.forwarded) return `http://127.0.0.1:${this.localPort}`;
    const dbg = spawnSync('sdb', ['shell', '0', 'debug', this.appId, '300'], { encoding: 'utf8' });
    const out = `${dbg.stdout ?? ''}${dbg.stderr ?? ''}`;
    const m = out.match(/port:\s*(\d+)/i);
    if (!m) throw new Error(`sdb debug: no port in output:\n${out}`);
    const remotePort = m[1];
    const fwd = spawnSync('sdb', ['forward', `tcp:${this.localPort}`, `tcp:${remotePort}`], {
      encoding: 'utf8',
    });
    if (fwd.status !== 0) throw new Error(`sdb forward failed: ${fwd.stderr ?? ''}`);
    this.forwarded = true;
    return `http://127.0.0.1:${this.localPort}`;
  }

  /** @returns {Promise<any[]>} */
  async listTargets() {
    const base = this._forward();
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
    if (!page?.webSocketDebuggerUrl) throw new Error('no page target on Tizen device');
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
    if (this.forwarded) {
      spawnSync('sdb', ['forward', '--remove', `tcp:${this.localPort}`], { encoding: 'utf8' });
      this.forwarded = false;
    }
  }
}
