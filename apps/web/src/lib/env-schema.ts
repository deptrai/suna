import { z } from 'zod'

const RuntimeEnvSchema = z.object({
  SUPABASE_URL: z.string().url('SUPABASE_URL must be a valid URL'),
  SUPABASE_ANON_KEY: z.string().min(1, 'SUPABASE_ANON_KEY is required'),
  BACKEND_URL: z.string().url('BACKEND_URL must be a valid URL'),
  ENV_MODE: z.enum(['local', 'cloud']).default('local'),
  APP_URL: z.string().url('APP_URL must be a valid URL').default('http://localhost:3000'),
  /** Sandbox id is optional. Local-mode fallback is resolved by caller logic. */
  SANDBOX_ID: z.string().optional(),
  /**
   * Explicit billing toggle. When 'false', disables billing UI even in cloud mode.
   * Useful when Stripe is not configured. Defaults to undefined (falls back to ENV_MODE).
   */
  BILLING_ENABLED: z.enum(['true', 'false']).optional(),
})

export type RuntimeEnv = z.infer<typeof RuntimeEnvSchema>

export function parseRuntimeEnv(raw: Partial<RuntimeEnv>): RuntimeEnv {
  const parsed = RuntimeEnvSchema.parse({
    ENV_MODE: 'local',
    ...raw,
  })
  if (parsed.ENV_MODE === 'cloud') {
    return { ...parsed, SANDBOX_ID: parsed.SANDBOX_ID || undefined }
  }
  return { ...parsed, SANDBOX_ID: parsed.SANDBOX_ID || 'epsilon-sandbox' }
}
