import { describe, test, expect } from 'bun:test';
import { compareValues, formatCurrency, formatPercentSigned } from './protocols-table';

describe('formatCurrency', () => {
  test('formats billions with B suffix', () => {
    expect(formatCurrency(1_500_000_000)).toBe('$1.50B');
  });
  test('formats millions with M suffix', () => {
    expect(formatCurrency(2_500_000)).toBe('$2.50M');
  });
  test('formats sub-million with locale separators', () => {
    expect(formatCurrency(5_000)).toBe('$5,000');
  });
  test('returns em-dash for non-finite input', () => {
    expect(formatCurrency(NaN)).toBe('—');
    expect(formatCurrency(Infinity)).toBe('—');
  });
});

describe('formatPercentSigned', () => {
  test('prefixes positive with +', () => {
    expect(formatPercentSigned(1.23)).toBe('+1.23%');
  });
  test('prefixes zero with + (matches the >=0 color rule)', () => {
    expect(formatPercentSigned(0)).toBe('+0.00%');
  });
  test('keeps minus for negative without double sign', () => {
    expect(formatPercentSigned(-5.5)).toBe('-5.50%');
  });
});

describe('compareValues', () => {
  test('sorts numbers ascending', () => {
    const arr = [3, 1, 2];
    arr.sort((a, b) => compareValues(a, b, false));
    expect(arr).toEqual([1, 2, 3]);
  });
  test('sorts numbers descending', () => {
    const arr = [3, 1, 2];
    arr.sort((a, b) => compareValues(a, b, true));
    expect(arr).toEqual([3, 2, 1]);
  });
  test('sorts strings via localeCompare', () => {
    const arr = ['Zeta', 'Alpha', 'Mike'];
    arr.sort((a, b) => compareValues(a, b, false));
    expect(arr).toEqual(['Alpha', 'Mike', 'Zeta']);
  });
  test('places null/undefined values last regardless of direction', () => {
    const ascending = [1, null, 3, undefined, 2];
    ascending.sort((a, b) => compareValues(a, b, false));
    expect(ascending.slice(0, 3)).toEqual([1, 2, 3]);
    expect(ascending[3] === null || ascending[3] === undefined).toBe(true);

    const descending = [1, null, 3, undefined, 2];
    descending.sort((a, b) => compareValues(a, b, true));
    expect(descending.slice(0, 3)).toEqual([3, 2, 1]);
  });
  test('returns 0 for arrays (sparkline column)', () => {
    expect(compareValues([1, 2], [3, 4], false)).toBe(0);
    expect(compareValues([1, 2], [3, 4], true)).toBe(0);
  });
  test('handles negative numbers correctly', () => {
    const arr = [-5, 10, -1, 3];
    arr.sort((a, b) => compareValues(a, b, true));
    expect(arr).toEqual([10, 3, -1, -5]);
  });
});
