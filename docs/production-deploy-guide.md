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

**Providers được test:** Hetzner CX22+, JustAVPS pro, DigitalOcean 4GB+

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
git clone https://github.com/epsilon-ai/chainlens.git
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
ALLOWED_SANDBOX_PROVIDERS=justavps     # hoặc local_docker nếu chạy sandbox local

# JustAVPS (nếu dùng)
JUSTAVPS_API_URL=https://justavps.com/api/v1
JUSTAVPS_API_KEY=<key>
JUSTAVPS_PROXY_DOMAIN=epsilon.cloud

# LLM (ít nhất 1 provider)
OPENROUTER_API_KEY=<key>

# Vibe Trading (backtest service)
VIBE_TRADING_API_KEY=<openssl rand -hex 32>
VIBE_TRADING_INTERNAL_URL=http://vibe-trading:8899
VIBE_TRADING_ALLOWED_IPS=172.30.0.0/16

# Frontend URL
FRONTEND_URL=https://yourdomain.com

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

### Option A: Docker Compose (khuyến nghị cho production)

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

**Services trong compose:**

| Service | Port | Mô tả |
|---|---|---|
| `epsilon-api` | 8008 | Backend API (Bun + Hono) |
| `vibe-trading` | 127.0.0.1:8899 | Backtest API (FastAPI) |
| `vibe-trading-worker` | — | Celery worker xử lý backtest jobs |
| `redis` | internal | Queue cho Celery |
| `frontend` | 3000 | Next.js (nếu dùng profile `frontend`) |

> **Lưu ý:** Frontend thường deploy qua Vercel. Chỉ dùng profile `frontend` nếu self-host.

### Option B: Chạy thủ công (dev/debug)

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
gh workflow run deploy-dev.yml --repo epsilon-ai/chainlens

# Promote lên production
gh workflow run release.yml --repo epsilon-ai/chainlens \
  -f version="0.8.30" \
  -f title="Release title"
```

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
docker logs epsilon-api-blue 2>&1 | tail -50

# Kiểm tra env vars bắt buộc
docker exec epsilon-api-blue env | grep -E "DATABASE_URL|SUPABASE|API_KEY_SECRET"
```

### Vibe-Trading 403 từ epsilon-api

Nguyên nhân: IP của epsilon-api container không nằm trong `ALLOWED_IPS`.

```bash
# Kiểm tra IP của epsilon-api trong network
docker inspect epsilon-api-blue | grep -A5 '"sandbox-network"'

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

### INTERNAL_SERVICE_KEY mismatch

```bash
# Đọc key từ sandbox container
docker exec epsilon-sandbox cat /workspace/.persistent-system/secrets/.bootstrap-env.json

# Cập nhật vào apps/api/.env rồi restart
docker restart epsilon-api-blue
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
