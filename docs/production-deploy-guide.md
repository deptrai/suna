# Production Deploy Guide

> Hướng dẫn deploy Chainlens lên VPS/server từ đầu đến cuối.

---

## Mục lục

1. [Yêu cầu hệ thống](#yêu-cầu-hệ-thống)
2. [Chuẩn bị VPS](#chuẩn-bị-vps)
3. [Cài đặt dependencies](#cài-đặt-dependencies)
4. [Clone repo & cấu hình env](#clone-repo--cấu-hình-env)
5. [Khởi động services](#khởi-động-services)
6. [Cấu hình nginx + SSL](#cấu-hình-nginx--ssl)
7. [Deploy update (zero-downtime)](#deploy-update-zero-downtime)
8. [Build sandbox image (epsilon/computer)](#build-sandbox-image-epsiloncomputer)
9. [Daytona sandbox lifecycle (production-critical)](#daytona-sandbox-lifecycle-production-critical)
10. [Kiểm tra sau deploy](#kiểm-tra-sau-deploy)
11. [Troubleshooting](#troubleshooting)

---

## Yêu cầu hệ thống

| Thành phần | Tối thiểu | Khuyến nghị |
|---|---|---|
| CPU | 2 vCPU | 4 vCPU |
| RAM | 4 GB | 8 GB |
| Disk | 40 GB SSD | 80 GB SSD |
| OS | Ubuntu 22.04 LTS | Ubuntu 24.04 LTS |
| Docker | 24+ | latest |
| Bun | 1.x | latest |

**Providers được test:** Hetzner CX22+, DigitalOcean 4GB+

---

## Chuẩn bị VPS

```bash
# Update system
apt update && apt upgrade -y

# Cài essential tools
apt install -y git curl wget nginx certbot python3-certbot-nginx ufw

# Cấu hình firewall
ufw allow 22/tcp    # SSH
ufw allow 80/tcp    # HTTP
ufw allow 443/tcp   # HTTPS
ufw enable
```

---

## Cài đặt dependencies

### Docker

```bash
curl -fsSL https://get.docker.com | bash
systemctl enable docker
systemctl start docker

# Thêm user vào docker group (không cần sudo mỗi lần)
usermod -aG docker $USER
newgrp docker
```

### Bun

```bash
curl -fsSL https://bun.sh/install | bash
source ~/.bashrc
bun --version
```

### pnpm

```bash
npm install -g pnpm
pnpm --version
```

### Supabase CLI (nếu self-host Supabase)

```bash
npm install -g supabase
```

---

## Clone repo & cấu hình env

### 1. Clone

```bash
cd ~
git clone https://github.com/deptrai/chainlens.git
cd chainlens
git submodule update --init --recursive
```

### 2. Cài dependencies

```bash
pnpm install
```

### 3. Cấu hình API env

```bash
cp apps/api/.env.example apps/api/.env
nano apps/api/.env
```

**Các biến BẮT BUỘC cho production:**

```bash
# Core
PORT=8008
ENV_MODE=cloud                          # QUAN TRỌNG: dùng "cloud" cho production

# Database — dùng Supabase cloud hoặc self-hosted
DATABASE_URL=postgresql://postgres:<password>@<host>:5432/postgres

# Supabase
SUPABASE_URL=https://<project>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service_role_key>

# Security — generate: openssl rand -hex 32
API_KEY_SECRET=<64-char-hex>
TUNNEL_SIGNING_SECRET=<random-string>

# Sandbox provider
ALLOWED_SANDBOX_PROVIDERS=daytona

# Daytona (sandbox provider)
DAYTONA_API_KEY=<daytona-api-key>
DAYTONA_SERVER_URL=https://app.daytona.io/api
DAYTONA_TARGET=eu                       # QUAN TRỌNG: dùng "eu" (us region không available)
DAYTONA_SNAPSHOT=epsilonaicrypto/computer:daytona-bootstrap  # Image sandbox — phải có cả egress fix + daytona-start.sh (xem section "Daytona sandbox lifecycle")

# LLM (ít nhất 1 provider)
OPENROUTER_API_KEY=<key>
ANTHROPIC_API_KEY=<key>

# Vibe Trading (backtest service)
VIBE_TRADING_API_KEY=<openssl rand -hex 32>
VIBE_TRADING_INTERNAL_URL=http://vibe-trading:8899
VIBE_TRADING_ALLOWED_IPS=172.30.0.0/16

# Frontend URL
FRONTEND_URL=https://yourdomain.com
EPSILON_URL=https://api.yourdomain.com/v1/router

# CORS
CORS_ALLOWED_ORIGINS=https://yourdomain.com
```

### 4. Cấu hình Frontend env

```bash
cp apps/web/.env.example apps/web/.env.local
nano apps/web/.env.local
```

```bash
NEXT_PUBLIC_ENV_MODE=cloud
NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon_key>
NEXT_PUBLIC_BACKEND_URL=https://api.yourdomain.com/v1
NEXT_PUBLIC_BILLING_ENABLED=false       # true nếu dùng Stripe
```

### 5. Cấu hình Vibe-Trading env

```bash
cp Vibe-Trading/agent/.env.example Vibe-Trading/agent/.env
nano Vibe-Trading/agent/.env
```

```bash
# LLM provider (chọn 1)
LANGCHAIN_PROVIDER=openrouter
LANGCHAIN_MODEL_NAME=deepseek/deepseek-v3.2
OPENROUTER_API_KEY=<key>

# API auth — phải khớp với VIBE_TRADING_API_KEY trong apps/api/.env
API_AUTH_KEY=<same-key-as-VIBE_TRADING_API_KEY>

# Network — phải khớp với subnet trong docker-compose.yml
ALLOWED_IPS=172.30.0.0/16
REDIS_URL=redis://redis:6379/0
```

---

## Khởi động services

### Option A: Dokploy (khuyến nghị cho production)

Chainlens production chạy trên **Dokploy** (Docker Swarm). Các services được quản lý qua Dokploy dashboard tại `http://<server-ip>:3000`.

**Services hiện tại trên production (167.172.66.16):**

| Service | Container | Port | Mô tả |
|---|---|---|---|
| `api` | `api-djcsof` | 8008 | Backend API (Bun + Hono) |
| `frontend` | `frontend-pyzi0j` | 3000 | Next.js web app |
| `vibe-backend` | `vibe-backend-jlwjp5` | 8899 | Backtest API (FastAPI) |
| `dokploy-redis` | `dokploy-redis` | 6379 | Redis (Celery queue) |

**Deploy qua Dokploy:**
- Push code lên branch `feat/rename-chainlens-epsilon` → auto-deploy (autoDeploy=true)
- Hoặc trigger manual qua Dokploy dashboard

### Option B: Docker Compose (dev/staging)

```bash
cd ~/chainlens

# Build và start tất cả services (backend profile: api + vibe-trading + redis)
docker compose -f scripts/compose/docker-compose.yml --profile backend up -d --build

# Kiểm tra status
docker compose -f scripts/compose/docker-compose.yml ps

# Xem logs
docker compose -f scripts/compose/docker-compose.yml logs -f epsilon-api
docker compose -f scripts/compose/docker-compose.yml logs -f vibe-trading
```

> **Lưu ý:** Frontend thường deploy qua Vercel. Chỉ dùng profile `frontend` nếu self-host.

### Option C: Chạy thủ công (dev/debug)

```bash
# Terminal 1 — API
cd apps/api && bun run dev

# Terminal 2 — Frontend
cd apps/web && bun run dev

# Terminal 3 — Vibe-Trading (cần Python 3.11+)
cd Vibe-Trading && pip install -e ".[server]" && vibe-trading serve
```

---

## Cấu hình nginx + SSL

### 1. Tạo nginx config cho API

```bash
nano /etc/nginx/sites-available/epsilon-api
```

```nginx
upstream epsilon_api {
    server 127.0.0.1:8008;
    keepalive 32;
}

server {
    listen 80;
    server_name api.yourdomain.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name api.yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/api.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.yourdomain.com/privkey.pem;

    # SSE — quan trọng cho backtest streaming
    proxy_buffering off;
    proxy_cache off;
    proxy_read_timeout 300s;
    proxy_send_timeout 300s;
    keepalive_timeout 300s;

    location / {
        proxy_pass http://epsilon_api;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

```bash
ln -s /etc/nginx/sites-available/epsilon-api /etc/nginx/sites-enabled/
nginx -t && nginx -s reload
```

### 2. SSL với Let's Encrypt

```bash
certbot --nginx -d api.yourdomain.com
# Nếu self-host frontend:
certbot --nginx -d yourdomain.com
```

### 3. State file cho blue/green deploy

```bash
echo "blue" > ~/.epsilon-deploy-slot
```

---

## Deploy update (zero-downtime)

Script `scripts/deploy-zero-downtime.sh` thực hiện blue/green deploy:

```bash
cd ~/chainlens

# Deploy từ latest main (build local)
bash scripts/deploy-zero-downtime.sh

# Deploy từ prebuilt Docker Hub image (nhanh hơn, dùng trong CI)
PREBUILT_IMAGE=epsilon/epsilon-api:0.8.30 bash scripts/deploy-zero-downtime.sh
```

**Quy trình:**
1. Pull code mới (traffic vẫn chạy trên slot cũ)
2. Build image mới trên slot standby
3. Health check slot mới (`/v1/health`)
4. Swap nginx upstream → reload (graceful, không drop connection)
5. Stop container cũ
6. Tự rollback nếu bất kỳ bước nào fail

### Deploy qua GitHub Actions (CI/CD)

```bash
# Trigger dev deploy thủ công
gh workflow run deploy-dev.yml --repo deptrai/chainlens

# Promote lên production
gh workflow run release.yml --repo deptrai/chainlens \
  -f version="0.8.30" \
  -f title="Release title"
```

---

## Build sandbox image (epsilon/computer)

Sandbox image được build từ `core/docker/Dockerfile` và push lên Docker Hub (`epsilonaicrypto/computer`).

### KHUYẾN NGHỊ: Build trên server prod, KHÔNG build trên máy local

**Lý do:**
- Image rất nặng (~4-5GB sau khi nén multi-arch). Mạng VN không đủ ổn định để push lên Docker Hub — sẽ bị **502 Bad Gateway / 400 Bad Request** sau 30-60 phút và mất hết công sức build.
- Server prod (DigitalOcean/Hetzner) có bandwidth tốt và gần Cloudflare CDN nên push nhanh, không bị throttle.
- Server amd64 build native — không cần QEMU emulation cho arm64.

### Quy trình build (trên server prod)

```bash
# 1. (Trên máy local) Copy build context lên server (~7MB)
cd /path/to/chainlens
ssh root@<server-ip> "mkdir -p /root/build-epsilon-computer"
rsync -az --exclude 'node_modules' --exclude '.git' --exclude '*.log' \
  core/ root@<server-ip>:/root/build-epsilon-computer/core/
scp LICENSE root@<server-ip>:/root/build-epsilon-computer/LICENSE

# 2. (Trên server) Đảm bảo đã login Docker Hub với account `vonicvn` (owner của namespace `epsilonaicrypto`)
ssh root@<server-ip>
docker login -u vonicvn

# 3. Build và push (amd64 only — server prod là amd64)
cd /root/build-epsilon-computer
nohup docker buildx build \
  --platform linux/amd64 \
  --build-arg SANDBOX_VERSION=0.1.0 \
  -t epsilonaicrypto/computer:0.1.0 \
  -t epsilonaicrypto/computer:latest \
  -f core/docker/Dockerfile \
  --push \
  --progress plain \
  . > /tmp/build.log 2>&1 &

# 4. Theo dõi progress
tail -f /tmp/build.log

# 5. Verify trên Docker Hub
curl -s "https://hub.docker.com/v2/repositories/epsilonaicrypto/computer/tags/0.1.0" | python3 -m json.tool
```

Build mất ~15-25 phút trên server 8 vCPU.

Sau khi push xong, update `DAYTONA_SNAPSHOT=epsilonaicrypto/computer:0.1.0` trong Dokploy env của API và redeploy.

### Build multi-arch (chỉ khi cần arm64)

Nếu cần arm64 (vd Apple Silicon servers), build trên một máy arm64 riêng rồi merge manifest:

```bash
# Trên server amd64
docker buildx build --platform linux/amd64 -t epsilonaicrypto/computer:0.1.0-amd64 ... --push .

# Trên server arm64
docker buildx build --platform linux/arm64 -t epsilonaicrypto/computer:0.1.0-arm64 ... --push .

# Trên một trong hai
docker buildx imagetools create -t epsilonaicrypto/computer:0.1.0 \
  epsilonaicrypto/computer:0.1.0-amd64 \
  epsilonaicrypto/computer:0.1.0-arm64
```

### Lưu ý quan trọng

- `DAYTONA_TARGET=eu` — bắt buộc, region `us` không available cho org này
- `DAYTONA_SNAPSHOT` phải là Docker image name (có `:`) để Daytona pull trực tiếp thay vì dùng snapshot registry. Logic detect ở [daytona.ts:59](apps/api/src/platform/providers/daytona.ts#L59): `snapshot.includes(':') || snapshot.includes('/')` → `{ image: snapshot }`
- KHÔNG dùng `kortix/suna:*` — đó là image Suna gốc, không có epsilon-master service. Sandbox sẽ trả 502 vĩnh viễn.

### Thin patch build (cho fix nhỏ trong init scripts)

Nếu chỉ sửa file trong `core/init-scripts/` hoặc `core/daytona-start.sh` (KHÔNG sửa Dockerfile build steps), build thin patch trên top base image — nhanh hơn full rebuild rất nhiều (~30s build + 5 phút push thay vì 20-30 phút):

```bash
# Pull base image về local nếu chưa có
docker pull epsilonaicrypto/computer:daytona-bootstrap

# Tạo Dockerfile patch
cat > /tmp/Dockerfile.patch <<'EOF'
FROM epsilonaicrypto/computer:daytona-bootstrap
COPY core/init-scripts/95-egress-whitelist.sh /custom-cont-init.d/95-egress-whitelist
COPY core/daytona-start.sh /usr/local/bin/epsilon-daytona-start
RUN chmod +x /custom-cont-init.d/95-egress-whitelist /usr/local/bin/epsilon-daytona-start
EOF

# Build + push (cần docker login Docker Hub với account vonicvn)
docker buildx build --platform linux/amd64 \
  --file /tmp/Dockerfile.patch \
  --tag epsilonaicrypto/computer:daytona-fix-N \
  --push .

# Update DAYTONA_SNAPSHOT trong Dokploy → redeploy API
```

**KHÔNG dùng thin patch nếu**:
- Sửa nội dung được copy/install trong RUN steps (vd `apt install`, `npm install`, `bun install`).
- Sửa `/ephemeral/epsilon-master/` content — vì nó được rsync trong RUN step của Dockerfile gốc.

### Lessons learned (build push fail từ máy local)

Đã thử build multi-arch (`linux/amd64,linux/arm64`) từ MacBook qua mạng VN:
- Pull base image (~2GB cho 2 arch): mất ~15 phút (ổn)
- Build steps (50/50): mất ~30 phút (ổn)
- **Push lên Docker Hub: FAIL sau ~2 tiếng** với chuỗi 502 Bad Gateway → 400 Bad Request từ `registry-1.docker.io`. Buildx retry liên tục nhưng cuối cùng bỏ cuộc.

Sau khi chuyển sang build trên server prod (Hetzner/DigitalOcean US), build + push hoàn tất trong ~20 phút.

---

## Kiểm tra sau deploy

```bash
# API health
curl https://api.yourdomain.com/v1/health

# API version
curl https://api.yourdomain.com/v1/platform/sandbox/version

# Vibe-Trading health (internal only)
docker exec <vibe-trading-container> curl -s http://localhost:8899/health

# Redis
docker exec <redis-container> redis-cli ping

# Backtest test job
curl -X POST https://api.yourdomain.com/v1/router/vibe-trading/jobs \
  -H "Authorization: Bearer <JWT>" \
  -H "Content-Type: application/json" \
  -d '{"simulation_environment":{"exchange":"okx","instrument_type":"SPOT","initial_capital":"1000","historical_range":7},"context_rules":{"assets":["BTC-USDT"],"timeframe":"4h","indicators":["SMA_20"],"natural_language_rules":"Long when price above SMA20"}}'
```

---

## Daytona sandbox lifecycle (production-critical)

> Section này tổng hợp lessons learned từ debug session 2026-05-15. Đọc trước khi maintain `core/docker/Dockerfile`, `core/daytona-start.sh`, hoặc [`apps/api/src/platform/providers/daytona.ts`](apps/api/src/platform/providers/daytona.ts).

### Daytona dùng PID 1 riêng — KHÔNG chạy ENTRYPOINT image

Daytona Cloud start container của bạn nhưng thay PID 1 = `/usr/local/bin/daytona sleep infinity` (daemon riêng của Daytona để hỗ trợ toolbox proxy). **ENTRYPOINT của image bị bypass hoàn toàn**, nghĩa là:

- `s6-overlay /init` không chạy → không có service nào tự start.
- `/custom-cont-init.d/*` scripts không chạy.
- `/ephemeral/startup.sh` không chạy.
- Port 8000 không có gì listen → `waitForRuntimeReady` timeout sau 5 phút → 3 retries → sandbox bị `daytona.delete()` → user thấy `"Workspace offline"`.

**Verify state trong sandbox sống**:
```bash
SBID=<sandbox-uuid>; TOK=$DAYTONA_API_KEY
curl -s -X POST -H "Authorization: Bearer $TOK" -H "Content-Type: application/json" \
  "https://proxy.app-eu.daytona.io/toolbox/$SBID/process/execute" \
  -d '{"command":"ps -ef | head -5","timeout":10}'
# PID 1 = "daytona sleep infinity" → confirmed Daytona pattern
```

### Bootstrap pattern: `epsilon-daytona-start` + `setsid` detach

Vì ENTRYPOINT bị bypass, API phải gọi bootstrap script SAU KHI sandbox được tạo.

**1. Image phải bake bootstrap script** ([core/docker/Dockerfile:401](core/docker/Dockerfile#L401)):
```dockerfile
COPY core/daytona-start.sh /usr/local/bin/epsilon-daytona-start
RUN chmod +x /usr/local/bin/epsilon-daytona-start
```

[`core/daytona-start.sh`](core/daytona-start.sh) chạy `/ephemeral/startup.sh` với `DAYTONA_BOOTSTRAP_ONLY=1` (skip s6 handoff), lặp init scripts, rồi exec `bun run /ephemeral/epsilon-master/src/index.ts` trên port 8000.

**2. API phải trigger bootstrap với `setsid`** ([apps/api/src/platform/providers/daytona.ts:190](apps/api/src/platform/providers/daytona.ts#L190)):
```typescript
const launch =
  "mkdir -p /tmp && setsid bash -c 'nohup /usr/local/bin/epsilon-daytona-start " +
  "> /tmp/epsilon-daytona-start.log 2>&1 < /dev/null &'";
await sandbox.process.executeCommand(launch, undefined, 10_000);
```

> **CRITICAL**: KHÔNG dùng pattern `nohup ... &` plain. Daytona toolbox `executeCommand` reap toàn bộ process tree khi shell call return — process bị kill TRƯỚC khi `epsilon-daytona-start` kịp fork bun. Phải dùng `setsid bash -c '... </dev/null &'` để tạo session mới detached khỏi controlling tty. Verified live 2026-05-15: bootstrap dừng ở `[fix-ownership] Done.`, không tới `starting epsilon-master on port 8000` nếu thiếu `setsid`.

### Egress whitelist phải skip trong cloud mode

[`core/init-scripts/95-egress-whitelist.sh`](core/init-scripts/95-egress-whitelist.sh) build deny-by-default iptables rules. Trong Docker Compose local, script resolve hostname `epsilon-api` qua Docker DNS embedded resolver. **Trong Daytona cloud, hostname `epsilon-api` không tồn tại** → script `exit 1` → toàn bộ init chain fail.

Fix: early-exit khi `ENV_MODE=cloud`:
```sh
if [ "${ENV_MODE:-local}" = "cloud" ]; then
  echo "[egress-whitelist] cloud mode — skipping iptables (Daytona handles isolation)" >&2
  exit 0
fi
```

`ENV_MODE=cloud` được inject từ `daytona.ts:60` khi tạo sandbox. Daytona Cloud có network isolation riêng → iptables thừa.

### Health probe path

[`waitForRuntimeReady`](apps/api/src/platform/providers/daytona.ts#L203) poll `GET ${previewUrl}/epsilon/health` (KHÔNG phải `/global/health`). Path này được phục vụ bởi epsilon-master ngay sau khi listen port 8000.

Polling: 15s interval, 20 attempts → tổng 5 phút trước khi mark fail.

### Provisioning retry loop

[`apps/api/src/platform/services/sandbox-init-state.ts`](apps/api/src/platform/services/sandbox-init-state.ts): 3 attempts, 2s delay → tổng 15 phút worst case trước khi user thấy error.

`metadata` JSONB trong `epsilon.sandboxes` table track:
- `initStatus`: `pending` → `provisioning` → `ready` | `failed`
- `initAttempts`: 1-3
- `lastInitError`: error message từ attempt cuối
- `provisioningError`: lỗi từ `Daytona.create()` hoặc `waitForRuntimeReady()`

Schema KHÔNG có column `init_attempts` top-level — luôn truy vấn qua `metadata->>'initAttempts'`.

### Cleanup stuck sandboxes

Nếu sandbox row bị stuck ở `status='provisioning'` hoặc `status='error'` với `external_id=''`:
```sql
DELETE FROM epsilon.sandboxes WHERE status='error' AND external_id='';
```
An toàn vì không có Daytona resource cần cleanup. Nếu `external_id` non-empty, gọi `daytona.delete()` trước.

### Debug technique: tạo sandbox sống để trace

Khi `waitForRuntimeReady` timeout, sandbox bị `daytona.delete()` ngay → mất evidence. Để debug:

```bash
# 1. Tạo sandbox debug bằng REST API trực tiếp (không qua flow product)
curl -X POST -H "Authorization: Bearer $DAYTONA_API_KEY" -H "Content-Type: application/json" \
  "https://app.daytona.io/api/sandbox" \
  -d '{
    "buildInfo":{"dockerfileContent":"FROM epsilonaicrypto/computer:daytona-bootstrap"},
    "target":"eu",
    "autoStopInterval":30,
    "autoArchiveInterval":60,
    "env":{"ENV_MODE":"cloud","EPSILON_API_URL":"https://api.chainlens.net","INTERNAL_SERVICE_KEY":"debug","TUNNEL_API_URL":"https://api.chainlens.net","TUNNEL_TOKEN":"debug"}
  }'

# 2. Chờ state=started (~3-5 phút pull image 5GB)
SBID=<id>; for i in $(seq 1 20); do
  STATE=$(curl -s -H "Authorization: Bearer $DAYTONA_API_KEY" \
    "https://app.daytona.io/api/sandbox/$SBID" | python3 -c "import json,sys;print(json.load(sys.stdin).get('state'))")
  echo "$i: $STATE"; [ "$STATE" = "started" ] && break; sleep 15
done

# 3. Probe và run bootstrap thủ công qua toolbox proxy
URL="https://proxy.app-eu.daytona.io/toolbox/$SBID/process/execute"
curl -X POST -H "Authorization: Bearer $DAYTONA_API_KEY" -H "Content-Type: application/json" \
  "$URL" -d '{"command":"setsid bash -c '"'"'nohup /usr/local/bin/epsilon-daytona-start > /tmp/eds.log 2>&1 < /dev/null &'"'"'","timeout":10}'

# 4. Đọc log progressive
curl -X POST -H "Authorization: Bearer $DAYTONA_API_KEY" -H "Content-Type: application/json" \
  "$URL" -d '{"command":"tail -20 /tmp/eds.log; echo ---; ps aux | grep epsilon | grep -v grep","timeout":10}'

# 5. Cleanup
curl -X DELETE -H "Authorization: Bearer $DAYTONA_API_KEY" "https://app.daytona.io/api/sandbox/$SBID"
```

### Image tag strategy

Tag mới mỗi lần fix (`daytona-bootstrap`, `daytona-fix-1`, …) thay vì overwrite — Daytona Cloud có cache image theo digest, tag mới buộc pull layer mới. KHÔNG dùng tag `latest` cho production.

Bake fix vào image (`core/daytona-start.sh`, init scripts) HOẶC fix trong API code (`daytona.ts`). Nếu fix nằm hoàn toàn ở API code, KHÔNG cần rebuild image — chỉ redeploy API.

### Verified working state (2026-05-15)

Sau khi áp dụng đầy đủ:
- `epsilonaicrypto/computer:daytona-bootstrap` — image với egress fix + daytona-start.sh
- API commit `b1c05b935f` — `setsid bash -c` detach pattern

End-to-end provisioning hoàn tất trong **1 attempt** (~30-40s):
1. `POST /v1/agent/initiate` → DB row created, `status=provisioning`
2. `Daytona.create()` → external_id assigned, container started (~10-15s)
3. `startRuntime()` → `setsid` launch bootstrap (returns ngay)
4. `waitForRuntimeReady()` poll `/epsilon/health` → 200 sau ~15-30s
5. DB row update `status=active`, `metadata.initStatus=ready`
6. UI redirect `/instances/<sandbox-id>/dashboard` → "Welcome to your Epsilon"

---

## Troubleshooting

### API không start

```bash
# Xem logs
docker logs api-djcsof.1.<task-id> 2>&1 | tail -50

# Kiểm tra env vars bắt buộc
docker exec <api-container> env | grep -E "DATABASE_URL|SUPABASE|API_KEY_SECRET"
```

### Sandbox 502 / "Workspace offline" / "runtime on port 8000 was not ready in time"

> Đọc section [Daytona sandbox lifecycle](#daytona-sandbox-lifecycle-production-critical) trước.

Nguyên nhân (theo thứ tự likelihood):

1. **`startRuntime()` thiếu `setsid`** — Daytona toolbox `executeCommand` reap process tree. Plain `nohup &` bị kill trước khi bun fork. Fix: `setsid bash -c '... </dev/null &'` ([daytona.ts:190](apps/api/src/platform/providers/daytona.ts#L190)).
2. **Image thiếu `epsilon-daytona-start`** — Daytona bypass ENTRYPOINT, không có bootstrap script thì không có gì start. Verify: `docker run --rm --entrypoint /bin/sh <image> -c "ls /usr/local/bin/epsilon-daytona-start"`.
3. **`95-egress-whitelist.sh` không skip cloud mode** — script `exit 1` khi không resolve được hostname `epsilon-api`. Verify: `head -20 /custom-cont-init.d/95-egress-whitelist` có check `ENV_MODE=cloud`.
4. **`DAYTONA_SNAPSHOT` sai** — đang trỏ vào image không có epsilon-master (vd `kortix/suna:*`).
5. **`DAYTONA_TARGET=us`** — region us không available, phải dùng `eu`.
6. **Image chưa được build/push** — `epsilonaicrypto/computer:<tag>` chưa tồn tại trên Docker Hub.

**Debug live**:
```bash
# 1. Lấy sandbox đang fail từ DB
PGPASSWORD=$DB_PASS psql "$DATABASE_URL" -c \
  "SELECT sandbox_id, external_id, metadata->>'lastInitError' FROM epsilon.sandboxes WHERE status='error' ORDER BY updated_at DESC LIMIT 3;"

# 2. Nếu sandbox đã bị delete, tạo debug sandbox theo quy trình ở section trên
# 3. Trace qua toolbox proxy: tail /tmp/epsilon-daytona-start.log + ps aux
```

**Reset failed sandbox để test lại**:
```sql
DELETE FROM epsilon.sandboxes WHERE status='error' AND external_id='';
```
Click "Get started" lại trên UI sẽ trigger provisioning mới.

### `INTERNAL_SERVICE_KEY` mismatch (auto-gen drift sau redeploy)

**Triệu chứng:** Frontend báo "Cannot connect to API", hoặc các call vào sandbox proxy trả 401 sau khi redeploy API. Sandbox cũ vẫn hoạt động trước đó, đột nhiên ngưng.

**Root cause:** Khi `INTERNAL_SERVICE_KEY` không có trong env Dokploy, [config.ts:528](apps/api/src/config.ts#L528) auto-generate ngẫu nhiên 32-byte hex tại startup. Container Dokploy không write được `.env` → key chỉ tồn tại trong process. Mỗi lần redeploy API → key mới → existing sandboxes vẫn dùng key cũ → auth chéo fail.

**Fix dứt điểm:** Set stable key trong Dokploy env cho **cả** `api` và `frontend`:
```bash
openssl rand -hex 32
# Paste cùng giá trị vào INTERNAL_SERVICE_KEY của 2 service
```
Sau khi set lần đầu, key cố định qua mọi redeploy. Sandboxes cũ provisioned với key cũ vẫn cần re-init (delete + recreate qua /v1/platform/init).

**Lưu ý:** sandbox runtime có 3 nguồn key, đôi khi lệch nhau:
1. `/run/s6/container_environment/INTERNAL_SERVICE_KEY` — value s6 init đã apply (canonical)
2. `/workspace/.persistent-system/secrets/.bootstrap-env.json` — bootstrap snapshot
3. Daytona env (passed at create time) — value api inject lúc create

Luôn lấy theo (1) khi debug auth.

### Hybrid local dev: tunnel sandbox cloud về backend local

Khi cần test sandbox Daytona/JustAVPS từ machine local nhưng giữ stack local (Supabase local, Redis local), sandbox cloud cần public URL để callback `EPSILON_API_URL`. Cách đơn giản nhất:

```bash
brew install cloudflared
cloudflared tunnel --url http://localhost:8008
# Copy URL trycloudflare.com → set vào apps/api/.env:
#   EPSILON_URL=https://<random>.trycloudflare.com/v1/router
#   API_URL=https://<random>.trycloudflare.com
#   BASE_URL=https://<random>.trycloudflare.com
```

Restart API local. POST `/v1/platform/init` với `provider: 'daytona'` sẽ tạo sandbox EU; sandbox call back qua tunnel → local API → LLM proxy. Verified 2026-05-16: cold start ~17 phút (image pull lần đầu), chat reply OK với `epsilon/gpt-4o-mini`.

### Production: cloudflared bridge cho LLM proxy via v98store

**Bối cảnh:** Production dùng `OPENROUTER_API_URL=https://v98store.com/v1` để proxy LLM calls qua key v98. Nhưng Daytona Tier firewall **block cả `api.chainlens.net` và `v98store.com`** từ trong sandbox (Connection reset). Daytona allow `*.trycloudflare.com` subdomain.

**Giải pháp:** Chạy `cloudflared` quick tunnel trên prod server expose api container, set `EPSILON_URL` về tunnel URL. Sandbox call back qua tunnel → API container (có direct access v98store) → response.

**Setup (chạy 1 lần trên prod server):**

```bash
# 1. Start cloudflared as restart=always container, target api service trong dokploy-network
docker run -d --name cloudflared-api-bridge \
  --restart unless-stopped \
  --network dokploy-network \
  cloudflare/cloudflared:latest \
  tunnel --url http://api-djcsof:8008 --no-autoupdate

# 2. Capture tunnel URL từ logs
docker logs cloudflared-api-bridge 2>&1 | grep -E 'trycloudflare\.com'
# → https://<random>.trycloudflare.com

# 3. Update Dokploy api env (giữ nguyên BASE_URL/API_URL/FRONTEND_URL chainlens.net để user-facing
#    không đổi; chỉ EPSILON_URL chuyển sang tunnel — đây là URL sandbox dùng callback)
EPSILON_URL=https://<random>.trycloudflare.com/v1/router

# 4. Redeploy api → mọi sandbox mới sẽ được provision với EPSILON_API_URL=tunnel
```

**Lưu ý quan trọng:**

- Quick tunnel URL **đổi mỗi lần restart cloudflared** — phải sync Dokploy env tự động (xem watchdog dưới)
- Sandbox đã provision trước đó **giữ EPSILON_API_URL cũ** trong env Daytona — startup hook ([apps/api/src/index.ts:609](apps/api/src/index.ts#L609)) sẽ tự sync khi api restart, nhưng nếu sandbox đang archived thì user phải re-init
- Named tunnel KHÔNG khả thi với Daytona free tier (verified 2026-05-18: `bridge.chainlens.net`, `*.cfargotunnel.com` đều bị Daytona block — chỉ `*.trycloudflare.com` direct subdomain reachable)

**Auto-recovery watchdog (REQUIRED cho production):**

Production phải chạy [scripts/tunnel-watchdog.sh](scripts/tunnel-watchdog.sh) như systemd service. Script monitor cloudflared log mỗi 30s; nếu URL thay đổi:
1. PATCH Dokploy api env qua API (replace `EPSILON_URL`)
2. Trigger Dokploy redeploy
3. Recovery time: ~2-3 phút từ tunnel reconnect đến chat back online

Setup 1 lần:

```bash
# Trên prod server (167.172.66.16)
# Copy script + service file vào
install -m 755 scripts/tunnel-watchdog.sh /usr/local/bin/tunnel-watchdog.sh
install -m 644 scripts/tunnel-watchdog.service /etc/systemd/system/tunnel-watchdog.service

# Tạo env file
mkdir -p /etc/tunnel-watchdog
cat > /etc/tunnel-watchdog/env <<EOF
DOKPLOY_URL=http://localhost:3000/api
DOKPLOY_API_KEY=<dokploy-api-key>
APP_ID=<api-djcsof-applicationId>
TUNNEL_CONTAINER=cloudflared-api-bridge
POLL_SEC=30
STATE_FILE=/var/lib/tunnel-watchdog/last-url
EOF
chmod 600 /etc/tunnel-watchdog/env

# Enable + start
systemctl daemon-reload
systemctl enable --now tunnel-watchdog.service

# Logs
tail -f /var/log/tunnel-watchdog.log
```

**Verify chain hoạt động:**

```bash
# Từ ngoài internet
curl https://<tunnel-url>/v1/health  # → 200 ok

# Bên trong sandbox (qua executeCommand SDK)
curl -sS -m 8 https://<tunnel-url>/v1/health  # → 200
```

Verified 2026-05-18: chat response OK với `epsilon/gpt-4o-mini`, latency ~3s từ POST message tới response complete. Watchdog tested với cloudflared restart → URL drift detected trong ~30s → Dokploy patched + redeployed automatically.

### `DAYTONA_NETWORK_ALLOW_LIST` block AI providers

**KHÔNG set** `DAYTONA_NETWORK_ALLOW_LIST` trừ khi bạn hiểu rõ Daytona Tier 1/2 firewall.

Daytona free/paid tier mặc định whitelist các AI provider known (`api.anthropic.com`, `api.openai.com`, `openrouter.ai`, ...). Khi set `networkAllowList`, Daytona Envoy CHUYỂN sang allow-list explicit và **disable** whitelist mặc định → tất cả call ra AI provider bị TLS reset. Triệu chứng: chat trả 200 nhưng opencode không response (silent fail từ AI SDK).

Provider code ([daytona.ts](apps/api/src/platform/providers/daytona.ts)) **không pass** `networkAllowList` vào `daytona.create()` — comment trong code giải thích lý do. Nếu bạn thấy env này còn trong Dokploy, REMOVE nó.

### Vibe-Trading 403 từ epsilon-api

Nguyên nhân: IP của epsilon-api container không nằm trong `ALLOWED_IPS`.

```bash
# Kiểm tra IP của epsilon-api trong network
docker inspect <api-container> | grep -A5 '"sandbox-network"'

# Phải khớp với VIBE_TRADING_ALLOWED_IPS và subnet trong docker-compose.yml
# Mặc định: 172.30.0.0/16
```

### SSE backtest timeout

SSE stream có heartbeat timeout ~30s. Job backtest dài (>60s) có thể bị reconnect.
Kết quả vẫn lưu trong DB — dùng job_id để query lại:

```bash
curl https://api.yourdomain.com/v1/router/vibe-trading/jobs/<job_id> \
  -H "Authorization: Bearer <JWT>"
```

### nginx swap fail sau deploy

```bash
# Kiểm tra state file
cat ~/.epsilon-deploy-slot

# Kiểm tra nginx config
nginx -t

# Xem port nào đang active
ss -tlnp | grep -E "8008|8009"
```

### Stripe sync errors trong logs

```
[resolve-account] Stripe sync error: Failed query: select ... from "basejump"."billing_customers"
```

Không ảnh hưởng core functionality — `basejump.billing_customers` table không tồn tại vì Stripe chưa được setup. Bỏ qua nếu không dùng billing.

### Tài khoản seed (test)

Production seed account (tạo qua Supabase Admin API + psql trực tiếp):
- Email: `test@test.com`
- Password: `password123`
- User ID: `193acc32-6306-4a83-9415-c7a55ff59f9e`

Đăng nhập bằng password: `https://chainlens.net/auth?auth=password`
