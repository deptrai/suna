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
      console.warn(
        `[epsilon-user] Ignoring bad ${EPSILON_USER_CONTEXT_HEADER} (${result.reason}); continuing without user context`,
      )
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
