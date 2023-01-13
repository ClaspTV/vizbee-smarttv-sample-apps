
import _ from 'underscore';
import BrowseVideosExtension from 'common/extensions/ui/BrowseVideosExtension';
import StyleablePlayerExtension from 'common/extensions/ui/StyleablePlayerExtension';

export default class ExtensionBuilder {

    constructor() {

        this.extensionMap = {};
        this.init();

        // Need to fill this whenever we add/remove/update extension
        this.extensionsInfo = {
            commonConfig: {
                themeColor: "#00afda",
                fontColor: "#ffffff"
            },
            extensionsOrder: [
                {
                    order: 1,
                    name: "StyleablePlayer",
                    config: {}
                },
                {
                    order: 2,
                    name: "BrowseVideos",
                    config: {
                        videoList: 'https://static.claspws.tv/smarttv_sample_apps_videos.json'
                    }
                }
            ]
        }
    }

    init() {

        // extension map
        this.extensionMap = {
            'BrowseVideos': BrowseVideosExtension,
            'StyleablePlayer': StyleablePlayerExtension
        };
    }

    loadExtensions(platform) {

        // first remove all extensions
        platform.unwrapExtensionToBasePlayer();

        // sort extensions per order
        let sortedExtensions = this.sortExtensionsByOrder(this.extensionsInfo.extensionsOrder);

        // config common for all extensions
        let commonConfig = _.clone(this.extensionsInfo.commonConfig || {});

        for (let i = 0; i < sortedExtensions.length; i++) {

            let extension = sortedExtensions[i];

            // pass common config to all extensions
            let extensionParams = {
                config: {}
            };
            extensionParams.config = _.extend(extensionParams.config, commonConfig);

            // overwrite common config with extension specific config
            extensionParams.config = _.extend(extensionParams.config, extension.config);

            // initialise the extension
            platform.wrapExtension(this.extensionMap[extension.name], extensionParams);
        }

    }

    //-------------------- 
    // Private Methods
    //--------------------

    sortExtensionsByOrder(extentions) {
        
        return _.sortBy(extentions, (extension) => {
            return extension.order;
        });
    }
}