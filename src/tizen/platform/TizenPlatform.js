import ExtendedPlatform from '../../common/platform/ExtendedPlatform';
import TizenPlayer from '../player/TizenPlayer';
import TizenTVRemote from '../input/TizenTVRemote';

export default class TizenPlatform extends ExtendedPlatform {


    /**
     * Holds the player object
     */
    // player;

    /**
     * Holds the remote object instance
     */
    // inputDevice;

    /**
     * 
     * @param {*} platformConfig Tizen Platform requires config which contains the Video DOM Element.
     */
    constructor(platformConfig) {

        super();

        this.createPlayer(platformConfig);

        this.createInputDevice();
    }

    /**
     * Creates the platform specific player. In this case it is Tizen.
     * @param {*} platformConfig required by tizenPlayer to get hold of the DOM element.
     */
    createPlayer(platformConfig) {
        this.player = new TizenPlayer(this, platformConfig);
        return this.player;
    }

    /**
     * Creates the platform specific TV remote. In this case it is Tizen TV Remote.
     */
    createInputDevice() {
        let remote = new TizenTVRemote(this);
        this.inputDevice = remote;

        return remote;
    }

    exit() {
        window.close();
    }
}