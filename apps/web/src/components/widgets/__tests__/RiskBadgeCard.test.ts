import { describe, test, expect } from 'bun:test';
import {
  riskColorClass,
  severityColorClass,
  severityDescription,
  relativeTimeFrom,
  shortAddr,
} from '../risk-badge-utils';

describe('riskColorClass', () => {
  test('LOW returns emerald classes', () => {
    const c = riskColorClass('LOW');
    expect(c.text).toContain('emerald');
    expect(c.bg).toContain('emerald');
    expect(c.border).toContain('emerald');
  });

  test('MEDIUM returns amber classes', () => {
    const c = riskColorClass('MEDIUM');
    expect(c.text).toContain('amber');
  });

  test('HIGH returns orange classes', () => {
    const c = riskColorClass('HIGH');
    expect(c.text).toContain('orange');
  });

  test('CRITICAL returns rose classes', () => {
    const c = riskColorClass('CRITICAL');
    expect(c.text).toContain('rose');
  });

  test('undefined returns muted fallback', () => {
    const c = riskColorClass(undefined);
    expect(c.bg).toContain('muted');
  });
});

describe('severityColorClass', () => {
  test('critical → rose', () => expect(severityColorClass('critical')).toContain('rose'));
  test('high → orange', () => expect(severityColorClass('high')).toContain('orange'));
  test('medium → amber', () => expect(severityColorClass('medium')).toContain('amber'));
  test('low → blue', () => expect(severityColorClass('low')).toContain('blue'));
  test('unknown → blue fallback', () => expect(severityColorClass('unknown')).toContain('blue'));
});

describe('severityDescription', () => {
  test('critical contains "scam" or "rug"', () => {
    const d = severityDescription('critical');
    expect(d.toLowerCase()).toMatch(/scam|rug|honeypot/);
  });

  test('high contains "red flag"', () => {
    expect(severityDescription('high').toLowerCase()).toContain('red flag');
  });

  test('medium contains "concern"', () => {
    expect(severityDescription('medium').toLowerCase()).toContain('concern');
  });

  test('low contains "minor"', () => {
    expect(severityDescription('low').toLowerCase()).toContain('minor');
  });

  test('unknown returns fallback string', () => {
    expect(severityDescription('unknown')).toBeTruthy();
  });
});

describe('relativeTimeFrom', () => {
  test('returns empty string for undefined', () => {
    expect(relativeTimeFrom(undefined)).toBe('');
  });

  test('returns empty string for invalid ISO', () => {
    expect(relativeTimeFrom('not-a-date')).toBe('');
  });

  test('returns "s ago" for recent timestamp', () => {
    const recent = new Date(Date.now() - 30_000).toISOString();
    expect(relativeTimeFrom(recent)).toMatch(/\ds ago/);
  });

  test('returns "m ago" for minutes-old timestamp', () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60_000).toISOString();
    expect(relativeTimeFrom(fiveMinAgo)).toMatch(/\dm ago/);
  });

  test('returns "h ago" for hours-old timestamp', () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60_000).toISOString();
    expect(relativeTimeFrom(twoHoursAgo)).toMatch(/\dh ago/);
  });

  test('returns "d ago" for days-old timestamp', () => {
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60_000).toISOString();
    expect(relativeTimeFrom(threeDaysAgo)).toMatch(/\dd ago/);
  });
});

describe('shortAddr', () => {
  test('truncates long address with ellipsis', () => {
    const addr = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
    const short = shortAddr(addr);
    expect(short).toContain('…');
    expect(short.startsWith('0xA0b8')).toBe(true);
    expect(short.endsWith('eB48')).toBe(true);
  });

  test('returns short address unchanged', () => {
    expect(shortAddr('0xshort')).toBe('0xshort');
  });

  test('returns exactly 12-char address unchanged', () => {
    expect(shortAddr('0x1234567890')).toBe('0x1234567890');
  });
});
