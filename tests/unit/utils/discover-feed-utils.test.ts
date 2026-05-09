import { describe, test, expect } from 'bun:test';
import { isWithinLast24Hours, scrubPii, containsPii } from '../../../packages/shared/src/utils/discover-feed';

function makeFeedItem(overrides: Partial<{
  id: string;
  title: string;
  summary: string;
  timestamp: Date;
  isAnomaly: boolean;
  warningLevel: 'none' | 'low' | 'medium' | 'high' | 'critical';
  sources: { name: string; url?: string }[] | null;
}> = {}) {
  return {
    id: 'test-id-1',
    title: 'Test Title',
    summary: 'Test summary of the crypto event.',
    timestamp: new Date(),
    isAnomaly: false,
    warningLevel: 'none' as const,
    sources: [{ name: 'CoinDesk', url: 'https://coindesk.com' }],
    ...overrides,
  };
}

describe('isWithinLast24Hours', () => {
  test('[P0] should return true for a date 1 minute ago', () => {
    const oneMinuteAgo = new Date(Date.now() - 60 * 1000);
    expect(isWithinLast24Hours(oneMinuteAgo)).toBe(true);
  });

  test('[P0] should return true for a date 23 hours ago', () => {
    const twentyThreeHoursAgo = new Date(Date.now() - 23 * 60 * 60 * 1000);
    expect(isWithinLast24Hours(twentyThreeHoursAgo)).toBe(true);
  });

  test('[P0] should return false for a date 25 hours ago', () => {
    const twentyFiveHoursAgo = new Date(Date.now() - 25 * 60 * 60 * 1000);
    expect(isWithinLast24Hours(twentyFiveHoursAgo)).toBe(false);
  });

  test('[P0] should return false for a date 7 days ago', () => {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    expect(isWithinLast24Hours(sevenDaysAgo)).toBe(false);
  });

  test('[P1] should return true for a future date (edge case)', () => {
    const futureDate = new Date(Date.now() + 60 * 1000);
    expect(isWithinLast24Hours(futureDate)).toBe(true);
  });

  test('[P1] should return false for epoch (very old date)', () => {
    expect(isWithinLast24Hours(new Date(0))).toBe(false);
  });

  test('[P1] accepts ISO string timestamp', () => {
    const iso = new Date(Date.now() - 60 * 1000).toISOString();
    expect(isWithinLast24Hours(iso)).toBe(true);
  });

  test('[P1] returns false for invalid date string', () => {
    expect(isWithinLast24Hours('not-a-date')).toBe(false);
  });
});

describe('Early Warning Badge Visibility Logic', () => {
  test('[P0] should show early warning badge when isAnomaly=true AND within 24h', () => {
    const item = makeFeedItem({
      isAnomaly: true,
      warningLevel: 'high',
      timestamp: new Date(Date.now() - 60 * 1000),
    });
    expect(item.isAnomaly && isWithinLast24Hours(item.timestamp)).toBe(true);
  });

  test('[P0] should NOT show badge when older than 24h', () => {
    const item = makeFeedItem({
      isAnomaly: true,
      timestamp: new Date(Date.now() - 25 * 60 * 60 * 1000),
    });
    expect(item.isAnomaly && isWithinLast24Hours(item.timestamp)).toBe(false);
  });

  test('[P0] should NOT show badge when isAnomaly=false even if within 24h', () => {
    const item = makeFeedItem({
      isAnomaly: false,
      timestamp: new Date(Date.now() - 60 * 1000),
    });
    expect(item.isAnomaly && isWithinLast24Hours(item.timestamp)).toBe(false);
  });
});

describe('PII Scrubber', () => {
  test('[P0] strips Ethereum wallet hex addresses', () => {
    const input = 'Whale 0x1234567890abcdef1234567890abcdef12345678 moved 5000 ETH';
    expect(scrubPii(input)).toBe('Whale [wallet] moved 5000 ETH');
  });

  test('[P0] strips transaction hashes (64 hex)', () => {
    const tx = '0x' + 'a'.repeat(64);
    expect(scrubPii(`Tx ${tx} confirmed`)).toBe('Tx [tx] confirmed');
  });

  test('[P0] strips ENS names', () => {
    expect(scrubPii('vitalik.eth sent ETH')).toBe('[ens] sent ETH');
  });

  test('[P0] strips email addresses', () => {
    expect(scrubPii('contact alice@example.com')).toBe('contact [email]');
  });

  test('[P0] strips IPv4 addresses', () => {
    expect(scrubPii('From 192.168.1.42 today')).toBe('From [ip] today');
  });

  test('[P1] containsPii flags scrubbable strings', () => {
    expect(containsPii('vitalik.eth')).toBe(true);
    expect(containsPii('benign text without PII')).toBe(false);
  });
});
