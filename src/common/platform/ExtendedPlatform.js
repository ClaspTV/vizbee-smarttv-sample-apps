import BasePlatform from './BasePlatform';

export default class ExtendedPlatform extends BasePlatform {

    constructor() {

        console.log("ExtendedPlatform::constructor()")
        super();

    }

    extendPlayer(extension, extensionParams) {

        console.log("ExtendedPlatform::extendPlayer() - creating new extension ", extension.name, ' with parameters ', extensionParams);
        this.player = new extension(this.player, extensionParams);
    }

    unextendPlayer() {

        try {
            if (this.player.extendedPlayer) {

                var childPlayer = this.player.extendedPlayer;
                // reset this extension so no listener is invoked any more
                this.player.reset(); // TODO: Need to check if we need to write reset on every extension ??
                this.player = childPlayer;
            }
        } catch (e) {
            console.error("Error while unextending Player", e, this.player, this.player.extendedPlayer);
        }
    }

    wrapExtension(extension, extensionParams) {

        console.log("ExtendedPlatform:wrapExtension::", extension.name);
        this.extendPlayer(extension, extensionParams);
    }

    unwrapExtensionToBasePlayer() {
        
        //unextend player until we get to the player without extensions.
        while (this.player.extendedPlayer) {
            this.unextendPlayer();
        }

        this.player.reset();
    }

}
