import ExtendedPlatform from 'common/platform/ExtendedPlatform';
import LGPlayer from 'lgwebos/player/LGPlayer';
import LGTVRemote from 'lgwebos/input/LGTVRemote';

export default class LGPlatform extends ExtendedPlatform {

    constructor() {

        super();

        // create player
        this.createPlayer();

        // create input(TV remote here)
        this.createInputDevice();
    }

    createPlayer() {

        this.player = new LGPlayer(this);
        return this.player;
    }

    createInputDevice() {

        this.inputDevice = new LGTVRemote(this);
        return this.inputDevice;
    }

    exit() {
        window.close();
    }
}