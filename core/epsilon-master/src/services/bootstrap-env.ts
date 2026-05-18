import { existsSync, readFileSync } from 'fs'

const WORKSPACE_ROOT = process.env.EPSILON_WORKSPACE_ROOT || '/workspace'
const BOOTSTRAP_PATH = process.env.BOOTSTRAP_PATH || `${WORKSPACE_ROOT}/.secrets/.bootstrap-env.json`

const CORE_VARS = [
  'EPSILON_TOKEN',
  'EPSILON_YOLO_API_KEY',
  'EPSILON_YOLO_URL',
  'EPSILON_API_URL',
  'INTERNAL_SERVICE_KEY',
  'TUNNEL_TOKEN',
] as const

/**
 * Read-only bootstrap mirror loader.
 * Used only as an offline fallback when canonical API bootstrap is unavailable.
 */
export function loadBootstrapEnv(): number {
  let restored = 0
  try {
    if (!existsSync(BOOTSTRAP_PATH)) return 0
    const data = JSON.parse(readFileSync(BOOTSTRAP_PATH, 'utf-8'))
    for (const key of CORE_VARS) {
      if (data[key] && process.env[key] !== data[key]) {
        process.env[key] = data[key]
        restored++
      }
    }
    if (restored > 0) {
      console.log(`[Bootstrap] Restored ${restored} core env var(s) from mirror ${BOOTSTRAP_PATH}`)
    }
  } catch (err) {
    console.warn('[Bootstrap] Failed to load bootstrap mirror env:', err)
  }
  return restored
}
