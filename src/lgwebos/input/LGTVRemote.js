
import BaseTVRemote from 'common/player/base/BaseTVRemote';

export default class LGTVRemote extends BaseTVRemote {

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
            461: BaseTVRemote.keys.back,
            1000: BaseTVRemote.keys.exit // not sure? mapped to "portal"
        };
    }

}
