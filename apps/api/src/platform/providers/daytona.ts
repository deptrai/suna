/**
 * Daytona sandbox provider.
 *
 * Creates sandboxes in Daytona Cloud from a pre-built snapshot.
 * Extracted from the original account.ts provisioning logic.
 */

import { eq } from 'drizzle-orm';
import { sandboxes } from '@epsilon/db';
import { getDaytona } from '../../shared/daytona';
import { db } from '../../shared/db';
import { getSandboxServiceKeyFromConfig } from '../../shared/sandbox-secrets';
import { config, SANDBOX_VERSION } from '../../config';
import type {
  SandboxProvider,
  ProviderName,
  CreateSandboxOpts,
  ProvisionResult,
  SandboxStatus,
  ResolvedEndpoint,
  ProvisioningTraits,
  ProvisioningStatus,
} from './index';

export class DaytonaProvider implements SandboxProvider {
  readonly name: ProviderName = 'daytona';

  readonly provisioning: ProvisioningTraits = {
    async: true,
    stages: [
      { id: 'creating', progress: 50, message: 'Creating sandbox...' },
    ],
  };

  async getProvisioningStatus(): Promise<ProvisioningStatus | null> {
    return null;
  }

  async create(opts: CreateSandboxOpts): Promise<ProvisionResult> {
    const snapshot = config.DAYTONA_SNAPSHOT;
    if (!snapshot) {
      throw new Error('DAYTONA_SNAPSHOT is not configured — set it in Dokploy env (e.g. epsilonaicrypto/computer:stable-1)');
    }

    const daytona = getDaytona();

    // Use EPSILON_TOKEN as INTERNAL_SERVICE_KEY — one key for both directions.
    // EPSILON_TOKEN (sandbox → api) is already in opts.envVars.
    // INTERNAL_SERVICE_KEY (api → sandbox) is the same value so the proxy can auth.
    const serviceKey = opts.envVars?.EPSILON_TOKEN || '';

    // Strip /v1/router suffix — opencode.jsonc appends it already.
    // EPSILON_URL may be "https://new-api.epsilon.com/v1/router" but the
    // sandbox expects the base: "https://new-api.epsilon.com".
    const sandboxApiBase = config.EPSILON_URL.replace(/\/v1\/router\/?$/, '');
    const routerBase = `${sandboxApiBase}/v1/router`;

    // Story 8.7 — Browser proxy via local CONNECT proxy (ws-proxy-client).
    // ws-proxy-client listens on 127.0.0.1:3128 inside the sandbox and tunnels
    // each CONNECT request over WebSocket to /v1/proxy/ws on EPSILON_API_URL
    // (a Cloudflare tunnel URL that Daytona Envoy already whitelists).
    // This avoids the need for DAYTONA_NETWORK_ALLOW_LIST or a raw VPS IP.
    const LOCAL_PROXY = 'http://127.0.0.1:3128';

    // Whitelist the API server IP so Daytona's Envoy proxy allows outbound TLS
    // connections from the sandbox back to our API. Set DAYTONA_NETWORK_ALLOW_LIST
    // to a comma-separated CIDR list (e.g. "167.172.66.16/32") in the API env.
    //
    // ⚠️  2026-05-19 INCIDENT (Story 8.7 hotfix): Setting this WITHOUT explicit
    // confirmation breaks production. Daytona REPLACES the default whitelist
    // (api.anthropic.com, openai.com, *.trycloudflare.com, …) with this list →
    // sandboxes lose AI provider access AND can't reach EPSILON_URL tunnel →
    // bootstrap fails → "Workspace offline".
    //
    // We refuse to apply networkAllowList unless DAYTONA_NETWORK_ALLOW_LIST_CONFIRMED=true
    // so future misconfigurations fail-safe.
    let networkAllowList: string | undefined = config.DAYTONA_NETWORK_ALLOW_LIST || undefined;
    if (networkAllowList && !config.DAYTONA_NETWORK_ALLOW_LIST_CONFIRMED) {
      console.error(
        '[DAYTONA] ❌ DAYTONA_NETWORK_ALLOW_LIST is set but DAYTONA_NETWORK_ALLOW_LIST_CONFIRMED=false.\n' +
        '  This var DISABLES Daytona default whitelist (AI providers + Cloudflare tunnels).\n' +
        '  Sandboxes will FAIL to reach EPSILON_URL and AI providers unless those IPs are in the list.\n' +
        '  See: docs/production-deploy-guide.md → "DAYTONA_NETWORK_ALLOW_LIST block AI providers".\n' +
        '  To opt-in: set DAYTONA_NETWORK_ALLOW_LIST_CONFIRMED=true.\n' +
        '  IGNORING DAYTONA_NETWORK_ALLOW_LIST for safety.',
      );
      networkAllowList = undefined;
    }
    const resources = {
      cpu: config.DAYTONA_RESOURCE_CPU,
      memory: config.DAYTONA_RESOURCE_MEMORY,
      disk: config.DAYTONA_RESOURCE_DISK,
    };

    const usesImage = snapshot.includes(':') || snapshot.includes('/');
    const createPayload = {
      ...(usesImage ? { image: snapshot } : { snapshot }),
      resources,
      envVars: {
        EPSILON_API_URL: sandboxApiBase,
        ENV_MODE: 'cloud',
        INTERNAL_SERVICE_KEY: serviceKey,
        TUNNEL_API_URL: sandboxApiBase,
        TUNNEL_TOKEN: serviceKey,
        // Route tool SDK traffic through the Epsilon router proxy for billing/key injection.
        // If not set, sandbox tools fall back to hitting the real upstream APIs directly.
        TAVILY_API_URL: `${routerBase}/tavily`,
        REPLICATE_API_URL: `${routerBase}/replicate`,
        SERPER_API_URL: `${routerBase}/serper`,
        FIRECRAWL_API_URL: `${routerBase}/firecrawl`,
        // Inject LLM API keys directly so opencode can call providers without going
        // through the Epsilon router proxy. Daytona Tier 1/2 blocks outbound TLS to
        // api.chainlens.net but allows api.anthropic.com, api.openai.com, etc.
        ...(config.ANTHROPIC_API_KEY ? { ANTHROPIC_API_KEY: config.ANTHROPIC_API_KEY } : {}),
        ...(config.OPENAI_API_KEY ? { OPENAI_API_KEY: config.OPENAI_API_KEY } : {}),
        ...(config.OPENROUTER_API_KEY ? { OPENROUTER_API_KEY: config.OPENROUTER_API_KEY } : {}),
        ...(config.GEMINI_API_KEY ? { GEMINI_API_KEY: config.GEMINI_API_KEY } : {}),
        ...(config.XAI_API_KEY ? { XAI_API_KEY: config.XAI_API_KEY } : {}),
        // Story 8.7 — Route outbound traffic through local ws-proxy-client (port 3128).
        // ws-proxy-client tunnels each CONNECT over WebSocket to EPSILON_API_URL/v1/proxy/ws.
        HTTP_PROXY:              LOCAL_PROXY,
        HTTPS_PROXY:             LOCAL_PROXY,
        AGENT_BROWSER_PROXY_URL: LOCAL_PROXY,  // creds-free for Chromium --proxy-server
        NO_PROXY:                'localhost,127.0.0.1,::1',
        ...opts.envVars,
      },
      autoStopInterval: 15,
      autoArchiveInterval: 30,
      public: false,
      ...(networkAllowList ? { networkAllowList } : {}),
    };

    const createStartedAt = Date.now();
    console.log(
      `[DAYTONA] create start mode=${usesImage ? 'image' : 'snapshot'} target=${config.DAYTONA_TARGET ?? 'default'} resources=${resources.cpu}cpu/${resources.memory}GiB/${resources.disk}GiB sdkTimeout=900s ref=${snapshot}`,
    );
    const createOptions: any = {
      timeout: 900,
      ...(usesImage
        ? {
            onSnapshotCreateLogs: (chunk: string) => {
              const line = String(chunk || '').trim();
              if (line) console.log(`[DAYTONA] snapshot build: ${line.slice(0, 500)}`);
            },
          }
        : {}),
    };
    const daytonaSandbox = await this.withTimeout(
      daytona.create(createPayload, createOptions),
      960_000,
      `daytona.create timed out after 960s (snapshot=${snapshot}, target=${config.DAYTONA_TARGET})`,
    );
    console.log(
      `[DAYTONA] create done sandbox=${daytonaSandbox.id} state=${String(daytonaSandbox.state ?? 'unknown')} durationMs=${Date.now() - createStartedAt}`,
    );

    const externalId = daytonaSandbox.id;

    // Apply networkAllowList after creation — the create() call may not propagate it
    // when using buildInfo (image param). updateNetworkSettings() is reliable regardless.
    if (networkAllowList) {
      try {
        await daytonaSandbox.updateNetworkSettings({ networkAllowList });
        console.log(`[DAYTONA] Applied networkAllowList=${networkAllowList} to sandbox ${externalId}`);
      } catch (err) {
        console.warn(`[DAYTONA] Failed to apply networkAllowList to ${externalId}:`, err);
      }
    }

    console.log(`[DAYTONA] starting runtime bootstrap for sandbox ${externalId}`);
    await this.startRuntime(daytonaSandbox);
    console.log(`[DAYTONA] runtime bootstrap launched for sandbox ${externalId}`);
    const preview = await this.resolvePreviewEndpoint(daytonaSandbox, serviceKey, 8000);
    console.log(`[DAYTONA] waiting for runtime health at ${preview.url}/epsilon/health`);
    const ready = await this.waitForRuntimeReady(daytonaSandbox, preview.url, preview.headers);
    if (!ready) {
      const diagnostics = await this.captureRuntimeDiagnostics(daytonaSandbox);
      if (!config.DAYTONA_KEEP_FAILED_SANDBOX) {
        try {
          await daytona.delete(daytonaSandbox);
        } catch (cleanupErr) {
          console.warn(`[DAYTONA] Failed to clean up unready sandbox ${externalId}:`, cleanupErr);
        }
      } else {
        console.warn(`[DAYTONA] Keeping failed sandbox ${externalId} for debugging (DAYTONA_KEEP_FAILED_SANDBOX=true)`);
      }
      throw new Error(
        `Daytona sandbox ${externalId} runtime on port 8000 was not ready in time${diagnostics ? ` | ${diagnostics}` : ''}`,
      );
    }

    const apiBase = config.EPSILON_URL.replace(/\/v1\/router\/?$/, '').replace(/\/v1\/?$/, '');
    const baseUrl = `${apiBase}/v1/p/${externalId}/8000`;

    return {
      externalId,
      baseUrl,
      metadata: {
        provisionedBy: opts.userId,
        daytonaSandboxId: externalId,
        snapshot,
        resources,
        version: SANDBOX_VERSION,
      },
    };
  }

  async start(externalId: string): Promise<void> {
    const daytona = getDaytona();
    const sandbox = await daytona.get(externalId);
    await sandbox.start();
  }

  async stop(externalId: string): Promise<void> {
    const daytona = getDaytona();
    const sandbox = await daytona.get(externalId);
    await sandbox.stop();
  }

  async remove(externalId: string): Promise<void> {
    const daytona = getDaytona();
    const sandbox = await daytona.get(externalId);
    await daytona.delete(sandbox);
  }

  async getStatus(externalId: string): Promise<SandboxStatus> {
    try {
      const daytona = getDaytona();
      const sandbox = await daytona.get(externalId);
      const state = String(sandbox.state ?? '').toLowerCase();
      if (state.includes('start') || state.includes('running') || state.includes('active')) return 'running';
      if (state.includes('stop') || state.includes('archive')) return 'stopped';
      return 'unknown';
    } catch {
      return 'unknown';
    }
  }

  async resolveEndpoint(externalId: string): Promise<ResolvedEndpoint> {
    const daytona = getDaytona();
    const sandbox = await daytona.get(externalId);
    const base = await this.resolvePreviewEndpoint(sandbox, undefined, 8000);
    const url = base.url;
    const headers: Record<string, string> = { ...base.headers };

    // Look up the service key from config.serviceKey so we can authenticate to the sandbox.
    try {
      const [row] = await db
        .select({ config: sandboxes.config })
        .from(sandboxes)
        .where(eq(sandboxes.externalId, externalId))
        .limit(1);
      const serviceKey = getSandboxServiceKeyFromConfig((row?.config as Record<string, unknown> | null) ?? null) || undefined;
      if (serviceKey) {
        headers['Authorization'] = `Bearer ${serviceKey}`;
      }
    } catch (err) {
      console.warn(`[DAYTONA] Failed to look up service key for ${externalId}:`, err);
    }

    return { url, headers };
  }

  async ensureRunning(externalId: string): Promise<void> {
    const status = await this.getStatus(externalId);
    if (status !== 'running') {
      console.log(`[DAYTONA] Sandbox ${externalId} is ${status}, waking up...`);
      await this.start(externalId);
    }

    // 2026-05-19 incident: Daytona PID 1 is `daytona sleep infinity` — bootstrap
    // (`epsilon-daytona-start` → `bun epsilon-master`) does NOT auto-run after wake
    // from archive. Without this re-trigger, sandboxes silently show "Workspace offline"
    // even though Daytona reports `state=started`. Story 8.5 AC12 / Story 8.7 incident.
    const daytona = getDaytona();
    const sandbox = await daytona.get(externalId);
    const endpoint = await this.resolveEndpoint(externalId);
    const healthy = await this.quickHealthCheck(endpoint.url, endpoint.headers);
    if (!healthy) {
      console.log(`[DAYTONA] Sandbox ${externalId} container running but runtime not responding — re-triggering bootstrap`);
      await this.startRuntime(sandbox);
      const ready = await this.waitForRuntimeReadyShort(sandbox, endpoint.url, endpoint.headers);
      if (!ready) {
        throw new Error(`Sandbox ${externalId} bootstrap failed after wake — runtime not ready`);
      }
      console.log(`[DAYTONA] Sandbox ${externalId} runtime ready after re-bootstrap`);
    }
  }

  private async quickHealthCheck(url: string, headers: Record<string, string>): Promise<boolean> {
    try {
      const res = await fetch(`${url}/epsilon/health`, {
        headers,
        signal: AbortSignal.timeout(5000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  private async waitForRuntimeReadyShort(
    sandbox: any,
    url: string,
    headers: Record<string, string>,
  ): Promise<boolean> {
    const intervalMs = 10000;
    const maxAttempts = 12;
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise((r) => setTimeout(r, intervalMs));
      try {
        const res = await fetch(`${url}/epsilon/health`, {
          headers,
          signal: AbortSignal.timeout(8000),
        });
        if (res.ok) return true;
      } catch {
        /* keep polling */
      }
    }
    return false;
  }

  private async resolvePreviewEndpoint(
    sandbox: any,
    serviceKey?: string,
    port = 8000,
  ): Promise<ResolvedEndpoint> {
    const link = await sandbox.getPreviewLink(port);
    const url = (link.url || String(link)).replace(/\/$/, '');
    const token = link.token || null;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Daytona-Skip-Preview-Warning': 'true',
      'X-Daytona-Disable-CORS': 'true',
    };
    if (token) headers['X-Daytona-Preview-Token'] = token;
    if (serviceKey) headers.Authorization = `Bearer ${serviceKey}`;
    return { url, headers };
  }

  private async startRuntime(sandbox: any): Promise<void> {
    // Daytona's executeCommand kills child processes when its shell exits, so a plain
    // `nohup ... &` does not survive. `setsid bash -c "nohup ... </dev/null &"` puts the
    // bootstrap in a new session detached from any controlling tty.
    const launch =
      "mkdir -p /tmp && setsid bash -c 'nohup /usr/local/bin/epsilon-daytona-start " +
      "> /tmp/epsilon-daytona-start.log 2>&1 < /dev/null &'";
    try {
      await sandbox.process.executeCommand(launch, undefined, 10_000);
    } catch (err) {
      console.warn(`[DAYTONA] Failed to start sandbox runtime bootstrap for ${sandbox.id}:`, err);
      throw err;
    }
  }

  private async waitForRuntimeReady(
    sandbox: any,
    url: string,
    headers: Record<string, string>,
  ): Promise<boolean> {
    // Large images (5GB+) need time to pull before the container starts.
    // Poll every 15s for up to 5 minutes.
    const intervalMs = 15000;
    const maxAttempts = 20; // 5 minutes total
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
      try {
        const res = await fetch(`${url}/epsilon/health`, {
          method: 'GET',
          headers,
          signal: AbortSignal.timeout(25000),
        });
        if (res.ok) return true;
        const body = await res.text().catch(() => '');
        console.warn(`[DAYTONA] Runtime not ready yet (${res.status}) at ${url}/epsilon/health attempt ${i + 1}/${maxAttempts}: ${body.slice(0, 500)}`);
        if (i + 1 === 5 || i + 1 === 10 || i + 1 === 15 || i + 1 === maxAttempts) {
          const diagnostics = await this.captureRuntimeDiagnostics(sandbox);
          if (diagnostics) {
            console.warn(`[DAYTONA] Runtime diagnostics attempt ${i + 1}/${maxAttempts}: ${diagnostics}`);
          }
        }
      } catch (err) {
        console.warn(`[DAYTONA] Runtime probe failed at ${url}/epsilon/health attempt ${i + 1}/${maxAttempts}:`, err);
        if (i + 1 === 5 || i + 1 === 10 || i + 1 === 15 || i + 1 === maxAttempts) {
          const diagnostics = await this.captureRuntimeDiagnostics(sandbox);
          if (diagnostics) {
            console.warn(`[DAYTONA] Runtime diagnostics attempt ${i + 1}/${maxAttempts}: ${diagnostics}`);
          }
        }
      }
    }
    return false;
  }

  private async captureRuntimeDiagnostics(sandbox: any): Promise<string> {
    const command = [
      "echo '--- ps ---'",
      "ps aux | grep -E 'epsilon-master|opencode|daytona-start' | grep -v grep || true",
      "echo '--- ports ---'",
      "ss -lntp 2>/dev/null | grep -E ':8000|:4096' || true",
      "echo '--- daytona-start.log ---'",
      'tail -n 40 /tmp/epsilon-daytona-start.log 2>/dev/null || true',
      "echo '--- opencode-restart.log ---'",
      'tail -n 40 /tmp/opencode-restart.log 2>/dev/null || true',
      "echo '--- health ---'",
      'curl -sS -m 5 http://localhost:8000/epsilon/health 2>/dev/null || true',
      "echo '--- opencode service ---'",
      'curl -sS -m 5 -H "Authorization: Bearer ${INTERNAL_SERVICE_KEY:-}" http://localhost:8000/epsilon/services/opencode-serve 2>/dev/null || true',
      "echo '--- opencode service logs ---'",
      'curl -sS -m 5 -H "Authorization: Bearer ${INTERNAL_SERVICE_KEY:-}" http://localhost:8000/epsilon/services/opencode-serve/logs 2>/dev/null || true',
    ].join('; ');

    try {
      const result = await sandbox.process.executeCommand(command, undefined, 10_000);
      const raw = String(
        result?.result ??
        result?.stdout ??
        result?.output ??
        result?.message ??
        '',
      ).trim();
      return raw.replace(/\s+/g, ' ').slice(0, 1200);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return `diagnostics_error=${message}`;
    }
  }

  private async withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | null = null;
    try {
      return await Promise.race([
        promise,
        new Promise<T>((_, reject) => {
          timer = setTimeout(() => reject(new Error(message)), timeoutMs);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}
