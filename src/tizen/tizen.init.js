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

/**
 * This function is called from our sample application code.
 * It shows how to pass the listeners to the 
 * 
 * @param {*} avPlayerElement webaps.avplay object
 */
window.setAVPlayerListener = function(myAppScope, avPlayObject) {

    // Pass your listener object to  vizbee.wrapAVPlayerListener() so that 
    // they get called along with the Vizbee listeners.
    var listeners = {
        oncurrentplaytime: function (time) {

            myAppScope.updateTime(time);
            myAppScope.detectPause(time);
        },
        onerror: function (errorType) {

            myAppScope.onAvPlaybackEror(errorType);
        },
        onstreamcompleted: function () {

            myAppScope.setVideoIsEnded();
        }
    };

    // listener = avPlayObject.setListener(listener);

    // --------------------------------------------------------------------------------------------
    // In order for Vizbee to monitor the AVPlayer, vizbee requires a handle to AVPlayer listener. 
    // Before setting AVPlayer listener, wrap the listener by calling wrapAVPlayerListener
    // --------------------------------------------------------------------------------------------
    
    if(window.vizbee) {

        console.log("Tizen init - wrapping vizbee listeners");

        // wrap avplayer listener with vizbee avplayer listener
        const vzbInstance = window.vizbee.continuity.ContinuityContext.getInstance();
        let vzbPlayerAdapter = vzbInstance.getPlayerAdapter();
        avPlayObject.setListener(vzbPlayerAdapter.wrapListener(listeners));
    } else {

        console.log("Tizen init - NOT wrapping vizbee listeners");
        avPlayObject.setListener(listeners);    
    }
}