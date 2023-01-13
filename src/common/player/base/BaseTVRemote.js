import TVRemoteEvent from "../input/TVRemoteEvent";

export default class BaseTVRemote {

    constructor() {
        this.registerListener();
    }

    static get keys() {
        return { up: 1, down: 2, left: 3, right: 4, select: 5, play: 6, pause: 7, stop: 8, ffw: 9, rw: 10, back: 11, exit: 12, play_pause: 13, alt_up: 14, alt_down: 15, alt_right: 16, alt_left: 17 };
    }

    get keyNameMap() {
        return { 1: "up", 2: "down", 3: "left", 4: "right", 5: "select", 6: "play", 7: "pause", 8: "stop", 9: "fast-forward", 10: "rewind", 11: "back", 12: "exit", 13: "play-pause", 14: "alt-up", 15: "alt-down", 16: "alt-right", 17: "alt-left" };
    }

    registerListener() {

        this._eventListeners = [];
        document.addEventListener('keydown', (e) => {
            this.dispatchOnEvent(new TVRemoteEvent(e, this));
        });
    }

    // Event (for all)
    set onEvent(fn) {

        if (typeof (fn) !== 'function') { return; }

        this._eventListeners.push(fn);
    }

    dispatchOnEvent(e) {

        // dispatch to generic event handlers
        for (var i = this._eventListeners.length - 1; i > -1; i--) {
            if (this._eventListeners[i](e)) {
                return;
            }
        }
    }
}