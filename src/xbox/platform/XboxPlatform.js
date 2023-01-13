import ExtendedPlatform from 'common/platform/ExtendedPlatform';
import XboxPlayer from 'common/player/HtmlPlayer';
import XboxRemote from 'xbox/input/XboxRemote';

export default class XboxPlatform extends ExtendedPlatform {

    constructor() {

        super();

        // create player
        this.createPlayer();

        // create input(TV remote here)
        this.createInputDevice();
    }

    createPlayer() {

        this.player = new XboxPlayer(this);
        return this.player;
    }

    createInputDevice() {

        this.inputDevice = new XboxRemote(this);
        return this.inputDevice;
    }

    exit() {
        window.close();
    }
}