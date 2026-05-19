import { describe, expect, test } from 'bun:test';
import {
  computeCorrelationMatrix,
  pearsonCorrelation,
  returnsFromEquityCurve,
} from '../comparison-visualizer.utils';

describe('comparison visualizer utils', () => {
  test('returnsFromEquityCurve computes log returns', () => {
    const out = returnsFromEquityCurve([{ value: 100 }, { value: 110 }, { value: 121 }]);
    expect(out.length).toBe(2);
    expect(out[0]).toBeCloseTo(Math.log(1.1), 10);
    expect(out[1]).toBeCloseTo(Math.log(1.1), 10);
  });

  test('pearsonCorrelation gives +1 for perfectly correlated series', () => {
    const r = pearsonCorrelation([1, 2, 3, 4], [2, 4, 6, 8]);
    expect(r).toBeCloseTo(1, 10);
  });

  test('computeCorrelationMatrix gives expected shape and diagonal', () => {
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
});
