import { describe, expect, test } from 'bun:test';
import {
  computeCorrelationMatrix,
  formatKpi,
  heatmapColor,
  pearsonCorrelation,
  returnsFromEquityCurve,
} from '../comparison-visualizer.utils';

// ---------------------------------------------------------------------------
// returnsFromEquityCurve
// ---------------------------------------------------------------------------

describe('returnsFromEquityCurve', () => {
  test('computes log returns', () => {
    const out = returnsFromEquityCurve([{ value: 100 }, { value: 110 }, { value: 121 }]);
    expect(out.length).toBe(2);
    expect(out[0]).toBeCloseTo(Math.log(1.1), 10);
    expect(out[1]).toBeCloseTo(Math.log(1.1), 10);
  });

  test('skips non-finite or non-positive values', () => {
    const out = returnsFromEquityCurve([{ value: 100 }, { value: 0 }, { value: 110 }]);
    expect(out.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// pearsonCorrelation
// ---------------------------------------------------------------------------

describe('pearsonCorrelation', () => {
  test('gives +1 for perfectly correlated series', () => {
    const r = pearsonCorrelation([1, 2, 3, 4], [2, 4, 6, 8]);
    expect(r).toBeCloseTo(1, 10);
  });

  test('gives -1 for perfectly anti-correlated series', () => {
    const r = pearsonCorrelation([1, 2, 3, 4], [8, 6, 4, 2]);
    expect(r).toBeCloseTo(-1, 10);
  });

  test('returns NaN for mismatched-length series', () => {
    const r = pearsonCorrelation([1, 2, 3], [1, 2]);
    expect(Number.isNaN(r)).toBe(true);
  });

  test('returns 0 for series shorter than 2', () => {
    expect(pearsonCorrelation([], [])).toBe(0);
    expect(pearsonCorrelation([1], [1])).toBe(0);
  });

  test('returns 0 for constant series (zero variance)', () => {
    expect(pearsonCorrelation([5, 5, 5], [1, 2, 3])).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// computeCorrelationMatrix
// ---------------------------------------------------------------------------

describe('computeCorrelationMatrix', () => {
  test('gives expected shape and diagonal', () => {
    const m = computeCorrelationMatrix([
      [{ value: 100 }, { value: 120 }, { value: 90 }, { value: 110 }],
      [{ value: 100 }, { value: 80 }, { value: 110 }, { value: 90 }],
    ]);
    expect(m).toHaveLength(2);
    expect(m[0]).toHaveLength(2);
    expect(m[0][0]).toBe(1);
    expect(m[1][1]).toBe(1);
    expect(m[0][1]).toBeCloseTo(m[1][0], 10);
    expect(m[0][1]).toBeLessThan(0);
  });

  test('off-diagonal is NaN when curves have different lengths (different historical_range)', () => {
    const m = computeCorrelationMatrix([
      [{ value: 100 }, { value: 110 }, { value: 120 }],
      [{ value: 100 }, { value: 90 }],
    ]);
    expect(Number.isNaN(m[0][1])).toBe(true);
    expect(Number.isNaN(m[1][0])).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// heatmapColor
// ---------------------------------------------------------------------------

describe('heatmapColor', () => {
  test('returns neutral gray for NaN (incomparable series)', () => {
    expect(heatmapColor(Number.NaN)).toBe('rgb(229, 231, 235)');
  });

  test('returns neutral gray for Infinity', () => {
    expect(heatmapColor(Infinity)).toBe('rgb(229, 231, 235)');
  });

  test('returns blue tint for positive correlation', () => {
    const color = heatmapColor(1);
    expect(color).toMatch(/^rgb\(/);
    expect(color).toContain('255)'); // ends with blue channel = 255
  });

  test('returns red tint for negative correlation', () => {
    const color = heatmapColor(-1);
    expect(color).toMatch(/^rgb\(255,/); // starts with red channel = 255
  });

  test('clamps values outside [-1, 1]', () => {
    expect(heatmapColor(2)).toBe(heatmapColor(1));
    expect(heatmapColor(-2)).toBe(heatmapColor(-1));
  });
});

// ---------------------------------------------------------------------------
// formatKpi (AC5: KPI table formatting)
// ---------------------------------------------------------------------------

describe('formatKpi', () => {
  test('formats max_drawdown as percent', () => {
    const result = formatKpi('max_drawdown', -0.12);
    expect(result).toContain('%');
  });

  test('formats cagr as percent', () => {
    const result = formatKpi('cagr', 0.25);
    expect(result).toContain('%');
  });

  test('formats win_rate as percent', () => {
    const result = formatKpi('win_rate', 0.6);
    expect(result).toContain('%');
  });

  test('formats max_loss as percent', () => {
    const result = formatKpi('max_loss', -0.05);
    expect(result).toContain('%');
  });

  test('formats sharpe as number (not percent)', () => {
    const result = formatKpi('sharpe', 1.5);
    expect(result).not.toContain('%');
  });

  test('handles null/undefined gracefully', () => {
    expect(() => formatKpi('sharpe', null)).not.toThrow();
    expect(() => formatKpi('max_drawdown', undefined)).not.toThrow();
  });
});
