# Chainlens / Chainlens — Project Instructions

## MCP Trio (BẮT BUỘC dùng cho mọi review/exploration)

Repo này lớn (3,642 indexed files / 83k functions). **Đừng `grep -r` hoặc đọc nguyên file** khi chưa narrow scope. Thứ tự bắt buộc:

### Session start
1. `mcp__serena__activate_project` với path `/Users/luisphan/Documents/chainlens` — luôn chạy ngay khi mở session
2. `mcp__symdex__get_index_stats` — verify index up-to-date (3,642 files, 83,293 functions). Nếu `indexed_files: 0` thì gọi `index_directory`.
3. `mcp__code-review-graph__list_graph_stats_tool` — verify CRG graph (158 files, 1,280 nodes). Build/update nếu cần.

### Tìm code (KHÔNG grep nguyên repo)
- **Biết tên symbol** → `mcp__serena__find_symbol` (chính xác, có body)
- **Tìm theo intent / mô tả** → `mcp__symdex__search_codebase` (`directory_scope` để giới hạn `apps/web` hoặc `apps/api`)
- **Tìm theo domain/concept** → `mcp__code-review-graph__semantic_search_nodes_tool`
- **Cypher pattern (SEC:VAL_TOKEN--SYN, NET:FET_*)** → `mcp__symdex__search_by_cypher`
- Fallback `Bash grep` chỉ khi đã narrow xuống ≤3 file

### Đọc code (overview trước, body sau)
- File overview → `mcp__serena__get_symbols_overview` (KHÔNG `Read` toàn file)
- Đọc 1 function/class với body → `mcp__serena__find_symbol` (`include_body: true`)
- Call graph → `mcp__symdex__get_callers` / `get_callees` / `trace_call_chain`
- **Lưu ý**: nếu kết quả `trace_call_chain` quá lớn (>200KB) → giảm `max_depth` xuống 1 hoặc dùng `directory_scope`

### Edit code
- Sửa function body → `mcp__serena__replace_symbol_body`
- Insert before/after symbol → `mcp__serena__insert_before_symbol` / `insert_after_symbol`
- Rename symbol khắp repo → `mcp__serena__rename_symbol`
- Replace pattern trong 1 file → `mcp__serena__replace_content` (regex mode)
- Fallback `Edit` tool chỉ cho UI/comment changes nhỏ

### Trước refactor (BẮT BUỘC)
- `mcp__code-review-graph__get_impact_radius_tool` — blast radius
- `mcp__code-review-graph__get_affected_flows_tool` — flows bị ảnh hưởng
- `mcp__code-review-graph__detect_changes_tool` — sau khi sửa, xem risk score

### Code review (Story spec / PR)
- `/bmad-code-review` workflow đã tích hợp 3 layer (Blind Hunter / Edge Case Hunter / Acceptance Auditor)
- Story spec review (chưa có code) → dùng SymDex + Serena verify mọi assumption trong spec có thật trong codebase chưa

### Session end
- Nếu sửa source code thực sự → `mcp__symdex__index_directory` re-index
- Sửa large refactor → `mcp__code-review-graph__build_or_update_graph_tool`

---

## Stack & Architecture

**Monorepo** (`pnpm` workspaces):
- `apps/web` — Next.js 15 App Router (Turbopack), React 18, TailwindCSS, **Bun runtime cho test**
- `apps/api` — Bun + Hono, Drizzle ORM, Supabase. **Endpoints prefix `/v1/`**
- `apps/mobile` — Expo + React Native + NativeWind
- `core/epsilon-master/opencode/` — OpenCode plugin tools (`@opencode-ai/plugin`)
- `packages/db` — Drizzle schemas + migrations
- `packages/shared` — Common types

### Tool runtime (QUAN TRỌNG)
- Project dùng **`@opencode-ai/sdk` v1.x**, KHÔNG phải Vercel AI SDK RSC
- Tool returns **string (JSON/markdown)**, KHÔNG phải React Component
- Tool views render qua post-hoc parser: `apps/web/src/components/session/tool-renderers.tsx` (`ToolRegistry.register(name, Component)`)
- Existing OcXxxToolView pattern: `apps/web/src/components/thread/tool-views/opencode/OcXxxToolView.tsx`
- KHÔNG có `apps/web/src/app/api/chat/route.ts` — chat đi qua sandbox proxy `apps/api/v1/p/{sandboxId}/...`
- Multi-backtest proposal flow (`propose_backtest_multi`) uses platform-managed LLM/tooling path; avoid BYOK/API-key setup instructions in user-facing messages.

### Backend convention
- Service layer parity: `apps/api/src/router/services/{name}.ts` (vd `defillama.ts`, `perplexity.ts`)
- Cache layer: in-memory `Map` với TTL (vd `jit-cache.ts`)
- Billing: `checkCredits` trước, `deductToolCredits` sau khi success — atomic check (NFR8)
- Validation: Zod schema, wrap `c.req.json()` trong `.catch(() => null)` → 400 nếu malformed
- Auth proxy: `apiKeyAuth` middleware cho `/v1/router/*` (expects `epsilon_*` token)
- Auth user routes: `combinedAuth` cho `/v1/market/*` (Supabase JWT hoặc API key)

### OpenCode tool definition pattern
- File: `core/epsilon-master/opencode/tools/{name}.ts`
- Sử dụng `tool({...})` từ `@opencode-ai/plugin`
- Args: Zod-like schema qua `tool.schema.string()`
- `execute(args, ctx)` MUST return string
- Tools call billing proxy `${EPSILON_API_URL}/v1/router/{tool}` với `Bearer ${EPSILON_TOKEN}` (KHÔNG gọi external API trực tiếp)
- Timeout: `AbortSignal.timeout(N)` — typical 1.5s tool / 1.2s service

### Agent permission
- `core/epsilon-master/opencode/agents/{agent}.md` — frontmatter `permission: { tool_name: allow|deny }`
- Tier 1/Tier 2 differentiation tại đây — **chưa có cơ chế surface tier info ra UI**

### Vibe-Trading async swarm pattern (Story 5.5.1, 2026-05-19) — CANONICAL

Bất kỳ MCP tool nào có runtime >30s **PHẢI** dùng async start/poll/finalize pattern, KHÔNG block trong `tools/call`. Lý do: `apps/api` proxy ép `AbortSignal.timeout(30_000)` cho mọi `tools/call`.

**Reference impl**: `Vibe-Trading/agent/mcp_server.py:start_swarm` + `cancel_swarm` (5.5.1). OpenCode wrapper: [core/epsilon-master/opencode/tools/vibe_trading_swarm.ts](core/epsilon-master/opencode/tools/vibe_trading_swarm.ts) (poll qua [lib/mcp-sse-client.ts](core/epsilon-master/opencode/tools/lib/mcp-sse-client.ts)).

**Billing**: deposit on start (gates parallel run abuse) + finalize on completion (pay-for-what-you-got). Failed/cancelled run = deposit only.

**Ownership**: per-`run_id` access gated by in-memory `runOwnership` map in [vibe-trading-mcp.ts](apps/api/src/router/routes/vibe-trading-mcp.ts) — 24h TTL, fail-closed on proxy restart, re-hydrate via `list_runs`. `run_swarm` (DEPRECATED) returns 410 Gone via proxy; sunset 2026-06-19.

**Wrapper UI**: progress markers (▶️ start, ⏳ N/M agents, 🛑 cancel, ❌ error) parsed by [OcVibeTradingSwarmToolView.tsx](apps/web/src/components/thread/tool-views/opencode/OcVibeTradingSwarmToolView.tsx). Chat Stop button fires `ctx.abort` → wrapper calls `cancel_swarm`.

---

## Communication
- Respond in Vietnamese; technical terms giữ nguyên English
- Concise — không trailing summary sau khi đã commit
- Reference code: `[file_path:line](file_path#Lline)` markdown link format

## Workflow
- Pre-commit hooks: KHÔNG `--no-verify`
- Prefer editing existing files
- Bug fix không refactor surrounding code
- Không docstring/comments cho code không thay đổi
- Validation chỉ ở system boundary (user input, external API)

## Local dev
- Frontend: `cd apps/web && bunx next dev --turbopack --port 3000`
- Backend: port 8008 (`/v1/` prefix)
- Backend URL từ FE: `getEnv().BACKEND_URL` đã có sẵn `/v1` (KHÔNG thêm `/v1/` lần nữa khi fetch)
- Test web: `bun test src/...`
- Test api: `bun test src/__tests__/...`

## How CI works (Story 5.0.5)

**Workflow files:** `.github/workflows/test.yml` (PR gate) + `.github/workflows/test-e2e.yml` (post-merge E2E)

**Two-tier model:**
- `test-fast` — **required** to pass before merge. Runs: TypeScript typecheck (apps/api + epsilon-master) + 9 targeted test files (50 tests). ≤3 min.
- `test-full-unit` — **informational only** (`continue-on-error: true`). Runs full unit suite; ~142 baseline failures expected in apps/api, ~76 in epsilon-master. Does NOT block merge.
- `playwright-e2e` — runs on push to `main` only (not PRs). Boots Docker compose stack + apps/api sidecar. Chaos tests skipped unless `CI_CHAOS_ENABLED=true` or `workflow_dispatch chaos=true`.

**Branch protection:** Only `test-fast` is a required status check on `main`.

**GitHub secrets required:**
- `GH_PAT` — PAT with `repo` scope (private `Vibe-Trading` submodule checkout)
- `GHCR_PAT` — PAT with `packages:write` scope for `ghcr.io/deptrai/computer` (Story 8.6 sandbox CI)
- `DAYTONA_API_KEY` — Daytona API key (sandbox smoke tests)
- `DOKPLOY_API_TOKEN` + `DOKPLOY_API_URL` — Dokploy API for auto-promote patch (optional, skips if unset)
- `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` — CI notifications (optional, skips if unset)

**Sandbox image CI (Story 8.6):** Three-workflow pipeline — `sandbox-base.yml` (slow base layer, ~monthly), `sandbox-build.yml` (thin layer on every epsilon-master push, ~5-8 min), `sandbox-smoke.yml` (real Daytona sandbox smoke + auto-promote to `:stable`). Self-hosted runner required (label: `sandbox-builder`). Setup: `docs/runbooks/sandbox-ci-setup.md`.

**E2E scope in CI:** `test-e2e.yml` only runs `sandbox-token-drift-recovery.spec.ts` (sandbox-only stack). Specs 01-07 + market/widgets require full self-hosted stack — run locally or set `CI_FULL_STACK=true` on a self-hosted runner.

**Before pushing:** Run fast-tier locally to avoid CI failures:
```sh
# apps/api (must run from apps/api dir)
cd apps/api && bun test \
  src/__tests__/unit/internal-bootstrap-route.test.ts \
  src/__tests__/unit/sandbox-drift-reconciler.test.ts \
  src/__tests__/unit/admin-rotate-sandbox-token.test.ts \
  src/__tests__/unit/sandbox-token-rotation.test.ts \
  src/__tests__/unit/sandbox-provisioner-rollback.test.ts \
  src/__tests__/unit/vibe-trading-swarm-async.test.ts \
  src/__tests__/unit/swarm-finalize-billing.test.ts \
  src/__tests__/unit/vibe-trading-mcp-proxy-extended.test.ts \
  src/__tests__/unit/model-pool-failover.test.ts

# epsilon-master
cd core/epsilon-master && bun test \
  src/services/__tests__/load-canonical-token.test.ts \
  src/services/__tests__/token-grace.test.ts \
  src/services/__tests__/realtime-reauth.test.ts \
  tests/unit/verify-fail-closed.test.ts \
  opencode/tools/__tests__/vibe_trading_swarm.test.ts
```

**Baseline failures:** See [docs/runbooks/ci-baseline-failures.md](docs/runbooks/ci-baseline-failures.md) for categorized list + triage guide.

## Story 3.x context (Crypto Native Trading UI)
- Story 3.1 (markets dashboard) — done
- Story 3.2 (TradingView chart) — done (verified browser 2026-05-10)
- Story 3.3 (Generative AI Chat Widgets) — **ready-for-dev nhưng spec sai stack**, cần reframe để dùng `OcXxxToolView + ToolRegistry` pattern thay vì Vercel `streamUI`
- Story 3.4 (Token Detail Page) — backlog

## Troubleshooting / Known Issues

- **"Workspace offline" / Sandbox idle wake không bootstrap** (Story 8.7 incident 2026-05-19):
  - **Root cause**: Daytona PID 1 = `daytona sleep infinity` — sau auto-archive (30 min idle) + wake, container start nhưng `epsilon-daytona-start` không tự run. Daytona báo `state=started` nhưng `epsilon-master` không tồn tại → UI shows "Workspace offline".
  - **Fix shipped**: [`daytona.ts ensureRunning()`](apps/api/src/platform/providers/daytona.ts) giờ health-check `/epsilon/health` sau wake; nếu fail → re-trigger `startRuntime()` bootstrap automatically.
  - **Manual recovery** (nếu code chưa deploy hoặc edge case): SSH VPS, dùng Daytona toolbox proxy trigger bootstrap:
    ```bash
    TOK=$DAYTONA_API_KEY; SBID=<sandbox-external-id>
    curl -X POST -H "Authorization: Bearer $TOK" -H "Content-Type: application/json" \
      "https://proxy.app-eu.daytona.io/toolbox/$SBID/process/execute" \
      -d '{"command":"setsid bash -c '\''nohup /usr/local/bin/epsilon-daytona-start > /tmp/eds.log 2>&1 < /dev/null &'\''", "timeout":10}'
    # Verify after 30s: curl ... -d '{"command":"curl -s http://localhost:8000/epsilon/health","timeout":10}'
    ```

- **NEVER set `DAYTONA_NETWORK_ALLOW_LIST` without `DAYTONA_NETWORK_ALLOW_LIST_CONFIRMED=true`** (Story 8.7 incident root cause):
  - Setting first var alone DISABLES Daytona default whitelist → sandbox lose AI providers + `*.trycloudflare.com` (EPSILON_URL) access → bootstrap fail → workspace offline.
  - Code-level guard ([daytona.ts](apps/api/src/platform/providers/daytona.ts)): refuses to apply unless confirmation flag set.
  - Full context: [docs/production-deploy-guide.md → "DAYTONA_NETWORK_ALLOW_LIST block AI providers"](docs/production-deploy-guide.md).

- **Backend API "Cannot connect to API" / 401 Unauthorized / memory không inject vào AI**: Story 5.0.3 chuyển sang canonical token lifecycle:
  - Cloud: DB `epsilon.sandboxes.config.serviceKey` là source of truth; sandbox pull qua `/v1/internal/bootstrap-token`.
  - Local Docker: source of truth là `apps/api/.env INTERNAL_SERVICE_KEY` và bind mount readonly `secrets/sandbox-token.txt -> /run/s6/container_environment/EPSILON_TOKEN`.

  **Auto-recovery (mặc định)**: Story 5.0.2 (2026-05-18) đã ship auto-reconcile chain — gửi request bất kỳ vào sandbox sẽ tự fix nếu drift detected. Trong apps/api log tìm dòng:
  ```
  [reconcile] sandbox=X drift detected (bad_signature; sandbox=...); attempting reconcile + sync retry
  [reconcile] .env INTERNAL_SERVICE_KEY synced to ...; process.env updated, no restart needed
  [reconcile] sandbox=X drift resolved (DB Y… → container Z…); retry status=200
  ```
  Khi auto-reconcile thành công, **không cần restart backend** — patch P2 (5.0.2 review) đã update `process.env.INTERNAL_SERVICE_KEY` in-place. Circuit breaker (30s cool-off) bảo vệ chống retry storm khi container unreachable.

  **Local rotation flow (bắt buộc)**:
  1. Update `INTERNAL_SERVICE_KEY` trong `apps/api/.env`
  2. Chạy `make sandbox-token` tại repo root (regenerate `secrets/sandbox-token.txt`)
  3. Restart sandbox container: `docker compose -f core/docker/docker-compose.yml restart desktop`

  <details>
  <summary><strong>Manual fix (nếu auto-reconcile fail — rare)</strong></summary>

  1. Sync key local: cập nhật `apps/api/.env` rồi chạy `make sandbox-token`.
  2. Restart sandbox: `docker compose -f core/docker/docker-compose.yml restart desktop`.
  3. Nếu cloud sandbox lỗi bootstrap, verify DB `serviceKey` + `provisioning_key` trước khi rotate token.

  </details>

  **Chaos drill**: To verify the auto-reconcile chain end-to-end, run [docs/runbooks/sandbox-token-drift-drill.md](docs/runbooks/sandbox-token-drift-drill.md) quarterly. Story 5.0.4 ships the runbook + Playwright chaos tests.

- **Shadow Account data loss khi tear-down vibe-trading containers** (Story 5.0.1): Shadow profiles + reports + backtest cache lưu trong 3 Docker named volumes (`vibe-trading-shadow-{accounts,reports,runs}`). `docker compose down` giữ nguyên data; chỉ `docker volume rm` mới xoá. Backup pattern (chi tiết tại [core/docker/README.md](core/docker/README.md#shadow-account-persistence-story-501)):

  ```sh
  docker run --rm -v vibe-trading-shadow-accounts:/data -v $(pwd):/backup alpine \
    tar czf /backup/shadow-accounts-$(date +%F).tgz -C /data .
  ```

  Run nightly. Restore tương tự với `tar xzf`. Data này là per-user persistent state — mất là user mất chiến lược + báo cáo đã render.
