import type { Context } from 'hono';
import { and, eq, sql } from 'drizzle-orm';
import { sandboxes, epsilonApiKeys } from '@epsilon/db';
import { db } from '../../shared/db';
import { generateSandboxKeyPair, hashSecretKey } from '../../shared/crypto';
import { getProvider, type ProviderName } from '../../platform/providers';
import { getSandboxServiceKeyFromConfig, setSandboxServiceKeyInConfig } from '../../shared/sandbox-secrets';
import { sandboxEventBus } from '../../platform/services/sandbox-events';
import { invalidateProviderCache } from '../../sandbox-proxy';
import { invalidatePreviewServiceKeyCache } from '../../sandbox-proxy/routes/preview';

type RotationEndpoint = {
  url: string;
  headers: Record<string, string>;
};

async function pushSandboxToken(endpoint: RotationEndpoint, token: string, authToken: string): Promise<void> {
  const rotateRes = await fetch(`${endpoint.url}/env/rotate-token`, {
    method: 'POST',
    headers: {
      ...endpoint.headers,
      Authorization: `Bearer ${authToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ token }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!rotateRes.ok) {
    const detail = await rotateRes.text().catch(() => '');
    throw new Error(`rotate-token returned ${rotateRes.status}${detail ? `: ${detail}` : ''}`);
  }
}

export async function handleAdminRotateSandboxToken(c: Context): Promise<Response> {
  try {
    const sandboxId = c.req.param('id');
    const body = await c.req.json().catch(() => ({}));
    const reason = typeof body?.reason === 'string' && body.reason.trim()
      ? body.reason.trim()
      : 'manual';
    const actorUserId = c.get('userId') as string | undefined;

    const [sandbox] = await db
      .select()
      .from(sandboxes)
      .where(eq(sandboxes.sandboxId, sandboxId))
      .limit(1);
    if (!sandbox) return c.json({ error: 'Sandbox not found' }, 404);

    const oldServiceKey = getSandboxServiceKeyFromConfig(sandbox.config as Record<string, unknown> | null);
    if (!oldServiceKey) return c.json({ error: 'Sandbox service key missing' }, 400);

    const { publicKey, secretKey } = generateSandboxKeyPair();
    const secretKeyHash = hashSecretKey(secretKey);
    const oldPrefix = oldServiceKey.slice(0, 12);
    const newPrefix = secretKey.slice(0, 12);
    const acceptOldUntilIso = new Date(Date.now() + 30_000).toISOString();

    let endpoint: RotationEndpoint | null = null;
    if (sandbox.externalId) {
      const provider = getProvider(sandbox.provider as ProviderName);
      const resolved = await provider.resolveEndpoint(sandbox.externalId);
      endpoint = {
        url: resolved.url,
        headers: {
          ...resolved.headers,
          Authorization: `Bearer ${oldServiceKey}`,
        },
      };

      try {
        await pushSandboxToken(endpoint, secretKey, oldServiceKey);
      } catch (err) {
        console.warn('[admin] rotate sandbox token push failed before DB commit:', err);
        return c.json({
          ok: false,
          error: 'Failed to push token to sandbox; DB token was not rotated',
          detail: err instanceof Error ? err.message : String(err),
        }, 502);
      }
    }

    try {
      await db.transaction(async (tx) => {
        await tx.execute(sql`SELECT 1 FROM epsilon.sandboxes WHERE sandbox_id = ${sandboxId} FOR UPDATE`);

        await tx
          .update(epsilonApiKeys)
          .set({ status: 'revoked' })
          .where(and(
            eq(epsilonApiKeys.sandboxId, sandboxId),
            eq(epsilonApiKeys.type, 'sandbox'),
            eq(epsilonApiKeys.status, 'active'),
          ));

        await tx.insert(epsilonApiKeys).values({
          sandboxId,
          accountId: sandbox.accountId,
          publicKey,
          secretKeyHash,
          title: 'Sandbox Token',
          type: 'sandbox',
        });

        await tx
          .update(sandboxes)
          .set({
            config: setSandboxServiceKeyInConfig(sandbox.config as Record<string, unknown> | null, secretKey),
            updatedAt: new Date(),
          })
          .where(eq(sandboxes.sandboxId, sandboxId));
      });
    } catch (err) {
      if (endpoint) {
        try {
          await pushSandboxToken(endpoint, oldServiceKey, secretKey);
        } catch (rollbackErr) {
          console.error('[admin] token rotation DB commit failed and sandbox rollback failed:', rollbackErr);
        }
      }
      throw err;
    }

    if (sandbox.externalId) {
      invalidateProviderCache(sandbox.externalId);
      invalidatePreviewServiceKeyCache(sandbox.externalId);
    }

    sandboxEventBus.emit({
      sandboxId,
      externalId: sandbox.externalId ?? '',
      event: 'sandbox.token.rotated',
      status: 'active',
      message: `Sandbox token rotated (${reason})`,
      timestamp: new Date().toISOString(),
    });

    console.log(JSON.stringify({
      event: 'sandbox.token.rotated',
      sandbox_id: sandboxId,
      rotated_by_user_id: actorUserId ?? 'unknown',
      old_key_prefix: oldPrefix,
      new_key_prefix: newPrefix,
      reason,
      pushed: !!endpoint,
      accept_old_until: acceptOldUntilIso,
      ts: new Date().toISOString(),
    }));

    return c.json({
      ok: true,
      sandboxId,
      reason,
      pushed: !!endpoint,
      acceptOldUntil: acceptOldUntilIso,
    });
  } catch (e: any) {
    return c.json({ error: e?.message || String(e) }, 500);
  }
}
