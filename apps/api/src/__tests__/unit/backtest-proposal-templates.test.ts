import { describe, expect, test } from 'bun:test';
import { BACKTEST_PROPOSAL_TEMPLATES, rankTemplates } from '@/router/services/backtest-proposal-templates';
import { VibeTradingJobSchema } from '@/router/services/vibe-trading-schema';
import { proposeBacktestStrategies } from '@/router/services/vibe-trading';

describe('backtest proposal templates', () => {
  test('asset + timeframe substitution works', () => {
    const payload = BACKTEST_PROPOSAL_TEMPLATES[0].build('ETH-USDT', '1h');
    expect(payload.context_rules.assets).toEqual(['ETH-USDT']);
    expect(payload.context_rules.timeframe).toBe('1h');
  });

  test('every template payload validates against VibeTradingJobSchema (module-load mirror, both exchanges)', () => {
    // Spec AC8: "each template passes VibeTradingJobSchema.safeParse" — mirror of the
    // module-load assertion, covers BOTH crypto/okx and stocks/yfinance branches.
    for (const template of BACKTEST_PROPOSAL_TEMPLATES) {
      const crypto = VibeTradingJobSchema.safeParse(template.build('BTC-USDT', '4h'));
      expect(crypto.success).toBe(true);
      const stock = VibeTradingJobSchema.safeParse(template.build('AAPL', '1d'));
      expect(stock.success).toBe(true);
    }
  });

  test('count=5 uniqueness can be achieved by ranked templates', () => {
    const ranked = rankTemplates('conservative trend breakout mean reversion dca').slice(0, 5);
    const families = ranked.map((t) => t.family);
    expect(new Set(families).size).toBe(5);
  });

  test('hint ranking favors expected families (incl. DCA case)', () => {
    expect(rankTemplates('conservative')[0].family).toBe('conservative_dca');
    expect(rankTemplates('trend')[0].family.startsWith('trend_')).toBe(true);
    expect(rankTemplates('breakout')[0].family).toBe('breakout');
    expect(rankTemplates('mean reversion')[0].family).toBe('mean_reversion_rsi');
    // Spec AC8 explicitly listed "DCA" as a required hint case.
    expect(rankTemplates('dca')[0].family).toBe('conservative_dca');
  });

  test('proposeBacktestStrategies rotates to unused family when hint scores would pick the same twice', () => {
    // Spec AC8: "When hint scoring would pick the same family twice, service rotates to
    // next-best unused family." Ask for count=5 with a hint that strongly favors one family;
    // verify the result still has 5 unique families (uniqueness guarantee).
    const result = proposeBacktestStrategies({
      asset: 'BTC-USDT',
      count: 5,
      hint: 'conservative conservative conservative',
      timeframe: '4h',
      caller_tier: 'tier2',
    });
    const families = result.proposals.map((p) => p.strategy_family);
    expect(new Set(families).size).toBe(5);
  });
});
