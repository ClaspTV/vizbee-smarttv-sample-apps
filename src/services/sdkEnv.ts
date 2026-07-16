import type { FeatureFlags } from '@/services/feature-flags/flags';

// Origin host the SDK <script> loads from, per `sdkEnv`: dev/qa = S3 buckets,
// prod = CloudFront CDN (qa also via CloudFront; raw S3 returns 403).
export const SDK_ORIGIN_BY_ENV: Record<FeatureFlags['sdkEnv'], string> = {
  dev: 'https://vzb-origin-dev.s3.amazonaws.com',
  qa: 'https://d1a16fhfuhnwgt.cloudfront.net',
  prod: 'https://sdk.claspws.tv',
};

export function sdkOrigin(env: FeatureFlags['sdkEnv']): string {
  return SDK_ORIGIN_BY_ENV[env];
}
