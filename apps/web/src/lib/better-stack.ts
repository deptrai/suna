type BetterStackEnv = {
  NEXT_PUBLIC_ENV_MODE?: string;
  NEXT_PUBLIC_EPSILON_ENV?: string;
  NEXT_PUBLIC_SENTRY_DSN?: string;
  NEXT_PUBLIC_BETTER_STACK_SOURCE_TOKEN?: string;
};

const PROD_LIKE_ENVS = new Set(['production', 'prod', 'staging']);

export function isBetterStackEnvEnabled(env: BetterStackEnv): boolean {
  if (env.NEXT_PUBLIC_ENV_MODE === 'cloud') return true;

  const epsilonEnv = (env.NEXT_PUBLIC_EPSILON_ENV || '').toLowerCase();
  return PROD_LIKE_ENVS.has(epsilonEnv);
}

export function isBetterStackSentryEnabled(env: BetterStackEnv): boolean {
  return isBetterStackEnvEnabled(env) && Boolean(env.NEXT_PUBLIC_SENTRY_DSN);
}

export function isBetterStackLoggingEnabled(env: BetterStackEnv): boolean {
  return isBetterStackEnvEnabled(env) && Boolean(env.NEXT_PUBLIC_BETTER_STACK_SOURCE_TOKEN);
}
