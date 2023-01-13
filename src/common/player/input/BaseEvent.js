
/*
 * BaseEvent - class for action/status and its data.
 */

export default class BaseEvent {
	
	constructor(actionType, data) {
		
		this.type = actionType;
		this.data = data;
	}
	
}