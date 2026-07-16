import { Logger } from '@/services/logger/Logger';
import { EventEmitter } from '@/core/events/EventEmitter';

// In-memory router: renders the matched page and notifies subscribers without
// touching history/location.hash (avoids fighting hardware BACK). Reads launch hash once.

export type RouteHandler = (params: Record<string, string>) => () => void;

interface Route {
  pattern: RegExp;
  paramNames: string[];
  handler: RouteHandler;
}

type RouterEvents = {
  change: { path: string };
};

export class Router {
  private readonly routes: Route[] = [];
  private currentTeardown: (() => void) | null = null;
  private currentPath = '';
  private readonly emitter = new EventEmitter<RouterEvents>();
  private readonly log = new Logger('Router');

  register(path: string, handler: RouteHandler): void {
    const paramNames: string[] = [];
    const pattern = new RegExp(
      '^' +
        path.replace(/:(\w+)/g, (_match, name) => {
          paramNames.push(name as string);
          return '([^/]+)';
        }) +
        '$',
    );
    this.routes.push({ pattern, paramNames, handler });
  }

  start(defaultPath = '/home'): void {
    this.go(this.pathFromLaunchHash() ?? defaultPath);
  }

  navigate(path: string): void {
    this.go(path);
  }

  back(defaultPath = '/home'): void {
    // No history stack to pop; "back" is just a navigate to the default route.
    if (this.currentPath !== defaultPath) this.go(defaultPath);
  }

  getCurrentPath(): string {
    return this.currentPath;
  }

  /** Notified after every successful navigation (e.g., NavMenu highlight). */
  onChange(listener: (e: RouterEvents['change']) => void): () => void {
    return this.emitter.on('change', listener);
  }

  // Initial deep link from the launch URL only; Vizbee deeplinks arrive
  // via the SDK → navigate().
  private pathFromLaunchHash(): string | null {
    const h = window.location.hash.replace(/^#/, '');
    return h && h !== '/' ? h : null;
  }

  private go(path: string): void {
    this.log.info('navigate', path);
    for (const route of this.routes) {
      const match = route.pattern.exec(path);
      if (match) {
        const params: Record<string, string> = {};
        route.paramNames.forEach((name, i) => {
          params[name] = decodeURIComponent(match[i + 1] ?? '');
        });
        this.currentTeardown?.();
        this.currentTeardown = route.handler(params);
        this.currentPath = path;
        this.emitter.emit('change', { path });
        return;
      }
    }
    this.log.warn('no route matched', path);
  }
}
