import Platform from 'xbox/platform/XboxPlatform';
import App from 'App';

// create a platform
let platform = new Platform();

// ensure that your app takes the full screen size using following code
var applicationView = Windows.UI.ViewManagement.ApplicationView.getForCurrentView();
applicationView.setDesiredBoundsMode(Windows.UI.ViewManagement.ApplicationViewBoundsMode.useCoreWindow);

// disable mouse and enable keyboard(gampad) for navigation
navigator.gamepadInputEmulation = "keyboard";

let app = new App(platform);
app.init();