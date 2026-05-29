using System;
using Windows.System;
using Windows.UI.Xaml;
using Windows.UI.Xaml.Controls;
using Windows.UI.Xaml.Input;
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
            // WebView2 on Xbox absorbs gamepad VirtualKeys as page-scroll input
            // (the visible scrollbar + "zoomed-in feel" are the symptom). Catch
            // KeyDown at the Page even when WebView2 has marked the event
            // handled, translate Gamepad keys to a synthetic KeyboardEvent in
            // the web app, and mark the original handled so the WebView2 stops
            // scrolling. RemoteKeyService listens to window.keydown, so this
            // restores all D-pad / A / B navigation in the sample app.
            this.AddHandler(
                UIElement.KeyDownEvent,
                new KeyEventHandler(OnPageKeyDown),
                handledEventsToo: true);
        }

        private async void MainPage_Loaded(object sender, Windows.UI.Xaml.RoutedEventArgs e)
        {
            // --autoplay-policy=no-user-gesture-required tells Chromium to let
            // <video> auto-play without a prior user gesture. Vizbee's mobile
            // cast lands the user on /player/{id} programmatically, so without
            // this flag PlayerPage's videoEl.play() is rejected by Chromium.
            //
            // WinUI 2.x's Microsoft.UI.Xaml.Controls.WebView2 doesn't expose
            // the EnsureCoreWebView2Async(CoreWebView2Environment) overload,
            // so we pass browser args via the documented process env var that
            // WebView2 reads when it spawns its browser process. MUST be set
            // before EnsureCoreWebView2Async() is awaited.
            // Browser flags read by WebView2 at process spawn:
            //  --autoplay-policy=no-user-gesture-required: allow PlayerPage's
            //    videoEl.play() to fire when the user lands via Vizbee deeplink
            //    (no prior tap/click on Xbox).
            //  --remote-debugging-port=9222: expose Chrome DevTools Protocol on
            //    that port so chrome://inspect on the Mac can attach to this
            //    WebView2 (live console, network, JS debugger). Dev-only — turn
            //    off in release builds (anyone on the LAN can attach).
            Environment.SetEnvironmentVariable(
                "WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS",
                "--autoplay-policy=no-user-gesture-required --remote-debugging-port=9222");

            await WebView.EnsureCoreWebView2Async();

            // WebView2 must hold focus for keydown events to flow through to
            // the AddHandler bridge installed in the constructor.
            WebView.Focus(FocusState.Programmatic);

            var core = WebView.CoreWebView2;
            if (core == null) return;

            // Gamepad/D-pad on Xbox produces standard keyboard events when
            // accelerator-key behaviour is enabled (D-pad → Arrow keys, A → Enter,
            // B → Esc/Back). Sample app's RemoteKeyService listens to keydown, so
            // this is all that's needed for navigation.
            core.Settings.IsZoomControlEnabled = false;
            core.Settings.AreDefaultContextMenusEnabled = false;
            core.Settings.AreDevToolsEnabled = true; // disable in production

            // BRIDGE PLACEHOLDER. If a future Vizbee SDK build needs Windows.*
            // APIs (network info, device id, advertising id, lifecycle), expose
            // them as a host object here:
            //   core.AddHostObjectToScript("vizbeeNative", new VizbeeBridge());
            // The JS side then reads window.chrome.webview.hostObjects.vizbeeNative.
            // The currently-recommended SDK build is WebView2-native and does
            // not need this; left documented for completeness.
        }

        // Map Xbox gamepad VirtualKeys to the standard keyboard equivalents
        // RemoteKeyService listens for. Fire-and-forget — ExecuteScriptAsync
        // is awaited internally; the synthesized event is delivered in the
        // next WebView2 tick which is fast enough for navigation.
        private void OnPageKeyDown(object sender, KeyRoutedEventArgs e)
        {
            string keyName;
            int keyCode;
            switch (e.Key)
            {
                case VirtualKey.GamepadDPadUp:    keyName = "ArrowUp";    keyCode = 38; break;
                case VirtualKey.GamepadDPadDown:  keyName = "ArrowDown";  keyCode = 40; break;
                case VirtualKey.GamepadDPadLeft:  keyName = "ArrowLeft";  keyCode = 37; break;
                case VirtualKey.GamepadDPadRight: keyName = "ArrowRight"; keyCode = 39; break;
                case VirtualKey.GamepadA:         keyName = "Enter";      keyCode = 13; break;
                case VirtualKey.GamepadB:         keyName = "Escape";     keyCode = 27; break;  // BACK
                case VirtualKey.GamepadView:      keyName = "Backspace";  keyCode = 8;  break;  // also BACK on some flows
                case VirtualKey.GamepadMenu:      keyName = "ContextMenu"; keyCode = 93; break;
                default: return;  // not a gamepad key we handle — let it fall through
            }

            var core = WebView?.CoreWebView2;
            if (core == null) return;

            // Build the JS that fires a synthetic keydown on window. The web
            // app's RemoteKeyService reads e.key first, falling back to keyCode,
            // so we set both — and we pass isTrusted via the constructor
            // (read-only at runtime, but constructed events look real enough
            // for plain listeners that don't check e.isTrusted).
            string js =
                "window.dispatchEvent(new KeyboardEvent('keydown', { " +
                $"key: '{keyName}', code: '{keyName}', " +
                $"keyCode: {keyCode}, which: {keyCode}, " +
                "bubbles: true, cancelable: true }));";
            _ = core.ExecuteScriptAsync(js);

            // Mark handled so WebView2 doesn't also use this key for its
            // built-in spatial scroll — that's what was causing the visible
            // scrollbar and the "zoomed in" feel.
            e.Handled = true;
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
