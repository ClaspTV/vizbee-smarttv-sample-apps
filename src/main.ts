// Entry point. Boot order:
//   1. Detect platform → adapter
//   2. Await platform readiness (Vizio companion lib, etc.)
//   3. Wire services into the container
//   4. Start router → first page renders

import './styles/reset.css';
import './styles/tokens.css';
import './styles/layout.css';
import './components/components.css';
import './features/home/home.css';
import './features/player/player.css';
import './features/settings/settings.css';

import { PlatformFactory } from './core/platform/PlatformFactory';
import { RemoteKeyService } from './core/input/RemoteKeyService';
import { FocusManager } from './core/navigation/FocusManager';
import { LifecycleManager } from './core/lifecycle/LifecycleManager';
import { ConfigService } from './services/config/ConfigService';
import { FeatureFlagService } from './services/feature-flags/FeatureFlagService';
import { VizbeeService } from './services/vizbee/VizbeeService';
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
  const flags = new FeatureFlagService();
  flags.load();
  if (flags.get('debugMode')) setLogLevel('debug');
  else setLogLevel('info');

  const remoteKeys = new RemoteKeyService(platform);
  const focus = new FocusManager(remoteKeys);
  const lifecycle = new LifecycleManager();
  const vizbee = new VizbeeService();
  const router = new Router();

  setServices({
    config,
    flags,
    platform,
    remoteKeys,
    focus,
    lifecycle,
    vizbee,
    router,
  });

  // 3. Kick off platform readiness in parallel — don't block the first
  // paint on it. Vizio's awaitReady() can take up to 5s waiting for the
  // companion library, and on desktop dev it always times out. Nothing
  // in the initial UI render depends on platform globals (adapters use
  // optional chaining + fallback for any platform calls), so the user
  // sees the home screen immediately while platform-specific features
  // light up in the background.
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
}

// Uniform viewport scaling: design once at 1920x1080 and let CSS transform
// fit it to whatever the actual TV gives us — HD (1280x720), Full HD
// (1920x1080), 4K (most TV browsers still expose 1920x1080 logically and
// upscale in hardware). One layout source, every panel.
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
