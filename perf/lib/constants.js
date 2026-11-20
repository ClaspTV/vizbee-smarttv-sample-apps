// @ts-check
'use strict';

/** Phase + sampling timing. Overridable via env in perf-e2e for quick runs. */
export const HOME_MS = 180000;
export const PLAYBACK_MS = 180000;
export const INTERVAL_MS = 5000;
/** Memory = average of the last 60s of a phase (playback buffers for ~2 min). */
export const MEM_WINDOW_MS = 60000;
/** How long to wait for a [VZBPERF] marker before failing a run. */
export const MARKER_TIMEOUT_MS = 45000;
