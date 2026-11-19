#!/usr/bin/env node
/**
 * Cordova hook — patches MainActivity.java to intercept the Android BACK
 * button and dispatch it to the JavaScript layer instead of closing the Activity.
 *
 * Why this is needed:
 *   The app loads an external URL in the WebView. Cordova's standard
 *   backbutton event (fired via cordova.js) is unavailable on external pages.
 *   Without this patch, pressing BACK calls Activity.finish() immediately —
 *   bypassing the JS exit-confirm dialog on the Home page.
 *
 * What it does:
 *   Patches onBackPressed() in the generated MainActivity.java to call
 *   WebView.evaluateJavascript() and dispatch a synthetic KeyboardEvent
 *   (keyCode=4). The web app's RemoteKeyService maps keyCode 4 → 'BACK',
 *   routing through the existing per-page handlers.
 *
 * Usage:
 *   - Cordova runs this automatically after `cordova platform add android`.
 *   - scripts/build-firetv.sh re-runs it on every build (idempotent).
 */

'use strict';

const fs   = require('fs');
const path = require('path');

// JS snippet evaluated in the WebView page context.
// keyCode 4 = Android KEYCODE_BACK, mapped to 'BACK' in FIRETV_KEYS (keymaps.ts).
// Single quotes are used inside so the string embeds safely in a Java double-quoted literal.
const BACK_JS = "(function(){var e=new KeyboardEvent('keydown',{bubbles:true,cancelable:true,keyCode:4});window.dispatchEvent(e);})()";

const ON_BACK_PRESSED = `
    @Override
    public void onBackPressed() {
        // Dispatch synthetic keydown(4) to JS instead of closing the Activity.
        // The web app's FIRETV_KEYS keymap maps keyCode 4 to BACK, so existing
        // page handlers (exit dialog on Home, navigate-back in Player/Settings)
        // work without modification. Intentionally skips super.onBackPressed()
        // to prevent Activity.finish() here; the JS handler calls
        // window.VizbeeBridge.exit() when the user confirms exit.
        if (appView != null) {
            ((android.webkit.WebView) appView.getEngine().getView())
                .evaluateJavascript("${BACK_JS}", null);
        }
    }
`;

function applyOverride(projectRoot) {
  const mainActivityPath = path.join(
    projectRoot,
    'platforms', 'android', 'app', 'src', 'main',
    'java', 'com', 'vizbee', 'dev', 'samplewebapp', 'MainActivity.java',
  );

  if (!fs.existsSync(mainActivityPath)) {
    console.log('FireTV hook: MainActivity.java not found at', mainActivityPath, '— skipping.');
    return;
  }

  let src = fs.readFileSync(mainActivityPath, 'utf8');

  // Idempotency check — skip if already patched.
  if (src.includes('onBackPressed')) {
    console.log('FireTV hook: onBackPressed already present — skipping patch.');
    return;
  }

  // Insert the override before the last closing brace (end of the class body).
  src = src.replace(/\n}\s*$/, '\n' + ON_BACK_PRESSED + '\n}');

  fs.writeFileSync(mainActivityPath, src, 'utf8');
  console.log('FireTV hook: MainActivity.java back-button override applied.');
}

// --- Invocation modes ---

// 1. Called by Cordova as a hook (receives ctx object).
module.exports = function (ctx) {
  applyOverride(ctx.opts.projectRoot);
};

// 2. Called directly from build-firetv.sh: node override-back-button.js <projectRoot>
if (require.main === module) {
  const projectRoot = process.argv[2];
  if (!projectRoot) {
    console.error('Usage: node override-back-button.js <cordova-project-root>');
    process.exit(1);
  }
  applyOverride(projectRoot);
}
