# Story 10.1: Autonomous Web Scraper & Researcher Workflow

**Status:** ready-for-dev

## Story Foundation

**User Story:**
As a crypto researcher (Tier 2/3),
I want Agent có thể tự động duyệt nhiều trang web và vượt qua các rào cản truy cập bằng `agent-browser`,
So that tôi nhận được một bản báo cáo phân tích sâu thay vì chỉ đọc text tóm tắt tĩnh.

**Acceptance Criteria:**
- **Given** User yêu cầu lấy dữ liệu từ một Dashboard Web3 đóng kín (cần thao tác click/login)
- **When** Agent kích hoạt luồng Autonomous Web Scraper
- **Then** Agent sử dụng `agent-browser` CLI (thay vì `scrape_webpage.ts`/Firecrawl) để điều khiển Playwright mở tab, vượt qua các bước bảo mật, snapshot DOM, trích xuất dữ liệu
- **And** tổng hợp dữ liệu thành báo cáo hoàn chỉnh.
- **And** nếu DOM thay đổi hoặc bị block, Agent phải tự động fallback sang Vision-based matching (`agent-browser screenshot --annotate`) thay vì bị treo vô hạn.
- **And** Agent phải tính toán và xin phép user về Budget (số Credits dự kiến) trước khi bắt đầu cào lượng lớn dữ liệu để tránh overcharge.

---

## Developer Context

**Current State vs Goal:**
- `scrape_webpage.ts` dùng Firecrawl — chỉ lấy được static HTML/markdown từ trang mở. Không thể click, login, hay xử lý SPA/React apps.
- `web_search.ts` dùng Tavily — chỉ trả về text snippet, không render JS.
- `deep_research.ts` dùng Perplexity Sonar — multi-source research nhưng không điều khiển browser.
- **`agent-browser` CLI đã được cài sẵn trong sandbox** tại `core/epsilon-master/opencode/skills/EPSILON-system/agent-browser/SKILL.md`. Đây là Playwright-based CLI tool, KHÔNG phải TypeScript module. Agent gọi nó qua `bash`.

**Goal:** Tạo `agent_browser.ts` OpenCode tool để wrap `agent-browser` CLI, cho phép Agent gọi browser automation qua billing proxy. Đồng thời enable skill permission trong `chainlens-tier2.md`.

---

## Technical Requirements & Architecture Compliance

**1. Tool Output Format — bắt buộc theo pattern hiện tại:**

Xem `deep_research.ts` làm reference. Tool phải:
- Gọi `${EPSILON_API_URL}/v1/router/agent-browser` với `Bearer ${EPSILON_TOKEN}`
- Trả về string JSON: `{ success: boolean, data: any, error: string | null }`
- Handle 402 (insufficient credits) giống `deep_research.ts:92-103`
- `AbortSignal.timeout(120_000)` — browser sessions có thể chậm

**2. `agent-browser` là CLI, KHÔNG phải npm package:**

Tool `agent_browser.ts` KHÔNG import Playwright trực tiếp. Thay vào đó, API route phía backend (`apps/api/src/router/routes/agent-browser.ts`) sẽ spawn `agent-browser` CLI subprocess trong sandbox. Tool chỉ là HTTP proxy tới billing endpoint.

**3. Separation of Concerns:**
- `core/epsilon-master/opencode/tools/agent_browser.ts` — OpenCode tool, gọi HTTP tới billing proxy
- `apps/api/src/router/routes/agent-browser.ts` — API route, nhận request, `checkCredits` → spawn/call agent-browser → `deductToolCredits`
- `apps/api/src/router/services/agent-browser.ts` — service layer, wrap agent-browser CLI execution
- KHÔNG import `packages/db` trong tool file
- KHÔNG gửi raw base64 screenshot — nếu cần trả về ảnh, trả về URL hoặc base64 nhỏ (<50KB)

**4. Billing pattern — bắt buộc (NFR8):**

```typescript
// Trong API route — xem deep-research.ts làm reference
await checkCredits(accountId, AGENT_BROWSER_MIN_CREDITS);
// ... execute ...
await deductToolCredits(accountId, 'agent_browser', sessionId);
```

Thêm vào `TOOL_PRICING` trong `apps/api/src/config.ts`:
```typescript
agent_browser: {
  baseCost: 0.05,      // per session/page (~5x firecrawl)
  perResultCost: 0,
  markupMultiplier: 1.5,
},
```

**5. Screenshot — KHÔNG gửi binary raw:**

Nếu cần trả về screenshot cho LLM phân tích, dùng `agent-browser screenshot --annotate` và trả về path hoặc base64 thumbnail. Không có S3 upload utility hiện tại — trả về base64 string nhỏ là acceptable cho MVP.

**6. Circuit Breaker / Self-Heal:**

API service phải implement retry tối đa 3 lần khi gặp `TimeoutError` hoặc `TargetClosedError` từ agent-browser CLI. Sau 3 lần fail, trả về `{ success: false, error: "...", fallback: "vision" }` để agent biết switch sang annotated screenshot mode.

---

## File Structure Requirements

- **UPDATE** `core/epsilon-master/opencode/agents/chainlens-tier2.md` — thêm `agent_browser: allow` vào frontmatter permissions (KHÔNG phải `opencode.jsonc`)
- **NEW** `core/epsilon-master/opencode/tools/agent_browser.ts` — OpenCode HTTP proxy tool
- **NEW** `apps/api/src/router/routes/agent-browser.ts` — API route với checkCredits/deductToolCredits
- **NEW** `apps/api/src/router/services/agent-browser.ts` — service layer wrap CLI
- **UPDATE** `apps/api/src/config.ts` — thêm `agent_browser` vào `TOOL_PRICING`
- **UPDATE** `apps/api/src/router/index.ts` (hoặc router entry) — register route mới
- ~~`apps/api/src/router/routes/swarm/dag_events.ts`~~ — DEFER: không có swarm infrastructure, out of scope story này

**KHÔNG cần update `opencode.jsonc`** — tool permissions cho agent được quản lý trong `agents/chainlens-tier2.md` frontmatter, không phải config JSON.

**KHÔNG tạo `agents/researcher.md`** — file này không tồn tại. Budget rule phải được thêm vào `chainlens-tier2.md` body.

---

## Agent Permission Update (chainlens-tier2.md)

Thêm vào frontmatter của `core/epsilon-master/opencode/agents/chainlens-tier2.md`:
```yaml
agent_browser: allow
```

Thêm vào body (Budget rule):
```
## Browser Automation Budget Rule
Before using `agent_browser` for bulk scraping (>3 pages), calculate estimated credits
(0.075 credits/page) and ask user to confirm budget. Example: "This will scrape ~10 pages,
estimated cost: ~0.75 credits. Proceed?"
If DOM selector fails, fallback to: `agent-browser screenshot --annotate` for Vision-based matching.
```

---

## Latest Tech Information

- `agent-browser` CLI đã có sẵn trong sandbox — xem full docs tại `core/epsilon-master/opencode/skills/EPSILON-system/agent-browser/SKILL.md`
- Key commands: `agent-browser open <url>`, `agent-browser snapshot -i`, `agent-browser click @e1`, `agent-browser screenshot --annotate`
- Vision fallback: `agent-browser screenshot --annotate` trả về ảnh với numbered labels `[N]` → `@eN` refs
- Session isolation: dùng `agent-browser --session <name>` cho parallel scraping
- Prompt injection protection: set `AGENT_BROWSER_CONTENT_BOUNDARIES=1` để wrap page content trong markers, ngăn page content inject instructions vào LLM
- Timeout default: 25s per command — override với `AGENT_BROWSER_DEFAULT_TIMEOUT` env var
- Xem `deep_research.ts` và `web_search.ts` làm reference cho tool pattern (HTTP proxy + billing)
- Xem `apps/api/src/router/routes/deep-research.ts` làm reference cho API route pattern

---

## Completion Status

*Ultimate context engine analysis completed — critical issues fixed: agent-browser CLI discovery, correct permission file (chainlens-tier2.md not opencode.jsonc), removed non-existent researcher.md, added missing API route/service layer, billing cost entry, screenshot safety, AGENT_BROWSER_CONTENT_BOUNDARIES security.*
