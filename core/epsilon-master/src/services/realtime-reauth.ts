type WsSink = {
  send: (data: any) => void
  close?: (code?: number, reason?: string) => void
}

const REAUTH_CLOSE_CODE = 4001
const wsSinks = new Set<WsSink>()
const sseSinks = new Set<ReadableStreamDefaultController<Uint8Array>>()
const encoder = new TextEncoder()

function formatSse(event: string, data: unknown): Uint8Array {
  return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
}

export function registerWsSink(ws: WsSink): void {
  wsSinks.add(ws)
}

export function unregisterWsSink(ws: WsSink): void {
  wsSinks.delete(ws)
}

export function createReauthEventStream(): ReadableStream<Uint8Array> {
  let controllerRef: ReadableStreamDefaultController<Uint8Array> | null = null
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controllerRef = controller
      sseSinks.add(controller)
      controller.enqueue(formatSse('ready', { type: 'ready' }))
    },
    cancel() {
      if (controllerRef) sseSinks.delete(controllerRef)
    },
  })
}

export function broadcastReauthSignal(newKeyVersion: number = Date.now()): number {
  const payload = { type: 'reauth', newKeyVersion }
  let delivered = 0

  for (const ws of wsSinks) {
    try {
      // Do not inject application data into arbitrary proxied WS protocols.
      // Closing with a private code is the protocol-safe re-auth signal.
      if (typeof ws.close === 'function') {
        ws.close(REAUTH_CLOSE_CODE, 'reauth required')
      } else {
        ws.send(JSON.stringify(payload))
      }
      delivered += 1
    } catch {
      wsSinks.delete(ws)
    }
  }

  for (const sink of sseSinks) {
    try {
      sink.enqueue(formatSse('reauth', payload))
      delivered += 1
    } catch {
      sseSinks.delete(sink)
    }
  }

  return delivered
}
