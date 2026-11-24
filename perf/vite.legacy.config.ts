/**
 * Perf-only build for old TV engines (2019 Samsung Tizen 5.0 = Chromium 63):
 * the app config, lowered to chrome63 and as one bundle, without the app's
 * @vitejs/plugin-legacy (its modern/legacy split half-runs the modern bundle on
 * Chromium 63 and the app stops before boot completes). Code splitting makes
 * Vite's preload helper use `import.meta` (Chrome 64+), a parse error there.
 * perf/lib/build.js also injects ES2019 polyfills. Used for every Tizen case,
 * so it cancels in the costs.
 */
import { defineConfig, mergeConfig, type Plugin, type PluginOption, type UserConfig } from 'vite';
import appConfig from '../vite.config';

/** Relative-base preload helper still emits `import.meta.url`; the page URL is equivalent. */
const noImportMeta: Plugin = {
  name: 'perf-no-import-meta',
  enforce: 'post',
  renderChunk(code) {
    return code.includes('import.meta.url') ? code.split('import.meta.url').join('document.baseURI') : null;
  },
};

/** Drop @vitejs/plugin-legacy (plugin names start with "vite:legacy"). */
function withoutLegacy(plugins: PluginOption[] | undefined): PluginOption[] {
  const flat = (plugins ?? []).flat(Infinity as 1) as PluginOption[];
  return flat.filter((p) => !(p && typeof p === 'object' && 'name' in p && String((p as Plugin).name).startsWith('vite:legacy')));
}

export default defineConfig((env) => {
  const base = (typeof appConfig === 'function' ? appConfig(env) : appConfig) as UserConfig;
  // PERF_SDK_DIR=<SDK repo>/dist/npm swaps the npm @vizbeetv/sdk for a local SDK
  // build (e.g. a branch under test) without touching package.json/node_modules.
  // Only the package under test is swapped (the app references every variant).
  const sdkDir = process.env.PERF_SDK_DIR;
  const pkg = process.env.VIZBEE_SDK_NPM_PACKAGE ?? '';
  const sub = pkg.startsWith('@vizbeetv/sdk/') ? pkg.slice('@vizbeetv/sdk/'.length) : '';
  const alias =
    sdkDir && sub
      ? [{ find: new RegExp(`^${pkg.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}$`), replacement: `${sdkDir.replace(/\/$/, '')}/${sub}/index.js` }]
      : [];
  return mergeConfig(
    { ...base, plugins: withoutLegacy(base.plugins) },
    {
      resolve: { alias },
      plugins: [noImportMeta],
      build: {
        target: 'chrome63',
        modulePreload: false,
        rollupOptions: { output: { inlineDynamicImports: true } },
      },
    },
  );
});
