# Browser Proxy Secret Rotation

> Story 8.7 — sandbox egress CONNECT proxy. Source: [.claude/plans/hay-doc-promt-agent-bubbly-quail.md](../../.claude/plans/hay-doc-promt-agent-bubbly-quail.md)

## Overview

`BROWSER_PROXY_SECRET` is a **shared** static secret used by every Daytona sandbox to authenticate against the Epsilon API CONNECT proxy (port 8009). Leak of this secret means anyone on the public internet can use the proxy to tunnel HTTPS traffic through our VPS.

This runbook covers scheduled rotation and incident response.

## When to rotate

| Trigger | Urgency | Action |
|---------|---------|--------|
| Quarterly schedule | Routine | Standard rotation (15 min downtime per sandbox) |
| Secret seen in screenshot / chat / log / paste site | High | Standard rotation + audit logs for misuse |
| Departing engineer with Dokploy access | Medium | Rotate within 7 days of departure |
| `browser_proxy.connect` log shows traffic from unknown IPs | Critical | Rotate immediately + iptables block + alert |

## Standard rotation procedure

### 1. Generate new secret

```bash
NEW_SECRET=$(openssl rand -base64 32 | tr -d "/+=" | head -c 32)
echo "$NEW_SECRET"
# Example output: kY3pQ9xN4mR2bV8cF7dT5hL1jK6wZ0aE
```

The secret MUST contain only base64url charset (`[A-Za-z0-9_-]`). Other characters break URL parsing in `HTTP_PROXY` env var. The API config validation rejects secrets containing `@:/+=`.

### 2. Update Dokploy

In Dokploy → apps/api service → Environment:
- Set `BROWSER_PROXY_SECRET=<NEW_SECRET>`
- Save and redeploy apps/api

The new proxy server starts with the new secret immediately. Old sandboxes (still holding the old secret in their env) will start getting `407 Proxy Authentication Required` on every CONNECT.

### 3. Reprovision running sandboxes

Sandboxes have the OLD secret baked into their env at provision time. They MUST be recreated to get the new secret.

**Option A — Force recreate all (recommended for incident response)**:
```bash
# From apps/api shell on Dokploy
bun run scripts/admin-rotate-sandbox-token.ts --all
# This deletes all sandboxes; users will see "provisioning..." on next request
```

**Option B — Natural turnover (acceptable for scheduled rotation)**:
- Daytona auto-archives idle sandboxes after 30 minutes (per `autoArchiveInterval: 30`)
- Most users' sandboxes will naturally cycle within 24h
- Notify users of expected re-init delay

### 4. Verify

```bash
# Wait 2 min for new sandbox to provision, then test from a fresh sandbox terminal
echo $HTTP_PROXY                          # Should contain new secret
curl -v https://example.com               # → 200 OK

# Or from external (e.g. your laptop) — direct hit the proxy
curl -v -x "http://epsilon:${NEW_SECRET}@167.172.66.16:8009" https://example.com
# → 200 OK + HTML

# Old secret should fail
curl -v -x "http://epsilon:${OLD_SECRET}@167.172.66.16:8009" https://example.com
# → 407 Proxy Authentication Required
```

### 5. Audit logs

```bash
# In Dokploy, check apps/api logs for the past 24h
docker logs epsilon-api 2>&1 | grep browser_proxy.connect | head -100

# Look for:
# - "status":"auth_fail" → expected during rotation grace period
# - "status":"ok" from unknown source IPs → potential abuse, investigate
# - "status":"ssrf_block:*" → blocked attack attempts (informational)
# - "status":"port_blocked" → blocked abuse attempts (informational)
```

## Incident: suspected leak

1. **Immediately** generate new secret + deploy (steps 1-2 above)
2. Force-recreate all sandboxes (step 3 Option A)
3. Audit logs back to estimated leak time:
   - Filter `status:"ok"` lines
   - Group by `src` IP
   - Flag any `src` IP not matching expected Daytona egress ranges
4. If unauthorized traffic detected:
   - Add iptables block for source IP (VPS-level)
   - Report to security team
   - Estimate bandwidth abused → check VPS bill
5. Post-mortem: update this runbook with attack pattern + detection rule

## Future improvements (v2)

Track as separate story:

- **Per-sandbox HMAC auth**: replace shared secret with `HMAC(GLOBAL_KEY, sandboxId)`. Leak of one sandbox's creds doesn't compromise others. Rotation of `GLOBAL_KEY` only invalidates new provisions, not running sandboxes.
- **Time-limited tokens**: rotating sub-secrets that expire in 24h, refreshed via internal API.
- **OTel metrics + Grafana dashboard**: surface `browser_proxy.connections_total{status}` and alert on auth_fail spikes.
