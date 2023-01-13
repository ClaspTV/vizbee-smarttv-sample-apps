import Platform from 'viziosmartcast/platform/VizioSmartcastPlatform';
import App from 'App';

// create a platform
let platform = new Platform();

let app = new App(platform);
document.addEventListener("VIZIO_LIBRARY_DID_LOAD", function () {
    app.init();
});