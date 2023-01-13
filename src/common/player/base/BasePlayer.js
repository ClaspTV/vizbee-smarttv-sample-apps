/*
* BasePlayer class, can be decorated by extending PlayerDecorator.
* must be implemented by platform player adapter. must be constructed after
* window.onload.
*/

import BasePlatform from 'common/platform/BasePlatform';

export default class BasePlayer {

    constructor(platform) {

        // TODO: Are we using the platform in this class ??
        console.log("BasePlayer::constructor() platform =", platform);

        if (this.constructor.name === 'BasePlayer') {
            throw new Error('BasePlayer::constructor() -- Abstract class.');
        }

        this.platformConfig = undefined;
        this.videoInfo = undefined;
        
        if(platform && platform.platformConfig) {
            this.platformConfig = platform.platformConfig;
        }
        
        this.resetListeners();
    }

    //---------------------
    // BasePlayer events
    //---------------------

    // Event (for all)
    set onEvent(fn) {

        if (typeof (fn) !== 'function') { return; }

        this._eventListeners.push(fn);
    }

    dispatchOnEvent(statusEvent) {

        // dispatch to generic event handlers
        for (var i = this._eventListeners.length - 1; i > -1; i--) {
            if (this._eventListeners[i](statusEvent)) {
                return;
            }
        }
    }


    //---------------------
    // BasePlayer methods
    //---------------------

    doAction(actionEvent) {

        throw new Error('BasePlayer::doAction() - Abstract method.');
    }

    start(videoInfo) {
        this.videoInfo = videoInfo;
    }

    // Reset only resets the player to initial state for continued usage
    reset() {
        this.resetListeners();
    }

    resetListeners() {
        // listener for all events
        this._eventListeners = [];
    }
}
