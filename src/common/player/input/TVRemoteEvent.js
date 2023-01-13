
export default class TVRemoteEvent {
    
    constructor(nativeEvent, source) {

        this.keyCode = source.keyCodeMap[nativeEvent.keyCode];
        this.keyName = source.keyNameMap[this.keyCode];

        this.nativeEvent = nativeEvent;
    }
}