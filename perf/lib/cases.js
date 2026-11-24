// @ts-check
'use strict';

/** @typedef {{ id: string, title: string, url: string }} Video */

/**
 * Videos under test (ids match src/data/videos.ts; url is for preflight checks).
 * Rotated in this order across runs, identically for every case, so run i is
 * paired across cases.
 * @type {Video[]}
 */
export const VIDEOS = [
  {
    id: 'tears-of-steel',
    title: 'Tears of Steel',
    url: 'https://demo.unified-streaming.com/k8s/features/stable/video/tears-of-steel/tears-of-steel.ism/.m3u8',
  },
  {
    id: 'apple-bipbop',
    title: 'Apple BipBop',
    url: 'https://devstreaming-cdn.apple.com/videos/streaming/examples/img_bipbop_adv_example_ts/master.m3u8',
  },
  {
    id: 'mux-test-stream',
    title: 'Mux Test Stream',
    url: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
  },
];

/**
 * Long-form VODs (> 20 min) for the long playback run (perf-long.js). The ids
 * match the catalog entries in src/data/videos.ts, so a `#/player/<id>`
 * deep-link resolves on the TV; url is for the preflight stream check.
 * @type {Record<string, { id: string, title: string, url: string, durationSec?: number, isLive?: boolean }>}
 */
export const LONG_VIDEOS = {
  'wwdc-2015': {
    id: 'wwdc-2015',
    title: 'WWDC 2015 Session (34 min)',
    durationSec: 2040,
    url: 'https://devstreaming-cdn.apple.com/videos/wwdc/2015/413eflf3lrh1tyo/413/hls_vod_mvp.m3u8',
  },
  'wwdc-2017': {
    id: 'wwdc-2017',
    title: 'WWDC 2017 Keynote (103 min)',
    durationSec: 6180,
    url: 'https://devstreaming-cdn.apple.com/videos/wwdc/2017/102xyar2647hak3e/102/hls_vod_mvp.m3u8',
  },
};

/** Default long video and ordered fallbacks if it will not play. */
export const LONG_VIDEO = 'wwdc-2015';
export const LONG_FALLBACK = ['wwdc-2017'];

/**
 * @typedef {{
 *   key: string,
 *   label: string,
 *   withVizbee: boolean,
 *   npmPackage: string,
 *   sender: boolean
 * }} Case
 */

/**
 * The elementless npm variant is the one under test.
 * @type {Record<'without' | 'nosender' | 'sender', Case>}
 */
export const CASES = {
  without: {
    key: 'without',
    label: 'Without Vizbee',
    withVizbee: false,
    npmPackage: '',
    sender: false,
  },
  nosender: {
    key: 'nosender',
    label: 'With Vizbee (no sender)',
    withVizbee: true,
    npmPackage: '@vizbeetv/sdk/vizio-el/es5',
    sender: false,
  },
  sender: {
    key: 'sender',
    label: 'With Vizbee (sender connected)',
    withVizbee: true,
    npmPackage: '@vizbeetv/sdk/vizio-el/es5',
    sender: true,
  },
};
