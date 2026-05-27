import { Logger } from '@/services/logger/Logger';
import { EventEmitter } from '@/core/events/EventEmitter';

// In-memory router. Navigation renders the matched page and notifies
// subscribers — it does NOT touch browser history or location.hash.
//
// Why: on TVs the hardware BACK button is delivered as a browser history-back
// (a `popstate`), which HardwareBackButton owns and translates into a logical
// BACK action. If the router also pushed/popped history (the old hash-based
// design), hardware BACK and route changes fought each other — a back press
// fired both a hashchange (router re-render) and a popstate (BACK dispatch),
// landing the user on Home and popping the exit dialog from any page. Keeping
// routing in-memory makes BACK behave identically on every platform.
//
// The launch URL hash is read once for an initial deep link, then ignored.

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

  // Initial deep link from the launch URL only (e.g., desktop `#/settings`,
  // or a relaunch URL). Vizbee deeplinks arrive via the SDK → navigate().
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
