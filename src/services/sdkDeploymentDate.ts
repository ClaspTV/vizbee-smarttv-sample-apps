// Resolves an SDK script's deployment date (S3/CloudFront Last-Modified) via GET
// (HEAD is CORS-blocked). Returns a local date+time string, or null if unavailable.
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
