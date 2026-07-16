import type { PlatformName } from './PlatformAdapter';
import type { FeatureFlags } from '@/services/feature-flags/flags';

export type AppBuild = FeatureFlags['appBuild']; // 'script' | 'npm'
export type NpmModule = FeatureFlags['npmModule']; // 'es5' | 'es6'

// Hosted layout (shared origin): <platform>/ = script build, <platform>-with-nodemodule/{es5,es6}/
// = npm builds. Same origin, so flags persist across a location.replace() between them.
const NPM_SUFFIX = '-with-nodemodule';

function isHostedPlatform(p: PlatformName): boolean {
  return p === 'webos' || p === 'tizen' || p === 'xbox';
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Build folder segment(s) for a selection: 'webos' or 'webos-with-nodemodule/es5'.
function folderFor(platform: PlatformName, appBuild: AppBuild, npmModule: NpmModule): string {
  return appBuild === 'script' ? platform : `${platform}${NPM_SUFFIX}/${npmModule}`;
}

// What's currently loaded, inferred from the URL path. null when the path isn't
// a recognized hosted build folder.
export function currentTarget(
  platform: PlatformName,
): { appBuild: AppBuild; npmModule: NpmModule } | null {
  if (!isHostedPlatform(platform)) return null;
  const { pathname } = window.location;
  const npm = new RegExp(`(^|/)${escapeRe(platform)}${NPM_SUFFIX}/(es5|es6)(/|$)`).exec(pathname);
  if (npm) return { appBuild: 'npm', npmModule: npm[2] as NpmModule };
  if (new RegExp(`(^|/)${escapeRe(platform)}(/|$)`).test(pathname)) {
    return { appBuild: 'script', npmModule: 'es5' };
  }
  return null;
}

// Which build the page is currently running (defaults to 'script' off-device).
export function currentBuild(platform: PlatformName): AppBuild {
  return currentTarget(platform)?.appBuild ?? 'script';
}

// Human-readable label for the build actually loaded (Settings → Device).
// 'dev' when running unhosted (desktop, vite preview at /).
export function buildLabel(platform: PlatformName): string {
  const t = currentTarget(platform);
  if (!t) return 'dev (unhosted)';
  return t.appBuild === 'script' ? 'Script' : `NPM · ${t.npmModule.toUpperCase()}`;
}

// URL for the desired selection, or null if not derivable (not a hosted
// webOS/Tizen path) or already on it.
export function targetUrl(
  platform: PlatformName,
  appBuild: AppBuild,
  npmModule: NpmModule,
): string | null {
  const cur = currentTarget(platform);
  if (!cur) return null;
  const sameModule = appBuild === 'script' || cur.npmModule === npmModule;
  if (cur.appBuild === appBuild && sameModule) return null; // already there

  const { pathname, origin, search, hash } = window.location;
  const desired = folderFor(platform, appBuild, npmModule);
  // Swap the current build folder segment(s) for the desired ones; the (^|/)…(/|$)
  // anchors keep `webos` from matching inside `webos-with-nodemodule`.
  const newPath =
    cur.appBuild === 'npm'
      ? pathname.replace(
          new RegExp(`(^|/)${escapeRe(platform)}${NPM_SUFFIX}/(es5|es6)(/|$)`),
          `$1${desired}$3`,
        )
      : pathname.replace(new RegExp(`(^|/)${escapeRe(platform)}(/|$)`), `$1${desired}$2`);

  if (newPath === pathname) return null;
  return `${origin}${newPath}${search}${hash}`;
}

// Boot-time: if the selection differs from what's loaded, hop to its URL.
// Returns true when a redirect was triggered (caller should stop booting).
export function redirectToSelectedBuild(
  platform: PlatformName,
  appBuild: AppBuild,
  npmModule: NpmModule,
): boolean {
  const url = targetUrl(platform, appBuild, npmModule);
  if (!url) return false;
  window.location.replace(url);
  return true;
}
