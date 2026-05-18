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

## Story 3.x context (Crypto Native Trading UI)
- Story 3.1 (markets dashboard) — done
- Story 3.2 (TradingView chart) — done (verified browser 2026-05-10)
- Story 3.3 (Generative AI Chat Widgets) — **ready-for-dev nhưng spec sai stack**, cần reframe để dùng `OcXxxToolView + ToolRegistry` pattern thay vì Vercel `streamUI`
- Story 3.4 (Token Detail Page) — backlog

## Troubleshooting / Known Issues
- **Backend API "Cannot connect to API" / 401 Unauthorized / memory không inject vào AI**: Triệu chứng của sandbox token drift giữa `apps/api/.env`, DB `epsilon.sandboxes.config.serviceKey`, và container `/workspace/.secrets/.bootstrap-env.json`.

  **Story 5.0.2 (2026-05-18) đã ship auto-reconcile** — gửi request bất kỳ vào sandbox sẽ tự fix nếu drift detected. Check log `[reconcile] sandbox=X drift detected (...); attempting reconcile + sync retry` trong `apps/api/.log` để confirm auto-heal kicked in. Nếu không, manual fix:

  1. Đọc key trong sandbox: `docker exec epsilon-sandbox cat /workspace/.persistent-system/secrets/.bootstrap-env.json || docker exec epsilon-sandbox cat /workspace/.secrets/.bootstrap-env.json`
  2. Lấy giá trị của `INTERNAL_SERVICE_KEY` (hoặc `EPSILON_TOKEN`).
  3. Cập nhật vào file `apps/api/.env` và `apps/web/.env` sao cho khớp.
  4. Update DB serviceKey nếu cần: `docker exec -e PGPASSWORD=postgres supabase_db_epsilon-local psql -U supabase_admin -d postgres -c "UPDATE epsilon.sandboxes SET config = jsonb_set(config, '{serviceKey}', '\"$TRUE_KEY\"') WHERE external_id = 'epsilon-sandbox';"`
  5. Restart lại tiến trình backend (`bun run dev`).

  **Cấu trúc 4-layer token store** (Story 5.0.2 docs): `apps/api/.env INTERNAL_SERVICE_KEY` (A) ↔ DB `sandboxes.config.serviceKey` (B) ↔ container `/workspace/.secrets/.bootstrap-env.json` (C) ↔ container s6 env `/run/s6/container_environment/EPSILON_TOKEN` (D). Story 5.0.3 sẽ DB-canonical hóa (cloud) + static mount (local) để eliminate drift triggers.
