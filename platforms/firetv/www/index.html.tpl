<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Vizbee Sample App</title>

  <!--
    cordova.js is served from the local www/ by the Cordova WebView runtime.
    It fires the deviceready event once all plugins (including vizbee-bridge)
    are fully initialized.

    After window.location.replace(APP_URL) the WebView navigates to the hosted
    sample webapp. window.VizbeeBridge remains available on that page because
    it was registered via WebView.addJavascriptInterface on the WebView instance
    itself — not scoped to a particular URL or origin.
  -->
  <script src="cordova.js"></script>

  <style>
    html, body { margin: 0; padding: 0; background: #000; }
    #status {
      position: fixed;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: sans-serif;
      font-size: 1.5rem;
      color: #fff;
    }
    #status.error { color: #f55; }
  </style>
</head>
<body>
  <div id="status">Loading&hellip;</div>

  <script>
    // APP_URL is replaced at build time by scripts/build-firetv.sh.
    // The placeholder below is substituted with $FIRETV_APP_URL.
    var APP_URL = '%%FIRETV_APP_URL%%';

    document.addEventListener('deviceready', function () {
      var status = document.getElementById('status');

      if (!APP_URL || APP_URL.indexOf('%%') === 0) {
        status.className = 'error';
        status.textContent =
          'FIRETV_APP_URL is not configured. ' +
          'Set it before running scripts/build-firetv.sh. ' +
          'See platforms/firetv/README.md.';
        return;
      }

      // Redirect the WebView to the hosted sample webapp.
      window.location.replace(APP_URL);
    }, false);
  </script>
</body>
</html>
