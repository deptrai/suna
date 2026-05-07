import { beforeEach, describe, expect, test } from 'bun:test'

const ORIGINAL = {
  EPSILON_TOKEN: process.env.EPSILON_TOKEN,
  EPSILON_YOLO_API_KEY: process.env.EPSILON_YOLO_API_KEY,
  INTERNAL_SERVICE_KEY: process.env.INTERNAL_SERVICE_KEY,
  TUNNEL_TOKEN: process.env.TUNNEL_TOKEN,
}

beforeEach(() => {
  process.env.EPSILON_TOKEN = ORIGINAL.EPSILON_TOKEN
  process.env.EPSILON_YOLO_API_KEY = ORIGINAL.EPSILON_YOLO_API_KEY
  process.env.INTERNAL_SERVICE_KEY = ORIGINAL.INTERNAL_SERVICE_KEY
  process.env.TUNNEL_TOKEN = ORIGINAL.TUNNEL_TOKEN
})

describe('normalizeBootstrapAuthAliases', () => {
  test('forces EPSILON_YOLO_API_KEY, INTERNAL_SERVICE_KEY, and TUNNEL_TOKEN to match EPSILON_TOKEN', async () => {
    const { normalizeBootstrapAuthAliases } = await import('../../src/services/bootstrap-env')

    process.env.EPSILON_TOKEN = 'epsilon_sb_canonical'
    process.env.EPSILON_YOLO_API_KEY = 'stale-yolo-key'
    process.env.INTERNAL_SERVICE_KEY = 'stale-inbound-key'
    process.env.TUNNEL_TOKEN = 'stale-tunnel-key'

    const updated = normalizeBootstrapAuthAliases()

    expect(updated).toBe(3)
    expect(process.env.EPSILON_YOLO_API_KEY).toBe('epsilon_sb_canonical')
    expect(process.env.INTERNAL_SERVICE_KEY).toBe('epsilon_sb_canonical')
    expect(process.env.TUNNEL_TOKEN).toBe('epsilon_sb_canonical')
  })
})
