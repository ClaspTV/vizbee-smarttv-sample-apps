import { ConfigService } from './config/ConfigService';
import { FeatureFlagService } from './feature-flags/FeatureFlagService';
import { VizbeeService } from './vizbee/VizbeeService';
import { HomeSSOService } from './homesso/HomeSSOService';
import { PlatformAdapter } from '@/core/platform/PlatformAdapter';
import { RemoteKeyService } from '@/core/input/RemoteKeyService';
import { FocusManager } from '@/core/navigation/FocusManager';
import { LifecycleManager } from '@/core/lifecycle/LifecycleManager';
import { Router } from '@/app/Router';

// Service Locator: one container holds the wired-up dependency graph.
// Pages/components ask the container for what they need rather than
// constructing services themselves. Easy to swap implementations under test
// (e.g. inject a fake VizbeeService) without touching call sites.
export interface Services {
  config: ConfigService;
  flags: FeatureFlagService;
  vizbee: VizbeeService;
  homeSSO: HomeSSOService;
  platform: PlatformAdapter;
  remoteKeys: RemoteKeyService;
  focus: FocusManager;
  lifecycle: LifecycleManager;
  router: Router;
}

let container: Services | null = null;

export function setServices(s: Services): void {
  container = s;
}

export function services(): Services {
  if (!container) {
    throw new Error('ServiceContainer not initialized; call setServices() first');
  }
  return container;
}
