
import BasePlayer from './base/BasePlayer';
import EventTypes from './input/EventTypes';
import BaseEvent from './input/BaseEvent';

export default class HtmlPlayer extends BasePlayer {

    constructor(platform) {

        super(platform);

        this.playerElement = document.getElementById("video-element");

        // NOTE:
        // for logging we track all events EXCEPT progress, timeupdate and suspend
        // -- progress and timeupdate are sent too often
        // -- suspend is also sent too often for mp4 videos when the video is being downloaded??

        this.logEvents = ["abort", "canplay", "canplaythrough", "durationchange", "emptied", "ended", "loadeddata", "loadedmetadata", "loadstart", "pause", "play", "playing", "ratechange", "seeked", "seeking", "stalled", "volumechange", "waiting"];

        // don't add "emptied" or "loadstart" here
        // emptied and loadstart events are called even if src is set to empty
        this.loadingEvents = ["loadeddata", "loadedmetadata", "durationchange"];

        // all playback events that are to be handled
        this.playbackEvents = ["canplay", "play",  "playing", "pause", "seeking", "timeupdate", "ended", "error", "abort"];

        if (!this.eventListenersSet) {
            this.registerEventHandlers();
            this.eventListenersSet = true;
        }

        this.configurePlayerElement();

        this.startedPlaying = false;
        this.finishedStartSeek = false;
        this.bypassCanPlay = false;
        this.isVideoEnded = false;
    }

    //-------------------
    // Event Handlers
    //-------------------

    registerEventHandlers() {

        console.log("HtmlPlayer::registerEventHandlers called", this, this.playerElement);

        var that = this;

        // add logging event handler
        this.logEvents.forEach(function (evt, index, array) {
            that.playerElement.addEventListener(evt, (e) => that.defaultLogHandler.call(that, e), false);
        });

        // add loading handler
        this.loadingEvents.forEach(function (evt, index, array) {
            that.playerElement.addEventListener(evt, (e) => that.loadingHandler.call(that, e), false);
        });

        // add playback events handler
        this.playbackEvents.forEach(function (evt, index, array) {
            that.playerElement.addEventListener(evt, (e) => that.eventHandler.call(that, e), false);
        });
    }

    unregisterEventHandlers() {

        console.log("HtmlPlayer::unregisterEventHandlers called");

        var that = this;

        // remove logging event handler
        this.logEvents.forEach(function (evt, index, array) {
            that.playerElement.removeEventListener(evt, that.defaultLogHandler);
        });

        // remove loading handler
        this.loadingEvents.forEach(function (evt, index, array) {
            that.playerElement.removeEventListener(evt, that.loadingHandler);
        });

        // remove plaback events handler
        this.playbackEvents.forEach(function (evt, index, array) {
            that.playerElement.removeEventListener(evt, that.loadingHandler);
        });
    }

    defaultLogHandler(e) {

        console.log("HtmlPlayer::defaultLogHandler::" + e.type + " -- ", e, this.currentSrc, this.getDuration(), this.currentTime(), this);
        console.log("---------------------");
        console.log("readyState", this.playerElement.readyState);
        console.log("---------------------");
    }

    loadingHandler(e) {

        this.isVideoEnded = false;
        let statusEvent = new BaseEvent();
        statusEvent.type = EventTypes.PLAYBACK_EVENTS.LOADING;
        statusEvent.data = this.videoInfo;
        this.dispatchOnEvent(statusEvent);
    }

    eventHandler(e) {

        console.log("HTMLPlayer::", e);
        switch (e.type) {

            case EventTypes.PLAYBACK_EVENTS.CANPLAY:
                this.isVideoEnded = false;
                this.canPlayHandler();
                this.dispatchOnEvent(e);
                break;

            case EventTypes.PLAYBACK_EVENTS.PLAY:
                this.isVideoEnded = false;
                this.playHandler();
                break;

            case EventTypes.PLAYBACK_EVENTS.LOADING:
            case EventTypes.PLAYBACK_EVENTS.PLAYING:
            case EventTypes.PLAYBACK_EVENTS.PAUSED:
            case EventTypes.PLAYBACK_EVENTS.TIME_UPDATE:
                this.isVideoEnded = false;
                this.dispatchOnEvent(e);
                break;

            case EventTypes.PLAYBACK_EVENTS.SEEKING:
                this.isVideoEnded = false;
                let statusEvent = new BaseEvent(EventTypes.PLAYBACK_EVENTS.BUFFERING);
                this.dispatchOnEvent(statusEvent);
                break;

            case EventTypes.PLAYBACK_EVENTS.ERROR:
                this.logVideoError(e);
                this.isVideoEnded = true;
                this.dispatchOnEvent(e);
                break;

            case EventTypes.PLAYBACK_EVENTS.ENDED:
                this.isVideoEnded = true;
                this.dispatchOnEvent(e);
                break;

        }
    }

    canPlayHandler() {

        if (!this.startedPlaying) {

            if (!this.videoInfo || !this.videoInfo.startTime) {
                this.videoInfo = this.videoInfo || {};
                this.videoInfo.startTime = 0;
            }

            var time = this.videoInfo.startTime / 1000;
            console.log("HtmlPlayer::canPlayHandler() - starttime = " + time);

            if (!this.finishedStartSeek && !(time == 0)) {

                try {
                    console.log("HtmlPlayer::canPlayHandler() - seeking to start time = ", time);
                    this.finishedStartSeek = true;
                    this.playerElement.currentTime = time || 0;
                } catch (e) {
                    console.log("HtmlPlayer::canPlayHandler() - Error setting start time for video", e);
                }
            }

            if (!this.bypassCanPlay) {
                this.playerElement.play(true);
                this.startedPlaying = true;
            }
        }
    }

    playHandler() {
        
        let statusEvent = new BaseEvent();
        statusEvent.type = EventTypes.PLAYBACK_EVENTS.PLAYING;
        statusEvent.data = this.videoInfo;
        this.dispatchOnEvent(statusEvent);
    }

    //------------------
    // Player commands
    //------------------

    doAction(actionEvent) {

        console.log("HtmlPlayer::", actionEvent.type);
        switch (actionEvent.type) {

            case EventTypes.PLAYBACK_COMMANDS.START:
                if (actionEvent.data && actionEvent.data.src) {
                    this.start(actionEvent.data);
                }
                break;

            case EventTypes.PLAYBACK_COMMANDS.PAUSE:
                this.pause();
                break;

            case EventTypes.PLAYBACK_COMMANDS.PLAY:
                this.play();
                break;

            case EventTypes.PLAYBACK_COMMANDS.STOP:
                this.stop();
                break;

            case EventTypes.PLAYBACK_COMMANDS.REWIND:
            case EventTypes.PLAYBACK_COMMANDS.FAST_FORWARD:
            case EventTypes.PLAYBACK_COMMANDS.SEEK:
                if (actionEvent.data && actionEvent.data.seek) {
                    this.seek(actionEvent.data.seek);
                }
                break;

            case EventTypes.PLAYBACK_COMMANDS.PLAY_PAUSE:
                this.togglePlayPause();
                break;
        }
    }

    start(videoInfo) {

        super.start(videoInfo);

        console.log("HtmlPlayer::this.startVideo()", this.videoInfo);
        this.playerElement.removeAttribute("src");
        this.playerElement.removeAttribute("type");
        this.playerElement.setAttribute("src", videoInfo.src);

        if (videoInfo.src.lastIndexOf('.m3u8') >= 0 || videoInfo.src.lastIndexOf('m3u') >= 0) {
            // HTTP Live Streaming
            this.playerElement.setAttribute("type", "application/vnd.apple.mpegurl");
        } else if (videoInfo.src.lastIndexOf('.ism') >= 0) {
            // Smooth Streaming
            this.playerElement.setAttribute("type", "application/vnd.ms-sstr+xml");
        } else {
            // mp4
            this.playerElement.setAttribute("type", "video/mp4");
        }

        this.startedPlaying = false;
        this.finishedStartSeek = false;
        this.bypassCanPlay = false;
        this.playerElement.load();
    }

    play() {

        this.playerElement.play();
        this.bypassCanPlay = false;
    }

    pause() {

        this.playerElement.pause();
        if (this.playerElement.paused === undefined) {
            this.bypassCanPlay = true;
        }
    }

    togglePlayPause() {

        if (this.playerElement.paused) {
            this.playerElement.play();
        } else {
            this.playerElement.pause();
        }
    }

    stop() {

        // as there is no stop command on HTML Player
        // don't set when src is already empty, it raising error event.
        // when src is empty, value of src returned is current location
        if (this.playerElement.src && this.playerElement.src != location.origin + location.pathname) {
            this.playerElement.src = '';
        }
    }

    seek(seekTimeMS) {

        let time = seekTimeMS / 1000;

        // HACK:
        // on some platforms like vizio seeking to 0 is raising error
        if (time == 0) {
            time = 1;
        }
        this.playerElement.currentTime = time;
    }

    /* for VGA compatability? need to update to use getter */
    currentTime() {
        return this.playerElement.currentTime;
    }

    getDuration() {
        return this.playerElement.duration;
    }

    //------------------
    // Private methods
    //------------------

    configurePlayerElement() {

        // TODO: Is it better to handle style in css ??
        let playerEl = this.playerElement;
        playerEl.style.position = 'absolute';
        playerEl.style.width = '100%';
        playerEl.style.height = '100%';
        playerEl.style.top = '0px';
        playerEl.style.left = '0px';
        playerEl.style.backgroundColor = 'black';
        playerEl.style.display = 'block';
    }

    logVideoError(e) {

        console.log('HtmlPlayer::ErrorHandler', e);
        if (e && e.target && e.target.error && e.target.error.code !== undefined) {
            switch (e.target.error.code) {
                case e.target.error.MEDIA_ERR_ABORTED:
                    console.log('HtmlPlayer::ERROR ** You aborted the video playback.');
                    break;
                case e.target.error.MEDIA_ERR_NETWORK:
                    console.log('HtmlPlayer::ERROR ** A network error caused the video download to fail part-way.');
                    break;
                case e.target.error.MEDIA_ERR_DECODE:
                    console.log('HtmlPlayer::ERROR ** The video playback was aborted due to a corruption problem or because the video used features your browser did not support.');
                    break;
                case e.target.error.MEDIA_ERR_SRC_NOT_SUPPORTED:
                    console.log('HtmlPlayer::ERROR ** The video could not be loaded, either because the server or network failed or because the format is not supported.');
                    break;
                default:
                    console.log('HtmlPlayer::ERROR ** An unknown error occurred.', e.target.error);
                    break;
            }
        }
    }
}