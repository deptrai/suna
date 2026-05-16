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
    async: false,
    stages: [
      { id: 'creating', progress: 50, message: 'Creating sandbox...' },
    ],
  };

  async getProvisioningStatus(): Promise<ProvisioningStatus | null> {
    return null;
  }

  async create(opts: CreateSandboxOpts): Promise<ProvisionResult> {
    // Safety override: if Dokploy env is still pinned to older fix tags, force
    // daytona-fix-5 (includes anthropic default model + bootstrap fast path).
    const snapshot = (
      config.DAYTONA_SNAPSHOT?.includes('daytona-fix-2') ||
      config.DAYTONA_SNAPSHOT?.includes('daytona-fix-3') ||
      config.DAYTONA_SNAPSHOT?.includes('daytona-fix-4')
    )
      ? 'epsilonaicrypto/computer:daytona-fix-5'
      : config.DAYTONA_SNAPSHOT;
    if (!snapshot) {
      throw new Error('DAYTONA_SNAPSHOT is not configured — set it to the snapshot name (e.g. epsilon-sandbox-v0.4.1)');
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

    // Whitelist the API server IP so Daytona's Envoy proxy allows outbound TLS
    // connections from the sandbox back to our API. Set DAYTONA_NETWORK_ALLOW_LIST
    // to a comma-separated CIDR list (e.g. "167.172.66.16/32") in the API env.
    const networkAllowList = config.DAYTONA_NETWORK_ALLOW_LIST || undefined;

    const daytonaSandbox = await daytona.create(
      {
        ...(snapshot.includes(':') || snapshot.includes('/') ? { image: snapshot } : { snapshot }),
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
          ...opts.envVars,
        },
        autoStopInterval: 15,
        autoArchiveInterval: 30,
        public: false,
        ...(networkAllowList ? { networkAllowList } : {}),
      },
      { timeout: 300 },
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

    await this.startRuntime(daytonaSandbox);
    const preview = await this.resolvePreviewEndpoint(daytonaSandbox, serviceKey, 8000);
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
      const serviceKey = (row?.config as Record<string, unknown>)?.serviceKey as string | undefined;
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
    if (status === 'running') return;
    console.log(`[DAYTONA] Sandbox ${externalId} is ${status}, waking up...`);
    await this.start(externalId);
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
          signal: AbortSignal.timeout(10000),
        });
        if (res.ok) return true;
        console.warn(`[DAYTONA] Runtime not ready yet (${res.status}) at ${url}/epsilon/health attempt ${i + 1}/${maxAttempts}`);
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
}
