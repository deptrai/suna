import { getToolCost } from '../../config';

export type StrategyFamily =
  | 'trend_sma'
  | 'trend_ema'
  | 'mean_reversion_rsi'
  | 'breakout'
  | 'conservative_dca';

export interface ProposalPayload {
  simulation_environment: {
    exchange: string;
    instrument_type: 'SPOT' | 'PERPETUAL';
    initial_capital: string;
    historical_range: number;
  };
  risk_management: {
    max_drawdown_percentage: string;
    position_sizing: string;
    stop_loss?: string;
    take_profit?: string;
  };
  context_rules: {
    assets: string[];
    timeframe: string;
    indicators: string[];
    natural_language_rules: string;
  };
  execution_flags?: {
    enable_monte_carlo_stress_test?: boolean;
    enable_rl_optimization?: boolean;
  };
}

export interface ProposalTemplate {
  family: StrategyFamily;
  label: string;
  summary: string;
  keywords: string[];
  build: (asset: string, timeframe: string) => ProposalPayload;
}

function exchangeFor(asset: string): string {
  return asset.includes('-') ? 'okx' : 'yfinance';
}

function baseEnv(asset: string, timeframe: string, initialCapital: string, historicalRange: number) {
  return {
    simulation_environment: {
      exchange: exchangeFor(asset),
      instrument_type: 'SPOT' as const,
      initial_capital: initialCapital,
      historical_range: historicalRange,
    },
    context_rules: {
      assets: [asset],
      timeframe,
      indicators: [] as string[],
      natural_language_rules: '',
    },
  };
}

export const BACKTEST_PROPOSAL_TEMPLATES: ProposalTemplate[] = [
  {
    family: 'trend_sma',
    label: 'Conservative SMA crossover',
    summary: 'Conservative SMA crossover with small position sizing and strict risk controls.',
    keywords: ['conservative', 'safe', 'sma', 'trend'],
    build: (asset, timeframe) => {
      const base = baseEnv(asset, timeframe, '10000', 90);
      return {
        ...base,
        risk_management: {
          max_drawdown_percentage: '0.10',
          position_sizing: '0.10',
          stop_loss: '0.03',
          take_profit: '0.08',
        },
        context_rules: {
          ...base.context_rules,
          indicators: ['SMA_50', 'SMA_200'],
          natural_language_rules: 'Long when SMA 50 crosses above SMA 200; exit on reverse cross.',
        },
      };
    },
  },
  {
    family: 'trend_ema',
    label: 'Trend-following EMA',
    summary: 'EMA trend-following with moderate risk and wider trend capture.',
    keywords: ['trend', 'ema', 'momentum', 'follow'],
    build: (asset, timeframe) => {
      const base = baseEnv(asset, timeframe, '12000', 120);
      return {
        ...base,
        risk_management: {
          max_drawdown_percentage: '0.15',
          position_sizing: '0.15',
          stop_loss: '0.05',
          take_profit: '0.12',
        },
        context_rules: {
          ...base.context_rules,
          indicators: ['EMA_20', 'EMA_50'],
          natural_language_rules: 'Enter when EMA 20 is above EMA 50 and price confirms uptrend.',
        },
      };
    },
  },
  {
    family: 'mean_reversion_rsi',
    label: 'Mean reversion RSI',
    summary: 'Mean-reversion setup using RSI oversold/overbought boundaries.',
    keywords: ['mean reversion', 'rsi', 'reversion', 'oversold', 'overbought'],
    build: (asset, timeframe) => {
      const base = baseEnv(asset, timeframe, '10000', 60);
      return {
        ...base,
        risk_management: {
          max_drawdown_percentage: '0.12',
          position_sizing: '0.12',
          stop_loss: '0.04',
          take_profit: '0.07',
        },
        context_rules: {
          ...base.context_rules,
          indicators: ['RSI_14', 'BBANDS_20_2'],
          natural_language_rules: 'Buy when RSI < 30 near lower Bollinger band; sell when RSI > 65.',
        },
      };
    },
  },
  {
    family: 'breakout',
    label: 'Volatility breakout',
    summary: 'Breakout strategy focused on range expansion and momentum continuation.',
    keywords: ['breakout', 'volatility', 'range break', 'momentum'],
    build: (asset, timeframe) => {
      const base = baseEnv(asset, timeframe, '15000', 180);
      return {
        ...base,
        risk_management: {
          max_drawdown_percentage: '0.20',
          position_sizing: '0.18',
          stop_loss: '0.06',
          take_profit: '0.18',
        },
        context_rules: {
          ...base.context_rules,
          indicators: ['ATR_14', 'DONCHIAN_20'],
          natural_language_rules: 'Enter on 20-period high breakout with ATR filter; trail stop by ATR.',
        },
      };
    },
  },
  {
    family: 'conservative_dca',
    label: 'Conservative DCA',
    summary: 'Conservative dollar-cost-averaging profile with tight drawdown guardrails.',
    keywords: ['dca', 'conservative', 'long-term', 'accumulate'],
    build: (asset, timeframe) => {
      const base = baseEnv(asset, timeframe, '8000', 365);
      return {
        ...base,
        risk_management: {
          max_drawdown_percentage: '0.08',
          position_sizing: '0.08',
          stop_loss: '0.03',
          take_profit: '0.10',
        },
        context_rules: {
          ...base.context_rules,
          indicators: ['SMA_100'],
          natural_language_rules: 'Accumulate on periodic schedule when price stays above SMA 100.',
        },
      };
    },
  },
];

export function scoreTemplate(hint: string | undefined, template: ProposalTemplate): number {
  if (!hint) return 0;
  const lower = hint.toLowerCase();
  let score = 0;
  for (const kw of template.keywords) {
    if (lower.includes(kw)) score += 2;
  }
  if (lower.includes('conservative') && template.family === 'conservative_dca') score += 2;
  if (lower.includes('trend') && (template.family === 'trend_sma' || template.family === 'trend_ema')) score += 2;
  return score;
}

export function rankTemplates(hint: string | undefined): ProposalTemplate[] {
  return [...BACKTEST_PROPOSAL_TEMPLATES].sort((a, b) => scoreTemplate(hint, b) - scoreTemplate(hint, a));
}

export function proposalUnitCostCredits(): number {
  return getToolCost('vibe_trading_backtest', 0);
}
