/**
 * Story 5.0.2 AC1 / AC5 — epsilon-user-middleware drift alert + drift header.
 *
 * Verifies the alert + drift signaling contract on bad_signature:
 *  - Structured alert log emitted with reason-specific event slug (review P7)
 *  - secretPrefix NOT in payload (review P4 — secret material safety)
 *  - 5-min debounce per (sandbox, reason) — second bad_signature within window
 *    does NOT re-emit
 *  - EPSILON_DRIFT_ALERTS_ENABLED=false silences emission (review P11)
 *  - X-Epsilon-Token-Drift response header set on bad_signature only
 *  - Header NOT set on malformed / expired (those just emit alert)
 *
 * Run via the epsilon-master `bun test` default glob:
 *   cd core/epsilon-master && bun test tests/unit/epsilon-user-middleware.test.ts
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { createHmac } from 'crypto'
import { epsilonUserContextMiddleware } from '../../src/services/epsilon-user-middleware'
import { EPSILON_USER_CONTEXT_HEADER } from '../../src/services/epsilon-user-context'

// Build a header in the same format as the apps/api signer so we can produce
// bad-signature tokens (signed with a wrong secret) without depending on the
// apps/api package or a non-existent local encoder.
function base64urlEncode(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function signWith(secret: string, payloadB64: string): string {
  return base64urlEncode(createHmac('sha256', secret).update(payloadB64).digest())
}

function makeUserContextHeader(payload: Record<string, unknown>, secret: string): string {
  const payloadB64 = base64urlEncode(Buffer.from(JSON.stringify(payload), 'utf8'))
  return `${payloadB64}.${signWith(secret, payloadB64)}`
}

const SECRET = 'test-secret-do-not-log-prefix-of-this'

interface FakeCtx {
  reqMethod: string
  reqPath: string
  reqHeaders: Map<string, string>
  responseHeaders: Map<string, string>
  variables: Map<string, unknown>
  next: () => Promise<void>
  nextCalls: number
}

function makeCtx(headerValue: string | undefined): FakeCtx {
  const headers = new Map<string, string>()
  if (headerValue !== undefined) headers.set(EPSILON_USER_CONTEXT_HEADER.toLowerCase(), headerValue)
  const respHeaders = new Map<string, string>()
  const vars = new Map<string, unknown>()
  const ctx: FakeCtx = {
    reqMethod: 'GET',
    reqPath: '/v1/something',
    reqHeaders: headers,
    responseHeaders: respHeaders,
    variables: vars,
    next: async () => {
      ctx.nextCalls += 1
    },
    nextCalls: 0,
  }
  return ctx
}

function asHonoCtx(ctx: FakeCtx): any {
  return {
    req: {
      method: ctx.reqMethod,
      path: ctx.reqPath,
      header: (k: string) => ctx.reqHeaders.get(k.toLowerCase()),
    },
    header: (k: string, v: string) => ctx.responseHeaders.set(k, v),
    set: (k: string, v: unknown) => ctx.variables.set(k, v),
    get: (k: string) => ctx.variables.get(k),
  }
}

let capturedLogs: string[] = []
let originalConsoleWarn: typeof console.warn
let originalSecret: string | undefined
let originalSandboxId: string | undefined
let originalAlertsEnabled: string | undefined

beforeEach(() => {
  capturedLogs = []
  originalConsoleWarn = console.warn
  console.warn = (...args: unknown[]) => {
    capturedLogs.push(args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '))
  }
  originalSecret = process.env.EPSILON_TOKEN
  originalSandboxId = process.env.SANDBOX_ID
  originalAlertsEnabled = process.env.EPSILON_DRIFT_ALERTS_ENABLED
  process.env.EPSILON_TOKEN = SECRET
  process.env.SANDBOX_ID = 'test-sandbox-001'
  delete process.env.EPSILON_DRIFT_ALERTS_ENABLED // default ON
})

afterEach(() => {
  console.warn = originalConsoleWarn
  if (originalSecret === undefined) delete process.env.EPSILON_TOKEN
  else process.env.EPSILON_TOKEN = originalSecret
  if (originalSandboxId === undefined) delete process.env.SANDBOX_ID
  else process.env.SANDBOX_ID = originalSandboxId
  if (originalAlertsEnabled === undefined) delete process.env.EPSILON_DRIFT_ALERTS_ENABLED
  else process.env.EPSILON_DRIFT_ALERTS_ENABLED = originalAlertsEnabled
})

function makeBadSignatureHeader(sandboxId = 'test-sandbox-001'): string {
  // Build a well-formed header but sign with a WRONG secret so the middleware
  // verify fails with reason='bad_signature' (the path that triggers both the
  // structured alert and the X-Epsilon-Token-Drift response header).
  const now = Math.floor(Date.now() / 1000)
  return makeUserContextHeader(
    {
      userId: 'u_test',
      sandboxId,
      sandboxRole: 'admin',
      scopes: [],
      iat: now,
      exp: now + 3600,
    },
    'wrong-secret-not-' + SECRET,
  )
}

// Bump SANDBOX_ID per test so the module-level RECENT_ALERTS debounce map
// (which persists across tests within the same bun test run) doesn't suppress
// emissions from later tests reusing the same key.
let _sandboxIdCounter = 0
function freshSandboxId(prefix: string): string {
  return `${prefix}-${++_sandboxIdCounter}-${Date.now()}`
}

function findStructuredAlert(): Record<string, unknown> | null {
  for (const line of capturedLogs) {
    const idx = line.indexOf('{')
    if (idx === -1) continue
    try {
      const obj = JSON.parse(line.slice(idx)) as Record<string, unknown>
      if (typeof obj.event === 'string' && obj.event.startsWith('sandbox.token.')) return obj
    } catch {
      /* not a JSON line */
    }
  }
  return null
}

describe('AC1 structured alert on bad_signature', () => {
  it('emits structured alert with reason-specific event slug (review P7)', async () => {
    const sandboxId = freshSandboxId('emit')
    process.env.SANDBOX_ID = sandboxId

    const mw = epsilonUserContextMiddleware()
    const ctx = makeCtx(makeBadSignatureHeader(sandboxId))
    await mw(asHonoCtx(ctx), ctx.next)

    const alert = findStructuredAlert()
    expect(alert).not.toBeNull()
    expect(alert!.event).toBe('sandbox.token.bad_signature') // P7 — distinct per reason
    expect(alert!.event_kind).toBe('token_drift')
    expect(alert!.level).toBe('warning')
    expect(alert!.sandboxId).toBe(sandboxId)
    expect(alert!.reason).toBe('bad_signature')
    expect(alert!.requestMethod).toBe('GET')
    expect(alert!.requestPath).toBe('/v1/something')
    expect(typeof alert!.tokenPrefix).toBe('string')
    expect((alert!.tokenPrefix as string).length).toBeLessThanOrEqual(16)
  })

  it('does NOT include secretPrefix in alert payload (review P4 — secret material safety)', async () => {
    const sandboxId = freshSandboxId('p4')
    process.env.SANDBOX_ID = sandboxId

    const mw = epsilonUserContextMiddleware()
    const ctx = makeCtx(makeBadSignatureHeader(sandboxId))
    await mw(asHonoCtx(ctx), ctx.next)

    const alert = findStructuredAlert()
    expect(alert).not.toBeNull()
    expect(alert!.secretPrefix).toBeUndefined()

    // Defense-in-depth: secret prefix string must not appear anywhere in any
    // captured log line.
    const secretPrefix = SECRET.slice(0, 16)
    for (const line of capturedLogs) {
      expect(line).not.toContain(secretPrefix)
    }
  })

  it('debounces second bad_signature within 5-min window (does not re-emit)', async () => {
    const sandboxId = freshSandboxId('debounce')
    process.env.SANDBOX_ID = sandboxId

    const mw = epsilonUserContextMiddleware()
    const ctx1 = makeCtx(makeBadSignatureHeader(sandboxId))
    await mw(asHonoCtx(ctx1), ctx1.next)

    const firstAlertCount = capturedLogs.filter((l) => l.includes('sandbox.token.bad_signature')).length
    expect(firstAlertCount).toBeGreaterThan(0)

    capturedLogs = []
    const ctx2 = makeCtx(makeBadSignatureHeader(sandboxId))
    await mw(asHonoCtx(ctx2), ctx2.next)

    const secondAlertCount = capturedLogs.filter((l) => l.includes('sandbox.token.bad_signature')).length
    expect(secondAlertCount).toBe(0) // debounced
  })
})

describe('AC1 review P11 EPSILON_DRIFT_ALERTS_ENABLED gate', () => {
  it('silences structured alert when env=0 (CI / test mode)', async () => {
    process.env.EPSILON_DRIFT_ALERTS_ENABLED = '0'
    // Use a fresh sandboxId so debounce state from prior test doesn't suppress.
    process.env.SANDBOX_ID = 'test-sandbox-p11-off'

    const mw = epsilonUserContextMiddleware()
    const ctx = makeCtx(makeBadSignatureHeader())
    await mw(asHonoCtx(ctx), ctx.next)

    const alert = findStructuredAlert()
    expect(alert).toBeNull() // suppressed
  })

  it('emits when env=true (explicit on)', async () => {
    process.env.EPSILON_DRIFT_ALERTS_ENABLED = 'true'
    process.env.SANDBOX_ID = 'test-sandbox-p11-on'

    const mw = epsilonUserContextMiddleware()
    const ctx = makeCtx(makeBadSignatureHeader())
    await mw(asHonoCtx(ctx), ctx.next)

    const alert = findStructuredAlert()
    expect(alert).not.toBeNull()
  })

  it('default ON when env unset', async () => {
    delete process.env.EPSILON_DRIFT_ALERTS_ENABLED
    process.env.SANDBOX_ID = 'test-sandbox-p11-default'

    const mw = epsilonUserContextMiddleware()
    const ctx = makeCtx(makeBadSignatureHeader())
    await mw(asHonoCtx(ctx), ctx.next)

    const alert = findStructuredAlert()
    expect(alert).not.toBeNull()
  })
})

describe('AC2 X-Epsilon-Token-Drift response header', () => {
  it('sets header on bad_signature only', async () => {
    process.env.SANDBOX_ID = 'test-sandbox-header-bad'

    const mw = epsilonUserContextMiddleware()
    const ctx = makeCtx(makeBadSignatureHeader())
    await mw(asHonoCtx(ctx), ctx.next)

    const driftHeader = ctx.responseHeaders.get('X-Epsilon-Token-Drift')
    expect(driftHeader).toBeDefined()
    expect(driftHeader!).toContain('bad_signature')
    expect(driftHeader!).toContain('sandbox=test-sandbox-header-bad')
  })

  it('does NOT set header on malformed (non-bad_signature reason)', async () => {
    process.env.SANDBOX_ID = 'test-sandbox-header-malformed'

    const mw = epsilonUserContextMiddleware()
    const ctx = makeCtx('not-a-valid-token-shape')
    await mw(asHonoCtx(ctx), ctx.next)

    const driftHeader = ctx.responseHeaders.get('X-Epsilon-Token-Drift')
    expect(driftHeader).toBeUndefined()
  })

  it('does NOT set header when no X-Epsilon-User-Context header present', async () => {
    const mw = epsilonUserContextMiddleware()
    const ctx = makeCtx(undefined)
    await mw(asHonoCtx(ctx), ctx.next)

    expect(ctx.responseHeaders.get('X-Epsilon-Token-Drift')).toBeUndefined()
    expect(ctx.nextCalls).toBe(1) // anonymous path still flows
  })
})

describe('AC1 silent-anonymous fallback semantics preserved', () => {
  it('continues to next() after bad signature (no 401)', async () => {
    const mw = epsilonUserContextMiddleware()
    const ctx = makeCtx(makeBadSignatureHeader())
    await mw(asHonoCtx(ctx), ctx.next)

    expect(ctx.nextCalls).toBe(1)
    expect(ctx.variables.get('epsilonUser')).toBeUndefined()
  })
})
