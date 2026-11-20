// @ts-check
'use strict';

/**
 * Minimal Chrome DevTools Protocol client over a page WebSocket.
 * Node 22+ provides a global WebSocket, so there is no dependency.
 * Same transport works for Vizio (:9555), webOS (ares-inspect) and Tizen (sdb).
 */
export class Cdp {
  /** @param {string} wsUrl */
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    /** @type {WebSocket | null} */
    this.ws = null;
    this.nextId = 0;
    /** @type {Map<number, { resolve: (v: any) => void, reject: (e: Error) => void }>} */
    this.pending = new Map();
    /** @type {Map<string, Set<(params: any) => void>>} */
    this.listeners = new Map();
  }

  /** @returns {Promise<void>} */
  connect() {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.wsUrl);
      this.ws = ws;
      ws.onopen = () => resolve();
      ws.onerror = () => reject(new Error(`CDP connect failed: ${this.wsUrl}`));
      ws.onmessage = (ev) => this._onMessage(String(ev.data));
    });
  }

  /** @param {string} data */
  _onMessage(data) {
    /** @type {any} */
    let msg;
    try {
      msg = JSON.parse(data);
    } catch {
      return;
    }
    if (typeof msg.id === 'number' && this.pending.has(msg.id)) {
      const p = this.pending.get(msg.id);
      this.pending.delete(msg.id);
      if (msg.error) p?.reject(new Error(msg.error.message ?? 'CDP error'));
      else p?.resolve(msg.result);
      return;
    }
    if (typeof msg.method === 'string') {
      const set = this.listeners.get(msg.method);
      if (set) for (const fn of set) fn(msg.params);
    }
  }

  /**
   * @param {string} method
   * @param {Record<string, unknown>} [params]
   * @returns {Promise<any>}
   */
  send(method, params = {}) {
    const ws = this.ws;
    if (!ws) return Promise.reject(new Error('CDP not connected'));
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  /**
   * Subscribe to a CDP event; returns an unsubscribe fn.
   * @param {string} method
   * @param {(params: any) => void} fn
   * @returns {() => void}
   */
  on(method, fn) {
    let set = this.listeners.get(method);
    if (!set) {
      set = new Set();
      this.listeners.set(method, set);
    }
    set.add(fn);
    return () => {
      set?.delete(fn);
    };
  }

  /**
   * Evaluate an expression in the page and return its value.
   * @param {string} expression
   * @returns {Promise<any>}
   */
  async evaluate(expression) {
    const res = await this.send('Runtime.evaluate', { expression, returnByValue: true });
    return res?.result?.value;
  }

  close() {
    try {
      this.ws?.close();
    } catch {
      /* ignore */
    }
    this.ws = null;
  }
}
