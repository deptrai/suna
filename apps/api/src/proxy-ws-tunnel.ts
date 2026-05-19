// WebSocket ↔ TCP tunnel for sandbox browser proxy.
//
// Daytona Envoy blocks direct egress from sandboxes to arbitrary internet IPs.
// The sandbox runs a local HTTP CONNECT proxy (ws-proxy-client.ts, port 3128)
// that tunnels each CONNECT request over WebSocket back to this endpoint.
// This endpoint opens the real TCP connection and pipes bytes both ways.
//
// URL: /v1/proxy/ws?token=<INTERNAL_SERVICE_KEY>&host=<host>&port=<port>
//
// Auth  : token query param must equal config.INTERNAL_SERVICE_KEY (shared secret).
// SSRF  : rejects RFC1918 + loopback + link-local addresses.
// Binary: WS messages are raw TCP bytes, no framing.

import net from 'net';
import { config } from './config';

// ─── SSRF protection ──────────────────────────────────────────────────────────

const PRIVATE_REGEXES = [
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^169\.254\./,
  /^::1$/,
  /^fc[0-9a-f]{2}:/i,
  /^fd[0-9a-f]{2}:/i,
];

function isPrivateHost(host: string): boolean {
  if (host === 'localhost') return true;
  for (const re of PRIVATE_REGEXES) {
    if (re.test(host)) return true;
  }
  return false;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface WsTunnelData {
  type: 'ws-tcp-tunnel';
  host: string;
  port: number;
  socket: net.Socket | null;
  buffered: Buffer[];
  closed: boolean;
}

// ─── Request validation (called before upgrade) ──────────────────────────────

export function validateWsTunnelRequest(
  req: Request,
): { ok: true; host: string; port: number } | { ok: false; status: number; error: string } {
  const url = new URL(req.url, 'http://localhost');
  const token = url.searchParams.get('token') || req.headers.get('x-internal-token') || '';
  const serviceKey = config.INTERNAL_SERVICE_KEY || '';

  if (!serviceKey || token !== serviceKey) {
    return { ok: false, status: 401, error: 'Unauthorized' };
  }

  const host = url.searchParams.get('host') || '';
  const portStr = url.searchParams.get('port') || '';
  if (!host || !portStr) {
    return { ok: false, status: 400, error: 'Missing host or port' };
  }

  const port = parseInt(portStr, 10);
  if (isNaN(port) || port < 1 || port > 65535) {
    return { ok: false, status: 400, error: 'Invalid port' };
  }

  if (isPrivateHost(host)) {
    return { ok: false, status: 403, error: 'Access to private addresses is not allowed' };
  }

  return { ok: true, host, port };
}

// ─── WebSocket event handlers (called from Bun server websocket: block) ──────

export function onWsTunnelOpen(
  ws: { data: WsTunnelData; send: (d: Buffer | string) => void; close: (code?: number, reason?: string) => void },
): void {
  const { host, port } = ws.data;

  const socket = net.createConnection({ host, port });

  socket.on('connect', () => {
    for (const buf of ws.data.buffered) {
      socket.write(buf);
    }
    ws.data.buffered = [];
  });

  socket.on('data', (chunk: Buffer) => {
    if (ws.data.closed) return;
    try {
      ws.send(chunk);
    } catch {
      socket.destroy();
    }
  });

  socket.on('close', () => {
    if (!ws.data.closed) {
      try { ws.close(1000, 'tcp closed'); } catch {}
    }
  });

  socket.on('error', (err: Error) => {
    console.warn(`[ws-tunnel] TCP error ${host}:${port}: ${err.message}`);
    if (!ws.data.closed) {
      try { ws.close(1011, 'tcp error'); } catch {}
    }
  });

  ws.data.socket = socket;
}

export function onWsTunnelMessage(
  ws: { data: WsTunnelData; close: (code?: number, reason?: string) => void },
  message: Buffer | string | ArrayBuffer,
): void {
  const buf =
    message instanceof ArrayBuffer
      ? Buffer.from(message)
      : typeof message === 'string'
        ? Buffer.from(message, 'binary')
        : message;

  const socket = ws.data.socket;
  if (!socket) {
    ws.data.buffered.push(buf);
    return;
  }
  if (!socket.destroyed && (socket.connecting || socket.writable)) {
    socket.write(buf);
  }
}

export function onWsTunnelClose(ws: { data: WsTunnelData }): void {
  ws.data.closed = true;
  try { ws.data.socket?.destroy(); } catch {}
  ws.data.socket = null;
  ws.data.buffered = [];
}
