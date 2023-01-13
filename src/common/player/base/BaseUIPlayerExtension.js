
/*
 * BaseUIPlayerExtension - defines an abstract class for implementation by UI player extensions.
 */

// TODO: Need to check if all the apis are needed from this class ??
import BasePlayerExtension from './BasePlayerExtension';

export default class BaseUIPlayerExtension extends BasePlayerExtension {

    constructor(playerToExtend, extensionParams) {

        super(playerToExtend, extensionParams);

        this.playerScreenContainer = undefined;
        this.playerControlsContainer = undefined;
        this.playerOverlayContainer = undefined;

        this.setupUI();
    }

    setupUI() {

        // setup divs

        if (!this.doesExtendedPlayerHasUI()) {

            // add UI divs
            this.playerScreenContainer = document.getElementById("player-container");

            this.playerControlsContainer = document.createElement('div');
            this.playerControlsContainer.id = 'player-controls-' + this.constructor.name;
            this.playerControlsContainer.className = 'base-player-controls-container';

            this.myPlayerControlsContainer = document.createElement('div');
            this.myPlayerControlsContainer.id = 'my-player-controls-' + this.constructor.name;
            this.myPlayerControlsContainer.className = 'my-player-controls-container';
            this.playerControlsContainer.appendChild(this.myPlayerControlsContainer);

            this.playerScreenContainer.appendChild(this.playerControlsContainer);

            this.playerOverlayContainer = document.createElement('div');
            this.playerOverlayContainer.id = 'player-overlay-' + this.constructor.name;
            this.playerOverlayContainer.className = 'base-player-overlay-container';

            this.myPlayerOverlayContainer = document.createElement('div');
            this.myPlayerOverlayContainer.id = 'my-player-overlay-' + this.constructor.name;
            this.myPlayerOverlayContainer.className = 'my-player-overlay-container';
            this.playerOverlayContainer.appendChild(this.myPlayerOverlayContainer);

            this.playerScreenContainer.appendChild(this.playerOverlayContainer);

        } else {

            // get player screen container
            this.playerScreenContainer = this.extendedPlayer.playerScreenContainer;

            // extend player controls container
            this.playerControlsContainer = document.createElement('div');
            this.playerControlsContainer.id = 'player-controls-' + this.constructor.name;
            this.playerControlsContainer.className = 'extended-player-controls-container';

            this.myPlayerControlsContainer = document.createElement('div');
            this.myPlayerControlsContainer.id = 'my-player-controls-' + this.constructor.name;
            this.myPlayerControlsContainer.className = 'my-player-controls-container';
            this.playerControlsContainer.appendChild(this.myPlayerControlsContainer);

            this.lowerPlayerControlsContainer = this.playerScreenContainer.removeChild(this.extendedPlayer.playerControlsContainer);
            this.playerControlsContainer.appendChild(this.lowerPlayerControlsContainer);
            this.playerScreenContainer.appendChild(this.playerControlsContainer);

            // extend player overlay container
            this.playerOverlayContainer = document.createElement('div');
            this.playerOverlayContainer.id = 'player-overlay-' + this.constructor.name;
            this.playerOverlayContainer.className = 'extended-player-overlay-container';

            this.myPlayerOverlayContainer = document.createElement('div');
            this.myPlayerOverlayContainer.id = 'my-player-overlay-' + this.constructor.name;
            this.myPlayerOverlayContainer.className = 'my-player-overlay-container';
            this.playerOverlayContainer.appendChild(this.myPlayerOverlayContainer);

            this.lowerPlayerOverlayContainer = this.playerScreenContainer.removeChild(this.extendedPlayer.playerOverlayContainer);
            this.playerOverlayContainer.appendChild(this.lowerPlayerOverlayContainer);
            this.playerScreenContainer.appendChild(this.playerOverlayContainer);
        }

        // hide my divs by default
        this.hideMyPlayerControls();
        this.hideMyPlayerOverlay();
    }

    get basePlayerControlsContainer() {

        if (this.isExtendedPlayerBasePlayer()) {
            return this.playerControlsContainer;
        } else if (this.doesExtendedPlayerHasUI()) {
            return this.extendedPlayer.basePlayerControlsContainer;
        }
    }

    get basePlayerOverlayContainer() {

        if (this.isExtendedPlayerBasePlayer()) {
            return this.playerOverlayContainer;
        } else if (this.doesExtendedPlayerHasUI()) {
            return this.extendedPlayer.playerOverlayContainer;
        }
    }

    showPlayerScreen() {
        this.playerScreenContainer.className = 'player-showing';
    }

    hidePlayerScreen() {
        this.playerScreenContainer.className = 'player-hidden';
    }

    isPlayerScreenShowing() {
        if (this.playerScreenContainer.className.indexOf('player-hidden') != -1) {
            return false;
        }
        return true;
    }

    showPlayerControls() {
        this.playerControlsContainer.style.display = 'block';
    }

    hidePlayerControls() {
        this.playerControlsContainer.style.display = 'none';
    }

    showMyPlayerControls() {
        this.myPlayerControlsContainer.style.display = 'block';
    }

    hideMyPlayerControls() {
        this.myPlayerControlsContainer.style.display = 'none';
    }

    showPlayerOverlay() {
        this.playerOverlayContainer.style.display = 'block';
    }

    hidePlayerOverlay() {
        this.playerOverlayContainer.style.display = 'none';
    }

    showMyPlayerOverlay() {
        this.myPlayerOverlayContainer.style.display = 'block';
    }

    hideMyPlayerOverlay() {
        this.myPlayerOverlayContainer.style.display = 'none';
    }

    isMyPlayerOverlayVisible() {
        if (this.myPlayerOverlayContainer.style.display == 'none') {
            return false;
        }
        return true;
    }

    showExtendedUI() {
        if (this.doesExtendedPlayerHasUI()) {
            this.extendedPlayer.showPlayerOverlay();
            this.extendedPlayer.showPlayerControls();
        }
    }

    hideExtendedUI() {
        if (this.doesExtendedPlayerHasUI()) {
            this.extendedPlayer.hidePlayerControls();
            this.extendedPlayer.hidePlayerOverlay();
        }
    }

    showMyOverlayAndHideExtendedOverlays() {
        if (this.doesExtendedPlayerHasUI()) {
            this.extendedPlayer.hidePlayerOverlay();
        }
        this.showMyPlayerOverlay();
    }

    hideMyOverlayAndShowExtendedOverlays() {
        this.hideMyPlayerOverlay();
        if (this.doesExtendedPlayerHasUI()) {
            this.extendedPlayer.showPlayerOverlay();
        }
    }

    showMyOverlayAndHideExtendedUI() {
        this.hideExtendedUI();
        this.showMyPlayerOverlay();
    }

    hideMyOverlayAndShowExtendedUI() {
        this.hideMyPlayerOverlay();
        this.showExtendedUI();
    }

    doesExtendedPlayerHasUI() {
        return this.extendedPlayer instanceof BaseUIPlayerExtension;
    }

    reset() {
        if (this.doesExtendedPlayerHasUI()) {
            this.playerScreenContainer.appendChild(this.playerOverlayContainer.removeChild(this.lowerPlayerOverlayContainer));
            this.playerScreenContainer.appendChild(this.playerControlsContainer.removeChild(this.lowerPlayerControlsContainer));
        }
        this.playerScreenContainer.removeChild(this.playerOverlayContainer);
        this.playerScreenContainer.removeChild(this.playerControlsContainer);
        super.reset();
    }
}
