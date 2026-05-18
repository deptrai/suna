# Story 8.5: Production-Grade Platform Reliability & Security

Status: ready-for-dev

<!-- Spec'd 2026-05-17. Derived from Perplexity AI deep research + full codebase review.
     Plan approved at: .claude/plans/chainlens-net-production-fancy-yeti.md
     12 issues identified, prioritized into 4 sprints. -->

> **IR finding m5 (2026-05-18)**: Consider folding load-test + accuracy-benchmark verification for NFR1 (TTFB AI Chat <2s), NFR4 (≥1,000 CCU), NFR5 (Worker auto-scaling), and NFR11 (AI Report & Code Accuracy >80%) into 8.5's observability/SRE sprint. These NFRs are currently listed cross-cutting in PRD §7 but have no dedicated verification path. If 8.5's scope is already saturated, file a follow-up Story 8.6 "Load testing + accuracy benchmark suite". Decision needed from PM at sprint planning before 8.5 starts.

## Story

As a platform engineer vận hành chainlens.net,
I want hệ thống Daytona sandbox provisioning và billing infrastructure đạt production-grade,
so that users không mất data khi sandbox bị recreate, billing an toàn khỏi race condition, serviceKey được bảo vệ trong DB, có rate limiting, observability, và retry backoff — sẵn sàng scale multi-replica và chịu được production traffic.

---

## Tổng quan 12 Issues (theo mức độ ưu tiên)

| # | Sprint | Mức | Issue | File chính |
|---|--------|-----|-------|-----------|
| 1 | S1 | 🔴 CRITICAL | Session SQLite mất khi sandbox delete → Litestream S3 replication | `core/daytona-start.sh`, `core/docker/Dockerfile`, `daytona.ts` |
| 2 | S1 | 🔴 CRITICAL | Verify billing atomicity — `atomic_use_credits` đã có, TOCTOU check | `repositories/credits.ts`, `router/services/billing.ts` |
| 3 | S1 | 🔴 HIGH | `provisionAsync()` path set đúng `status: 'active'` chưa | `sandbox-provisioner.ts`, `ensure-sandbox.ts` |
| 4 | S2 | 🔴 HIGH | `serviceKey` lưu plaintext trong `sandboxes.config` JSONB | `schema/epsilon.ts`, `daytona.ts` |
| 5 | S2 | 🔴 HIGH | Token trong URL query string (WebSocket/SSE) → first-message auth | frontend WS routes, backend WS handlers |
| 6 | S3 | 🟡 MEDIUM | Không có rate limiting trên provisioning + LLM proxy routes | `router/routes/`, `index.ts` |
| 7 | S3 | 🟡 MEDIUM | `provisioningSubscriptions: Set<string>` volatile, không multi-replica | `sandbox-provisioner.ts` |
| 8 | S3 | 🟡 MEDIUM | Không có observability (metrics/traces) | `apps/api/src/telemetry.ts`, `index.ts` |
| 9 | S3 | 🟡 MEDIUM | cloudflared quick tunnel URL thay đổi khi restart | Dokploy env (ops task) |
| 10 | S4 | 🟠 LOW | Frontend 30s sandbox offline detection gap | `layout-content.tsx` |
| 11 | S4 | 🟠 LOW | Fixed 2s retry delay, cần exponential backoff | `sandbox-init-state.ts` |
| 12 | S4 | 🟠 LOW | `ensureRunning()` không health check sau wake | `daytona.ts` |

---

## Acceptance Criteria

### Sprint 1 — Critical Fixes (Issues 1, 2, 3)

**AC1 — Litestream SQLite Replication (Issue 1)**

- **Given** OpenCode session SQLite ở `/persistent/opencode/storage.sqlite` bên trong Daytona container (ephemeral filesystem).
- **When** sandbox bị delete hoàn toàn và recreate (upgrade, admin reset).
- **Then** Litestream đã replicate WAL frames liên tục lên Supabase Storage S3 endpoint (`/storage/v1/s3`), user restore được session history trong vòng vài giây khi sandbox mới start.
- **And** `daytona-start.sh` chạy `litestream restore -if-replica-exists` trước khi start `epsilon-master`, rồi `litestream replicate &` như sidecar.
- **And** Litestream binary có trong sandbox image (`/usr/local/bin/litestream`) — thêm vào `core/docker/Dockerfile`.
- **And** Litestream config template `/etc/litestream.yml` sử dụng env vars: `SUPABASE_S3_ENDPOINT`, `SUPABASE_S3_ACCESS_KEY`, `SUPABASE_S3_SECRET_KEY`, `EPSILON_USER_ID`.
- **And** `daytona.ts` `create()` inject 4 env vars trên vào sandbox.
- **And** `apps/api/src/config.ts` thêm `SUPABASE_S3_ENDPOINT`, `SUPABASE_S3_ACCESS_KEY`, `SUPABASE_S3_SECRET_KEY` vào envSchema.
- **And** nếu env vars không set (backward compat), `daytona-start.sh` skip Litestream block và chạy bình thường (không fail startup).
- **And** path trong Supabase Storage bucket: `user-${EPSILON_USER_ID}/opencode` để tenant isolation.

**AC2 — Billing Atomicity Verification (Issue 2)**

- **Given** `deductCredits` ở `repositories/credits.ts` đã dùng `atomic_use_credits` PostgreSQL function (atomic).
- **When** review billing flow trong `router/routes/token-holders.ts`, `token-transactions.ts`, `token-info.ts`, `contract-risk.ts`.
- **Then** xác nhận tất cả routes dùng `await deductToolCredits` (không fire-and-forget) — nếu có route nào dùng `.catch(console.error)` pattern mà không `await`, phải fix.
- **And** `checkCredits` (select) + `deductCredits` (atomic_use_credits) là 2 calls riêng — acceptable vì `atomic_use_credits` là true atomic check+deduct trong PostgreSQL. TOCTOU window giữa check và deduct chỉ là UX guard (không charge khi balance thấp), không phải security vulnerability.
- **And** Nếu phát hiện bất kỳ fire-and-forget billing pattern, phải fix thành `await` trước khi return response.
- **And** Viết comment trong `credits.ts` giải thích `atomic_use_credits` function đã handle TOCTOU.

**AC3 — Provisioning Status Accuracy (Issue 3)**

- **Given** `sandbox-provisioner.ts` gọi `createSandbox()` (→ `ensure-sandbox.ts`).
- **When** sandbox provisioning thành công qua Daytona provider path.
- **Then** row trong DB được update với `status: 'active'` — verify bằng cách đọc code `ensure-sandbox.ts` lines 107, 145, 388 (tất cả thành công paths set `status: 'active'`).
- **And** Nếu có bất kỳ code path nào set `status: 'provisioning'` rồi không update sang `active` sau khi Daytona health check pass, phải fix.
- **And** Add integration test assertion: sau khi `createSandbox()` resolve, query DB và assert `status === 'active'`.

---

### Sprint 2 — Security (Issues 4, 5)

**AC4 — serviceKey Encryption at Rest (Issue 4)**

- **Given** `sandboxes.config` JSONB chứa `{ serviceKey: "epsilon_..." }` plaintext — readable bởi bất kỳ ai có DB read access.
- **When** implement encryption.
- **Then** `serviceKey` được tách ra column riêng `service_key_encrypted BYTEA`, encrypted bằng `pgcrypto` `pgp_sym_encrypt()` với `DB_ENCRYPTION_KEY` (env var, 64-char hex random).
- **And** Drizzle migration thêm `serviceKeyEncrypted` column vào `sandboxes` table.
- **And** `daytona.ts` `resolveEndpoint()` decrypt bằng `pgp_sym_decrypt(service_key_encrypted, DB_ENCRYPTION_KEY)` thay vì read từ `config.serviceKey` JSONB.
- **And** `sandbox-provisioner.ts` save key qua encrypted column, không còn lưu vào JSONB `config`.
- **And** Sau migration, `config ->> 'serviceKey'` cũ được NULL-ed hoặc removed từ JSONB.
- **And** `apps/api/src/config.ts` thêm `DB_ENCRYPTION_KEY: z.string().min(32)` (required ở cloud mode).

**AC5 — WebSocket/SSE Token in Header (Issue 5)**

- **Given** WebSocket/SSE endpoints hiện nhận `?token=<jwt>` trong URL — logs by nginx, cloudflared, browser history.
- **When** implement first-message authentication.
- **Then** WebSocket connection accept TCP mà không auth ngay.
- **And** Server set timeout 5 giây để client phải gửi auth message `{ type: "auth", token: "<jwt>" }` làm message đầu tiên.
- **And** Server verify token, nếu valid → mark `ws.authenticated = true`, nếu invalid/timeout → close với code 4001.
- **And** Client-side code (frontend WebSocket hooks) cập nhật: không append `?token=` vào URL, thay vào đó gửi JSON auth message ngay sau `ws.onopen`.
- **And** URL pattern WS không còn chứa token trong query string (verify qua browser Network tab).

---

### Sprint 3 — Reliability & Infrastructure (Issues 6, 7, 8, 9)

**AC6 — Rate Limiting (Issue 6)**

- **Given** `/v1/platform/sandbox` và `/v1/router/*` không có rate limit — user có thể spam.
- **When** implement rate limiting.
- **Then** `hono-rate-limiter` package được thêm vào `apps/api`.
- **And** Sandbox provisioning endpoint: max 3 requests/hour/user (per `userId` header).
- **And** LLM proxy routes (`/v1/router/*`): max 100 requests/minute/user.
- **And** Return `429 Too Many Requests` với `Retry-After` header khi exceed.
- **And** Dùng in-memory store (Map) — đủ cho single-replica, Redis upgrade được defer đến khi multi-replica scale.

**AC7 — Multi-Replica Safe Dedup via Postgres Advisory Lock (Issue 7)**

- **Given** `provisioningSubscriptions: Set<string>` (line 15 `sandbox-provisioner.ts`) là in-memory — không chia sẻ giữa API replicas.
- **When** scale API lên 2+ replicas (Docker Swarm).
- **Then** Replace in-memory Set bằng `pg_try_advisory_xact_lock(hashToInt64(subscriptionId))`.
- **And** Lock acquired trong transaction → tự release khi transaction end, không cần manual cleanup.
- **And** Nếu lock bị held bởi replica khác → return `{ row: null, created: false }` (same semantics as current in-memory dedup).
- **And** `hashToInt64` function convert subscriptionId string → Int64 bằng `BigInt` + `DataView`.

**AC8 — Basic Observability (Issue 8)**

- **Given** Không có distributed tracing, metrics endpoint là stub.
- **When** implement OTel instrumentation.
- **Then** `apps/api/src/telemetry.ts` (NEW) setup OpenTelemetry SDK với OTLP HTTP exporter.
- **And** `telemetry.ts` được import TRƯỚC tất cả imports khác trong `apps/api/src/index.ts` (PHẢI là first import để auto-instrumentation work).
- **And** 3 key metrics track:
  - `sandbox.provision.duration_ms` — histogram, label: `result=success|fail`
  - `sandbox.provision.attempts_total` — counter
  - `api.request.duration_ms` — auto via HTTP instrumentation
- **And** `OTEL_EXPORTER_OTLP_ENDPOINT` và `OTEL_SERVICE_NAME=epsilon-api` thêm vào Dokploy env.
- **And** Nếu `OTEL_EXPORTER_OTLP_ENDPOINT` không set, OTel SDK khởi động ở no-op mode (không crash startup).

**AC9 — Named Cloudflare Tunnel (Issue 9)**

- **Given** `EPSILON_URL` trỏ vào `https://xxx.trycloudflare.com` thay đổi mỗi lần cloudflared restart.
- **When** setup named tunnel.
- **Then** Named Cloudflare Tunnel được tạo với `cloudflared tunnel create epsilon-api-bridge`.
- **And** DNS record cố định (ví dụ `api-bridge.chainlens.net`) được route vào tunnel.
- **And** `EPSILON_URL` trong Dokploy update sang permanent URL.
- **And** Quick tunnel container được thay bởi persistent named tunnel container.
- **And** Document tunnel name, credentials path, và tunnel ID trong `docs/production-deploy-guide.md`.
- **Note**: Đây là ops task, không phải code change. Yêu cầu domain `chainlens.net` đã trỏ vào Cloudflare.

---

### Sprint 4 — Polish & Resilience (Issues 10, 11, 12)

**AC10 — Frontend Sandbox Detection Gap (Issue 10)**

- **Given** `layout-content.tsx` polling status mỗi 30 giây — user đợi tối đa 30s biết sandbox offline.
- **When** sandbox vừa provision hoặc vừa wake từ stop.
- **Then** Polling interval bắt đầu ở 5s (aggressive) cho lần check đầu tiên (6 lần × 5s = 30s window), rồi fallback về 30s normal polling.
- **And** Sau 3 consecutive failures, interval tăng lên 60s (back-off) để tránh flood API.
- **And** Max time từ sandbox crash đến UI hiển thị "Workspace offline" giảm từ ~30s xuống ~5-10s.

**AC11 — Exponential Backoff cho Provisioning Retry (Issue 11)**

- **Given** `RETRY_DELAY_MS = 2_000` cố định trong `sandbox-init-state.ts` — 2 giây không đủ nếu Daytona có transient issues.
- **When** implement backoff.
- **Then** Thay `RETRY_DELAY_MS` bằng `RETRY_DELAYS_MS = [2_000, 15_000, 60_000]` (indexed by attempt number).
- **And** Attempt 0 retry sau 2s, attempt 1 sau 15s, attempt 2 sau 60s.
- **And** `SANDBOX_INIT_MAX_ATTEMPTS = 3` giữ nguyên.

**AC12 — ensureRunning() Health Check After Wake (Issue 12)**

- **Given** `ensureRunning()` trong `daytona.ts` gọi `start()` rồi return ngay — epsilon-master có thể chưa ready.
- **When** sandbox vừa được woken from stopped state.
- **Then** Sau khi `start()` return, `ensureRunning()` poll `/epsilon/health` (reuse `waitForRuntimeReady()`) với shorter timeout (max 2 minutes — sandbox đã warm, chỉ cần process start).
- **And** Nếu health check fail sau wake, throw `Error('Sandbox woke but runtime not ready')` để caller có thể handle.
- **And** Nếu sandbox đã `running`, vẫn quick-verify `/epsilon/health` một lần (1 attempt, no retry) — nếu fail, log warning nhưng không throw (container running có thể đang serve requests).

---

## Tasks / Subtasks

### Sprint 1 — Task 1: Litestream Integration (AC1)

- [ ] **core/docker/Dockerfile**: Thêm Litestream install step:
  ```dockerfile
  RUN curl -fsSL https://github.com/benbjohnson/litestream/releases/download/v0.3.13/litestream-v0.3.13-linux-amd64.tar.gz \
      | tar xz -C /usr/local/bin && chmod +x /usr/local/bin/litestream
  ```
- [ ] **core/litestream.yml** (NEW file): Template config với env var substitution:
  ```yaml
  dbs:
    - path: /persistent/opencode/storage.sqlite
      replicas:
        - type: s3
          endpoint: ${SUPABASE_S3_ENDPOINT}
          bucket: epsilon-sessions
          path: user-${EPSILON_USER_ID}/opencode
          access-key-id: ${SUPABASE_S3_ACCESS_KEY}
          secret-access-key: ${SUPABASE_S3_SECRET_KEY}
          region: auto
          sync-interval: 1s
          snapshot-interval: 1h
  ```
- [ ] **core/Dockerfile** (hoặc init script): COPY `litestream.yml` vào `/etc/litestream.yml`
- [ ] **core/daytona-start.sh**: Thêm block TRƯỚC loop `while true`:
  ```bash
  # Restore + replicate SQLite session (no-op if env vars not set)
  if [ -n "${SUPABASE_S3_ENDPOINT:-}" ] && [ -n "${EPSILON_USER_ID:-}" ]; then
    log "restoring opencode session from S3 (user=${EPSILON_USER_ID})..."
    mkdir -p /persistent/opencode
    /usr/local/bin/litestream restore -if-replica-exists \
      -config /etc/litestream.yml /persistent/opencode/storage.sqlite || true
    log "starting litestream replication sidecar..."
    /usr/local/bin/litestream replicate -config /etc/litestream.yml &
  fi
  ```
- [ ] **apps/api/src/config.ts**: Thêm vào envSchema:
  ```typescript
  SUPABASE_S3_ENDPOINT: optStr,
  SUPABASE_S3_ACCESS_KEY: optStr,
  SUPABASE_S3_SECRET_KEY: optStr,
  ```
- [ ] **apps/api/src/platform/providers/daytona.ts** `create()`: Thêm vào `envVars`:
  ```typescript
  ...(config.SUPABASE_S3_ENDPOINT ? {
    SUPABASE_S3_ENDPOINT: config.SUPABASE_S3_ENDPOINT,
    SUPABASE_S3_ACCESS_KEY: config.SUPABASE_S3_ACCESS_KEY ?? '',
    SUPABASE_S3_SECRET_KEY: config.SUPABASE_S3_SECRET_KEY ?? '',
    EPSILON_USER_ID: opts.userId ?? '',
  } : {}),
  ```
- [ ] **daytona-start.sh env snapshot**: Thêm `SUPABASE_S3_*|EPSILON_USER_ID` vào pattern ở `case "$key"` block (line 47) để s6 snapshot propagate env vars
- [ ] **Dokploy env**: Add `SUPABASE_S3_ENDPOINT`, `SUPABASE_S3_ACCESS_KEY`, `SUPABASE_S3_SECRET_KEY`
- [ ] **Rebuild image**: Build sandbox image với Litestream, push `epsilonaicrypto/computer:stable-2`, update `DAYTONA_SNAPSHOT` trong Dokploy

### Sprint 1 — Task 2: Billing Verification (AC2)

- [ ] Audit tất cả routes trong `apps/api/src/router/routes/` — tìm pattern `deductToolCredits(...).catch(` hoặc `void deductToolCredits`:
  ```bash
  grep -rn "\.catch\|void deduct" apps/api/src/router/routes/
  ```
- [ ] Nếu tìm thấy fire-and-forget: đổi thành `await deductToolCredits(...)` và wrap route handler trong try/finally nếu cần
- [ ] Thêm comment trong `apps/api/src/repositories/credits.ts` trước `deductCredits`:
  ```typescript
  // atomic_use_credits is a PostgreSQL function that atomically checks and deducts credits
  // in a single statement (no TOCTOU window). TOCTOU between checkCredits() and deductCredits()
  // is intentional: checkCredits() is a fast UX guard only; the real enforcement is here.
  ```
- [ ] Verify `billing.ts` `deductToolCredits()` không có `.catch(console.error)` trên deductCreditsDb call

### Sprint 1 — Task 3: Provisioning Status Audit (AC3)

- [ ] Đọc `ensure-sandbox.ts` toàn bộ — trace tất cả code paths và confirm `status: 'active'` được set khi:
  - Pool claim path (đã confirmed: line 70)
  - Direct create path (line 145, 388)
  - Async provisioning completion path (lines 107, 314, 372)
- [ ] Nếu có path nào set `status: 'provisioning'` mà không transition sang `active` khi success → add missing update statement
- [ ] Thêm inline comment ở mỗi success path: `// status: 'active' set here — required for frontend polling to detect ready sandbox`
- [ ] Add test assertion trong `ensure-sandbox.test.ts` (hoặc tạo mới): sau mock `provider.create()` resolve successfully, assert DB row `status === 'active'`

---

### Sprint 2 — Task 4: serviceKey Encryption (AC4)

- [ ] **packages/db/src/schema/epsilon.ts**: Thêm column:
  ```typescript
  serviceKeyEncrypted: bytea('service_key_encrypted'),
  ```
- [ ] **packages/db/src/migrations/**: Tạo migration file:
  ```sql
  ALTER TABLE epsilon.sandboxes ADD COLUMN service_key_encrypted bytea;
  -- Encrypt existing keys (run once in production with DB_ENCRYPTION_KEY set)
  -- UPDATE epsilon.sandboxes SET service_key_encrypted = pgp_sym_encrypt(config->>'serviceKey', :'DB_ENCRYPTION_KEY')
  -- WHERE config->>'serviceKey' IS NOT NULL;
  ```
- [ ] **apps/api/src/config.ts**: Thêm `DB_ENCRYPTION_KEY: optStr` (required in cloud mode — add runtime validation)
- [ ] **apps/api/src/platform/providers/daytona.ts** `resolveEndpoint()`: Replace JSONB read với decrypt:
  ```typescript
  const [row] = await db.execute(sql`
    SELECT pgp_sym_decrypt(service_key_encrypted, ${config.DB_ENCRYPTION_KEY}) as service_key
    FROM epsilon.sandboxes WHERE external_id = ${externalId} AND service_key_encrypted IS NOT NULL
  `);
  const serviceKey = (row as any)?.service_key as string | undefined;
  ```
- [ ] **apps/api/src/platform/services/sandbox-provisioner.ts**: Khi save key sau provisioning, write vào encrypted column:
  ```typescript
  await db.execute(sql`
    UPDATE epsilon.sandboxes
    SET service_key_encrypted = pgp_sym_encrypt(${serviceKey}, ${config.DB_ENCRYPTION_KEY}),
        config = config - 'serviceKey'
    WHERE sandbox_id = ${sandboxId}
  `);
  ```
- [ ] **Dokploy env**: Add `DB_ENCRYPTION_KEY=<64-char random hex>` (generate: `openssl rand -hex 32`)

### Sprint 2 — Task 5: WebSocket First-Message Auth (AC5)

- [ ] Identify tất cả WebSocket/SSE routes trong `apps/api/src/` — tìm `?token=` trong URL patterns:
  ```bash
  grep -rn "token.*query\|searchParams.*token\|\.token" apps/api/src/ apps/web/src/
  ```
- [ ] Implement first-message auth wrapper cho mỗi WS route:
  - Server: accept connection → set `authTimeout = setTimeout(close, 5000)` → on first message: verify token → clear timeout → proceed
  - Client: `ws.onopen = () => ws.send(JSON.stringify({ type: 'auth', token: getToken() }))`
- [ ] Remove `?token=` từ WebSocket URLs trong frontend
- [ ] Verify: open Browser DevTools Network tab → WebSocket connection → URL không chứa `token` param

---

### Sprint 3 — Task 6: Rate Limiting (AC6)

- [ ] `bun add hono-rate-limiter` trong `apps/api`
- [ ] **apps/api/src/router/index.ts** hoặc `apps/api/src/index.ts`: Thêm middleware:
  ```typescript
  import { rateLimiter } from 'hono-rate-limiter';
  
  // Sandbox provisioning: 3 requests/hour/user
  router.use('/platform/sandbox', rateLimiter({
    windowMs: 60 * 60 * 1000,
    limit: 3,
    keyGenerator: (c) => c.get('accountId') ?? c.req.header('x-forwarded-for') ?? 'anon',
  }));
  
  // LLM proxy: 100 req/minute/user
  router.use('/router/*', rateLimiter({
    windowMs: 60 * 1000,
    limit: 100,
    keyGenerator: (c) => c.get('accountId') ?? 'anon',
  }));
  ```

### Sprint 3 — Task 7: Postgres Advisory Lock (AC7)

- [ ] **apps/api/src/platform/services/sandbox-provisioner.ts**: Replace in-memory Set:
  ```typescript
  // Remove: const provisioningSubscriptions = new Set<string>();
  
  function hashToInt64(s: string): bigint {
    let hash = BigInt(0x811c9dc5);
    for (let i = 0; i < s.length; i++) {
      hash ^= BigInt(s.charCodeAt(i));
      hash = BigInt.asUintN(64, hash * BigInt(0x01000193));
    }
    return BigInt.asIntN(64, hash); // PostgreSQL expects signed int8
  }
  
  export async function provisionSandboxFromCheckout(opts: {...}) {
    return await db.transaction(async (tx) => {
      const lockKey = hashToInt64(opts.subscriptionId);
      const [{ acquired }] = await tx.execute(
        sql`SELECT pg_try_advisory_xact_lock(${lockKey}::bigint) as acquired`
      );
      if (!acquired) {
        console.log(`[sandbox-provisioner] Lock held by another replica for sub ${opts.subscriptionId}`);
        return { row: null, created: false };
      }
      // ... existing logic ...
    });
  }
  ```
- [ ] Remove `provisioningSubscriptions.add/has/delete` calls

### Sprint 3 — Task 8: OTel Instrumentation (AC8)

- [ ] `bun add @opentelemetry/sdk-node @opentelemetry/auto-instrumentations-node @opentelemetry/exporter-trace-otlp-http @opentelemetry/exporter-metrics-otlp-http @opentelemetry/sdk-metrics`
- [ ] **apps/api/src/telemetry.ts** (NEW):
  ```typescript
  import { NodeSDK } from '@opentelemetry/sdk-node';
  import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
  import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
  
  if (process.env.OTEL_EXPORTER_OTLP_ENDPOINT) {
    const sdk = new NodeSDK({
      traceExporter: new OTLPTraceExporter(),
      instrumentations: [getNodeAutoInstrumentations()],
    });
    sdk.start();
    process.on('SIGTERM', () => sdk.shutdown());
  }
  
  export const meter = /* setup MeterProvider */ ...;
  export const provisionDuration = meter.createHistogram('sandbox.provision.duration_ms');
  export const provisionAttempts = meter.createCounter('sandbox.provision.attempts_total');
  ```
- [ ] **apps/api/src/index.ts**: Thêm `import './telemetry';` làm FIRST import (trước tất cả)
- [ ] **apps/api/src/platform/services/ensure-sandbox.ts**: Wrap provisioning với metrics:
  ```typescript
  import { provisionDuration, provisionAttempts } from '../../telemetry';
  const start = Date.now();
  try {
    const result = await provider.create(opts);
    provisionDuration.record(Date.now() - start, { result: 'success' });
    provisionAttempts.add(1, { result: 'success' });
    return result;
  } catch (err) {
    provisionDuration.record(Date.now() - start, { result: 'fail' });
    provisionAttempts.add(1, { result: 'fail' });
    throw err;
  }
  ```
- [ ] **Dokploy env**: Add `OTEL_EXPORTER_OTLP_ENDPOINT=http://167.172.66.16:4318`, `OTEL_SERVICE_NAME=epsilon-api`

### Sprint 3 — Task 9: Named Cloudflare Tunnel (AC9) — OPS TASK

- [ ] Login cloudflared: `docker run cloudflare/cloudflared:latest tunnel login`
- [ ] Tạo named tunnel: `docker run cloudflare/cloudflared:latest tunnel create epsilon-api-bridge`
- [ ] Route DNS: `cloudflared tunnel route dns epsilon-api-bridge api-bridge.chainlens.net`
- [ ] Update docker compose / Dokploy để chạy named tunnel thay quick tunnel
- [ ] Update Dokploy env: `EPSILON_URL=https://api-bridge.chainlens.net/v1/router`
- [ ] Document tunnel credentials path trong `docs/production-deploy-guide.md`

---

### Sprint 4 — Task 10: Frontend Polling Interval (AC10)

- [ ] **apps/web/src/components/dashboard/layout-content.tsx**: Replace cố định 30s interval:
  ```typescript
  const POLL_INITIAL_MS = 5_000;
  const POLL_NORMAL_MS = 30_000;
  const POLL_BACKOFF_MS = 60_000;
  let consecutiveFailures = 0;
  
  function getNextPollDelay(checkCount: number): number {
    if (checkCount < 6) return POLL_INITIAL_MS;        // First 30s: check every 5s
    if (consecutiveFailures >= 3) return POLL_BACKOFF_MS;  // After 3 fails: back off
    return POLL_NORMAL_MS;
  }
  ```

### Sprint 4 — Task 11: Exponential Backoff (AC11)

- [ ] **apps/api/src/platform/services/sandbox-init-state.ts**: Replace:
  ```typescript
  // Remove: const RETRY_DELAY_MS = 2_000;
  const RETRY_DELAYS_MS = [2_000, 15_000, 60_000]; // indexed by attempt number
  
  // In retry loop:
  const delay = RETRY_DELAYS_MS[Math.min(attempt, RETRY_DELAYS_MS.length - 1)];
  await sleep(delay);
  ```

### Sprint 4 — Task 12: ensureRunning Health Check (AC12)

- [ ] **apps/api/src/platform/providers/daytona.ts** `ensureRunning()`:
  ```typescript
  async ensureRunning(externalId: string): Promise<void> {
    const status = await this.getStatus(externalId);
    const daytona = getDaytona();
    const sandbox = await daytona.get(externalId);
    const endpoint = await this.resolvePreviewEndpoint(sandbox, undefined, 8000);
    
    if (status === 'running') {
      // Quick single-check — container running but runtime may not be
      const ok = await this.quickHealthCheck(endpoint.url, endpoint.headers);
      if (!ok) console.warn(`[DAYTONA] ${externalId} running but /epsilon/health unreachable`);
      return; // Don't block even if check fails — container is reported running
    }
    
    console.log(`[DAYTONA] Sandbox ${externalId} is ${status}, waking up...`);
    await this.start(externalId);
    
    // Wait for runtime after explicit start (max 2 minutes)
    const ready = await this.waitForRuntimeReadyShort(sandbox, endpoint.url, endpoint.headers);
    if (!ready) throw new Error(`Sandbox ${externalId} woke but runtime not ready in time`);
  }
  
  private async quickHealthCheck(url: string, headers: Record<string, string>): Promise<boolean> {
    try {
      const res = await fetch(`${url}/epsilon/health`, { headers, signal: AbortSignal.timeout(5000) });
      return res.ok;
    } catch { return false; }
  }
  
  private async waitForRuntimeReadyShort(sandbox: any, url: string, headers: Record<string, string>): Promise<boolean> {
    // Same as waitForRuntimeReady but max 8 attempts × 15s = 2 minutes
    const intervalMs = 15000;
    const maxAttempts = 8;
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise(r => setTimeout(r, intervalMs));
      try {
        const res = await fetch(`${url}/epsilon/health`, { headers, signal: AbortSignal.timeout(10000) });
        if (res.ok) return true;
      } catch {}
    }
    return false;
  }
  ```

---

## Dev Notes

### Kiến trúc tổng quan

```
User Request
    ↓
apps/web (Next.js SSR) → apps/api (Hono/Bun port 8008)
                                ↓
                    platform/providers/daytona.ts
                    platform/services/ensure-sandbox.ts
                    platform/services/sandbox-provisioner.ts
                                ↓
                         Daytona Cloud Sandbox
                    (ephemeral container, port 8000)
                         epsilon-master (Bun)
                         opencode (Node)
                         Litestream (sidecar)
                                ↓
                    Supabase Storage S3 (SQLite replica)
```

### Issue 2 (Billing) — đã mostly resolved

`atomic_use_credits` PostgreSQL function tại `repositories/credits.ts` đã là true atomic operation:
- Check balance + deduct trong 1 SQL statement
- Không thể race condition giữa 2 concurrent calls
- `checkCredits()` call trước đó chỉ là UX guard (fast check để return sớm nếu balance thấp), không phải security enforcement

Chỉ cần verify không có fire-and-forget pattern còn sót.

### Issue 3 (Status) — cần verify

`ensure-sandbox.ts` set `status: 'active'` ở multiple paths. Cần trace xem Daytona provider async path có miss case nào không:
- Line 107: async callback after Daytona provision complete → cần verify transition xảy ra
- `sandbox-provision-poller.ts` cũng watch status — cần confirm không có race

### Litestream — backward compat critical

Block Litestream trong `daytona-start.sh` PHẢI wrapped trong `if [ -n "${SUPABASE_S3_ENDPOINT:-}" ]`. Sandbox images cũ (deployed trước Story này) không có env vars → không nên fail startup. Block skip silently → normal start.

### serviceKey encryption — migration risk

**KHÔNG** run migration UPDATE statement tự động trong migration file. Chỉ ADD COLUMN. Encryption của existing rows phải chạy manually bởi admin với `DB_ENCRYPTION_KEY` set:
```sql
UPDATE epsilon.sandboxes
SET service_key_encrypted = pgp_sym_encrypt(config->>'serviceKey', '<key>')
WHERE config->>'serviceKey' IS NOT NULL;
```
Sau đó verify count, rồi mới remove `config->>'serviceKey'`.

### Daytona env var snapshot pattern

`daytona-start.sh` line 45-51 snapshot env vars vào `/run/s6/container_environment/`. Bất kỳ env var mới nào inject qua `daytona.ts` `create()` → cũng phải thêm key name vào `case "$key"` pattern trong `daytona-start.sh` để downstream processes trong sandbox có thể đọc.

### Image rebuild required

Sau Sprint 1 (Litestream), cần:
1. `git push` → CI build amd64/arm64
2. Tag mới: `epsilonaicrypto/computer:stable-2`
3. Update `DAYTONA_SNAPSHOT=epsilonaicrypto/computer:stable-2` trong Dokploy
4. Redeploy API (không cần redeploy sandbox — mỗi sandbox mới sẽ dùng image mới)
5. Old sandboxes (còn running) vẫn dùng `stable-1` — acceptable, Litestream sẽ được enable khi user's sandbox next recreate

---

## Verification

### Sprint 1 Verification

```bash
# 1. Litestream: delete sandbox → recreate → session history còn không
# (Manual test: create sandbox, do some chat turns, delete sandbox, recreate, check history)

# 2. Billing: no fire-and-forget
grep -rn "deductToolCredits\|deductCredits" apps/api/src/router/routes/ | grep -v "await"
# → Should return empty (all deductions are awaited)

# 3. Provisioning status
# After provision, check DB:
# SELECT status FROM epsilon.sandboxes WHERE account_id = '<test-account>' ORDER BY created_at DESC LIMIT 1;
# → status should be 'active', not 'provisioning'
```

### Sprint 2 Verification

```bash
# 4. serviceKey encrypted
# SELECT service_key_encrypted IS NOT NULL, config->>'serviceKey' IS NULL FROM epsilon.sandboxes LIMIT 5;
# → Both columns: TRUE

# 5. WebSocket URL no token
# Browser DevTools → Network → WS connection → URL should NOT contain ?token=
```

### Sprint 3 Verification

```bash
# 6. Rate limit
for i in {1..5}; do curl -X POST https://api.chainlens.net/v1/platform/sandbox; done
# → 4th/5th request returns HTTP 429

# 7. Advisory lock (multi-replica test)
# Trigger 2 concurrent provision requests for same subscriptionId
# → Only 1 should succeed, 2nd returns { created: false }

# 8. OTel
curl http://167.172.66.16:4318/metrics
# → Thấy sandbox.provision.duration_ms metric

# 9. Named tunnel
curl https://api-bridge.chainlens.net/v1/health
# → HTTP 200 — URL không đổi sau tunnel restart: docker restart cloudflared → curl again → still 200
```

### Sprint 4 Verification

```bash
# 10. Frontend polling: open browser, kill epsilon-master in sandbox
# → UI should show "Workspace offline" within ~10s (not 30s)

# 11. Backoff: check logs when provisioning fails
# → Log should show: retry after 2s, then 15s, then 60s

# 12. ensureRunning health: trigger sandbox wake from stopped state
# → API should return 200 only after /epsilon/health check passes
```

---

## Story-Level Dev Notes (Critical)

### Thứ tự implement để minimize risk

1. **Start Sprint 1**: AC3 (status audit, pure read) → AC2 (billing verify, low risk) → AC1 (Litestream, requires image rebuild)
2. **Deploy Sprint 1** trước khi bắt đầu Sprint 2 — mỗi sprint independent, không block nhau
3. **Sprint 2 AC4 (encryption)**: Test kỹ trên dev trước prod — migration không reversible nếu keys bị xóa trước backup
4. **Sprint 3 Task 7 (advisory lock)**: Wrap trong transaction — nếu transaction rollback, lock auto-releases (safe)
5. **Sprint 3 Task 8 (OTel)**: Nếu SigNoz chưa deploy, set `OTEL_EXPORTER_OTLP_ENDPOINT` rỗng → no-op mode, code change safe to ship

### Files chính cần đọc trước khi implement

| Sprint | File | Lý do |
|--------|------|-------|
| S1 | `core/daytona-start.sh` | Nắm env snapshot pattern trước khi add Litestream block |
| S1 | `apps/api/src/platform/services/ensure-sandbox.ts` | Trace tất cả `status: 'active'` assignments |
| S2 | `packages/db/src/schema/epsilon.ts` | Xem column types hiện tại trước khi add `serviceKeyEncrypted` |
| S2 | `apps/api/src/platform/providers/daytona.ts` `resolveEndpoint()` | Hiểu flow đọc serviceKey hiện tại |
| S3 | `apps/api/src/platform/services/sandbox-provisioner.ts` | Nắm full `provisionSandboxFromCheckout()` structure trước khi wrap trong transaction |
| S4 | `apps/web/src/components/dashboard/layout-content.tsx` | Xem current polling logic |

---

## Spec Revision Notes

- **2026-05-17 Initial**: Story created from approved plan `.claude/plans/chainlens-net-production-fancy-yeti.md`
- **Issue 2 (Billing)**: Audit của `repositories/credits.ts` cho thấy `atomic_use_credits` PostgreSQL function đã tồn tại — plan description mô tả theoretical TOCTOU nhưng implementation đã atomic. AC2 điều chỉnh thành "verify và document" thay vì "fix from scratch".
- **Issue 3 (Status)**: `ensure-sandbox.ts` có multiple `status: 'active'` assignments — cần audit trace thay vì implement từ đầu.
