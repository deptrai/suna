import { z } from 'zod';

const SESSION_ID = z.string().max(128).regex(/^[A-Za-z0-9_-]+$/).optional();

export const VibeTradingJobSchema = z
  .object({
    simulation_environment: z.object({
      exchange: z.string().min(1),
      instrument_type: z.enum(['SPOT', 'PERPETUAL']),
      initial_capital: z.string(),
      trading_fees: z.string().optional(),
      slippage_tolerance: z.string().optional(),
      historical_range: z.number().int().min(1).max(730),
      gas_fee_model: z.string().optional(),
      track_impermanent_loss: z.boolean().optional(),
    }),
    risk_management: z.object({
      max_drawdown_percentage: z.string(),
      stop_loss: z.string().optional(),
      take_profit: z.string().optional(),
      position_sizing: z.string(),
      leverage: z.string().optional(),
    }),
    context_rules: z.object({
      assets: z.array(z.string()).min(1),
      timeframe: z.string().regex(/^\d+[mhdwHMD]$/),
      indicators: z.array(z.string()).optional(),
      natural_language_rules: z.string().max(10000).optional(),
      executable_code: z.string().max(50000).optional(),
    }),
    execution_flags: z
      .object({
        enable_monte_carlo_stress_test: z.boolean().optional(),
        enable_rl_optimization: z.boolean().optional(),
      })
      .optional(),
    session_id: SESSION_ID,
  })
  .refine(
    (d) =>
      !(
        d.simulation_environment.instrument_type === 'SPOT' &&
        d.risk_management.leverage &&
        Number(d.risk_management.leverage) > 1.0
      ),
    { message: 'Leverage greater than 1.0 is not supported for SPOT instruments.' },
  );

