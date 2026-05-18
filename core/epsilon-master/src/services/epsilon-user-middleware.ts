/**
 * Hono middleware that verifies the signed `X-Epsilon-User-Context` header
 * on incoming requests and attaches the parsed context to the Hono context
 * under the `epsilonUser` key. Downstream handlers read it to make per-user
 * authorization decisions (project ACL, session scoping).
 *
 * No header → `epsilonUser` is absent (legacy / anonymous path). Any existing
 * route stays functional — user-aware logic layers on top without breaking
 * service-to-service traffic or pre-phase-1 clients.
 *
 * Invalid header → we log and treat as absent rather than 401, so the
 * authenticated `Authorization: Bearer <serviceKey>` layer (the existing
 * gate) still owns the hard access decision. The context header is purely
 * additive identity information.
 *
 * Story 5.0.2: On bad_signature, also (a) emit a structured log line for ops
 * alerting (Logtail/Loki rule on `event=sandbox.token.bad_signature`) and (b)
 * set response header `X-Epsilon-Token-Drift` so apps/api's sandbox-proxy can
 * trigger sync reconcile-and-retry. We do NOT change the silent-fallback-to-
 * anonymous semantics — service-to-service traffic still flows.
 */

import type { Context, Next } from 'hono'
import {
  EPSILON_USER_CONTEXT_HEADER,
  verifyEpsilonUserContext,
  type EpsilonUserContext,
} from './epsilon-user-context'
import { rememberUserScopes } from './user-scope-cache'

declare module 'hono' {
  interface ContextVariableMap {
    epsilonUser?: EpsilonUserContext
  }
}

// Story 5.0.2 AC1: rate-limit alerts to 1 per (sandbox, reason) per 5-min window.
// Ops alert rules should match `event=sandbox.token.<reason>` (5.0.2 review P7 —
// distinct event slug per reason so dashboards can categorize drift cause).
//
// 5.0.2 review P11: EPSILON_DRIFT_ALERTS_ENABLED env gate. Default ON in
// production; explicitly turn off in CI / test envs where fixture replay with
// stale signed tokens would create alert noise. shouldEmitAlert() returns
// false fast when disabled — no map mutation, no log line.
const RECENT_ALERTS = new Map<string, number>()
const ALERT_DEBOUNCE_MS = 5 * 60 * 1000

function driftAlertsEnabled(): boolean {
  const v = process.env.EPSILON_DRIFT_ALERTS_ENABLED
  if (v === undefined) return true // default ON in production
  return v === '1' || v.toLowerCase() === 'true'
}

function shouldEmitAlert(sandboxId: string, reason: string): boolean {
  if (!driftAlertsEnabled()) return false
  const key = `${sandboxId}|${reason}`
  const now = Date.now()
  const last = RECENT_ALERTS.get(key)
  if (last && now - last < ALERT_DEBOUNCE_MS) return false
  RECENT_ALERTS.set(key, now)
  // Opportunistic prune to cap memory growth (max 256 entries — well below pathological)
  if (RECENT_ALERTS.size > 256) {
    const cutoff = now - ALERT_DEBOUNCE_MS
    for (const [k, v] of RECENT_ALERTS.entries()) {
      if (v < cutoff) RECENT_ALERTS.delete(k)
    }
  }
  return true
}

export function epsilonUserContextMiddleware() {
  return async (c: Context, next: Next) => {
    const raw = c.req.header(EPSILON_USER_CONTEXT_HEADER)
    console.log(
      `[epsilon-user] ${c.req.method} ${c.req.path} header=${raw ? `present(${raw.slice(0, 16)}…)` : 'absent'}`,
    )
    if (!raw) {
      await next()
      return
    }

    const secret = process.env.EPSILON_TOKEN
    if (!secret) {
      console.warn('[epsilon-user] EPSILON_TOKEN unset; skipping verification')
      await next()
      return
    }

    const result = verifyEpsilonUserContext(raw, secret)
    if (!result.ok) {
      const sandboxId = process.env.SANDBOX_ID ?? 'unknown'
      const tokenPrefix = raw.slice(0, 16)
      // 5.0.2 review P4: do NOT log any portion of the signing secret. Even a
      // 16-char prefix in shipped logs materially reduces brute-force key space.

      console.warn(
        `[epsilon-user] Ignoring bad ${EPSILON_USER_CONTEXT_HEADER} (${result.reason}); continuing without user context`,
      )

      // Story 5.0.2 AC1: structured alert log (Logtail rule alerts when event_kind=token_drift fires).
      // 5.0.2 review P7: distinct event slug per reason for dashboard categorization.
      if (shouldEmitAlert(sandboxId, result.reason)) {
        console.warn(
          JSON.stringify({
            event: `sandbox.token.${result.reason}`,
            event_kind: 'token_drift',
            level: 'warning',
            sandboxId,
            reason: result.reason,
            requestMethod: c.req.method,
            requestPath: c.req.path,
            tokenPrefix,
            ts: new Date().toISOString(),
          }),
        )
      }

      // Story 5.0.2 AC2: signal drift back to caller so apps/api can reconcile + sync-retry.
      // Header is set BEFORE await next() so downstream handlers run normally (silent-anonymous
      // semantics preserved); the header rides on whatever response next() produces.
      if (result.reason === 'bad_signature') {
        c.header('X-Epsilon-Token-Drift', `${result.reason}; sandbox=${sandboxId}`)
      }

      await next()
      return
    }

    console.log(
      `[epsilon-user] verified user=${result.context.userId} sandbox=${result.context.sandboxId} role=${result.context.sandboxRole}`,
    )
    c.set('epsilonUser', result.context)
    rememberUserScopes(result.context.userId, result.context.scopes ?? [])

    await next()
  }
}
