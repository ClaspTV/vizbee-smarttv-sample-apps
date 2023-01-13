import ExtendedPlatform from 'common/platform/ExtendedPlatform';
import HtmlPlayer from 'common/player/HtmlPlayer';
import VizioSmartcastTVRemote from 'viziosmartcast/input/VizioSmartcastTVRemote';

export default class VizioSmartcastPlatform extends ExtendedPlatform {

    constructor() {

        super();

        // create player
        this.createPlayer();

        // create input(TV remote here)
        this.createInputDevice();
    }

    createPlayer() {

        this.player = new HtmlPlayer(this);
        return this.player;
    }

    createInputDevice() {

        this.inputDevice = new VizioSmartcastTVRemote(this);
        return this.inputDevice;
    }

    exit() {
        if (window.VIZIO) {
            window.VIZIO.exitApplication();
        }
    }
}