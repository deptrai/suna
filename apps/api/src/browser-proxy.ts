import * as http from 'http';
import * as net from 'net';
import * as dns from 'dns/promises';

const PRIVATE_RE = [
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^127\./,
  /^169\.254\./,
  /^0\./,
  /^::1$/i,
  /^::ffff:/i,
  /^fc[0-9a-f]{2}:/i,
  /^fd[0-9a-f]{2}:/i,
  /^fe80:/i,
];

function isPrivateAddr(addr: string): boolean {
  return PRIVATE_RE.some((re) => re.test(addr));
}

async function isAllowedHost(host: string): Promise<{ ok: boolean; reason?: string }> {
  if (isPrivateAddr(host)) return { ok: false, reason: 'private-ip-literal' };
  if (host === 'localhost') return { ok: false, reason: 'localhost' };
  if (!host.includes('.')) return { ok: false, reason: 'bare-hostname' };
  try {
    const addrs = await dns.lookup(host, { all: true });
    if (addrs.length === 0) return { ok: false, reason: 'dns-empty' };
    for (const a of addrs) {
      if (isPrivateAddr(a.address)) return { ok: false, reason: `dns-private:${a.address}` };
    }
    return { ok: true };
  } catch (e: any) {
    return { ok: false, reason: `dns-error:${e?.code ?? 'unknown'}` };
  }
}

export interface BrowserProxyOptions {
  port: number;
  authSecret: string;
  allowedPorts: Set<number>;
  maxConnPerIp: number;
}

export function startBrowserProxy(opts: BrowserProxyOptions): http.Server {
  const expectedAuth = 'Basic ' + Buffer.from(`epsilon:${opts.authSecret}`).toString('base64');
  const connsByIp = new Map<string, number>();

  const server = http.createServer((_req, res) => {
    res.writeHead(405, { 'Content-Type': 'text/plain' });
    res.end('Use CONNECT method');
  });

  server.on('connect', async (req, rawSocket, head) => {
    const clientSocket = rawSocket as net.Socket;
    const srcIp = clientSocket.remoteAddress ?? 'unknown';
    const t0 = Date.now();
    let bytesIn = 0;
    let bytesOut = 0;
    let status = 'pending';
    const target = req.url ?? '';
    const [host, portStr] = target.split(':');
    const targetPort = parseInt(portStr ?? '', 10);

    const logEnd = () => {
      console.log(JSON.stringify({
        ts: new Date().toISOString(),
        evt: 'browser_proxy.connect',
        src: srcIp,
        target: host ?? '',
        port: Number.isFinite(targetPort) ? targetPort : 0,
        status,
        bytes_in: bytesIn,
        bytes_out: bytesOut,
        duration_ms: Date.now() - t0,
      }));
    };

    if (req.headers['proxy-authorization'] !== expectedAuth) {
      status = 'auth_fail';
      clientSocket.write('HTTP/1.1 407 Proxy Authentication Required\r\nProxy-Authenticate: Basic realm="epsilon-proxy"\r\n\r\n');
      clientSocket.end();
      logEnd();
      return;
    }

    if (!host || !Number.isFinite(targetPort)) {
      status = 'bad_request';
      clientSocket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
      clientSocket.end();
      logEnd();
      return;
    }

    if (!opts.allowedPorts.has(targetPort)) {
      status = 'port_blocked';
      clientSocket.write('HTTP/1.1 403 Forbidden\r\nX-Reason: port-not-allowed\r\n\r\n');
      clientSocket.end();
      logEnd();
      return;
    }

    const curr = connsByIp.get(srcIp) ?? 0;
    if (curr >= opts.maxConnPerIp) {
      status = 'conn_cap';
      clientSocket.write('HTTP/1.1 429 Too Many Requests\r\n\r\n');
      clientSocket.end();
      logEnd();
      return;
    }

    const allowed = await isAllowedHost(host);
    if (!allowed.ok) {
      status = `ssrf_block:${allowed.reason}`;
      clientSocket.write(`HTTP/1.1 403 Forbidden\r\nX-Reason: ${allowed.reason}\r\n\r\n`);
      clientSocket.end();
      logEnd();
      return;
    }

    connsByIp.set(srcIp, curr + 1);
    const cleanup = () => {
      const c = (connsByIp.get(srcIp) ?? 1) - 1;
      if (c <= 0) connsByIp.delete(srcIp);
      else connsByIp.set(srcIp, c);
    };

    let logged = false;
    const finalize = () => {
      if (logged) return;
      logged = true;
      cleanup();
      logEnd();
    };

    const serverSocket = net.connect(targetPort, host, () => {
      status = 'ok';
      clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      if (head?.length) serverSocket.write(head);
      serverSocket.on('data', (chunk) => { bytesIn += chunk.length; });
      clientSocket.on('data', (chunk) => { bytesOut += chunk.length; });
      serverSocket.pipe(clientSocket);
      clientSocket.pipe(serverSocket);
    });

    serverSocket.once('close', finalize);
    clientSocket.once('close', () => {
      serverSocket.destroy();
      finalize();
    });

    serverSocket.on('error', (err: any) => {
      if (status === 'pending') {
        status = `upstream_error:${err?.code ?? 'unknown'}`;
        try { clientSocket.write('HTTP/1.1 502 Bad Gateway\r\n\r\n'); } catch {}
        clientSocket.end();
      }
    });
    clientSocket.on('error', () => serverSocket.destroy());
  });

  server.listen(opts.port, '::', () => {
    console.log(`[browser-proxy] CONNECT proxy listening on [::]:${opts.port} (dual-stack)`);
  });

  return server;
}
