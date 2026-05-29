using System;
using Microsoft.Web.WebView2.Core;
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
            // Must go on the environment BEFORE EnsureCoreWebView2Async runs.
            var options = new CoreWebView2EnvironmentOptions
            {
                AdditionalBrowserArguments = "--autoplay-policy=no-user-gesture-required",
            };
            var env = await CoreWebView2Environment.CreateWithOptionsAsync(null, null, options);
            await WebView.EnsureCoreWebView2Async(env);

            // Pin the WebView's zoom to 1.0 — Chromium's last-used zoom can
            // persist per-origin across runs, manifesting as "the app is
            // zoomed in" the first time you launch after testing in dev tools.
            WebView.ZoomFactor = 1.0;

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
