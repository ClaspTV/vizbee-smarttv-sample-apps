// @ts-check
'use strict';

import { Cdp } from '../cdp.js';

/**
 * @typedef {{ id: string, url: string, title: string, type: string, webSocketDebuggerUrl: string }} Target
 */

/**
 * Vizio SmartCast device over CDP. The remote-debugging endpoint lives on
 * port 9555 and is only up while an app page is running on the TV.
 */
export class VizioDevice {
  /** @param {string} ip @param {number} [port] */
  constructor(ip, port = 9555) {
    this.ip = ip;
    this.port = port;
    this.base = `http://${ip}:${port}`;
    /** @type {Cdp | null} */
    this.cdp = null;
  }

  /** @returns {Promise<Target[]>} */
  async listTargets() {
    const res = await fetch(`${this.base}/json`, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`/json HTTP ${res.status}`);
    return /** @type {Target[]} */ (await res.json());
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

  /** @returns {Promise<Target | undefined>} */
  async pageTarget() {
    const targets = await this.listTargets();
    return targets.find((t) => t.type === 'page');
  }

  /**
   * Attach to the current page target.
   * @returns {Promise<Cdp>}
   */
  async attach() {
    const page = await this.pageTarget();
    if (!page) throw new Error('no page target on device');
    const cdp = new Cdp(page.webSocketDebuggerUrl);
    await cdp.connect();
    this.cdp = cdp;
    return cdp;
  }

  /** @param {string} url */
  async navigate(url) {
    const cdp = this._cdp();
    await cdp.send('Page.enable');
    await cdp.send('Page.navigate', { url });
  }

  async reload() {
    const cdp = this._cdp();
    await cdp.send('Page.enable');
    await cdp.send('Page.reload', {});
  }

  /** @returns {Cdp} */
  _cdp() {
    if (!this.cdp) throw new Error('not attached');
    return this.cdp;
  }

  close() {
    this.cdp?.close();
    this.cdp = null;
  }
}
