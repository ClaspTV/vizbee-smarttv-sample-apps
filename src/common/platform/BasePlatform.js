export default class BasePlatform {

    constructor() {

        console.log('BasePlatform::constructor()');
        this.player = undefined;
        this.inputDevice = undefined;
        
    }

    createPlayer() {
        throw new Error("BasePlatform::createPlayer() - Abstract method.");
    }

    createInputDevice() {
        throw new Error("BasePlatform::createInputDevice() - Abstract method.");
    }

    exit() {
        throw new Error("BasePlatform::exit() - Abstract method.");
    }
}