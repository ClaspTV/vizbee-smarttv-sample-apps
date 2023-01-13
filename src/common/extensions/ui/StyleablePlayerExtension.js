
import BaseKeyPadControlsExtension from 'common/player/base/BaseKeyPadControlsExtension';
import EventTypes from 'common/player/input/EventTypes';
import Utils from 'common/utils/Utils';

const TIME_TO_SHOW_PLAYER_CONTROLS = 5000; // milliseconds
export default class StyleablePlayerExtension extends BaseKeyPadControlsExtension {

    constructor(playerToExtend, extensionParams) {

        super(playerToExtend, extensionParams);

        console.log("StyleablePlayerExtension::constructor()", extensionParams);
        this.statusTimer = undefined;
        this.extensionConfig = extensionParams.config;

        this.createUI();
        this.showMyScreen();
    }

    //------------------------
    // EventHandler methods
    //------------------------

    onEventHandler(e) {

        // events to be handled here
        console.log("StyleablePlayerExtension::", e);

        switch (e.type) {

            case EventTypes.PLAYBACK_EVENTS.LOADING:
                this.onLoadingHandler(e);
                break;

            case EventTypes.PLAYBACK_EVENTS.PLAYING:
                this.onPlayingHandler();
                break;

            case EventTypes.PLAYBACK_EVENTS.PAUSED:
                this.onPausedHandler();
                break;

            case EventTypes.PLAYBACK_EVENTS.SEEKING:
                this.onSeekingHandler();
                break;

            case EventTypes.PLAYBACK_EVENTS.TIME_UPDATE:
                this.onTimeUpdateHandler();
                break;

            case EventTypes.PLAYBACK_EVENTS.BUFFERING:
                this.onBufferingHandler();
                break;

            case EventTypes.PLAYBACK_EVENTS.ENDED:
                this.onEndedHandler();
                break;

            case EventTypes.PLAYBACK_EVENTS.ERROR:
                this.onErrorHandler();
                break;
        }

        super.onEventHandler(e);
    }

    onLoadingHandler(e) {
        this.setUI(e.data);
    }

    // Sent when the media begins to play (either for the first time, after having been paused, or after ending and then restarting).
    onPlayingHandler() {

        // change play icon to pause icon here
        this.nodes.videoStateDivEle.classList.remove('play');
        this.nodes.videoStateDivEle.classList.add('pause');

        clearTimeout(this.statusTimer);
        // should show this for 5sec and then hide
        this.showAllControls();
        this.statusTimer = setTimeout(() => {
            this.hideAllControls();
        }, TIME_TO_SHOW_PLAYER_CONTROLS);
    }

    onPausedHandler() {

        // change pause icon to play icon here
        this.nodes.videoStateDivEle.classList.remove('pause');
        this.nodes.videoStateDivEle.classList.add('play');

        // kill the timer if started by playing/seeking handler
        if (this.statusTimer) {
            clearTimeout(this.statusTimer);
        }

        // should show this for ever
        this.showAllControls();
    }

    onSeekingHandler() {

        // should show this for 5sec and then hide
        clearTimeout(this.statusTimer);
        // should show this for 5sec and then hide
        this.showAllControls();
        this.statusTimer = setTimeout(() => {
            this.hideAllControls();
        }, TIME_TO_SHOW_PLAYER_CONTROLS);
    }

    onTimeUpdateHandler() {

        // update elapsed time, elapsed seek bar
        this.updateUI();
        this.hideSpinner();
    }

    onBufferingHandler() {
        this.showSpinner();
    }

    onEndedHandler() {

        this.resetUI();
        this.showMyScreen();
    }

    onErrorHandler() {

        this.resetUI();
        this.showMyScreen();
    }


    //------------------
    // Command methods
    //------------------

    doAction(actionEvent) {

        console.log("StyleablePlayerExtension::", actionEvent);

        switch (actionEvent.type) {

            case EventTypes.KEY_COMMANDS.SELECT:
                actionEvent.type = EventTypes.PLAYBACK_COMMANDS.PLAY_PAUSE;
                super.doAction(actionEvent);
                break;
                
            case EventTypes.KEY_COMMANDS.BACK:
                actionEvent.type = EventTypes.PLAYBACK_COMMANDS.STOP;
                super.doAction(actionEvent);
                break;

            default:
                super.doAction(actionEvent);
                break;
        }
    }

    //-------------------- 
    // Private Methods
    //--------------------

    createUI() {

        // Build the UI here
        this.nodes = {};

        // player container element
        this.nodes.playerControlsContainer = document.createElement("div");
        this.nodes.playerControlsContainer.className = "player-container";

        // meta data container to hold image, title
        this.nodes.metaDataContainer = document.createElement("div");
        this.nodes.metaDataContainer.className = "metadata-container";
        this.nodes.metaDataContainer.id = "metadata-container";
        this.nodes.playerControlsContainer.appendChild(this.nodes.metaDataContainer);

        // controls container to hold play/pause icon, elapsed time, total duration, seek bar
        this.nodes.controlsContainer = document.createElement("div");
        this.nodes.controlsContainer.className = "controls-container";
        this.nodes.controlsContainer.id = "controls-container";

        this.createMetaDataUI();
        this.createPlayerControlsUI();

        this.nodes.playerControlsContainer.appendChild(this.nodes.metaDataContainer);
        this.nodes.playerControlsContainer.appendChild(this.nodes.controlsContainer);
        this.myPlayerControlsContainer.appendChild(this.nodes.playerControlsContainer);

        this.addSpinner();
    }

    createMetaDataUI() {

        // video title
        this.nodes.videoTitleEle = document.createElement("div");
        this.nodes.videoTitleEle.className = "video-title";
        this.nodes.videoTitleEle.style.color = this.extensionConfig.fontColor;
        this.nodes.videoTitleEle.innerText = "Sample Title";

        this.nodes.metaDataContainer.appendChild(this.nodes.videoTitleEle);
    }

    createThumbnailUI(videoInfo) {

        // check if thumbnail already added
        if (!this.nodes.videoThumbnailContainerEle) {

            // thumbnail container
            this.nodes.videoThumbnailContainerEle = document.createElement("div");
            this.nodes.videoThumbnailContainerEle.className = "thumbnail-image-container";

            // thumbnail image
            this.nodes.videoThumbnailEle = document.createElement("img");
            this.nodes.videoThumbnailEle.className = "thumbnail-image";
            this.nodes.videoThumbnailEle.setAttribute("src", videoInfo.imageUrl);
            this.nodes.videoThumbnailContainerEle.appendChild(this.nodes.videoThumbnailEle);

            this.nodes.metaDataContainer.insertBefore(this.nodes.videoThumbnailContainerEle, this.nodes.metaDataContainer.getElementsByClassName("video-title")[0]);
        }

        if (videoInfo.imageUrl && this.nodes.videoThumbnailEle) {
            this.nodes.videoThumbnailEle.setAttribute("src", videoInfo.imageUrl);
        }
    }

    createPlayerControlsUI() {

        this.nodes.controlsContainer.innerHTML = "";

        // video state - play, pause icons background
        this.nodes.videoStateDivEle = document.createElement("div");
        this.nodes.videoStateDivEle.className = "video-state play";

        // video elapsed duration
        this.nodes.videoElapsedTimeEle = document.createElement("div");
        this.nodes.videoElapsedTimeEle.className = "video-elapsed-time";
        this.nodes.videoElapsedTimeEle.style.color = this.extensionConfig.fontColor;
        this.nodes.videoElapsedTimeEle.innerText = "00:00:00";

        // video duration
        this.nodes.videoDurationEle = document.createElement("div");
        this.nodes.videoDurationEle.className = "video-total-time";
        this.nodes.videoDurationEle.style.color = this.extensionConfig.fontColor;
        this.nodes.videoDurationEle.innerText = "00:00:00";

        // video seekbar
        this.nodes.videoSeekBarEle = document.createElement("div");
        this.nodes.videoSeekBarEle.className = "video-seek-bar";
        this.nodes.videoSeekBarEle.id = "vzb_progress_bar_container";

        // elapsed video seekbar
        this.nodes.videoElapsedSeekBarEle = document.createElement("div");
        this.nodes.videoElapsedSeekBarEle.className = "video-elapsed-seek-bar";
        this.nodes.videoElapsedSeekBarEle.style.backgroundColor = this.extensionConfig.themeColor;

        // construct seekbar
        this.nodes.videoSeekBarEle.appendChild(this.nodes.videoElapsedSeekBarEle);

        // construct controls container
        this.nodes.controlsContainer.appendChild(this.nodes.videoStateDivEle);
        this.nodes.controlsContainer.appendChild(this.nodes.videoElapsedTimeEle);
        this.nodes.controlsContainer.appendChild(this.nodes.videoDurationEle);
        this.nodes.controlsContainer.appendChild(this.nodes.videoSeekBarEle);

        this.addClearElement(this.nodes.controlsContainer);
    }

    setUI(videoInfo) {

        // add title here
        this.nodes.videoTitleEle.innerText = videoInfo.title;

        // add imageUrl here
        if (videoInfo.imageUrl) {
            this.createThumbnailUI(videoInfo);
        }

        this.addClearElement(this.nodes.metaDataContainer);
    }

    addClearElement(source) {
        if (!source.querySelector('p.clear')) {

            let p = document.createElement("p");
            p.classList.add('clear');

            source.appendChild(p);
        }
    }

    addSpinner() {

        this.nodes.spinner = document.createElement('div');
        this.nodes.spinner.className = "spinner";

        // NOTE: spinner should be on playerScreen NOT playerOverlay or playerControls
        this.playerScreenContainer.appendChild(this.nodes.spinner);
        this.hideSpinner();
    }

    updateUI() {

        let currentDuration = this.currentTime();
        let totalDuration = this.getDuration();

        // Update elapsed time here
        this.nodes.videoElapsedTimeEle.innerText = Utils.millisecondsToString(currentDuration, true) || "00:00";

        // Update duration time here
        this.nodes.videoDurationEle.innerText = Utils.millisecondsToString(totalDuration, true) || "00:00";

        // Update elapsed seek bar here
        this.nodes.videoElapsedSeekBarEle.style.width = Math.ceil((currentDuration * 100) / totalDuration) + '%';

    }

    resetUI() {

        // reset meta data container
        this.nodes.videoTitleEle.innerText = "";
        if (this.nodes.videoThumbnailEle) {
            this.nodes.videoThumbnailEle.setAttribute("src", "");
        }

        // reset controls container
        this.nodes.videoElapsedTimeEle.innerText = "";
        this.nodes.videoDurationEle.innerText = "";
        this.nodes.videoElapsedSeekBarEle.style.width = "0px";
    }

    showMyScreen() {
        this.showMyPlayerControls();
        this.hideAllControls();
    }

    hideMyScreen() {
        this.hideMyPlayerControls();
    }

    showMetaDataContainer() {
        this.nodes.metaDataContainer.style.display = "block";
    }

    hideMetaDataContainer() {
        this.nodes.metaDataContainer.style.display = "none";
    }

    showPlayerControlsContainer() {
        this.nodes.playerControlsContainer.style.display = "block";
    }

    hidePlayerControlsContainer() {
        this.nodes.playerControlsContainer.style.display = "none";
    }

    showAllControls() {

        this.showMetaDataContainer();
        this.showPlayerControlsContainer();
    }

    hideAllControls() {

        this.hideMetaDataContainer();
        this.hidePlayerControlsContainer();
    }

    showSpinner() {
        this.nodes.spinner.style.display = "block";
    }

    hideSpinner() {
        this.nodes.spinner.style.display = "none";
    }
}
