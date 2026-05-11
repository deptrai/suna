import { describe, test, expect } from 'bun:test';
import { isStrategy, extractInitialProps } from '../contextual-backtest-trigger.utils';

describe('ContextualBacktestTrigger Utils', () => {
  describe('isStrategy', () => {
    test('returns false if not a strategy', () => {
      expect(isStrategy('{"foo": "bar"}')).toBe(false);
      expect(isStrategy('simulation_environment only')).toBe(false);
    });

    test('returns true if code contains simulation_environment and context_rules', () => {
      const code = JSON.stringify({
        simulation_environment: {},
        context_rules: {}
      });
      expect(isStrategy(code)).toBe(true);
    });
  });

  describe('extractInitialProps', () => {
    test('returns default props if json parsing fails', () => {
      const { initialAsset, initialTimeframe } = extractInitialProps('invalid json');
      expect(initialAsset).toBe('BTC-USDT');
      expect(initialTimeframe).toBe('4h');
    });

    test('returns default props if fields are missing', () => {
      const { initialAsset, initialTimeframe } = extractInitialProps('{}');
      expect(initialAsset).toBe('BTC-USDT');
      expect(initialTimeframe).toBe('4h');
    });

    test('extracts asset and timeframe correctly', () => {
      const code = JSON.stringify({
        context_rules: {
          assets: ['ETH-USDT'],
          timeframe: '1d'
        }
      });
      const { initialAsset, initialTimeframe } = extractInitialProps(code);
      expect(initialAsset).toBe('ETH-USDT');
      expect(initialTimeframe).toBe('1d');
    });
  });
});
