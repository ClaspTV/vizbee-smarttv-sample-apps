
import HtmlPlayer from "common/player/HtmlPlayer";

export default class LGWebOSHtmlPlayer extends HtmlPlayer {

    constructor(platform) {
        super(platform);
    }

    //-------------------
    // Event Handlers
    //-------------------

    onEventHandler(e) {

        switch (e.type) {

            case EventTypes.PLAYBACK_EVENTS.CANPLAY:
                this.canPlayHandler(e);
                break;

            case EventTypes.PLAYBACK_EVENTS.PLAY:
                this.playHandler(e);
                break;

            default:
                super.onEventHandler(e);
                break;
        }
    }

    // IMPORTANT:
    // LGWebOS semms to throw a "loading" event every time it refetches the manifest.
    // We need to ignore the loading event if its a live video.

    loadingHandler(e) {
        if (this.videoInfo.isLive) {
            // do nothing
        } else {
            super.loadingHandler(e);
        }
    }

    // LGWebOS v1.0 has a bug in seeking during start of video.
    // The seek with currentTime=X has to be set after the
    // play event and not after the canplay event.
    //
    // See - http://developer.lge.com/community/forums/RetrieveForumContent.dev?detailContsId=FC22155032

    canPlayHandler(e) {
        if (!this.startedPlaying) {
            if(!this.bypassCanPlay) {
                this.playerElement.play(true);
                this.startedPlaying = true;
            }
        }
    }

    playHandler(e) {

        super.playHandler(e);

        if (this.videoInfo.startTime == null) {
            this.videoInfo.startTime = 0;
        }
        var time = this.videoInfo.startTime / 1000;
        if (!this.finishedStartSeek && !(time == 0)) {
            try {
                var that = this;
                setTimeout(function(){
                    that.finishedStartSeek = true;
                    that.playerElement.currentTime = time;
                },1000);
            } catch (e) {
                console.log("LGHtmlPlayer::start::canplay - Error setting start time for video", e);
            }
        }
    }

}
