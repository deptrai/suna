# Story 5.5: Vibe-Trading Research Tools (P0) — Skills + Market Data + Options + Patterns

Status: ready-for-dev

**Depends on**: [Story 5.0](5-0-vibe-trading-platform-foundation.md) done (VT service deployed,
sandbox egress whitelist active), [Story 5.1](5-1-vibe-trading-api-integration-in-sandbox.md) done
(backend proxy pattern established).

<!-- Created 2026-05-12. Story 5.5 extends VT FastAPI with HTTP endpoints for 5 high-priority
     research tools, then wires them as OpenCode tools following the same pattern as
     vibe_trading_backtest. NO MCP server mounting — pure HTTP passthrough preserves NFR8
     (billing) and NFR10 (egress isolation). -->

## ⚠️ Architecture Decision — HTTP Extension over MCP Mounting (READ FIRST)

**Vibe-Trading ships a `vibe-trading-mcp` MCP server with 22 tools.** The naive approach is to
mount it as an MCP server in `opencode.jsonc` so OpenCode agent talks to it directly via stdio.

**This story does NOT take that approach.** Instead it extends VT's FastAPI (`api_server.py`)
with HTTP endpoints for each MCP tool, then wraps each as an OpenCode tool following the
established pattern (`vibe_trading_backtest`, `token_info`, etc.).

**Rationale:**

| Aspect | HTTP extension (chosen) | MCP stdio mounting |
|---|---|---|
| NFR8 — Atomic Credit Deduction | ✅ native via `deductToolCredits` | ❌ bypasses billing |
| NFR10 — Sandbox Isolation | ✅ egress unchanged (only epsilon-api) | ❌ requires yfinance/OKX/DuckDuckGo whitelist |
| Sandbox image size | unchanged | +500MB (pandas + numpy + duckdb) |
| Attack surface | unchanged | new Python lib surface in sandbox |
| Tier permission | ✅ frontmatter (proven pattern) | ⚠️ needs new interceptor |
| Pattern repetition | Pattern #16 (proven 15×) | New pattern, unproven |
| Dev cost (P0 — 5 tools) | ~3 days | ~1 day |

**Trade-off accepted**: 2 extra days of dev work in exchange for NFR8 + NFR10 compliance,
zero changes to sandbox isolation, and reuse of a pattern shipped to production 15 times.

**Verified gap (2026-05-12)**: VT `api_server.py` exposes 7 of 22 MCP tool endpoints. The
remaining 15 tools live only in `mcp_server.py` (calls `registry.execute(name, params)`
internally). This story adds 5 HTTP endpoints to `api_server.py` for the P0 set. Stories
5.6 and 5.7 add the remaining 10.

## Story

As a Tier 2 user trên Chainlens,
I want Epsilon agent có thể truy cập kho kiến thức tài chính 72 finance skills, fetch OHLCV
multi-source, định giá options Black-Scholes, và phát hiện chart patterns,
So that tôi research được crypto + equity sâu hơn mà không cần dùng tool ngoài.

## Acceptance Criteria

### AC1 — VT FastAPI exposes 5 P0 tool endpoints

**Given** `Vibe-Trading/agent/api_server.py` chỉ có `/skills` (list-only) + `/jobs` + `/preview`
+ `/swarm/*` + `/shadow-reports/{id}`
**When** Story 5.5 ships
**Then** thêm 5 endpoints mới (Tier 0 — pure passthrough qua `registry.execute()`):

| Endpoint | MCP tool wrapped | Auth |
|---|---|---|
| `GET  /skills/{name}` | `load_skill` | `require_auth` |
| `POST /tools/get_market_data` | `get_market_data` | `require_auth` |
| `POST /tools/analyze_options` | `analyze_options` | `require_auth` |
| `POST /tools/pattern_recognition` | `pattern_recognition` | `require_auth` |
| `POST /tools/factor_analysis` | `factor_analysis` | `require_auth` |

**And** tất cả endpoints dùng cùng `HTTPBearer + IP whitelist` auth scheme đã có sẵn
([api_server.py:281, 351-357](Vibe-Trading/agent/api_server.py))
**And** payload Pydantic models mirror MCP tool signatures ở
[mcp_server.py:143-222, 397-452](Vibe-Trading/agent/mcp_server.py)
**And** `factor_analysis` + `pattern_recognition` chạy synchronously (không qua Celery — VT registry
xử lý in-process) — caller must accept up to 10s wall-clock cho factor_analysis với 100 symbols

### AC2 — epsilon-api proxies for billing + tier-bypass log

**Given** Story 5.1 đã thiết lập pattern `/v1/router/vibe-trading/*` qua `combinedAuth`
**When** Story 5.5 ships
**Then** thêm 5 sub-routes vào `apps/api/src/router/routes/vibe-trading.ts`:

```ts
GET  /v1/router/vibe-trading/skills/:name        → load_skill
POST /v1/router/vibe-trading/market-data         → get_market_data
POST /v1/router/vibe-trading/options             → analyze_options
POST /v1/router/vibe-trading/patterns            → pattern_recognition
POST /v1/router/vibe-trading/factor-analysis     → factor_analysis
```

**And** mỗi route:
- Validate payload bằng Zod schema mirror Pydantic
- `checkCredits(accountId)` → 402 nếu thiếu
- Log `[TIER-BYPASS-SUSPECT]` (parity Story 3.3/5.1 patches)
- Call service layer (`apps/api/src/router/services/vibe-trading.ts` extended)
- `deductToolCredits(...)` ATOMIC trước response (NFR8)
- Return `{ success, cost, data }`

**And** service layer thêm 5 functions: `loadSkill(name)`, `getMarketData(payload)`,
`analyzeOptions(payload)`, `recognizePatterns(payload)`, `runFactorAnalysis(payload)` — mỗi function
~25 dòng, reuse `buildHeaders()` + `vtBaseUrl()` + 4 error classes có sẵn.

### AC3 — 5 OpenCode tools wired with Tier 2 permission

**Given** Tier 2 agent đã có `vibe_trading_backtest` (pattern reference)
**When** Story 5.5 ships
**Then** thêm 5 OpenCode tools vào `core/epsilon-master/opencode/tools/`:

| Tool file | Description | Timeout |
|---|---|---|
| `vibe_trading_load_skill.ts` | Load 1 of 72 finance skill docs | 3s |
| `vibe_trading_market_data.ts` | Fetch OHLCV across 6 sources | 10s |
| `vibe_trading_options.ts` | Black-Scholes price + Greeks (delta/gamma/theta/vega) | 2s |
| `vibe_trading_patterns.ts` | Detect H&S, double top/bottom, triangles, wedges. **REQUIRES** prior call to `vibe_trading_backtest` or `vibe_trading_market_data` that populates `run_dir/artifacts/ohlcv_*.csv` | 5s |
| `vibe_trading_factor_analysis.ts` | IC/IR analysis + layered backtest. **On timeout exceeded** (15s): returns `{ success: false, error: "Factor analysis exceeded 15s timeout — try fewer symbols (<50) or narrower date range" }` — job not retryable (synchronous in VT) | 15s |

**And** mỗi tool follow pattern `token_info.ts` (~50-80 dòng):
- Validate args
- Call `${EPSILON_API_URL}/v1/router/vibe-trading/{path}` với `Bearer ${EPSILON_TOKEN}`
- `AbortSignal.timeout(N)` per tool budget
- 402 → "Insufficient credits"
- `sanitizeUpstreamErr` cho upstream errors

**And** agent frontmatter updates:
- `chainlens-tier2.md`: 5 tools `allow`
- `chainlens-tier1.md`: 5 tools `deny`

**And** `list_skills` tool **không cần thêm** — endpoint `/skills` đã có sẵn ở
[api_server.py:1392](Vibe-Trading/agent/api_server.py#L1392). Wire một tool nhẹ
`vibe_trading_list_skills.ts` cùng story này (6 tools total).

### AC4 — Pricing tier per tool reflects compute cost

**Given** existing `vibe_trading_backtest` = $1.00 (Celery-heavy)
**When** Story 5.5 adds pricing entries to `apps/api/src/config.ts` TOOL_PRICING:

| Tool | baseCost | Rationale |
|---|---|---|
| `vibe_trading_list_skills` | $0.00 | Static read, no compute, marketing free |
| `vibe_trading_load_skill` | $0.00 | Static read |
| `vibe_trading_market_data` | $0.05 | Network fetch yfinance/OKX, occasional Tushare token use |
| `vibe_trading_options` | $0.02 | Pure computation, no network |
| `vibe_trading_patterns` | $0.05 | Vectorized computation, reads OHLCV CSV |
| `vibe_trading_factor_analysis` | $0.30 | CPU-heavy, 10s wall-clock potential |

**And** pricing rationale documented inline (parity existing TOOL_PRICING comments)

### AC5 — Tier 2 agent system prompt updated (correct content)

**Given** Story 5.5 trước đó (commit hiện tại) đã thêm section "Vibe-Trading MCP Tools" với
prefix sai (`vibe-trading/load_skill` thay vì `vibe_trading_load_skill`)
**When** Story 5.5 ships
**Then** cập nhật `chainlens-tier2.md` system prompt:
- Thay tool prefix `vibe-trading/*` → `vibe_trading_*` (đúng OpenCode tool naming convention)
- Bỏ section về Shadow Account loop, Swarm Teams (defer Story 5.6 + 5.7)
- Bỏ section về File/Web tools (`web_search`, `read_url`, file I/O — defer Story 5.7)
- Giữ + làm rõ: when-to-use `vibe_trading_backtest` (heavy) vs market_data (light)

### AC6 — Tests

**Given** Story 5.1 đã có test infrastructure
**When** Story 5.5 ships
**Then**:
- **Backend service tests** (extend `apps/api/src/__tests__/unit/vibe-trading-api-client.test.ts`):
  - 5 happy paths (one per new function) + 401/403 error path each (≥10 tests)
- **Backend route tests** (extend `apps/api/src/__tests__/unit/vibe-trading-route.test.ts`):
  - 5 happy paths + 5 invalid-payload + 5 insufficient-credits + 5 tier-bypass-log capture (≥20 tests)
- **OpenCode tool tests**: per-tool happy path + 1 error path each, parity Story 5.1 pattern
  (≥12 tests)
- **VT endpoint integration tests** (`Vibe-Trading/agent/tests/test_p0_tool_endpoints.py`):
  - 1 happy path per endpoint, gated với `RUN_INTEGRATION_TESTS=1` (≥5 tests)

**And** `bunx tsc --noEmit` no new errors trong files touched

## Tasks / Subtasks

### Task 1 — VT FastAPI: 5 new endpoints (AC1)

- [ ] Edit `Vibe-Trading/agent/api_server.py` — thêm 5 endpoints (vị trí: sau `/skills` ở dòng 1404):

  ```python
  # ============================================================================
  # Research Tool HTTP Endpoints (Chainlens Story 5.5 integration)
  # Mirrors mcp_server.py tool signatures — calls registry.execute() internally.
  # ============================================================================

  from src.tools import build_registry as _build_registry

  _research_registry = None

  def _get_research_registry():
      global _research_registry
      if _research_registry is None:
          _research_registry = _build_registry(include_shell_tools=False)
      return _research_registry


  @app.get("/skills/{name}", dependencies=[Depends(require_auth)])
  async def load_skill_endpoint(name: str):
      """Load full documentation for a named finance skill."""
      from src.agent.skills import SkillsLoader
      loader = SkillsLoader()
      content = loader.get_content(name)
      if content.startswith("Error:"):
          raise HTTPException(status_code=404, detail=content)
      return {"skill": name, "content": content}


  class MarketDataPayload(BaseModel):
      codes: List[str] = Field(min_length=1, max_length=50)
      start_date: str
      end_date: str
      source: str = "auto"
      interval: str = "1D"

  @app.post("/tools/get_market_data", dependencies=[Depends(require_auth)])
  async def get_market_data_endpoint(payload: MarketDataPayload):
      """Fetch OHLCV via VT loader registry."""
      # ... (see Dev Notes for full body)


  class OptionsPayload(BaseModel):
      spot: float
      strike: float
      expiry_days: int = Field(ge=1, le=3650)
      risk_free_rate: float = 0.03
      volatility: float = Field(0.25, ge=0.001, le=5.0)
      option_type: str = Field("call", pattern="^(call|put)$")

  @app.post("/tools/analyze_options", dependencies=[Depends(require_auth)])
  async def analyze_options_endpoint(payload: OptionsPayload):
      registry = _get_research_registry()
      return json.loads(registry.execute("options_pricing", payload.dict()))


  class PatternsPayload(BaseModel):
      run_dir: str = Field(max_length=512)

  @app.post("/tools/pattern_recognition", dependencies=[Depends(require_auth)])
  async def pattern_recognition_endpoint(payload: PatternsPayload):
      registry = _get_research_registry()
      return json.loads(registry.execute("pattern", payload.dict()))


  class FactorAnalysisPayload(BaseModel):
      codes: List[str] = Field(min_length=2, max_length=100)
      factor_name: str
      start_date: str
      end_date: str
      source: str = "auto"
      top_n: int = Field(10, ge=1, le=50)
      bottom_n: int = Field(10, ge=1, le=50)

  @app.post("/tools/factor_analysis", dependencies=[Depends(require_auth)])
  async def factor_analysis_endpoint(payload: FactorAnalysisPayload):
      registry = _get_research_registry()
      return json.loads(registry.execute("factor_analysis", payload.dict()))
  ```

- [ ] Verify Pydantic models match MCP tool signatures (1-to-1)
- [ ] Restart `vibe-trading` container locally — `curl http://vibe-trading:8899/skills/strategy-generate`

### Task 2 — Backend service + route layer (AC2)

- [ ] Extend `apps/api/src/router/services/vibe-trading.ts`:
  - Add 5 typed interfaces (mirror VT Pydantic)
  - Add 5 fetch functions: `loadSkill`, `getMarketData`, `analyzeOptions`, `recognizePatterns`,
    `runFactorAnalysis` — reuse `buildHeaders()` + `vtBaseUrl()` + 4 existing error classes
  - Per-function timeout via param (default 5s; factor_analysis 15s)

- [ ] Extend `apps/api/src/router/routes/vibe-trading.ts`:
  - Add 5 Zod schemas mirror Pydantic (instrument: SPOT-only, no leverage cross-field needed here)
  - Add 5 sub-routes per AC2 — each ~25-30 dòng (parity existing `POST /jobs`)
  - Reuse `[TIER-BYPASS-SUSPECT]` log pattern
  - Reuse `deductToolCredits` ATOMIC pattern
  - **`session_id` charset/length validation** (Story 3.3 pattern): `z.string().max(128).regex(/^[A-Za-z0-9_-]+$/).optional()`

### Task 3 — Pricing (AC4)

- [ ] Edit `apps/api/src/config.ts` TOOL_PRICING (after line 778):
  ```ts
  vibe_trading_list_skills: { baseCost: 0, perResultCost: 0, markupMultiplier: 1.0 },
  vibe_trading_load_skill: { baseCost: 0, perResultCost: 0, markupMultiplier: 1.0 },
  vibe_trading_market_data: { baseCost: 0.05, perResultCost: 0, markupMultiplier: 1.0 },
  vibe_trading_options: { baseCost: 0.02, perResultCost: 0, markupMultiplier: 1.0 },
  vibe_trading_patterns: { baseCost: 0.05, perResultCost: 0, markupMultiplier: 1.0 },
  vibe_trading_factor_analysis: { baseCost: 0.30, perResultCost: 0, markupMultiplier: 1.0 },
  ```

### Task 4 — 6 OpenCode tools (AC3)

- [ ] Create 6 files in `core/epsilon-master/opencode/tools/` (`list_skills` lightweight, rest follow pattern):
  - `vibe_trading_list_skills.ts` — wraps existing `GET /skills` endpoint
  - `vibe_trading_load_skill.ts` — wraps `GET /skills/:name`
  - `vibe_trading_market_data.ts` — wraps `POST /market-data`
  - `vibe_trading_options.ts` — wraps `POST /options`
  - `vibe_trading_patterns.ts` — wraps `POST /patterns`
  - `vibe_trading_factor_analysis.ts` — wraps `POST /factor-analysis`

- [ ] Each tool follows `token_info.ts` template (~50-80 dòng):
  - Args schema với clear `describe()` cho LLM
  - getEnv validation
  - fetch với AbortSignal.timeout
  - 402 → "Insufficient credits"
  - sanitizeUpstreamErr for 4xx/5xx
  - Return JSON.stringify(data, null, 2)

### Task 5 — Permission gate (AC3 frontmatter)

- [ ] `core/epsilon-master/opencode/agents/chainlens-tier2.md`:
  ```yaml
  vibe_trading_list_skills: allow
  vibe_trading_load_skill: allow
  vibe_trading_market_data: allow
  vibe_trading_options: allow
  vibe_trading_patterns: allow
  vibe_trading_factor_analysis: allow
  ```

- [ ] `core/epsilon-master/opencode/agents/chainlens-tier1.md`:
  - Same 6 tools, all `deny`

### Task 6 — Fix Tier 2 system prompt (AC5)

- [ ] `core/epsilon-master/opencode/agents/chainlens-tier2.md` body:
  - Replace existing "Vibe-Trading MCP Tools" section (added in prior incorrect Story 5.5 commit)
    with corrected "Vibe-Trading Research Tools" section
  - Use correct OpenCode tool names (`vibe_trading_*`, snake_case, no slash prefix)
  - Cover only the 6 P0 tools shipped in this story
  - Add note: "Shadow Account loop and Swarm Teams ship in future stories (5.6, 5.7)"
  - **Explicit warning for `vibe_trading_patterns`**: "This tool reads OHLCV CSV files from a
    `run_dir`. You MUST call `vibe_trading_backtest` or `vibe_trading_market_data` first to
    populate the run directory — calling `vibe_trading_patterns` alone will return 'no data'."
  - **Explicit warning for `vibe_trading_factor_analysis`**: "15s timeout. Use fewer than 50
    symbols and narrower date ranges if you hit the timeout. Jobs are not automatically
    retryable — caller must resubmit with adjusted params."

### Task 7 — Tests (AC6)

- [ ] Extend `apps/api/src/__tests__/unit/vibe-trading-api-client.test.ts` (+10 tests)
- [ ] Extend `apps/api/src/__tests__/unit/vibe-trading-route.test.ts` (+20 tests)
- [ ] Create 6 OpenCode tool tests in `core/epsilon-master/opencode/tools/__tests__/`
- [ ] Create `Vibe-Trading/agent/tests/test_p0_tool_endpoints.py` (gated, +5 tests)
- [ ] `bunx tsc --noEmit` clean

### Task 8 — Documentation

- [ ] `core/epsilon-master/opencode/tools/README.md` — add "P0 Research Tools" section
- [ ] `apps/api/.env.example` — no changes (uses existing VIBE_TRADING_* vars)
- [ ] Update Story 5.1 Change Log: "Story 5.5 extends pattern with 6 read-only research tools"

## Dev Notes

### Reference: full Pydantic + Python endpoint bodies

`get_market_data_endpoint` body:

```python
@app.post("/tools/get_market_data", dependencies=[Depends(require_auth)])
async def get_market_data_endpoint(payload: MarketDataPayload):
    """Fetch OHLCV using VT loader registry.

    Mirrors mcp_server.py:get_market_data() but exposed as HTTP for Chainlens integration.
    Per-source loader resolution + auto-detect fallback are handled internally.
    """
    import re as _re
    from backtest.loaders.registry import get_loader_cls_with_fallback

    _SOURCE_PATTERNS = [
        (_re.compile(r"^\d{6}\.(SZ|SH|BJ)$", _re.I), "tushare"),
        (_re.compile(r"^[A-Z]+\.US$", _re.I), "yfinance"),
        (_re.compile(r"^\d{3,5}\.HK$", _re.I), "yfinance"),
        (_re.compile(r"^[A-Z]+-USDT$", _re.I), "okx"),
        (_re.compile(r"^[A-Z]+/USDT$", _re.I), "ccxt"),
    ]

    def _detect_source(code: str) -> str:
        for pattern, source in _SOURCE_PATTERNS:
            if pattern.match(code):
                return source
        return "tushare"

    results = {}
    if payload.source == "auto":
        groups: dict[str, list[str]] = {}
        for code in payload.codes:
            src = _detect_source(code)
            groups.setdefault(src, []).append(code)
    else:
        groups = {payload.source: list(payload.codes)}

    for src, src_codes in groups.items():
        try:
            loader_cls = get_loader_cls_with_fallback(src)
            loader = loader_cls()
            data_map = loader.fetch(src_codes, payload.start_date, payload.end_date, interval=payload.interval)
            for symbol, df in data_map.items():
                records = df.reset_index().to_dict(orient="records")
                for r in records:
                    for k, v in r.items():
                        if hasattr(v, "isoformat"):
                            r[k] = v.isoformat()
                        elif hasattr(v, "item"):
                            r[k] = v.item()
                results[symbol] = records
        except Exception as e:
            results[f"_error_{src}"] = str(e)

    return results
```

### OpenCode tool template (copy from `token_info.ts`)

`vibe_trading_market_data.ts`:

```ts
import { tool } from "@opencode-ai/plugin";
import { getEnv } from "./lib/get-env";
import { sanitizeUpstreamErr } from "./lib/sanitize";

const TIMEOUT_MS = 5000;

export default tool({
  description:
    "Fetch OHLCV market data across 6 data sources (auto-detect + fallback). " +
    "Use this BEFORE answering price/volume questions or running indicators. " +
    "Supported formats: AAPL.US, 0700.HK, BTC-USDT (OKX), BTC/USDT (CCXT), 000001.SZ (Tushare). " +
    "Returns array of {date, open, high, low, close, volume} per symbol. " +
    "Tip: use 1D interval for analysis, intraday (1m/15m/1H) only for short windows.",
  args: {
    codes: tool.schema.array(tool.schema.string()).describe(
      'Symbols. Examples: ["AAPL.US", "BTC-USDT"]. Mixed sources allowed when source="auto".',
    ),
    start_date: tool.schema.string().describe('ISO YYYY-MM-DD'),
    end_date: tool.schema.string().describe('ISO YYYY-MM-DD'),
    source: tool.schema.string().optional().describe(
      '"auto" | "yfinance" | "okx" | "tushare" | "akshare" | "ccxt". Default "auto".',
    ),
    interval: tool.schema.string().optional().describe('1m/5m/15m/30m/1H/4H/1D. Default "1D".'),
    session_id: tool.schema.string().optional(),
  },
  async execute(args, _context) {
    const epsilonToken = getEnv("EPSILON_TOKEN");
    const epsilonApiUrl = getEnv("EPSILON_API_URL");
    if (!epsilonToken) return JSON.stringify({ success: false, error: "EPSILON_TOKEN not set." });
    if (!epsilonApiUrl) return JSON.stringify({ success: false, error: "EPSILON_API_URL not set." });

    const baseUrl = epsilonApiUrl.replace(/\/+$/, "");
    const body = {
      codes: args.codes,
      start_date: args.start_date,
      end_date: args.end_date,
      source: args.source ?? "auto",
      interval: args.interval ?? "1D",
      session_id: args.session_id,
    };

    let response: Response;
    try {
      response = await fetch(`${baseUrl}/v1/router/vibe-trading/market-data`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${epsilonToken}`,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (e) {
      return JSON.stringify({ success: false, error: `Network error: ${String(e).slice(0, 200)}` });
    }

    if (response.status === 402) {
      return JSON.stringify({ success: false, error: "Insufficient credits." });
    }
    if (!response.ok) {
      const errBody = await response.text().catch(() => "(unreadable)");
      return JSON.stringify({ success: false, error: `Proxy error ${response.status}: ${sanitizeUpstreamErr(errBody)}` });
    }

    return await response.text();
  },
});
```

### Service layer extension reference

Add to `apps/api/src/router/services/vibe-trading.ts`:

```ts
export interface MarketDataPayload {
  codes: string[];
  start_date: string;
  end_date: string;
  source?: string;
  interval?: string;
}

export async function getMarketData(
  payload: MarketDataPayload,
  options: { signal?: AbortSignal } = {},
): Promise<Record<string, unknown>> {
  const signal = options.signal ?? AbortSignal.timeout(5_000);
  const url = `${vtBaseUrl()}/tools/get_market_data`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: buildHeaders(),
      body: JSON.stringify(payload),
      signal,
    });
  } catch (e) {
    throw new Error(`Vibe-Trading network error: ${e instanceof Error ? e.message : String(e)}`);
  }

  if (response.status === 401) throw new VibeTradingAuthError();
  if (response.status === 403) throw new VibeTradingForbiddenError();
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new VibeTradingDownstreamError(response.status, body);
  }
  return await response.json() as Record<string, unknown>;
}
```

### Route layer extension reference

Add to `apps/api/src/router/routes/vibe-trading.ts`:

```ts
const MarketDataSchema = z.object({
  codes: z.array(z.string().min(1).max(32)).min(1).max(50),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  source: z.enum(['auto', 'yfinance', 'okx', 'tushare', 'akshare', 'ccxt']).optional(),
  interval: z.string().regex(/^\d+[mhHD]|^1D$/).optional(),
  session_id: SESSION_ID,
});

vibeTrading.post('/market-data', async (c) => {
  const accountId = c.get('accountId');
  const body = await c.req.json().catch(() => null);
  if (body === null) throw new HTTPException(400, { message: 'Invalid JSON body' });
  const parsed = MarketDataSchema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw new HTTPException(400, { message: first ? `${first.path.join('.')} — ${first.message}` : 'Invalid body' });
  }
  const { session_id, ...payload } = parsed.data;

  const ua = (c.req.header('user-agent') ?? '').replace(/[\r\n\t]/g, ' ').slice(0, 80);
  console.log(`[TIER-BYPASS-SUSPECT] vibe_trading_market_data account=${accountId} codes=${payload.codes.length} ua="${ua}"`);

  const credit = await checkCredits(accountId);
  if (!credit.hasCredits) throw new HTTPException(402, { message: 'Insufficient credits' });

  let result;
  try {
    result = await getMarketData(payload);
  } catch (err) {
    return c.json({ success: false, error: err instanceof Error ? err.message : 'VT unavailable', cost: 0 }, 503);
  }

  const cost = getToolCost('vibe_trading_market_data', 0);
  try {
    await deductToolCredits(accountId, 'vibe_trading_market_data', 0, `Market data: ${payload.codes.join(',').slice(0, 60)}`, session_id);
  } catch (e) {
    console.warn(`[EPSILON][billing-failure] tool=vibe_trading_market_data account=${accountId} err=${e instanceof Error ? e.message : String(e)}`);
  }
  return c.json({ success: true, cost, data: result });
});
```

### Verified Assumptions (MCP Trio)

| Assumption | Verification | Result |
|---|---|---|
| VT FastAPI exposes only 7 of 22 MCP tools | grep `^@app\.` api_server.py | ✅ verified — 15 tools missing endpoints |
| MCP tool internals use `registry.execute(name, params)` | [mcp_server.py:166-172](Vibe-Trading/agent/mcp_server.py#L166) | ✅ pattern works for all tools |
| OpenCode tool naming = snake_case, no slash | [token_info.ts, deep_research.ts] | ✅ existing convention |
| Pattern `OpenCode tool → epsilon-api → VT` | 15 production tools | ✅ proven 15× |
| `combinedAuth` middleware accepts both epsilon_* + Supabase JWT | router/index.ts | ✅ |
| Existing 4 error classes cover all failure modes | services/vibe-trading.ts | ✅ |
| `factor_analysis` synchronous in VT registry | [mcp_server.py:167-172](Vibe-Trading/agent/mcp_server.py#L167) | ⚠️ may take 5-10s, set 15s timeout |
| `pattern_recognition` reads CSV from run_dir | [mcp_server.py:211-222](Vibe-Trading/agent/mcp_server.py#L211) | ⚠️ requires prior `backtest()` or `get_market_data` to write artifacts/ — tool description must warn LLM |

### Architecture Constraints

- **NFR8 (Atomic Credit Deduction)**: enforced via `deductToolCredits` await before response
- **NFR10 (Sandbox Isolation)**: sandbox only calls epsilon-api — egress whitelist NOT modified
- **Tier gate**: agent permission frontmatter primary; backend `[TIER-BYPASS-SUSPECT]` log audit
- **VT submodule patches**: ~225 dòng additive only — không xóa, không đụng Celery/auth/existing endpoints
- **No Python in sandbox**: VT MCP server NOT mounted in sandbox — preserves attack surface

### Source Tree Components to Touch

**NEW files:**
- `core/epsilon-master/opencode/tools/vibe_trading_list_skills.ts`
- `core/epsilon-master/opencode/tools/vibe_trading_load_skill.ts`
- `core/epsilon-master/opencode/tools/vibe_trading_market_data.ts`
- `core/epsilon-master/opencode/tools/vibe_trading_options.ts`
- `core/epsilon-master/opencode/tools/vibe_trading_patterns.ts`
- `core/epsilon-master/opencode/tools/vibe_trading_factor_analysis.ts`
- `core/epsilon-master/opencode/tools/__tests__/vibe_trading_p0_tools.test.ts` (or 6 files)
- `Vibe-Trading/agent/tests/test_p0_tool_endpoints.py`

**Modified files:**
- `Vibe-Trading/agent/api_server.py` — add 5 endpoints
- `apps/api/src/router/services/vibe-trading.ts` — add 5 fetch functions
- `apps/api/src/router/routes/vibe-trading.ts` — add 5 sub-routes
- `apps/api/src/config.ts` — add 6 TOOL_PRICING entries
- `apps/api/src/__tests__/unit/vibe-trading-api-client.test.ts` — extend
- `apps/api/src/__tests__/unit/vibe-trading-route.test.ts` — extend
- `core/epsilon-master/opencode/agents/chainlens-tier2.md` — permissions + system prompt
- `core/epsilon-master/opencode/agents/chainlens-tier1.md` — deny permissions
- `core/epsilon-master/opencode/tools/README.md` — docs

**NOT modified:**
- `core/init-scripts/95-egress-whitelist.sh` — sandbox egress unchanged
- `core/docker/Dockerfile` — no Python in sandbox
- `core/epsilon-master/opencode/opencode.jsonc` — no MCP server mount

### Testing Standards

- Bun test runner: `bun test`
- Backend integration: gated `RUN_INTEGRATION_TESTS=1`
- TypeScript: `bunx tsc --noEmit` no new errors
- Manual E2E: deploy → Tier 2 chat "what are 72 finance skills" → agent calls `vibe_trading_list_skills`

### Performance Budget

| Tool | Per-call target | Notes |
|---|---|---|
| `vibe_trading_list_skills` | <300ms | Local file scan |
| `vibe_trading_load_skill` | <500ms | Single file read |
| `vibe_trading_market_data` | <10s | Network fetch (730-day window may approach 10s) |
| `vibe_trading_options` | <200ms | Pure compute |
| `vibe_trading_patterns` | <2s | Vectorized compute |
| `vibe_trading_factor_analysis` | <15s | CPU-heavy, 100-symbol cross-section |

### Risk Register

| Risk | Mitigation |
|---|---|
| VT `registry.execute()` thrown exceptions not mapped to HTTP codes | Wrap in `try/except` returning `HTTPException(500, detail=str(e))` |
| `pattern_recognition` requires prior `run_dir` setup | Tool description warns LLM; future story can add a helper tool that runs backtest + patterns in one call |
| `factor_analysis` blocks event loop on 10s computation | VT FastAPI uses sync handler — acceptable for MVP. If degrades epsilon-api, move to threadpool |
| VT submodule upstream PR — if VT team rejects patches, we maintain local diff | Document patches at `Vibe-Trading/CHAINLENS_PATCHES.md`. Patches are additive — easy to rebase |

### References

- [Story 5.0](5-0-vibe-trading-platform-foundation.md) — egress + pool foundation
- [Story 5.1](5-1-vibe-trading-api-integration-in-sandbox.md) — `vibe_trading_backtest` reference pattern
- [VT MCP server](Vibe-Trading/agent/mcp_server.py) — tool signatures source of truth
- [VT FastAPI](Vibe-Trading/agent/api_server.py) — existing endpoint patterns
- [VT SKILL.md](Vibe-Trading/agent/SKILL.md) — capability inventory
- [`token_info.ts` template](core/epsilon-master/opencode/tools/token_info.ts) — OpenCode tool reference
- [Architecture review](2026-05-12 Winston: HTTP extension chosen over MCP mounting for NFR8/NFR10 compliance)
