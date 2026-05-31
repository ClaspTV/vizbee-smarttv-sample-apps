import type { FeatureFlags } from '@/services/feature-flags/flags';

// Origin (scheme + host) the Vizbee/HomeSSO SDK <script> loads from, per
// environment. This axis is orthogonal to the full/light × ES5/ES6 variant —
// `sdkEnv` only swaps the host, the variant decides the path under it.
//   dev / qa → the S3 origin buckets (reachable from any network)
//   prod     → the public CloudFront CDN
// Selected via the `sdkEnv` Settings flag (default 'prod'); applies to script
// builds only — npm builds bundle the SDK from node_modules regardless of env.
//
// NOTE the hosts are not uniform: the dev bucket is publicly readable over its
// raw S3 URL, but the qa bucket is private and is only reachable through its
// CloudFront distribution (E12EF2Z11SO5GL → d1a16fhfuhnwgt) — the raw
// vzb-origin-qa.s3.amazonaws.com URL returns 403. prod is the public CDN.
export const SDK_ORIGIN_BY_ENV: Record<FeatureFlags['sdkEnv'], string> = {
  dev: 'https://vzb-origin-dev.s3.amazonaws.com',
  qa: 'https://d1a16fhfuhnwgt.cloudfront.net',
  prod: 'https://sdk.claspws.tv',
};

export function sdkOrigin(env: FeatureFlags['sdkEnv']): string {
  return SDK_ORIGIN_BY_ENV[env];
}
