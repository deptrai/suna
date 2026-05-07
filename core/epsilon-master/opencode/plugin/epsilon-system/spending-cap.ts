import type { Plugin } from '@opencode-ai/plugin'
import { Database } from 'bun:sqlite'
import { existsSync } from 'node:fs'
import { createHmac } from 'node:crypto'
import { join } from 'node:path'

const HEADER_NAME = 'X-Epsilon-Actor-Context'
const TOKEN_TTL_SECONDS = 300

function base64urlEncode(buf: Buffer): string {
  return buf
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

function signActorToken(
  payload: { sandboxId: string; userId: string; sessionId: string },
  secret: string,
): string {
  const now = Math.floor(Date.now() / 1000)
  const body = JSON.stringify({ ...payload, iat: now, exp: now + TOKEN_TTL_SECONDS })
  const payloadB64 = base64urlEncode(Buffer.from(body, 'utf8'))
  const mac = createHmac('sha256', secret).update(payloadB64).digest()
  return `${payloadB64}.${base64urlEncode(mac)}`
}

function resolveEpsilonDbPath(): string {
  const workspace =
    process.env.EPSILON_WORKSPACE?.trim() ||
    process.env.OPENCODE_CONFIG_DIR?.replace(/\/opencode\/?$/, '') ||
    '/workspace'
  return join(workspace, '.epsilon', 'epsilon.db')
}

export const EpsilonSpendingCapPlugin: Plugin = async () => {
  const sandboxId = process.env.SANDBOX_ID?.trim() || ''
  const secret = process.env.EPSILON_TOKEN?.trim() || ''
  const dbPath = resolveEpsilonDbPath()

  // Open the sqlite database once per plugin lifetime and cache a prepared
  // statement — keeps the hot path (every LLM call) to microseconds.
  let db: Database | null = null
  let stmt: ReturnType<Database['query']> | null = null
  try {
    if (existsSync(dbPath) && sandboxId && secret) {
      db = new Database(dbPath, { readonly: true })
      stmt = db.query('SELECT user_id FROM session_owners WHERE session_id = ? LIMIT 1')
    }
  } catch (err) {
    console.warn('[spending-cap] sqlite open failed — actor stamping disabled:', err)
    db = null
    stmt = null
  }

  if (!stmt) {
    console.warn(
      `[spending-cap] disabled: sandboxId=${sandboxId ? 'ok' : 'missing'} secret=${secret ? 'ok' : 'missing'} db=${dbPath}`,
    )
  } else {
    console.log(`[spending-cap] ready — stamping actor header for sandbox ${sandboxId}`)
  }

  return {
    'chat.headers': async (
      input: { sessionID: string },
      output: { headers: Record<string, string> },
    ) => {
      if (!stmt || !sandboxId || !secret) return
      try {
        const row = stmt.get(input.sessionID) as { user_id?: string } | null
        const userId = row?.user_id
        if (!userId) {
          console.log(`[spending-cap] session ${input.sessionID}: no stamped owner, skipping`)
          return
        }
        output.headers[HEADER_NAME] = signActorToken(
          { sandboxId, userId, sessionId: input.sessionID },
          secret,
        )
        console.log(`[spending-cap] stamped actor ${userId} for session ${input.sessionID}`)
      } catch (err) {
        console.warn('[spending-cap] stamp failed for session', input.sessionID, err)
      }
    },
  }
}

export default EpsilonSpendingCapPlugin
