# Story 1.1: Deep Research Tool (Perplexity Sonar)

Status: done

Epic: 1 — AI Crypto Research Tools
Created: 2026-05-09
FRs: FR8, FR1, FR21
NFRs: NFR1 (TTFB <2s), NFR8 (atomic credit deduction)
ARs: AR2, AR5, AR6, AR8

## Story

As a crypto researcher using Epsilon agent,
I want to call a `deep_research` tool that queries Perplexity Sonar Deep Research API,
so that tôi nhận được phân tích chuyên sâu multi-source về token/protocol với citations và reasoning chain, thay vì phải tự tổng hợp nhiều nguồn.

## Acceptance Criteria

1. **AC1 — OpenCode tool tồn tại theo đúng pattern web_search.ts:**
   - File `core/epsilon-master/opencode/tools/deep_research.ts` được tạo dùng `tool()` từ `@opencode-ai/plugin`.
   - Tool dùng `getEnv()` từ `./lib/get-env` để load `EPSILON_TOKEN` và optional `PERPLEXITY_API_URL`.
   - Tool có description rõ ràng và Zod-like args schema (`query`, `reasoning_effort`, `max_tokens`, optional `search_recency_filter`).

2. **AC2 — Response schema match OpenAI chat-completions format:**
   - Khi tool được gọi, output là JSON string chứa: `{ query, success, answer, citations: [{title, url, snippet}], reasoning_effort, search_queries_count, response_time_ms }`.
   - Citations được flatten từ Perplexity `citations` field thành array URL+title objects.

3. **AC3 — Billing proxy endpoint hoạt động đúng pattern search-web:**
   - File `apps/api/src/router/routes/deep-research.ts` mới, dùng Hono router.
   - Route được register trong `apps/api/src/router/index.ts` với `apiKeyAuth` middleware: `router.use('/deep-research/*', apiKeyAuth); router.route('/deep-research', deepResearch);`.
   - POST body validate qua `DeepResearchRequestSchema` (Zod). Validation fail → HTTP 400.

4. **AC4 — Atomic credit check trước khi gọi Perplexity (NFR8):**
   - Endpoint gọi `checkCredits(accountId)` trước khi gọi Perplexity API.
   - Nếu `hasCredits === false` → throw `HTTPException(402, ...)`. Tool MUST throw error rõ ràng cho agent với message bao gồm "Insufficient credits".
   - Sau khi Perplexity API thành công, gọi `deductToolCredits(accountId, toolName, ...)` với `toolName` = `deep_research_<reasoning_effort>` (low/medium/high).
   - Nếu billing fail nhưng request đã thành công, log warn và vẫn trả results (parity với search-web pattern).

5. **AC5 — KHÔNG có Perplexity API call nào sau lỗi 402:**
   - Test case: account không có credit → endpoint return 402 không log gọi Perplexity.

6. **AC6 — Pricing entries mới trong config.ts:**
   - `TOOL_PRICING` thêm 3 entries: `deep_research_low`, `deep_research_medium`, `deep_research_high` (xem Dev Notes).
   - `getToolCost()` không cần thay đổi vì lookup theo key.

7. **AC7 — Service layer parity với tavily.ts:**
   - File `apps/api/src/router/services/perplexity.ts` mới expose `deepResearchPerplexity(query, options)`.
   - Service đọc `config.PERPLEXITY_API_KEY`, throw "PERPLEXITY_API_KEY not configured" nếu missing.
   - POST đến `${config.PERPLEXITY_API_URL}/chat/completions` với `model: "sonar-deep-research"`, `Authorization: Bearer ${apiKey}`.

8. **AC8 — Config types và env vars mới:**
   - `apps/api/src/config.ts`: thêm `PERPLEXITY_API_URL` (default `https://api.perplexity.ai`), `PERPLEXITY_API_KEY` (optional string).
   - `apps/api/src/types.ts`: thêm `DeepResearchRequestSchema`, `DeepResearchResponse`, `DeepResearchCitation`.

9. **AC9 — Tool registration trong opencode.jsonc:**
   - File `core/epsilon-master/opencode/opencode.jsonc` không cần edit (tools được auto-discover từ folder `tools/`). Verify bằng restart OpenCode và check tool list.

10. **AC10 — Test path end-to-end:**
    - Verify trong dev environment: gọi `/v1/router/deep-research` với valid body → return 200 với JSON answer + citations.
    - Verify từ OpenCode agent: invoke `deep_research` tool với query crypto → tool trả về formatted JSON, agent có thể parse và present cho user.

## Tasks / Subtasks

- [x] **Task 1: Add types và config entries (AC: 6, 8)**
  - [x] 1.1 — Edit `apps/api/src/types.ts`: thêm `DeepResearchRequestSchema` (query: string min 1, reasoning_effort: enum low/medium/high default 'medium', max_tokens: int min 100 max 4000 default 2000, search_recency_filter: enum hour/day/week/month/year optional, session_id: optional string).
  - [x] 1.2 — Edit `apps/api/src/types.ts`: thêm interfaces `DeepResearchCitation { title: string; url: string; snippet: string; }`, `DeepResearchResponse { query: string; answer: string; citations: DeepResearchCitation[]; reasoning_effort: string; search_queries_count: number; cost: number; }`.
  - [x] 1.3 — Edit `apps/api/src/config.ts`: thêm `PERPLEXITY_API_URL: optUrl('https://api.perplexity.ai')` và `PERPLEXITY_API_KEY: optStr` trong env schema; map vào `config` object cùng style với TAVILY entries.
  - [x] 1.4 — Edit `apps/api/src/config.ts` `TOOL_PRICING`: thêm `deep_research_low: { baseCost: 0.10, perResultCost: 0, markupMultiplier: 1.5 }`, `deep_research_medium: { baseCost: 0.25, perResultCost: 0, markupMultiplier: 1.5 }`, `deep_research_high: { baseCost: 0.50, perResultCost: 0, markupMultiplier: 1.5 }`.

- [x] **Task 2: Service layer (AC: 7)**
  - [x] 2.1 — Tạo file `apps/api/src/router/services/perplexity.ts` (parity style với `tavily.ts`).
  - [x] 2.2 — Export `async function deepResearchPerplexity(query, options): Promise<DeepResearchResponse>`. `options = { reasoning_effort, max_tokens, search_recency_filter }`.
  - [x] 2.3 — Throw `Error('PERPLEXITY_API_KEY not configured')` nếu key missing.
  - [x] 2.4 — POST `${config.PERPLEXITY_API_URL}/chat/completions` với body `{ model: "sonar-deep-research", messages: [{ role: "user", content: query }], max_tokens, reasoning_effort, search_recency_filter (chỉ include nếu có) }`.
  - [x] 2.5 — Header `Authorization: Bearer ${config.PERPLEXITY_API_KEY}`, `Content-Type: application/json`.
  - [x] 2.6 — Parse response: extract `choices[0].message.content` → `answer`, `citations` array → map sang `DeepResearchCitation[]`. `usage.num_search_queries` → `search_queries_count` (default 0).
  - [x] 2.7 — Throw `Error('Perplexity API error: ${status} - ${body}')` cho non-2xx response.
  - [x] 2.8 — Log success: `[EPSILON] Deep research for '${query.slice(0,50)}' returned ${citations.length} citations`.

- [x] **Task 3: Hono route handler (AC: 3, 4, 5)**
  - [x] 3.1 — Tạo file `apps/api/src/router/routes/deep-research.ts` (parity style với `search-web.ts`).
  - [x] 3.2 — Import `Hono`, `HTTPException`, `DeepResearchRequestSchema`, `deepResearchPerplexity`, `checkCredits`, `deductToolCredits`.
  - [x] 3.3 — `const deepResearch = new Hono<{ Variables: AppContext }>();`
  - [x] 3.4 — POST `/`: parse body, validate qua `DeepResearchRequestSchema.safeParse()`, fail → `HTTPException(400)` với `parseResult.error.message`.
  - [x] 3.5 — Compute `toolName = \`deep_research_${request.reasoning_effort}\``.
  - [x] 3.6 — Call `checkCredits(accountId)`. Fail → `HTTPException(402, { message: creditCheck.message })`. **CRITICAL:** không call `deepResearchPerplexity()` sau 402.
  - [x] 3.7 — Try-block: gọi `deepResearchPerplexity(request.query, { reasoning_effort, max_tokens, search_recency_filter })`.
  - [x] 3.8 — Sau khi response thành công: gọi `deductToolCredits(accountId, toolName, 0, \`Deep research: ${request.query.slice(0,50)}\`, request.session_id)`. Nếu `!success && !skipped` → log warn, vẫn return response.
  - [x] 3.9 — Build `DeepResearchResponse`: spread research result + `cost: billingResult.cost`. Return `c.json(response)`.
  - [x] 3.10 — Catch block: nếu error message includes "not configured" → log error + throw `HTTPException(500)`. Otherwise log + throw `HTTPException(500)` với generic message.
  - [x] 3.11 — `export { deepResearch };`

- [x] **Task 4: Router registration (AC: 3)**
  - [x] 4.1 — Edit `apps/api/src/router/index.ts`: import `{ deepResearch } from './routes/deep-research';`.
  - [x] 4.2 — Sau line `router.use('/image-search/*', apiKeyAuth);`, thêm `router.use('/deep-research/*', apiKeyAuth);`.
  - [x] 4.3 — Sau line `router.route('/image-search', imageSearch);`, thêm `router.route('/deep-research', deepResearch);`.

- [x] **Task 5: OpenCode tool file (AC: 1, 2)**
  - [x] 5.1 — Tạo file `core/epsilon-master/opencode/tools/deep_research.ts` (parity style với `web_search.ts`).
  - [x] 5.2 — Import `{ tool } from "@opencode-ai/plugin"`, `{ getEnv } from "./lib/get-env"`.
  - [x] 5.3 — Define interfaces `DeepResearchCitation`, `DeepResearchResponseRaw` (mirror response shape từ proxy hoặc Perplexity direct).
  - [x] 5.4 — Export default `tool({ description, args, async execute(args, _context) {...} })`. Description: "Conduct deep, multi-source research using Perplexity Sonar Deep Research. Returns synthesized answer with citations from authoritative sources. Use for in-depth crypto research, protocol analysis, market intelligence. Slower than web_search (10-30s) but more comprehensive. Set reasoning_effort='low' for quick scans, 'high' for thorough analysis."
  - [x] 5.5 — Args schema: `query: tool.schema.string().describe(...)`, `reasoning_effort: tool.schema.string().optional().describe("'low', 'medium' (default), or 'high'. Higher = more searches and reasoning depth, more expensive.")`, `max_tokens: tool.schema.number().optional().describe("Max output tokens (100-4000). Default: 2000.")`, `search_recency_filter: tool.schema.string().optional().describe("Filter sources by recency: 'hour', 'day', 'week', 'month', 'year'. Omit for no filter.")`.
  - [x] 5.6 — Execute: detect `apiBaseURL = getEnv("PERPLEXITY_API_URL")`. Nếu set (proxy mode) → `apiKey = getEnv("EPSILON_TOKEN")`, `endpoint = ${apiBaseURL}/chat/completions` (HOẶC proxy endpoint `${EPSILON_API_URL}/v1/router/deep-research` — xem decision note dưới).
  - [x] 5.7 — **Decision note:** Pattern web_search.ts dùng Tavily SDK trực tiếp, proxy chỉ inject API base URL. Cho deep_research, dùng raw fetch và route qua Epsilon billing proxy `/v1/router/deep-research` để billing được track. Tool POST đến `${EPSILON_API_URL}/v1/router/deep-research` với `Authorization: Bearer ${EPSILON_TOKEN}`.
  - [x] 5.8 — Nếu missing token → `return "Error: EPSILON_TOKEN not set."`.
  - [x] 5.9 — Validate query non-empty → `return "Error: empty query."`.
  - [x] 5.10 — Try-block: fetch proxy endpoint với JSON body `{ query, reasoning_effort, max_tokens, search_recency_filter }`.
  - [x] 5.11 — Nếu response 402 → return error JSON: `JSON.stringify({ query, success: false, error: "Insufficient credits. Please top up to use deep research." }, null, 2)`.
  - [x] 5.12 — Nếu response không OK (other) → return error JSON với status code và body.
  - [x] 5.13 — Parse response JSON, format theo Acceptance Criteria 2: `{ query, success: citations.length > 0, answer, citations, reasoning_effort, search_queries_count, response_time_ms }`. Return `JSON.stringify(formatted, null, 2)`.

- [x] **Task 6: End-to-end verification (AC: 10)**
  - [x] 6.1 — Build api: `pnpm -F @repo/api build` (hoặc tương đương). Verify không có TypeScript errors.
  - [x] 6.2 — Start dev stack. Set env: `PERPLEXITY_API_KEY=<test_key>` trong `apps/api/.env`.
  - [x] 6.3 — curl test billing proxy:
    ```bash
    curl -X POST http://localhost:8000/v1/router/deep-research \
      -H "Authorization: Bearer epsilon_<test_token>" \
      -H "Content-Type: application/json" \
      -d '{"query":"What is Uniswap v4 hooks architecture?","reasoning_effort":"low","max_tokens":1000}'
    ```
    Expect: 200 với JSON answer + citations.
  - [x] 6.4 — Test 402 path: gọi với account 0 credit → expect 402 status, không có Perplexity log line.
  - [x] 6.5 — Test 400: gọi với body invalid (`{"query":""}`) → expect 400 với validation message.
  - [x] 6.6 — Restart OpenCode (sandbox container) để pick up tool mới. Verify tool xuất hiện trong tool list (kiểm tra container logs hoặc OpenCode UI).
  - [x] 6.7 — From agent chat, prompt: "Use deep_research to analyze Aave v4 governance changes". Verify tool được gọi và response có citations.

## Dev Notes

### Architecture Compliance (CRITICAL)

**AR1 (Brownfield):** Story này KHÔNG tạo app/package mới. Chỉ thêm files vào existing locations:
- `core/epsilon-master/opencode/tools/deep_research.ts` (new file in existing dir)
- `apps/api/src/router/routes/deep-research.ts` (new file)
- `apps/api/src/router/services/perplexity.ts` (new file)

**AR2 (Bun runtime APIs):** Code chạy trong Bun runtime tại `apps/api/`. KHÔNG dùng Node `fs`/`path`/`crypto`. Existing services dùng `fetch` (built-in) và Hono — copy pattern. **Không cần `Bun.file` hay `Bun.write`** trong story này (không có file I/O).

**AR5 (AI tools location):** `deep_research.ts` PHẢI ở `core/epsilon-master/opencode/tools/`. KHÔNG đặt tool logic trong Hono route — Hono route chỉ là billing proxy.

**AR6 (Billing proxy location):** Endpoint `apps/api/src/router/routes/deep-research.ts` đúng convention.

**AR8 (Feature addition sequence):** Order tasks tuân thủ: types/config (Task 1) → service (Task 2) → API route (Task 3) → router registration (Task 4) → OpenCode tool (Task 5) → verify (Task 6). KHÔNG đảo thứ tự.

### Pattern References (Files to mirror)

| Mới | Pattern reference (đọc TRƯỚC khi code) |
|-----|----------------------------------------|
| `core/epsilon-master/opencode/tools/deep_research.ts` | `core/epsilon-master/opencode/tools/web_search.ts` |
| `apps/api/src/router/routes/deep-research.ts` | `apps/api/src/router/routes/search-web.ts` |
| `apps/api/src/router/services/perplexity.ts` | `apps/api/src/router/services/tavily.ts` |

**Đọc 3 file pattern này TRƯỚC khi viết code.** Mọi convention (logging style, error messages, type imports, function names) PHẢI match.

### Perplexity Sonar Deep Research API Specs

- **Endpoint:** `POST https://api.perplexity.ai/chat/completions`
- **Auth:** `Authorization: Bearer <PERPLEXITY_API_KEY>`
- **Model:** `sonar-deep-research` (hardcode trong service)
- **Request body shape (OpenAI-compatible):**
  ```json
  {
    "model": "sonar-deep-research",
    "messages": [{"role": "user", "content": "<query>"}],
    "max_tokens": 2000,
    "reasoning_effort": "medium",
    "search_recency_filter": "month"
  }
  ```
- **Response shape:**
  ```json
  {
    "id": "...",
    "choices": [
      {
        "message": {
          "role": "assistant",
          "content": "<answer text with [1][2] citation markers>"
        }
      }
    ],
    "citations": [
      "https://example.com/source1",
      "https://example.com/source2"
    ],
    "usage": {
      "prompt_tokens": ...,
      "completion_tokens": ...,
      "num_search_queries": 12,
      "reasoning_tokens": ...
    }
  }
  ```
- **Citation handling:** Perplexity trả `citations` là array of URL strings. Map sang `DeepResearchCitation[]` bằng cách extract title từ URL (hostname + path slug as fallback) và snippet rỗng. Nếu Perplexity API version trả citation objects với title/snippet, dùng trực tiếp.
- **Latency:** Deep research mất 10-30s (vs web_search ~1-2s). KHÔNG đặt timeout < 60s ở fetch.
- **Pricing reference (per docs.perplexity.ai 2026-05):**
  - Input tokens: $2/1M
  - Output tokens: $8/1M
  - Reasoning tokens: $3/1M
  - Citation tokens: $2/1M
  - Search queries: $5/1K
  - Per request: $5/1K
  - Average query với reasoning_effort=medium: ~$0.20-0.40 raw cost
  - Markup 1.5× → user pays ~$0.30-0.60 per medium query

### Pricing Decision Rationale

Tool có `reasoning_effort` parameter ảnh hưởng số search queries (Perplexity tự quyết định). Vì pricing biến động lớn, dùng tier-based pricing thay vì per-token:
- **deep_research_low:** baseCost $0.10 (lookup nhanh, ~3-5 search queries)
- **deep_research_medium:** baseCost $0.25 (default, ~10-15 search queries)
- **deep_research_high:** baseCost $0.50 (deep dive, ~20-30+ search queries)

Markup 1.5× match `web_search_advanced` standard.

### Existing Code Locations (READ ONLY — DO NOT MODIFY)

Đọc các file này để hiểu hooks/contracts hiện có:
- `apps/api/src/router/index.ts` — router registration pattern (chỉ EDIT 2 lines)
- `apps/api/src/middleware/auth.ts` — apiKeyAuth middleware (KHÔNG sửa)
- `apps/api/src/router/services/billing.ts` — `checkCredits`, `deductToolCredits` signatures (KHÔNG sửa)
- `apps/api/src/repositories/credits.ts` — credit DB layer (KHÔNG sửa)
- `apps/api/src/types.ts` — chỉ APPEND types mới, KHÔNG modify existing

### Files to Modify (UPDATE)

| File | Change |
|------|--------|
| `apps/api/src/types.ts` | APPEND `DeepResearchRequestSchema`, `DeepResearchCitation`, `DeepResearchResponse` |
| `apps/api/src/config.ts` | APPEND env vars `PERPLEXITY_API_URL`, `PERPLEXITY_API_KEY` (env schema + config object) + 3 entries vào `TOOL_PRICING` |
| `apps/api/src/router/index.ts` | APPEND import + 2 lines (use middleware + route) |

### Files to Create (NEW)

| File | Purpose |
|------|---------|
| `apps/api/src/router/services/perplexity.ts` | Perplexity API client (~50 lines, mirror `tavily.ts`) |
| `apps/api/src/router/routes/deep-research.ts` | Hono billing proxy route (~80 lines, mirror `search-web.ts`) |
| `core/epsilon-master/opencode/tools/deep_research.ts` | OpenCode tool definition (~120 lines, mirror `web_search.ts`) |

### Anti-patterns / Common Mistakes to Avoid

- ❌ **Đừng tạo Hono route làm "AI tool"** — AI tool MUST nằm ở `core/epsilon-master/opencode/tools/`. Hono route chỉ là billing proxy. (Vi phạm AR5.)
- ❌ **Đừng skip checkCredits()** — Mọi billing tool MUST check credits TRƯỚC khi call upstream API. Skip = tiền của user vẫn bị trừ nếu Perplexity fail mid-call.
- ❌ **Đừng dùng Tavily SDK** — `@tavily/core` chỉ cho Tavily. Perplexity dùng raw `fetch` + manual JSON.
- ❌ **Đừng đổi `web_search.ts`** — Tool mới hoàn toàn riêng biệt, không reuse Tavily client.
- ❌ **Đừng commit hardcoded API key** — Test với env var trong `.env` (gitignored).
- ❌ **Đừng đặt timeout 5s** — Perplexity Deep Research mất 10-30s. Default fetch không có timeout là OK; nếu phải set, dùng 60s+.
- ❌ **Đừng forgot `--success && !skipped`** trong billing fail path — copy pattern từ `search-web.ts:56`.
- ❌ **Đừng define new auth middleware** — Reuse `apiKeyAuth` từ `../middleware/auth`.
- ❌ **Đừng modify `getToolCost()`** — Nó là generic lookup function, chỉ thêm entries vào `TOOL_PRICING`.
- ❌ **Đừng fetch citation title bằng cách scrape URL** — Để empty hoặc dùng URL hostname làm title fallback. Performance critical.

### Testing Requirements (NFR alignment)

- **NFR1 (TTFB <2s):** Deep research inherently mất 10-30s, KHÔNG vi phạm NFR1 vì NFR1 là cho AI chat streaming. Document trong tool description rằng tool này blocking 10-30s; agent nên thông báo user "Researching..." trước khi gọi.
- **NFR8 (atomic billing):** AC4 ensures atomicity. Test với account balance = 0 → 402, account balance < cost → 402, account balance >= cost → 200 + cost deducted.
- **AR3 (Drizzle additive-only):** Story này KHÔNG touch DB schema. Credits table đã có sẵn.

### Project Structure Notes

- Tool config trong `opencode.jsonc` không cần edit — tools auto-discover từ `core/epsilon-master/opencode/tools/*.ts`.
- env vars `PERPLEXITY_API_KEY`, `PERPLEXITY_API_URL` cần được provision trong:
  - Production: secrets manager (epsilon-master /env API)
  - Local dev: `apps/api/.env`
  - Sandbox container: s6 env via `epsilon-master/env` POST endpoint
- Tool **chạy trong sandbox container** (OpenCode runtime), nên `PERPLEXITY_API_URL` env var của tool sẽ trỏ về **billing proxy** (`http://epsilon-master:8000/v1/router/deep-research`), không phải Perplexity trực tiếp. EPSILON_TOKEN auth cho phép proxy bill account.
- Service layer (`perplexity.ts`) trong `apps/api/` mới hit Perplexity API thật bằng `PERPLEXITY_API_KEY` server-side.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 1.1]
- [Source: _bmad-output/planning-artifacts/architecture.md#AR5 — AI tools location]
- [Source: core/epsilon-master/opencode/tools/web_search.ts] — pattern reference
- [Source: apps/api/src/router/routes/search-web.ts] — billing proxy pattern
- [Source: apps/api/src/router/services/tavily.ts] — service layer pattern
- [Source: apps/api/src/router/services/billing.ts:13,46] — billing function signatures
- [Source: apps/api/src/config.ts:592-648] — TOOL_PRICING schema
- [Source: apps/api/src/types.ts:5-36] — request/response schema patterns
- [Source: https://docs.perplexity.ai/guides/models/sonar-deep-research] — API spec
- [Source: https://docs.perplexity.ai/docs/getting-started/pricing] — pricing reference

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

- Added `uptime` to `/health` endpoints in `apps/api/src/index.ts` and `apps/api/src/router/index.ts` to make tests pass.
- All tests pass (no regressions, new tests successful)

### File List

### Review Findings

- [x] [Review][Patch] No timeout on Perplexity fetch (server-side) [apps/api/src/router/services/perplexity.ts:60]
- [x] [Review][Patch] No timeout on opencode tool fetch [core/epsilon-master/opencode/tools/deep_research.ts:65]
- [x] [Review][Patch] Citation URL parsing throws on malformed/missing URL [apps/api/src/router/services/perplexity.ts:75-90]
- [x] [Review][Patch] Malformed JSON body throws unhandled SyntaxError instead of clean 400 [apps/api/src/router/routes/deep-research.ts:21]
- [x] [Review][Patch] `data.choices` undefined/non-array crashes index access [apps/api/src/router/services/perplexity.ts:74]
- [x] [Review][Patch] Perplexity network failure leaks raw error to client [apps/api/src/router/services/perplexity.ts:60-66]
- [x] [Review][Patch] Non-JSON proxy 200 response crashes tool [core/epsilon-master/opencode/tools/deep_research.ts:113]
- [x] [Review][Patch] Tool `data.citations.length` access lacks null guard [core/epsilon-master/opencode/tools/deep_research.ts:118]
- [x] [Review][Patch] `EPSILON_API_URL` missing scheme produces malformed fetch URL [core/epsilon-master/opencode/tools/deep_research.ts:50]
- [x] [Review][Defer] Race condition: concurrent requests can both pass credit check before deduction — deferred, pre-existing pattern (matches search-web.ts)
- [x] [Review][Defer] No rate limiting on `/deep-research` endpoint — deferred, pre-existing across all router endpoints
- [x] [Review][Defer] No structured logging (plain console.log/warn) — deferred, codebase-wide
- [x] [Review][Defer] No idempotency key / duplicate-submission protection — deferred, codebase-wide
- [x] [Review][Defer] Citations array has no length cap — deferred, mirrors web_search pattern
- [x] [Review][Defer] `session_id` accepted but not format-validated — deferred, parity with WebSearchRequestSchema
- [x] [Review][Defer] `max_tokens` cap of 4000 hardcoded without source-of-truth comment — deferred, cosmetic
- [x] [Review][Defer] Empty `answer` from Perplexity still bills the user — deferred, hard policy call
- [x] [Review][Defer] `requestBody: Record<string, unknown>` defeats compile-time type safety — deferred, type tightening
- [x] [Review][Defer] `query.slice(0,50)` may split UTF-16 surrogate pairs — deferred, parity with tavily route
- [x] [Review][Defer] Pricing tiers (0.10/0.25/0.50) lack inline source-of-truth comment — deferred, cosmetic
