# Vizbee Smart TV Sample Apps
## Description
These sample apps demonstrate the integration of Vizbee Smart TV SDK into various Smart TV apps including:
* Samsung Tizen TV
* LG WebOS TV
* Vizio SmartCast TV
* Xbox

Sample apps have simply 2 screens:
* Home Screen 
    - Grid of 4 HLS VOD videos.
    - Navigate to different videos with TV remote Left & Right keys.
    - Select a video with TV remote Select key.
* Video Player Screen 
    - Simple video player.
    - play/pause video with TV remote Play/Pause keys.
    - stop video with TV remote Stop/Back keys.
    - seek video with TV remote RWD/FWD keys.


All the sample apps share the common code, which makes Vizbee Smart TV SDK integration much more simpler. This implies one simple integration for multiple apps.

## Available Sample Apps

| Sample App | Player Used |
| ---------- | ------------------------- |
| Samsung Tizen Sample App | AV Player |
| LG Web OS TV Sample App | HTML Video Player |
| Vizio SmartCast TV Sample App | HTML Video Player |
| Xbox Sample App | HTML Video Player |

## Repo Structure

* /src
    - /common
    - /tizen
    - /lgwebos
    - /viziosmartcast
    - /xbox
* /platformconfig
* /dist
* /gulpfile.js
* /package.json
* /README.md


## Setup

### Step 1: Clone the repository
`git clone git@github.com:ClaspTV/vizbee-smarttv-sample-apps.git .`

### Step 2: Switch to the repo folder and install the node modules from root folder
`npm install`

## Build

**gulp** is used for build process.
* `gulp SAMPLEAPP --platform <PLATFORM>` 
    - Builds the Sample App for respective platform.
    - Builds are copied to `dist/<PLATFORM>` directory.
        - PLATFORM: "tizen"|"lgwebos"|"viziosmartcast"|"xbox"

* -------
* Example
* -------
* `gulp SAMPLEAPP --platform tizen` - Builds Sample App for Samsung Tizen TV.
* `gulp SAMPLEAPP --platform viziosmartcast` - Builds Sample App for Vizio SmartCast TV.
