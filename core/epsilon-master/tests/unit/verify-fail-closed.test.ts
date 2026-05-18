/**
 * Story 5.0.4 AC3 — verifyEpsilonUserContext fail-closed verification.
 *
 * Asserts that all 4 documented `reason` values for VerifyResult are reachable
 * and that no path leaks an `ok: true` for an invalid token. This is the
 * canonical fail-closed contract for the HMAC verification chain that Story
 * 5.0.2 reactive auto-reconcile depends on — if any of these tests regress,
 * a forged token could be silently accepted as authentic user context.
 *
 * Note: the production module exports only `verifyEpsilonUserContext`. The
 * matching encoder lives in apps/api (different package). We build tokens
 * inline using the same format documented in [epsilon-user-context.ts:7-8]:
 * `<base64url(json payload)>.<base64url(HMAC-SHA256)>`.
 *
 * Run via the epsilon-master default `bun test` glob:
 *   cd core/epsilon-master && bun test tests/unit/verify-fail-closed.test.ts
 */

import { describe, it, expect } from 'bun:test'
import { createHmac } from 'crypto'
import { verifyEpsilonUserContext } from '../../src/services/epsilon-user-context'

function base64urlEncode(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function signWith(secret: string, payloadB64: string): string {
  return base64urlEncode(createHmac('sha256', secret).update(payloadB64).digest())
}

function makeToken(payload: Record<string, unknown>, secret: string): string {
  const payloadB64 = base64urlEncode(Buffer.from(JSON.stringify(payload), 'utf8'))
  return `${payloadB64}.${signWith(secret, payloadB64)}`
}

const NOW = Math.floor(Date.now() / 1000)
const VALID_PAYLOAD = {
  userId: 'u_test',
  sandboxId: 'sb_test',
  sandboxRole: 'platform_admin',
  scopes: ['*'],
  iat: NOW,
  exp: NOW + 3600,
}

describe('verifyEpsilonUserContext fail-closed semantics (AC3)', () => {
  it('sign with key A, verify with key B → bad_signature (never silent ok)', () => {
    const token = makeToken(VALID_PAYLOAD, 'secret-A')
    const result = verifyEpsilonUserContext(token, 'secret-B')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('bad_signature')
  })

  it('expired token rejected even with correct secret', () => {
    const expiredPayload = { ...VALID_PAYLOAD, exp: NOW - 1 }
    const token = makeToken(expiredPayload, 'secret-A')
    const result = verifyEpsilonUserContext(token, 'secret-A')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('expired')
  })

  it('malformed token (single part — no dot) → malformed reason', () => {
    const result = verifyEpsilonUserContext('not-a-jwt-just-a-string', 'secret-A')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('malformed')
  })

  it('malformed token (3+ parts) → malformed reason', () => {
    const result = verifyEpsilonUserContext('a.b.c', 'secret-A')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('malformed')
  })

  it('empty parts (foo. or .bar) → malformed reason', () => {
    expect(verifyEpsilonUserContext('foo.', 'secret-A').ok).toBe(false)
    expect(verifyEpsilonUserContext('.bar', 'secret-A').ok).toBe(false)
  })

  it('empty / null / undefined token → malformed', () => {
    expect(verifyEpsilonUserContext('', 'secret-A').ok).toBe(false)
    expect(verifyEpsilonUserContext(null, 'secret-A').ok).toBe(false)
    expect(verifyEpsilonUserContext(undefined, 'secret-A').ok).toBe(false)
  })

  it('valid signature + invalid JSON payload → invalid_json reason', () => {
    // Construct a payload that is base64url-valid but NOT valid JSON.
    const notJson = base64urlEncode(Buffer.from('not-valid-json-at-all', 'utf8'))
    const token = `${notJson}.${signWith('secret-A', notJson)}`
    const result = verifyEpsilonUserContext(token, 'secret-A')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('invalid_json')
  })

  it('valid signature + missing exp field → expired (treated as exp <= now)', () => {
    const payloadNoExp = { ...VALID_PAYLOAD }
    delete (payloadNoExp as any).exp
    const token = makeToken(payloadNoExp, 'secret-A')
    const result = verifyEpsilonUserContext(token, 'secret-A')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('expired')
  })

  it('all 4 documented reason values are reachable (exhaustive enumeration)', () => {
    // The VerifyResult.reason union is: 'malformed' | 'bad_signature' | 'expired' | 'invalid_json'
    // Build one input that triggers each one to prove the verifier can produce all of them.
    const reasons = new Set<string>()

    const malformed = verifyEpsilonUserContext('not-a-jwt', 'secret-A')
    if (!malformed.ok) reasons.add(malformed.reason)

    const badSig = verifyEpsilonUserContext(makeToken(VALID_PAYLOAD, 'wrong'), 'right')
    if (!badSig.ok) reasons.add(badSig.reason)

    const expired = verifyEpsilonUserContext(
      makeToken({ ...VALID_PAYLOAD, exp: NOW - 1 }, 'secret-A'),
      'secret-A',
    )
    if (!expired.ok) reasons.add(expired.reason)

    const notJson = base64urlEncode(Buffer.from('xxx', 'utf8'))
    const invalidJson = verifyEpsilonUserContext(
      `${notJson}.${signWith('secret-A', notJson)}`,
      'secret-A',
    )
    if (!invalidJson.ok) reasons.add(invalidJson.reason)

    expect(reasons).toEqual(new Set(['malformed', 'bad_signature', 'expired', 'invalid_json']))
  })
})

describe('verifyEpsilonUserContext happy path (sanity check the test harness)', () => {
  it('valid token signed and verified with the same secret returns ok with context', () => {
    const token = makeToken(VALID_PAYLOAD, 'shared-secret')
    const result = verifyEpsilonUserContext(token, 'shared-secret')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.context.userId).toBe('u_test')
      expect(result.context.sandboxId).toBe('sb_test')
      expect(result.context.sandboxRole).toBe('platform_admin')
    }
  })

  it('timing-safe comparison: different-length signatures rejected as bad_signature (not crash)', () => {
    // Tamper signature to a shorter string — timingSafeEqual would throw if lengths
    // mismatch, but the implementation guards with `a.length !== b.length` first.
    const valid = makeToken(VALID_PAYLOAD, 'secret-A')
    const [payloadB64] = valid.split('.')
    const tampered = `${payloadB64}.short`
    const result = verifyEpsilonUserContext(tampered, 'secret-A')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('bad_signature')
  })
})
