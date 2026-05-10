export function getCanonicalBaseUrl(): string {
  return process.env.CHAINLENS_BASE_URL ?? 'https://app.chainlens.com';
}
