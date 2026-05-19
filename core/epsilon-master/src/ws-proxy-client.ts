// Local HTTP CONNECT proxy for sandbox browser egress.
//
// Listens on 127.0.0.1:3128. When Chromium/curl/agent-browser issues an
// HTTP CONNECT request (e.g. "CONNECT api.anthropic.com:443 HTTP/1.1"),
// this server opens a WebSocket to EPSILON_API_URL/v1/proxy/ws on the
// apps/api backend, which in turn opens a TCP connection to the target.
// Bytes flow: client ↔ local TCP ↔ WebSocket ↔ CF tunnel ↔ apps/api ↔ internet.
//
// Why: Daytona sandboxes can only make outbound connections to whitelisted
// domains/IPs. EPSILON_API_URL (a trycloudflare.com URL) is whitelisted.
// Cloudflare tunnels support WebSocket upgrades, so we use WS as the
// transport carrier for arbitrary TCP tunnels.

import net from 'net';

const PROXY_HOST = '127.0.0.1';
const PROXY_PORT = 3128;
const CONNECT_TIMEOUT_MS = 15_000;

export function startWsProxyClient(): net.Server {
  const epsilonApiUrl = (process.env.EPSILON_API_URL || 'http://localhost:8008').replace(/\/$/, '');
  const serviceKey = process.env.INTERNAL_SERVICE_KEY || '';

  // Build WebSocket base URL: http → ws, https → wss
  const wsBase = epsilonApiUrl.startsWith('https://')
    ? epsilonApiUrl.replace(/^https:\/\//, 'wss://')
    : epsilonApiUrl.replace(/^http:\/\//, 'ws://');

  const server = net.createServer((clientSocket) => {
    clientSocket.once('data', (firstChunk) => {
      const header = firstChunk.toString('latin1');
      const firstLine = header.split('\r\n')[0] ?? '';
      const connectMatch = firstLine.match(/^CONNECT\s+([^:\s]+):(\d+)\s+HTTP\/1\.[01]$/i);

      if (!connectMatch) {
        // Only CONNECT method is supported (all HTTPS goes through CONNECT).
        clientSocket.write(
          'HTTP/1.1 405 Method Not Allowed\r\nContent-Length: 0\r\nConnection: close\r\n\r\n',
        );
        clientSocket.destroy();
        return;
      }

      const host = connectMatch[1];
      const port = parseInt(connectMatch[2], 10);
      const headerEnd = firstChunk.indexOf('\r\n\r\n');
      // Any bytes after the CONNECT headers (unusual but possible if client is fast)
      const extraData = headerEnd >= 0 ? firstChunk.slice(headerEnd + 4) : Buffer.alloc(0);

      const wsUrl = `${wsBase}/v1/proxy/ws?token=${encodeURIComponent(serviceKey)}&host=${encodeURIComponent(host)}&port=${port}`;
      const ws = new WebSocket(wsUrl);
      ws.binaryType = 'arraybuffer';

      const pendingFromClient: Buffer[] = [];
      let tunnelOpen = false;

      // Buffer client data arriving while WS is still connecting
      clientSocket.on('data', (data: Buffer) => {
        if (tunnelOpen) {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(data);
          }
        } else {
          pendingFromClient.push(data);
        }
      });

      const connectTimer = setTimeout(() => {
        if (!tunnelOpen) {
          console.warn(`[ws-proxy-client] WS connect timeout for ${host}:${port}`);
          clientSocket.write(
            'HTTP/1.1 504 Gateway Timeout\r\nContent-Length: 0\r\nConnection: close\r\n\r\n',
          );
          clientSocket.destroy();
          ws.close();
        }
      }, CONNECT_TIMEOUT_MS);

      ws.addEventListener('open', () => {
        clearTimeout(connectTimer);
        tunnelOpen = true;

        // Send 200 so client starts TLS / raw TCP
        clientSocket.write('HTTP/1.1 200 Connection Established\r\nProxy-Agent: epsilon-ws-proxy/1.0\r\n\r\n');

        // Flush any data that arrived before WS was ready
        if (extraData.length > 0) ws.send(extraData);
        for (const buf of pendingFromClient) ws.send(buf);
        pendingFromClient.length = 0;
      });

      ws.addEventListener('message', (e: MessageEvent) => {
        if (clientSocket.destroyed) return;
        const data = e.data;
        if (data instanceof ArrayBuffer) {
          clientSocket.write(Buffer.from(data));
        } else if (typeof data === 'string') {
          clientSocket.write(data, 'binary');
        }
      });

      ws.addEventListener('close', () => {
        clientSocket.destroy();
      });

      ws.addEventListener('error', () => {
        clearTimeout(connectTimer);
        if (!tunnelOpen) {
          clientSocket.write(
            'HTTP/1.1 502 Bad Gateway\r\nContent-Length: 0\r\nConnection: close\r\n\r\n',
          );
        }
        clientSocket.destroy();
      });

      clientSocket.on('close', () => {
        clearTimeout(connectTimer);
        if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
          ws.close();
        }
      });

      clientSocket.on('error', () => {
        clearTimeout(connectTimer);
        try { ws.close(); } catch {}
      });
    });

    clientSocket.on('error', (err: Error) => {
      console.warn('[ws-proxy-client] client socket error:', err.message);
    });
  });

  server.listen(PROXY_PORT, PROXY_HOST, () => {
    console.log(`[ws-proxy-client] Listening on ${PROXY_HOST}:${PROXY_PORT} → ${wsBase}/v1/proxy/ws`);
  });

  server.on('error', (err: Error) => {
    // EADDRINUSE means another ws-proxy-client is already running — not fatal.
    if ((err as NodeJS.ErrnoException).code === 'EADDRINUSE') {
      console.warn(`[ws-proxy-client] Port ${PROXY_PORT} already in use — proxy already running`);
    } else {
      console.error('[ws-proxy-client] Server error:', err);
    }
  });

  return server;
}
