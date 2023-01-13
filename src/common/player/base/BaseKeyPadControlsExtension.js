
/*
 * BaseKeyPadControlsExtension - defines an abstract UI player with support for keypad controls.
 */

import BaseUIPlayerExtension from './BaseUIPlayerExtension';
import EventTypes from 'common/player/input/EventTypes';

export default class BaseKeyPadControlsExtension extends BaseUIPlayerExtension {

    constructor(playerToExtend, extensionParams) {
        super(playerToExtend, extensionParams);
    }

    doAction(actionEvent) {

        switch (actionEvent.type) {

            case EventTypes.KEY_COMMANDS.LEFT:
            case EventTypes.KEY_COMMANDS.RIGHT:
            case EventTypes.KEY_COMMANDS.UP:
            case EventTypes.KEY_COMMANDS.DOWN:
            case EventTypes.KEY_COMMANDS.BACK:
            case EventTypes.KEY_COMMANDS.SELECT:
            case EventTypes.KEY_COMMANDS.ALT_LEFT:
            case EventTypes.KEY_COMMANDS.ALT_RIGHT:
            case EventTypes.KEY_COMMANDS.ALT_UP:
            case EventTypes.KEY_COMMANDS.ALT_DOWN:
                if (this.canExtendedPlayerHandleKeyPad()) {
                    this.extendedPlayer.doAction(actionEvent);
                }
                break;

            default:
                super.doAction(actionEvent);
                break;
        }
    }

    canExtendedPlayerHandleKeyPad() {
        return (this.extendedPlayer instanceof BaseKeyPadControlsExtension);
    }

}
