import { Logger } from '@/services/logger/Logger';

// Hash-based router. Three pages: #/home, #/player/:id, #/settings.
// Each page registers an enter handler returning a teardown.
// Why not history API: TVs often run from file:// or have weird base URLs;
// hash routing avoids HTML5 history pitfalls.

export type RouteHandler = (params: Record<string, string>) => () => void;

interface Route {
  pattern: RegExp;
  paramNames: string[];
  handler: RouteHandler;
}

export class Router {
  private readonly routes: Route[] = [];
  private currentTeardown: (() => void) | null = null;
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
    window.addEventListener('hashchange', this.resolve);
    if (!window.location.hash || window.location.hash === '#') {
      window.location.hash = defaultPath;
    } else {
      this.resolve();
    }
  }

  navigate(path: string): void {
    window.location.hash = path;
  }

  back(defaultPath = '/home'): void {
    // We don't track history depth here; just go to default.
    // For richer back behavior, swap in a small stack.
    if (window.location.hash !== `#${defaultPath}`) {
      this.navigate(defaultPath);
    }
  }

  private resolve = (): void => {
    const path = window.location.hash.replace(/^#/, '') || '/home';
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
        return;
      }
    }

    this.log.warn('no route matched', path);
  };
}
