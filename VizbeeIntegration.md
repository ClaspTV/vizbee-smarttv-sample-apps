# Sample App Integration With Vizbee SmartTV SDK

## Build Setup

* **Step 1** Included the following Vizbee SDK script tag in the app's entry file (src/index.html):

```
<script type="text/javascript" src="https://sdk.claspws.tv/v7/vizbee.js?appid=vzb2000001"></script>
```

* **Step 2** Copied the template files as specified in the Vizbee Console guide [snippet](https://gist.github.com/vizbee/ce5db3b4c2e9d3ec08a7a345d40a24ca)

## Init Flow

* **Step 1** Added `VIZBEE_SDK_READY` listener in the `registerVizbee()` method of `src/App.js` file.
* **Step 2** Initialized Vizbee SDK in the `initVizbee()` method of `src/App.js` file.

## App Flow

* **Step 1** Updated the `fromVideoInfo` implementation under `src/vizbee/MyVizbeeConverters.js` to convert vizbee videoInfo into app's videoInfo format.
* **Step 1** Updated the `deeplinkHandler` implementation under `src/vizbee/MyVizbeeHandlers.js`.
* **Step 3** AppAdapter's Deeplink Handler method is set in the `initVizbee()` method of `src/App.js` file after Vizbee SDK init.

## Vizbee Flow

* **Step 1** Created and set the `PlayerAdapter` in the `onEventHandler` method of `BrowseVideoGridExtension.js`.
* **Step 2** Updated the `toVideoInfo` implementation under `src/vizbee/MyVizbeeConverters.js` to convert app's videoInfo into vizbee videoInfo format.
* **Step 3** Updated videoInfo to vizbee in the `onEventHandler` method of `BrowseVideoGridExtension.js`.