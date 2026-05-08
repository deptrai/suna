# Story 1.2: JIT Crypto Data Snapshot

Status: ready-for-dev

Epic: 1 — AI Crypto Research Tools
Created: 2026-05-09
FRs: FR8, FR19
NFRs: NFR1 (TTFB <2s), NFR2 (JIT sync <1.5s), NFR8 (atomic credit deduction)
ARs: AR1 (brownfield), AR2 (Bun runtime), AR5 (AI tools location), AR6 (billing proxy), AR8 (feature addition sequence)

## Story

As a Epsilon agent xử lý crypto query,
I want tool tự động fetch real-time snapshot từ DeFiLlama trong vòng 1.5 giây trước khi gọi LLM,
so that LLM nhận được TVL/APY/protocol metrics mới nhất thay vì training data lỗi thời, và agent không bị block khi DeFiLlama down.

## Acceptance Criteria

1. **AC1 — OpenCode tool tồn tại theo đúng pattern Story 1.1:**
   - File `core/epsilon-master/opencode/tools/jit_sync.ts` được tạo dùng `tool()` từ `@opencode-ai/plugin`.
   - Tool dùng `getEnv()` từ `./lib/get-env` để load `EPSILON_TOKEN` và `EPSILON_API_URL`.
   - Tool POST đến billing proxy `${EPSILON_API_URL}/v1/router/jit-sync` với `Authorization: Bearer ${EPSILON_TOKEN}` (KHÔNG gọi DeFiLlama trực tiếp).
   - Args schema: `protocol_slug: string` (DeFiLlama slug, e.g. `"uniswap"`), optional `chain: string`, optional `metrics: string[]` (subset of `["tvl","apy","volume","fees"]`).

2. **AC2 — Tool output format thuận lợi cho LLM context injection:**
   - Output là JSON string chứa: `{ slug, name, success, snapshot, tvl_usd, tvl_change_24h_pct, apy_avg, chains, stale, fetched_at, response_time_ms }`.
   - Field `snapshot` là markdown string đã format sẵn để agent paste vào prompt context (ví dụ: `"**Uniswap (Ethereum/Arbitrum)** — TVL $5.23B (+2.3% 24h), Avg APY 4.2%. Fetched: 2026-05-09T14:30Z"`).
   - Khi `stale === true`, snapshot phải bao gồm warning prefix: `"⚠️ STALE DATA (cached): ..."`.

3. **AC3 — NFR2 latency budget 1.5s tổng end-to-end:**
   - Tool fetch proxy với `AbortSignal.timeout(1500)` (1.5s hard cap từ tool side).
   - Service layer fetch DeFiLlama với `AbortSignal.timeout(1200)` (1.2s — để dành 300ms cho proxy/billing overhead).
   - Nếu DeFiLlama timeout/error → fallback ngay sang in-memory cache, KHÔNG retry trong cùng request.

4. **AC4 — Billing proxy endpoint:**
   - File `apps/api/src/router/routes/jit-sync.ts` mới, dùng Hono router.
   - Register trong `apps/api/src/router/index.ts`: `router.use('/jit-sync/*', apiKeyAuth); router.route('/jit-sync', jitSync);`.
   - POST body validate qua `JitSyncRequestSchema` (Zod). Validation fail → HTTP 400.
   - Wrap `c.req.json()` trong `.catch(() => null)` → 400 nếu malformed JSON (lesson từ Story 1.1 review).

5. **AC5 — Atomic credit check (NFR8) trước khi gọi DeFiLlama:**
   - Endpoint gọi `checkCredits(accountId)` TRƯỚC khi gọi DeFiLlama hoặc cache lookup.
   - Nếu `hasCredits === false` → throw `HTTPException(402)`. Tool nhận 402 → return error JSON `{ success: false, error: "Insufficient credits" }`.
   - **CRITICAL:** không call DeFiLlama service sau 402.
   - Sau khi DeFiLlama hoặc cache trả về thành công, gọi `deductToolCredits(accountId, "jit_sync", 0, ...)`.
   - Stale fallback (cache hit, DeFiLlama failed) VẪN deduct credit (user nhận data, dù cũ).
   - Nếu billing fail nhưng response succeeded → log warn, vẫn return data (parity Story 1.1).

6. **AC6 — Stale-fallback cache layer:**
   - File `apps/api/src/router/services/jit-cache.ts` mới: in-memory `Map<string, JitCacheEntry>` với TTL 5 phút.
   - Cache key: `${slug}:${chain ?? 'all'}:${metrics_sorted_csv}`.
   - DeFiLlama success → `cache.set(key, { data, fetched_at: now })`.
   - DeFiLlama fail → cache hit → return `{ ...cached.data, stale: true, fetched_at: cached.fetched_at }`.
   - Cache miss + DeFiLlama fail → return `{ success: false, error: "DeFiLlama unavailable and no cache", stale: true }` với HTTP 200 (NFR2 yêu cầu agent không bị block).

7. **AC7 — Service layer parity với perplexity.ts:**
   - File `apps/api/src/router/services/defillama.ts` mới expose `fetchProtocolSnapshot(slug, options): Promise<ProtocolSnapshot>`.
   - Gọi `${config.DEFILLAMA_API_URL}/protocol/${slug}` (DeFiLlama free endpoint, không cần API key).
   - Try/catch wrap fetch để network error throw `Error('DeFiLlama request failed: ...')`.
   - Optional chaining trên response shape (lesson từ Story 1.1 review).
   - Apply `replace(/\/+$/, '')` cho base URL chống double slash.

8. **AC8 — Config types và env vars mới:**
   - `apps/api/src/config.ts`: thêm `DEFILLAMA_API_URL: optUrl('https://api.llama.fi')` trong env schema; map vào `config` object cùng style với TAVILY/PERPLEXITY.
   - `TOOL_PRICING` thêm entry `jit_sync: { baseCost: 0.001, perResultCost: 0, markupMultiplier: 1.5 }`.
   - `apps/api/src/types.ts`: thêm `JitSyncRequestSchema`, `ProtocolSnapshot`, `JitSyncResponse`.

9. **AC9 — End-to-end verification:**
   - curl test billing proxy với `slug: "uniswap"` → 200 + snapshot string.
   - Test 402: account 0 credit → 402, không log gọi DeFiLlama.
   - Test 400: malformed JSON → 400 clean (không 500).
   - Test stale path: ngắt mạng tới `api.llama.fi` (hoặc set `DEFILLAMA_API_URL` invalid) → response có `stale: true` + cached snapshot (sau khi đã có 1 lần fetch thành công trước đó).
   - Test miss + fail: cache empty + DeFiLlama down → response `{ success: false, error: ... }` HTTP 200.

10. **AC10 — Tool auto-discovery & agent integration:**
    - File `core/epsilon-master/opencode/opencode.jsonc` không cần edit (tools auto-discover).
    - Restart OpenCode container → tool xuất hiện trong tool list.
    - Test agent prompt: "What's Uniswap TVL right now?" → agent gọi `jit_sync` với `protocol_slug: "uniswap"` → nhận snapshot → trả lời với data fresh.

## Tasks / Subtasks

- [ ] **Task 1: Add types và config entries (AC: 8)**
  - [ ] 1.1 — Edit `apps/api/src/types.ts`: append `JitSyncRequestSchema = z.object({ protocol_slug: z.string().min(1), chain: z.string().optional(), metrics: z.array(z.enum(['tvl','apy','volume','fees'])).optional(), session_id: z.string().optional() })`.
  - [ ] 1.2 — Edit `apps/api/src/types.ts`: append interfaces `ProtocolSnapshot { slug: string; name: string; tvl_usd: number; tvl_change_24h_pct: number; apy_avg: number | null; chains: string[]; }` và `JitSyncResponse { ...ProtocolSnapshot fields, success: boolean, snapshot: string, stale: boolean, fetched_at: string, cost: number }`.
  - [ ] 1.3 — Edit `apps/api/src/config.ts`: append `DEFILLAMA_API_URL: optUrl('https://api.llama.fi')` trong env schema, map vào config object (sau `PERPLEXITY_API_KEY`).
  - [ ] 1.4 — Edit `apps/api/src/config.ts` `TOOL_PRICING`: thêm `jit_sync: { baseCost: 0.001, perResultCost: 0, markupMultiplier: 1.5 }` (sau `deep_research_high`).

- [ ] **Task 2: Cache module (AC: 6)**
  - [ ] 2.1 — Tạo file `apps/api/src/router/services/jit-cache.ts`.
  - [ ] 2.2 — Define `interface JitCacheEntry { data: ProtocolSnapshot; fetched_at: string }` và `const CACHE_TTL_MS = 5 * 60 * 1000`.
  - [ ] 2.3 — Module-level `const cache = new Map<string, JitCacheEntry>()`.
  - [ ] 2.4 — Export `cacheKey(slug: string, chain?: string, metrics?: string[]): string` — sort metrics, lowercase, join `:`.
  - [ ] 2.5 — Export `getCached(key): JitCacheEntry | null` — return null nếu miss hoặc expired (now - fetched_at > TTL). KHÔNG mutate Map ở getter (để stale-fallback vẫn dùng được entries quá TTL — separate `getCachedAny()` cho stale-fallback path).
  - [ ] 2.6 — Export `getCachedAny(key): JitCacheEntry | null` — return entry bất kể TTL (cho stale path).
  - [ ] 2.7 — Export `setCache(key, data: ProtocolSnapshot): void`.
  - [ ] 2.8 — Add max-size guard: nếu `cache.size > 1000`, evict oldest 100 entries (FIFO via insertion order). Comment ngắn: `// prevent unbounded memory growth`.

- [ ] **Task 3: DeFiLlama service (AC: 3, 7)**
  - [ ] 3.1 — Tạo file `apps/api/src/router/services/defillama.ts` (parity perplexity.ts pattern).
  - [ ] 3.2 — Define interface `DeFiLlamaProtocolResponse` matching DeFiLlama API shape (xem Dev Notes).
  - [ ] 3.3 — Export `async function fetchProtocolSnapshot(slug: string, options: { chain?: string; metrics?: string[] }): Promise<ProtocolSnapshot>`.
  - [ ] 3.4 — Build URL: `const baseUrl = config.DEFILLAMA_API_URL.replace(/\/+$/, ''); const url = \`\${baseUrl}/protocol/\${encodeURIComponent(slug)}\``.
  - [ ] 3.5 — Try/catch wrap `fetch(url, { signal: AbortSignal.timeout(1200) })`. Catch → throw `Error(\`DeFiLlama request failed: \${e.message}\`)`.
  - [ ] 3.6 — Non-2xx → throw `Error(\`DeFiLlama API error: \${status} - \${statusText}\`)`.
  - [ ] 3.7 — Parse response. Extract: `name`, `tvl` (sum của latest TVL across chains hoặc top-level `tvl` field), `chains` array, `mcap`, optional yield data.
  - [ ] 3.8 — Compute `tvl_change_24h_pct` from `chainTvls.tvl` array (last 2 datapoints).
  - [ ] 3.9 — Filter chains nếu `options.chain` được set.
  - [ ] 3.10 — Log: `[EPSILON] JIT sync for '${slug}' fetched in ${elapsed}ms`.
  - [ ] 3.11 — Return `ProtocolSnapshot` object.

- [ ] **Task 4: Snapshot formatter helper (AC: 2)**
  - [ ] 4.1 — Trong `apps/api/src/router/services/jit-cache.ts` (hoặc dedicated `jit-formatter.ts` — chọn 1, ưu tiên cùng file `jit-cache.ts` cho cohesion).
  - [ ] 4.2 — Export `formatSnapshot(data: ProtocolSnapshot, stale: boolean, fetchedAt: string): string`.
  - [ ] 4.3 — Format: `[stale ? '⚠️ STALE DATA (cached): ' : ''](Bold name) (${chains.join('/')})  — TVL $X.XX{B,M,K} (${sign}${pct}% 24h)${apy ? ', Avg APY ${apy}%' : ''}. Fetched: ${ISO timestamp}`.
  - [ ] 4.4 — Helper `formatUsd(n: number): string` để compact-format ($5.23B, $124M, etc).

- [ ] **Task 5: Hono route handler (AC: 4, 5, 6)**
  - [ ] 5.1 — Tạo `apps/api/src/router/routes/jit-sync.ts`.
  - [ ] 5.2 — Imports: `Hono`, `HTTPException`, `JitSyncRequestSchema`, types, `fetchProtocolSnapshot`, `cacheKey/getCached/getCachedAny/setCache/formatSnapshot`, `checkCredits/deductToolCredits`.
  - [ ] 5.3 — `const jitSync = new Hono<{ Variables: AppContext }>();`.
  - [ ] 5.4 — POST `/`: `const body = await c.req.json().catch(() => null); if (!body) throw new HTTPException(400, { message: 'Invalid JSON body' });`.
  - [ ] 5.5 — Validate qua `JitSyncRequestSchema.safeParse()`, fail → `HTTPException(400)`.
  - [ ] 5.6 — `await checkCredits(accountId)`. Fail → `HTTPException(402)`. **CRITICAL:** không call DeFiLlama sau 402.
  - [ ] 5.7 — Compute `key = cacheKey(slug, chain, metrics)`.
  - [ ] 5.8 — Try-block: `const data = await fetchProtocolSnapshot(...)`. Success → `setCache(key, data)`. Build response với `stale: false, fetched_at: new Date().toISOString()`.
  - [ ] 5.9 — Catch DeFiLlama error: `const cached = getCachedAny(key); if (cached) { ... return stale response ... } else { return { success: false, error: 'DeFiLlama unavailable...', stale: true } với HTTP 200 }` — không throw 500 để agent không bị block (NFR2 intent).
  - [ ] 5.10 — Sau khi build response (cả fresh và stale paths), gọi `deductToolCredits(accountId, 'jit_sync', 0, \`JIT sync: ${slug}\`, session_id)`. Log warn nếu billing fail (parity Story 1.1).
  - [ ] 5.11 — Build final `JitSyncResponse`: `{ ...data, success: true, snapshot: formatSnapshot(data, stale, fetched_at), stale, fetched_at, cost: billingResult.cost }`. Return `c.json(response)`.
  - [ ] 5.12 — Wrap toàn bộ logic trong outer try/catch — nếu lỗi không expected (e.g., cache module bug), throw `HTTPException(500)` với generic message + log error.
  - [ ] 5.13 — `export { jitSync };`.

- [ ] **Task 6: Router registration (AC: 4)**
  - [ ] 6.1 — Edit `apps/api/src/router/index.ts`: import `{ jitSync } from './routes/jit-sync';` (sau import `deepResearch`).
  - [ ] 6.2 — Sau line `router.use('/deep-research/*', apiKeyAuth);`, thêm `router.use('/jit-sync/*', apiKeyAuth);`.
  - [ ] 6.3 — Sau line `router.route('/deep-research', deepResearch);`, thêm `router.route('/jit-sync', jitSync);`.

- [ ] **Task 7: OpenCode tool file (AC: 1, 2, 3)**
  - [ ] 7.1 — Tạo `core/epsilon-master/opencode/tools/jit_sync.ts` (parity `deep_research.ts` pattern from Story 1.1).
  - [ ] 7.2 — Imports: `tool` từ `@opencode-ai/plugin`, `getEnv` từ `./lib/get-env`.
  - [ ] 7.3 — Define interface `JitSyncProxyResponse` mirror response shape từ proxy.
  - [ ] 7.4 — Export default `tool({ description, args, async execute(args, _context) {...} })`.
  - [ ] 7.5 — Description: "Fetch real-time crypto protocol snapshot from DeFiLlama (TVL, APY, chain data). Use BEFORE answering crypto queries to ensure data is current — your training data is stale. Returns formatted markdown snapshot ready to inject into your reasoning. Completes in <1.5s; falls back to cached data if DeFiLlama is slow. Use protocol slug from defillama.com (e.g. 'uniswap', 'aave', 'curve-dex')."
  - [ ] 7.6 — Args schema: `protocol_slug: tool.schema.string().describe("DeFiLlama protocol slug (lowercase, dashes — e.g. 'uniswap', 'aave-v3')")`, `chain: tool.schema.string().optional().describe("Filter by chain — 'ethereum', 'arbitrum', 'solana'. Omit for all chains.")`, `metrics: tool.schema.array(tool.schema.string()).optional().describe("Subset of ['tvl','apy','volume','fees']. Omit for all.")`.
  - [ ] 7.7 — Execute: validate `EPSILON_TOKEN`, `EPSILON_API_URL` (require scheme `http(s)://` — lesson từ Story 1.1).
  - [ ] 7.8 — Validate `protocol_slug` non-empty + lowercase only `[a-z0-9-]` (regex). Fail → return error JSON.
  - [ ] 7.9 — `const proxyEndpoint = \`\${epsilonApiUrl.replace(/\/+$/, '')}/v1/router/jit-sync\``.
  - [ ] 7.10 — Try/catch fetch với `AbortSignal.timeout(1500)`. Network error → return JSON `{ slug, success: false, error: 'Network error: ...' }`.
  - [ ] 7.11 — Status 402 → return `{ slug, success: false, error: "Insufficient credits..." }`.
  - [ ] 7.12 — Other non-OK → return `{ slug, success: false, error: 'Proxy error ${status}: ${body}' }`.
  - [ ] 7.13 — Try/catch `response.json()` → fallback error JSON nếu non-JSON.
  - [ ] 7.14 — Return formatted JSON với `response_time_ms`.

- [ ] **Task 8: End-to-end verification (AC: 9, 10)**
  - [ ] 8.1 — `cd apps/api && npx tsc --noEmit` (chỉ check files mới — pre-existing errors có thể ignore).
  - [ ] 8.2 — Set env: `DEFILLAMA_API_URL=https://api.llama.fi` (default sẽ work nếu không set).
  - [ ] 8.3 — curl test fresh path:
    ```bash
    curl -X POST http://localhost:8000/v1/router/jit-sync \
      -H "Authorization: Bearer epsilon_<test_token>" \
      -H "Content-Type: application/json" \
      -d '{"protocol_slug":"uniswap"}'
    ```
    Expect: 200 với `success: true, stale: false, snapshot: "**Uniswap..."`.
  - [ ] 8.4 — Lặp lại curl ngay → cache hit (response time <50ms).
  - [ ] 8.5 — Test 402 (account 0 credit) — không có DeFiLlama log line.
  - [ ] 8.6 — Test 400: `{"protocol_slug":""}` → 400 with validation message.
  - [ ] 8.7 — Test malformed JSON: `-d 'not-json'` → 400 with "Invalid JSON body".
  - [ ] 8.8 — Test stale path: kill internet hoặc tạm set `DEFILLAMA_API_URL=https://invalid.example` → response `stale: true` + warning prefix in snapshot.
  - [ ] 8.9 — Test miss+fail: clear cache (restart api) + invalid `DEFILLAMA_API_URL` → response `{ success: false, error: "DeFiLlama unavailable...", stale: true }` với HTTP 200.
  - [ ] 8.10 — Restart OpenCode container, test agent: "Show me Aave TVL" → tool invoke → snapshot trả về.

## Dev Notes

### Architecture Compliance (CRITICAL)

**AR1 (Brownfield):** Story KHÔNG tạo app/package mới. Files mới đặt trong existing locations:
- `core/epsilon-master/opencode/tools/jit_sync.ts` (new)
- `apps/api/src/router/routes/jit-sync.ts` (new)
- `apps/api/src/router/services/defillama.ts` (new)
- `apps/api/src/router/services/jit-cache.ts` (new)

**AR2 (Bun runtime APIs):** Code chạy trong Bun runtime tại `apps/api/`. KHÔNG dùng Node `fs`/`path`/`crypto`. Dùng `fetch` (built-in) và Hono. Cache là in-process `Map<string, T>` — không dùng `node:cluster` hoặc IPC.

**AR3 (Drizzle additive-only):** Story này KHÔNG touch DB schema. Cache là in-memory only. Persistent cache (DB-backed) là phạm vi của Story 2.1 (BullMQ worker indexes DeFiLlama vào Drizzle tables).

**AR5 (AI tools location):** `jit_sync.ts` PHẢI ở `core/epsilon-master/opencode/tools/`. Hono route chỉ là billing proxy.

**AR6 (Billing proxy):** Endpoint `apps/api/src/router/routes/jit-sync.ts` đúng convention. Tool gọi proxy với `EPSILON_TOKEN`; proxy server-side gọi DeFiLlama (cho phép central observability + cache + future migration sang internal Drizzle data).

**AR8 (Feature addition sequence):** types/config (Task 1) → cache module (Task 2) → service (Task 3) → formatter (Task 4) → API route (Task 5) → router registration (Task 6) → OpenCode tool (Task 7) → verify (Task 8). KHÔNG đảo thứ tự.

### Pattern References (Files to mirror)

| File mới | Pattern reference |
|----------|------------------|
| `core/epsilon-master/opencode/tools/jit_sync.ts` | `core/epsilon-master/opencode/tools/deep_research.ts` (Story 1.1) |
| `apps/api/src/router/routes/jit-sync.ts` | `apps/api/src/router/routes/deep-research.ts` (Story 1.1) |
| `apps/api/src/router/services/defillama.ts` | `apps/api/src/router/services/perplexity.ts` (Story 1.1) |
| `apps/api/src/router/services/jit-cache.ts` | (no direct pattern — keep simple `Map`-based) |

**Đọc các pattern reference TRƯỚC khi viết code.** Story 1.1 vừa được code-reviewed và patches applied — các file đó là production-quality reference.

### Pre-applied Lessons từ Story 1.1 Code Review

Story 1.1 đã trải qua adversarial review và 9 patches được apply. Story 1.2 PHẢI bake các lesson sau từ đầu:

1. **Always use `AbortSignal.timeout(N)` on every fetch** — 1.2s server-side, 1.5s tool-side (tighter timeout vì NFR2).
2. **Try/catch wrap fetch network errors** — fetch có thể throw `TypeError` khi network down; throw thành `Error('DeFiLlama request failed: ...')`.
3. **`c.req.json().catch(() => null)` + 400 check** — malformed JSON phải trả 400 clean, KHÔNG để bubble thành 500.
4. **Optional chaining trên response shapes** — `data.choices?.[0]?.message?.content`. Áp dụng cho mọi external API parsing.
5. **`replace(/\/+$/, '')` trên base URLs** — chống double slash khi user set env var với trailing `/`.
6. **Validate `EPSILON_API_URL` scheme** — `if (!/^https?:\/\//.test(url)) return error`. Đã có pattern trong `deep_research.ts:54`.
7. **Try/catch quanh `response.json()`** — proxy có thể trả non-JSON 200 (HTML error page). Wrap parse với fallback error JSON.
8. **`response.text().catch(() => '')`** trên non-OK status — error body có thể unreadable.
9. **Filter `null` từ `.map().filter(Boolean)`** khi xử lý array có thể chứa invalid entries.

### DeFiLlama API Specs

- **Base URL:** `https://api.llama.fi` (free, no API key)
- **Endpoint dùng cho story này:** `GET /protocol/{slug}` — single protocol with TVL data
- **Rate limit:** ~30 req/min cho free tier — cache TTL 5 phút giảm load đáng kể
- **Response shape (sample, simplified):**
  ```json
  {
    "id": "1234",
    "name": "Uniswap",
    "address": null,
    "symbol": null,
    "url": "https://uniswap.org",
    "category": "Dexes",
    "chains": ["Ethereum", "Arbitrum", "Polygon"],
    "tvl": [
      {"date": 1747000000, "totalLiquidityUSD": 5234567890},
      {"date": 1747086400, "totalLiquidityUSD": 5354000000}
    ],
    "chainTvls": {
      "Ethereum": {
        "tvl": [{"date": 1747086400, "totalLiquidityUSD": 4000000000}]
      }
    },
    "mcap": 7800000000
  }
  ```
- **24h change calculation:** `((latest.totalLiquidityUSD - prev.totalLiquidityUSD) / prev.totalLiquidityUSD) * 100` từ `tvl` array (last 2 entries).
- **APY:** DeFiLlama `/protocol/{slug}` không trả APY trực tiếp. Cho MVP, set `apy_avg = null` và để snapshot chỉ chứa TVL data. Story 2.1 sẽ thêm yields data từ `https://yields.llama.fi/pools`.
- **Latency expected:** 200-500ms typical từ US/EU. 1.2s timeout cho dư.

### Pricing Decision Rationale

- DeFiLlama free → không có per-query API cost.
- baseCost $0.001 cover infrastructure (proxy CPU + cache memory + bandwidth).
- markupMultiplier 1.5× → user pays ~$0.0015/call. 1000 calls ≈ $1.50 — phù hợp tier 1 free chat.
- KHÔNG thêm `perResultCost` vì 1 call = 1 protocol snapshot.

### Existing Code Locations (READ ONLY — DO NOT MODIFY)

- `apps/api/src/router/index.ts` — chỉ EDIT 3 lines (import + use + route)
- `apps/api/src/middleware/auth.ts` — apiKeyAuth (KHÔNG sửa)
- `apps/api/src/router/services/billing.ts` — `checkCredits`, `deductToolCredits` (KHÔNG sửa)
- `apps/api/src/router/services/perplexity.ts` — pattern reference (KHÔNG sửa)
- `apps/api/src/types.ts` — chỉ APPEND, KHÔNG modify existing
- `apps/api/src/config.ts` — APPEND env var + 1 pricing entry, KHÔNG modify existing

### Files to Modify (UPDATE)

| File | Change |
|------|--------|
| `apps/api/src/types.ts` | APPEND `JitSyncRequestSchema`, `ProtocolSnapshot`, `JitSyncResponse` |
| `apps/api/src/config.ts` | APPEND env var `DEFILLAMA_API_URL` (env schema + config object) + 1 entry vào `TOOL_PRICING` |
| `apps/api/src/router/index.ts` | APPEND import + 3 lines (use middleware + 1 route) |

### Files to Create (NEW)

| File | Purpose |
|------|---------|
| `apps/api/src/router/services/defillama.ts` | DeFiLlama client (~70 lines, mirror `perplexity.ts`) |
| `apps/api/src/router/services/jit-cache.ts` | In-memory cache + formatter helpers (~80 lines) |
| `apps/api/src/router/routes/jit-sync.ts` | Hono billing proxy với stale-fallback logic (~110 lines) |
| `core/epsilon-master/opencode/tools/jit_sync.ts` | OpenCode tool (~110 lines, mirror `deep_research.ts`) |

### Anti-patterns / Common Mistakes to Avoid

- ❌ **Đừng add Drizzle table cho cache** — Cache là in-memory cho story này. DB-backed indexed data là Story 2.1's scope.
- ❌ **Đừng skip checkCredits()** — Tool MUST charge dù cache hit (user vẫn nhận data, infrastructure cost vẫn có).
- ❌ **Đừng throw 500 khi DeFiLlama down + cache miss** — NFR2 yêu cầu agent không bị block. Trả `{ success: false, stale: true }` HTTP 200 để agent biết và fallback graceful.
- ❌ **Đừng hardcode 1.5s ở nhiều chỗ** — Define const `JIT_SYNC_TIMEOUT_MS = 1200` (server) và `JIT_TOOL_TIMEOUT_MS = 1500` (tool) một lần, không lặp magic numbers.
- ❌ **Đừng dùng `setInterval` cho cache eviction** — Bun không guarantee timer accuracy under load. Dùng size-based FIFO eviction tại `setCache` time.
- ❌ **Đừng cache failure responses** — Chỉ `setCache(key, data)` khi DeFiLlama success. Cache hit + DeFiLlama fail → vẫn return cached data với `stale: true`.
- ❌ **Đừng dùng `Promise.race()` cho timeout** — `AbortSignal.timeout()` cleaner và proper cancellation. Race promises leak.
- ❌ **Đừng để cache key sensitive đến ordering** — Sort `metrics` array trước khi join, lowercase slug. Nếu không, `["tvl","apy"]` và `["apy","tvl"]` sẽ là 2 cache entries khác nhau.
- ❌ **Đừng skip chain filter logic** — Nếu user pass `chain: "ethereum"`, response phải filter `chains` xuống chỉ Ethereum và recalculate TVL từ `chainTvls.Ethereum.tvl` thay vì top-level `tvl`.
- ❌ **Đừng quên format human-readable** — `snapshot` field là cho LLM context. `5234567890` raw number sẽ làm LLM tốn token và mất accuracy. Format thành `$5.23B`.
- ❌ **Đừng dùng `console.log` JSON.stringify cho payload lớn** — Log compact: `[EPSILON] JIT sync ${slug} (${stale ? 'stale' : 'fresh'}) — ${ms}ms`. Không log full snapshot.

### Testing Requirements (NFR alignment)

- **NFR1 (TTFB <2s):** Tool tổng <1.5s + agent context build <500ms = trong budget. Test bằng tool latency log.
- **NFR2 (JIT sync <1.5s):** AC3 ensures budget hierarchy: tool 1.5s > server 1.2s > DeFiLlama actual ~500ms. Cache hit <50ms.
- **NFR8 (atomic billing):** AC5 ensures order: checkCredits → DeFiLlama/cache → deductToolCredits. Không partial deduction.

### Project Structure Notes

- Tool config trong `opencode.jsonc` không cần edit — auto-discover từ `core/epsilon-master/opencode/tools/*.ts`.
- env vars: `DEFILLAMA_API_URL` cần provision trong:
  - Production: secrets manager (default `https://api.llama.fi` chấp nhận được)
  - Local dev: optional override trong `apps/api/.env`
  - Sandbox container: không cần set (tool gọi proxy, không gọi DeFiLlama trực tiếp)
- Cache là per-process in-memory. Multi-instance deployment sẽ có cache divergence nhưng acceptable cho story này (TTL 5 phút, deviation nhỏ).

### Cross-Story Dependencies

- **Story 1.1** (Deep Research): `EPSILON_API_URL`, `EPSILON_TOKEN` env vars đã được established. Auth middleware `apiKeyAuth` reuse.
- **Story 2.1** (BullMQ DeFiLlama worker): Future replacement cho direct DeFiLlama call. Sau Story 2.1, Hono route sẽ ưu tiên query Drizzle table; fall back DeFiLlama API. Story 1.2 giữ direct call để standalone.
- **Story 2.3** (Dune/Nansen): Tương tự — extends JIT sync với on-chain data.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 1.2]
- [Source: _bmad-output/planning-artifacts/architecture.md#Step 5 — naming conventions, file locations]
- [Source: _bmad-output/implementation-artifacts/1-1-deep-research-tool-perplexity-sonar.md] — pattern + applied review patches
- [Source: core/epsilon-master/opencode/tools/deep_research.ts] — Story 1.1 final tool pattern
- [Source: apps/api/src/router/routes/deep-research.ts] — Story 1.1 final route pattern
- [Source: apps/api/src/router/services/perplexity.ts] — Story 1.1 final service pattern
- [Source: https://api-docs.defillama.com/#/TVL/get_protocol__protocol_] — DeFiLlama protocol endpoint
- [Source: NFR2 from epics.md:49] — JIT RAG Sync Latency <1.5 giây constraint

## Dev Agent Record

### Agent Model Used

claude-opus-4-7

### Debug Log References

### Completion Notes List

### File List
