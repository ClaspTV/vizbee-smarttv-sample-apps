export default class MyVizbeeConverters {
  
    static toVideoInfo(myVideoInstance) {
      if (!myVideoInstance) {
        return undefined;
      }

      console.info(`MyVizbeeConverters::toVideoInfo - ${myVideoInstance}`);
  
      let vInfo = new window.vizbee.continuity.messages.VideoInfo();
      vInfo.guid = myVideoInstance.id
      vInfo.title = myVideoInstance.title;
      vInfo.imgUrl = myVideoInstance.imageUrl;
      vInfo.isLive = false; // true if content is live, false otherwise
      vInfo.src = myVideoInstance.videoUrl;
  
      return vInfo;
    }

    static fromVideoInfo(videoInfo) {
  
      // implement this method to convert Vizbee's VideoInfo to your VideoInstance
      if(!videoInfo || !videoInfo.guid || !videoInfo.videoUrl) {

          console.log(
              `MyVizbeeConverters::deeplinkHandler - INVALID videoInfo, MISSING guid or videoUrl`
          );
          console.warn('MyVizbeeHandlers::deeplinkHandler - INVALID videoInfo, MISSING guid or videoUrl');
          return;
      }

      return {
        id: videoInfo.guid,
        src: videoInfo.videoUrl,
        startTime: videoInfo.starttime,
        title: videoInfo.title,
        imageUrl: videoInfo.imgUrl
      };
    }
  }