/**
 * Minimal MCP SSE client for OpenCode tools (Story 5.5.1).
 *
 * Opens a single SSE connection to `{base}/sse`, reads the session bootstrap
 * event, then exposes `callTool(name, args)` which POSTs a JSON-RPC request
 * to `{base}/messages/?session_id=XYZ` and waits for the matching response
 * event in the SSE stream.
 *
 * One client instance per tool `execute()` call — open at the top, close in
 * a `finally` block. Reusing a client across tool calls is unsupported.
 *
 * NOT a full MCP client implementation: we don't handle server-pushed
 * notifications, capability negotiation, or the formal `initialize` round-trip.
 * FastMCP's `/messages` endpoint accepts tools/call directly; that's all we
 * need for swarm orchestration.
 */

export interface McpSseClientOptions {
  /** Base URL of the proxy, e.g. `${EPSILON_API_URL}/v1/router/vibe-trading-mcp` */
  baseUrl: string;
  /** Bearer token for the proxy `epsilon_*` API key. */
  token: string;
  /** Connect-phase timeout for the initial SSE handshake. Default 5s. */
  connectTimeoutMs?: number;
  /** Per-call timeout for individual JSON-RPC requests. Default 10s. */
  callTimeoutMs?: number;
  /** Override globalThis.fetch for tests. */
  fetchImpl?: typeof fetch;
}

interface PendingCall {
  resolve: (text: string) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export class McpSseClient {
  private opts: Required<Omit<McpSseClientOptions, 'fetchImpl'>> & { fetchImpl: typeof fetch };
  private sessionEndpoint: string | null = null;
  private sseAbort = new AbortController();
  private pending = new Map<number, PendingCall>();
  private nextId = 1;
  private connected = false;
  private connectPromise: Promise<void> | null = null;

  constructor(options: McpSseClientOptions) {
    this.opts = {
      connectTimeoutMs: options.connectTimeoutMs ?? 5_000,
      callTimeoutMs: options.callTimeoutMs ?? 10_000,
      baseUrl: options.baseUrl.replace(/\/+$/, ''),
      token: options.token,
      fetchImpl: options.fetchImpl ?? globalThis.fetch,
    };
  }

  /** Open the SSE stream and wait for the session bootstrap event. */
  connect(): Promise<void> {
    if (this.connectPromise) return this.connectPromise;
    this.connectPromise = this._doConnect().then(() => this._doMcpHandshake());
    return this.connectPromise;
  }

  /** Issue the required MCP initialize + notifications/initialized handshake.
   *
   * FastMCP rejects `tools/call` with -32602 if the client hasn't completed
   * this handshake — even on a freshly-opened session.
   */
  private async _doMcpHandshake(): Promise<void> {
    if (!this.sessionEndpoint) throw new Error('MCP session endpoint missing');
    const id = this.nextId++;
    const initBody = {
      jsonrpc: '2.0',
      id,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'vibe_trading_swarm', version: '1' },
      },
    };
    const initWait = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error('MCP initialize timed out'));
      }, this.opts.callTimeoutMs);
      this.pending.set(id, {
        resolve: () => resolve(),
        reject,
        timer,
      });
    });
    await this.opts.fetchImpl(this.sessionEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.opts.token}`,
      },
      body: JSON.stringify(initBody),
      signal: AbortSignal.timeout(this.opts.callTimeoutMs),
    });
    await initWait;
    // Fire-and-forget notification (no response expected, no id).
    await this.opts.fetchImpl(this.sessionEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.opts.token}`,
      },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
      signal: AbortSignal.timeout(this.opts.callTimeoutMs),
    });
  }

  private async _doConnect(): Promise<void> {
    const ready = new Promise<void>((resolveReady, rejectReady) => {
      const connectTimer = setTimeout(() => {
        // Abort the SSE fetch so the IIFE doesn't keep the GET open as a
        // zombie until the wrapper finally calls close().
        // (Story 5.5.1 review finding M2 for OpenCode wrapper.)
        try {
          this.sseAbort.abort();
        } catch { /* already aborted */ }
        rejectReady(new Error(`MCP SSE handshake timed out after ${this.opts.connectTimeoutMs}ms`));
      }, this.opts.connectTimeoutMs);

      // Fire-and-forget — the SSE reader loop runs for the lifetime of the client.
      (async () => {
        let resp: Response;
        try {
          resp = await this.opts.fetchImpl(`${this.opts.baseUrl}/sse`, {
            method: 'GET',
            headers: { Accept: 'text/event-stream', Authorization: `Bearer ${this.opts.token}` },
            signal: this.sseAbort.signal,
          });
        } catch (e) {
          clearTimeout(connectTimer);
          rejectReady(new Error(`MCP SSE connect failed: ${(e as Error).message}`));
          return;
        }

        if (!resp.ok || !resp.body) {
          clearTimeout(connectTimer);
          rejectReady(new Error(`MCP SSE returned status ${resp.status}`));
          return;
        }

        const reader = resp.body.pipeThrough(new TextDecoderStream()).getReader();
        let buffer = '';
        let cleanClose = false;

        try {
          while (true) {
            const { value, done } = await reader.read();
            if (done) {
              cleanClose = true;
              break;
            }
            buffer += value;

            // SSE events terminate on a blank line — either `\r\n\r\n` (most
            // servers including FastMCP) or `\n\n`. Find whichever comes first.
            while (true) {
              const sepCRLF = buffer.indexOf('\r\n\r\n');
              const sepLF = buffer.indexOf('\n\n');
              const sep = sepCRLF === -1 ? sepLF :
                          sepLF === -1 ? sepCRLF :
                          Math.min(sepCRLF, sepLF);
              if (sep === -1) break;
              const sepLen = sep === sepCRLF ? 4 : 2;
              const eventBlock = buffer.slice(0, sep);
              buffer = buffer.slice(sep + sepLen);
              this._handleSseEvent(eventBlock, () => {
                clearTimeout(connectTimer);
                this.connected = true;
                resolveReady();
              });
            }
          }
        } catch (e) {
          // Stream closed unexpectedly — reject all pending calls.
          this._failAllPending(new Error(`MCP SSE stream closed: ${(e as Error).message}`));
        } finally {
          // Always release reader and lock the underlying body. Without this,
          // an early `close()` could leave the reader holding the stream
          // until GC. (Story 5.5.1 review finding M1 for OpenCode wrapper.)
          try {
            await reader.cancel();
          } catch { /* already cancelled */ }
          try {
            reader.releaseLock();
          } catch { /* already released */ }
          // Clean server-close (done=true without exception) also leaves any
          // in-flight callTool() requests stranded. Notify them so they
          // surface the error fast instead of timing out 15s later.
          // (Story 5.5.1 review finding C1.)
          if (cleanClose && this.pending.size > 0) {
            this._failAllPending(new Error('MCP SSE stream closed by server'));
          }
        }
      })();
    });
    return ready;
  }

  private _handleSseEvent(block: string, onSession: () => void): void {
    // Parse `event: NAME` / `data: VALUE` lines. Tolerate both \r\n and \n
    // line endings (FastMCP emits CRLF).
    let eventName = 'message';
    const dataLines: string[] = [];
    for (const rawLine of block.split('\n')) {
      const line = rawLine.replace(/\r$/, '');
      if (line.startsWith('event:')) {
        eventName = line.slice(6).trim();
      } else if (line.startsWith('data:')) {
        dataLines.push(line.slice(5).trim());
      }
    }
    const data = dataLines.join('\n');
    if (!data) return;

    // First event is `event: endpoint` with `data: /messages/?session_id=XYZ`.
    if (eventName === 'endpoint' || (this.sessionEndpoint === null && data.includes('session_id='))) {
      this.sessionEndpoint = this._resolveEndpoint(data);
      onSession();
      return;
    }

    // Subsequent events are JSON-RPC responses.
    try {
      const json = JSON.parse(data);
      const id = typeof json?.id === 'number' ? json.id : null;
      if (id === null) return;
      const pending = this.pending.get(id);
      if (!pending) return;
      this.pending.delete(id);
      clearTimeout(pending.timer);
      if (json.error) {
        pending.reject(new Error(`MCP error ${json.error.code ?? '?'}: ${json.error.message ?? 'unknown'}`));
        return;
      }
      // Tool calls return result.content[0].text (JSON string). The
      // initialize handshake returns a plain `result` object — pass an empty
      // string for those (callers of `callTool` only see content-bearing
      // responses; the handshake helper resolves on any non-error).
      const text = json?.result?.content?.[0]?.text;
      if (typeof text === 'string') {
        pending.resolve(text);
        return;
      }
      // Non-tool response (e.g. initialize) — resolve with empty string.
      pending.resolve('');
    } catch {
      // Non-JSON event — ignore.
    }
  }

  private _resolveEndpoint(raw: string): string {
    // The proxy rewrites the path to include the proxy prefix; the data field
    // looks like `/v1/router/vibe-trading-mcp/messages/?session_id=XYZ`. We
    // build an absolute URL using baseUrl's origin.
    //
    // SECURITY: if baseUrl is malformed we MUST NOT fall back to the raw
    // server-controlled string — an attacker who compromised the upstream
    // could redirect every subsequent POST to an exfiltration host with
    // valid Authorization headers. (Story 5.5.1 review finding C2.)
    const u = new URL(this.opts.baseUrl);
    return `${u.origin}${raw.startsWith('/') ? raw : `/${raw}`}`;
  }

  /** Invoke an MCP tool. Returns the tool's raw text result (typically JSON).
   *
   * @param cancelSignal Optional caller-provided AbortSignal — when fired, the
   *   in-flight POST aborts immediately so the caller can react to user
   *   cancellation without waiting for the 15s call timeout to elapse.
   *   (Story 5.5.1 review finding H2 — wrapper-level abort latency.)
   */
  async callTool(
    name: string,
    args: Record<string, unknown>,
    cancelSignal?: AbortSignal,
  ): Promise<string> {
    await this.connect();
    if (!this.sessionEndpoint) {
      throw new Error('MCP session not established');
    }
    const id = this.nextId++;
    const body = {
      jsonrpc: '2.0',
      id,
      method: 'tools/call',
      params: { name, arguments: args },
    };

    const resultPromise = new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`MCP tools/call ${name} timed out after ${this.opts.callTimeoutMs}ms`));
      }, this.opts.callTimeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      // Reject early on caller cancellation so the pending entry is cleaned
      // up and the resolve loop won't double-resolve once the SSE response
      // (if any) eventually arrives.
      if (cancelSignal) {
        const onAbort = () => {
          this.pending.delete(id);
          clearTimeout(timer);
          reject(new Error(`MCP tools/call ${name} aborted by caller`));
        };
        if (cancelSignal.aborted) {
          onAbort();
        } else {
          cancelSignal.addEventListener('abort', onAbort, { once: true });
        }
      }
    });

    // Combine the per-call timeout signal with the optional caller-provided
    // cancel signal so a fire-and-forget abort tears down the in-flight POST.
    const timeoutSignal = AbortSignal.timeout(this.opts.callTimeoutMs);
    const combinedSignal = cancelSignal
      ? (typeof (AbortSignal as { any?: (s: AbortSignal[]) => AbortSignal }).any === 'function'
          ? (AbortSignal as unknown as { any: (s: AbortSignal[]) => AbortSignal }).any([timeoutSignal, cancelSignal])
          : timeoutSignal)
      : timeoutSignal;

    const postResp = await this.opts.fetchImpl(this.sessionEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.opts.token}`,
      },
      body: JSON.stringify(body),
      signal: combinedSignal,
    });

    // FastMCP returns 202 immediately; result arrives via SSE.
    // A non-2xx response from the proxy (e.g. 410, 403, 402) short-circuits
    // before the SSE response is produced, so we surface it directly.
    if (!postResp.ok && postResp.status !== 202) {
      const text = await postResp.text().catch(() => `status ${postResp.status}`);
      // Cancel pending entry so the timer doesn't fire.
      const pending = this.pending.get(id);
      if (pending) {
        clearTimeout(pending.timer);
        this.pending.delete(id);
      }
      throw new Error(`MCP proxy returned ${postResp.status}: ${text.slice(0, 300)}`);
    }

    return resultPromise;
  }

  /** Close the SSE stream and reject any in-flight calls. */
  close(): void {
    if (this.connected || this.connectPromise) {
      this.sseAbort.abort();
    }
    this._failAllPending(new Error('MCP client closed'));
  }

  private _failAllPending(err: Error): void {
    for (const [, p] of this.pending) {
      clearTimeout(p.timer);
      p.reject(err);
    }
    this.pending.clear();
  }
}
