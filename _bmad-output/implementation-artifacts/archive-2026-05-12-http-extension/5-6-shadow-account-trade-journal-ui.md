# Story 5.6: Shadow Account (P1) — Trade Journal Analysis + Strategy Extraction + Report

Status: ready-for-dev

**Depends on**: [Story 5.5](5-5-vibe-trading-research-tools-p0.md) done (HTTP extension pattern
established for research tools), [Story 5.0.1](5-0-1-shadow-account-volume-hotfix.md) done
(Docker volumes for shadow state persistence).

**Blocks**: none (Story 5.7 can ship parallel to this).

<!-- Created 2026-05-12 (rewritten by Winston). Shadow Account is the flagship Vibe-Trading feature:
     upload a broker CSV → extract implicit trading rules → multi-market backtest → HTML/PDF report.
     This story wires the 5-step loop using the same HTTP extension pattern as 5.5. -->

## Story

As a Tier 2 trader trên Chainlens,
I want upload một broker CSV export (同花顺 / 东财 / 富途 / generic) và nhận phân tích hành vi
giao dịch + các if-then rules ẩn trích xuất từ lịch sử + backtest đa thị trường + HTML/PDF report,
So that tôi hiểu được pattern thực sự của mình và có thể validate nó trên A股/港股/美股/crypto
trước khi quyết định giao dịch tiếp theo.

**Shadow Account loop** (5 tools chạy tuần tự, AI agent tự orchestrate):
1. `analyze_trade_journal` — profile behavior (holding period, win rate, disposition effect)
2. `extract_shadow_strategy` — distill 3-5 if-then rules từ profitable roundtrips
3. `run_shadow_backtest` — backtest rules trên A/HK/US/crypto + delta-PnL attribution
4. `render_shadow_report` — generate HTML/PDF (8 sections + charts)
5. `scan_shadow_signals` — today's symbols matching shadow cadence (optional follow-up)

## Acceptance Criteria

### AC1 — VT FastAPI exposes 5 Shadow Account endpoints + file upload

**Given** VT FastAPI hiện có `/upload` + `/shadow-reports/{id}` nhưng KHÔNG có 5 tool endpoints
**When** Story 5.6 ships
**Then** thêm 5 endpoints vào `Vibe-Trading/agent/api_server.py`:

| Endpoint | MCP tool wrapped | Auth |
|---|---|---|
| `POST /tools/analyze_trade_journal` | `analyze_trade_journal` | `require_auth` |
| `POST /tools/extract_shadow_strategy` | `extract_shadow_strategy` | `require_auth` |
| `POST /tools/run_shadow_backtest` | `run_shadow_backtest` | `require_auth` |
| `POST /tools/render_shadow_report` | `render_shadow_report` | `require_auth` |
| `POST /tools/scan_shadow_signals` | `scan_shadow_signals` | `require_auth` |

**And** existing `POST /upload` endpoint (line 1679) được leverage để upload CSV file →
returns server-side file path sử dụng cho `analyze_trade_journal.file_path`
**And** `render_shadow_report` synchronous — có thể chạy 5-15s cho window 1 năm 4 markets;
response includes `shadow_id` + `report_url` (HTTP path to HTML) + `report_path` (local path for PDF download)
**And** existing `GET /shadow-reports/{shadow_id}?format={html|pdf}` giữ nguyên cho report retrieval
(đã có ở [api_server.py:1654](Vibe-Trading/agent/api_server.py#L1654))

### AC2 — epsilon-api sub-routes for all 5 tools + file upload proxy + report passthrough

**Given** Story 5.5 đã thiết lập 5 sub-routes pattern
**When** Story 5.6 ships
**Then** thêm 7 sub-routes vào `apps/api/src/router/routes/vibe-trading.ts`:

```
POST /v1/router/vibe-trading/upload                    → VT /upload (multipart passthrough)
POST /v1/router/vibe-trading/analyze-trade-journal     → analyze_trade_journal
POST /v1/router/vibe-trading/extract-shadow-strategy   → extract_shadow_strategy
POST /v1/router/vibe-trading/run-shadow-backtest       → run_shadow_backtest
POST /v1/router/vibe-trading/render-shadow-report      → render_shadow_report
POST /v1/router/vibe-trading/scan-shadow-signals       → scan_shadow_signals
GET  /v1/router/vibe-trading/shadow-reports/:shadowId?format={html|pdf}   → VT /shadow-reports/{id} (passthrough)
```

**And** the new `GET /shadow-reports/:shadowId` route is the **critical missing piece** for AC4
iframe delivery — serves VT's HTML/PDF via same-origin epsilon-api proxy so iframe embedding
works without CORS issues. Route:
- Validates `shadowId` matches `/^shadow_[0-9a-f]{8}$/` (parity VT `_SHADOW_ID_RE`)
- Validates `format` query param: `html` | `pdf`
- Streams binary response from VT to client (use `c.body(resp.body)`)
- **No billing** (report already billed at render time)
- Auth: `combinedAuth` so authenticated dashboard users can fetch
- Content-Type mirrors VT response: `text/html` or `application/pdf`

**And** `/upload` route:
- Multipart form-data passthrough (Hono's `c.req.formData()`)
- File size limit: 10MB enforced at Hono layer (broker exports typically <1MB)
- File extension whitelist: `.csv`, `.xlsx`, `.xls` — reject others with 400
- Antivirus scan NOT included — deferred to post-MVP security hardening story. Tier 2 users
    are public (not internal-only), but risk is bounded by file extension whitelist + 10MB cap.
- Returns `{ file_path, size, filename }` from VT

**And** 5 shadow tool routes follow Story 5.1/5.5 pattern:
- Zod validation
- `[TIER-BYPASS-SUSPECT]` log
- `checkCredits` → 402
- Service layer call
- `deductToolCredits` ATOMIC
- Error handling via 4 existing VT error classes

### AC3 — 6 OpenCode tools + Tier 2 permissions

**Given** Tier 2 agent đã có 6 research tools từ Story 5.5
**When** Story 5.6 ships
**Then** thêm 6 OpenCode tools:

| Tool | Description | Timeout |
|---|---|---|
| `vibe_trading_upload_journal.ts` | Upload CSV to VT, returns server file path | 10s |
| `vibe_trading_analyze_journal.ts` | Parse CSV → behavior profile + diagnostics | 10s |
| `vibe_trading_extract_strategy.ts` | Distill 3-5 if-then rules from roundtrips | 15s |
| `vibe_trading_run_shadow_backtest.ts` | Multi-market backtest + delta-PnL | 30s |
| `vibe_trading_render_shadow_report.ts` | Generate HTML/PDF report, returns report_url | 20s |
| `vibe_trading_scan_shadow_signals.ts` | Today's signals matching shadow cadence | 5s |

**And** permission updates:
- `chainlens-tier2.md`: 6 tools `allow`
- `chainlens-tier1.md`: 6 tools `deny`

**And** agent system prompt section "Shadow Account Loop" restored (đã bỏ ở Story 5.5 commit) với
correct tool names:

```
Run in sequence when user provides a broker CSV:
1. vibe_trading_upload_journal({file_path}) → {server_file_path}
2. vibe_trading_analyze_journal({file_path: server_file_path}) → profile
3. vibe_trading_extract_strategy({journal_path: server_file_path}) → {shadow_id, rules}
4. vibe_trading_run_shadow_backtest({shadow_id, window_start, window_end}) → backtest results
5. vibe_trading_render_shadow_report({shadow_id}) → {report_url}
6. (optional) vibe_trading_scan_shadow_signals({shadow_id}) → today's signals
```

### AC4 — Shadow Account page UI tại `/dashboard/shadow-account`

**Given** Tier 2 user truy cập `/dashboard/shadow-account`
**When** trang load
**Then** hiển thị:
- Drag-and-drop CSV upload zone (reuse existing file upload primitives nếu có trong `apps/web/src/components/ui/`)
- File validation: `.csv`, `.xlsx`, `.xls` chỉ — max 10MB
- On upload success → show "Analyze with AI" button
- Empty state: brief explanation of Shadow Account + supported broker formats

**Given** user click "Analyze with AI"
**When** AI Chat opens
**Then** pre-filled prompt dispatched to agent:
```
Analyze my trade journal at {server_file_path}. Run the full Shadow Account loop:
1) analyze journal, 2) extract shadow strategy, 3) run 1-year multi-market backtest,
4) render HTML report, 5) scan today's signals. Explain each step briefly as you go.
```
**And** agent chạy 5-step loop, streaming progress vào chat
**And** khi `render_shadow_report` done → Chat hiển thị embedded iframe link đến `report_url`
(iframe allowed because report served from same-origin epsilon-api proxy)

### AC5 — Tier gate

**Given** Tier 1 user truy cập `/dashboard/shadow-account`
**When** page load
**Then** hiển thị upgrade prompt "Shadow Account is a Tier 2 feature" với link sang pricing page
**And** KHÔNG render upload zone

### AC6 — Pricing tier

**Given** Shadow Account loop expensive (parse CSV + run backtest + render HTML)
**When** Story 5.6 ships
**Then** TOOL_PRICING entries:

| Tool | baseCost | Rationale |
|---|---|---|
| `vibe_trading_upload_journal` | $0.00 | File transfer only |
| `vibe_trading_analyze_journal` | $0.10 | CSV parse + pandas compute + behavior models |
| `vibe_trading_extract_strategy` | $0.15 | Itemset mining on roundtrips |
| `vibe_trading_run_shadow_backtest` | $0.50 | Multi-market backtest (4 markets × ~1y) |
| `vibe_trading_render_shadow_report` | $0.10 | Jinja render + matplotlib charts |
| `vibe_trading_scan_shadow_signals` | $0.05 | Small signal scan |

**Total full loop per-user**: ~$0.90 (marketing anchor: "Full Shadow Account analysis < $1")

### AC7 — Tests

**Given** Story 5.5 test infrastructure
**When** Story 5.6 ships
**Then**:
- Backend service tests: 6 happy + 6 auth-error paths (≥12 tests)
- Backend route tests: 6 happy + 6 invalid-payload + 6 402 credits + upload validation (≥24 tests)
- OpenCode tool tests: per-tool happy + 1 error path (≥12 tests)
- VT endpoint integration tests (gated): `test_shadow_account_endpoints.py` (≥5 tests)
- Shadow Account page UI test: Tier 2 renders upload zone; Tier 1 renders upgrade prompt (≥2 tests)
- TypeScript clean

## Tasks / Subtasks

### Task 1 — VT FastAPI: 5 shadow endpoints (AC1)

**Prerequisite**: [Story 5.0.1](5-0-1-shadow-account-volume-hotfix.md) MUST be merged first —
shadow reports and accounts directories need Docker volume backing before this story's endpoints
will produce persistent data. If 5.0.1 not merged, your dev test will "work" but state will be
lost on container restart.

- [ ] Edit `Vibe-Trading/agent/api_server.py`:
  - Thêm 5 endpoints sau Story 5.5 endpoints
  - Pydantic models mirror MCP tool signatures ([mcp_server.py:550-693](Vibe-Trading/agent/mcp_server.py#L550))
  - All endpoints call `registry.execute(name, params)` internally
  - NO docker-compose changes in this story — handled by Story 5.0.1 prerequisite

### Task 2 — Backend service + routes (AC2)

- [ ] Extend `apps/api/src/router/services/vibe-trading.ts` với 5 service functions
- [ ] Extend `apps/api/src/router/routes/vibe-trading.ts`:
  - `/upload` route (multipart passthrough)
  - 5 shadow sub-routes
  - Reuse session_id validation + tier-bypass log + atomic billing
  - Input validation: `shadow_id` regex `/^shadow_[0-9a-f]{8}$/` (parity VT [api_server.py:1651](Vibe-Trading/agent/api_server.py#L1651))

### Task 3 — 6 OpenCode tools (AC3)

- [ ] Create 6 tool files theo pattern Story 5.5
- [ ] Update `chainlens-tier1.md` + `chainlens-tier2.md` permissions
- [ ] Restore Shadow Account loop section in Tier 2 system prompt

### Task 4 — Shadow Account page (AC4)

- [ ] Create `apps/web/src/app/(dashboard)/shadow-account/page.tsx` (server component)
  - Tier check qua existing user tier lookup
  - Render `<ShadowAccountClient>` or `<UpgradePrompt tier={2} feature="Shadow Account" />`

- [ ] Create `apps/web/src/components/shadow-account/shadow-account-client.tsx` ("use client")
  - Drag-and-drop upload zone (use existing primitives nếu có — check `apps/web/src/components/ui/`)
  - Upload handler: POST multipart to `/v1/router/vibe-trading/upload`
  - On success: store `server_file_path`, show "Analyze with AI" button
  - Click → navigate to chat với pre-filled message (use existing chat routing)

- [ ] Create `apps/web/src/components/shadow-account/shadow-account-client.test.tsx` (Bun test)
  - File validation (reject non-CSV, oversize)
  - Tier 1 shows upgrade prompt

### Task 5 — Pricing (AC6)

- [ ] Edit `apps/api/src/config.ts` TOOL_PRICING — add 6 entries per AC6

### Task 6 — Tests (AC7)

- [ ] Extend service + route tests
- [ ] Create `Vibe-Trading/agent/tests/test_shadow_account_endpoints.py` (gated)

### Task 7 — Documentation

- [ ] Update `core/epsilon-master/opencode/tools/README.md` — "Shadow Account" section
- [ ] Add entry to [deferred-work.md](_bmad-output/implementation-artifacts/deferred-work.md):
  - "Antivirus scan for uploaded CSV — deferred. Internal users only for MVP."

## Dev Notes

### VT Pydantic models

```python
class AnalyzeJournalPayload(BaseModel):
    file_path: str = Field(max_length=512)
    analysis_type: str = Field("full", pattern="^(full|profile|behavior|strategy)$")
    filter_expr: str = Field("", max_length=200)

class ExtractStrategyPayload(BaseModel):
    journal_path: str = Field(max_length=512)
    min_support: int = Field(3, ge=1, le=50)
    max_rules: int = Field(5, ge=1, le=20)

class RunShadowBacktestPayload(BaseModel):
    shadow_id: str = Field(pattern=r"^shadow_[0-9a-f]{8}$")
    window_start: str = ""
    window_end: str = ""
    markets: List[str] = Field(default_factory=list)  # subset of ["china_a","hk","us","crypto"]
    journal_path: str = ""

class RenderShadowReportPayload(BaseModel):
    shadow_id: str = Field(pattern=r"^shadow_[0-9a-f]{8}$")
    include_today_signals: bool = True
    window_start: str = ""
    window_end: str = ""
    journal_path: str = ""

class ScanShadowSignalsPayload(BaseModel):
    shadow_id: str = Field(pattern=r"^shadow_[0-9a-f]{8}$")
    date: str = ""
    per_market: int = Field(3, ge=1, le=20)
```

### Upload proxy considerations

Hono's `c.req.formData()` returns a `FormData` — need to forward to VT using `fetch` with
a new FormData body. Bun's fetch supports this natively. Reference pattern:

```ts
vibeTrading.post('/upload', async (c) => {
  const accountId = c.get('accountId');
  const form = await c.req.formData();
  const file = form.get('file');
  if (!(file instanceof File)) throw new HTTPException(400, { message: 'file required' });
  if (file.size > 10 * 1024 * 1024) throw new HTTPException(413, { message: 'File too large (max 10MB)' });
  const ext = (file.name.split('.').pop() ?? '').toLowerCase();
  if (!['csv', 'xlsx', 'xls'].includes(ext)) {
    throw new HTTPException(400, { message: 'Unsupported file type' });
  }

  const ua = (c.req.header('user-agent') ?? '').replace(/[\r\n\t]/g, ' ').slice(0, 80);
  console.log(`[TIER-BYPASS-SUSPECT] vibe_trading_upload_journal account=${accountId} size=${file.size} ua="${ua}"`);

  const credit = await checkCredits(accountId);
  if (!credit.hasCredits) throw new HTTPException(402, { message: 'Insufficient credits' });

  const vtUrl = `${vtBaseUrl()}/upload`;
  const vtForm = new FormData();
  vtForm.append('file', file, file.name);
  const resp = await fetch(vtUrl, {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.VIBE_TRADING_API_KEY}` },
    body: vtForm,
    signal: AbortSignal.timeout(10_000),
  });
  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    return c.json({ success: false, error: `Upload failed ${resp.status}: ${body.slice(0, 200)}` }, 503);
  }
  const data = await resp.json() as { file_path: string; size: number; filename: string };

  const cost = getToolCost('vibe_trading_upload_journal', 0);
  try {
    await deductToolCredits(accountId, 'vibe_trading_upload_journal', 0, `Upload: ${data.filename}`);
  } catch (e) {
    console.warn(`[EPSILON][billing-failure] tool=upload err=${e}`);
  }
  return c.json({ success: true, cost, data });
});
```

### Security notes for file upload

- **File size limit**: 10MB hard cap (Hono's default is larger — explicit check needed)
- **Extension whitelist**: `.csv, .xlsx, .xls` only — reject `.exe`, `.sh`, etc.
- **No content scan**: MVP accepts any bytes matching extension. Deferred to post-MVP.
- **Storage**: VT stores uploads in `/tmp/` or configured upload dir — never in sandbox
- **Access**: file_path returned is server-side (`/tmp/xyz.csv`) — NOT exposed to sandbox directly
- **Retention**: files deleted after 24h (VT's responsibility — verify with upstream)

### Report delivery

`render_shadow_report` returns both:
- `report_url` — HTTP path like `/shadow-reports/shadow_abc12345?format=html` — served by VT
- `report_path` — local FS path for PDF download via `format=pdf` query param

**Chat embedding**: agent response includes `[View Report](${report_url})` markdown link.
Report loaded in iframe because it's same-origin after epsilon-api proxy rewrite.

**PDF download**: add `GET /v1/router/vibe-trading/shadow-reports/:shadow_id?format=pdf` passthrough
route — existing VT endpoint at [api_server.py:1654](Vibe-Trading/agent/api_server.py#L1654) already
handles both formats, just need epsilon-api proxy.

### Source Tree Components to Touch

**NEW files:**
- `apps/web/src/app/(dashboard)/shadow-account/page.tsx`
- `apps/web/src/components/shadow-account/shadow-account-client.tsx`
- `apps/web/src/components/shadow-account/shadow-account-client.test.tsx`
- `core/epsilon-master/opencode/tools/vibe_trading_upload_journal.ts`
- `core/epsilon-master/opencode/tools/vibe_trading_analyze_journal.ts`
- `core/epsilon-master/opencode/tools/vibe_trading_extract_strategy.ts`
- `core/epsilon-master/opencode/tools/vibe_trading_run_shadow_backtest.ts`
- `core/epsilon-master/opencode/tools/vibe_trading_render_shadow_report.ts`
- `core/epsilon-master/opencode/tools/vibe_trading_scan_shadow_signals.ts`
- `Vibe-Trading/agent/tests/test_shadow_account_endpoints.py`

**Modified files:**
- `Vibe-Trading/agent/api_server.py` — +5 endpoints
- `apps/api/src/router/services/vibe-trading.ts` — +6 fetch functions (5 shadow + 1 report passthrough)
- `apps/api/src/router/routes/vibe-trading.ts` — +7 sub-routes (5 shadow + upload + report passthrough)
- `apps/api/src/config.ts` — +6 TOOL_PRICING entries
- `core/epsilon-master/opencode/agents/chainlens-tier1.md` — +6 deny
- `core/epsilon-master/opencode/agents/chainlens-tier2.md` — +6 allow + system prompt
- `core/epsilon-master/opencode/tools/README.md` — Shadow Account section

**NOT modified:**
- `scripts/compose/docker-compose.yml` — handled by Story 5.0.1 prerequisite

### Testing Standards

- Bun test runner: `bun test`
- Integration gated: `RUN_INTEGRATION_TESTS=1`
- Manual E2E: upload sample broker CSV → complete 5-step loop → verify report renders

### Performance Budget

| Tool | Target p95 | Notes |
|---|---|---|
| `vibe_trading_upload_journal` | <5s | Network + disk write |
| `vibe_trading_analyze_journal` | <8s | CSV parse + pandas (1-year journal ~100k rows) |
| `vibe_trading_extract_strategy` | <12s | Itemset mining |
| `vibe_trading_run_shadow_backtest` | <25s | 4 markets × 1y × rule evaluation |
| `vibe_trading_render_shadow_report` | <15s | Jinja + matplotlib (8 charts) |
| `vibe_trading_scan_shadow_signals` | <3s | Rule evaluation today |

**Total loop**: ~60-80s worst-case. Frontend streams progress per step to keep user informed.

### References

- [Story 5.5](5-5-vibe-trading-research-tools-p0.md) — HTTP extension pattern
- [VT SKILL.md Shadow Account section](Vibe-Trading/agent/SKILL.md) — flagship loop description
- [VT shadow tools source](Vibe-Trading/agent/mcp_server.py) — tool signatures lines 550-693
- [VT render_shadow_report endpoint](Vibe-Trading/agent/api_server.py) — existing report retrieval at line 1654
