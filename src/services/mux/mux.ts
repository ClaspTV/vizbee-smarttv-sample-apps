type MuxEmbed = {
  monitor: (el: HTMLVideoElement, opts: Record<string, unknown>) => void;
};

const MUX_EMBED_URL = 'https://cdn.jsdelivr.net/npm/mux-embed@5.9.0/dist/mux.js';

let muxLoader: Promise<MuxEmbed | null> | undefined;

function loadMuxEmbed(): Promise<MuxEmbed | null> {
  if (muxLoader) return muxLoader;
  muxLoader = new Promise<MuxEmbed | null>((resolve) => {
    const existing = (window as unknown as { mux?: MuxEmbed }).mux;
    if (existing) {
      resolve(existing);
      return;
    }
    const script = document.createElement('script');
    script.src = MUX_EMBED_URL;
    script.onload = () => resolve((window as unknown as { mux?: MuxEmbed }).mux ?? null);
    script.onerror = () => resolve(null);
    document.head.appendChild(script);
  });
  return muxLoader;
}

export interface MuxMonitorOptions {
  hls?: unknown;
  Hls?: unknown;
  videoId: string;
  videoTitle: string;
}

export function attachMuxMonitor(videoEl: HTMLVideoElement, opts: MuxMonitorOptions): void {
  if (!__MUX_ENABLED__) return;
  const initTime = Date.now();
  loadMuxEmbed().then((mux) => {
    if (!mux) {
      console.warn('[MUX] mux-embed failed to load');
      return;
    }
    mux.monitor(videoEl, {
      debug: false,
      ...(opts.hls ? { hlsjs: opts.hls, Hls: opts.Hls } : {}),
      data: {
        env_key: __MUX_ENV_KEY__,
        player_name: 'Vizbee Sample Webapp',
        player_init_time: initTime,
        video_id: opts.videoId,
        video_title: opts.videoTitle,
        video_stream_type: 'on-demand',
      },
    });
    console.log('[MUXPERF] mux monitoring attached');
  });
}
