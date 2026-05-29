using System;
using Vizbee.Xbox;
using Windows.ApplicationModel;
using Windows.System;
using Windows.UI.Core;
using Windows.UI.Xaml;
using Windows.UI.Xaml.Controls;
using Windows.UI.Xaml.Navigation;

namespace VizbeeSampleXbox
{
    /// <summary>
    /// Hosts the WebView2 control that runs the Vizbee sample webapp. The
    /// hosted page is at https://d1a16fhfuhnwgt.cloudfront.net/xbox/ — same
    /// build that ships to tizen/webos, with the Xbox PlatformAdapter active.
    /// </summary>
    public sealed partial class MainPage : Page
    {
        public MainPage()
        {
            this.InitializeComponent();
            this.Loaded += MainPage_Loaded;
            // Subscribing to CoreWindow.KeyDown happens in MainPage_Loaded — by
            // that point Window.Current.CoreWindow is guaranteed to exist.
        }

        // Cached so CoreWindow_KeyDown can re-render the badge with the version
        // prefix + the last key press.
        private string _baseBadgeText = "";
        private int _keyEventCount = 0;

        private async void MainPage_Loaded(object sender, Windows.UI.Xaml.RoutedEventArgs e)
        {
            // Build-marker badge — generated from the package version baked
            // into THIS .msix by msbuild. If the user can't see this text on
            // the TV, whatever's running isn't from this build.
            var v = Package.Current.Id.Version;
            _baseBadgeText = $"build v{v.Major}.{v.Minor}.{v.Build}.{v.Revision}";
            VersionLabel.Text = _baseBadgeText;

            // The WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS env var was previously
            // set here, but XAML's <muxc:WebView2 Source="..."> kicks off
            // CoreWebView2 init at parse time — before MainPage_Loaded fires.
            // That made --remote-debugging-port silently no-op. It's now set
            // in App's constructor, ahead of InitializeComponent.

            // Hook CoreWindow.KeyDown — fires BEFORE WebView2's Win32 message
            // pump consumes gamepad input. Page-level AddHandler(KeyDownEvent)
            // didn't catch gamepad keys because WebView2 swallows them below
            // XAML routing. CoreWindow is the correct entry point.
            Window.Current.CoreWindow.KeyDown += CoreWindow_KeyDown;

            await WebView.EnsureCoreWebView2Async();
            WebView.Focus(FocusState.Programmatic);

            // Attach Vizbee's WinRT host-object bridge. This exposes the
            // Windows.Networking.Connectivity / Windows.System.Profile / etc.
            // APIs that the Xbox build of the Vizbee SDK calls via
            // window.Windows.* — APIs WebView2 doesn't expose natively. Same
            // pattern Fox+ uses; without this call the SDK silently fails on
            // init when it reaches for those APIs.
            await WebView2Bridge.AttachAsync(WebView);

            var core = WebView.CoreWebView2;
            if (core == null) return;

            // Gamepad/D-pad on Xbox produces standard keyboard events when
            // accelerator-key behaviour is enabled (D-pad → Arrow keys, A → Enter,
            // B → Esc/Back). Sample app's RemoteKeyService listens to keydown, so
            // this is all that's needed for navigation.
            core.Settings.IsZoomControlEnabled = false;
            core.Settings.AreDefaultContextMenusEnabled = false;
            core.Settings.AreDevToolsEnabled = true; // disable in production

            // Diagnostic overlay + scrollbar killer. Idempotent (re-running
            // does nothing if the overlay is already mounted) and injected via
            // BOTH mechanisms — AddScriptToExecuteOnDocumentCreatedAsync (for
            // future navigations) and NavigationCompleted (for the current
            // page). Belt-and-suspenders because AddScriptToExecute… is
            // unreliable for the initial load on WinUI 2.x WebView2.
            const string diagnosticScript = @"
                (function(){
                  if (window.__xboxDbgMounted) return;
                  window.__xboxDbgMounted = true;
                  function injectCss() {
                    if (document.getElementById('__xbox_dbg_css')) return;
                    var css = document.createElement('style');
                    css.id = '__xbox_dbg_css';
                    css.textContent =
                      'html,body{overflow:hidden!important;margin:0!important;padding:0!important;}' +
                      '*::-webkit-scrollbar{display:none!important;width:0!important;height:0!important;}' +
                      '*{scrollbar-width:none!important;}';
                    (document.head || document.documentElement).appendChild(css);
                  }
                  function mountOverlay() {
                    if (document.getElementById('__xbox_debug')) return;
                    var o = document.createElement('div');
                    o.id = '__xbox_debug';
                    o.style.cssText = 'position:fixed;top:0;left:0;background:rgba(0,0,0,0.65);color:#1ed679;font:13px Consolas,monospace;padding:6px 10px;z-index:2147483647;border-radius:0 0 6px 0;pointer-events:none;white-space:pre;';
                    var update = function() {
                      var d = document.documentElement;
                      var s = (window.services && window.services()) || null;
                      var pname = s && s.platform && s.platform.name || 'unknown';
                      var sdkVer = (window.VZB && window.VZB.VERSION) || '(not loaded)';
                      var homessoVer = (window.vizbee && window.vizbee.homesso && window.vizbee.homesso.VERSION) || '(not loaded)';
                      o.textContent =
                        'viewport: ' + window.innerWidth + 'x' + window.innerHeight + '\n' +
                        'dpr:      ' + window.devicePixelRatio + '\n' +
                        'doc-size: ' + d.scrollWidth + 'x' + d.scrollHeight + '\n' +
                        'platform: ' + pname + '\n' +
                        'VZB SDK:  ' + sdkVer + '\n' +
                        'HomeSSO:  ' + homessoVer + '\n' +
                        'last key: (waiting)';
                    };
                    window.__xboxDbgUpdate = function(kn) {
                      o.textContent = o.textContent.replace(/last key:.*/, 'last key: ' + kn);
                    };
                    window.addEventListener('resize', update);
                    window.addEventListener('keydown', function(ev) {
                      window.__xboxDbgUpdate(ev.key + ' (code=' + ev.keyCode + ')');
                    });
                    document.body.appendChild(o);
                    update();
                    // Re-update every 2s so SDK loads show up after they register.
                    setInterval(update, 2000);
                  }
                  function ready(fn){
                    if (document.body) fn();
                    else document.addEventListener('DOMContentLoaded', fn, { once: true });
                  }
                  ready(function(){ injectCss(); mountOverlay(); });
                })();
            ";

            // Mechanism A: register for all future navigations.
            await core.AddScriptToExecuteOnDocumentCreatedAsync(diagnosticScript);

            // Mechanism B: also inject after each navigation completes. The
            // script's `__xboxDbgMounted` guard makes re-runs a no-op, so
            // this is purely a safety net when (A) doesn't fire on first load.
            core.NavigationCompleted += async (s, args) =>
            {
                if (args.IsSuccess)
                {
                    try { await core.ExecuteScriptAsync(diagnosticScript); } catch { }
                }
            };

            // Navigate AFTER script registration so (A) fires on the initial
            // page load. (B) will also fire when this navigation completes.
            core.Navigate("https://d1a16fhfuhnwgt.cloudfront.net/xbox/index.html");

            // BRIDGE PLACEHOLDER. If a future Vizbee SDK build needs Windows.*
            // APIs (network info, device id, advertising id, lifecycle), expose
            // them as a host object here:
            //   core.AddHostObjectToScript("vizbeeNative", new VizbeeBridge());
            // The JS side then reads window.chrome.webview.hostObjects.vizbeeNative.
            // The currently-recommended SDK build is WebView2-native and does
            // not need this; left documented for completeness.
        }

        // Map Xbox gamepad VirtualKeys to the standard keyboard equivalents
        // RemoteKeyService listens for, and fire a synthetic JS KeyboardEvent
        // into the WebView2. Runs on CoreWindow.KeyDown so the event is
        // intercepted BEFORE WebView2's internal scroll handler sees it.
        private void CoreWindow_KeyDown(CoreWindow sender, KeyEventArgs args)
        {
            // Visible feedback that the handler fires AT ALL (independent of
            // whether the synthetic dispatch into JS works). Press D-pad on
            // the controller and watch the top-right badge change. If it
            // doesn't change, CoreWindow.KeyDown isn't firing for gamepad
            // input on this Xbox build — a platform-level limitation no
            // amount of code can route around from inside the app.
            _keyEventCount++;
            VersionLabel.Text = $"{_baseBadgeText}  #{_keyEventCount} {args.VirtualKey}";

            string keyName;
            int keyCode;
            switch (args.VirtualKey)
            {
                // D-pad — discrete, single fire per press.
                case VirtualKey.GamepadDPadUp:                keyName = "ArrowUp";    keyCode = 38; break;
                case VirtualKey.GamepadDPadDown:              keyName = "ArrowDown";  keyCode = 40; break;
                case VirtualKey.GamepadDPadLeft:              keyName = "ArrowLeft";  keyCode = 37; break;
                case VirtualKey.GamepadDPadRight:             keyName = "ArrowRight"; keyCode = 39; break;
                // Left analog stick — also routed as keyboard arrows so users
                // who navigate with the stick get the same behaviour as D-pad.
                // Xbox emits these repeatedly while the stick is deflected,
                // which is fine for menu navigation (acts like auto-repeat).
                case VirtualKey.GamepadLeftThumbstickUp:      keyName = "ArrowUp";    keyCode = 38; break;
                case VirtualKey.GamepadLeftThumbstickDown:    keyName = "ArrowDown";  keyCode = 40; break;
                case VirtualKey.GamepadLeftThumbstickLeft:    keyName = "ArrowLeft";  keyCode = 37; break;
                case VirtualKey.GamepadLeftThumbstickRight:   keyName = "ArrowRight"; keyCode = 39; break;
                // Face buttons.
                case VirtualKey.GamepadA:                     keyName = "Enter";      keyCode = 13; break;
                case VirtualKey.GamepadB:                     keyName = "Escape";     keyCode = 27; break;  // BACK
                case VirtualKey.GamepadView:                  keyName = "Backspace";  keyCode = 8;  break;
                case VirtualKey.GamepadMenu:                  keyName = "ContextMenu"; keyCode = 93; break;
                default: return;  // not a gamepad key we handle — let it fall through
            }

            var core = WebView?.CoreWebView2;
            if (core == null) return;

            // Synthetic window.keydown that RemoteKeyService picks up. Set both
            // `key` (string) and `keyCode` (numeric) so either lookup matches.
            string js =
                "window.dispatchEvent(new KeyboardEvent('keydown', { " +
                $"key: '{keyName}', code: '{keyName}', " +
                $"keyCode: {keyCode}, which: {keyCode}, " +
                "bubbles: true, cancelable: true }));";
            _ = core.ExecuteScriptAsync(js);

            // Mark handled so WebView2 doesn't also use this key for its
            // built-in spatial scroll — that's what was causing the visible
            // scrollbar and the "zoomed-in" feel.
            args.Handled = true;
        }

        protected override void OnNavigatedTo(NavigationEventArgs e)
        {
            // Parameter is either e.Arguments (launch) or IActivatedEventArgs
            // (DIAL/protocol activation). Vizbee sender invocations land here
            // — pass through to the web app via the URL fragment so the JS
            // bootstrap can pick it up. Implemented when the SDK contract is
            // finalised; for now we just rely on the SDK polling for the
            // standard DIAL launch URI on its own side.
            base.OnNavigatedTo(e);
        }
    }
}
