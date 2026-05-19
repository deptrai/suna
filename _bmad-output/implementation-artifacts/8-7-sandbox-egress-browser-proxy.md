# Story 8.7: Sandbox Egress Browser Proxy

Status: review

<!-- 2026-05-19: shipped to production via Dokploy. API proxy port 8009 publicly verified (200 OK in 65ms);
     all 7 hardening checks pass (SSRF private-ip-literal, port_blocked, auth_fail). Sandbox image
     epsilonaicrypto/computer:daytona-fix-11 pushed to Docker Hub. DAYTONA_SNAPSHOT updated.
     Existing sandboxes (provisioned before deploy) still need recreation to pick up new image + proxy env. -->


<!-- Spec'd 2026-05-19. Triggered by production incident: agent-browser ERR_CONNECTION_RESET on all outbound HTTPS.
     Plan: .claude/plans/hay-doc-promt-agent-bubbly-quail.md (v2 — hardened, Winston reviewed)
     Sibling: Story 8.5 (production reliability), reuses same VPS proxy pattern. -->

## Story

As a platform engineer vận hành Daytona production sandboxes,
I want sandbox browser (Chromium via agent-browser) + curl có thể navigate đến arbitrary internet URLs (chainlens.net, binance.com, coingecko.com, …),
so that automation/scraping/UI testing workflows hoạt động trong production — không bị block bởi Daytona Envoy egress allowlist.

---

## Context

Daytona Tier 1/2 chỉ allow outbound TLS đến IPs trong `DAYTONA_NETWORK_ALLOW_LIST` (hiện `167.172.66.16/32` — apps/api VPS). Tools dùng `${EPSILON_API_URL}/v1/router/*` (Tavily, Replicate, Serper, Firecrawl) hoạt động vì đi qua API proxy. Browser/curl thì connect TCP trực tiếp đến target → bị block, fail với `ERR_CONNECTION_RESET` (browser) hoặc HTTP 000 (curl).

Fix: thêm hardened HTTP CONNECT proxy ở `apps/api` port 8009, inject `HTTP_PROXY`/`AGENT_BROWSER_PROXY_URL` env vars vào sandbox. Plan chi tiết: [.claude/plans/hay-doc-promt-agent-bubbly-quail.md](file:///Users/luisphan/.claude/plans/hay-doc-promt-agent-bubbly-quail.md).

---

## Acceptance Criteria

**AC1 — CONNECT Proxy Server**

- **Given** apps/api chạy ở `ENV_MODE=cloud` với `BROWSER_PROXY_SECRET` + `BROWSER_PROXY_PUBLIC_URL` set.
- **When** server boot.
- **Then** [`apps/api/src/browser-proxy.ts`](apps/api/src/browser-proxy.ts) listen trên `[::]:BROWSER_PROXY_PORT` (default 8009, IPv6 dual-stack).
- **And** Plain HTTP request trả về 405 "Use CONNECT method".
- **And** SIGTERM trigger graceful `server.close()`.

**AC2 — Auth + Hardening**

- **Given** Proxy nhận CONNECT request.
- **Then** Reject 407 nếu `Proxy-Authorization` header không match `Basic base64("epsilon:${BROWSER_PROXY_SECRET}")`.
- **And** Reject 403 (`X-Reason: port-not-allowed`) nếu target port không nằm trong `BROWSER_PROXY_ALLOWED_PORTS` (default `80,443`).
- **And** Reject 403 (`X-Reason: private-ip-literal` hoặc `dns-private:<ip>` hoặc `localhost` hoặc `bare-hostname`) cho mọi target resolve về RFC1918 / loopback / link-local / IPv6 ULA. DNS rebinding defense: check **mọi** A/AAAA records, fail nếu **bất kỳ** record nào private.
- **And** Reject 429 nếu source IP đã giữ ≥ `BROWSER_PROXY_MAX_CONN_PER_IP` (default 50) concurrent connections.
- **And** Mỗi connection emit 1 JSON log line: `{ts, evt, src, target, port, status, bytes_in, bytes_out, duration_ms}`.

**AC3 — Config Validation**

- **Given** `apps/api/src/config.ts` startup.
- **When** `ENV_MODE=cloud`.
- **Then** Fail-fast với `level: 'error'` nếu thiếu `BROWSER_PROXY_SECRET` hoặc `BROWSER_PROXY_PUBLIC_URL`.
- **And** Reject `BROWSER_PROXY_SECRET` chứa ký tự `[@:/+=]` (kèm hint dùng `openssl rand -base64 32 | tr -d "/+=" | head -c 32`).

**AC4 — Sandbox Env Injection**

- **Given** Daytona provider provision sandbox mới.
- **When** `BROWSER_PROXY_PUBLIC_URL` + `BROWSER_PROXY_SECRET` đã set ở API.
- **Then** [`daytona.ts create()`](apps/api/src/platform/providers/daytona.ts) inject các env vars:
  - `HTTP_PROXY` = `http://epsilon:${SECRET}@${PUBLIC_URL_HOST}:${PUBLIC_URL_PORT}`
  - `HTTPS_PROXY` = (same)
  - `AGENT_BROWSER_PROXY_URL` = `${BROWSER_PROXY_PUBLIC_URL}` (creds-free, cho Chromium `--proxy-server`)
  - `AGENT_BROWSER_PROXY_AUTH` = `epsilon:${SECRET}` (cho agent-browser auth challenge)
  - `NO_PROXY` = `localhost,127.0.0.1,::1`
- **And** Nếu config thiếu, sandbox vẫn provision nhưng không có proxy env (backward compat).

**AC5 — Sandbox Image: Chromium + s6 Snapshot**

- **Given** sandbox image rebuild (`epsilonaicrypto/computer:stable-2`).
- **Then** [`core/daytona-start.sh`](core/daytona-start.sh) line 47 `case "$key"` pattern bổ sung `HTTP_PROXY|HTTPS_PROXY|NO_PROXY|AGENT_BROWSER_PROXY_URL|AGENT_BROWSER_PROXY_AUTH`.
- **And** Nếu PC3 check confirm Chromium start TRƯỚC khi s6 snapshot, `daytona-start.sh` thêm `pkill -f "chromium-browser.*9222"` sau snapshot để s6 auto-restart Chromium với env mới.
- **And** [`core/s6-services/svc-chromium-persistent/run`](core/s6-services/svc-chromium-persistent/run) đọc `AGENT_BROWSER_PROXY_URL` env, thêm `--proxy-server="${AGENT_BROWSER_PROXY_URL}"` vào cả 2 `exec` paths (root + non-root) trước `about:blank`.
- **And** Chromium prompt auth challenge với credentials từ `AGENT_BROWSER_PROXY_AUTH` (agent-browser Playwright `proxy.username/password` config).

**AC6 — Runbook & Production Deploy Docs**

- **Given** Story merge.
- **Then** [`docs/runbooks/browser-proxy-rotation.md`](docs/runbooks/browser-proxy-rotation.md) NEW — covers quarterly rotation, leak response, post-rotation sandbox recreate.
- **And** [`docs/production-deploy-guide.md`](docs/production-deploy-guide.md) updated: thêm section "Browser Proxy" mô tả Dokploy env vars cần set (`BROWSER_PROXY_SECRET`, `BROWSER_PROXY_PUBLIC_URL`), port mapping `8009:8009`, secret generation command.

---

## Tasks / Subtasks

Detail trong [plan v2](file:///Users/luisphan/.claude/plans/hay-doc-promt-agent-bubbly-quail.md) sections "Implementation" và "Ops".

- [ ] **Task 1** — Create [`apps/api/src/browser-proxy.ts`](apps/api/src/browser-proxy.ts) (AC1, AC2) — plan section "Implementation #1"
- [ ] **Task 2** — Update [`apps/api/src/config.ts`](apps/api/src/config.ts): add 5 config vars + `validateEnv` runtime checks (AC3) — plan section "Implementation #2"
- [ ] **Task 3** — Update [`apps/api/src/index.ts`](apps/api/src/index.ts): start proxy + SIGTERM handler (AC1) — plan section "Implementation #3"
- [ ] **Task 4** — Update [`apps/api/src/platform/providers/daytona.ts`](apps/api/src/platform/providers/daytona.ts): inject proxy env vars (AC4) — plan section "Implementation #4"
- [ ] **Task 5** — Update [`core/daytona-start.sh`](core/daytona-start.sh) line 47 + conditional Chromium restart (AC5) — plan section "Implementation #5"
- [ ] **Task 6** — Update [`core/s6-services/svc-chromium-persistent/run`](core/s6-services/svc-chromium-persistent/run): `--proxy-server` arg (AC5) — plan section "Implementation #6"
- [ ] **Task 7** — Create [`docs/runbooks/browser-proxy-rotation.md`](docs/runbooks/browser-proxy-rotation.md) (AC6) — plan section "Implementation #7"
- [ ] **Task 8** — Update [`docs/production-deploy-guide.md`](docs/production-deploy-guide.md) (AC6)
- [ ] **Task 9 (ops)** — Build + push `epsilonaicrypto/computer:stable-2`, update Dokploy `DAYTONA_SNAPSHOT`
- [ ] **Task 10 (ops)** — Dokploy: add port mapping `8009:8009`, set env vars, redeploy apps/api

---

## Pre-Implementation Checks (BLOCK before Task 1)

Cần answer 5 PC trước khi viết code:

- [ ] **PC1** — SSH apps/api container, run `echo $EPSILON_URL` + `echo $DAYTONA_NETWORK_ALLOW_LIST`. Confirm IP-vs-Cloudflare-tunnel pattern.
- [ ] **PC2** — Confirm Daytona sandbox có thể reach `167.172.66.16:8009` (test sau khi deploy proxy với 1 sandbox prod existing).
- [ ] **PC3** — SSH 1 Daytona sandbox prod, `ls -la /run/s6/container_environment/` — verify timing: env file có sẵn ở Chromium start hay chỉ sau `daytona-start.sh` snapshot. Quyết định `pkill chromium` có cần không.
- [ ] **PC4** — Bun + Node `http.on('connect')` compat test trên local trước khi merge. Standalone script trong plan section "Pre-Implementation Checks PC4".
- [ ] **PC5** — Verify Dokploy/Hetzner bandwidth quota của VPS đủ cho expected throughput (estimate 7TB/month tại 100 concurrent sandbox).

---

## Dev Notes

### Security model
- Shared `BROWSER_PROXY_SECRET` (v1) — blast radius là 1 secret cho toàn bộ sandbox. Mitigated bởi runbook rotation quarterly.
- v2 (deferred) — per-sandbox HMAC: `HMAC(GLOBAL_KEY, sandboxId)`. Track in [v2 backlog](#v2-backlog).
- Proxy chạy **cùng VPS** với DB → SSRF block là REQUIRED, không optional. Nếu skip private IP check, 1 sandbox compromise = full VPS pivot.

### Image rebuild gating
- Tasks 5, 6 cần image rebuild (`stable-2`). API code (Tasks 1-4) deploy độc lập trước.
- Sandboxes hiện tại (provisioned trước Story 8.7) **không tự fix** — phải reprovision. Coordinate với deploy: force-recreate hoặc đợi 24h auto-archive.

### Coordination với Story 8.5
- Story 8.5 AC7 (advisory lock) độc lập với 8.7 — không conflict.
- Story 8.5 AC8 (OTel) ship sau 8.7 → emit proxy metrics qua `meter.createCounter('browser_proxy.connections_total')` khi 8.5 ready. Đánh dấu TODO trong code.

### Rollout phases
1. **Code deploy** (Tasks 1-4, 7, 8) — apps/api restart, existing sandbox unaffected
2. **Image rebuild** (Tasks 5, 6, 9) — push stable-2
3. **Ops** (Task 10) — Dokploy env + port + reprovision

---

## Verification

Detail trong plan section "Verification". Tóm tắt 5 critical tests:

```bash
# 1. Proxy up + auth
curl -v -x "http://epsilon:$SECRET@167.172.66.16:8009" https://example.com  # → 200

# 2. SSRF block
curl -v -x "http://epsilon:$SECRET@167.172.66.16:8009" http://10.0.0.1/  # → 403 private-ip-literal

# 3. Port block
curl -v -x "http://epsilon:$SECRET@167.172.66.16:8009" --connect-to a:25:smtp:25 telnet://a:25  # → 403 port-not-allowed

# 4. In sandbox (after API deploy + new provision, before image rebuild)
echo $HTTP_PROXY && curl https://example.com  # → 200

# 5. agent-browser (after image rebuild + reprovision)
agent-browser open https://example.com && agent-browser screenshot ./test.png  # → screenshot saved
```

---

## v2 Backlog

Defer khỏi 8.7, đưa vào sprint sau:

- **Per-sandbox HMAC auth** — eliminate shared secret blast radius. New story.
- **OTel metrics** — integrate khi Story 8.5 AC8 ship. `browser_proxy.connections_total{status}`, `browser_proxy.bytes_transferred`.
- **Multi-replica conn cap** — current in-memory Map → Redis sliding window. Pair với Story 8.5 AC7.
- **Daytona egress CIDR firewall** — request egress IP range from Daytona support, narrow port 8009 inbound.
- **Bandwidth alarms** — Grafana alert >70% VPS monthly quota.

---

## Spec Revision Notes

- **2026-05-19 Initial**: Story created from approved plan v2 sau Winston architect review. Plan v1 (initial 6-file change) đã được upgrade thành v2 với full hardening (SSRF, port whitelist, conn cap, log, explicit public URL config) trước khi tạo story này.
