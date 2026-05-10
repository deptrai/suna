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

## Vibe-Trading Services (Story 5.0)

Three services are deployed alongside `epsilon-api` in `scripts/compose/docker-compose.yml`:

| Service | Port | Purpose |
|---------|------|---------|
| `vibe-trading` | internal (127.0.0.1:8899 local dev) | FastAPI backtesting API |
| `vibe-trading-worker` | — | Celery worker (processes backtest jobs) |
| `redis` | internal | Celery broker + result backend |

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
