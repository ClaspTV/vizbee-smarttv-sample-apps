
import BaseTVRemote from 'common/player/base/BaseTVRemote';

export default class XboxRemote extends BaseTVRemote {

    constructor() {
        super();
    }

    get keyCodeMap() {
        return {

            // TODO: Enable the below code
            // format - keycode: BaseTVRemote.keys.<key>
            203: BaseTVRemote.keys.up,
            204: BaseTVRemote.keys.down,
            205: BaseTVRemote.keys.left,
            206: BaseTVRemote.keys.right,
            195: BaseTVRemote.keys.select,
            197: BaseTVRemote.keys.play_pause,
            196: BaseTVRemote.keys.back,
            202: BaseTVRemote.keys.ffw,
            201: BaseTVRemote.keys.rw,

            211: BaseTVRemote.keys.alt_up,
            212: BaseTVRemote.keys.alt_down,
            213: BaseTVRemote.keys.alt_right,
            214: BaseTVRemote.keys.alt_left,
        };
    }

}

// REFERENCE:
// A - 195
// X - 197
// Y - 198
// B - 196

// menu - 207
// windows 208

// BUTTONS
// right - 206
// left - 205
// up - 203
// down - 204

// GAMEPAD
// right - 217
// left - 218
// up - 215
// down - 216

// GAMEPAD THUMB STICK
// right - 213
// left - 214
// up - 211
// down - 212

// BUMPER
// right - 202
// left - 201