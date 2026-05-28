using Windows.ApplicationModel;
using Windows.ApplicationModel.Activation;
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
            this.Suspending += OnSuspending;
        }

        protected override void OnLaunched(LaunchActivatedEventArgs e)
        {
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
