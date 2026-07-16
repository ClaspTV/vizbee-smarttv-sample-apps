import { addLogSink, LogEntry } from '@/services/logger/Logger';

// ⚠️ Set these to publish the app's logs to a PubNub channel; leave any blank to
// disable. This is the app's own remote logging, separate from the Vizbee SDK's.
export interface PubNubLogConfig {
  publishKey: string;
  subscribeKey: string;
  channel: string;
}

export const PUBNUB_LOG_CONFIG: PubNubLogConfig = {
  publishKey: '',
  subscribeKey: '',
  channel: '',
};

const FLUSH_MS = 1500; // batch window — PubNub rate-limits, so don't publish per line
const MAX_BATCH = 25;
const MAX_LINE = 500;

// Publishes log lines to a PubNub channel via the REST publish API, batched to
// stay under rate limits. No-ops unless all three config values are set.
export class PubNubLogger {
  private off: (() => void) | null = null;
  private buffer: string[] = [];
  private timer: number | undefined;
  private readonly uuid = getUuid();

  constructor(private readonly cfg: PubNubLogConfig) {}

  get enabled(): boolean {
    return Boolean(this.cfg.publishKey && this.cfg.subscribeKey && this.cfg.channel);
  }

  start(): void {
    if (this.off || !this.enabled) return;
    this.off = addLogSink((entry) => this.queue(entry));
  }

  stop(): void {
    this.off?.();
    this.off = null;
    this.flush(); // ship anything buffered
  }

  private queue(entry: LogEntry): void {
    const time = new Date(entry.time).toISOString();
    const msg = entry.args.map(format).join(' ');
    let line = `${time} ${entry.level.toUpperCase()}/${entry.tag} ${msg}`;
    if (line.length > MAX_LINE) line = `${line.slice(0, MAX_LINE - 1)}…`;
    this.buffer.push(line);

    if (this.buffer.length >= MAX_BATCH) {
      this.flush();
    } else if (this.timer === undefined) {
      this.timer = window.setTimeout(() => this.flush(), FLUSH_MS);
    }
  }

  private flush(): void {
    if (this.timer !== undefined) {
      window.clearTimeout(this.timer);
      this.timer = undefined;
    }
    if (!this.buffer.length) return;
    const lines = this.buffer.splice(0, this.buffer.length);
    this.publish(lines);
  }

  private publish(lines: string[]): void {
    const { publishKey, subscribeKey, channel } = this.cfg;
    const url =
      `https://ps.pndsn.com/publish/${encodeURIComponent(publishKey)}` +
      `/${encodeURIComponent(subscribeKey)}/0/${encodeURIComponent(channel)}/0` +
      `?uuid=${encodeURIComponent(this.uuid)}`;
    try {
      // XHR POST (message in body): widely supported on older TV engines, and
      // avoids the URL-length limit a GET publish would hit when batching.
      const xhr = new XMLHttpRequest();
      xhr.open('POST', url, true);
      xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.send(JSON.stringify({ uuid: this.uuid, lines }));
    } catch {
      /* never let logging break the app */
    }
  }
}

// Stable per-install id so one channel can carry (and distinguish) multiple devices.
function getUuid(): string {
  try {
    let id = localStorage.getItem('vsw.log.uuid');
    if (!id) {
      id = `vsw-${Math.random().toString(36).slice(2, 10)}`;
      localStorage.setItem('vsw.log.uuid', id);
    }
    return id;
  } catch {
    return 'vsw-anon';
  }
}

function format(arg: unknown): string {
  if (typeof arg === 'string') return arg;
  if (arg instanceof Error) return arg.message;
  try {
    return JSON.stringify(arg);
  } catch {
    return String(arg);
  }
}
