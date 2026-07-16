import { addLogSink, LogEntry } from '@/services/logger/Logger';

// On-screen log panel for debug mode (TVs lack devtools). Read-only overlay that
// never interferes with nav. Currently unwired — kept for a future re-enable.
const MAX_LINES = 40;

export class DebugOverlay {
  private el: HTMLElement | null = null;
  private off: (() => void) | null = null;
  private lines: string[] = [];

  show(): void {
    if (this.el) return;
    const el = document.createElement('div');
    el.className = 'debug-overlay';
    document.body.appendChild(el);
    this.el = el;
    this.render();
    this.off = addLogSink((entry) => this.push(entry));
  }

  hide(): void {
    this.off?.();
    this.off = null;
    this.el?.remove();
    this.el = null;
    this.lines = [];
  }

  private push(entry: LogEntry): void {
    const time = new Date(entry.time).toLocaleTimeString();
    const msg = entry.args.map(format).join(' ');
    this.lines.push(`${time} ${entry.level[0].toUpperCase()}/${entry.tag}  ${msg}`);
    if (this.lines.length > MAX_LINES) this.lines.shift();
    this.render();
  }

  private render(): void {
    if (!this.el) return;
    this.el.textContent = this.lines.length
      ? this.lines.join('\n')
      : 'Debug mode — logs will appear here.';
    // Keep the newest line in view.
    this.el.scrollTop = this.el.scrollHeight;
  }
}

// Compact one-line rendering of a log arg; objects are JSON'd and truncated.
function format(arg: unknown): string {
  if (typeof arg === 'string') return arg;
  if (arg instanceof Error) return arg.message;
  try {
    const s = JSON.stringify(arg);
    return s.length > 200 ? `${s.slice(0, 197)}…` : s;
  } catch {
    return String(arg);
  }
}
