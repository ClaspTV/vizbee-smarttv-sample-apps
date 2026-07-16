// Public HLS test streams. TVs/Safari play HLS natively; desktop browsers
// use an HLS.js shim PlayerPage lazy-loads. Posters are Picsum placeholders.

export interface VideoInfo {
  id: string;
  isLive?: boolean;
  title: string;
  description: string;
  posterUrl: string;
  videoUrl: string;
  durationSec: number;
}

export const VIDEOS: readonly VideoInfo[] = [
  {
    id: 'tears-of-steel',
    isLive: false,
    title: 'Tears of Steel',
    description:
      'Sci-fi short with live action and CG, demonstrating Blender VFX in production.',
    posterUrl: 'https://picsum.photos/seed/tears-of-steel/960/540',
    videoUrl:
      'https://demo.unified-streaming.com/k8s/features/stable/video/tears-of-steel/tears-of-steel.ism/.m3u8',
    durationSec: 734,
  },
  {
    id: 'apple-bipbop',
    isLive: false,
    title: 'Apple BipBop',
    description:
      "Apple's reference advanced HLS stream — multiple bitrates, audio renditions, and captions.",
    posterUrl: 'https://picsum.photos/seed/apple-bipbop/960/540',
    videoUrl:
      'https://devstreaming-cdn.apple.com/videos/streaming/examples/img_bipbop_adv_example_ts/master.m3u8',
    durationSec: 600,
  },
  {
    id: 'mux-test-stream',
    isLive: false,
    title: 'Mux Test Stream',
    description:
      'A multi-bitrate HLS test reel hosted by Mux for adaptive-streaming validation.',
    posterUrl: 'https://picsum.photos/seed/mux-test-stream/960/540',
    videoUrl: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
    durationSec: 888,
  },
];

// Videos arriving at runtime (e.g. a Vizbee cast/deeplink) aren't in the
// static catalog; register them here so the player can resolve them by id.
const dynamicVideos = new Map<string, VideoInfo>();

export function registerVideo(video: VideoInfo): void {
  dynamicVideos.set(video.id, video);
}

export function findVideo(id: string): VideoInfo | undefined {
  return dynamicVideos.get(id) ?? VIDEOS.find((v) => v.id === id);
}
