import { describe, expect, test } from 'bun:test'
import { broadcastReauthSignal, createReauthEventStream, registerWsSink, unregisterWsSink } from '../realtime-reauth'

describe('realtime reauth signal', () => {
  test('closes proxied websocket sinks instead of injecting protocol data', () => {
    const sent: string[] = []
    const closes: Array<{ code?: number; reason?: string }> = []
    const ws = {
      send: (data: string) => sent.push(data),
      close: (code?: number, reason?: string) => closes.push({ code, reason }),
    }
    registerWsSink(ws)

    const delivered = broadcastReauthSignal(12345)
    unregisterWsSink(ws)

    expect(delivered).toBe(1)
    expect(sent).toHaveLength(0)
    expect(closes).toEqual([{ code: 4001, reason: 'reauth required' }])
  })

  test('broadcasts reauth payload to SSE control stream clients', async () => {
    const stream = createReauthEventStream()
    const reader = stream.getReader()

    const ready = await reader.read()
    expect(new TextDecoder().decode(ready.value)).toContain('event: ready')

    const delivered = broadcastReauthSignal(12345)
    const event = await reader.read()
    await reader.cancel()

    const text = new TextDecoder().decode(event.value)
    expect(delivered).toBe(1)
    expect(text).toContain('event: reauth')
    expect(text).toContain('"newKeyVersion":12345')
  })
})
