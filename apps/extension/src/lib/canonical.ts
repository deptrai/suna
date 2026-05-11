export function getCanonicalBaseUrl(): string {
  if (typeof process !== 'undefined' && process.env && process.env.CHAINLENS_BASE_URL) {
    return process.env.CHAINLENS_BASE_URL;
  }
  return 'https://app.chainlens.com';
}
