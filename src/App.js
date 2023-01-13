import ExtensionBuilder from 'common/loader/ExtensionBuilder';
import BaseEvent from 'common/player/input/BaseEvent';
import EventTypes from 'common/player/input/EventTypes';

import MyVizbeeHandlers from 'vizbee/MyVizbeeHandlers';

let instance;
export default class App {

    constructor(platform) {
        
        // Singleton class to hold bookmarked movies
        if(instance){
            return instance;
        }

        this.platform = platform;
        this.appReady = false;

        // register vizbee
        this.registerVizbee();

        instance = this;
        return instance;
    }

    init() {

        this.loadExtensions();

        // add TV remote key events
        this.addKeyEventListeners();

        // app's deeplink
        this.registerForDeeplinkVideo();
        
        this.appReady = true;

        this.initVizbee();
    }

    loadExtensions() {

        let extensionBuilder = new ExtensionBuilder();
        extensionBuilder.loadExtensions(this.platform);
    }

    addKeyEventListeners() {

        let self = this;
        // add remote key listeners
        // should be called only after all extensions are being wrapped
        self.platform.inputDevice.onEvent = function (event) {

            console.log("Platform OnEvent::", event, self.platform.player);
            var seekOffset = 15000, // in milliseconds
                millisecondsMultiplier = 1000;

            switch (event.keyName) {

                case 'right':
                case 'left':
                case 'down':
                case 'up':
                case 'back':
                case 'alt-up':
                case 'alt-down':
                case 'alt-right':
                case 'alt-left':
                    event.nativeEvent.preventDefault();
                    self.platform.player.doAction(new BaseEvent(event.keyName));
                    break;

                case 'select':
                case 'play':
                case 'pause':
                case 'stop':
                case 'play-pause':
                    self.platform.player.doAction(new BaseEvent(event.keyName));
                    break;

                case 'rewind':
                    let seekTime = self.platform.player.currentTime() * millisecondsMultiplier - seekOffset;
                    if (seekTime < 0) {
                        seekTime = 0;
                    }

                    self.platform.player.doAction(new BaseEvent(event.keyName, { seek: seekTime }));
                    break;

                case 'fast-forward':
                    seekTime = self.platform.player.currentTime() * millisecondsMultiplier + seekOffset;
                    self.platform.player.doAction(new BaseEvent(event.keyName, { seek: seekTime }));
                    break;

                default:
                //do nothing - ignore all other key commands
            }
        }
    }

    registerForDeeplinkVideo() {
        
        window.addEventListener('ON_DEEPLINK', (deeplinkEvent) => {
            if(deeplinkEvent && deeplinkEvent.data) {
                this.platform.player.doAction(new BaseEvent(EventTypes.PLAYBACK_COMMANDS.START, deeplinkEvent.data));
            } else {
                console.log("App::ON_DEEPLINK - INVALID deeplink data");
            }
        });
    }

    // --------------------
    // Vizbee Integration
    // --------------------

    registerVizbee() {

        // ensure that the app sets this handler on the window before loading the Vizbee SDK.
        window.addEventListener('VIZBEE_SDK_READY', () => {
            this.initVizbee();
        });
    }

    initVizbee() {

        if (window.vizbee && this.appReady) {

            // initialize the Vizbee SmartTV SDK in your app
            // replace vzb******* with Vizbee appID assigned for your app
            
            let vzbInstance = vizbee.continuity.ContinuityContext.getInstance();
            vzbInstance.start('vzb2000001');

            // set deeplink handler
            let appAdapter = vzbInstance.getAppAdapter();
            appAdapter.setDeeplinkHandler(MyVizbeeHandlers.deeplinkHandler);
        }
    }
}