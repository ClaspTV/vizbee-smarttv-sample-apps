export default class EventTypes {

    static get PLAYBACK_COMMANDS() {

        return {

            get START() {
                return "start";
            },

            get PLAY() {
                return "play";
            },

            get PAUSE() {
                return "pause";
            },

            get STOP() {
                return "stop";
            },

            get REWIND() {
                return "rewind";
            },

            get SEEK() {
                return "seek";
            },

            get FAST_FORWARD() {
                return "fast-forward";
            },

            get PLAY_PAUSE() {
                return "play-pause";
            }
        }
    }

    static get KEY_COMMANDS() {

        return {

            get UP() {
                return "up";
            },

            get DOWN() {
                return "down";
            },

            get LEFT() {
                return "left";
            },

            get RIGHT() {
                return "right";
            },

            get SELECT() {
                return "select";
            },

            get BACK() {
                return "back";
            },

            get RESET() {
                return "reset";
            },

            get ALT_UP() {
                return "alt-up";
            },

            get ALT_DOWN() {
                return "alt-down";
            },

            get ALT_RIGHT() {
                return "alt-right";
            },

            get ALT_LEFT() {
                return "alt-left";
            }
        }
    }

    static get PLAYBACK_EVENTS() {

        return {

            get LOADING() {
                return "loading";
            },

            get CANPLAY() {
                return "canplay";
            },

            get PLAY() {
                return "play";
            },

            get PLAYING() {
                return "playing";
            },

            get PAUSED() {
                return "pause";
            },

            get SEEKING() {
                return "seeking";
            },

            get BUFFERING() {
                return "buffering";
            },

            get SEEKED() {
                return "seeked";
            },

            get TIME_UPDATE() {
                return "timeupdate";
            },

            get ENDED() {
                return "ended";
            },

            get ABORTED() {
                return "abort";
            },

            get ERROR() {
                return "error";
            }
        }
    }

    static get MOUSE_EVENTS() {

        return {

            get CLICK() {
                return "mouse-click";
            },

            get MOVE() {
                return "mouse-move";
            }
        }
    }
}