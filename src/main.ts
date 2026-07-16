// Entry point. Boot order: detect platform → await readiness →
// wire services → start router (first page renders).

import './styles/reset.css';
import './styles/tokens.css';
import './styles/layout.css';
import './components/components.css';
import './features/home/home.css';
import './features/player/player.css';
import './features/profile/profile.css';
import './features/settings/settings.css';

import { PlatformFactory } from './core/platform/PlatformFactory';
import { redirectToSelectedBuild, buildLabel } from './core/platform/appBuild';
import { RemoteKeyService } from './core/input/RemoteKeyService';
import { HardwareBackButton } from './core/input/HardwareBackButton';
import { FocusManager } from './core/navigation/FocusManager';
import { LifecycleManager } from './core/lifecycle/LifecycleManager';
import { ConfigService } from './services/config/ConfigService';
import { FeatureFlagService } from './services/feature-flags/FeatureFlagService';
import { VizbeeService } from './services/vizbee/VizbeeService';
import { HomeSSOService } from './services/homesso/HomeSSOService';
import { setServices } from './services/ServiceContainer';
import { Router } from './app/Router';
import { startApp } from './app/App';
import { Logger, setLogLevel } from './services/logger/Logger';

const log = new Logger('main');

async function boot(): Promise<void> {
  log.info('starting Vizbee Sample Webapp');

  // 1. Platform — async so Rollup can chunk-split per-platform adapters.
  const platform = await PlatformFactory.detect();

  // 2. Services that don't need platform-ready (load synchronously)
  const config = new ConfigService();
  config.load();
  const flags = new FeatureFlagService();
  flags.load();

  // Sample app: log everything — all debug traces are useful for integration work.
  setLogLevel('debug');

  // If a different app build (script vs npm) is selected, redirect to its
  // hosted URL (webOS/Tizen only) and stop this build from booting.
  if (redirectToSelectedBuild(platform.name, flags.get('appBuild'), flags.get('npmModule'))) {
    log.info('redirecting to selected app build', {
      appBuild: flags.get('appBuild'),
      npmModule: flags.get('npmModule'),
    });
    return;
  }

  log.info('app build', {
    build: buildLabel(platform.name),
    source: `${window.location.origin}${window.location.pathname}`,
    builtAt: __BUILD_TIME__,
  });

  const remoteKeys = new RemoteKeyService(platform);
  const focus = new FocusManager(remoteKeys);
  const lifecycle = new LifecycleManager();
  const vizbee = new VizbeeService();
  const homeSSO = new HomeSSOService();
  const router = new Router();

  setServices({
    config,
    flags,
    platform,
    remoteKeys,
    focus,
    lifecycle,
    vizbee,
    homeSSO,
    router,
  });

  // 3. Kick off platform readiness in parallel — don't block first paint.
  // Nothing in the initial render depends on platform globals.
  void platform.awaitReady().then(
    () => log.info('platform ready', platform.name),
    (e) => log.error('platform readiness failed', e),
  );

  // 4. Start input + lifecycle + render
  remoteKeys.start();
  focus.start();
  lifecycle.start();

  // Foreground/background hook for the Vizbee SDK (placeholder).
  lifecycle.on('background', () => log.info('app backgrounded'));
  lifecycle.on('foreground', () => log.info('app foregrounded'));
  lifecycle.on('exit', () => vizbee.reset());

  const rootEl = document.getElementById('app');
  if (!rootEl) throw new Error('#app element not found');
  installViewportScale();
  startApp(rootEl, router);

  // webOS delivers remote BACK as a history popstate; install the
  // popstate→BACK bridge after the first route so BACK handlers catch it.
  new HardwareBackButton(remoteKeys).start();
}

// Uniform viewport scaling: design at 1920x1080 and CSS-transform to fit
// whatever the actual TV viewport is. One layout source, every panel.
const DESIGN_W = 1920;
const DESIGN_H = 1080;
function installViewportScale(): void {
  const apply = (): void => {
    const scale = Math.min(window.innerWidth / DESIGN_W, window.innerHeight / DESIGN_H);
    document.documentElement.style.setProperty('--app-scale', String(scale));
  };
  apply();
  window.addEventListener('resize', apply);
}

boot().catch((e) => {
  console.error('[main] boot failed', e);
});
