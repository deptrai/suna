export function getCanonicalBaseUrl(): string {
  const raw = (typeof process !== 'undefined' && process.env && process.env.CHAINLENS_BASE_URL)
    ? process.env.CHAINLENS_BASE_URL
    : 'https://app.chainlens.com';
  // Strip trailing slash so downstream `${base}/path` interpolation doesn't produce //.
  return raw.replace(/\/$/, '');
}
