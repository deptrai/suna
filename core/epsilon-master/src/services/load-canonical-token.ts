import { existsSync, mkdirSync, readFileSync } from 'fs'

const S6_ENV_DIR = process.env.S6_ENV_DIR || '/run/s6/container_environment'
const WORKSPACE_ROOT = process.env.EPSILON_WORKSPACE_ROOT || '/workspace'
const MIRROR_PATH = process.env.BOOTSTRAP_PATH || `${WORKSPACE_ROOT}/.secrets/.bootstrap-env.json`

type TokenSource = 'api' | 'mirror' | 'env'

function writeCoreAuthVars(token: string): void {
  process.env.EPSILON_TOKEN = token
  process.env.INTERNAL_SERVICE_KEY = token
  process.env.EPSILON_YOLO_API_KEY = token
  process.env.TUNNEL_TOKEN = token
}

async function writeS6File(key: string, value: string): Promise<void> {
  if (!existsSync(S6_ENV_DIR)) mkdirSync(S6_ENV_DIR, { recursive: true })
  await Bun.write(`${S6_ENV_DIR}/${key}`, value)
}

async function persistMirror(token: string): Promise<void> {
  const dir = MIRROR_PATH.split('/').slice(0, -1).join('/')
  if (dir && !existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o700 })
  await Bun.write(
    MIRROR_PATH,
    JSON.stringify({ EPSILON_TOKEN: token, INTERNAL_SERVICE_KEY: token, TUNNEL_TOKEN: token }, null, 2),
  )
}

function readMirrorToken(): string {
  if (!existsSync(MIRROR_PATH)) return ''
  try {
    const data = JSON.parse(readFileSync(MIRROR_PATH, 'utf8'))
    return typeof data?.EPSILON_TOKEN === 'string' ? data.EPSILON_TOKEN : ''
  } catch {
    return ''
  }
}

export async function loadCanonicalToken(): Promise<{ source: TokenSource }> {
  const envMode = process.env.ENV_MODE || 'local'
  const isCloud = envMode === 'cloud'
  const s6TokenPath = `${S6_ENV_DIR}/EPSILON_TOKEN`

  if (!isCloud) {
    if (!existsSync(s6TokenPath)) {
      console.error("[bootstrap] sandbox-token.txt missing — run 'make sandbox-token' on host")
      return { source: 'env' }
    }
    const localToken = readFileSync(s6TokenPath, 'utf8').trim()
    if (localToken) {
      writeCoreAuthVars(localToken)
      await persistMirror(localToken)
    }
    return { source: 'env' }
  }

  const baseUrl = process.env.EPSILON_API_URL
  const sandboxId = process.env.SANDBOX_ID
  const provisioningKey = process.env.PROVISIONING_KEY
  if (!baseUrl || !sandboxId || !provisioningKey) {
    const fallback = readMirrorToken()
    if (fallback) {
      writeCoreAuthVars(fallback)
      return { source: 'mirror' }
    }
    return { source: 'env' }
  }

  const url = `${baseUrl.replace(/\/$/, '')}/v1/internal/bootstrap-token?sandboxId=${encodeURIComponent(sandboxId)}`
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${provisioningKey}` },
      signal: AbortSignal.timeout(10_000),
    })
    if (res.ok) {
      const body = await res.json() as { serviceKey?: string }
      if (body?.serviceKey) {
        writeCoreAuthVars(body.serviceKey)
        await writeS6File('EPSILON_TOKEN', body.serviceKey)
        await writeS6File('INTERNAL_SERVICE_KEY', body.serviceKey)
        await persistMirror(body.serviceKey)
        return { source: 'api' }
      }
    }

    if (res.status >= 500) {
      const fallback = readMirrorToken()
      if (fallback) {
        console.warn('[bootstrap] canonical token API unavailable; using mirror fallback')
        writeCoreAuthVars(fallback)
        return { source: 'mirror' }
      }
    }
  } catch (err) {
    console.warn('[bootstrap] canonical token API request failed:', err)
    const fallback = readMirrorToken()
    if (fallback) {
      writeCoreAuthVars(fallback)
      return { source: 'mirror' }
    }
  }

  return { source: 'env' }
}
