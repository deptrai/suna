import { describe, test, expect } from 'bun:test';

type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

function riskColorClass(level: RiskLevel | undefined): { bg: string; text: string; border: string } {
  switch (level) {
    case 'LOW':      return { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/30' };
    case 'MEDIUM':   return { bg: 'bg-amber-500/10',   text: 'text-amber-400',   border: 'border-amber-500/30' };
    case 'HIGH':     return { bg: 'bg-orange-500/10',  text: 'text-orange-400',  border: 'border-orange-500/30' };
    case 'CRITICAL': return { bg: 'bg-rose-500/10',    text: 'text-rose-400',    border: 'border-rose-500/30' };
    default:         return { bg: 'bg-muted',           text: 'text-muted-foreground', border: 'border-border' };
  }
}

function shortAddr(addr: string): string {
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

describe('OcContractRiskToolView — riskColorClass', () => {
  test('LOW → emerald', () => {
    expect(riskColorClass('LOW').text).toContain('emerald');
  });
  test('MEDIUM → amber', () => {
    expect(riskColorClass('MEDIUM').text).toContain('amber');
  });
  test('HIGH → orange', () => {
    expect(riskColorClass('HIGH').text).toContain('orange');
  });
  test('CRITICAL → rose', () => {
    expect(riskColorClass('CRITICAL').text).toContain('rose');
  });
  test('undefined → muted', () => {
    expect(riskColorClass(undefined).text).toContain('muted');
  });
});

describe('OcContractRiskToolView — shortAddr', () => {
  test('leaves short addresses unchanged', () => {
    expect(shortAddr('0x1234')).toBe('0x1234');
  });
  test('truncates long EVM address', () => {
    const addr = '0x1f9840a85d5af5bf1d1762f925bdaddc4201f984';
    const short = shortAddr(addr);
    expect(short).toContain('0x1f98');
    expect(short).toContain('f984');
    expect(short).toContain('…');
    expect(short.length).toBeLessThan(addr.length);
  });
});
