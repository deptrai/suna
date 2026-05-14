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
8. [Kiểm tra sau deploy](#kiểm-tra-sau-deploy)
9. [Troubleshooting](#troubleshooting)

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
DAYTONA_SNAPSHOT=vonicvn/computer:latest  # Image sandbox — build từ core/docker/Dockerfile

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
PREBUILT_IMAGE=vonicvn/epsilon-api:0.8.30 bash scripts/deploy-zero-downtime.sh
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

Sandbox image được build từ `core/docker/Dockerfile` và push lên Docker Hub (`vonicvn/computer`).

```bash
# Tạo buildx builder (lần đầu)
docker buildx create --name epsilon-builder --driver docker-container --bootstrap
docker buildx use epsilon-builder

# Build và push multi-arch (amd64 + arm64)
cd /path/to/chainlens
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  --build-arg SANDBOX_VERSION=0.1.0 \
  -t vonicvn/computer:0.1.0 \
  -t vonicvn/computer:latest \
  -f core/docker/Dockerfile \
  --push \
  .
```

Sau khi push xong, update `DAYTONA_SNAPSHOT=vonicvn/computer:0.1.0` trong Dokploy env của API và redeploy.

**Lưu ý quan trọng:**
- `DAYTONA_TARGET=eu` — bắt buộc, region `us` không available cho org này
- `DAYTONA_SNAPSHOT` phải là Docker image name (có `:`) để Daytona pull trực tiếp thay vì dùng snapshot registry

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

## Troubleshooting

### API không start

```bash
# Xem logs
docker logs api-djcsof.1.<task-id> 2>&1 | tail -50

# Kiểm tra env vars bắt buộc
docker exec <api-container> env | grep -E "DATABASE_URL|SUPABASE|API_KEY_SECRET"
```

### Sandbox 502 — port not ready

Nguyên nhân phổ biến:
1. **`DAYTONA_SNAPSHOT` sai** — đang trỏ vào image không có epsilon-master (vd `kortix/suna:*`)
2. **`DAYTONA_TARGET=us`** — region us không available, phải dùng `eu`
3. **Image chưa được build/push** — `vonicvn/computer` chưa tồn tại trên Docker Hub

```bash
# Kiểm tra env của API container
docker inspect <api-container> | python3 -c "import json,sys; d=json.load(sys.stdin)[0]; [print(e) for e in d['Config']['Env'] if 'DAYTONA' in e]"

# Kiểm tra Daytona sandbox state
curl -s 'https://app.daytona.io/api/sandbox/<sandbox-id>' \
  -H 'Authorization: Bearer <DAYTONA_API_KEY>' \
  -H 'daytona-target: eu' | python3 -m json.tool
```

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
