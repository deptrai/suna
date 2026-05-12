# Story 5.2: Backtest Strategy Editor (CodeMirror 6 — spec nói Monaco, xem §Stack Decision)

Status: done

**Depends on**: [Story 5.0](5-0-vibe-trading-platform-foundation.md) done, [Story 5.1](5-1-vibe-trading-api-integration-in-sandbox.md) review → backend route `POST /v1/router/vibe-trading/jobs` + `GET /v1/router/vibe-trading/runs/:jobId` + Zod schema `VibeTradingJobSchema` đã ship ([vibe-trading.ts:13-55](apps/api/src/router/routes/vibe-trading.ts#L13)). 5.2 build frontend editor + page route consume các endpoint này.

<!-- Created 2026-05-11. Story key in sprint-status.yaml keeps "monaco-editor" suffix for traceability, but actual implementation uses CodeMirror 6 — see §Stack Decision dưới. -->

## ⚠️ Stack Decision (READ FIRST)

**Spec viết "Monaco Editor" nhưng implementation phải dùng CodeMirror 6.**

Codebase đã production CodeMirror 6 với toàn bộ stack:
- 6 `@codemirror/*` packages (autocomplete, commands, language, lint, state, view) ([package.json:22-27](apps/web/package.json#L22))
- `@uiw/react-codemirror` v4.23.10 wrapper ([package.json:147](apps/web/package.json#L147))
- `@uiw/codemirror-extensions-langs` đã có TS + Python ([code-editor.tsx:79-115](apps/web/src/components/file-editors/code-editor.tsx#L79))
- VSCode dark + Xcode light theme ([code-editor.tsx:5-6](apps/web/src/components/file-editors/code-editor.tsx#L5))
- LSP diagnostics integration ([codemirror-diagnostics.ts:16](apps/web/src/components/file-editors/codemirror-diagnostics.ts#L16))
- Architecture.md table dòng 242 ghi: `Editor | CodeMirror 6 | ✅ Production`
- Project-context.md ghi: `Editor: CodeMirror 6`

UX spec ([ux-design-specification.md:250](_bmad-output/planning-artifacts/ux-design-specification.md#L250)) và Epic spec dùng "Monaco" do soạn trước khi team chọn CodeMirror. **Adding Monaco sẽ:**
1. Tăng bundle ~3MB (Monaco core)
2. Duplicate functionality (2 code editors trong cùng app)
3. Phá vỡ theming pattern (Monaco có theme system riêng, không tương thích Tailwind v4 + `next-themes`)
4. Hỏng LSP/diagnostics pipeline đã có

**Quyết định**: reuse existing `<CodeEditor>` ở [apps/web/src/components/file-editors/code-editor.tsx](apps/web/src/components/file-editors/code-editor.tsx). Nếu cần customize cho backtest use case (vd: bỏ Save button, thay bằng "Run Backtest"), tạo wrapper component, KHÔNG fork hoặc thêm Monaco.

## Story

As a Tier 2 user trên Chainlens,
I want soạn thảo và chỉnh sửa trading strategy (JSON config + optional Python executable_code) trong editor ngay trong trình duyệt,
so that tôi iterate nhanh trên strategy mà không cần IDE riêng và submit backtest job qua một click.

## Acceptance Criteria

1. **AC1 — Page `/dashboard/backtest` render Strategy Editor với syntax highlighting**
   - **Given** user (Tier 2) truy cập `/dashboard/backtest`
   - **When** trang load
   - **Then** route resolve tại `apps/web/src/app/(dashboard)/dashboard/backtest/page.tsx` (server component, đặt trong route group `(dashboard)` để inherit dashboard layout)
   - **And** page là server component (KHÔNG `"use client"` directive)
   - **And** page lazy-import client-side editor component (`<BacktestStrategyEditor>`) — leaf component có `"use client"` directive
   - **And** editor mặc định render với JSON template payload mẫu (xem §Initial Payload Template trong Dev Notes)
   - **And** editor support **TypeScript** syntax highlighting cho JSON-with-comments wrapper VÀ **Python** syntax highlighting cho `context_rules.executable_code` field (multi-language mode — xem §Dual-Language UX)
   - **And** editor theme tự động switch theo `next-themes`: dark mode → `vscodeDark`, light mode → `xcodeLight` (parity existing `<CodeEditor>` component [code-editor.tsx:5-6](apps/web/src/components/file-editors/code-editor.tsx#L5))

2. **AC2 — "Run Backtest" submit JSON payload với atomic billing + loading state**
   - **Given** user đã edit strategy và click button "Run Backtest"
   - **When** code/payload được submit
   - **Then** client parse editor content as JSON. Nếu invalid JSON → highlight error inline trong editor + disable submit button + toast lỗi
   - **And** valid JSON được POST đến `${getEnv().BACKEND_URL}/router/vibe-trading/jobs` (BACKEND_URL đã có `/v1` prefix — KHÔNG thêm `/v1/` lại, parity Story 3.x convention)
   - **And** request dùng `authenticatedFetch` từ [apps/web/src/lib/auth-token.ts](apps/web/src/lib/auth-token.ts) (inject Supabase JWT, parity Story 3.3)
   - **And** trong khi chờ response, editor enter "executing" state: editor read-only (CodeMirror `EditorView.editable.of(false)`), button "Run Backtest" → spinner + "Submitting..." text, ETA hint hiển thị "Backtest typically takes 5-30s"
   - **And** khi backend trả 200 với `{ success: true, job_id, run_id, ... }` → page lưu `job_id` vào local state + bắt đầu poll `GET /router/vibe-trading/runs/:jobId` mỗi 2s (KHÔNG SSE — Story 5.3 sẽ migrate sang SSE)
   - **And** poll loop có max 30s budget (parity Story 5.1 tool's `AbortSignal.timeout(30_000)`), exceed → hiển thị "Backtest đang chạy nền. Job ID: {job_id}. Retry với params nhỏ hơn hoặc disable Monte Carlo."

3. **AC3 — Error handling: 400/401/402/403/503 từ backend hiển thị inline + actionable**
   - **Given** backend trả error response
   - **When** client nhận
   - **Then** xử lý từng status code:
     - **400** (Zod validation fail từ [vibe-trading.ts:65-66](apps/api/src/router/routes/vibe-trading.ts#L65)): parse `error` field từ response, highlight dòng JSON tương ứng nếu có thể infer (vd lỗi `"instrument_type"` → tìm key `"instrument_type"` trong editor và scroll-to + underline)
     - **401**: redirect `/auth` (Supabase JWT expired)
     - **402** ("Insufficient credits"): hiển thị card "Bạn cần thêm credits để chạy backtest" với link đến `/credits-explained`
     - **403** (VT IP whitelist reject — Story 5.1 distinct error): hiển thị "Vibe-Trading service đang config — liên hệ support"
     - **503** (VT downstream fail — Story 5.1 `VibeTradingDownstreamError`): retry button + show preserved editor content (KHÔNG mất user's code)
   - **And** mọi error state phải preserve editor content — user KHÔNG bao giờ mất code đã viết
   - **And** loading state reset (editable lại, button hết spinner) sau error

4. **AC4 — Editor preserve content trên page navigation (localStorage)**
   - **Given** user đã edit strategy và navigate đi (vd chuyển tab khác, F5)
   - **When** user quay lại `/dashboard/backtest`
   - **Then** editor restore content từ `localStorage` key `chainlens:backtest:draft:${accountId}` (scope theo account để không leak giữa users)
   - **And** debounce save: editor change → setTimeout 500ms → save to localStorage (KHÔNG save mỗi keystroke)
   - **And** có button "Reset to default template" để clear localStorage + reload mẫu
   - **And** localStorage entry expire sau 7 ngày (timestamp check khi load)

5. **AC5 — Result Visualizer placeholder (Story 5.3 sẽ thay)**
   - **Given** backtest hoàn thành (poll thấy `status === "success"` hoặc `status === "unknown"` + `data_summary`)
   - **When** Story 5.2 ship (chưa có Story 5.3)
   - **Then** results panel hiển thị raw JSON response trong một `<pre>` block với JSON syntax highlighting (CodeMirror read-only instance)
   - **And** comment trong code: `// TODO(Story 5.3): replace with KPI cards + Equity Curve chart`
   - **And** result panel collapsible (Radix Collapsible) để user vẫn thấy editor khi xem result

## Tasks / Subtasks

- [x] **Task 1: Create page route + server component** (AC: 1)
  - [x] Subtask 1.1: Create `apps/web/src/app/(dashboard)/dashboard/backtest/page.tsx` as server component
  - [x] Subtask 1.2: Add `metadata` export với title "Backtest Strategy - Chainlens" (parity [markets/page.tsx:7-9](apps/web/src/app/(dashboard)/markets/page.tsx#L7))
  - [x] Subtask 1.3: Page lazy-import `<BacktestStrategyEditorClient>` via `next/dynamic` với `ssr: false` (CodeMirror cần `window`)
  - [x] Subtask 1.4: Add Tier 2 gate — không có tier infrastructure hiện tại, added TODO comment defer to Epic 7
  - [x] Subtask 1.5: Add to tab-route-resolver + page-tab-content + tab-bar ROUTE_MAP (dashboard uses tab system, not sidebar)

- [x] **Task 2: Build `<BacktestStrategyEditorClient>` component** (AC: 1, 2, 4)
  - [x] Subtask 2.1: Create `apps/web/src/components/backtest/strategy-editor.tsx` với `"use client"` directive
  - [x] Subtask 2.2: Wrap existing `<CodeEditor>` với `showHeader={false}`, `language="json"`, `onChange` prop
  - [x] Subtask 2.3: Add "Run Backtest" button
  - [x] Subtask 2.4: Add localStorage persistence với debounce 500ms (key: `chainlens:backtest:draft:${accountId}`)
  - [x] Subtask 2.5: Add "Reset" button với confirm dialog trước khi clear
  - [x] Subtask 2.6: Add inline JSON5 validation: parse on change, show error in status bar above editor

- [x] **Task 3: Dual-language UX cho `executable_code` field** (AC: 1)
  - [x] Subtask 3.1: Implemented Option A (single JSON editor)
  - [x] Subtask 3.2: JSON editor với template có comments hướng dẫn
  - [x] Subtask 3.3: Added helper text dưới editor

- [x] **Task 4: Implement submit flow + polling** (AC: 2, 3)
  - [x] Subtask 4.1: Create `apps/web/src/lib/backtest-api.ts` với `submitBacktest` và `pollRun`
  - [x] Subtask 4.2: Use `authenticatedFetch` từ auth-token.ts
  - [x] Subtask 4.3: Use `getEnv().BACKEND_URL` — không hardcode
  - [x] Subtask 4.4: Poll loop 2s interval, max 30s, `AbortController` cancel on unmount
  - [x] Subtask 4.5: Surface 400/401/402/403/503 errors, không swallow

- [x] **Task 5: Error UI components** (AC: 3)
  - [x] Subtask 5.1: 400: show error message inline in status bar
  - [x] Subtask 5.2: 402: render inline credits banner với link `/credits-explained`
  - [x] Subtask 5.3: 503: RetryButton + preserve editor content
  - [x] Subtask 5.4: Unit tests verify each status code in backtest-api.test.ts

- [x] **Task 6: Result placeholder panel** (AC: 5)
  - [x] Subtask 6.1: Create `<BacktestResultPlaceholder>` — CodeMirror read-only JSON
  - [x] Subtask 6.2: Add `<Collapsible>` wrapper (shadcn/ui), default open
  - [x] Subtask 6.3: Added `// TODO(Story 5.3)` comment

- [x] **Task 7: Tests** (parity Story 5.1 test convention)
  - [x] Subtask 7.1: 11 unit tests for `backtest-api.ts` — all pass (success, 400/401/402/403/503, timeout, cancel)
  - [x] Subtask 7.2: 12 unit tests for strategy-editor utilities — all pass (getDraftKey, loadDraft, saveDraft, INITIAL_TEMPLATE)
  - [x] Subtask 7.3: localStorage isolation + TTL expiry tested
  - [ ] Subtask 7.4: E2E browser test (manual — requires running frontend)

- [x] **Task 8: Documentation + Story 5.3 hand-off**
  - [x] Subtask 8.1: No `apps/web/CLAUDE.md` exists — noted in Completion Notes
  - [x] Subtask 8.2: `// TODO(Story 5.3)` comment in result-placeholder.tsx

### Review Findings

Code review 2026-05-11 — 3 layers (Blind Hunter / Edge Case Hunter / Acceptance Auditor).

**Decision-needed (resolved 2026-05-11):**

- [x] [Review][Decision] **AC1 Dual-Language UX deviation** → Resolved: defer dual-language Python highlighting to Story 5.3 as tech debt. Option A (single JSON editor + helper text) accepted permanently for 5.2. AC1 wording to be amended in spec retro.
- [x] [Review][Decision] **Tier 2 gate not enforced** → Resolved: defer to Epic 7 per spec §Tier 2 Gate Pattern. Patch only the TODO comment reference (Story 5.4 → Epic 7).
- [x] [Review][Decision] **localStorage scope** → Resolved: per-user scope (`user.id`) accepted. Chainlens dùng basejump pattern: personal `account_id` ≡ `user.id` cho mọi user chưa join org. Không có `usePersonalAccount` hook ở UI layer. Spec wording amend post-review.

**Patch (unambiguous fixes):**

- [x] [Review][Patch] **pollRun silently retries non-2xx/non-503 (401/404/5xx)** — auth expiry mid-poll never redirects; 404/500 retried until 30s timeout instead of surfacing error [apps/web/src/lib/backtest-api.ts:850-864](apps/web/src/lib/backtest-api.ts#L850)
- [x] [Review][Patch] **pollRun không handle `status: 'failed'`** — backend job với `success: true, status: 'failed'` bị loop poll cho đến timeout thay vì surface failure result [apps/web/src/lib/backtest-api.ts:861](apps/web/src/lib/backtest-api.ts#L861)
- [x] [Review][Patch] **submitBacktest re-types tất cả non-{401,402,403,503} thành status 400** — 500/502/504 hiển thị banner sai và KHÔNG có Retry button (Retry chỉ show khi status===503) [apps/web/src/lib/backtest-api.ts:824-827](apps/web/src/lib/backtest-api.ts#L824)
- [x] [Review][Patch] **AbortSignal không truyền vào `authenticatedFetch`** trong cả submit + poll — request continues sau unmount; abort delayed up to 1 full HTTP round-trip [apps/web/src/lib/backtest-api.ts:806,850](apps/web/src/lib/backtest-api.ts#L806)
- [x] [Review][Patch] **`getDraftKey(undefined)` → `chainlens:backtest:draft:undefined`** — shared key cross-user trên cùng device khi auth chưa resolve; `saveDraft` no-ops silently nếu `user?.id` undefined [apps/web/src/components/backtest/strategy-editor.tsx:278-280](apps/web/src/components/backtest/strategy-editor.tsx#L278)
- [x] [Review][Patch] **SubmitResponse không validate** — malformed 200 body propagates `undefined` job_id vào `pollRun(undefined, ...)` [apps/web/src/lib/backtest-api.ts:829](apps/web/src/lib/backtest-api.ts#L829)
- [x] [Review][Patch] **BacktestError throw plain object literal** — fail `instanceof Error`, mất stack trace, break future Error-based dispatch [apps/web/src/lib/backtest-api.ts:816-826](apps/web/src/lib/backtest-api.ts#L816)
- [x] [Review][Patch] **`res.json()` throw uncaught SyntaxError** trên malformed body (cả submit + poll success path) — UI render error.message blank, không Retry [apps/web/src/lib/backtest-api.ts:829,858](apps/web/src/lib/backtest-api.ts#L829)
- [x] [Review][Patch] **Timeout toast missing `job_id`** — AC2 line 56 explicit: "Backtest đang chạy nền. Job ID: {job_id}." Job orphaned không có cách re-attach [apps/web/src/components/backtest/strategy-editor.tsx:397-399](apps/web/src/components/backtest/strategy-editor.tsx#L397)
- [x] [Review][Patch] **`result` state không clear on resubmit** — stale previous result vẫn visible alongside new error banner [apps/web/src/components/backtest/strategy-editor.tsx:367-371](apps/web/src/components/backtest/strategy-editor.tsx#L367)
- [x] [Review][Patch] **Stale AbortController on double-submit** — `handleSubmit` overwrites `abortRef.current` mà không abort previous; Retry button race in-flight poll, `setResult` từ stale call có thể clobber [apps/web/src/components/backtest/strategy-editor.tsx:383-385](apps/web/src/components/backtest/strategy-editor.tsx#L383)
- [x] [Review][Patch] **localStorage QuotaExceeded silently swallowed** — user tưởng draft đã save; reload mất work. Cần toast cảnh báo [apps/web/src/components/backtest/strategy-editor.tsx:298-302](apps/web/src/components/backtest/strategy-editor.tsx#L298)
- [x] [Review][Patch] **Reset dùng native `window.confirm()`** — Dev Notes §Architecture Compliance mandate shadcn `AlertDialog`. Cũng fail silently trong sandboxed iframe [apps/web/src/components/backtest/strategy-editor.tsx:357](apps/web/src/components/backtest/strategy-editor.tsx#L357)
- [x] [Review][Patch] **`<a href="/credits-explained">` full page reload** — phải là `next/link` Link để preserve tab state [apps/web/src/components/backtest/strategy-editor.tsx:479-484](apps/web/src/components/backtest/strategy-editor.tsx#L479)
- [x] [Review][Patch] **TODO comment ghi "Story 5.4" — phải là "Epic 7"** per spec §Tier 2 Gate Pattern [apps/web/src/app/(dashboard)/dashboard/backtest/page.tsx:31](apps/web/src/app/(dashboard)/dashboard/backtest/page.tsx#L31)
- [x] [Review][Patch] **INITIAL_TEMPLATE inline guidance comments bị drop** — leverage SPOT-must-be-≤1.0 hint, timeframe pattern hint, value-bound hints (spec template line 154-169). Mất field-level guidance UX [apps/web/src/components/backtest/strategy-editor.tsx:251-275](apps/web/src/components/backtest/strategy-editor.tsx#L251)
- [x] [Review][Patch] **Tab-route-resolver entry insert dưới `// Admin pages` comment** nhưng `/dashboard/backtest` không phải admin page — misleading [apps/web/src/lib/tab-route-resolver.ts:891](apps/web/src/lib/tab-route-resolver.ts#L891)
- [x] [Review][Patch] **localStorage `content` field không type-validate** — corrupted/tampered `null` hoặc non-string crash CodeMirror khi `setContent(null)` [apps/web/src/components/backtest/strategy-editor.tsx:286-292](apps/web/src/components/backtest/strategy-editor.tsx#L286)
- [x] [Review][Patch] **"Submitting..." button label persists during poll phase** — misleading; nên switch sang "Running..." sau khi submit OK + có job_id [apps/web/src/components/backtest/strategy-editor.tsx:458](apps/web/src/components/backtest/strategy-editor.tsx#L458)

**Deferred (pre-existing / out of scope / accepted trade-off):**

- [x] [Review][Defer] No cross-tab localStorage sync (no `storage` event listener) — deferred, cross-tab edits last-write-wins
- [x] [Review][Defer] `loadDraft` race: user types during auth-load → draft load overwrites in-flight edits — deferred, narrow window
- [x] [Review][Defer] AC3 inline 400 field-level highlighting (scroll-to/underline) — deferred, spec qualifies "nếu có thể infer" (best-effort)
- [x] [Review][Defer] AbortSignal listener accumulates per `pollRun` iteration — deferred, slow leak GC'd on abort
- [x] [Review][Defer] No payload size guard on `submitBacktest`; large paste triggers JSON5.parse per keystroke — deferred, backend 413 acceptable
- [x] [Review][Defer] No `beforeunload` warning during executing state — deferred, polish item
- [x] [Review][Defer] Test isolation: re-importing module per test returns cached instance — deferred, tests pass via fetch reassignment
- [x] [Review][Defer] JSON5-strip-to-strict-JSON not explicitly tested (works by accident via JS object → JSON.stringify) — deferred, add test note in Story 5.3
- [x] [Review][Defer] 7-day expiry silently purges without user notice — deferred, low-impact UX polish
- [x] [Review][Defer] `PAGE_COMPONENTS` lazy() wrapping a `dynamic({ssr:false})` page — deferred, fragile but works
- [x] [Review][Defer] No CSRF assertion — deferred, relies on Supabase JWT bearer (out of scope)

## Dev Notes

### Stack Decision Rationale (CRITICAL — đã giải thích §Stack Decision đầu file)

**CodeMirror 6 thay Monaco** vì:
- Architecture.md dòng 242 + project-context.md confirm CodeMirror 6 là production stack
- 6 packages CodeMirror đã trong `apps/web/package.json` ([package.json:22-147](apps/web/package.json#L22))
- Component `<CodeEditor>` đã production tại [code-editor.tsx](apps/web/src/components/file-editors/code-editor.tsx) với TS + Python langs, theme switching, LSP diagnostics
- Adding Monaco = ~3MB bundle bloat + theming conflicts + duplicate functionality

### Initial Payload Template

Editor mặc định render template sau (string với formatting đẹp, có comments giải thích):

```json5
{
  // Backtest BTC-USDT SPOT strategy with 90-day historical data
  "simulation_environment": {
    "exchange": "binance",
    "instrument_type": "SPOT",  // "SPOT" | "PERPETUAL" (NOT "FUTURES")
    "initial_capital": "15000",
    "historical_range": 90,  // 1-3650 days
    "trading_fees": "0.001",  // optional, 0.1% per trade
    "slippage_tolerance": "0.002"  // optional
  },
  "risk_management": {
    "max_drawdown_percentage": "0.15",  // 15% max DD
    "position_sizing": "0.2",  // 20% per position
    "stop_loss": "0.05",  // optional, 5%
    "take_profit": "0.15"  // optional, 15%
    // For SPOT, leverage must be <= 1.0 (Zod refine guard)
  },
  "context_rules": {
    "assets": ["BTC-USDT"],
    "timeframe": "4h",  // pattern: /^\d+[mhdwM]$/ (1m, 2h, 1d, 1w, 1M)
    "indicators": ["SMA_20", "SMA_50"],  // optional
    "natural_language_rules": "Long when 20-SMA crosses above 50-SMA, exit on reverse cross."
    // "executable_code": "..."  // optional Python strategy (50K char max)
  },
  "execution_flags": {
    "enable_monte_carlo_stress_test": false,
    "enable_rl_optimization": false
  }
}
```

**Note**: Backend [vibe-trading.ts:13-55](apps/api/src/router/routes/vibe-trading.ts#L13) accepts JSON5 syntax? **NO** — backend dùng `c.req.json()` (strict JSON). Frontend MUST strip JSON5 comments trước khi POST.

Strip pattern (or use [json5](https://www.npmjs.com/package/json5) library NPM — verify nếu đã install, nếu chưa: dùng regex strip `//` line comments + `/* */` block comments TRƯỚC `JSON.parse`).

### Backend Contract (Story 5.1 đã ship)

**Endpoint**: `POST /v1/router/vibe-trading/jobs`
- Auth: `combinedAuth` (Supabase JWT hoặc API key) — [router/index.ts:47](apps/api/src/router/index.ts#L47)
- Body: `VibeTradingJobSchema` ([vibe-trading.ts:13-55](apps/api/src/router/routes/vibe-trading.ts#L13)) — strict Zod
- Response 200: `{ success: true, cost: number, status: 'accepted', job_id: string, ... }`
- Response 400/401/402/403/503 — xử lý theo AC3

**Endpoint**: `GET /v1/router/vibe-trading/runs/:jobId`
- Auth: same `combinedAuth`
- `jobId` regex: `/^[A-Za-z0-9_-]{1,128}$/` (verified [vibe-trading-route.test.ts:204](apps/api/src/__tests__/unit/vibe-trading-route.test.ts#L204))
- Response 200 (Phase A): `{ success: true, run_id, status: 'unknown', data_summary: {...} }`
- Response 200 (Phase B): `{ success: true, run_id, status: 'success', metrics, equity_curve, trade_log }`

Tham khảo full Phase A/B logic trong [Story 5.1](5-1-vibe-trading-api-integration-in-sandbox.md) AC1.

### Tier 2 Gate Pattern

Search codebase trước khi implement:
```bash
grep -rn "Tier 2\|tier-2\|tier_2\|isTier2\|subscription_tier" apps/web/src --include="*.tsx" --include="*.ts" | head
```
Nếu chưa có pattern: defer tier gate, add TODO comment, cho user pass through (story 5.2 không block trên tier infrastructure — đó là Epic 7 work).

### Architecture Compliance

**File locations** (parity convention từ Story 3.x):
- Page: `apps/web/src/app/(dashboard)/dashboard/backtest/page.tsx` (server component, route group `(dashboard)`)
- Client editor: `apps/web/src/components/backtest/strategy-editor.tsx` (`"use client"` leaf)
- API client: `apps/web/src/lib/backtest-api.ts`
- Tests: `apps/web/src/lib/__tests__/backtest-api.test.ts` và `apps/web/src/components/backtest/__tests__/strategy-editor.test.tsx`

**Patterns to follow** (architecture.md §Frontend Architecture, project-context.md §3):
- `"use client"` chỉ ở leaf nodes — page là server component
- TailwindCSS utility classes, KHÔNG inline styles
- Radix primitives qua shadcn/ui — KHÔNG raw `<dialog>`, `<button>`
- `next-themes` cho theme switching — editor `useTheme()` để chọn `vscodeDark` | `xcodeLight`
- KHÔNG `process.env.BACKEND_URL` trực tiếp — dùng `getEnv().BACKEND_URL` từ [apps/web/src/lib/env-config.ts](apps/web/src/lib/env-config.ts) (đã có `/v1` prefix)
- KHÔNG raw `fetch` — dùng `authenticatedFetch` từ [apps/web/src/lib/auth-token.ts](apps/web/src/lib/auth-token.ts)

**Anti-patterns** (project-context.md §Workflow):
- KHÔNG comment trên code không thay đổi
- Validation chỉ ở system boundary (parse JSON từ user input) — KHÔNG validate internal data
- Bug fix tối thiểu — KHÔNG refactor surrounding code

### Testing Standards

- Backend test convention: `bun test apps/api/src/__tests__/unit/*.test.ts` ([sprint-status.yaml:48](_bmad-output/implementation-artifacts/sprint-status.yaml#L48))
- Frontend test: `bun test apps/web/src/...` (CLAUDE.md confirmed)
- Mock fetch via `globalThis.fetch = mock(() => ...)` pattern ([vibe-trading-route.test.ts:58-60](apps/api/src/__tests__/unit/vibe-trading-route.test.ts#L58))
- KHÔNG mock CodeMirror itself — use real instance trong tests
- Test isolation: cleanup localStorage in `afterEach`

### Project Structure Notes

**Alignment check**: route `/dashboard/backtest` lives in `(dashboard)/dashboard/` (NOT bare `/dashboard/` — that's the catch-all). Verify by:
```bash
ls apps/web/src/app/\(dashboard\)/dashboard/
# Should show: page.tsx (existing dashboard page)
# Story 5.2 adds: backtest/page.tsx
```

**Conflict resolved**: Spec said Monaco → architecture/codebase says CodeMirror 6. Documented in §Stack Decision. No additional conflicts detected.

## Previous Story Intelligence (5.1)

Từ Story 5.1 review session 2026-05-11:

**Patterns confirmed working**:
- Zod schema with `.refine()` cross-field validation (SPOT + leverage > 1.0 guard) — replicate trên frontend nếu user-facing field validation cần
- `combinedAuth` middleware accepts cả `epsilon_*` token (sandbox) lẫn Supabase JWT (frontend direct) — frontend dùng JWT
- `[TIER-BYPASS-SUSPECT]` log đã có ở backend ([vibe-trading.ts:71-73](apps/api/src/router/routes/vibe-trading.ts#L71)) — frontend KHÔNG cần log lại
- Atomic billing: `checkCredits` trước, `deductToolCredits` sau success — frontend chỉ cần handle 402 response

**Bugs fixed trong 5.1 review** (avoid regression):
- Bug 1: `readContainerBootstrapKey()` path sai (`/workspace/.secrets/` → `/workspace/.persistent-system/secrets/`) — only affects backend, frontend không touch
- Bug 2: 3 sandbox tokens cần trong DB — only affects sandbox auth, frontend không touch

**Lesson**: Story 5.1 đã verify backend end-to-end qua browser test. Story 5.2 chỉ cần verify frontend UI + integration với 5.1 endpoints. KHÔNG re-test backend.

## Git Intelligence (Recent Commits Patterns)

Recent commits trên branch `feat/rename-chainlens-epsilon`:
- `02a20ac08` refactor: conditionally inject Vibe-Trading env vars only when API key present — confirms Story 5.0/5.1 deployment pattern is conditional (frontend KHÔNG hardcode VT config)
- `8a19d1400` feat: Vibe-Trading service + sandbox egress whitelist + tests — Story 5.0 + 5.1 backend foundation
- `b0e225198` feat: token OHLCV data + chart components — Story 3.5 (reference pattern cho chart visualization, hữu ích cho Story 5.3 nhưng KHÔNG cho 5.2)

**Library deps**: Recent commits KHÔNG add Monaco. Confirm decision dùng CodeMirror 6.

## Latest Tech Information

**CodeMirror 6** (project version 6.41.0):
- Stable, actively maintained
- Best practice: use `@uiw/react-codemirror` wrapper for React (already installed) — easier than raw CodeMirror state management
- Performance: handles 100K+ lines without lag (overkill for our use case ~500 line JSON)
- Theme: `vscodeDark` + `xcodeLight` packages already installed

**Next.js 15 App Router** (project uses Turbopack):
- `next/dynamic` with `ssr: false` is the correct pattern for client-only components needing `window` (CodeMirror needs `window` for DOM measurements)
- Server components default; `"use client"` at leaves only — already established pattern

**JSON5 vs strict JSON**:
- Backend uses `c.req.json()` (strict) — KHÔNG support comments
- Frontend MUST strip comments before POST: either use [`json5`](https://www.npmjs.com/package/json5) npm package OR regex-strip
- Recommend: check `package.json` cho `json5` first. Nếu chưa: lightweight regex strip is acceptable (template comments only, không user-generated nested edge cases).

### References

- [Source: _bmad-output/planning-artifacts/epics.md §Epic 5 Story 5.2]
- [Source: _bmad-output/planning-artifacts/architecture.md#L242 — CodeMirror 6 production]
- [Source: _bmad-output/planning-artifacts/architecture.md#L378-403 — Frontend Architecture]
- [Source: _bmad-output/project-context.md §3 — Editor: CodeMirror 6]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#L119-133 — Strategy Creation Flow]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#L247-256 — Vibe Sandbox Editor + Equity Curve Chart specs]
- [Source: apps/web/src/components/file-editors/code-editor.tsx — existing CodeEditor production component]
- [Source: apps/web/src/components/file-editors/codemirror-diagnostics.ts — LSP diagnostics integration]
- [Source: apps/web/package.json#L22-147 — CodeMirror packages installed]
- [Source: apps/api/src/router/routes/vibe-trading.ts — Story 5.1 backend route]
- [Source: apps/api/src/router/index.ts#L47-60 — combinedAuth + mount path]
- [Source: apps/web/src/app/(dashboard)/markets/page.tsx — server component pattern reference]
- [Source: apps/web/src/lib/auth-token.ts — authenticatedFetch helper]
- [Source: apps/web/src/lib/env-config.ts — getEnv().BACKEND_URL]
- [Story 5.1 dependency](5-1-vibe-trading-api-integration-in-sandbox.md)
- [Story 5.0 infrastructure](5-0-vibe-trading-platform-foundation.md)
- [Story 3.5 OHLCV chart pattern](3-5-real-ohlcv-chart.md)

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

- TypeScript full project check (exit 0) — no errors
- `bun test src/lib/__tests__/backtest-api.test.ts` → 11/11 pass
- `bun test src/components/backtest/__tests__/strategy-editor.test.tsx` → 12/12 pass

### Completion Notes List

- Ultimate context engine analysis completed — comprehensive developer guide created
- Stack decision documented (CodeMirror 6 over Monaco) — surface conflict with spec, resolve with architecture/codebase reality
- Backend contract verified via inspection of Story 5.1 route (`apps/api/src/router/routes/vibe-trading.ts`)
- Phase A/B handling deferred to Story 5.3 (visualizer) — Story 5.2 ships JSON placeholder
- Dashboard uses tab system (not sidebar nav) — added to tab-route-resolver.ts, page-tab-content.tsx, tab-bar.tsx ROUTE_MAP
- Tier 2 gate deferred: no subscription_tier infrastructure in codebase yet (Epic 7) — TODO comment added in page.tsx
- JSON5 library already installed (`^2.2.3`) — used for comment-strip before POST
- No `apps/web/CLAUDE.md` exists — skipped Subtask 8.1
- 400 error shows message inline (status bar) — Zod field-level scroll/underline deferred (would require CodeMirror diagnostics integration beyond story scope)

### File List

**NEW files**:
- `apps/web/src/app/(dashboard)/dashboard/backtest/page.tsx`
- `apps/web/src/components/backtest/strategy-editor.tsx`
- `apps/web/src/components/backtest/result-placeholder.tsx` *(deleted in Story 5.3)*
- `apps/web/src/components/backtest/result-visualizer.tsx` *(built as defensive patch during code review — beyond original scope; ownership transferred to Story 5.3)*
- `apps/web/src/lib/backtest-api.ts`
- `apps/web/src/lib/__tests__/backtest-api.test.ts`
- `apps/web/src/components/backtest/__tests__/strategy-editor.test.tsx`

**UPDATED files**:
- `apps/web/src/lib/tab-route-resolver.ts` (added `/dashboard/backtest` static route)
- `apps/web/src/components/tabs/page-tab-content.tsx` (added `BacktestPage` lazy import + route mapping)
- `apps/web/src/components/tabs/tab-bar.tsx` (added `/dashboard/backtest` to ROUTE_MAP)

## Change Log

- 2026-05-11: Story 5.2 implemented — backtest page route, strategy editor with CodeMirror 6 (JSON), submit+poll flow, localStorage persistence, error handling (400/401/402/403/503), result placeholder panel, 23 unit tests passing (claude-sonnet-4-6)
