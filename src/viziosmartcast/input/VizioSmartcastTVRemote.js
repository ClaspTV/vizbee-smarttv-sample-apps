
import BaseTVRemote from 'common/player/base/BaseTVRemote';

export default class VizioSmartcastTVRemote extends BaseTVRemote {

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
            417: BaseTVRemote.keys.ffw,
            418: BaseTVRemote.keys.skip_next,
            419: BaseTVRemote.keys.skip_prev,
            8: BaseTVRemote.keys.back,
            27: BaseTVRemote.keys.exit
        };
    }

}