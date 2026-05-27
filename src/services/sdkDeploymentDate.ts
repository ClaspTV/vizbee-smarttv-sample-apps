// Resolves an SDK script's *deployment date+time* = the S3/CloudFront object's
// Last-Modified.
//
// The SDK bundles are served with `Access-Control-Allow-Origin: *` (verified on
// both the vzb-origin-dev bucket and the sdk.claspws.tv CloudFront), and
// Last-Modified is a CORS-safelisted response header, so in-browser JS can read
// it. Two gotchas drive the choice of a GET (not HEAD):
//   - the origin bucket only returns the ACAO header on GET, not HEAD, so a
//     HEAD fetch would be CORS-blocked;
//   - the bundle is already in the browser cache from its <script> load, and
//     the objects carry `Cache-Control: no-cache` + an ETag, so this GET is a
//     cheap conditional revalidation (304, no re-download).
//
// Returns a human date+time (e.g. "May 27, 2026, 5:41:47 AM GMT+5:30") rendered
// in the device's local timezone with a tz label, or null when the URL is
// cross-origin without CORS, unreachable, or the header is absent.
export async function fetchSdkDeploymentDate(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { method: 'GET' });
    const lastModified = res.headers.get('last-modified');
    if (!lastModified) return null;
    return formatSdkTimestamp(new Date(lastModified));
  } catch {
    return null;
  }
}

// Shared date+time formatter so script builds (Last-Modified) and npm builds
// (app build time) render identically. Returns null for an invalid date.
export function formatSdkTimestamp(date: Date): string | null {
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    timeZoneName: 'short',
  });
}
