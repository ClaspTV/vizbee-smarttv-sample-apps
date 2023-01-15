import BasePlayer from './base/BasePlayer';
import EventTypes from './input/EventTypes';
import BaseEvent from './input/BaseEvent';

/**
 * AVPlayer Class : Extends from BasePlayer. Has AVPlayer implementations.
 * Binds listeners to the AVPlayer events.
 */
export default class AVPlayer extends BasePlayer {

    /**
     * Keeps a reference to the player element of the UI. This is passed from platformConfig.
     * In the tizen case, it is the AVPlayer here.
     */
    // playerElement;


    /**
     * @param {*} platform platform object from where this player has been initialized.
     * @param {*} platformConfig platform config which contains the video DOM element.
     */
    constructor(platform, platformConfig) {

        super(platform);

        if (!platformConfig) {
            throw new TypeError('AVPlayer::constructor() -- expects platformConfig.');
        }
        if (!platformConfig.videoElement) {
            throw new TypeError('AVPlayer::constructor() platformConfig -- expects videoElement property.');
        }

        this.playerElement = platformConfig.videoElement;

        let that = this;

        this.listeners = {
            oncurrentplaytime: (time) => {
                that.updateTime(time);
                that.detectPause(time);
            },
            onerror: (errorType) => {
                that.onAvPlaybackEror(errorType);
            },
            onstreamcompleted: () => {
                that.setVideoIsEnded();
            }
        };
    }

    /**
     * Registers the AVPlayer events.
     * On each event trigger, the super onEvent gets called for extentions.
     * http://developer.samsung.com/tv/develop/guides/multimedia/media-playback/using-avplay
     */
    setListener() {
        this.playerElement.setListener(this.listeners);
    }

    /**
     * Handles the events invoked by the player. 
     * This function also dispatches the corresponding event handler from onEvent super function.
     * @param {*} e Event got from the player.
     */
    eventHandler(e) {
        switch (e.type) {
            case EventTypes.PLAYBACK_EVENTS.ERROR:
                let statusEvent = new BaseEvent(EventTypes.PLAYBACK_EVENTS.ENDED);
                this.dispatchOnEvent(statusEvent);
                break;

            case EventTypes.PLAYBACK_EVENTS.ENDED:
            case EventTypes.PLAYBACK_EVENTS.LOADING:
            case EventTypes.PLAYBACK_EVENTS.PLAYING:
            case EventTypes.PLAYBACK_EVENTS.PAUSED:
            case EventTypes.PLAYBACK_EVENTS.TIME_UPDATE:
                this.dispatchOnEvent(e);
                break;

            case EventTypes.PLAYBACK_EVENTS.SEEKING:
                statusEvent = new BaseEvent(EventTypes.PLAYBACK_EVENTS.SEEKING);
                this.dispatchOnEvent(statusEvent);
                break;
        }
    }


    /**
     * Handles the COMMANDS coming from the top-level UI extensions.
     * commnds like PLAY, PAUSE, which come from the user-inputs come here.
     * @param {*} actionEvent 
     */
    doAction(actionEvent) {
        switch (actionEvent.type) {

            case EventTypes.PLAYBACK_COMMANDS.START:
                if (actionEvent.data && actionEvent.data.src) {
                    this.resetState();
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


    /**
     * Resets the AVPlayer properties and plays the passed video.
     * @param {*} videoInfo this should contain the video URL
     */
    start(videoInfo) {
        if (!videoInfo.src) {
            throw new TypeError('AVPlayer::startVideo() -- expects videoInfo.src.');
        }

        this.setListener();
        
        this.wasVideoPausedWhileLoading = false;
        this.setIsVideoLoadStarted(videoInfo);

        this.playerElement.open(videoInfo.src);

        this.playerElement.setDisplayRect(0, 0, 1920, 1080);
        // this.playerElement.setStreamingProperty("SET_MODE_4K");
        this.playerElement.setDisplayMethod('PLAYER_DISPLAY_MODE_FULL_SCREEN');


        this.playerElement.prepareAsync(() => {
            if (!this.isVideoStarted && this.isVideoLoadStarted) {
                this.setVideoIsStarted();

                let time = videoInfo.time || 0;

                if (!this.finishedStartSeek && !(time == 0)) {
                    this.playerElement.seekTo(time, () => {
                        this.setFinishedStartSeek();
                    });
                }

                if (!this.wasVideoPausedWhileLoading) {
                    this.play();
                }
            }
        }, (e) => {
            console.log("prepareAsync Error: ", e);
        });


    }

    /**
     * Pauses the ongoing video.
     */
    pause() {
        this.playerElement.pause();

        if (this.playerElement.getState() !== 'PLAYING' && this.playerElement.getState() !== 'PAUSED') {
            this.wasVideoPausedWhileLoading = true;
        } else {
            this.wasVideoPausedWhileLoading = false;
        }

        this.setVideoIsPaused();
    }

    /**
     * Starts playing the video.
     */
    play() {
        this.playerElement.play();
        this.wasVideoPausedWhileLoading = false;
        this.setVideoIsPlaying();
    }

    /**
     * Stops the video.
     */
    stop() {
        this.playerElement.stop();
        this.setVideoIsInterrupted();
    }

    /**
     * Seeks the video.
     * @param {*} time time at which the video needs to be seeked
     */
    seek(time) {
        this.playerElement.seekTo(time);
    }

    /**
     * Toggles play-pause.
     */
    togglePlayPause() {
        if (this.playerElement.getState() === 'PLAYING') {
            this.pause();
        } else if (this.playerElement.getState() === 'PAUSED') {
            this.play();
        }
    }



    /**
     * Resets the player states to initial state. Useful when new video loads.
     */
    resetState() {
        this.finishedStartSeek = false;

        this.isVideoLoadStarted = false;
        this.isVideoStarted = false;        // has video started?
        this.isVideoPlaying = false;        // playing or paused
        this.currentPlayTime = -1;          // current time
        this.currentBitRate = 0;            // current bitrate

        this.wasVideoPausedWhileLoading = false;
    }

    /**
     * Sets a flag which indicates the video has loaded. Also sends the video object to top-level extension to show metadata.
     * @param {*} videoInfo Video information to be sent to show the metaData.
     */
    setIsVideoLoadStarted(videoInfo) {
        this.isVideoLoadStarted = true;

        this.eventHandler(new BaseEvent(EventTypes.PLAYBACK_EVENTS.LOADING, videoInfo));
    }


    setVideoIsStarted() {
        this.isVideoStarted = true;
        this.eventHandler(new BaseEvent(EventTypes.PLAYBACK_EVENTS.PLAYING));
    }
    setVideoIsEnded() {
        this.isVideoLoadStarted = false;
        this.isVideoStarted = false;
        this.isVideoPlaying = false;
        this.eventHandler(new BaseEvent(EventTypes.PLAYBACK_EVENTS.ENDED));
        this.resetState();
    }
    setVideoIsInterrupted(e) {
        this.isVideoLoadStarted = false;
        this.isVideoStarted = false;
        this.isVideoPlaying = false;
        this.eventHandler(new BaseEvent(EventTypes.PLAYBACK_EVENTS.ENDED));
    }
    setOnTimeUpdate(time) {
        this.currentPlayTime = time;
        this.isVideoPlaying = true;

        this.eventHandler(new BaseEvent(EventTypes.PLAYBACK_EVENTS.TIME_UPDATE));
    }

    setVideoIsPlaying() {
        this.isVideoPlaying = true;

        this.eventHandler(new BaseEvent(EventTypes.PLAYBACK_EVENTS.PLAYING));
    }
    setVideoIsPaused() {
        this.isVideoPlaying = false;

        this.eventHandler(new BaseEvent(EventTypes.PLAYBACK_EVENTS.PAUSED));
    }
    setFinishedStartSeek() {
        this.finishedStartSeek = true;

        this.eventHandler(new BaseEvent(EventTypes.PLAYBACK_EVENTS.SEEKED));
    }


    onAvPlaybackEror(errorType) {
        if (errorType == 'PLAYER_ERROR_INVALID_OPERATION' || errorType == 'PLAYER_ERROR_CONNECTION_FAILED') {
            console.log("Frequently sent errorType by AVPlayer: ", errorType);
        } else {
            this.setVideoIsInterrupted(errorType);
        }
    }

    /**
     * This function gets called from the AVPlayer listeners on timeUpdate.
     * This is used to maintain the video state as AVPlayer does not have out of the box play/pause state.
     * @param {*} time 
     */
    detectPause(time) {
        this.timerHandle = setTimeout(() => {
            // Make sure video is PLAYING state, 
            // otherwise we are firing multiple PAUSED or IDLE events
            if (this.isVideoPlaying) {

                if (this.playerElement.getState() === 'PAUSED') {
                    this.setVideoIsPaused();
                }
                if (this.playerElement.getState() === 'IDLE') {
                    this.setVideoIsInterrupted();
                }
            }
            this.timerHandle = null;
        }, 1000);
    }

    /**
     * Keeps track of the ellapsed time.
     * This function is called from the avPlayer listener.
     * @param {*} time 
     */
    updateTime(time) {
        if (this.currentPlayTime != time) {
            this.setOnTimeUpdate(time);
        }
    }

    /**
     * Returns current-playback time in seconds.
     */
    currentTime() {
        return this.playerElement.getCurrentTime() / 1000;;
    }

    /**
     * Returns total video duration in seconds.
     */
    getDuration() {
        return this.playerElement.getDuration() / 1000;;
    }


    /**
     * 
     */
    destroy() {
        if (this.timerHandle) {
            clearTimeout(this.timerHandle);
        }
        super.destroy();
    }
}