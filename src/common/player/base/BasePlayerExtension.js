
/*
 * BasePlayerExtension - defines an abstract class for impelmentation by player extensions.
 *                       extendPlayer() will be invoked starting from the least nested player
 *                       component to the most.
 */

import BasePlayer from './BasePlayer';

export default class BasePlayerExtension extends BasePlayer {

    constructor(playerToExtend, extensionParams) {

        if (!(playerToExtend instanceof BasePlayer)) {
            throw new TypeError('BasePlayerExtension::constructor() - playerToExtend must be instance of BasePlayer.');
        }

        super(playerToExtend.platform);
        this.extendedPlayer = playerToExtend;
        this.parentExtension = null;

        if (!this.isExtendedPlayerBasePlayer()) {
            this.extendedPlayer.parentExtension = this;
        }

        // add event listeners to extended player
        this.extendedPlayer.onEvent = (e) => {
            this.onEventHandler.call(this, e);
        }

    }

    /*
     * basePlayer() getter, accessor to bottom most extended player.
     */
    get basePlayer() {
        if (this.isExtendedPlayerBasePlayer()) {
            return this.extendedPlayer;
        } else if (this.extendedPlayer instanceof BasePlayerExtension) {
            return this.extendedPlayer.basePlayer;
        }
    }

    get parentPlayer() {
        return this.parentExtension;
    }

    //--------------------
    // BasePlayer events
    //--------------------

    // Event (for all)
    onEventHandler(e) {
        this.dispatchOnEvent.call(this, e);
    }

    //---------------------
    // BasePlayer methods
    //---------------------

    doAction(actionEvent) {
        return this.extendedPlayer.doAction(actionEvent);
    }
    
    currentTime() {
        return this.extendedPlayer.currentTime();
    }

    getDuration() {
        return this.extendedPlayer.getDuration();
    }

    isExtendedPlayerBasePlayer() {
        return (this.extendedPlayer instanceof BasePlayer && !(this.extendedPlayer instanceof BasePlayerExtension));
    }
}
