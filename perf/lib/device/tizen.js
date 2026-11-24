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
    // Reconnect (sdb drops idle TCP links), kill a running instance (debug-launch
    // hangs otherwise; was_kill is refused on retail images), then debug-launch.
    // Tizen 5.0 rejects a trailing timeout arg.
    if (process.env.TIZEN_IP) spawnSync('sdb', ['connect', process.env.TIZEN_IP], { encoding: 'utf8', timeout: 15000 });
    const pkgId = this.appId.split('.')[0];
    spawnSync('sdb', ['shell', '0', 'kill', pkgId], { encoding: 'utf8', timeout: 15000 });
    const dbg = spawnSync('sdb', ['shell', '0', 'debug', this.appId], { encoding: 'utf8', timeout: 30000 });
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
    // The inspector port is reported before the inspector listens: retry ~30s.
    /** @type {unknown} */
    let last;
    for (let i = 0; i < 15; i++) {
      try {
        const res = await fetch(`${base}/json`, { signal: AbortSignal.timeout(8000) });
        if (!res.ok) throw new Error(`/json HTTP ${res.status}`);
        const targets = /** @type {any[]} */ (await res.json());
        if (targets.length) return targets;
        last = new Error('/json returned no targets');
      } catch (e) {
        last = e;
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
    throw new Error(`Tizen inspector /json: ${/** @type {Error} */ (last)?.message ?? last}`);
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
