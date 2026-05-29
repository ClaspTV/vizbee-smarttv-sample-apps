using System;
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

        private async void MainPage_Loaded(object sender, Windows.UI.Xaml.RoutedEventArgs e)
        {
            // Build-marker badge — generated from the package version baked
            // into THIS .msix by msbuild. If the user can't see this text on
            // the TV, whatever's running isn't from this build.
            var v = Package.Current.Id.Version;
            VersionLabel.Text = $"build v{v.Major}.{v.Minor}.{v.Build}.{v.Revision}";

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
        // RemoteKeyService listens for, and fire a synthetic JS KeyboardEvent
        // into the WebView2. Runs on CoreWindow.KeyDown so the event is
        // intercepted BEFORE WebView2's internal scroll handler sees it.
        private void CoreWindow_KeyDown(CoreWindow sender, KeyEventArgs args)
        {
            string keyName;
            int keyCode;
            switch (args.VirtualKey)
            {
                case VirtualKey.GamepadDPadUp:    keyName = "ArrowUp";    keyCode = 38; break;
                case VirtualKey.GamepadDPadDown:  keyName = "ArrowDown";  keyCode = 40; break;
                case VirtualKey.GamepadDPadLeft:  keyName = "ArrowLeft";  keyCode = 37; break;
                case VirtualKey.GamepadDPadRight: keyName = "ArrowRight"; keyCode = 39; break;
                case VirtualKey.GamepadA:         keyName = "Enter";      keyCode = 13; break;
                case VirtualKey.GamepadB:         keyName = "Escape";     keyCode = 27; break;  // BACK
                case VirtualKey.GamepadView:      keyName = "Backspace";  keyCode = 8;  break;
                case VirtualKey.GamepadMenu:      keyName = "ContextMenu"; keyCode = 93; break;
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
