import { defineConfig, Plugin } from 'vite';
import { fileURLToPath, URL } from 'node:url';
import { readFileSync } from 'node:fs';

const APP_VERSION: string = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf8'),
).version;

// Per-platform builds. `vite build --mode <platform>` produces dist/<platform>/
// containing only that platform's adapter. The mode string is replaced inline
// in PlatformFactory's switch (via the __PLATFORM__ define), so unused adapter
// branches tree-shake away.
//
// Modes: 'viziosmartcast' | 'tizen' | 'webos' | 'xbox' | 'desktop'.
// `vite dev` defaults to mode 'development', which we map to 'desktop'.
//
// Target ES2017 for older TV browser engines (Tizen 5, webOS 4, Vizio
// SmartCast, Xbox Edge); newer engines work fine.
const PLATFORM_MODES = new Set(['viziosmartcast', 'tizen', 'webos', 'xbox', 'desktop']);
const VIZIO_COMPANION_LIB_URL = 'http://localhost:12345/scfs/cl/js/vizio-companion-lib.js';

// Inject the Vizio companion library <script> only into Vizio builds. The URL
// resolves on the TV's own loopback; on every other platform it would 404, so
// we omit it from the HTML entirely rather than gating at runtime.
function vizioCompanionScript(platform: string): Plugin {
  return {
    name: 'vizio-companion-script',
    transformIndexHtml(html) {
      if (platform !== 'viziosmartcast') return html;
      return html.replace(
        /<\/body>/,
        `    <script src="${VIZIO_COMPANION_LIB_URL}"></script>\n  </body>`,
      );
    },
  };
}

// Inject the Samsung Product API (window.webapis) loader only into Tizen builds.
// $WEBAPIS is resolved by the Tizen Web Runtime to the on-device library path.
// It's a classic (non-module) script so it executes before the deferred module
// bundle — window.webapis is ready by the time app code runs.
const TIZEN_WEBAPIS_SCRIPT =
  '<script type="text/javascript" src="$WEBAPIS/webapis/webapis.js"></script>';
function tizenWebapisScript(platform: string): Plugin {
  return {
    name: 'tizen-webapis-script',
    transformIndexHtml(html) {
      if (platform !== 'tizen') return html;
      return html.replace(/<head>/, `<head>\n    ${TIZEN_WEBAPIS_SCRIPT}`);
    },
  };
}

export default defineConfig(({ mode }) => {
  const platform = PLATFORM_MODES.has(mode) ? mode : 'desktop';
  // For the npm builds: the name of the bundled Vizbee SDK package to import
  // (set by the ship:<platform>:npm:<module> scripts). Empty for script builds,
  // which load the SDK via an external <script> at runtime instead.
  const sdkNpmPackage = process.env.VIZBEE_SDK_NPM_PACKAGE ?? '';

  return {
    base: './',
    // Build-time stamp so the running app can report which build it is (shown
    // in Settings → Device). Each per-folder build gets its own timestamp.
    define: {
      __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
      __SDK_NPM_PACKAGE__: JSON.stringify(sdkNpmPackage),
      __APP_VERSION__: JSON.stringify(APP_VERSION),
    },
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
        // PlatformFactory imports `@active-adapter`; we point it at the per-
        // platform shim so only one adapter is statically imported and the
        // others tree-shake out of the bundle entirely.
        '@active-adapter': fileURLToPath(
          new URL(`./src/core/platform/active/${platform}.ts`, import.meta.url),
        ),
      },
    },
    plugins: [vizioCompanionScript(platform), tizenWebapisScript(platform)],
    build: {
      target: 'es2017',
      outDir: `dist/${platform}`,
      assetsDir: 'assets',
      emptyOutDir: true,
      sourcemap: false,
      rollupOptions: {
        output: {
          // Predictable filenames help platform packagers reference them.
          entryFileNames: 'assets/[name].js',
          chunkFileNames: 'assets/[name].js',
          assetFileNames: 'assets/[name][extname]',
        },
      },
    },
    server: {
      host: true,
      port: 5173,
      // Leading dot allows the domain + all subdomains, so rotating
      // ngrok-free URLs work without editing this per session.
      allowedHosts: ['.ngrok-free.app'],
    },
    preview: {
      host: true,
      port: 4173,
      allowedHosts: ['.ngrok-free.app'],
    },
  };
});
