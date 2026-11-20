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
