# Chainlens Sandbox Container

## Overview

The sandbox container (`core/docker/Dockerfile`) is built on `kasmweb/ubuntu-jammy-desktop` and
runs a full browser + code execution environment via s6-overlay. It is provisioned by the
`epsilon-api` backend using Docker or JustAVPS.

## Init Scripts

Scripts in `core/init-scripts/` are copied to `/custom-cont-init.d/` and run at container
start in lexicographic order:

| Script | Purpose |
|--------|---------|
| `95-egress-whitelist.sh` | Deny-by-default outbound iptables (Story 5.0) |
| `95-setup-sshd.sh` | SSH daemon setup |
| `97-secrets-to-s6-env.sh` | Secrets → s6 env dir |
| `98-epsilon-env-setup.sh` | Epsilon environment bootstrap |
| `99-restore-packages.sh` | Restore user-installed packages |
| `zz-fix-opencode-ownership.sh` | Fix file ownership for OpenCode |

## Egress Whitelist (Story 5.0)

`95-egress-whitelist.sh` implements deny-by-default outbound networking per NFR10.

Allowed outbound from sandbox:
- Loopback (`lo`)
- `epsilon-api` — all ports (LLM proxy + billing)
- `vibe-trading:8899` — backtesting service
- DNS (UDP/TCP port 53)
- ESTABLISHED/RELATED connections

All other outbound is logged (`EGRESS-DENY:` kernel log prefix) and dropped.

**Requirements:**
- Container must run with `CAP_NET_ADMIN` (granted via `Privileged: true` + explicit `CapAdd: ['NET_ADMIN']` in `local-docker.ts`)
- Sandbox must be on `SANDBOX_NETWORK` for Docker DNS resolution of `epsilon-api` and `vibe-trading`

**Rollback:** Remove `95-egress-whitelist.sh` COPY line from `core/docker/Dockerfile` and remove `CapAdd: ['NET_ADMIN']` from `local-docker.ts`. Rebuild sandbox image.

## Vibe-Trading Services (Story 5.0 / 5.5)

Four services are deployed alongside `epsilon-api` in `scripts/compose/docker-compose.yml`:

| Service | Port | Purpose |
|---------|------|---------|
| `vibe-trading` | internal (127.0.0.1:8899 local dev) | FastAPI backtesting API |
| `vibe-trading-worker` | — | Celery worker (processes backtest jobs) |
| `vibe-trading-mcp` | internal (port 8900) | FastMCP SSE server — 22 MCP tools for Epsilon agent |
| `redis` | internal | Celery broker + result backend |

`vibe-trading-mcp` reuses the `chainlens-vibe-trading:latest` image (no extra build). It runs
`mcp_server.py --transport sse --port 8900` and exposes the SSE endpoint at `/sse`. The epsilon-api
proxy at `/v1/router/vibe-trading-mcp/*` intercepts `tools/call` for billing and tier gating before
forwarding to this service.

### API Key Setup

Generate `VIBE_TRADING_API_KEY` once and set it in **both** config files — they must match:

```sh
# Generate a random key
openssl rand -hex 32

# Set in apps/api/.env
VIBE_TRADING_API_KEY=<generated>

# Set in Vibe-Trading/agent/.env
API_AUTH_KEY=<same value>
ALLOWED_IPS=172.20.0.0/16  # match your SANDBOX_NETWORK subnet
```

### Auth Scheme

Vibe-Trading uses HTTPBearer (`Authorization: Bearer <token>`), NOT `X-API-Key`.
IP allowlist check is a **hard gate before** bearer verification — set `ALLOWED_IPS` to the
Docker network CIDR or requests from other containers will receive HTTP 403 regardless of token.

### Docker Compose

```sh
# Start all backend services (epsilon-api + vibe-trading + redis)
docker compose --profile backend up -d

# Check service health
docker compose ps
curl http://localhost:8899/health  # local dev only

# View logs
docker compose logs -f vibe-trading
docker compose logs -f vibe-trading-worker
```

### Rollback

```sh
docker compose down vibe-trading vibe-trading-worker redis
# Revert scripts/compose/docker-compose.yml (remove 3 services + volumes section)
# Revert core/docker/Dockerfile (remove egress whitelist COPY line)
# Revert apps/api/src/platform/providers/local-docker.ts (remove CapAdd)
```

### Migration to Dedicated VPS (deferred)

When any of these thresholds are sustained:
- >50 backtest jobs/day
- `vibe-trading-worker` CPU >80% for 30+ minutes
- Backtest p95 wall-clock >25s

Migration steps: provision separate VPS, deploy via WireGuard tunnel, update
`VIBE_TRADING_INTERNAL_URL` in `apps/api/.env`. No code changes required.

## Shadow Account Persistence (Story 5.0.1)

Story 5.6 (Shadow Account / Swarm Teams UI) writes per-user state under
`~/.vibe-trading/` inside the `vibe-trading*` containers. Without persistent
volumes, that state vanishes on every container restart and Story 5.6 features
silently break (404 on `GET /shadow-reports/:id`).

### Volumes

Three named volumes are declared in `scripts/compose/docker-compose.yml` and
mounted on **all three** vibe-trading services (`vibe-trading`,
`vibe-trading-worker`, `vibe-trading-mcp`):

| Volume | Mount path | Purpose |
|---|---|---|
| `vibe-trading-shadow-accounts` | `/home/vibe/.vibe-trading/shadow_accounts` | Extracted shadow strategy JSON profiles |
| `vibe-trading-shadow-reports` | `/home/vibe/.vibe-trading/shadow_reports` | Rendered HTML / PDF reports |
| `vibe-trading-shadow-runs` | `/home/vibe/.vibe-trading/shadow_runs` | Backtester result cache (avoids re-running expensive backtests) |

The container `USER` is `vibe` (see `Vibe-Trading/Dockerfile`), so `Path.home()`
in Python resolves to `/home/vibe`. The Dockerfile pre-creates these
directories and `chown`s them to `vibe:vibe` before the `USER vibe` directive
so first-boot named-volume mounts inherit usable permissions (Docker copies
the underlying directory permissions when initializing an empty named volume).

### Apply (rolling deploy)

```sh
# Rebuild image to pick up Dockerfile mkdir+chown for /home/vibe/.vibe-trading
docker compose build vibe-trading

# Rolling restart — volumes are created on first attach
docker compose up -d --force-recreate vibe-trading vibe-trading-worker vibe-trading-mcp

# Verify mounts are active and writable by the vibe user
docker exec vibe-trading sh -c 'ls -ld /home/vibe/.vibe-trading/shadow_*'
docker exec vibe-trading sh -c 'echo test > /home/vibe/.vibe-trading/shadow_accounts/.write-probe && rm /home/vibe/.vibe-trading/shadow_accounts/.write-probe'
```

### Backup / restore

```sh
# Snapshot (single shadow volume)
docker run --rm -v vibe-trading-shadow-accounts:/data -v $(pwd):/backup alpine \
  tar czf /backup/shadow-accounts-$(date +%F).tgz -C /data .

# Restore
docker run --rm -v vibe-trading-shadow-accounts:/data -v $(pwd):/backup alpine \
  tar xzf /backup/shadow-accounts-2026-05-18.tgz -C /data
```

Run nightly via cron / systemd timer. Shadow profiles are
user-identity-level data — losing them means users lose their saved trading
strategies and rendered reports.

### Rollback

Remove the three `vibe-trading-shadow-*` lines from `volumes:` (top-level) and
from each service's `volumes:` block, then redeploy. Any shadow data already
on disk (in the named volumes) survives `docker compose down` and can be
re-attached by re-adding the mount lines later. Use `docker volume rm` only
when intentionally abandoning the data.

### Consumers

- Story 5.6 — Shadow Account + Swarm Teams UI (frontend `/shadow-reports/:id` endpoint)
- Vibe-Trading `extract_shadow_strategy` MCP tool (via `vibe-trading-mcp` SSE service)
- Vibe-Trading `render_shadow_report` API and worker job
