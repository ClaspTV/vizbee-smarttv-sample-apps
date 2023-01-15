
import BaseKeyPadControlsExtension from 'common/player/base/BaseKeyPadControlsExtension';
import EventTypes from 'common/player/input/EventTypes';
import Utils from 'common/utils/Utils'

import MyVizbeeConverters from 'vizbee/MyVizbeeConverters';

// import VIDEO_LIST from 'common/resources/stubs/videos.json';

export default class BrowseVideosExtension extends BaseKeyPadControlsExtension {

    /**
     * Keeps track of the active video thumbnail index. The index should move if 
     * navigation is done with RIGHT and LEFT buttons of the remote.
     */
    //activeVideoThumbIndex

    constructor(playerToExtend, extensionParams) {

        super(playerToExtend, extensionParams);

        // console.log("BrowseVideosExtension::constructor()", extensionParams);

        // get videos information
        this.getVideoList(extensionParams.config.videoList);

        this.extensionConfig = extensionParams.config;
        this.currentVideo = undefined;
    }

    getVideoList(videoLocationPath) {

        // we pass file location that we got from extensionParams to the method
        Utils.readJSONFile(videoLocationPath, (status, data) => {
            this.videoList = data;

            // create UI Layout
            this.createUI();

            // show the UI
            this.showMyScreen();
        });
    }

    createUI() {

        this.nodes = {};

        // create gallery container
        this.nodes.galleryContainer = document.createElement("div");
        this.nodes.galleryContainer.id = "galleryContainer";
        this.nodes.galleryContainer.className = "gallery-wrapper";
        this.nodes.galleryContainer.style.color = "black";

        // add background to each video item
        this.nodes.backdropThumbnail = document.createElement('div');
        if (this.videoList.length) {
            this.nodes.backdropThumbnail.className = 'bg-thumbnail';
            this.nodes.backdropThumbnail.style.backgroundImage = "url('" + this.videoList[0].imageUrl + "')";
        }
        this.myPlayerOverlayContainer.appendChild(this.nodes.backdropThumbnail);

        // add title of thumbnail text
        this.nodes.selectedVideoThumbTitle = document.createElement('div');
        this.nodes.selectedVideoThumbTitle.className = 'gallery-selected-title';
        this.nodes.selectedVideoThumbTitle.style.color = this.extensionConfig.fontColor;
        this.nodes.selectedVideoThumbTitle.innerHTML = this.videoList[0].title;
        this.myPlayerOverlayContainer.appendChild(this.nodes.selectedVideoThumbTitle);

        // add all video items
        this.activeVideoThumbIndex = 0;
        this.nodes.videoList = [];
        this.videoList.forEach((videoItem, idx) => {
            var videoThumb = document.createElement("div");
            videoThumb.id = "video-thumb-" + idx;
            videoThumb.className = "gallery-item" + (idx == 0 ? ' active' : '');
            videoThumb.style.backgroundImage = "url('" + videoItem.imageUrl + "')";

            this.nodes.videoList.push(videoThumb);
            this.nodes.galleryContainer.appendChild(videoThumb);
        });
        this.myPlayerOverlayContainer.appendChild(this.nodes.galleryContainer);

        // set default video item active
        this.makeVideoThumbActive();
    }

    onEventHandler(e) {

        // events to be handled here
        // ended - 1.hide extended extension show this extension
        console.log("BrowseVideosExtension::", e);

        switch (e.type) {

            case EventTypes.PLAYBACK_EVENTS.ENDED:
            case EventTypes.PLAYBACK_EVENTS.ERROR:
                this.showMyScreen();
                break;

            case EventTypes.PLAYBACK_EVENTS.LOADING:

                // --------------------------------------------
                // Set Vizbee PlayerAdapter & Update VideoInfo
                // --------------------------------------------

                if(window.vizbee) {

                    // create an instance of a builtin player adapter
                    var builtinPlayerAdapter;
                    if(window.tizen) {
                        builtinPlayerAdapter = new vizbee.continuity.adapters.AVPlayerAdapter();
                    } else {
                        builtinPlayerAdapter = new vizbee.continuity.adapters.PlayerAdapter(vizbee.continuity.adapters.PlayerType.HTML, 
                            document.getElementById('video-element'));
                    }

                    // set player adapter
                    var vzbInstance = vizbee.continuity.ContinuityContext.getInstance();
                    vzbInstance.setPlayerAdapter(builtinPlayerAdapter);

                    // set wrapped listener to the AVPlayer
                    if(window.tizen) {
                        webapis.avplay.setListener(builtinPlayerAdapter.wrapListener(this.basePlayer.listeners));
                    }

                    // create vizbee videoInfo
                    var vizbeeVideoInfo = MyVizbeeConverters.toVideoInfo(this.currentVideo);
                    if (!vizbeeVideoInfo) {
                        console.warn(
                        `BrowseVideosExtension::onEventHandler - vizbeeVideoInfo is invalid`
                        );
                        return;
                    } else {
                        builtinPlayerAdapter.updateVideoInfo(vizbeeVideoInfo);
                    }
                }
                break;
        }

        super.onEventHandler(e);
    }

    doAction(actionEvent) {

        console.log("BrowseVideosExtension::", actionEvent);

        // commands to be handled here

        // If this extension is visible
        // select - 1.hide this extension show extended extension, 2.super()
        // left, right, top, bottom - 1.navigate to different videos, 2.NO super()
        // back - 1.exit, 2.reset??
        // default - 1.Nothing, 2.super()

        // If this extension is not visible 
        // Do not do anything, pass it to parent

        if (this.isMyPlayerOverlayVisible()) {

            switch (actionEvent.type) {

                case EventTypes.PLAYBACK_COMMANDS.START:
                    
                    this.hideMyScreen();
                    this.currentVideo = actionEvent.data;

                    super.doAction(actionEvent);
                    break;

                case EventTypes.KEY_COMMANDS.SELECT:
                    this.hideMyScreen();
                    actionEvent.data = this.videoList[this.activeVideoThumbIndex];
                    this.currentVideo = this.videoList[this.activeVideoThumbIndex];
                    
                    // Convert select command from remote to start command
                    actionEvent.type = EventTypes.PLAYBACK_COMMANDS.START;
                    super.doAction(actionEvent);
                    break;

                case EventTypes.KEY_COMMANDS.LEFT:
                case EventTypes.KEY_COMMANDS.ALT_LEFT:
                case EventTypes.KEY_COMMANDS.ALT_UP:
                    this.moveToLeft();
                    super.doAction(actionEvent);
                    break;

                case EventTypes.KEY_COMMANDS.RIGHT:
                case EventTypes.KEY_COMMANDS.ALT_RIGHT:
                case EventTypes.KEY_COMMANDS.ALT_DOWN:
                    this.moveToRight();
                    super.doAction(actionEvent);
                    break;

                case EventTypes.KEY_COMMANDS.BACK:
                    window.close();
                    break;

                default:
                    super.doAction(actionEvent);
                    break;
            }
        } else {
            super.doAction(actionEvent);
        }

    }

    //-------------------- 
    // Private Methods
    //--------------------

    showMyScreen() {
        this.showMyOverlayAndHideExtendedUI();
    }

    hideMyScreen() {
        this.hideMyOverlayAndShowExtendedUI();
    }

    moveToLeft() {
        this.activeVideoThumbIndex--;
        this.makeVideoThumbActive();
    }

    moveToRight() {
        this.activeVideoThumbIndex++;
        this.makeVideoThumbActive();
    }

    makeVideoThumbActive() {

        if (this.activeVideoThumbIndex < 0) {
            this.activeVideoThumbIndex = 0;
        }

        if (this.activeVideoThumbIndex >= this.videoList.length) {
            this.activeVideoThumbIndex = this.videoList.length - 1;
        }

        var activeVideoEl = document.querySelector('.gallery-item.active');
        activeVideoEl.classList.remove('active');

        this.nodes.videoList[this.activeVideoThumbIndex].classList.add('active');

        this.nodes.selectedVideoThumbTitle.innerHTML = this.videoList[this.activeVideoThumbIndex].title;

        this.nodes.backdropThumbnail.style.backgroundImage = "url('" + this.videoList[this.activeVideoThumbIndex].imageUrl + "')";
    }
}
