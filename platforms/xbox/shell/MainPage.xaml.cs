using System;
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
            Environment.SetEnvironmentVariable(
                "WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS",
                "--autoplay-policy=no-user-gesture-required");

            await WebView.EnsureCoreWebView2Async();

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
