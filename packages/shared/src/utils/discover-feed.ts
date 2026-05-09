export type WarningLevel = 'none' | 'low' | 'medium' | 'high' | 'critical';

export type DiscoverFeedSource = { name: string; url?: string };

export type DiscoverFeedItem = {
  id: string;
  title: string;
  summary: string;
  timestamp: string | Date;
  isAnomaly: boolean;
  warningLevel: WarningLevel;
  sources: DiscoverFeedSource[] | null;
};

export const WARNING_LEVELS: readonly WarningLevel[] = [
  'none',
  'low',
  'medium',
  'high',
  'critical',
] as const;

export function isWithinLast24Hours(date: string | Date): boolean {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return false;
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  return d > twentyFourHoursAgo;
}

const PII_PATTERNS: { name: string; regex: RegExp; replacement: string }[] = [
  { name: 'eth_address', regex: /\b0x[a-fA-F0-9]{40}\b/g, replacement: '[wallet]' },
  { name: 'tx_hash', regex: /\b0x[a-fA-F0-9]{64}\b/g, replacement: '[tx]' },
  { name: 'ens_name', regex: /\b[a-zA-Z0-9-]+\.eth\b/g, replacement: '[ens]' },
  { name: 'email', regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, replacement: '[email]' },
  { name: 'ipv4', regex: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g, replacement: '[ip]' },
  { name: 'phone', regex: /\b\+?\d{1,3}[-.\s]?\(?\d{1,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{4}\b/g, replacement: '[phone]' },
];

export function scrubPii(input: string): string {
  let out = input;
  for (const p of PII_PATTERNS) out = out.replace(p.regex, p.replacement);
  return out;
}

export function containsPii(input: string): boolean {
  return PII_PATTERNS.some((p) => p.regex.test(input));
}
