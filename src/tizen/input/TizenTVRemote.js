import TVRemoteEvent from "../../common/player/input/TVRemoteEvent";
import BaseTVRemote from "../../common/player/base/BaseTVRemote";

export default class TizenTVRemote extends BaseTVRemote {
    constructor() {
        super();
    }

    get keyCodeMap() {
        return {
            38: BaseTVRemote.keys.up,
            40: BaseTVRemote.keys.down,
            37: BaseTVRemote.keys.left,
            39: BaseTVRemote.keys.right,
            13: BaseTVRemote.keys.select,
            415: BaseTVRemote.keys.play,
            19: BaseTVRemote.keys.pause,
            413: BaseTVRemote.keys.stop,
            417: BaseTVRemote.keys.ffw,
            412: BaseTVRemote.keys.rw,
            10009: BaseTVRemote.keys.back,
            10182: BaseTVRemote.keys.exit,
            10252: BaseTVRemote.keys.play_pause
        };
    }
}