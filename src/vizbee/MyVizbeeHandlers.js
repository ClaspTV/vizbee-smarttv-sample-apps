import MyVizbeeConverters from './MyVizbeeConverters';

export default class MyVizbeeHandlers {
  
    //-----------------------------------------------------------
    // Implement this 'deeplinkHandler' method for your application
    //-----------------------------------------------------------
  
    /**
     * This method is invoked when a deeplink is received from the mobile device.
     * Specifically, the deeplink is a command to start a specific video.
     *
     * @param { JSON object } videoInfo 
     *              - guid (string) video content id
     *              - title (string) video content title
     *              - imgUrl (string) video content imageUrl
     *              - isLive (string) video content type (LIVE or VOD)
     *              - videoUrl (string) video content url
     *              - subtitle (string) video content subtitle - optional
     *              - desc (string) video content description - optional
     */
    static deeplinkHandler(videoInfo) {
  
        var appVideoInfo = MyVizbeeConverters.fromVideoInfo(videoInfo);

        if(appVideoInfo) {

            var customEvent = new Event('ON_DEEPLINK');
            customEvent.data = appVideoInfo;
            window.dispatchEvent(customEvent);
        }
    }

    //-----------------------------------------------------------
    // Implement this 'signInHandler' method for your application IF REQUIRED
    //-----------------------------------------------------------
  
    /**
     * This handler can be used to handle signin events received from the mobile device.
     *
     * @param { vizbee.continuity.messages.VizbeeEvent } signInEvent 
     *              - type (string) event type = "tv.vizbee.homesign.signin"
     *              - data (object) object that has signin event data
     */
    static signInHandler(signInEvent) {
    
        // handle signin event
        //
        // "signInEvent": {
        //     "type": "tv.vizbee.homesign.signin",
        //     "data": {
        //     }
        //   }
        
    }
      
    //-----------------------------------------------------------
    // Implement this 'vizbeeEventHandler' method for your application IF REQUIRED
    //-----------------------------------------------------------

    /**
     * This handler can be used to handle custom events
     *
     * @param { vizbee.continuity.messages.VizbeeEvent } eventInfo
     *              - type (string) custom event namespace
     *              - data (object) custom event data
     */
    
    static vizbeeEventHandler(eventInfo) {
    }
  }