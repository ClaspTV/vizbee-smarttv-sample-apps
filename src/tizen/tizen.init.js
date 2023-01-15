import Platform from 'tizen/platform/TizenPlatform';
import App from 'App';

// create a platform
let platform = new Platform({
    videoElement: webapis.avplay
});

// add tizen specific key events.
if (tizen) {
    let usedKeys = [
        'MediaFastForward',
        'MediaPlayPause',
        'MediaPause',
        'MediaPlay',
        'MediaRewind',
        'MediaStop',
        '1'
    ];
    usedKeys.forEach(
        function (keyName) {
            tizen.tvinputdevice.registerKey(keyName);
        }
    );
}

let app = new App(platform);
app.init();