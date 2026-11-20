// @ts-check
'use strict';

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';

const PHONE_PKG = 'tv.vizbee.demo';
const PHONE_MAIN = `${PHONE_PKG}/.ui.activity.MainActivity`;
const sleep = (/** @type {number} */ ms) => new Promise((r) => setTimeout(r, ms));
const log = (/** @type {string} */ s) => console.log(s);

/** @typedef {{ text: string, desc: string, id: string, pkg: string, b: number[], cx: number, cy: number }} UiNode */

/** adb from ADB env, ANDROID_HOME, the default SDK, or PATH; null if none works. */
export function findAdb() {
  const cands = [
    process.env.ADB,
    process.env.ANDROID_HOME && path.join(process.env.ANDROID_HOME, 'platform-tools/adb'),
    path.join(os.homedir(), 'Library/Android/sdk/platform-tools/adb'),
    'adb',
  ].filter(Boolean);
  for (const c of /** @type {string[]} */ (cands)) {
    try {
      execFileSync(c, ['version'], { stdio: 'ignore' });
      return c;
    } catch {
      /* next */
    }
  }
  return null;
}

/** An Android phone running the Vizbee demo app, driven over adb + UI Automator. */
export class Phone {
  /** @param {string} adb @param {string} serial */
  constructor(adb, serial) {
    this.adb = adb;
    this.serial = serial;
    this.offset = 0;
    /** @type {string | null} */
    this.debugDir = null;
    /** @type {NodeJS.Timeout | null} */
    this.timer = null;
    /** @type {string | undefined} */
    this.origStayOn = undefined;
    /** @type {string | undefined} */
    this.origTimeout = undefined;
  }

  /** @param {string[]} args @param {object} [opts] @returns {string} */
  run(args, opts = {}) {
    return /** @type {string} */ (
      execFileSync(this.adb, ['-s', this.serial, ...args], {
        encoding: 'utf8',
        maxBuffer: 64 << 20,
        ...opts,
      })
    );
  }
  /** @param {string} cmd */
  sh(cmd) {
    return this.run(['shell', cmd]);
  }
  /** @param {number} x @param {number} y */
  tap(x, y) {
    this.sh(`input tap ${Math.round(x)} ${Math.round(y)}`);
  }

  /** @returns {UiNode[]} */
  dump() {
    let x = '';
    for (let i = 0; i < 3 && !/<hierarchy/.test(x); i++) {
      try {
        this.sh('uiautomator dump /sdcard/perf-ui.xml >/dev/null 2>&1');
        x = this.run(['exec-out', 'cat', '/sdcard/perf-ui.xml']);
      } catch {
        /* retry */
      }
    }
    return [...x.matchAll(/<node [^>]*>/g)].map((m) => {
      const g = (/** @type {string} */ k) => (m[0].match(new RegExp(` ${k}="([^"]*)"`)) || [])[1] || '';
      const b = (g('bounds').match(/\d+/g) || [0, 0, 0, 0]).map(Number);
      return {
        text: g('text'),
        desc: g('content-desc'),
        id: g('resource-id'),
        pkg: g('package'),
        b,
        cx: (b[0] + b[2]) / 2,
        cy: (b[1] + b[3]) / 2,
      };
    });
  }

  /** Dismiss Android permission prompts whenever they show up. @param {UiNode[]} nodes */
  handlePopups(nodes) {
    const allow = nodes.find(
      (n) => /permission_allow_button$/.test(n.id) || (/permissioncontroller/.test(n.pkg) && /^allow$/i.test(n.text)),
    );
    if (allow) {
      log('  phone: allowing a permission prompt');
      this.tap(allow.cx, allow.cy);
      return true;
    }
    return false;
  }

  /** @param {(n: UiNode) => boolean} pred @param {number} ms @param {string} what @returns {Promise<UiNode>} */
  async waitFor(pred, ms, what) {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      const nodes = this.dump();
      if (this.handlePopups(nodes)) {
        await sleep(800);
        continue;
      }
      const n = nodes.find(pred);
      if (n) return n;
      await sleep(400);
    }
    this.snapshot(what);
    throw new Error(`phone: ${what} not found within ${ms / 1000}s`);
  }

  /** Screenshot + UI dump of a failure. @param {string} what */
  snapshot(what) {
    if (!this.debugDir) return;
    const base = path.join(
      this.debugDir,
      `phone-fail-${new Date().toISOString().slice(11, 19).replace(/:/g, '')}-${what.replace(/\W+/g, '_').slice(0, 30)}`,
    );
    try {
      fs.writeFileSync(
        base + '.png',
        execFileSync(this.adb, ['-s', this.serial, 'exec-out', 'screencap', '-p'], { maxBuffer: 64 << 20 }),
      );
    } catch {
      /* ignore */
    }
  }

  /** Phone clock minus host clock, ms (logcat timestamps are phone time). */
  calibrate() {
    const offs = [];
    for (let i = 0; i < 5; i++) {
      const h1 = Date.now();
      const p = parseFloat(this.sh('echo $EPOCHREALTIME')) * 1000;
      const h2 = Date.now();
      offs.push({ off: p - (h1 + h2) / 2, rtt: h2 - h1 });
    }
    offs.sort((a, b) => a.rtt - b.rtt);
    this.offset = offs[0].off;
    return this.offset;
  }
  logcatClear() {
    try {
      this.run(['logcat', '-c']);
    } catch {
      /* ignore */
    }
  }
  /** First logcat line matching re, as host-clock ms. @param {RegExp} re @param {number} ms */
  async logcatWait(re, ms) {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      const out = this.run(['logcat', '-d', '-v', 'epoch']);
      for (const l of out.split('\n')) {
        if (!re.test(l)) continue;
        const m = l.match(/^\s*(\d+\.\d+)/);
        if (m) return parseFloat(m[1]) * 1000 - this.offset;
      }
      await sleep(250);
    }
    return null;
  }

  keepAwake() {
    if (this.origStayOn === undefined) {
      this.origStayOn = this.sh('settings get global stay_on_while_plugged_in').trim();
      this.origTimeout = this.sh('settings get system screen_off_timeout').trim();
    }
    this.sh('svc power stayon true');
    this.sh('settings put system screen_off_timeout 1800000');
    if (!this.timer) {
      this.timer = setInterval(() => {
        const p = spawn(this.adb, ['-s', this.serial, 'shell', 'input keyevent KEYCODE_WAKEUP'], { stdio: 'ignore' });
        p.on('error', () => {});
      }, 60000);
      this.timer.unref();
    }
  }
  restoreAwake() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    try {
      if (/^\d+$/.test(this.origStayOn || '')) this.sh(`settings put global stay_on_while_plugged_in ${this.origStayOn}`);
      if (/^\d+$/.test(this.origTimeout || '')) this.sh(`settings put system screen_off_timeout ${this.origTimeout}`);
    } catch {
      /* phone gone */
    }
  }
  async wake() {
    this.sh('svc power stayon true');
    this.sh('input keyevent KEYCODE_WAKEUP');
    if (!this.locked()) return;
    this.sh('input keyevent 82');
    await sleep(800);
    if (this.locked()) {
      this.sh('input swipe 540 1900 540 500 250');
      await sleep(1000);
    }
    if (this.locked()) {
      this.snapshot('locked');
      throw new Error('phone is locked and needs a PIN: unlock it');
    }
  }
  locked() {
    return /isKeyguardShowing=true|mShowingLockscreen=true/.test(this.sh('dumpsys window'));
  }
  forceStop() {
    this.sh(`am force-stop ${PHONE_PKG}`);
  }
  async restartApp() {
    await this.wake();
    this.forceStop();
    await sleep(500);
    this.sh(`am start -W -n ${PHONE_MAIN}`);
    await this.waitFor((n) => /^Cast button/.test(n.desc), 20000, 'demo app home (cast button)');
    await sleep(2500);
  }
  /** @param {UiNode[]} [nodes] @returns {'connected' | 'disconnected' | null} */
  castState(nodes = this.dump()) {
    const n = nodes.find((x) => /^Cast button/.test(x.desc));
    return n ? (/disconnected/.test(n.desc) ? 'disconnected' : 'connected') : null;
  }
  async ensureDisconnected() {
    for (let i = 0; i < 3; i++) {
      const nodes = this.dump();
      if (this.castState(nodes) !== 'connected') {
        const dismiss = nodes.find((n) => /menu_item_dismiss$|vzb_content_dismiss$/.test(n.id));
        if (dismiss) {
          this.tap(dismiss.cx, dismiss.cy);
          await sleep(800);
          continue;
        }
        return;
      }
      const btn = /** @type {UiNode} */ (nodes.find((n) => /^Cast button/.test(n.desc)));
      this.tap(btn.cx, btn.cy);
      await sleep(1500);
      let ns = this.dump();
      const details = ns.find((n) => /vzb_player_control_device_details$/.test(n.id));
      if (details && !ns.find((n) => /devicestatus_disconnect_button$/.test(n.id))) {
        this.tap(details.cx, details.cy);
        await sleep(1200);
        ns = this.dump();
      }
      const disc = ns.find((n) => /devicestatus_disconnect_button$/.test(n.id));
      if (disc) {
        this.tap(disc.cx, disc.cy);
        await sleep(2000);
      }
    }
    if (this.castState() === 'connected') throw new Error('phone: could not disconnect');
  }
  /** Tap the TV in the device picker. @param {string} tvName @returns {Promise<{tapAt:number, connectedAt:number|null}>} */
  async connect(tvName) {
    this.logcatClear();
    let btn = await this.waitFor((n) => /^Cast button/.test(n.desc), 10000, 'cast button').catch(() => null);
    if (!btn) {
      await this.restartApp();
      await this.ensureDisconnected();
      btn = await this.waitFor((n) => /^Cast button/.test(n.desc), 10000, 'cast button');
    }
    this.tap(btn.cx, btn.cy);
    const dev = await this.waitFor(
      (n) => /deviceinfo_friendly_name$/.test(n.id) && n.text === tvName,
      20000,
      `"${tvName}" in device picker`,
    );
    const tapAt = Date.now();
    this.tap(dev.cx, dev.cy);
    const esc = tvName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const connectedAt = await this.logcatWait(new RegExp(`=> SCREEN_CONNECTED \\(${esc}\\)`), 45000);
    return { tapAt, connectedAt };
  }

  /** The demo app's Vizbee App ID, from its shared prefs. @returns {string | null} */
  appId() {
    try {
      const x = this.sh(`run-as ${PHONE_PKG} cat /data/data/${PHONE_PKG}/shared_prefs/${PHONE_PKG}_preferences.xml`);
      return (x.match(/name="pref_vizbee_app_id">([^<]*)/) || [])[1] || null;
    } catch {
      return null;
    }
  }
}
