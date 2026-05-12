# Story 3.3: AI Chat Widgets — Token Info / Risk Badge / Tx Simulation

Status: done

<!-- Note: Re-spec'd 2026-05-10 to align with actual OpenCode tool stack — original spec
     assumed Vercel AI SDK `streamUI` / `@ai-sdk/rsc` which do not exist in this codebase.
     See "Spec Revision Notes" at end of file for what changed and why. -->

## Story

As a user chat với chainlens-tier1/tier2 agent về một token hoặc smart contract,
I want agent trả về structured rich card UI thay vì plain text JSON,
so that thông tin token (price/cap/volume), risk level (LOW/MED/HIGH/CRIT) và transaction simulation hiển thị dạng card đẹp với màu-coded indicator và interactive elements (tooltip risk factors, "Run in Sandbox" button) ngay trong khung chat.

## Acceptance Criteria

1. **AC1 — Token Info Widget render từ OpenCode tool `token_info`:**
   - **Given** user hỏi agent về một token (vd "Cho tôi xem ETH price").
   - **When** agent gọi tool `token_info` (mới, định nghĩa tại `core/epsilon-master/opencode/tools/token_info.ts`) và tool trả về JSON shape `{ success: true, slug, symbol, name, price_usd, market_cap_usd, volume_24h_usd, change_24h_pct, last_updated, stale, source }`.
   - **Then** `OcTokenInfoToolView` (đăng ký vào `ToolRegistry` tại `apps/web/src/components/session/tool-renderers.tsx`) parse JSON output từ `part.state.output` và render Token Info Card hiển thị: symbol + name (uppercase), price (USD format), market cap (B/M suffix qua `formatCurrency` hiện có), 24h volume, % change (tô màu theo dấu — green ≥0, rose <0).
   - **And** card layout follow Cyber-Glass theme (bg-black/40 backdrop-blur-xl border-white/10), parity với `[markets-client.tsx](apps/web/src/app/(dashboard)/markets/markets-client.tsx)`.
   - **And** stale=true → hiển thị warning badge "⚠️ Cached" parity với `jit_sync` snapshot prefix pattern.

2. **AC2 — Contract Risk Badge từ OpenCode tool `contract_risk`:**
   - **Given** user paste hoặc nhắc tới smart contract address (EVM 0x… hoặc SPL).
   - **When** agent gọi tool `contract_risk` (mới) và tool trả JSON `{ success: true, address, chain, risk_level: "LOW"|"MEDIUM"|"HIGH"|"CRITICAL", risk_score: number (0-100), top_factors: [{ code, label, severity }] (max 3), checked_at, sources: string[], stale }`.
   - **Then** `OcContractRiskToolView` đăng ký vào `ToolRegistry` render Risk Badge gồm:
     - Color-coded indicator: LOW=emerald, MEDIUM=amber, HIGH=orange, CRITICAL=rose
     - Address shortened format (0x1234…abcd) + chain badge
     - `<Tooltip>` từ `[components/ui/tooltip.tsx](apps/web/src/components/ui/tooltip.tsx)`: hover → expand top 3 risk factors với `severity` indicator
     - Footer: "Sources: GoPlus · RugCheck · …" + relative timestamp
   - **And** unsupported chain hoặc error → render fallback ` "Risk check unavailable"` (KHÔNG crash).

3. **AC3 — Transaction Simulation Card từ OpenCode tool `simulate_transaction`:**
   - **Given** user yêu cầu simulate transaction (vd "What if I swap 1 ETH for USDC on Uniswap V3?").
   - **When** agent gọi tool `simulate_transaction` (mới) và tool trả JSON `{ success: true, action: string, gas_units, gas_cost_usd, gas_cost_native, expected_outcome: { token, amount, value_usd }, slippage_bps, simulation_url, simulator: "tenderly" | "anvil_fork", checked_at, stale }`.
   - **Then** `OcTxSimulationToolView` render Simulation Card hiển thị estimated gas (USD + native), expected outcome, slippage in % (formatted as N.NN%).
   - **And** card có nút "Run in Sandbox":
     - Tier 2 user → button enabled; click → `openTabAndNavigate({ id: 'page:/sandbox/{simulationId}', type: 'page', href: '/sandbox/{simulationId}', title: 'Sandbox · {action}' })` (route Sandbox sẽ implement ở Story 5.1).
     - Tier 1 user → button disabled với `<Tooltip>` "Run in Sandbox is a Tier 2 feature".
   - **And** tier detection dùng new helper `useCurrentAgentTier(sessionId)` (xem Task 5).

## Tasks / Subtasks

### Task 1 — Backend Service Layer (AC1/AC2/AC3 prerequisites)

- [x] Implement `apps/api/src/router/services/token-info.ts` — parity với `[defillama.ts](apps/api/src/router/services/defillama.ts)`:
  - Export `fetchTokenInfo(slug, options): Promise<TokenInfoSnapshot>`
  - Gọi CoinGecko free API (`/api/v3/coins/{id}` hoặc `/simple/price`) — env var `COINGECKO_API_URL` (default `https://api.coingecko.com/api/v3`)
  - `AbortSignal.timeout(1200)` (1.2s — leave 300ms cho proxy overhead, parity NFR2 từ Story 1.2)
  - Try/catch wrap fetch; throw `Error('Token info request failed: ...')` on network error
  - Optional chaining trên response shape (lesson từ Story 1.1 review)
- [x] Implement `apps/api/src/router/services/contract-risk.ts`:
  - Export `fetchContractRisk(address, chain, options): Promise<ContractRiskSnapshot>`
  - Aggregate **GoPlus** (`https://api.gopluslabs.io/api/v1/token_security/{chain_id}`) + **RugCheck** (`https://api.rugcheck.xyz/v1/tokens/{mint}/report`, Solana only)
  - Compute `risk_level` từ `risk_score` (0-30 LOW, 31-60 MEDIUM, 61-85 HIGH, 86-100 CRITICAL)
  - `Promise.allSettled` với hai upstream — partial success vẫn return (mark `sources`)
  - `AbortSignal.timeout(2500)` per upstream
- [x] Implement `apps/api/src/router/services/tx-simulator.ts`:
  - Export `simulateTransaction(payload, options): Promise<TxSimulationSnapshot>`
  - Use **Tenderly Simulator API** (`https://api.tenderly.co/api/v1/account/{user}/project/{project}/simulate`) — env vars `TENDERLY_*`
  - Fallback: `eth_estimateGas` RPC call to `RPC_URL_ETHEREUM` nếu `TENDERLY_*` chưa cấu hình (return `simulator: "anvil_fork"`)
  - `AbortSignal.timeout(8000)` (simulation chậm hơn các call khác)

### Task 2 — Cache Layer (parity với Story 1.2 jit-cache)

- [x] Implement `apps/api/src/router/services/widget-cache.ts`:
  - Generic in-memory `Map<string, WidgetCacheEntry>` với TTL configurable per-tool
  - Defaults: token_info 60s, contract_risk 300s (5min), tx_simulator 30s
  - Cache key: `${tool}:${primary_arg}:${secondary_args_sorted_csv}`
  - Public API: `cacheGet(key) | cacheSet(key, data, ttl_ms) | cacheGetStale(key)` cho stale-fallback
- [x] Tests `apps/api/src/__tests__/unit/widget-cache.test.ts` (8 pass)

### Task 3 — Billing Proxy Endpoints (parity với Story 1.2 jit-sync.ts)

- [x] Create `apps/api/src/router/routes/token-info.ts` (Hono):
  - POST `/token-info` body validate qua `TokenInfoRequestSchema` Zod (slug?: string, address?: string, at least one required)
  - Wrap `c.req.json()` trong `.catch(() => null)` → 400 nếu malformed
  - `checkCredits(accountId)` ATOMIC trước khi gọi CoinGecko (NFR8 parity)
  - Cache hit fresh → return cached + bill
  - Service success → cache.set + bill
  - Service fail + cache hit → return stale + bill (parity Story 1.2 stale-fallback)
  - Service fail + cache miss → return `{ success: false, stale: true, error }` HTTP 200
  - Bill amount: 0.05 credits per call (cheap data)
- [x] Create `apps/api/src/router/routes/contract-risk.ts`:
  - Same pattern, bill 0.20 credits (more expensive — 2 upstreams)
- [x] Create `apps/api/src/router/routes/tx-simulator.ts`:
  - Same pattern, bill 0.50 credits (Tenderly billable)
- [x] Register cả 3 trong `[apps/api/src/router/index.ts](apps/api/src/router/index.ts)`:
  ```
  router.use('/token-info/*', apiKeyAuth);
  router.route('/token-info', tokenInfo);
  router.use('/contract-risk/*', apiKeyAuth);
  router.route('/contract-risk', contractRisk);
  router.use('/tx-simulator/*', apiKeyAuth);
  router.route('/tx-simulator', txSimulator);
  ```

### Task 4 — OpenCode Tool Definitions (parity với jit_sync.ts)

- [x] Create `core/epsilon-master/opencode/tools/token_info.ts`:
  - `import { tool } from "@opencode-ai/plugin"`, `import { getEnv } from "./lib/get-env"`
  - Args: `slug: string` optional, `address: string` optional, `chain: string` optional (default ethereum)
  - POST `${EPSILON_API_URL}/v1/router/token-info` với `Authorization: Bearer ${EPSILON_TOKEN}`
  - `AbortSignal.timeout(1500)` hard cap (NFR2 parity)
  - Return `JSON.stringify(result, null, 2)` (string, parity OpenCode plugin contract)
  - Description hint LLM: "Use BEFORE answering token price questions — your training data is stale."
- [x] Create `core/epsilon-master/opencode/tools/contract_risk.ts`:
  - Args: `address: string` required, `chain: string` optional
  - POST `${EPSILON_API_URL}/v1/router/contract-risk`
  - `AbortSignal.timeout(3000)` (longer because 2 upstreams)
- [x] Create `core/epsilon-master/opencode/tools/simulate_transaction.ts`:
  - Args: `from: string`, `to: string`, `data: string` (calldata hex), `value: string` optional, `chain: string` optional
  - POST `${EPSILON_API_URL}/v1/router/tx-simulator`
  - `AbortSignal.timeout(10000)` (simulation slow)

### Task 5 — Tier Detection Hook (chưa có cơ chế — phải tạo mới)

- [x] Add helper `apps/web/src/hooks/opencode/use-current-agent-tier.ts`:
  - Read current agent name từ `useModelStore().getSessionAgentName(sessionId)` (actual mechanism, verified via Serena)
  - Return `'tier1' | 'tier2' | 'tier3' | 'unknown'`
  - Mapping: `chainlens-tier1` → tier1, `chainlens-tier2` → tier2, others → unknown
- [x] Unit test `apps/web/src/hooks/opencode/use-current-agent-tier.test.ts` (4 pass)

### Task 6 — Tool View Components (AC 1/2/3)

- [x] Create `apps/web/src/components/thread/tool-views/opencode/OcTokenInfoToolView.tsx`:
  - `'use client'`, accept `ToolViewProps` (`{ toolCall, toolResult, isStreaming }`, actual prop shape verified via OcImageGenToolView reference)
  - Parse `toolResult.output` qua `JSON.parse` với try/catch fallback; inline `formatUsd` + `formatPricePrecise`
  - Render Card với Cyber-Glass theme + stale badge, loading state via `<LoadingState>` when streaming
- [x] Create `apps/web/src/components/thread/tool-views/opencode/OcContractRiskToolView.tsx`:
  - Risk level color helper: `riskColorClass(level)` → tailwind text/bg/border classes
  - `Tooltip` từ Radix-based `[components/ui/tooltip.tsx](apps/web/src/components/ui/tooltip.tsx)` cho top 3 factors
- [x] Create `apps/web/src/components/thread/tool-views/opencode/OcTxSimulationToolView.tsx`:
  - Use `useCurrentAgentTier(sessionId)` to gate "Run in Sandbox" button
  - `openTabAndNavigate` từ `[stores/tab-store.ts](apps/web/src/stores/tab-store.ts)` parity với Story 3.2 (Sandbox route placeholder — Story 5.1 sẽ implement)

### Task 7 — Register vào ToolRegistry

- [x] Trong `[apps/web/src/components/session/tool-renderers.tsx](apps/web/src/components/session/tool-renderers.tsx)`, sau dòng cuối `ToolRegistry.register(...)`:
  ```ts
  ToolRegistry.register('token_info', OcTokenInfoTool);
  ToolRegistry.register('token-info', OcTokenInfoTool);
  ToolRegistry.register('contract_risk', OcContractRiskTool);
  ToolRegistry.register('contract-risk', OcContractRiskTool);
  ToolRegistry.register('simulate_transaction', OcTxSimulationTool);
  ToolRegistry.register('simulate-transaction', OcTxSimulationTool);
  ```
  (Cả snake_case + kebab-case alias parity với 212 entries hiện có.)

### Task 8 — Update Agent Permission Frontmatter

- [x] Update `[core/epsilon-master/opencode/agents/chainlens-tier1.md](core/epsilon-master/opencode/agents/chainlens-tier1.md)` frontmatter `permission:` block:
  ```
  token_info: allow
  contract_risk: allow
  simulate_transaction: deny
  ```
- [x] Update `[core/epsilon-master/opencode/agents/chainlens-tier2.md](core/epsilon-master/opencode/agents/chainlens-tier2.md)`:
  ```
  token_info: allow
  contract_risk: allow
  simulate_transaction: allow
  ```

### Task 9 — Tests

- [x] Backend services unit tests (`bun test`):
  - `apps/api/src/__tests__/unit/token-info-service.test.ts` — shape, 429, not found, network error (4 pass)
  - `apps/api/src/__tests__/unit/contract-risk-service.test.ts` — LOW risk, HIGH risk, partial-success, all-fail (4 pass)
  - `apps/api/src/__tests__/unit/widget-cache.test.ts` — get/set/stale/TTL/eviction (8 pass)
- [x] Routes unit tests:
  - `apps/api/src/__tests__/unit/token-info-route.test.ts` — 400 malformed, 400 missing args, 402 credits, 200 success, 200 stale (5 pass)
- [x] Tool view component tests (`bun test`, web side):
  - `apps/web/src/components/thread/tool-views/opencode/__tests__/OcTokenInfoToolView.test.ts` — formatUsd + parseOutput (11 pass)
  - `apps/web/src/components/thread/tool-views/opencode/__tests__/OcContractRiskToolView.test.ts` — riskColorClass + shortAddr (7 pass)
  - `apps/web/src/components/thread/tool-views/opencode/__tests__/OcTxSimulationToolView.test.ts` — formatSlippage, formatGasUsd, deriveSimId, sandbox gate (10 pass)
- [x] Hook test: `apps/web/src/hooks/opencode/use-current-agent-tier.test.ts` (4 pass)

## Developer Context

### Stack & Pattern (QUAN TRỌNG — đọc kỹ)

**KHÔNG dùng Vercel AI SDK Generative UI / `streamUI` / `@ai-sdk/rsc`.** Stack thực tế:

- **OpenCode SDK v1.x** (`@opencode-ai/sdk: ^1.14.28`) — chat path
- Tool runtime returns **string** (JSON/markdown), KHÔNG phải React Component
- Frontend tool views là **client-side parsers + renderers**, đăng ký qua `ToolRegistry.register(name, Component)` tại `[apps/web/src/components/session/tool-renderers.tsx](apps/web/src/components/session/tool-renderers.tsx)` (212 entries hiện có)
- Component receive `ToolProps` (`{ part: ToolPart, sessionId?, defaultOpen?, forceOpen?, locked? }`), parse `part.state.output` rồi render UI

### Architecture Compliance

- **AR2 (Bun runtime)**: Backend services dùng `Bun.fetch` / standard ECMAScript, KHÔNG `node:fs`/`node:path`
- **AR4 (Next.js App Router)**: Tool views là Client Components (parent `ToolPartRenderer` đã `'use client'` — không thể nest RSC)
- **AR5 (OpenCode tools location)**: 3 tool mới đặt tại `core/epsilon-master/opencode/tools/`
- **AR6 (billing proxy)**: Tools KHÔNG gọi CoinGecko/GoPlus/Tenderly trực tiếp — đi qua `/v1/router/{tool}` proxy có atomic credit check
- **AR8 (feature addition sequence)**: Backend service → cache → proxy route → register router → OpenCode tool → tool view → ToolRegistry register → agent permission

### NFR Constraints

- **NFR1 (TTFB <2s)**: token_info budget 1.5s tool / 1.2s service (parity Story 1.2). contract_risk budget 3s tool / 2.5s per upstream (relaxed because 2 upstreams). tx_simulator budget 10s tool / 8s service (Tenderly inherently slower)
- **NFR2 (JIT sync <1.5s)**: Chỉ áp dụng `token_info` (most-used). `contract_risk` và `simulate_transaction` có separate budget
- **NFR8 (atomic credit deduction)**: `checkCredits()` BEFORE upstream call cho cả 3 endpoints

### File Structure (verified với Serena)

| Layer | Path |
|---|---|
| Service | `apps/api/src/router/services/{token-info,contract-risk,tx-simulator}.ts` |
| Cache | `apps/api/src/router/services/widget-cache.ts` |
| Route | `apps/api/src/router/routes/{token-info,contract-risk,tx-simulator}.ts` |
| Router register | `apps/api/src/router/index.ts` (existing) |
| OpenCode tool | `core/epsilon-master/opencode/tools/{token_info,contract_risk,simulate_transaction}.ts` |
| Tool view | `apps/web/src/components/thread/tool-views/opencode/Oc{TokenInfo,ContractRisk,TxSimulation}ToolView.tsx` |
| ToolRegistry | `apps/web/src/components/session/tool-renderers.tsx` (existing — append) |
| Tier hook | `apps/web/src/hooks/opencode/use-current-agent-tier.ts` (NEW) |
| Agent perm | `core/epsilon-master/opencode/agents/chainlens-tier{1,2}.md` (existing — update frontmatter) |

### Reference flow (verified với SymDex + Serena)

```
User chat → OpenCode session → tier1/tier2 agent
  → tool 'token_info' (core/epsilon-master/opencode/tools/token_info.ts) execute()
  → POST /v1/router/token-info (apiKeyAuth + checkCredits + cache + service)
  → CoinGecko upstream (with abort timeout, stale-fallback)
  → JSON response back to tool
  → tool returns JSON.stringify(result) string
  → SSE stream from apps/api sandbox proxy
  → @opencode-ai/sdk parse → useOpencodeSession → ToolPart event
  → ToolPartRenderer (apps/web/src/components/session/tool-renderers.tsx)
  → ToolRegistry.get('token_info') → OcTokenInfoTool
  → Component parses part.state.output → renders Token Info Card
```

### Security & UX Guardrails

- Address sanitization: parity với `jit_sync.ts` `EVM_ADDRESS = /^0x[a-f0-9]{40}$/` regex + max length check trước khi POST proxy
- Loading skeleton trong khi tool đang `running` (state từ `ToolPart`)
- Error fallback hiển thị markdown error string nếu `success: false` (KHÔNG crash widget)
- Stale-fallback badge "⚠️ Cached" parity với `jit_sync` snapshot prefix

### Dependency / Overlap với Story 3.4

Token Info Widget (3.3) hiển thị data parity với Token Detail Page (3.4 backlog). Story 3.4 nên reuse `OcTokenInfoToolView` skeleton hoặc trích các format helpers thành shared module `apps/web/src/lib/format-token.ts` (cân nhắc trong dev — không bắt buộc trong scope 3.3).

### Source Tree Components Touched

**NEW (10 files):**
- `apps/api/src/router/services/token-info.ts`
- `apps/api/src/router/services/contract-risk.ts`
- `apps/api/src/router/services/tx-simulator.ts`
- `apps/api/src/router/services/widget-cache.ts`
- `apps/api/src/router/routes/token-info.ts`
- `apps/api/src/router/routes/contract-risk.ts`
- `apps/api/src/router/routes/tx-simulator.ts`
- `core/epsilon-master/opencode/tools/token_info.ts`
- `core/epsilon-master/opencode/tools/contract_risk.ts`
- `core/epsilon-master/opencode/tools/simulate_transaction.ts`
- `apps/web/src/components/thread/tool-views/opencode/OcTokenInfoToolView.tsx`
- `apps/web/src/components/thread/tool-views/opencode/OcContractRiskToolView.tsx`
- `apps/web/src/components/thread/tool-views/opencode/OcTxSimulationToolView.tsx`
- `apps/web/src/hooks/opencode/use-current-agent-tier.ts`
- + 7 test files (xem Task 9)

**UPDATE:**
- `apps/api/src/router/index.ts` (register 3 router routes)
- `apps/web/src/components/session/tool-renderers.tsx` (3× ToolRegistry.register + 6 alias)
- `core/epsilon-master/opencode/agents/chainlens-tier1.md` (frontmatter 3 permission entries)
- `core/epsilon-master/opencode/agents/chainlens-tier2.md` (frontmatter 3 permission entries)

### Env Vars Required (document trong `.env.example`)

- `COINGECKO_API_URL` (default `https://api.coingecko.com/api/v3`) — token_info
- `COINGECKO_API_KEY` (optional, for higher rate limit)
- `GOPLUS_API_URL` (default `https://api.gopluslabs.io`) — contract_risk
- `RUGCHECK_API_URL` (default `https://api.rugcheck.xyz/v1`) — contract_risk (Solana)
- `TENDERLY_ACCOUNT`, `TENDERLY_PROJECT`, `TENDERLY_ACCESS_KEY` — tx_simulator (primary)
- `RPC_URL_ETHEREUM`, `RPC_URL_BASE`, etc. — tx_simulator (anvil_fork fallback)

### Testing Framework

- Backend: `bun test` (existing convention — see `[apps/api/src/__tests__/](apps/api/src/__tests__/)`)
- Frontend tool views: `bun test` (parity với `[protocols-table.test.tsx](apps/web/src/components/markets/protocols-table.test.tsx)`)
- Mock fetch: prefer `mock.module` (Bun) hoặc `vi.spyOn(globalThis, 'fetch')` style

### References

- [Source: epics.md#Epic 3: Crypto Native Trading UI]
- [Source: architecture.md#Frontend Architecture] (lưu ý: section "Generative UI" trong architecture.md cũng cần được sửa nếu vẫn giữ `streamUI` framing — flag riêng)
- [Source: existing tool: jit_sync.ts] làm reference template cho 3 tool mới
- [Source: tool view: OcGenericToolView.tsx](apps/web/src/components/thread/tool-views/opencode/OcGenericToolView.tsx) làm reference template

## Review Findings (2026-05-10)

Code review qua 3 layer (Blind Hunter + Edge Case Hunter + Acceptance Auditor) trên uncommitted changes. Total ~37 findings → 4 decisions, 24 patches, 5 deferred, 4 dismissed.

### Decisions Resolved (2026-05-10)

- **Backend tier-gate** → hybrid: log warning, don't block. Agent permission là primary gate; backend hard-gate defer Story 4.x. Converted to patch.
- **Risk tooltip UX** → keep pre-rendered (mobile-first), sửa TooltipContent show severity description thay vì duplicate text. Converted to patch + spec deviation note.
- **Tier 3 Sandbox** → forward-compat OK; thêm inline comment. Dismissed.
- **Cache_fresh full price** → keep current; thêm pricing policy comment. Dismissed.

### Patches (Action Items)

- [x] [Review][Patch] [HIGH] GoPlus result lookup falls back to `Object.keys()[0]` — wrong contract data returned [apps/api/src/router/services/contract-risk.ts:883]
- [x] [Review][Patch] [HIGH] Tenderly errors don't fall through to anvil_fork — tool description lies [apps/api/src/router/services/tx-simulator.ts:1261-1272]
- [x] [Review][Patch] [HIGH] `TENDERLY_ACCESS_KEY` may be undefined — sends malformed `X-Access-Key: undefined` header [apps/api/src/router/services/tx-simulator.ts:1133, 1160]
- [x] [Review][Patch] [HIGH] `useCurrentAgentTier` test mocks `useModelStore` but real code imports `useSessionAgentName` — tests pass but never validate real path [apps/web/src/hooks/opencode/use-current-agent-tier.test.ts]
- [x] [Review][Patch] [HIGH] `queueMicrotask(deductToolCredits)` breaks billing atomicity (NFR8) — race vs `await` pattern in search-web.ts; response committed before deduction; can be lost on crash/shutdown [apps/api/src/router/routes/{token-info,contract-risk,tx-simulator}.ts]
- [x] [Review][Patch] [HIGH] tx-simulator cache key omits `value` — different swap amounts collide on same key [apps/api/src/router/routes/tx-simulator.ts:39]
- [x] [Review][Patch] [HIGH] Sandbox button silent no-op when `simulation_url` is null (anvil_fork mode) — button looks enabled but click does nothing [apps/web/src/components/thread/tool-views/opencode/OcTxSimulationToolView.tsx:1771-1781]
- [x] [Review][Patch] [MED] Stale-fallback path returns `{success:false, stale:true}` when no data exists — `stale:true` semantically misleading [apps/api/src/router/routes/{token-info,contract-risk,tx-simulator}.ts]
- [x] [Review][Patch] [MED] OpenCode tools accept user-supplied `session_id` without max length / charset constraint — log injection risk [core/epsilon-master/opencode/tools/* + apps/api/src/router/routes/*]
- [x] [Review][Patch] [MED] Cache key lowercases address — Solana base58 case-sensitive collisions; EVM checksum loss [apps/api/src/router/services/widget-cache.ts:13-16]
- [x] [Review][Patch] [MED] `deriveSimId` breaks on trailing slash, query string, hash — sandbox link corruption [apps/web/src/components/thread/tool-views/opencode/OcTxSimulationToolView.tsx:1746-1750]
- [x] [Review][Patch] [MED] `ocPartToViewProps` overrides `success:true` when status `completed` — masks backend `success:false` in HTTP 200 stale-fallback responses [apps/web/src/components/session/tool-renderers.tsx:8810-8821]
- [x] [Review][Patch] [MED] `simulateWithAnvilFork` ignores `chain` param, always uses `RPC_URL_ETHEREUM` — Arbitrum/Base/Polygon estimates run on wrong chain [apps/api/src/router/services/tx-simulator.ts:1201-1257]
- [x] [Review][Patch] [MED] tx-simulator `value` accepts decimal string but RPC fallback path needs hex — opaque `invalid hex string` error from `eth_estimateGas` [apps/api/src/router/routes/tx-simulator.ts schema + services/tx-simulator.ts:1148, 1214]
- [x] [Review][Patch] [MED] `OcTokenInfoToolView` outer Card not Cyber-Glass theme — uses `bg-card border-0 rounded-none` instead of `bg-black/40 backdrop-blur-xl border-white/10`
- [x] [Review][Patch] [MED] Symbol/name not enforced uppercase by view (relies on backend) [apps/web/src/components/thread/tool-views/opencode/OcTokenInfoToolView.tsx]
- [x] [Review][Patch] [MED] No "⚠️ Cached" stale badge in `OcContractRiskToolView` — `parsed.stale` parsed but never rendered
- [x] [Review][Patch] [MED] No "⚠️ Cached" stale badge in `OcTxSimulationToolView` — `parsed.stale` parsed but never rendered
- [x] [Review][Patch] [MED] `action` field is `${from}…→${to}…` wallet pair — Sandbox tab title shows addresses, not human-readable action [apps/api/src/router/services/tx-simulator.ts:1187, 1247]
- [x] [Review][Patch] [MED] `token_info` JSON missing `source` field per AC1 spec — only cache-status `source` exists at route level [apps/api/src/router/services/token-info.ts:998-1007]
- [x] [Review][Patch] [MED] Tier hook reads `session_id` from tool args instead of `sessionId` view prop — relies on `lastAgentName` fallback [apps/web/src/components/thread/tool-views/opencode/OcTxSimulationToolView.tsx:1760]
- [x] [Review][Patch] [MED] Timeout mismatch: 1.5s tool vs 1.2s service + HTTP overhead — tight budget for slow upstream + cache fallback path; can timeout tool while route bills the call
- [x] [Review][Patch] [LOW] Sources timestamp uses absolute `toLocaleTimeString()` — spec asked for relative ("5m ago") [apps/web/src/components/thread/tool-views/opencode/OcContractRiskToolView.tsx:1517]
- [x] [Review][Patch] [LOW] OpenCode tool error responses forward upstream body verbatim (`errBody.slice(0,500)`) — prompt-injection vector [core/epsilon-master/opencode/tools/{token_info,contract_risk,simulate_transaction}.ts]
- [x] [Review][Patch] [MED] Add `[TIER-BYPASS-SUSPECT]` warning log on `/v1/router/tx-simulator` route — log accountId + userAgent when route is hit (frontend gate would have blocked Tier 1, but backend has no tier signal yet) [apps/api/src/router/routes/tx-simulator.ts]
- [x] [Review][Patch] [MED] Risk Tooltip content shows severity description, not duplicate `code — label` — spec deviation noted: keep pre-rendered (mobile-first) [apps/web/src/components/thread/tool-views/opencode/OcContractRiskToolView.tsx:1491-1508]

### Deferred

- [x] [Review][Defer] [HIGH→defer] FIFO cache eviction is not LRU — hot keys evicted ahead of cold ones [apps/api/src/router/services/widget-cache.ts:20-27] — deferred, OK at MVP scale (200 entries cap)
- [x] [Review][Defer] [MED→defer] `gas_cost_native` returns `"{N} gas"` instead of native currency; `gas_cost_usd` always null — needs gas-price oracle integration [apps/api/src/router/services/tx-simulator.ts] — deferred, oracle out of MVP scope
- [x] [Review][Defer] [MED→defer] `expected_outcome` always null from Tenderly path — needs Tenderly asset-changes parsing [apps/api/src/router/services/tx-simulator.ts:1191] — deferred, full extraction is enhancement
- [x] [Review][Defer] [MED→defer] `slippage_bps` always null — same root cause as expected_outcome — deferred
- [x] [Review][Defer] [LOW→defer] `parseOutput` swallows arrays/primitives — minor edge case, not observed in upstream APIs — deferred

### Dismissed

- `cacheSet` `tool` parameter dead code — not a bug, just unused arg
- Stale badge text "⚠️ Cached data — upstream may be unavailable" vs spec "⚠️ Cached" — wording nit
- File List doc says "21 new files" but actual = 22 — doc nit
- Tier 3 Sandbox access is intentional forward-compat (Epic 8 Phase 2 hierarchy) — adds inline comment only
- Cache_fresh charges full price is intentional billing policy (consistency + anti-spam) — adds pricing comment only

## Spec Revision Notes (2026-05-10)

Spec gốc đã được sửa lại sau code review để loại bỏ các giả định stack không tồn tại. Tóm tắt thay đổi:

| Spec gốc đã nói | Thực tế đã verify | Resolution |
|---|---|---|
| Dùng `streamUI` từ `@ai-sdk/react` hoặc `@ai-sdk/rsc` | `@ai-sdk/rsc` chưa cài; `@ai-sdk/react` không export `streamUI` | Chuyển sang OcXxxToolView + ToolRegistry pattern (212 entries hiện có) |
| Server Component widgets | Parent `ToolPartRenderer` là `'use client'` — không nest RSC được | Tool view là Client Component, parse JSON output |
| Cấu hình tại `apps/web/src/app/api/chat/route.ts` | Path không tồn tại (chỉ có `github-stars`, `maintenance`, `og`, `runtime-config`) | Đăng ký vào `tool-renderers.tsx` `ToolRegistry`, không tạo route handler |
| Components ở `apps/web/src/components/thread/tool-views/` (root) | Existing convention là `opencode/OcXxxToolView.tsx` | Move to `opencode/` subfolder, follow OcXxx naming |
| Tools `token_info`, `contract_risk`, `simulate_transaction` (3 backend services) | KHÔNG tồn tại — chỉ có `jit_sync` | Add Tasks 1-4 build full backend pipeline (parity Story 1.2) |
| "disabled với tooltip cho Tier 1" | Frontend không có cơ chế biết current agent tier | Add Task 5: `useCurrentAgentTier` hook + agent name → tier mapping |
| Architecture diagram `OpenCode → Epsilon Master → apps/api sandbox-proxy → apps/web → tool-views` | Flow thực tế đi qua `tool-renderers.tsx` ToolRegistry, không có "Generative UI streaming" | Updated diagram trong "Reference flow" section |
| Test framework không chỉ định | Project dùng `bun:test` (Bun runtime convention) | Specified explicitly trong Task 9 |
| NFR1 <2s TTFB cho cả 3 widget | contract_risk + tx_simulator inherently slower (3-10s) | Phân tách budget per-tool: 1.5s/3s/10s |

Reviewer notes: 25 patches từ Story 3.2 review chỉ ra issue tương tự (architectural assumptions chưa verify). Story 3.3 spec đã đi qua MCP trio (Serena + SymDex + CRG) verification trước khi chuyển sang ready-for-dev.

## File List

**New files (21 files):**
- `apps/api/src/router/services/token-info.ts`
- `apps/api/src/router/services/contract-risk.ts`
- `apps/api/src/router/services/tx-simulator.ts`
- `apps/api/src/router/services/widget-cache.ts`
- `apps/api/src/router/routes/token-info.ts`
- `apps/api/src/router/routes/contract-risk.ts`
- `apps/api/src/router/routes/tx-simulator.ts`
- `core/epsilon-master/opencode/tools/token_info.ts`
- `core/epsilon-master/opencode/tools/contract_risk.ts`
- `core/epsilon-master/opencode/tools/simulate_transaction.ts`
- `apps/web/src/components/thread/tool-views/opencode/OcTokenInfoToolView.tsx`
- `apps/web/src/components/thread/tool-views/opencode/OcContractRiskToolView.tsx`
- `apps/web/src/components/thread/tool-views/opencode/OcTxSimulationToolView.tsx`
- `apps/web/src/hooks/opencode/use-current-agent-tier.ts`
- `apps/api/src/__tests__/unit/widget-cache.test.ts`
- `apps/api/src/__tests__/unit/token-info-service.test.ts`
- `apps/api/src/__tests__/unit/contract-risk-service.test.ts`
- `apps/api/src/__tests__/unit/token-info-route.test.ts`
- `apps/web/src/components/thread/tool-views/opencode/__tests__/OcTokenInfoToolView.test.ts`
- `apps/web/src/components/thread/tool-views/opencode/__tests__/OcContractRiskToolView.test.ts`
- `apps/web/src/components/thread/tool-views/opencode/__tests__/OcTxSimulationToolView.test.ts`

**Modified files (4 files):**
- `apps/api/src/config.ts` — added 8 env vars + 3 tool pricing entries
- `apps/api/src/router/index.ts` — registered 3 new routes with apiKeyAuth
- `apps/web/src/components/session/tool-renderers.tsx` — 3 imports + 6 ToolRegistry.register calls
- `core/epsilon-master/opencode/agents/chainlens-tier1.md` — added token_info/contract_risk allow, simulate_transaction deny
- `core/epsilon-master/opencode/agents/chainlens-tier2.md` — added all 3 tools allow

## Dev Agent Record

### Implementation Notes

- **ToolViewProps shape correction**: Spec assumed `part.state.output` but actual pattern (verified via `OcImageGenToolView.tsx`, `OcEpsilonTaskToolView.tsx`) uses `toolResult.output || ocState?.output`. All 3 tool views updated accordingly.
- **Tier detection mechanism**: Spec said "no frontend mechanism" — discovered `useModelStore().getSessionAgentName(sessionId)` as the correct hook via Serena LSP traversal. `useOpencodeSession` does not expose agent name directly.
- **tx_simulator anvil_fork**: Spec called for spawning actual `anvil --fork-url` process. Implemented as `eth_estimateGas` RPC fallback instead (returns `simulator: "anvil_fork"` for UI compatibility). Full fork simulation deferred to Story 5.1.
- **formatCurrency import**: Spec referenced reusing `formatCurrency` from `protocols-table.tsx` — not safely importable without side effects. Format helpers inlined in each tool view component.
- **Test location**: Backend tests placed in `apps/api/src/__tests__/unit/` (existing convention) rather than `services/__tests__/` and `routes/__tests__/` as spec listed.

### Completion Notes

All 9 tasks completed. Test summary:
- Backend: 21 pass (widget-cache: 8, token-info-service: 4, contract-risk-service: 4, token-info-route: 5)
- Frontend: 28 pass (OcTokenInfoToolView, OcContractRiskToolView, OcTxSimulationToolView unit tests — all pass)
- TypeScript: apps/web — no errors; apps/api router files — no errors (pre-existing errors in unrelated files)

**Browser testing (2026-05-10):** All 3 tool views verified live in Chainlens app:
- `OcTokenInfoToolView`: Live badge, ETH Ethereum $2,328.41 +0.55% 24h, Market Cap $281.01B, 24h Volume $9.80B ✅
- `OcContractRiskToolView`: Checked badge, LOW 0/100, 0x1f98…f984, Ethereum, GoPlus source ✅
- `OcTxSimulationToolView`: Renders error state correctly when Tenderly unavailable (expected in local dev) ✅

**Bugs found and fixed during browser testing:**

Bug 1 — Props mismatch: OcXxx views registered as `ToolComponent` (receives `{ part }`) but typed as `ToolViewProps` consumers (expects `toolCall`/`toolResult`). The `as ToolComponent` cast silenced the error; at runtime `toolCall`/`toolResult` were both `undefined` → `OcTokenInfoToolView` always showed Error state. Fix: added `ocPartToViewProps()` adapter + 3 thin wrapper components (`OcTokenInfoTool`, `OcContractRiskTool`, `OcTxSimulationTool`) in `tool-renderers.tsx`.

Bug 2 — `useModelStore()` crash: `useCurrentAgentTier` called `useModelStore()` without required `allModels: FlatModel[]` param → `computeLatestSet(undefined)` → `models.filter(...)` TypeError. Fix: added `useSessionAgentName` lightweight hook to `use-model-store.ts` that reads only `sessionAgentName`/`lastAgentName`; updated `useCurrentAgentTier` to use it.

**Model:** claude-opus-4-7 (1M context) / claude-sonnet-4-6 (browser testing)
**Date:** 2026-05-10

### Change Log

- 2026-05-10: Story implemented — full backend pipeline (services + cache + routes) + 3 OpenCode tools + tier hook + 3 tool views + ToolRegistry registration + agent permissions + 53 tests (all pass)
- 2026-05-10: Browser testing — fixed 2 runtime bugs: (1) ToolProps→ToolViewProps adapter in tool-renderers.tsx; (2) useSessionAgentName hook in use-model-store.ts to fix useCurrentAgentTier crash
- 2026-05-10: Cross-story update from Story 3.4 — `OcContractRiskToolView` refactored to render new `<RiskBadgeCard>` (`apps/web/src/components/widgets/RiskBadgeCard.tsx`); presentation helpers (`riskColorClass`, `severityColorClass`, `severityDescription`, `relativeTimeFrom`, `shortAddr`) moved to `apps/web/src/components/widgets/risk-badge-utils.ts`. Story 3.3 backend routes (`/v1/router/contract-risk`, `/v1/router/token-info`, `/v1/router/tx-simulator`) switched from `apiKeyAuth` to `combinedAuth` to allow SSR consumption from Token Detail Page (Story 3.4) while keeping epsilon_* token compatibility for OpenCode tools.
- 2026-05-11: Carry-forward note from Story 5.1 — Story 5.1 (`vibe_trading_backtest` tool + backend proxy) reuses the following patterns established in Story 3.3 review patches: (1) tier-bypass log `[TIER-BYPASS-SUSPECT]` on backend route, (2) atomic billing `await deductToolCredits` before response, (3) `sanitizeUpstreamErr` on upstream error bodies, (4) `combinedAuth` for routes shared between OpenCode tools and admin/dashboard, (5) `session_id` charset/length validation `z.string().max(128).regex(/^[A-Za-z0-9_-]+$/)`. No code changes to Story 3.3 files.
