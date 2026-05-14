# Development & Release Guide

> How ChainLens is developed, built, and released.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Local Development](#local-development)
3. [Sandbox Dev Details](#sandbox-dev-details)
4. [CI/CD: Dev Line](#cicd-dev-line)
5. [CI/CD: Prod Line (Release)](#cicd-prod-line-release)
6. [Docker Hub Tags](#docker-hub-tags)
7. [Version Sources](#version-sources)
8. [Snapshots](#snapshots)
9. [Ports Reference](#ports-reference)
10. [Quick Reference](#quick-reference)

---

## Architecture Overview

### Three components

| Component | Image | Source | What it does |
|---|---|---|---|
| **API** | `epsilon/epsilon-api` | `apps/api/` | Backend API (Bun + Hono) |
| **Frontend** | `epsilon/epsilon-frontend` | `apps/web/` | Next.js web app |
| **Computer** | `epsilon/computer` | `core/` | Sandbox container (Alpine, s6, browser, tools) |

### Two environments

| Environment | URL | API | Frontend | Computer |
|---|---|---|---|---|
| **Dev** | `dev.epsilon.com` | `dev-api.epsilon.com` (VPS) | Vercel (main branch) | JustAVPS (dev org) |
| **Prod** | `epsilon.com` | `new-api.epsilon.com` (VPS) | Vercel (production branch) | JustAVPS (prod org) |

### Single registry

All Docker images live on **Docker Hub** in the `epsilon/` namespace.

---

## Local Development

```bash
# 1. Start Supabase
supabase start
supabase status -o env  # copy values into apps/api/.env and apps/web/.env.local

# 2. Start dev servers (frontend + API)
pnpm dev

# 3. Start sandbox (optional — only when you need it)
pnpm dev:sandbox
```

### Individual services

```bash
pnpm dev:frontend   # Next.js on http://localhost:3000
pnpm dev:api        # epsilon-api on http://localhost:8008
pnpm dev            # Both at once
pnpm dev:sandbox    # Sandbox container with bind mounts
```

### Khởi động thủ công (khi pnpm dev không dùng được)

Nếu cần start từng service riêng lẻ mà không qua pnpm workspace:

```bash
# API (port 8008)
cd apps/api && bun run dev

# Frontend (port 3000)
cd apps/web && bun run dev
# hoặc: bunx next dev --turbopack --port 3000
```

> **Lưu ý:** `bunx next dev` trực tiếp có thể lỗi `Cannot find module 'styled-jsx/package.json'`
> nếu chạy với `node` thay vì `bun`. Luôn dùng `bun run dev` (đọc script từ package.json).

### Thứ tự khởi động quan trọng

API phải start **trước** Frontend để tránh lỗi "Cannot connect to API" khi FE load lần đầu.
Nếu FE đã load mà API chưa sẵn sàng, reload lại trang sau khi API up.

### Kiểm tra sau khi start

```bash
# API health
curl http://localhost:8008/v1/health

# Sandbox health (nếu đang chạy)
curl http://127.0.0.1:14000/epsilon/health

# Frontend: mở http://localhost:3000
```

### Lỗi thường gặp khi dev local

| Lỗi | Nguyên nhân | Fix |
|---|---|---|
| `Cannot find module 'styled-jsx/package.json'` | Chạy `bunx next dev` với node thay vì bun | Dùng `bun run dev` trong `apps/web/` |
| `Cannot connect to API` / 401 Unauthorized | `INTERNAL_SERVICE_KEY` lệch giữa `.env` và sandbox | Xem mục **Auth mismatch** bên dưới |
| Frontend redirect về `/auth` sau restart | JWT session hết hạn | Reload trang, login lại |
| Backtest SSE timeout / không nhận kết quả | SSE heartbeat timeout trước khi job xong | Bình thường với job dài — kết quả vẫn có trong DB, dùng job_id để query lại |
| Tab store restore session cũ sau backend reconnect | `swapForServer` restore `activeTabId` từ localStorage | Hành vi đúng của tab system — navigate thủ công đến trang cần |

### Auth mismatch (INTERNAL_SERVICE_KEY)

Khi API trả về 401 mặc dù đã login:

```bash
# 1. Đọc key thực tế trong sandbox
docker exec epsilon-sandbox cat /workspace/.persistent-system/secrets/.bootstrap-env.json \
  || docker exec epsilon-sandbox cat /workspace/.secrets/.bootstrap-env.json

# 2. Lấy giá trị INTERNAL_SERVICE_KEY (hoặc EPSILON_TOKEN)
# 3. Cập nhật vào apps/api/.env và apps/web/.env
# 4. Restart API: Ctrl+C rồi bun run dev lại
```

---

## Sandbox Dev Details

### Bind mounts (dev mode)

`docker-compose.dev.yml` overlays local source on the prebaked image:

| Local path | Container path |
|---|---|
| `core/epsilon-master/src` | `/ephemeral/epsilon-master/src` |
| `core/epsilon-master/opencode/` | `/ephemeral/epsilon-master/opencode/` |
| `core/epsilon-master/channels/src` | `/ephemeral/epsilon-master/channels/src` |
| `core/epsilon-master/triggers/src` | `/ephemeral/epsilon-master/triggers/src` |

### When to rebuild

You **do not** need to rebuild for:
- TypeScript source changes (bind-mounted live)
- Adding/editing agents, skills, tools, prompts

You **do** need `pnpm dev:sandbox --build` when:
- `Dockerfile` changes
- `core/package.json` or `epsilon-master/package.json` changes
- `bun.lock` in a sandbox package changes

### Restarting services inside the container

```bash
docker exec epsilon-sandbox s6-svc -r /run/service/svc-epsilon-master
docker exec -it epsilon-sandbox bash
```

### Health check

```bash
curl http://127.0.0.1:14000/epsilon/health
```

---

## CI/CD: Dev Line

**Workflow:** `.github/workflows/deploy-dev.yml`

### Triggers

- **Push to `main`** — gated by the repo variable `AUTO_DEPLOY_DEV`
  - Set to `true` to auto-deploy on every push
  - Set to `false` (default) to skip push-triggered deploys
- **Manual dispatch** — always runs, builds all 3 components regardless of `AUTO_DEPLOY_DEV`

### How it works

```
push to main (if AUTO_DEPLOY_DEV=true) OR manual dispatch
  │
  ├─► detect-changes (path filter)
  │     API:      apps/api/**, packages/**, pnpm-lock.yaml
  │     Frontend: apps/web/**, packages/shared/**
  │     Computer: core/**
  │
  ├─► build-api-amd64   (ubuntu-latest)      │
  ├─► build-api-arm64   (ubuntu-24.04-arm)   │  parallel native builds
  ├─► build-frontend-amd64                   │  (NO QEMU)
  ├─► build-frontend-arm64                   │
  ├─► build-computer-amd64                   │
  └─► build-computer-arm64                   ┘
        │
        ├─► merge-api       → epsilon/epsilon-api:dev-{sha8} + :dev-latest (multi-arch)
        ├─► merge-frontend  → epsilon/epsilon-frontend:dev-{sha8} + :dev-latest
        └─► merge-computer  → epsilon/computer:dev-{sha8} + :dev-latest
              │
              └─► deploy-api → SSH to dev VPS → blue/green deploy
```

### Managing the auto-deploy gate

```bash
# Enable auto-deploy on push to main
gh variable set AUTO_DEPLOY_DEV --repo epsilon-ai/chainlens --body true

# Disable
gh variable set AUTO_DEPLOY_DEV --repo epsilon-ai/chainlens --body false

# Check current value
gh variable list --repo epsilon-ai/chainlens
```

### Trigger a dev deploy manually

```bash
gh workflow run deploy-dev.yml --repo epsilon-ai/chainlens
```

### Dev snapshot

Dev snapshots are built by the unified `snapshot-build.yml` workflow:
- Auto on push to `core/**` if `AUTO_SNAPSHOT_DEV=true`
- Manual dispatch any time:

```bash
gh workflow run snapshot-build.yml --repo epsilon-ai/chainlens -f version=dev-latest -f target=dev
```

The snapshot workflow is decoupled from `deploy-dev.yml` so it doesn't block the main pipeline.

---

## CI/CD: Prod Line (Release)

**Workflow:** `.github/workflows/release.yml`

### Trigger

Manual only. Go to GitHub Actions → "Release Version" → Run workflow.

**Inputs:**
- `version` — e.g. `0.8.30`
- `title` — release title, e.g. `"Streaming fixes, new onboarding"`
- `description` — optional multi-line description

### How it works

```
Run workflow (version=0.8.30)
  │
  ├─► retag-images (30 sec — NO REBUILD)
  │     docker buildx imagetools create \
  │       epsilon/epsilon-api:0.8.30 ← epsilon/epsilon-api:dev-latest
  │     (same for frontend + computer)
  │     Also tags as :latest
  │
  ├─► deploy-prod → SSH to prod VPS → blue/green deploy
  ├─► update-production-branch → fast-forward production branch → Vercel deploys epsilon.com
  ├─► create-release → git tag + GitHub Release with auto-changelog
  └─► build-prod-snapshot → async JustAVPS snapshot (non-blocking)
```

### Key insight: no rebuild

Prod promotion re-tags the multi-arch manifests that were already built on the dev line. **No code is rebuilt.** The exact bytes that were tested on dev go to prod.

### Required secrets

- `DOCKERHUB_USERNAME`, `DOCKERHUB_TOKEN` — Docker Hub push
- `PROD_HOST`, `PROD_USERNAME`, `PROD_KEY` — SSH to prod VPS
- `GH_RELEASE_PAT` — PAT with `workflow` scope (needed to push workflow files to the `production` branch; `GITHUB_TOKEN` alone cannot)
- `prod` environment: `JUSTAVPS_API_KEY` — for prod snapshot builds

---

## Docker Hub Tags

All images live in the `epsilon/` Docker Hub namespace.

### Tag convention

| Tag | Meaning |
|---|---|
| `dev-{sha8}` | Specific dev build from commit `{sha8}` (multi-arch) |
| `dev-latest` | Points to the current dev line state |
| `0.8.30` | A released version (multi-arch) |
| `latest` | Latest released version |

### Images

| Image | Component |
|---|---|
| `epsilon/epsilon-api` | Backend API |
| `epsilon/epsilon-frontend` | Next.js frontend |
| `epsilon/computer` | Sandbox container |

All images are **multi-arch (amd64 + arm64)**. Works on x86 servers and Apple Silicon / ARM machines.

---

## Version Sources

Single source of truth per component:

| Component | How version is set | Where it's read |
|---|---|---|
| **API** (`epsilon-api`) | `SANDBOX_VERSION` env var injected by `deploy-zero-downtime.sh` from image tag | `config.SANDBOX_VERSION`, `/health` endpoint, `/v1/platform/sandbox/version` |
| **Computer** (`epsilon/computer`) | `SANDBOX_VERSION` env var injected by `justavps.ts`/`local-docker.ts` from image tag | `epsilon-master` `/epsilon/health` endpoint, falls back to `/ephemeral/metadata/.version` baked at build time |
| **Frontend** | Not tracked (Vercel deployment hashes) | — |

### Version endpoints

```bash
# Current running API version
GET /v1/platform/sandbox/version

# Latest available version (channel: stable|dev)
GET /v1/platform/sandbox/version/latest?channel=stable
GET /v1/platform/sandbox/version/latest?channel=dev

# All installable versions (both channels)
GET /v1/platform/sandbox/version/all

# Unified changelog
GET /v1/platform/sandbox/version/changelog
```

**Stable versions** come from the GitHub Releases API.
**Dev versions** come from the Docker Hub Tags API (only shows tags that actually exist as images).

No JSON files, no manual changelog entries.

### Changelog page

`/changelog` in the web app shows all versions. Users can click "Install" on any version to update their sandbox. Dev builds are hidden behind a subtle toggle by default.

---

## Snapshots

JustAVPS snapshots are VPS images that speed up provisioning of new machines. The sandbox Docker image is pre-pulled into the snapshot.

One file, three triggers: `snapshot-build.yml`

| Trigger | Target |
|---|---|
| Push to `core/**` (gated by `AUTO_SNAPSHOT_DEV` repo variable) | dev |
| Manual dispatch — pick `version` + `target` (dev/prod) | user choice |
| `workflow_call` from `release.yml` | prod |

Snapshots use the `dev` or `prod` GitHub Environment to select the correct `JUSTAVPS_API_KEY` secret (different org per environment).

### Provisioning logic (`justavps.ts`)

When a new machine is needed, the API:
1. Explicit `JUSTAVPS_IMAGE_ID` override? Use it.
2. Dev snapshots (`epsilon-computer-vdev-*`) ready? Use the newest one.
3. Stable snapshots (`epsilon-computer-v0.8.*`) ready? Use the highest semver.
4. Nothing found? Provision without an image_id (bare machine, slower).

Machine provisioning is always available — it never blocks on the latest snapshot being ready.

---

## Ports Reference

All ports are on `127.0.0.1` in dev (no public exposure).

| Host port | Container port | Service |
|---|---|---|
| `14000` | `8000` | Epsilon Master (proxy entry point) |
| `14001` | `3111` | OpenCode Web UI |
| `14002` | `6080` | Desktop (noVNC HTTP) |
| `14003` | `6081` | Desktop (noVNC HTTPS) |
| `14004` | `3210` | Presentation Viewer |
| `14005` | `9223` | Agent Browser Stream (WebSocket) |
| `14006` | `9224` | Agent Browser Viewer |
| `14007` | `22` | SSH |
| `14008` | `3211` | Static Web Server |

---

## Quick Reference

### Local dev

```bash
supabase start
pnpm dev                  # frontend + API
pnpm dev:sandbox          # sandbox (separate terminal)
pnpm dev:sandbox --build  # force rebuild after dep change
```

### Health checks

```bash
curl http://127.0.0.1:14000/epsilon/health         # local sandbox
curl https://dev-api.epsilon.com/v1/platform/sandbox/version   # dev API
curl https://new-api.epsilon.com/v1/platform/sandbox/version   # prod API
```

### CI/CD operations

```bash
# Trigger a dev deploy manually (builds all 3 components)
gh workflow run deploy-dev.yml --repo epsilon-ai/chainlens

# Build a dev JustAVPS snapshot
gh workflow run snapshot-build.yml --repo epsilon-ai/chainlens -f version=dev-latest -f target=dev

# Build a prod JustAVPS snapshot
gh workflow run snapshot-build.yml --repo epsilon-ai/chainlens -f version=0.8.30 -f target=prod

# Enable/disable auto-deploy on push to main
gh variable set AUTO_DEPLOY_DEV --repo epsilon-ai/chainlens --body true
gh variable set AUTO_DEPLOY_DEV --repo epsilon-ai/chainlens --body false

# Promote to production
gh workflow run release.yml --repo epsilon-ai/chainlens \
  -f version="0.8.30" \
  -f title="Your release title" \
  -f description="Optional longer description"
```

### Sandbox container operations

```bash
docker exec epsilon-sandbox s6-svc -r /run/service/svc-epsilon-master
docker exec -it epsilon-sandbox bash
docker compose -f core/docker/docker-compose.yml build
```

### Backtest feature (Vibe-Trading)

```bash
# Submit một backtest job thủ công (để debug)
curl -s -X POST http://localhost:8008/v1/router/vibe-trading/jobs \
  -H "Authorization: Bearer <JWT>" \
  -H "Content-Type: application/json" \
  -d '{"simulation_environment":{"exchange":"okx","instrument_type":"SPOT","initial_capital":"1000","historical_range":30},"context_rules":{"assets":["BTC-USDT"],"timeframe":"4h","indicators":["SMA_20","SMA_50"],"natural_language_rules":"Long when 20-SMA crosses above 50-SMA"}}'

# Xem kết quả SSE stream của một job
curl -N --max-time 120 http://localhost:8008/v1/router/vibe-trading/runs/<job_id>/stream \
  -H "Authorization: Bearer <JWT>" \
  -H "Accept: text/event-stream"

# Lấy JWT từ browser: DevTools → Application → Cookies → sb-epsilon-auth-token-3000
# Decode base64 → lấy access_token
```

**SSE events:** `heartbeat` → `data_loading` → `phase_a` (partial) → `phase_b` (final) hoặc `failed` / `timeout`

**UI route:** `/dashboard/backtest` — Monaco Editor với JSON config, kết quả hiển thị inline sau khi SSE `phase_b` nhận được.
