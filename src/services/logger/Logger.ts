// Minimal leveled logger. Prefix per module; can be muted in prod via flag.

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_RANK: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

let _minLevel: LogLevel = 'debug';

export function setLogLevel(level: LogLevel): void {
  _minLevel = level;
}

export interface LogEntry {
  level: LogLevel;
  tag: string;
  args: unknown[];
  time: number;
}

type LogSink = (entry: LogEntry) => void;
const _sinks = new Set<LogSink>();

// Subscribe to emitted log entries (level-filtered). Powers the on-screen
// DebugOverlay for TVs without a remote inspector. Returns an unsubscribe fn.
export function addLogSink(sink: LogSink): () => void {
  _sinks.add(sink);
  return () => {
    _sinks.delete(sink);
  };
}

export class Logger {
  constructor(private readonly tag: string) {}

  debug(...args: unknown[]): void {
    this.log('debug', args);
  }
  info(...args: unknown[]): void {
    this.log('info', args);
  }
  warn(...args: unknown[]): void {
    this.log('warn', args);
  }
  error(...args: unknown[]): void {
    this.log('error', args);
  }

  private log(level: LogLevel, args: unknown[]): void {
    if (LEVEL_RANK[level] < LEVEL_RANK[_minLevel]) return;
    const prefix = `[${level.toUpperCase()}][${this.tag}][${new Date().toISOString()}]`;
    const fn =
      level === 'error'
        ? console.error
        : level === 'warn'
        ? console.warn
        : console.log;
    fn(prefix, ...args);
    // Mirror to sinks (on-screen overlay) — only emitted (level-passing) lines.
    if (_sinks.size) {
      const entry: LogEntry = { level, tag: this.tag, args, time: Date.now() };
      _sinks.forEach((sink) => {
        try {
          sink(entry);
        } catch {
          /* never let a sink break logging */
        }
      });
    }
  }
}
