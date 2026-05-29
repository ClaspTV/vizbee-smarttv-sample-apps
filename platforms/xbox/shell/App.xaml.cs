using Windows.ApplicationModel;
using Windows.ApplicationModel.Activation;
using Windows.UI.ViewManagement;
using Windows.UI.Xaml;
using Windows.UI.Xaml.Controls;

namespace VizbeeSampleXbox
{
    /// <summary>
    /// UWP application entry point. Boots a Frame, navigates to MainPage (which
    /// hosts the WebView2), and forwards suspend/resume to it if needed.
    /// </summary>
    sealed partial class App : Application
    {
        public App()
        {
            this.InitializeComponent();
            // Xbox: by default UWP apps get a virtual gamepad cursor (right-stick
            // moves a mouse pointer overlay) so generic web apps can be clicked.
            // The sample app handles D-pad/A/B directly via keydown — opt out so
            // the cursor stays hidden and D-pad → Arrow keys, A → Enter, B → Esc.
            this.RequiresPointerMode = ApplicationRequiresPointerMode.WhenRequested;
            this.Suspending += OnSuspending;
        }

        protected override void OnLaunched(LaunchActivatedEventArgs e)
        {
            // Opt out of the Xbox 10% TV-safe-area inset BEFORE activation so the
            // WebView2 fills the full 1920×1080 surface. Calling this later (e.g.
            // in MainPage_Loaded) is too late — the OS has already letterboxed.
            ApplicationView.GetForCurrentView().SetDesiredBoundsMode(
                ApplicationViewBoundsMode.UseCoreWindow);

            Frame rootFrame = Window.Current.Content as Frame;
            if (rootFrame == null)
            {
                rootFrame = new Frame();
                Window.Current.Content = rootFrame;
            }

            if (e.PrelaunchActivated == false && rootFrame.Content == null)
            {
                rootFrame.Navigate(typeof(MainPage), e.Arguments);
            }

            Window.Current.Activate();
        }

        /// <summary>
        /// DIAL launch path — mobile/sender invokes the Xbox app remotely. The
        /// query string carries Vizbee deeplink params; we just pass it through
        /// to MainPage which can hand it off to the WebView2 once it's ready.
        /// </summary>
        protected override void OnActivated(IActivatedEventArgs args)
        {
            // Same safe-area opt-out as OnLaunched — DIAL activations can arrive
            // before any cold-launch, so this path needs the same setup.
            ApplicationView.GetForCurrentView().SetDesiredBoundsMode(
                ApplicationViewBoundsMode.UseCoreWindow);

            Frame rootFrame = Window.Current.Content as Frame;
            if (rootFrame == null)
            {
                rootFrame = new Frame();
                Window.Current.Content = rootFrame;
            }
            if (rootFrame.Content == null)
            {
                rootFrame.Navigate(typeof(MainPage), args);
            }
            Window.Current.Activate();
        }

        private void OnSuspending(object sender, SuspendingEventArgs e)
        {
            // UWP lifecycle suspend. If the hosted Vizbee SDK eventually needs
            // a suspend hook (e.g. flush analytics), bridge it through
            // CoreWebView2.AddHostObjectToScript in MainPage and call here.
        }
    }
}
