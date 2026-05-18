---
stepsCompleted: [1, 2, 3]
inputDocuments:
  - _bmad-output/planning-artifacts/prd.md
  - _bmad-output/planning-artifacts/architecture.md
  - _bmad-output/planning-artifacts/ux-design-specification-v1.md
lastUpdated: '2026-05-18'
---
# Chainlens - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for Chainlens, decomposing the requirements from the PRD and Architecture into implementable stories.

## Requirements Inventory

### Functional Requirements

**Phase 1 — MVP**
FR1: Tái cấu trúc Chainlens Core để hỗ trợ Multi-Agent (Tier 1 & Tier 2)
FR2: Xây dựng Background Workers crawl & index dữ liệu từ DeFiLlama, Dune, Nansen chạy 24/7
FR3: Tích hợp Vibe Trading platform (Tier 2) — Celery-backed backtest engine + 21 MCP research tools (market data / options / patterns / factor analysis / Shadow Account / Swarm Teams / finance skills / web+file I/O) qua MCP Proxy pattern. Sandbox isolation preserved (NFR10), atomic billing preserved (NFR8).
FR4: Browser Extension (Vigilant Companion) — auto-detect token/contract khi browse X, Facebook, Dexscreener, CMC; risk tooltips; sync với web account; nút Expand mở full app
FR5: AI-Generated News & Discover Page — tổng hợp từ đa nguồn + dữ liệu ẩn danh user; cảnh báo sớm (early warnings) và alpha insights; public cho mọi tier kể cả Free
FR6: Web3 Authentication Module — kết nối MetaMask, WalletConnect, Phantom; đổi mạng (Ethereum, Arbitrum, Solana); hiển thị số dư; rút gọn địa chỉ ví; ENS Avatar
FR7: Generative AI Chat Widgets — trả về UI Components thay text: Token Info Widget, Smart Contract Risk Badge, Transaction Simulation Card (Vercel AI SDK)
FR8: Data Integrations — Agent tools kết nối API crypto: DeFiLlama, Nansen, Dune, Perplexity AI (deep research)
FR9: DeFi & Market Dashboards — DeFiLlama/Nansen data; bảng Yield/TVL đa cột có sort; Sparklines; Smart Money Flow Visualizer
FR10: Advanced Charting — TradingView candlestick (OHLCV); overlay Moving Averages, RSI
FR11: Backtest Sandbox Visualizer (Tier 2) — Monaco Editor soạn thảo/sửa chiến lược; KPI cards (Sharpe Ratio, Max Drawdown); Equity Curve Chart so sánh benchmark

**Phase 2 — Tokenomics & Enterprise**
FR12: Internal Credits System — điểm nạp neo Fiat; deduct = cost × markup; áp dụng mọi tier; atomic transaction
FR13: $CLENS Token & Smart Contract — native token; cơ chế Burn (nếu trả bằng $CLENS) và Buy-back + Burn (nếu trả bằng Fiat)
FR14: Affiliate/Airdrop System — thưởng $CLENS cho user cung cấp data on-chain; link referral kiếm token thụ động
FR15: On-premise Enterprise packaging (Tier 3) — Local LLM; Team Workspace; inbound-only RAG sync từ Chainlens; Zero-Data-Leakage
FR16: BYOK & Proof of Contribution — dùng API key cá nhân; hệ thống đo lường + thưởng $CLENS theo token consumption + data quality
FR17: Local Compute (Ollama Integration) — kết nối Local LLM; zero-data-leakage hoàn toàn
FR18: LLM Proxy & MaaS — "OpenRouter cho Web3"; mua quyền truy cập model thương mại hoặc self-hosted bằng $CLENS/USDT

**Domain Requirements**
FR19: JIT Data Sync — Agent tự động snapshot real-time + bù đắp data gaps trước khi gọi LLM; không SLA cứng cho background index
FR20: Agnostic Multi-chain Support — dựa vào LLM capability (EVM, Solana, Move...), không hard-code per chain
FR21: Security & Hallucination Mitigation — validation layer quét lỗ hổng cơ bản (reentrancy, etc.) cho AI-generated code; mandatory Sandbox testing; Disclaimer bắt buộc
FR22: Zero-Data-Leakage for Tier 3 — outbound telemetry bị chặn hoàn toàn; inbound-only RAG sync

**Agent Marketplace Integration (Phase 2)**
FR23: MMOMarket Account Linking (SSO) — liên kết tài khoản MMOMarket vào Chainlens bằng OAuth2
FR24: Product Publishing (One-Click Publish) — Publish Agent sang MMOMarket với cấu hình giá, loại (Rent/Sell) và bảo hành
FR25: Webhook Order Lifecycle — xử lý Payment_Confirmed, Access_Granted, Dispute_Raised (Auto-Clone code hoặc cấp Execution-Role)
FR26: Model Availability State — API nội bộ cung cấp trạng thái model theo account (available/unavailable + reason code chuẩn hóa)
FR27: Selection Guardrail — UI/Extension không cho chọn model unavailable (disable/hide trước khi thực thi)
FR28: Fallback Guidance — khi model đang dùng unavailable, hiển thị model thay thế khả dụng cùng nhóm năng lực
FR29: Server-Enforced Entitlement — backend từ chối request model không còn entitlement với reason code nhất quán
FR30: Cross-Surface Consistency — trạng thái availability model nhất quán giữa web app và browser extension

### NonFunctional Requirements

NFR1: TTFB AI Chat < 2 giây (từ user gửi đến AI trả token đầu tiên qua streaming)
NFR2: JIT RAG Sync Latency < 1.5 giây (snapshot + gap fill trước khi gọi LLM)
NFR3: Sandbox MicroVM init < 1 giây; timeout cứng 30 giây cho mỗi tiến trình backtest
NFR4: Concurrent Users >= 1,000 CCU đồng thời không suy giảm hiệu năng (MVP target)
NFR5: Worker Auto-scaling — scale-out tự động dựa trên số lượng crypto project mới được thêm vào monitoring
NFR6: LLM Provider Fallback — chuyển sang provider dự phòng trong < 1 giây khi provider chính sự cố
NFR7: High Availability 99.9% cho Core services (AI chat + Credit management)
NFR8: Atomic Credit Deduction — nếu trừ credit thất bại, chặn request; không partial deduction
NFR9: Strict Rate Limiting cho Tier 1 (Free) theo IP + Account để chặn resource abuse
NFR10: Sandbox Isolation (Tier 2) — no outbound network; chỉ kết nối Vibe Trading API nội bộ; chống C2C
NFR11: AI Report & Code Accuracy > 80%
NFR12: Non-custodial — tuyệt đối không lưu Private Key hoặc seed phrase của user
NFR13: Model availability freshness <= 30 giây từ lúc backend đổi trạng thái đến lúc UI phản ánh
NFR14: Tỷ lệ fail do chọn model unavailable < 0.5% tổng model-selection requests/ngày sau rollout

### Additional Requirements

Từ Architecture Document:

AR1: Brownfield monorepo extension — mọi feature là extension vào codebase hiện tại; không tạo app/package mới trừ khi thực sự cần
AR2: Bun runtime APIs bắt buộc — dùng `Bun.file`, `Bun.write`; KHÔNG dùng Node.js `fs`/`path`/`crypto`
AR3: Drizzle ORM additive-only migrations — chỉ ADD column/table; KHÔNG rename/drop; schema trong `packages/db/src/schema/`
AR4: Next.js App Router — `"use client"` chỉ ở leaf nodes; server components ưu tiên; new pages tại `apps/web/src/app/(dashboard)/<feature>/`
AR5: AI tools = direct tool files trong `core/epsilon-master/opencode/tools/` (theo pattern `web_search.ts`) hoặc MCP servers — KHÔNG phải Hono route handlers trong apps/api
AR6: Billing proxy endpoint mới (nếu tool cần credit deduction) tại `apps/api/src/router/routes/<tool>.ts`
AR7: Shared types mới tại `packages/shared/src/types/`
AR8: Feature addition sequence chuẩn: DB schema → Shared types → API route → OpenCode tool → Frontend

### UX Design Requirements

UX-DR1: Tooltip extension phải hiển thị theo state-based transition (Ambient Thin Glass ↔ Alert Frosted Tint) với animation mượt.
UX-DR2: Progressive disclosure cho dữ liệu rủi ro và điều hướng "Expand" sang full app, tránh overload trong tooltip.
UX-DR3: Trust score badge và risk states phải có màu semantic nhất quán (Critical/Warning/Safe) trên cả web + extension.
UX-DR4: Accessibility WCAG 2.1 AA cho text trên nền glass (đảm bảo contrast động + fallback khi giảm motion).
UX-DR5: Extension UI phải cô lập style bằng Shadow DOM để tránh CSS host page ghi đè.

### FR Coverage Map

| Requirement                                | Epic   |
| ------------------------------------------ | ------ |
| FR1 (Multi-Agent Core)                     | Epic 1 |
| FR2 (Background Workers)                   | Epic 2 |
| FR3 (Vibe Trading / Backtest)              | Epic 5 |
| FR4 (Browser Extension)                    | Epic 6 |
| FR5 (AI News & Discover)                   | Epic 2 |
| FR6 (Web3 Auth)                            | Epic 4 |
| FR7 (Generative UI Widgets)                | Epic 3 |
| FR8 (Data Integrations / Deep Research)    | Epic 1 |
| FR9 (DeFi & Market Dashboards)             | Epic 3 |
| FR10 (Advanced Charting)                   | Epic 3 |
| FR11 (Backtest Sandbox Visualizer)         | Epic 5 |
| FR12 (Internal Credits System)             | Epic 7 |
| FR13 ($CLENS Token)                        | Epic 7 |
| FR14 (Affiliate/Airdrop)                   | Epic 7 |
| FR15 (On-premise Enterprise)               | Epic 8 |
| FR16 (BYOK & Proof of Contribution)        | Epic 8 |
| FR17 (Local Compute / Ollama)              | Epic 8 |
| FR18 (LLM Proxy & MaaS)                    | Epic 8 |
| FR19 (JIT Data Sync)                       | Epic 1 |
| FR20 (Agnostic Multi-chain)                | Epic 4 |
| FR21 (Security & Hallucination Mitigation) | Epic 1 |
| FR22 (Zero-Data-Leakage)                   | Epic 8 |
| FR23 (MMOMarket Account Linking)           | Epic 9 |
| FR24 (One-Click Publish)                   | Epic 9 |
| FR25 (Webhook Order Lifecycle)             | Epic 9 |
| FR26 (Model Availability State)            | Epic 6 |
| FR27 (Selection Guardrail)                 | Epic 6 |
| FR28 (Fallback Guidance)                   | Epic 6 |
| FR29 (Server-Enforced Entitlement)         | Epic 6 |
| FR30 (Cross-Surface Consistency)           | Epic 6 |

NFR1–NFR14: áp dụng cross-cutting cho tất cả Epics.
AR1–AR8: constraints kiến trúc áp dụng cho từng story trong mọi Epic.

**FE Upgrade Requirements (Epic 11):**
FR-U1 (Upgrade Next.js 16): Story 11.1
FR-U2 (Upgrade React 19): Story 11.1
FR-U3 (Fix breaking changes + dynamic imports): Story 11.1 + Story 11.2
FR-U4 (Expand optimizePackageImports): Story 11.2
FR-U5 (loading.tsx cho 6 routes): Story 11.3
FR-U6 (React Compiler): Story 11.4
NFR-U1 đến NFR-U5 (perf metrics validation): Story 11.4

## Epic List

**Phase 1 — MVP**

1. **Epic 1: AI Crypto Research Tools** — Trang bị cho Epsilon OpenCode các tools nghiên cứu crypto chuyên sâu: subAgent definitions theo tier, deep research, on-chain analysis, JIT data sync, và validation layer chống hallucination.
2. **Epic 2: Crypto Data Infrastructure** — Xây dựng hệ thống background workers crawl & index dữ liệu DeFiLlama/Dune/Nansen 24/7 và AI-generated Discover feed cho toàn bộ tier.
3. **Epic 3: Crypto Native Trading UI** — Phát triển các React Server Components và Generative AI Widget cho dashboard DeFi/market, advanced charting TradingView, token detail page, và streaming UI từ OpenCode.
4. **Epic 4: Web3 Identity** — Tích hợp Web3 Auth Module (MetaMask, WalletConnect, Phantom) vào Next.js App Router với SIWE signature verification và agnostic multi-chain support.
5. **Epic 5: Backtesting Sandbox** — Kết nối Vibe Trading API vào Epsilon MicroVM sandbox và xây dựng Backtest Visualizer với Monaco Editor + KPI cards.
6. **Epic 6: Browser Intelligence Extension** — Xây dựng Browser Extension auto-detect token/contract khi browse crypto sites, sync với web account, risk tooltips.

**Phase 2 — Tokenomics & Enterprise**

7. **Epic 7: Credit Economy & Tokenomics** — Triển khai Internal Credits System atomic, $CLENS token smart contract, và Affiliate/Airdrop reward system.
8. **Epic 8: Enterprise & Privacy** — On-premise packaging Tier 3, BYOK, Local LLM (Ollama), LLM Proxy MaaS, và Zero-Data-Leakage enforcement.
9. **Epic 9: Agent Marketplace Integration** — Tích hợp MMOMarket biến Chainlens thành Creator Studio với tính năng One-Click Publish, SSO Account Linking và Order Lifecycle Webhooks.
10. **Epic 10: Autonomous AI Agents (Manus Clone Capabilities)** — Ủy quyền cho hệ thống AI Tự trị xử lý toàn bộ các vòng lặp công việc phức tạp mà không cần can thiệp từng bước. Tận dụng kiến trúc Sandbox, Triggers và `agent-browser`.
11. **Epic 11: Frontend Performance & Platform Upgrade** — Nâng cấp Next.js 16 + React 19, bundle splitting cho heavy libraries, loading skeletons cho routes quan trọng, enable React Compiler. Mục tiêu: FCP < 1.5s, TTI < 3s, bundle < 800KB.

## Epic 1: AI Crypto Research Tools

Trang bị cho Epsilon OpenCode các tools nghiên cứu crypto chuyên sâu: định nghĩa Chainlens subAgents theo tier, deep research qua Perplexity AI, JIT data sync trước khi gọi LLM, và validation layer chống hallucination cho AI-generated code.

**FRs:** FR1, FR8, FR19, FR21
**NFRs:** NFR1, NFR2, NFR6, NFR11
**ARs:** AR1, AR2, AR5, AR6, AR8

### Story 1.1: Deep Research Tool (Perplexity Sonar)

As a crypto researcher using Epsilon agent,
I want to call a `deep_research` tool that queries Perplexity Sonar Deep Research API,
So that tôi nhận được phân tích chuyên sâu multi-source về token/protocol với citations, thay vì phải tự tổng hợp nhiều nguồn.

**Acceptance Criteria:**

**Given** file `core/epsilon-master/opencode/tools/deep_research.ts` tồn tại theo pattern của `web_search.ts` dùng `tool()` từ `@opencode-ai/plugin`
**When** OpenCode agent gọi tool với một crypto query
**Then** tool gọi Perplexity Sonar Pro API và trả về markdown report có citations
**And** billing được deduct qua proxy endpoint `apps/api/src/router/routes/deep-research.ts` dùng EPSILON_TOKEN header

**Given** user không có đủ credit
**When** tool được gọi và proxy trả về 402
**Then** tool throw error rõ ràng cho agent với message "Insufficient credits"
**And** không có API call nào tới Perplexity được thực hiện sau lỗi 402

### Story 1.2: JIT Crypto Data Snapshot

As a Epsilon agent xử lý crypto query,
I want tool tự động fetch real-time snapshot từ DeFiLlama trước khi gọi LLM,
So that LLM nhận được data mới nhất thay vì dùng training data lỗi thời.

**Acceptance Criteria:**

**Given** agent nhận query về TVL, APY, hoặc protocol metrics
**When** JIT sync tool được gọi với token/protocol identifier
**Then** tool fetch DeFiLlama API, format data thành context string, và complete trong vòng 1.5 giây
**And** data được inject vào system context trước khi LLM nhận prompt

**Given** DeFiLlama API timeout hoặc trả về lỗi
**When** JIT sync tool chạy
**Then** tool trả về cached data kèm timestamp "stale: true"
**And** agent tiếp tục xử lý với warning về data staleness, không bị block

### Story 1.3: AI-Generated Code Validation Layer

As a Tier 2 user request agent viết smart contract code,
I want output của agent được pass qua validation layer scan lỗ hổng cơ bản,
So that reentrancy và các lỗ hổng phổ biến bị flag trước khi user deploy.

**Acceptance Criteria:**

**Given** agent generate Solidity hoặc Move code
**When** validation tool được gọi với code snippet
**Then** tool scan static patterns: reentrancy, unchecked external call, integer overflow/underflow
**And** trả về danh sách warnings với severity (HIGH/MEDIUM/LOW) và line references

**Given** validation hoàn thành (dù có hay không có warnings)
**When** kết quả được trả về user
**Then** response bắt buộc kèm disclaimer: "AI-generated code chưa được audit chuyên nghiệp. Không deploy lên mainnet mà không kiểm tra độc lập."
**And** nếu có bất kỳ HIGH severity warning nào, sandbox testing được recommend trước khi chạy thực

### Story 1.4: Chainlens Tier 1 & Tier 2 SubAgent Definitions

As a Chainlens platform,
I want định nghĩa Tier 1 và Tier 2 subAgents trong OpenCode config với scope và tools khác nhau,
So that user mỗi tier nhận đúng capabilities — Free chỉ chat crypto cơ bản, Tier 2 mới có sandbox backtest.

**Acceptance Criteria:**

**Given** file `core/epsilon-master/opencode/opencode.jsonc` cần update
**When** Chainlens subAgents được declare
**Then** `chainlens-tier1` subAgent có access tools: `web_search`, `deep_research`, `jit_sync` — KHÔNG có sandbox tools
**And** `chainlens-tier2` subAgent kế thừa Tier 1 tools cộng thêm: `code_validator`, sandbox execution tools

**Given** user chat với Chainlens
**When** request đến OpenCode
**Then** subAgent được route theo tier hiện tại của user (lookup từ session/credits state)
**And** Tier 1 user cố gọi Tier 2 tool sẽ bị reject với message "Upgrade to Tier 2 to use this feature"

**Given** subAgent definitions được merge từ existing Epsilon agents
**When** OpenCode khởi động
**Then** không break existing Epsilon agents (default, plan, build) — chỉ thêm chainlens-tier1, chainlens-tier2 vào config
**And** AR1 brownfield rule tuân thủ: không tạo file mới trong `core/`, chỉ extend existing config

## Epic 2: Crypto Data Infrastructure

Xây dựng hệ thống background workers crawl & index dữ liệu DeFiLlama (Free + Pro), Dune, Nansen 24/7 và AI-generated Discover feed cho toàn bộ tier. Stories 2.4–2.7 (added 2026-05-14) mở rộng từ JIT-only lookup (Story 1.2) sang pre-indexed dataset đầy đủ: ~7,000 protocols + ~16,000 yield pools + DEX volumes + Fees + Stablecoins + Hacks + Token Unlocks + Bridges. DeFiLlama Pro subscription ($300/mo) là prerequisite cho 2.4–2.7. Xem Architecture Step 9 để biết chi tiết integration design.

**FRs:** FR2, FR5
**NFRs:** NFR4, NFR5
**ARs:** AR1, AR2, AR3, AR8

### Story 2.1: Crypto Data Worker với BullMQ

As a platform operator,
I want background worker crawl DeFiLlama TVL/APY data định kỳ chạy qua BullMQ,
So that data crypto luôn fresh trong DB để JIT sync tool có thể serve nhanh.

**Acceptance Criteria:**

**Given** BullMQ queue đã tồn tại tại `apps/api/src/queue/`
**When** crypto data worker job được thêm vào queue với schedule configurable
**Then** worker fetch DeFiLlama TVL và APY data cho tất cả projects trong watchlist
**And** data được upsert vào Drizzle schema additive-only tại `packages/db/src/schema/`

**Given** số lượng project trong watchlist tăng lên
**When** worker queue bị overload (job backlog > threshold)
**Then** worker tự động scale-out thêm consumer instances
**And** không có data loss hoặc duplicate upsert



### Story 2.1.1: Mempool Sniffing & MEV Tracking Worker (Deep Dive)

As a quant trader or smart money tracker,
I want worker kết nối trực tiếp vào Mempool qua QuickNode WebSocket endpoint do platform/operator cấu hình (hoặc self-hosted node/provider tương thích JSON-RPC),
So that hệ thống có thể detect các lệnh swap khổng lồ, sandwich attacks, hoặc front-running trước khi chúng được confirm trên block.

**Acceptance Criteria:**

**Given** Mempool WebSocket connection đang active cho các chain/router được cấu hình (MVP: QuickNode WSS, Ethereum Uniswap routers trước; BSC/PancakeSwap có thể bật bằng env)
**When** phát hiện pending transaction có value > $500k trên Uniswap/PancakeSwap
**Then** worker parse dữ liệu giao dịch và đẩy cảnh báo sớm (Early Alert) vào queue
**And** dữ liệu được lưu vào bảng `mempool_alerts`
**And** Agent query real-time qua OpenCode tool `mempool_alerts`, tool này chỉ gọi API nội bộ đọc DB/cache và không mở WebSocket tới QuickNode trực tiếp.

### Story 2.1.2: Entity & Hacker Wallet Tracking (Arkham VIP)

As a security analyst user,
I want worker liên tục crawl dữ liệu gán nhãn (labels) từ Arkham Intelligence và optional verify on-chain qua QuickNode RPC theo chain được cấu hình,
So that Agent có thể cảnh báo nếu một token đang bị gom bởi ví của VCs, Sàn giao dịch, hoặc ví từng bị hack mà không để OpenCode gọi Arkham/QuickNode trực tiếp.

**Acceptance Criteria:**

**Given** Arkham API key được configure và `ENTITY_WALLET_CHAINS` chỉ định chain allowlist
**When** có token contract mới được query bởi user
**Then** worker cross-check danh sách Top Holders với database Entity Labels
**And** nếu bật optional QuickNode verification adapter, worker chỉ dùng per-chain QuickNode HTTP RPC (`ENTITY_WALLET_RPC_URL_<CHAIN>`) để xác minh balance/logs cần thiết
**And** lưu trữ kết quả phân tích mức độ rủi ro dựa trên owner entities vào DB.
**And** MVP không crawl toàn bộ blockchain; chỉ xử lý token/address/watchlist được query hoặc được cấu hình.

### Story 2.2: AI-Generated Discover Feed

As a Free tier user,
I want xem trang Discover với AI-generated news và alpha insights tổng hợp từ đa nguồn,
So that tôi nắm bắt early warnings và opportunities mà không cần tự research.

**Acceptance Criteria:**

**Given** user truy cập trang Discover (mọi tier kể cả Free)
**When** Next.js server component tại `apps/web/src/app/(dashboard)/discover/` render
**Then** trang hiển thị AI-summarized news từ đa nguồn với timestamp
**And** early warning badge xuất hiện cho bất kỳ anomaly nào được detect trong 24h qua

**Given** AI summarization job chạy định kỳ qua BullMQ
**When** job hoàn thành
**Then** feed được cập nhật không cần user refresh
**And** nội dung được anonymize — không expose dữ liệu cá nhân user nào



### Story 2.2.1: On-chain Fact Checking Layer (Deep Dive)

As a user đọc tin tức thị trường,
I want AI tự động đối chiếu tin tức tích cực (Partnerships/Listings) với dữ liệu On-chain thực tế qua QuickNode RPC multi-chain được cấu hình,
So that tôi không bị lùa gà (FOMO) khi Dev đang xả hàng ngầm.

**Acceptance Criteria:**

**Given** một bài báo tích cực về dự án X được AI tóm tắt
**When** bài báo được chuẩn bị publish lên Discover Feed
**Then** Fact-checking worker tự động dùng QuickNode HTTP RPC theo chain allowlist để query logs/balance/call cho Dev/Treasury wallets trong 24h qua
**And** nếu phát hiện xả hàng (dump) > 5%, bài báo sẽ bị gắn cờ "High Risk: Insider Selling Detected".
**And** Etherscan/Blockscout/Moralis chỉ là fallback/supplemental source; không thay thế QuickNode RPC làm provider mặc định cho MVP.

### Story 2.2.2: Social Sentiment & Narrative Clustering (Deep Dive)

As a Degen trader,
I want AI phân cụm các token theo Narrative (AI, RWA, Memes) dựa trên độ phủ sóng mạng xã hội,
So that tôi biết dòng tiền đang chú ý vào hệ sinh thái nào trước khi giá pump.

**Acceptance Criteria:**

**Given** LunarCrush hoặc Santiment API được tích hợp
**When** worker tổng hợp dữ liệu Social Volume và Social Dominance
**Then** AI tự động phân loại token vào các "Narrative Clusters"
**And** feed hiển thị mục "Trending Narratives" với tín hiệu Alpha khi Social Volume tăng đột biến nhưng Price chưa chạy.

### Story 2.3: Dune & Nansen On-Chain Index Worker

As a platform operator,
I want worker crawl on-chain data từ Dune Analytics và Nansen Smart Money signals,
So that agent có dữ liệu wallet movement và liquidity flow để đưa ra insight chính xác hơn.

**Acceptance Criteria:**

**Given** Dune Analytics API key và Nansen API key được configure trong environment
**When** on-chain index worker chạy theo schedule
**Then** worker query Dune cho custom SQL analytics và Nansen cho Smart Money wallet movements
**And** kết quả được store vào dedicated Drizzle tables (additive migration)

**Given** Dune hoặc Nansen API trả về rate-limit error (429)
**When** worker nhận lỗi
**Then** worker retry với exponential backoff, tối đa 3 lần
**And** sau 3 lần thất bại, job được mark failed và alert được log — không crash worker process

**Given** data đã được indexed
**When** JIT sync tool (Story 1.2) cần on-chain context
**Then** tool có thể query internal API để lấy pre-indexed Dune/Nansen data thay vì gọi external API trực tiếp

### Story 2.3.1: VIP API Exploitation: Smart Money Flow & Token God Mode (Deep Dive)

As a quant trader using Chainlens,
I want hệ thống tận dụng tối đa gói Nansen Alpha/VIP API để bóc tách Smart Money,
So that Agent có thể trả lời câu hỏi "Ví cá mập nào đang mua token này trong 1 giờ qua?".

**Acceptance Criteria:**

**Given** Nansen VIP API endpoint
**When** token cụ thể có dấu hiệu pump/dump
**Then** worker ưu tiên lấy dữ liệu `Token God Mode` (Top Buyers/Sellers) và `Exchange Flows` (Net Inflow/Outflow CEX)
**And** dữ liệu này được cache với TTL ngắn (e.g. 5 phút) để phục vụ JIT RAG Sync độ trễ thấp.

### Story 2.3.2: Financial Statement Data via Token Terminal Pro (Deep Dive)

As a fundamental analyst,
I want AI có thể phân tích dự án Crypto như một công ty chứng khoán truyền thống,
So that tôi biết liệu token này đang được định giá quá cao (Overvalued) dựa trên doanh thu thực tế hay không.

**Acceptance Criteria:**

**Given** Token Terminal API plan/custom contract, `TOKEN_TERMINAL_API_KEY`, and `TOKEN_TERMINAL_WORKER_ENABLED=true`
**When** index worker chạy daily cho `TOKEN_TERMINAL_PROJECTS` và `TOKEN_TERMINAL_METRICS` allowlist
**Then** fetch/cache các chỉ số tài chính qua Token Terminal REST v2: fees, revenue, earnings, P/S, P/F, P/E nếu provider cung cấp, Daily Active Users (DAU), active developers, code commits, và market cap fields cần cho valuation
**And** Agent có thể dùng data này để lập bảng so sánh định giá (Valuation Matrix) giữa các dự án cùng mảng (e.g. Uniswap vs SushiSwap).
**And** OpenCode chỉ gọi internal `protocol_valuation` tool/API đọc DB/cache; không nhận `TOKEN_TERMINAL_API_KEY`, không scrape Token Terminal UI, không expose raw provider payload, và không gọi live Token Terminal theo từng prompt trừ khi backend/admin bật `force_refresh` có credit/billing guard.

### Story 2.4: DeFiLlama Full Crawler Worker

As a platform operator,
I want một BullMQ worker crawl toàn bộ 5 data categories từ DeFiLlama (TVL protocols, Yield pools, DEX volumes, Fees/Revenue, Stablecoins) mỗi giờ,
So that agent có đầy đủ dữ liệu DeFi pre-indexed trong DB để serve nhanh mà không cần gọi external API realtime.

**Acceptance Criteria:**

**AC1 — Config vars (helpers `optStr`/`optBoolFalse`/`optInt` trong `config.ts`):**
- `DEFILLAMA_PRO_API_KEY: optStr` — optional. Khi có key, worker dùng Pro endpoints; khi không, fallback Free endpoints.
- `DEFILLAMA_WORKER_ENABLED: optBoolFalse` — default false.
- `DEFILLAMA_SYNC_INTERVAL_MS: optInt(3_600_000)` — default 1 giờ.

**AC2 — DB schema (5 tables mới, additive AR3, có indexes cho query patterns Story 2.6):**
- `epsilon.defillama_protocols` — ~7,000 protocols: slug PK, name, category, chains jsonb, tvl_usd numeric(20,4), tvl_change_1d_pct, tvl_change_7d_pct, mcap_usd, staking_usd, borrowed_usd, fetched_at, updated_at. Indexes: `idx_defillama_protocols_category`, `idx_defillama_protocols_tvl`.
- `epsilon.defillama_pools` — ~16,000 pools: pool_id varchar(100) PK (DeFiLlama UUID, giữ varchar an toàn), chain, project, symbol, tvl_usd, apy, apy_base, apy_reward, stablecoin boolean, il_risk, exposure, apy_mean_30d, volume_usd_1d, fetched_at, updated_at. Indexes (cho Story 2.6): `idx_defillama_pools_project`, `idx_defillama_pools_chain`, `idx_defillama_pools_apy DESC`, `idx_defillama_pools_tvl DESC`.
- `epsilon.defillama_dex_volumes` — protocol_slug PK, name, chains jsonb, total_24h, total_7d, total_alltime, change_1d_pct, fetched_at, updated_at. Index: `idx_defillama_dex_total_24h DESC`.
- `epsilon.defillama_fees` — protocol_slug PK, name, total_24h, total_7d, total_alltime, change_1d_pct, data_type (fees|revenue), fetched_at, updated_at. Index: `idx_defillama_fees_total_24h DESC`.
- `epsilon.defillama_stablecoins` — stablecoin_id integer PK, name, symbol, peg_type, peg_mechanism, circulating_usd, chains jsonb, price, fetched_at, updated_at.
- Migration `0004_defillama_tables.sql` được generate qua `bun run db:generate` và commit.

**AC3 — Endpoint URL mapping (Pro vs Free khác PATH, không chỉ swap base):**

| Endpoint | Free URL | Pro URL (proKey set) |
|---|---|---|
| `protocols` | `https://api.llama.fi/protocols` | `https://pro-api.llama.fi/{KEY}/api/protocols` |
| `pools` | `https://yields.llama.fi/pools` | `https://pro-api.llama.fi/{KEY}/yields/pools` |
| `dexs` | `https://api.llama.fi/overview/dexs` | `https://pro-api.llama.fi/{KEY}/api/overview/dexs` |
| `fees` | `https://api.llama.fi/overview/fees` | `https://pro-api.llama.fi/{KEY}/api/overview/fees` |
| `stablecoins` | `https://stablecoins.llama.fi/stablecoins` | `https://pro-api.llama.fi/{KEY}/stablecoins/stablecoins` |

Required helper `getDefillamaUrl(endpoint, proKey?)`. Query params luôn gửi: `dexs`/`fees` append `?excludeTotalDataChart=true&excludeTotalDataChartBreakdown=true`; `stablecoins` append `?includePrices=true`.

Worker job:
- Queue `defillama-sync`, Scheduler `sync-defillama-full`, Job name `fetch-defillama-all`.
- Interval `config.DEFILLAMA_SYNC_INTERVAL_MS` (default 3,600,000ms).
- Mỗi job run: fetch 5 endpoints tuần tự → bulk upsert (chunk 500 rows) → log.
- Log: `[defillama-worker] Synced protocols=${n} pools=${n} dexs=${n} fees=${n} stables=${n} in ${elapsed}ms`.

**AC4 — Per-category retry, không abort toàn job:**
- Per-category retry inline qua `fetchWithRetry(url, retries=3, baseDelayMs=60_000)` — exponential backoff (60s, 120s, 240s) cho 429/5xx, timeout 30s per fetch.
- BullMQ job-level retry: `attempts: 1` (không retry toàn job).
- Nếu 1 category fail tất cả retries → log warn + tiếp tục categories còn lại; KHÔNG throw.

**AC5 — Lifecycle wiring:**
- `startDefillamaWorker()` + `setupDefillamaWorkerJobs()` trong `startBackgroundServices()` (sau `setupCryptoWorkerJobs()`).
- `stopDefillamaWorker()` trong `shutdown()` (sau `stopCryptoWorker()`).
- Khi `DEFILLAMA_WORKER_ENABLED=false` → log info và return null.

**AC6 — Two-tier cache trong `jit-sync.ts` (Story 1.2 backward compatible):**
- Hot tier: ~15 protocols trong `protocol_watchlist` → query `protocol_tvl_snapshots` (refresh 5min, Story 2.1).
- Full tier: ~7,000 protocols → query `defillama_protocols` (refresh 1h, Story 2.4).
- Lookup priority: nếu slug có trong `protocol_watchlist active` → hot tier; otherwise → full tier; cả hai miss/stale → in-memory cache → live fetch.
- Cả hai tier set `source: 'db_cache'` khi hit fresh.
- Backward compat: 15 protocols hot không thay đổi behavior.

**AC7 — TypeScript clean:**
- `cd apps/api && npx tsc --noEmit` không có lỗi mới từ story này.

**FRs:** FR2
**NFRs:** NFR4, NFR5
**ARs:** AR1, AR2, AR3, AR8

---

### Story 2.5: Token Price Lookup Tool

As a Epsilon agent xử lý crypto query,
I want gọi tool `price_lookup` để lấy giá realtime của bất kỳ token nào theo contract address,
So that agent có thể trả lời "giá USDC trên Ethereum hiện tại là bao nhiêu?" với data chính xác thay vì training data lỗi thời.

**Dependency:** Story 2.4 (cần `getDefillamaUrl` helper và `DEFILLAMA_PRO_API_KEY` config var).

**Acceptance Criteria:**

**AC1 — JIT route `/v1/router/jit-sync/price`:**
- `GET /v1/router/jit-sync/price?coins={chain}:{address},{chain}:{address},...`
- Tối đa 100 tokens per request (URL length constraint).
- Endpoint mapping (extend `getDefillamaUrl` từ Story 2.4):

  | Mode | URL |
  |---|---|
  | Free (no proKey) | `https://coins.llama.fi/prices/current/{coins}` |
  | Pro (proKey set) | `https://pro-api.llama.fi/{KEY}/coins/prices/current/{coins}` |

- In-memory cache TTL 5 phút (key = sorted coin list).
- Response: `{ coins: { "ethereum:0x...": { price, symbol, timestamp, confidence, decimals } }, source: 'cache_fresh'|'live', fetched_at }`.

**AC2 — Billing:**
- `checkCredits` trước, `deductToolCredits` sau success qua `queueMicrotask`.
- Tool cost: `getToolCost('price_lookup', 0)` — entry mới trong TOOL_COSTS map.

**AC3 — OpenCode tool `price_lookup.ts`:**
- File: `core/epsilon-master/opencode/tools/price_lookup.ts`.
- Args: `coins` (required, comma-separated `chain:address`), `session_id` (optional).
- Gọi `${EPSILON_API_URL}/v1/router/jit-sync/price` với `Bearer ${EPSILON_TOKEN}`.
- Timeout: `AbortSignal.timeout(2000)`.
- Returns formatted: "ETH: $3,245.50 (conf 0.99) | USDC: $1.00 (conf 0.99) | ..."

**AC4 — Validation:**
- Regex: `/^[a-z0-9-]+:0x[a-f0-9]{40}$/i` cho EVM, `/^coingecko:[a-z0-9-]+$/i` cho CoinGecko ID.
- EVM addresses lowercase-normalize.
- Max 100 tokens — trả lỗi rõ ràng nếu vượt.

**AC5 — TypeScript clean, không regression tests.**

**FRs:** FR2, FR19
**NFRs:** NFR2, NFR4
**ARs:** AR1, AR2, AR6, AR8

---

### Story 2.6: Yields APY Lookup Tool

As a Epsilon agent tư vấn DeFi yield farming,
I want gọi tool `yields_lookup` để query APY pools theo protocol/chain/symbol từ data đã được pre-indexed,
So that agent có thể trả lời "pool nào trên Arbitrum đang có APY cao nhất?" trong < 500ms.

**Dependency:** Story 2.4 (cần `defillama_pools` table + 4 indexes).

**Acceptance Criteria:**

**AC1 — JIT route `/v1/router/jit-sync/yields`:**
- `GET /v1/router/jit-sync/yields?protocol={slug}&chain={chain}&min_tvl={usd}&limit={n}&stablecoin_only={true|false}`.
- Tất cả params optional. Default: top 20 pools theo APY với `min_tvl` 100,000 USD (filter noise).
- Filter: `WHERE tvl_usd >= min_tvl AND (project = ? hoặc chain = ?) AND (stablecoin = ? optional)`.
- Sort: `ORDER BY apy DESC LIMIT limit` (max 50, default 10).
- Response: `{ pools: [...], count, query_params, source: 'db_cache', fetched_at }`.
- **Performance target**: P95 < 500ms — đạt được nhờ 4 indexes từ Story 2.4 (`idx_defillama_pools_apy`, `_project`, `_chain`, `_tvl`).

**AC2 — Freshness check:**
- Query `MAX(updated_at) FROM defillama_pools` đầu request.
- Nếu empty hoặc `updated_at` > `2 * DEFILLAMA_SYNC_INTERVAL_MS` (2h default) → `{ source: 'no_data', error: 'Pool data stale' }`.
- **Không** fallback realtime (yields.llama.fi `/pools` 5-15MB → quá lớn cho synchronous handler).

**AC3 — Billing:**
- `checkCredits` + `deductToolCredits` qua `queueMicrotask`.

**AC4 — OpenCode tool `yields_lookup.ts`:**
- File: `core/epsilon-master/opencode/tools/yields_lookup.ts`.
- Args: `protocol`, `chain`, `min_tvl_usd` (default 100000), `limit` (default 10), `stablecoin_only` (optional).
- Timeout: `AbortSignal.timeout(2000)`.
- Returns markdown table với 5 columns: Pool | APY | TVL | Chain | Risk (il_risk).

**AC5 — TypeScript clean, không regression tests.**

**FRs:** FR2, FR19
**NFRs:** NFR2, NFR4
**ARs:** AR1, AR2, AR6, AR8

---

### Story 2.7: DeFiLlama Pro Data Tools (Hacks, Token Unlocks, Bridges)

As a Epsilon agent phân tích rủi ro crypto,
I want gọi tool `risk_lookup` để query lịch sử hack, token unlock schedule, và bridge volumes cho một protocol/token,
So that agent có thể cảnh báo user về rủi ro bảo mật và sell pressure từ token unlocks trước khi họ invest.

**Dependencies:**
- Story 2.4 (cần `defillama-worker.ts` để extend, `getDefillamaUrl` helper, `DEFILLAMA_PRO_API_KEY` config).
- Hacks/Emissions endpoints **CHỈ available với Pro key** — story 2.7 sẽ skip 2 categories đó nếu Pro key chưa set, chỉ crawl bridges (Free).

**Acceptance Criteria:**

**AC1 — DB schema (3 tables mới):**
- `epsilon.defillama_hacks` (~500 rows historical) — hack_id varchar(200) PK (composite: `${slug-name}-${date}`), name, date timestamptz, amount_usd, chain, classification, technique, target_type, returned_funds_usd, fetched_at. Indexes: `idx_defillama_hacks_name`, `idx_defillama_hacks_date DESC`.
- `epsilon.defillama_token_unlocks` (~500 protocols) — token_id varchar(100) PK, name, symbol, circ_supply, total_locked, max_supply, next_unlock_date, next_unlock_amount_usd, unlocks_per_day, mcap, fetched_at, updated_at. Indexes: `idx_defillama_unlocks_symbol`, `idx_defillama_unlocks_next_date`.
- `epsilon.defillama_bridges` (~50 rows) — bridge_id integer PK, name, display_name, weekly_volume_usd, monthly_volume_usd, chains jsonb, fetched_at, updated_at. Index: `idx_defillama_bridges_name`.
- Migration `0005_defillama_pro_tables.sql`.

**AC2 — Endpoint URL mapping (extend `getDefillamaUrl` từ Story 2.4):**

| Endpoint | Pro-only? | Pro URL | Free URL |
|---|---|---|---|
| `hacks` | ✅ Pro-only | `https://pro-api.llama.fi/{KEY}/api/hacks` | N/A |
| `emissions` | ✅ Pro-only | `https://pro-api.llama.fi/{KEY}/api/emissions` | N/A |
| `bridges` | Both | `https://pro-api.llama.fi/{KEY}/bridges/bridges` | `https://bridges.llama.fi/bridges` |

Khi `hacks`/`emissions` được gọi mà không có proKey → throw `Error('Pro API key required')`.

**AC3 — Worker crawl (extend `defillama-worker.ts` từ Story 2.4):**
- **Bridges**: thêm vào job chính `fetch-defillama-all` (hourly, cùng với 5 categories từ Story 2.4). Không yêu cầu Pro key.
- **Hacks + Emissions**: scheduler riêng `sync-defillama-pro-daily` với cron pattern `41 2 * * *` (UTC) — job name `fetch-defillama-pro-daily`.
- 1 worker, 2 schedulers cùng queue `defillama-sync` — dispatch theo `job.name`.
- Guard: nếu `!config.DEFILLAMA_PRO_API_KEY` trong `processProDailyJob()` → log info `[defillama-worker] Pro key not set, skipping hacks/emissions` và return.
- Per-category retry pattern giống Story 2.4 (`fetchWithRetry`).

**AC4 — JIT route `/v1/router/jit-sync/risk`:**
- `GET /v1/router/jit-sync/risk?protocol={slug}&token={symbol}` — ít nhất 1 trong 2 params required.
- Sanitize `protocol` để escape `%` và `_` trong ILIKE pattern (tránh wildcard injection).
- Query 3 tables song song qua `Promise.all`:
  - `defillama_hacks` WHERE `name ILIKE '%' || protocol || '%'`
  - `defillama_token_unlocks` WHERE `symbol = token` HOẶC `name ILIKE '%' || protocol || '%'`
  - `defillama_bridges` WHERE `name ILIKE '%' || protocol || '%'`
- Compute `risk_score` (xem dưới).
- Response: `{ hacks: [...], upcoming_unlocks: [...], bridge_volume: {...}|null, risk_score: 'HIGH'|'MEDIUM'|'LOW', source: 'db_cache', fetched_at }`.
- `checkCredits` + `deductToolCredits` qua `queueMicrotask`. Tool cost cao hơn (Pro data).

`risk_score` logic:
- HIGH: hack trong 12 tháng qua HOẶC unlock > 10% của mcap trong 30 ngày tới.
- MEDIUM: hack trong 24 tháng qua HOẶC unlock > 5% của mcap trong 30 ngày tới.
- LOW: không có điều kiện trên.

**AC5 — OpenCode tool `risk_lookup.ts`:**
- File: `core/epsilon-master/opencode/tools/risk_lookup.ts`.
- Args: `protocol` (string, required), `token_symbol` (optional).
- Gọi `${EPSILON_API_URL}/v1/router/jit-sync/risk` với `Bearer ${EPSILON_TOKEN}`.
- Timeout: `AbortSignal.timeout(2000)`.
- Returns formatted risk report (HIGH/MEDIUM/LOW với hacks/unlocks/bridge details).

**AC6 — TypeScript clean, không regression tests.**

**FRs:** FR2, FR21
**NFRs:** NFR2, NFR4
**ARs:** AR1, AR2, AR3, AR6, AR8

---

## Epic 3: Crypto Native Trading UI

Phát triển các React Server Components và Generative AI Widgets cho dashboard DeFi/market, advanced charting TradingView, token detail page, và streaming UI từ OpenCode.

**FRs:** FR7, FR9, FR10
**NFRs:** NFR1, NFR4
**ARs:** AR4, AR7, AR8

### Story 3.1: DeFi & Market Dashboard Page

As a crypto investor,
I want xem bảng Yield/TVL đa cột có sort và Sparklines cho các protocols,
So that tôi compare performance giữa DeFi protocols nhanh mà không cần mở nhiều tab.

**Acceptance Criteria:**

**Given** user truy cập `/dashboard/markets`
**When** Next.js server component render
**Then** bảng hiển thị danh sách protocols với columns: Protocol, TVL, APY 7d, APY 30d, Chain, Change 24h — có thể sort theo từng column
**And** mỗi row có sparkline chart 7d trend inline

**Given** Nansen Smart Money data đã được indexed
**When** dashboard render Smart Money Flow Visualizer section
**Then** visualizer hiển thị top wallet movements (inflow/outflow) với direction indicators
**And** data refresh không cần full page reload

### Story 3.1.1: Multi-dimensional Narrative Screener (Deep Dive)

As a crypto investor,
I want hệ thống có bộ lọc đa chiều kết hợp On-chain, Social và Financial Data,
So that tôi có thể tìm kiếm các token thỏa mãn nhiều điều kiện phức tạp (e.g. Market Cap < 100M, Smart Money Inflow > 1M, P/S < 5).

**Acceptance Criteria:**

**Given** dữ liệu từ Nansen, Dune và TokenTerminal đã được index
**When** user truy cập Screener UI hoặc gõ prompt cho Agent
**Then** bảng kết quả trả về các token pass filter, sắp xếp theo điểm Narrative
**And** kết quả render dưới dạng Heatmap (Bản đồ nhiệt) để dễ visualize dòng tiền.

### Story 3.2: TradingView Advanced Charting

As a trader,
I want xem TradingView candlestick chart với overlay MA và RSI cho bất kỳ token nào,
So that tôi phân tích kỹ thuật trực tiếp trong Chainlens thay vì switch sang TradingView.

**Acceptance Criteria:**

**Given** user navigate đến `/dashboard/chart/[token]`
**When** chart page load
**Then** TradingView Lightweight Charts render candlestick OHLCV data cho token được chọn
**And** overlay Moving Averages (MA20, MA50) hiển thị mặc định trên chart

**Given** user enable RSI panel
**When** RSI overlay được toggle on
**Then** RSI panel xuất hiện phía dưới candlestick chart với overbought (70) và oversold (30) lines
**And** chart component dùng `"use client"` directive vì TradingView yêu cầu browser APIs — parent page vẫn là server component



### Story 3.2.1: On-chain Data Chart Overlays (Deep Dive)

As a pro trader,
I want xem biểu đồ giá với các lớp dữ liệu On-chain (Net Exchange Flow, Liquidation Heatmap),
So that tôi có thể phân tích tâm lý cá mập trực tiếp trên biểu đồ.

**Acceptance Criteria:**

**Given** biểu đồ OHLCV đang mở
**When** user bật tính năng On-chain Overlay
**Then** biểu đồ hiển thị thêm lớp dữ liệu Net Exchange Flow hoặc Liquidation Heatmap từ Glassnode/Nansen.

### Story 3.3: Generative AI Chat Widgets

As a user chat với Epsilon agent,
I want agent trả về UI components thay vì plain text khi query về token hoặc contract,
So that thông tin được hiển thị dạng structured card dễ đọc và có thể interact.

**Acceptance Criteria:**

**Given** user hỏi agent về một token cụ thể
**When** OpenCode response được stream qua Vercel AI SDK `streamUI`
**Then** Token Info Widget render với price, market cap, 24h volume, và % change
**And** widget là server-rendered shell với chỉ interactive elements dùng `"use client"`

**Given** agent phát hiện smart contract address trong query
**When** Risk Badge component được stream
**Then** badge hiển thị risk level (LOW/MEDIUM/HIGH/CRITICAL) với màu-coded indicator
**And** tooltip expand để show top 3 risk factors

**Given** user yêu cầu simulate một transaction
**When** Transaction Simulation Card được stream
**Then** card hiển thị estimated gas cost, expected outcome, và slippage estimate
**And** card có nút "Run in Sandbox" nếu user là Tier 2 (disabled với tooltip cho Tier 1)



### Story 3.3.1: Contract Audit Decompiler & Yield Simulator Widgets (Deep Dive)

As a security-conscious farmer,
I want Agent trả về Widget giải mã Smart Contract và giả lập lợi nhuận farming,
So that tôi có thể kiểm tra rủi ro mã nguồn và rủi ro Impermanent Loss trực tiếp trong khung chat.

**Acceptance Criteria:**

**Given** user dán một Smart Contract chưa verify
**When** Agent xử lý
**Then** trả về Widget chấm điểm rủi ro bảo mật (Decompiler Widget)
**And** khi user hỏi về farming yield, trả về Simulator Widget cho phép kéo thanh trượt giả định giá để tính IL và ROI.

### Story 3.3.2: Sub-Agent Activity & Tool Execution Drawer (Transparency UI)

As a Chainlens user,
I want thấy một "Action Button" (nút trạng thái) ở bên phải ô chat hoặc tin nhắn, cho phép mở rộng để xem Sub-Agents đang làm gì,
So that tôi biết AI đang không bị treo, hiểu được các tool (như Web Search, JIT Sync, Code Validator) đang được gọi và dữ liệu thô trả về.

**Acceptance Criteria:**

**Given** Agent bắt đầu gọi một tool hoặc trigger một Sub-Agent (e.g., Tier 2 Sandbox)
**When** quá trình đang diễn ra
**Then** giao diện chat hiển thị một nút Action dạng pill (ví dụ: "⚡ JIT Syncing...", "🔍 Deep Researching...") có hiệu ứng pulse/loading ở góc trên bên phải của chat bubble.
**And** khi user click vào nút này, một Drawer/Accordion mở ra hiển thị log real-time của Sub-Agent (Console output, Tool Args, Tool Results).

**Given** Sub-Agent hoàn thành task
**When** kết quả cuối cùng được render ra màn hình
**Then** nút Action chuyển sang trạng thái "Done" (tick xanh mờ) và thu gọn lại để không làm rối UI chính, nhưng user vẫn có thể click để xem lại lịch sử thought-process.

**Note on UI/UX Regression (2026-05-11):** 
A recent frontend refactoring inadvertently removed the Collapsible (Accordion) wrapper for tool executions, causing raw logs to be dumped inline. This violates the "Progressive Disclosure" design principle and causes cognitive overload. Developers MUST ensure that all tool outputs and reasoning steps are wrapped inside the collapsible Action Button (Pill) placed on the right side of the chat interface, keeping the default view clean and high-signal.

### Story 3.4: Token Detail Page

As a crypto user click vào một token (từ extension, dashboard, hoặc URL trực tiếp),
I want xem trang detail tổng hợp price chart, risk analysis, holders, và recent transactions,
So that tôi có view toàn diện về token tại một URL canonical.

**Acceptance Criteria:**

**Given** user navigate đến `/token/[address]` (canonical URL được dùng bởi browser extension)
**When** Next.js server component render
**Then** trang fetch token metadata, hiển thị: price, market cap, 24h change ở header
**And** TradingView chart từ Story 3.2 được embed làm primary section

**Given** trang đã render header và chart
**When** scroll xuống
**Then** hiển thị: Risk Analysis section (sử dụng Risk Badge từ Story 3.3), Top Holders table, và Recent Transactions list
**And** mỗi section là server component độc lập với loading state riêng (Suspense boundary)

**Given** address không hợp lệ hoặc không phải token address
**When** trang load
**Then** hiển thị 404 page với gợi ý "Có thể bạn đang tìm: [danh sách tokens gần giống]"
**And** không crash, không infinite loading



### Story 3.4.1: Tokenomics Vesting & Holder Gini Coefficient (Deep Dive)

As a fundamental analyst,
I want xem lịch trả token (Vesting) trực quan và phân tích độ phân bổ holder (Gini),
So that tôi biết khi nào có nguy cơ dump hàng lớn từ team/VC.

**Acceptance Criteria:**

**Given** user xem trang Token Detail
**When** cuộn đến phần Tokenomics
**Then** hiển thị đồ thị Vesting Schedule từ TokenUnlocks API
**And** hiển thị Liquidity Depth Analysis và Gini Coefficient để cảnh báo rủi ro xả hàng từ Top 10 Holders.


## Epic 4: Web3 Identity

Tích hợp Web3 Auth Module (MetaMask, WalletConnect, Phantom) vào Next.js App Router với SIWE signature authentication, wallet ↔ user binding trong DB, và agnostic multi-chain support.

**FRs:** FR6, FR20
**NFRs:** NFR12
**ARs:** AR3, AR4, AR7, AR8

### Story 4.1: Wallet Connection với SIWE Authentication

As a crypto user,
I want kết nối ví MetaMask hoặc WalletConnect và authenticate bằng signature challenge (SIWE),
So that backend verify được tôi thực sự own ví đó, không chỉ claim địa chỉ.

**Acceptance Criteria:**

**Given** user chưa kết nối ví
**When** user click "Connect Wallet" button trong header
**Then** modal hiển thị các options: MetaMask và WalletConnect v2
**And** sau khi user chọn provider, ví được prompt để approve connection

**Given** ví đã connect (bước 1)
**When** Chainlens initiate SIWE flow
**Then** backend generate nonce (single-use, 5-minute TTL), trả về SIWE message theo EIP-4361 format
**And** ví được prompt yêu cầu user ký message; user phải explicit approve

**Given** user ký message thành công
**When** signature được gửi về backend
**Then** backend verify signature match với address dùng `viem` hoặc tương đương
**And** nếu valid, session JWT được tạo và set vào HttpOnly cookie; nếu invalid, return 401 và yêu cầu retry

**Given** authentication thành công
**When** UI render header
**Then** địa chỉ ví được rút gọn (0x1234...abcd) hoặc ENS name (nếu có) hiển thị
**And** private key, seed phrase KHÔNG được request, lưu trữ, hoặc truyền đến server bất kỳ lúc nào — chỉ signature được transmit

### Story 4.2: Phantom Wallet & Multi-Chain Switcher

As a Solana user,
I want kết nối Phantom wallet và switch giữa Ethereum, Arbitrum, và Solana,
So that tôi dùng Chainlens cho cả EVM và Solana ecosystem mà không cần nhiều account.

**Acceptance Criteria:**

**Given** user chọn kết nối Phantom
**When** wallet connect thành công
**Then** Solana wallet address hiển thị rút gọn và SOL balance được fetch và hiển thị
**And** network indicator trong header show "Solana"

**Given** user muốn switch network
**When** user click network switcher dropdown
**Then** dropdown hiển thị các options: Ethereum Mainnet, Arbitrum One, Solana
**And** khi chọn network mới, balance được refetch tự động cho network đó

**Given** wallet không hỗ trợ network được chọn (ví dụ MetaMask không support Solana)
**When** user cố switch sang network incompatible
**Then** tooltip hiển thị "Network này yêu cầu ví [X]" — không crash, không show error unhandled

### Story 4.3: Wallet ↔ User Account Binding

As a returning user,
I want ví của tôi được link với một user record persistent trong DB,
So that profile data, watchlist, và credit balance được giữ nguyên giữa các session.

**Acceptance Criteria:**

**Given** schema additive cho user wallet linking được tạo trong `packages/db/src/schema/`
**When** Drizzle migration chạy
**Then** table `user_wallets` được thêm với columns: `user_id`, `address` (unique), `chain_type` (evm/solana), `is_primary`, `linked_at`, `ens_name` (nullable, cached)
**And** không rename hoặc drop existing columns/tables (AR3 compliance)

**Given** user lần đầu authenticate qua SIWE (Story 4.1)
**When** signature verify thành công
**Then** backend lookup `user_wallets` theo address — nếu không tồn tại, tạo user record mới và insert wallet binding
**And** session JWT chứa `user_id` để các API khác lookup nhanh

**Given** user đã có account và muốn link thêm ví thứ 2 (e.g. Phantom sau MetaMask)
**When** user authenticate ví mới trong khi đang logged in
**Then** ví mới được insert vào `user_wallets` với `is_primary=false`, link cùng `user_id`
**And** UI hiển thị danh sách ví đã linked trong Settings → Wallets

**Given** ENS name được resolve cho một địa chỉ
**When** ENS lookup thành công
**Then** `ens_name` được cache vào `user_wallets` row với TTL 24h để tránh re-fetch mỗi request
**And** background job refresh stale ENS cache định kỳ qua existing BullMQ queue

## Epic 5: Backtesting Sandbox

Kết nối Vibe Trading API vào Epsilon MicroVM sandbox và xây dựng Backtest Visualizer với Monaco Editor + KPI cards.

**FRs:** FR3, FR11
**NFRs:** NFR3, NFR10
**ARs:** AR2, AR4, AR8

### Story 5.0: Vibe-Trading Platform Foundation (Infrastructure)

As a Chainlens platform operator,
I want Vibe-Trading FastAPI service + Celery worker + Redis broker deployed on Chainlens server với hardened sandbox egress + pool env injection ready,
So that subsequent stories (5.1 OpenCode tool, 5.4+) integrate without re-doing infra work, AND egress whitelist pattern reusable cho future Tier 2 services.

**Acceptance Criteria:**

**Given** repo `Vibe-Trading/` đã có FastAPI + Celery worker + Dockerfile
**When** Story 5.0 deploy
**Then** 3 services chạy alongside epsilon-api trên Docker network: vibe-trading (port 8899), vibe-trading-worker (Celery), redis (broker)
**And** sandbox egress whitelist deny-by-default + allow only epsilon-api + vibe-trading + DNS
**And** pool env injection populates VIBE_TRADING_API_KEY + VIBE_TRADING_INTERNAL_URL trong sandbox containers

**Given** sandbox container provisioned từ pool
**When** dev exec test commands inside sandbox
**Then** `curl http://vibe-trading:8899/health` → 200, `curl https://example.com` → DROP

**Note**: This is infrastructure-only foundation. Backend route + OpenCode tool come in Story 5.1 (separate scope, separate PR review).

### Story 5.0.1: Shadow Account Volume Hotfix (Platform Infra) *(hotfix)*

As a Chainlens platform operator,
I want Docker volumes mounted at `~/.vibe-trading/shadow_accounts/` và `~/.vibe-trading/shadow_reports/`
inside vibe-trading + vibe-trading-worker containers,
So that Shadow Account strategies và rendered reports persist qua container restarts.

**Depends on:** Story 5.0 done. **Blocks:** Story 5.6.

**Context:** Story 5.0 provisioned `vibe-trading-runs` + `vibe-trading-sessions` volumes
nhưng missed shadow state dirs. Retroactive hotfix cần thiết trước khi Story 5.6 ship.

**Acceptance Criteria:**

**Given** `scripts/compose/docker-compose.yml` currently has 2 VT volumes
**When** Story 5.0.1 ships
**Then** 2 new named volumes added: `vibe-trading-shadow-accounts`, `vibe-trading-shadow-reports`
**And** both mounted at user home dir shadow paths in `vibe-trading` + `vibe-trading-worker` services
**And** existing volumes unchanged (no data loss, rolling deploy safe)

### Story 5.0.2: Sandbox Token Sync Reliability — P0 Hotfix *(hotfix)*

As a Chainlens platform operator,
I want sandbox `EPSILON_TOKEN` consistent across 4 storage layers (apps/api .env, DB `epsilon.sandboxes.config.serviceKey`, container `.bootstrap-env.json`, s6 env dir),
So that signed `X-Epsilon-User-Context` HMAC verifies successfully every request — restoring per-user features (memory inject, spending-cap gating, audit attribution).

**Depends on:** Story 5.0 done. **Blocks:** Story 5.8 (memory UI), Story 5.6 (Shadow UI), Story 5.4 (spending-cap), any future per-user feature.

**FRs:** N/A (infrastructure). **NFRs:** NFR8 (atomic billing — currently degrading to anonymous on drift), NFR10 (sandbox isolation), AR8 (security).
**ARs:** AR1, AR3, AR8.

**Context:** Empirical debug session 2026-05-18 (1h) revealed 3 distinct `epsilon_sb_*` values across 4 storage layers caused `[epsilon-user] bad_signature` silent drops → `stampSessionOwner` never fires → `session_owners` SQLite empty → plugin `lookupSessionOwner` returns null → memory inject + spending-cap silently disabled. Reference: [_bmad-output/planning-artifacts/architecture-notes-token-sync-2026-05-18.md](_bmad-output/planning-artifacts/architecture-notes-token-sync-2026-05-18.md).

**Scope (P0 only — STOP THE BLEED):**

**Given** `[epsilon-user] Ignoring bad X-Epsilon-User-Context (bad_signature)` is currently logged as WARN with zero alerting
**When** Story 5.0.2 ships
**Then** `bad_signature` events emit to Sentry/Logtail with rate limit (1 alert per 5-min window per sandbox)
**And** dashboard panel shows `bad_signature_count` per sandbox per hour (Grafana or equivalent)

**Given** apps/api signs HMAC with `epsilon.sandboxes.config.serviceKey` (DB lookup)
**And** epsilon-master verifies HMAC with `process.env.EPSILON_TOKEN` (in-container s6 env)
**And** these can drift independently (sandbox restart → bootstrap-env.json mutation)
**When** verification fails with `bad_signature`
**Then** apps/api `epsilonUserContextMiddleware` triggers a one-shot reconcile: read container bootstrap via existing `docker exec` fallback, UPDATE `epsilon.sandboxes.config.serviceKey`, invalidate `providerCache` entry, retry request once
**And** if reconcile succeeds, log `[reconcile] sandbox=X drift detected and resolved` (INFO level)
**And** if reconcile fails or token still mismatches after retry, return 401 (not silent drop) so caller sees failure

**Given** `provisionSandboxFromCheckout` ([sandbox-provisioner.ts:32](apps/api/src/platform/services/sandbox-provisioner.ts#L32)) generates new token on provision
**When** Story 5.0.2 ships
**Then** provision writes token atomically to 3 layers in a single transaction: (1) DB `sandboxes.config.serviceKey`, (2) container bootstrap via `docker exec`, (3) apps/api in-process cache
**And** if any of the 3 writes fails, the whole provision rolls back (no half-provisioned sandbox)
**And** unit test verifies rollback path: simulate DB write success but `docker exec` fail → expect sandbox marked `error` with reason `token_provision_partial`

**Given** `local-preview.ts` already has 401 retry hook that reads container bootstrap on Bearer-token failure
**When** Story 5.0.2 ships
**Then** that hook is extended to also push the read key back into `apps/api/.env INTERNAL_SERVICE_KEY` (via filesystem write, NOT just DB) so subsequent backend restarts use the correct value
**And** in `ENV_MODE=cloud`, this filesystem write is skipped (secrets manager owns the cloud key)

**Estimated effort:** 1 day. **Owner:** Bao (DevOps).

### Story 5.0.3: Sandbox Token Lifecycle — DB-Canonical Migration *(P1, deferred)*

As a Chainlens platform operator,
I want `epsilon.sandboxes.config.serviceKey` to be the single source of truth for sandbox tokens (with `.env` static fallback only for local dev),
So that future rotation, multi-sandbox provisioning, and BYOK encryption derivation have a predictable invariant.

**Depends on:** Story 5.0.2 done.
**Blocks:** Future cloud-scale (>10 sandboxes per tenant), Story 5.7 BYOK key derivation, SOC2 audit trail completeness.

**FRs:** N/A. **NFRs:** NFR8, NFR10. **ARs:** AR1, AR3, AR8.

**Decision (per architect note 2026-05-18): hybrid Option A + Option C:**
- **Cloud** (Daytona, JustAVPS): DB-canonical, sandbox pulls token from `GET /v1/internal/bootstrap-token` on boot. Bootstrap file becomes read-only mirror of DB.
- **Local dev** (`epsilon-sandbox` container): Static `INTERNAL_SERVICE_KEY` from `apps/api/.env` mounted into container via Docker volume bind. No mutation paths.

**Acceptance Criteria:**

**Given** cloud sandbox boots fresh
**When** epsilon-master starts inside container
**Then** boot script calls `GET ${EPSILON_API_URL}/v1/internal/bootstrap-token?sandboxId=${SANDBOX_ID}` with `Authorization: Bearer ${PROVISIONING_KEY}` (separate short-lived key from provisioning step)
**And** apps/api validates `PROVISIONING_KEY`, returns canonical `serviceKey` from DB
**And** sandbox writes returned key to s6 env + bootstrap file as read-only mirror
**And** `saveBootstrapEnv()` is deprecated — replaced with `loadCanonicalToken()` that NEVER mutates DB

**Given** local-dev sandbox boots
**When** docker-compose starts `epsilon-sandbox` container
**Then** `INTERNAL_SERVICE_KEY` is bind-mounted as read-only file from host `apps/api/.env`-derived secret
**And** container does NOT regenerate or mutate the key
**And** rotation requires manual `.env` edit + `docker compose restart` (documented in CLAUDE.md troubleshooting)

**Given** drift reconciler cron runs every 1-min in apps/api
**When** Story 5.0.3 ships
**Then** reconciler queries each active sandbox: compares DB serviceKey vs container bootstrap vs s6 env (via existing `/env/INTERNAL_SERVICE_KEY` route)
**And** emits Prometheus metric `sandbox_token_drift_total{sandbox_id, source_pair}` when any pair differs
**And** in cloud mode: auto-heals from DB (writes DB value into container)
**And** in local mode: alerts only (no auto-heal — operator owns it)

**Given** `epsilon.sandboxes.config.serviceKey` is rotated via admin API
**When** Story 5.0.3 ships
**Then** apps/api emits rotation event, all open WebSocket / SSE connections re-authenticate with new key
**And** in-flight requests using old key complete (grace period 30s)
**And** after grace, old key rejected with 401

**Estimated effort:** 3 days. **Owner:** Bao + Luisphan code review.

### Story 5.0.4: Sandbox Token Drift — Chaos & Regression Tests *(P1, deferred)*

As a Chainlens QA owner,
I want chaos tests that simulate sandbox restart, key rotation, and bootstrap-file corruption to prove drift detection + auto-heal work end-to-end,
So that Story 5.0.2/5.0.3 don't regress as cloud provisioning logic evolves.

**Depends on:** Story 5.0.2 done. Strongly recommended before 5.0.3 ships.

**FRs:** N/A. **NFRs:** NFR8, NFR10. **ARs:** AR1, AR8.

**Acceptance Criteria:**

**Given** Playwright E2E test harness
**When** Story 5.0.4 ships
**Then** test `sandbox-token-drift-recovery.spec.ts`:
  - Provisions a sandbox
  - Verifies session creation works (signature OK)
  - Forces drift: `docker exec epsilon-sandbox sh -c "echo bogus > /run/s6/container_environment/EPSILON_TOKEN"`
  - Triggers new session create
  - Asserts P0.2 reconcile fires, session creation succeeds within 2 retries
  - Asserts `session_owners` row stamped within 2s

**Given** unit test for `verifyEpsilonUserContext`
**When** Story 5.0.4 ships
**Then** new test: sign with key A, verify with key B → returns `{ok: false, reason: 'bad_signature'}` (fail closed, never silently fallback to anonymous)

**Given** integration test for `provisionSandboxFromCheckout`
**When** Story 5.0.4 ships
**Then** new test: mock `docker exec` to fail → expect provision rolls back, sandbox marked `error`, DB row reverted

**Estimated effort:** 1 day. **Owner:** TestArch (Murat) + Bao.

### Story 5.1: Vibe Trading Backend Proxy + OpenCode Tool

As a Tier 2 user,
I want OpenCode agent trong sandbox call `vibe_trading_backtest` tool để submit backtest jobs (asset config + risk params) và progressively lấy kết quả khi Vibe-Trading hoàn thiện engine,
So that tôi iterate trên trading strategy mà không cần tự deploy Python backtest infra.

**Depends on:** Story 5.0 done.

**Acceptance Criteria:**

**Given** Story 5.0 done (services deployed, egress whitelist active, pool env injection working)
**When** Story 5.1 implements backend route `/v1/router/vibe-trading/{jobs,runs}` + OpenCode tool `vibe_trading_backtest`
**Then** Tier 2 agent invoke tool → backend proxies to Vibe-Trading với atomic billing + tier-bypass log
**And** tool poll `/runs/{job_id}` mỗi 1s với 30s budget, handle Phase A response (data_summary, current VT state) và Phase B response (full metrics, after VT Epic 2.3 done)

**Given** backtest job đang chạy trong sandbox
**When** tool execute exceeds 30s wall-clock
**Then** tool's `AbortSignal.timeout(30_000)` fires → return timeout error với retry hint + job_id (job continues background)
**And** sandbox container KHÔNG bị kill — user retry trong cùng session với reduced params

**Note**: Sandbox egress allow-list (Story 5.0) restricts outbound to epsilon-api + vibe-trading only. Tool MUST go through epsilon-api proxy, not direct call.

### Story 5.2: Backtest Strategy Editor (Monaco Editor)

As a Tier 2 user,
I want soạn thảo và chỉnh sửa trading strategy trong Monaco Editor ngay trong trình duyệt,
So that tôi iterate nhanh trên strategy code mà không cần IDE riêng.

**Acceptance Criteria:**

**Given** user truy cập `/dashboard/backtest`
**When** trang load
**Then** Monaco Editor render với syntax highlighting cho TypeScript và Python
**And** editor component dùng `"use client"` directive — parent page layout là server component

**Given** user viết xong strategy và click "Run Backtest"
**When** code được submit
**Then** code được gửi qua API endpoint đến sandbox để execute
**And** editor hiển thị loading state với estimated time trong khi sandbox chạy

### Story 5.3: Backtest Results Visualizer

As a Tier 2 user,
I want xem KPI cards và Equity Curve Chart sau khi backtest chạy xong,
So that tôi đánh giá performance của strategy so với benchmark.

**Acceptance Criteria:**

**Given** backtest hoàn thành trong sandbox
**When** kết quả được stream qua SSE về frontend
**Then** KPI cards render: Sharpe Ratio, Max Drawdown, Total Return, Win Rate — với màu green/red theo positive/negative
**And** Equity Curve Chart hiển thị strategy performance vs BTC buy-and-hold benchmark trên cùng trục thời gian

**Given** backtest thất bại hoặc timeout
**When** error được nhận từ sandbox
**Then** error message rõ ràng hiển thị trong results panel thay vì KPI cards
**And** user có thể chỉnh sửa strategy và retry ngay trong editor mà không cần reload page

### Story 5.4: Contextual Backtest Integration (Chat & Chart)

As a Quant Trader or Analyst,
I want to trigger a backtest directly from a Chart view or AI Chat interaction via a popup Strategy Editor,
So that I can seamlessly review, edit, and execute AI-generated strategies without switching contexts.

**Acceptance Criteria:**

**Given** the user is viewing a Chart or chatting with the AI agent
**When** the AI suggests a strategy or the user clicks "Run Backtest" on the chart toolbar
**Then** a "⚡ Review & Run Backtest" action card/button is presented
**And** clicking it opens a Modal/Popup containing the Strategy Editor (Monaco) pre-filled with the asset, timeframe, and generated code

**Given** the Contextual Backtest Modal is open
**When** the user clicks "Run Backtest" inside the Modal
**Then** the execution flows through the Vibe Sandbox as normal
**And** the Equity Curve and KPI results are rendered directly inside the Modal or inline in the Chat

### Story 5.5: Vibe-Trading MCP Proxy — Full 21-Tool Unlock

As a Tier 2 user trên Chainlens,
I want Epsilon agent dùng toàn bộ 21 Vibe-Trading MCP tools (market data, options, patterns,
factor analysis, Shadow Account, swarm, finance skills, web search, file I/O),
So that tôi có research toolkit hoàn chỉnh mà không cần tool ngoài.

**Depends on:** Story 5.0 done, Story 5.0.1 done.

**Architecture decision (2026-05-12 v3 — MCP proxy):** Run `vibe-trading-mcp` as Streamable HTTP
service (port 8900). epsilon-api acts as thin proxy intercepting MCP `tools/call` JSON-RPC for
billing, then forwards to VT MCP server. OpenCode connects via remote MCP config (same as
`context7`). **~180 LOC total** vs ~1500 LOC HTTP extension approach (archived). NFR8 + NFR10
preserved — sandbox still only calls epsilon-api.

**Acceptance Criteria:**

**Given** `Vibe-Trading/agent/mcp_server.py` supports `--transport sse --port 8900`
**When** Story 5.5 ships
**Then** new `vibe-trading-mcp` service in docker-compose (reuses existing image, different CMD)
**And** 1 epsilon-api proxy route `ALL /v1/router/vibe-trading-mcp/*` intercepts `tools/call` for billing
**And** `opencode.jsonc` adds remote MCP entry (parity `context7`)
**And** 21 tools auto-discovered by OpenCode — zero per-tool boilerplate
**And** existing `vibe_trading_backtest` HTTP tool (Story 5.1) unchanged — both coexist
**And** 21 TOOL_PRICING entries ($0–$0.50 per tool based on compute cost)
**And** zero VT submodule patches

### Story 5.6: Shadow Account + Swarm Teams UI Pages

As a Tier 2 user trên Chainlens,
I want dedicated dashboard pages cho Shadow Account analysis và Swarm Teams browsing,
So that tôi trigger flagship features bằng 1 click thay vì phải biết tên tools.

**Depends on:** Story 5.5 done (MCP proxy unlocks all tools).

**Context:** Pure frontend — 2 pages that dispatch pre-filled prompts to AI Chat. No new
backend routes needed except 1 passthrough for shadow report retrieval.

**Acceptance Criteria:**

**Given** Story 5.5 MCP proxy provides all 21 VT tools
**When** Story 5.6 ships
**Then** `/dashboard/shadow-account` page: drag-drop CSV upload → "Analyze with AI" dispatches
5-step Shadow Account loop prompt → agent runs via MCP tools, streams progress
**And** `/dashboard/swarm-teams` page: preset grid → config modal → "Run" dispatches swarm prompt
**And** 1 passthrough route `GET /v1/router/vibe-trading/shadow-reports/:id` for report retrieval
**And** Tier 1 sees upgrade prompt on both pages

### Story 5.7: User LLM Key Management (BYOK Infrastructure) *(backlog)*

As a Chainlens user (any tier),
I want configure API keys (OpenAI, Anthropic, Tushare) securely encrypted at rest,
So that features requiring external LLM access or premium data can use my credentials.

**Depends on:** Story 5.5 done.
**Blocks:** Swarm Teams `run_swarm` execution (needs user's OpenAI key).

**Product decisions resolved (2026-05-12):**
- Settings → AI Keys: ALL tiers (per PRD FR16 BYOK)
- NFR8: No conflict — orchestration fee atomic, LLM tokens outside Chainlens scope

**Acceptance Criteria:**

**Given** Drizzle additive-only (AR3)
**When** Story 5.7 ships
**Then** `user_ai_keys` table encrypted via libsodium + API CRUD + Settings page (no tier gate)
**And** Pool env-injector decrypts user keys at session spawn
**And** MCP proxy forwards keys per-request to VT MCP server (~15 LOC VT patch)
**And** Existing pool-env-injection tests pass (regression)

**Estimated effort:** 1 week.

### Story 5.8: Per-User Persistent Memory *(backlog)*

As a Chainlens account holder (any tier),
I want the agent to remember my trading preferences, risk profile, and past decisions across sessions,
so that I don't need to re-explain my context every time I start a new conversation.

**FRs:** FR3 (agent quality)
**NFRs:** NFR8 (extraction fire-and-forget, rate-limited 10/hour/account), NFR10 (memory API behind apps/api, plugin đọc qua EPSILON_API_URL + EPSILON_TOKEN)

**Depends on:** Story 5.0 done. `session-ownership.ts` layer đã ship — nguồn `userId` authoritative.
**Blocks:** Nothing.

**Architecture (v2 — account-scoped, Layer 1 only):**
- `account_memories` table trong Supabase (structured, không pgvector v1)
- Top 10 active memories inject tại mỗi session start (~300 tokens)
- Post-session async extraction qua Claude Haiku (debounce 10min sau `session.idle`)
- userId resolve từ `session_owners` SQLite (local, sub-ms) → apps/api map sang accountId
- Conflict resolution: text-similarity (Levenshtein ≥ 0.8 = update), category limit 3 entries max
- **Layer 2 (pgvector semantic search) defer sang v2** — không conflict với Story 5.7 BYOK

**Given** Drizzle additive-only (AR3)
**When** Story 5.8 ships
**Then** `account_memories` table trong Supabase
**And** Top 10 memories inject tại session start (Layer 1, ~300 tokens, budget-enforced)
**And** Post-session async extraction qua Claude Haiku (fire-and-forget, debounce 10min)
**And** Settings page `/dashboard/settings/memory` cho view/delete (no tier gate)
**And** Rate limit 10 extractions/hour/account (NFR8 compliance)
**And** Existing Layer 0 (USER.md + MEMORY.md) unchanged — regression-safe

**Estimated effort:** 3 ngày (v2 simplified — bỏ pgvector + embeddings v1).

## Epic 6: Browser Intelligence Extension

Xây dựng Browser Extension auto-detect token/contract khi browse crypto sites, sync với web account, risk tooltips, nút Expand mở full app.

**FRs:** FR4, FR26, FR27, FR28, FR29, FR30
**NFRs:** NFR9, NFR13, NFR14
**ARs:** AR1, AR8

**NFR8 carve-out**: Browser Extension tooltip detection được exempt khỏi NFR8 (Atomic Credit Deduction) — tooltip là free awareness feature cho mọi tier kể cả Free, không trừ credit. Decision date: 2026-05-11. Abuse mitigation: IP rate limit + aggressive cache (xem Story 6.1.0). Các endpoint khác trong Chainlens vẫn enforce NFR8 nghiêm ngặt.

**Hierarchical sub-stories** (added 2026-05-11): Story 6.1 đã ship với gap nghiêm trọng — gọi endpoint chưa tồn tại. Để remediate + extend:
- **Story 6.1.0** (Advisory Risk Endpoint): retroactive prerequisite cho 6.1 — build anonymous `/v1/advisory/risk` endpoint. **MUST ship before 6.1.1.**
- **Story 6.1.1** (Domain-Specific Token Detection): parser system cho DexScreener + CoinMarketCap không yêu cầu `$` prefix. Blocked on 6.1.0.
- **Story 6.1.2, 6.1.3** *(backlog)*: Facebook và CoinGecko parsers.

**Cross-epic dependency (added 2026-05-18, IR finding A4)**: Story 6.4 (Model Availability & Quota Guardrail) consumes the model availability API surface from **Story 8.3 (LLM Proxy & MaaS)**. Sequence: ship 8.3 first, then 6.4 can build the UI guardrail on top of the catalog endpoint. Filing 6.4 in Epic 6 instead of Epic 8 because the deliverable is UI/extension guardrail, not backend proxy logic.

### Story 6.1: Extension Core & Token Auto-Detection

As a crypto user đang browse X, Dexscreener, hoặc CMC,
I want extension tự động detect token address hoặc tên token trên trang,
So that tôi không cần copy-paste địa chỉ để tra cứu trong Chainlens.

**Acceptance Criteria:**

**Given** extension được install và active
**When** user browse X, Facebook, Dexscreener, hoặc CoinMarketCap
**Then** content script scan DOM để detect contract addresses (0x... pattern, Solana pubkey) và known token symbols
**And** detected tokens được highlight với subtle underline indicator

**Given** token được detect trên trang
**When** user hover lên highlight
**Then** risk tooltip popup xuất hiện trong vòng 500ms với risk level và price data
**And** tooltip không block nội dung trang (pointer-events passthrough khi không hover)

### Story 6.2: Risk Tooltip & Expand to Full App

As a user thấy token được highlight bởi extension,
I want hover để xem risk tooltip và click Expand để mở full Chainlens analysis,
So that tôi đánh giá nhanh risk mà không cần rời khỏi trang đang browse.

**Acceptance Criteria:**

**Given** risk tooltip đang hiển thị
**When** user click nút "Expand" trong tooltip
**Then** tab mới mở đến `chainlens.app/token/[address]` với full analysis
**And** nếu user chưa login, redirect đến login flow trước khi về token page

**Given** API trả về dữ liệu risk
**When** tooltip render
**Then** hiển thị: risk level badge (màu-coded), price, 24h change, và volume
**And** nếu không có data (token mới/unknown), tooltip hiển thị "Chưa có dữ liệu" thay vì blank

### Story 6.3: Extension ↔ Web Account Sync

As a logged-in Chainlens user,
I want extension nhận biết tôi đã đăng nhập và sync watchlist,
So that extension biết tokens tôi đang theo dõi và highlight chúng ưu tiên hơn.

**Acceptance Criteria:**

**Given** user đã login trên `chainlens.app`
**When** extension popup được mở
**Then** extension đọc auth token từ chainlens.app cookie và authenticate với API
**And** watchlist tokens được highlight với màu khác biệt so với tokens không trong watchlist

**Given** user là Free tier
**When** extension gọi API để fetch risk data
**Then** rate limiting áp dụng theo cả IP và account (NFR9)
**And** khi bị rate-limit, tooltip hiển thị "Đã đạt giới hạn. Upgrade để xem thêm." thay vì error

**Given** không có kết nối mạng
**When** extension cố fetch data
**Then** extension fallback về cached data từ lần fetch gần nhất
**And** tooltip hiển thị "Offline — dữ liệu có thể lỗi thời"

### Story 6.4: Model Availability & Quota Guardrail (Web + Extension)

As a Chainlens user chọn model để chat/phân tích,
I want model picker trên web và extension chỉ cho chọn model còn khả dụng theo quyền tài khoản hiện tại,
So that tôi không bị fail runtime do quota hết hoặc provider tạm unavailable.

**Acceptance Criteria:**

**Given** API catalog trả trạng thái model theo account với `available|unavailable` và reason code chuẩn hóa
**When** model picker render trên web hoặc extension
**Then** model unavailable bị disable/ẩn trước khi user gửi request
**And** UI hiển thị trạng thái rõ ràng, không lộ chi tiết nhạy cảm provider/internal errors

**Given** model đang chọn trở thành unavailable trong khi user đang thao tác
**When** UI đồng bộ trạng thái mới từ backend
**Then** UI cập nhật trong tối đa 30 giây
**And** hiển thị ít nhất 1 model thay thế khả dụng cùng nhóm năng lực

**Given** entitlement đổi sau thời điểm list model
**When** user vẫn cố gửi request với model không còn entitlement
**Then** backend từ chối request bằng reason code nhất quán với catalog state
**And** tỷ lệ lỗi do chọn model unavailable được theo dõi và giữ dưới 0.5% model-selection requests/ngày sau rollout

## Epic 7: Credit Economy & Tokenomics

Triển khai Internal Credits System atomic, $CLENS token smart contract, và Affiliate/Airdrop reward system.

**FRs:** FR12, FR13, FR14
**NFRs:** NFR7, NFR8
**ARs:** AR3, AR7, AR8

### Story 7.1: Internal Credits System

As a user muốn dùng AI features,
I want nạp credits và có chúng bị deduct atomic mỗi khi dùng AI tool,
So that tôi trả theo usage và không bao giờ bị overcharge hoặc partial deduction.

**Acceptance Criteria:**

**Given** user muốn nạp credits
**When** user chọn gói nạp và thanh toán Fiat
**Then** credits được add vào balance trong DB với atomic transaction
**And** balance mới hiển thị trong header ngay sau khi nạp thành công

**Given** user gọi AI tool cần credit
**When** billing proxy nhận request
**Then** credit deduction được thực hiện atomic — nếu trừ thất bại vì bất kỳ lý do gì, request bị block và không có AI call nào được thực hiện
**And** không có partial deduction: hoặc trừ đủ, hoặc không trừ gì

**Given** user không có đủ credit
**When** AI tool được gọi
**Then** response 402 với message rõ ràng và link đến trang nạp credits
**And** current balance hiển thị để user biết cần nạp thêm bao nhiêu

### Story 7.2: $CLENS Token Smart Contract

As a Chainlens platform,
I want $CLENS ERC-20 token với cơ chế Burn khi trả bằng $CLENS và Buy-back+Burn khi trả bằng Fiat,
So that token có deflationary pressure và incentive để dùng native token.

**Acceptance Criteria:**

**Given** $CLENS ERC-20 contract được deploy trên Ethereum
**When** user thanh toán bằng $CLENS
**Then** burn function được gọi, đốt một phần token tương ứng với cost
**And** transaction hash được log trong DB để audit

**Given** user thanh toán bằng Fiat
**When** payment confirmed
**Then** buy-back+burn flow được trigger: platform mua $CLENS trên market và burn
**And** contract address được load từ environment variable, không hard-code

**Given** smart contract được deploy
**When** bất kỳ action nào liên quan đến contract
**Then** disclaimer bắt buộc hiển thị: "Smart contract chưa được audit bởi bên thứ ba. Sử dụng có rủi ro."
**And** contract logic là immutable (no upgrade proxy) NHƯNG có pause-only function được gate bởi multi-sig (3-of-5) cho emergency response — không có admin mint, không có admin burn user balance

**Given** emergency exploit được phát hiện
**When** multi-sig signers approve pause transaction
**Then** burn và transfer functions bị tạm dừng, user balance được preserve nguyên vẹn
**And** pause event được emit on-chain để community track; unpause yêu cầu cùng multi-sig threshold

### Story 7.3: Affiliate & Airdrop Reward System

As a user cung cấp data on-chain hoặc refer người dùng mới,
I want nhận $CLENS token reward tự động,
So that tôi được incentivize để contribute vào ecosystem.

**Acceptance Criteria:**

**Given** user truy cập `/dashboard/rewards`
**When** trang load
**Then** user thấy referral link cá nhân và lịch sử rewards (pending + claimed)
**And** số $CLENS accumulated hiển thị với estimated USD value

**Given** người dùng mới đăng ký qua referral link
**When** referral được verified (new user complete onboarding)
**Then** $CLENS reward được queue vào distribution batch job cho referrer
**And** referral event được log với timestamp để chống fraud

**Given** user cung cấp data on-chain được platform sử dụng
**When** data quality score được tính (dựa trên token consumption + accuracy)
**Then** $CLENS reward được tính tỉ lệ với score và queue vào batch distribution
**And** reward được distribute không quá 24h sau khi batch job chạy

## Epic 8: Enterprise & Privacy

On-premise packaging Tier 3, BYOK, Local LLM (Ollama), LLM Proxy MaaS, Zero-Data-Leakage enforcement, **và production-grade platform reliability & security (Story 8.5)**.

**FRs:** FR15, FR16, FR17, FR18, FR22
**NFRs:** NFR7, NFR8, NFR9, NFR10, NFR12
**ARs:** AR1, AR2, AR8

**Stories:**
- 8.1: BYOK — Bring Your Own API Key (backlog)
- 8.2: Ollama Local LLM Integration (backlog)
- 8.3: LLM Proxy & MaaS (backlog)
- 8.3.1: LLM Proxy Bidirectional Fallback (ready-for-dev)
- 8.4: Zero-Data-Leakage Enforcement Tier 3 (backlog)
- **8.5: Production-Grade Platform Reliability & Security** (ready-for-dev — 2026-05-17)

### Story 8.1: BYOK — Bring Your Own API Key

As a power user,
I want dùng API key của riêng mình cho các LLM providers thay vì dùng platform credits,
So that tôi kiểm soát chi phí và data routing của mình.

**Acceptance Criteria:**

**Given** user truy cập Settings → API Keys
**When** user nhập API key cho một provider (Anthropic, OpenAI, etc.)
**Then** key được encrypted và lưu vào DB — không bao giờ được log hoặc trả về trong response
**And** key được dùng trong OpenCode thay vì EPSILON_TOKEN khi user có BYOK active

**Given** user có BYOK active và dùng AI tools
**When** token consumption được track
**Then** $CLENS reward được tính dựa trên token consumption (Proof of Contribution)
**And** user có thể xem token consumption stats trong `/dashboard/rewards`

### Story 8.2: Ollama Local LLM Integration

As a Tier 3 enterprise user,
I want kết nối Chainlens với Ollama instance chạy local để zero-data-leakage hoàn toàn,
So that không có dữ liệu nào rời khỏi infrastructure của tôi.

**Acceptance Criteria:**

**Given** Tier 3 admin configure Ollama endpoint URL trong enterprise settings
**When** user gửi AI request
**Then** OpenCode route request đến Ollama instance thay vì cloud providers
**And** không có prompt content nào được gửi ra ngoài infrastructure của enterprise

**Given** Ollama mode active
**When** bất kỳ telemetry hoặc analytics nào cố gắng gửi data ra ngoài
**Then** outbound connection bị chặn hoàn toàn
**And** inbound-only RAG sync từ Chainlens cloud vẫn hoạt động bình thường

### Story 8.3: LLM Proxy & MaaS

As a developer muốn access nhiều LLM models,
I want dùng Chainlens như một OpenRouter-compatible proxy để access models thương mại và self-hosted,
So that tôi có một endpoint duy nhất thay vì manage nhiều API keys.

**Acceptance Criteria:**

**Given** developer có Chainlens account
**When** gọi `/v1/chat/completions` endpoint với Chainlens API key
**Then** request được route đến model provider phù hợp theo `model` field trong request
**And** response format tương thích với OpenAI API spec

**Given** developer chọn thanh toán bằng $CLENS hoặc USDT
**When** request được xử lý
**Then** cost được deduct atomic từ balance theo model pricing trong catalog
**And** prompt content không được log — chỉ log metadata (model, token count, timestamp)

### Story 8.4: Zero-Data-Leakage Enforcement (Tier 3)

As a Tier 3 enterprise admin,
I want đảm bảo tuyệt đối không có outbound telemetry từ on-premise deployment,
So that deployment tuân thủ compliance yêu cầu của tổ chức.

**Acceptance Criteria:**

**Given** on-premise deployment được setup
**When** bất kỳ process nào trong deployment cố gắng tạo outbound connection
**Then** network policy block connection nếu destination không trong allowlist
**And** attempt được log vào audit log với timestamp và process identifier

**Given** Tier 3 workspace có nhiều team members
**When** admin configure role-based access
**Then** permissions được enforce: Admin có full access, Member chỉ access projects được assign, Viewer chỉ read-only
**And** mọi permission change được log trong audit trail

**Given** Chainlens cloud muốn sync RAG data vào on-premise
**When** sync được trigger
**Then** chỉ inbound connection từ Chainlens cloud được cho phép — on-premise không initiate bất kỳ outbound sync nào
**And** sync data được verify integrity bằng checksum trước khi import

### Story 8.5: Production-Grade Platform Reliability & Security

As a platform engineer vận hành chainlens.net,
I want hệ thống sandbox provisioning, billing, và API infrastructure đạt production-grade,
so that users không mất session data khi sandbox recreate, billing không có race condition, serviceKey được encrypt, có rate limiting, observability, và retry resilience — sẵn sàng multi-replica.

**Acceptance Criteria:**

**Given** OpenCode session SQLite tại `/persistent/opencode/storage.sqlite` trong Daytona ephemeral container
**When** sandbox bị delete và recreate
**Then** Litestream sidecar replicates WAL frames liên tục lên Supabase Storage S3 endpoint
**And** `daytona-start.sh` restore session trước khi start epsilon-master (near-zero RPO)
**And** backward compat: nếu `SUPABASE_S3_ENDPOINT` chưa set, skip silently

**Given** `repositories/credits.ts` dùng `atomic_use_credits` PostgreSQL function
**When** audit billing flow trong tất cả router routes
**Then** xác nhận không có fire-and-forget `deductToolCredits` pattern; tất cả billing là `await`

**Given** `provisioningSubscriptions: Set<string>` (volatile in-memory) trong `sandbox-provisioner.ts`
**When** API scale lên 2+ replicas
**Then** Postgres advisory lock `pg_try_advisory_xact_lock()` thay Set in-memory — multi-replica safe

**Given** `sandboxes.config` JSONB chứa `{ serviceKey: "..." }` plaintext
**When** implement column encryption
**Then** `serviceKeyEncrypted BYTEA` column dùng `pgp_sym_encrypt` / `DB_ENCRYPTION_KEY`
**And** JSONB `serviceKey` bị NULL-ed sau migration

**Given** WebSocket/SSE endpoints dùng `?token=<jwt>` trong URL (logged by nginx/cloudflared)
**When** implement first-message auth
**Then** token không xuất hiện trong URL; client gửi auth JSON frame đầu tiên sau `ws.onopen`

**Given** không có rate limiting trên provisioning và LLM proxy routes
**When** implement `hono-rate-limiter`
**Then** sandbox provisioning max 3/hour/user; LLM proxy max 100/min/user; return 429 khi exceed

**Given** không có distributed tracing hay metrics
**When** instrument với OpenTelemetry SDK
**Then** `sandbox.provision.duration_ms` histogram và `sandbox.provision.attempts_total` counter export qua OTLP

**Given** cloudflared quick tunnel URL thay đổi mỗi restart
**When** setup named Cloudflare Tunnel
**Then** `EPSILON_URL` trỏ vào permanent subdomain (e.g. `api-bridge.chainlens.net`)

**Given** `RETRY_DELAY_MS = 2_000` cố định trong `sandbox-init-state.ts`
**When** implement exponential backoff
**Then** retry delays `[2s, 15s, 60s]` indexed by attempt number

**Given** `ensureRunning()` gọi `start()` rồi return ngay (không verify runtime ready)
**When** sandbox wake từ stopped state
**Then** poll `/epsilon/health` tối đa 2 phút sau `start()`; throw nếu runtime không up

**Sprint breakdown:** S1 (Litestream + billing audit + status verify), S2 (serviceKey encryption + WS token), S3 (rate limiting + advisory lock + OTel + named tunnel), S4 (polling backoff + retry + ensureRunning)

**Story file:** `_bmad-output/implementation-artifacts/8-5-production-grade-platform-reliability.md`

**Status:** ready-for-dev (2026-05-17)

---

## Epic 9: Agent Marketplace Integration & Provisioning

Tích hợp MMOMarket biến Chainlens thành Creator Studio tinh gọn với tính năng One-Click Publish, API Key Account Linking, Order Polling và Shared Pool Provisioning.

**FRs:** FR23, FR24, FR25
**NFRs:** NFR7, NFR10
**ARs:** AR4, AR6, AR8

### Story 9.1: MMOMarket API Key Setup & One-Click Publish

As an Agent Creator,
I want liên kết tài khoản MMOMarket bằng API Key và publish agent chỉ với 1 click,
So that Agent của tôi lập tức được list trên sàn mà không cần tạo listing thủ công.

**Acceptance Criteria:**

**Given** user vào Settings -> Integrations
**When** user nhập API Key của MMOMarket
**Then** hệ thống mã hóa và lưu trữ an toàn `mmomarket_api_key` trong DB.

**Given** user nhấn "Publish to MMOMarket"
**When** hệ thống chạy Static Analysis (thay vì AI Validator) thành công
**Then** API `POST /api/v1/marketplace/listings` của MMOMarket được gọi
**And** trạng thái Agent update thành "Published" kèm link MMOMarket live.

### Story 9.2: Order Polling & Fulfillment Sync

As a Chainlens system,
I want liên tục đồng bộ đơn hàng từ MMOMarket qua cơ chế Polling,
So that hệ thống có thể Auto-Clone Agent cho người mua ngay khi họ thanh toán.

**Acceptance Criteria:**

**Given** cron job chạy mỗi 5 phút hoặc user bấm "Sync Orders"
**When** API `GET /api/v1/orders?status=paid` trả về đơn hàng mới
**Then** hệ thống thực hiện Auto-Clone Agent và map với tài khoản của người mua
**And** gọi lại API `POST /api/v1/orders/{order_id}/fulfill` để báo MMOMarket bắt đầu đếm ngược bảo hành.

### Story 9.3: Shared Pool Routing for Tier 1 (Free Users)

As a MMOMarket Free Tier Buyer,
I want Agent của tôi chạy ngay lập tức mà không cần chờ khởi động Sandbox,
So that Chainlens tiết kiệm chi phí hạ tầng (không cấp phát Daytona sandbox mới) nhưng tôi vẫn sử dụng được agent.

**Acceptance Criteria:**

**Given** đơn hàng đã đồng bộ và user thuộc Tier 1 (Free)
**When** Clone Agent được cấp phát
**Then** hệ thống bypass việc gọi API Daytona và gán agent vào `global-tier1-sandbox-01`.

**Given** Agent chạy trong Shared Pool
**When** Agent cố gọi các tool nguy hiểm (execute_bash, run_python, write_file)
**Then** các tool này bị disable hoàn toàn để đảm bảo an toàn.


## Epic 10: Autonomous AI Agents (Manus Clone Capabilities)

Ủy quyền cho hệ thống AI Tự trị xử lý toàn bộ các vòng lặp công việc phức tạp mà không cần can thiệp từng bước. Tận dụng kiến trúc Sandbox, Triggers và `agent-browser` (Playwright) có sẵn.

**FRs:** FR11, FR12, FR13, FR14, FR15, FR16
**NFRs:** NFR3, NFR10
**ARs:** AR1, AR2, AR5, AR8

### Story 10.1: Autonomous Web Scraper & Researcher Workflow

As a crypto researcher (Tier 2/3),
I want Agent có thể tự động duyệt nhiều trang web và vượt qua các rào cản truy cập bằng `agent-browser`,
So that tôi nhận được một bản báo cáo phân tích sâu thay vì chỉ đọc text tóm tắt tĩnh.

**Acceptance Criteria:**

**Given** User yêu cầu lấy dữ liệu từ một Dashboard Web3 đóng kín (cần thao tác click/login)
**When** Agent kích hoạt luồng Autonomous Web Scraper
**Then** Agent sử dụng `agent-browser` (thay vì deep_research.ts) để điều khiển Playwright mở tab, vượt qua các bước bảo mật, snapshot DOM, trích xuất dữ liệu
**And** tổng hợp dữ liệu thành báo cáo hoàn chỉnh.
**And** nếu DOM thay đổi hoặc bị block, Agent phải tự động fallback sang cơ chế Vision-based matching (chụp màn hình) hoặc đổi phương pháp thay vì bị treo vô hạn.
**And** Agent phải tính toán và xin phép user về Budget (số Credits dự kiến) trước khi bắt đầu cào lượng lớn dữ liệu để tránh overcharge.

### Story 10.2: Data Analyst & Visualizer Workflow

As a quantitative analyst (Tier 2/3),
I want Agent có thể chạy code Python/Bash trực tiếp trong Epsilon Instance,
So that tôi có thể ném file CSV thô và nhận lại biểu đồ/dashboards phân tích đã làm sạch.

**Acceptance Criteria:**

**Given** User đính kèm một file `.csv` dữ liệu thô vào khung chat
**When** User yêu cầu "Làm sạch và vẽ biểu đồ"
**Then** Agent tự động gọi tool sinh code Python (pandas/matplotlib), chạy trong Epsilon Sandbox
**And** bắt lỗi (self-heal) nếu code sai, trả về biểu đồ dạng ảnh cho user kèm đoạn code đã thực thi.
**And** Sandbox phải áp dụng Hard Limits (RAM/CPU/Timeout) và tự động kill process bị vòng lặp vô hạn/OOM để tránh treo tài nguyên.

### Story 10.3: Auto-Dev & UI QA Pipeline

As a Chainlens developer/creator,
I want Agent tự động build ứng dụng và chạy test UI bằng Playwright,
So that tôi có thể thấy ứng dụng hoạt động và tự sửa lỗi trước khi bàn giao.

**Acceptance Criteria:**

**Given** User yêu cầu tạo một mini-app Frontend đơn giản
**When** Agent sinh code React/HTML và khởi chạy local server trong Sandbox
**Then** Agent điều phối `agent-browser` mở `http://localhost` bên trong Sandbox
**And** chạy kiểm tra giao diện (snapshot), tìm lỗi UI và tự động vòng lặp sửa code (tối đa 3 lần) cho đến khi app chạy ổn.
**And** hệ thống tự động dọn dẹp các tiến trình cũ (orphaned processes / cổng mạng) trước mỗi vòng lặp để tránh lỗi Zombie process.
**And** QA Agent bắt buộc phải sử dụng cơ chế Readiness Probe (ví dụ: wait-on port) để đảm bảo server đã thực sự chạy lên trước khi Playwright vào test, tránh lỗi False Negative.

### Story 10.4: Smart Ops Resolution via Pipedream & Slack

As a system admin / ops manager,
I want Agent có thể tự đọc log lỗi từ webhook và đề xuất hướng xử lý lên Slack,
So that tôi chỉ cần 1-click Approve để giải quyết sự cố mà không cần thao tác tay.

**Acceptance penetration:**

**Given** Pipedream webhook được kết nối để nhận log lỗi hệ thống
**When** Một cảnh báo lỗi được bắn vào kênh Slack nội bộ
**Then** Ops Agent được kích hoạt, tự động phân tích log, và reply vào Slack thread với đề xuất shell script để fix
**And** Chỉ khi Admin bấm nút [Approve] trên Slack, lệnh mới được thực thi trên môi trường thật.
**And** Giao diện Approve phải có Mini-Dashboard hiển thị rõ Diff, Risk Level và có nút [Dry-run] để user kiểm thử an toàn trước khi chạy thật.

### Story 10.5: 24/7 Market Monitor (Heartbeat Trigger)

As a crypto trader,
I want Agent tự thức dậy định kỳ để kiểm tra tin tức thị trường và giá token,
So that nó có thể kích hoạt các cảnh báo rủi ro hoặc lệnh dừng giao dịch ngay lập tức.

**Acceptance Criteria:**

**Given** Epsilon có hỗ trợ Cron/Heartbeat triggers
**When** User cấu hình một task giám sát định kỳ (vd: mỗi 15 phút check funding rate của 1 token)
**Then** Agent chạy ngầm, tự động gọi các tool (JIT Sync hoặc Web Search) để kiểm tra điều kiện
**And** Bắn thông báo (Alert) cho user qua Telegram/Web UI nếu điều kiện chạm ngưỡng.

### Story 10.6: General-Purpose Swarm Orchestration

As a user giải quyết bài toán phức tạp,
I want một Manager Agent có thể chia việc cho nhiều Sub-Agents (Researcher, Coder, QA) làm việc song song,
So that tôi chỉ cần đưa ra 1 prompt duy nhất và nhận lại kết quả tổng hợp.

**Acceptance Criteria:**

**Given** Hệ thống đã có hạ tầng Swarm Teams cho Vibe Trading
**When** User có một tác vụ quá lớn vượt khỏi domain Trading (VD: Lập kế hoạch Marketing Web3 và viết bài SEO)
**Then** Manager Agent tạo một Directed Acyclic Graph (DAG)
**And** Phân chia task cho Web Searcher Agent và Writer Agent. Kết quả được luân chuyển nội bộ và tổng hợp thành bản cuối cùng.
**And** Manager Agent có cơ chế Checkpointing cho DAG; nếu 1 sub-agent thất bại do lỗi bên ngoài, toàn bộ tiến trình có thể retry tiếp tục từ node đó thay vì chạy lại từ đầu.
**And** Manager Agent phải cung cấp Cost Estimation tổng thể cho toàn bộ DAG và yêu cầu user xác nhận Budget trước khi chia task cho các Sub-Agent.


## Epic 11: Frontend Performance & Platform Upgrade

Nâng cấp toàn bộ FE stack lên phiên bản mới nhất và tối ưu bundle để người dùng trải nghiệm load page nhanh hơn đáng kể (FCP < 1.5s), navigation mượt hơn, và dev team được hưởng dev server nhanh hơn ~60%.

**FRs:** FR-U1, FR-U2, FR-U3, FR-U4, FR-U5, FR-U6
**NFRs:** NFR-U1 (FCP < 1.5s), NFR-U2 (TTI < 3s), NFR-U3 (bundle < 800KB), NFR-U4 (dev startup -60%), NFR-U5 (zero regression)
**ARs:** AR1 (monorepo), AR2 (Bun runtime), AR4 (App Router)

---

### Story 11.1: Next.js 16 + React 19 Upgrade

As a developer,
I want Next.js và React được nâng cấp lên phiên bản 16.2.6 và 19.0.6 tương ứng với toàn bộ breaking changes được fix,
So that team được hưởng ~50% faster rendering, ~400% faster dev server startup, và nền tảng để bật React Compiler ở story sau.

**Acceptance Criteria:**

**Given** package.json hiện tại có `next: "15.5.14"` và `react: "^18"`
**When** `pnpm up next@16.2.6 eslint-config-next@16.2.6 react@19.0.6 react-dom@19.0.6 @types/react@19 @types/react-dom@19` được chạy
**Then** package.json phản ánh đúng versions mới và `pnpm install` thành công không có unresolvable peer dependency errors

**Given** Next.js 16 yêu cầu `params` và `searchParams` là `Promise<>` trong page components
**When** tất cả `page.tsx` files sử dụng `params` hoặc `searchParams` được scan
**Then** mỗi file đã được cập nhật dùng `await params` hoặc React 19's `use(params)` — không còn synchronous access

**Given** React 19 deprecates `React.forwardRef()`
**When** codebase được scan cho pattern `forwardRef(`
**Then** tất cả components sử dụng `forwardRef` đã được refactor sang function component với `ref` là regular prop

**Given** tất cả upgrades và breaking change fixes đã xong
**When** `bun run build` được chạy trong `apps/web`
**Then** build hoàn thành thành công với 0 TypeScript errors và 0 build errors

**Given** tất cả upgrades đã xong
**When** `bun test src/...` được chạy trong `apps/web`
**Then** tất cả tests pass với 0 failures (zero regression)

---

### Story 11.2: Bundle Splitting cho Heavy Libraries

As a người dùng truy cập ứng dụng lần đầu,
I want trang load nhanh hơn bằng cách không download code cho các tính năng tôi chưa dùng (PDF viewer, spreadsheet, 3D scene, v.v.),
So that First Contentful Paint nhanh hơn đáng kể và tôi có thể bắt đầu tương tác ngay.

**Acceptance Criteria:**

**Given** `mermaid` (~2.5MB) chỉ dùng trong `mermaid-renderer.tsx` và `code-block.tsx`
**When** các files đó được cập nhật để lazy import mermaid chỉ khi component mount (dynamic import hoặc `import()` trong useEffect)
**Then** mermaid chunk KHÔNG xuất hiện trong initial bundle khi chạy `ANALYZE=true bun run build`

**Given** `@syncfusion/*` (~3MB+) chỉ dùng trong spreadsheet components
**When** `SpreadsheetViewer.tsx` được wrap bằng `dynamic(() => import('./SpreadsheetViewerInner'), { ssr: false, loading: () => <SpreadsheetSkeleton /> })`
**Then** syncfusion chunks KHÔNG xuất hiện trong initial bundle

**Given** `three.js` + `@react-three/fiber` (~1.2MB) chỉ dùng trong `ChainLensBoxScene.tsx` (landing page)
**When** component caller được cập nhật dùng `dynamic(() => import('@/components/landing/ChainLensBoxScene'), { ssr: false })`
**Then** three.js KHÔNG xuất hiện trong initial bundle

**Given** `pdfjs-dist` (~3MB) chỉ dùng trong PDF viewer components
**When** PDF viewer được wrap bằng `dynamic()` với `ssr: false`
**Then** pdfjs-dist KHÔNG xuất hiện trong initial bundle

**Given** `sql.js` (~1.5MB) chỉ dùng trong SQL runner components
**When** SQL runner được wrap bằng `dynamic()` với `ssr: false`
**Then** sql.js KHÔNG xuất hiện trong initial bundle

**Given** `ag-grid-community` + `ag-grid-react` (~1.5MB) chỉ dùng trong grid components
**When** AG Grid components được wrap bằng `dynamic()` với `ssr: false`
**Then** ag-grid KHÔNG xuất hiện trong initial bundle

**Given** `next.config.ts` hiện tại có `optimizePackageImports` với 7 entries
**When** các packages `@tiptap/core`, `@tiptap/react`, `gsap`, `chart.js`, `lowlight` được thêm vào array
**Then** `bun run build` thành công và không có import errors

**Given** tất cả bundle splitting changes đã áp dụng
**When** `ANALYZE=true bun run build` được chạy (dùng `@next/bundle-analyzer` hoặc next build output)
**Then** initial JS bundle size ≤ 800KB (gzipped) cho trang home và dashboard

---

### Story 11.3: Loading States & Route Skeletons

As a người dùng điều hướng giữa các trang,
I want thấy skeleton loading state thay vì màn hình trắng khi trang đang tải,
So that tôi hiểu app đang phản hồi và không cảm thấy bị stuck hoặc bị lỗi.

**Acceptance Criteria:**

**Given** route group `(dashboard)` hiện tại không có `loading.tsx`
**When** file `apps/web/src/app/(dashboard)/loading.tsx` được tạo với sidebar skeleton (w-64, muted background) + main content area skeleton (header + 2 content blocks)
**Then** khi navigate đến bất kỳ route nào trong `(dashboard)`, skeleton hiển thị trước khi content load

**Given** route `/sessions` không có loading state
**When** `apps/web/src/app/(dashboard)/sessions/loading.tsx` được tạo với session list skeleton (3–5 skeleton rows với avatar + text lines)
**Then** khi navigate đến `/sessions`, list skeleton hiển thị ngay lập tức

**Given** route `/sessions/[sessionId]` không có loading state
**When** `apps/web/src/app/(dashboard)/sessions/[sessionId]/loading.tsx` được tạo với chat interface skeleton (message bubbles placeholders)
**Then** khi mở một session, chat skeleton hiển thị trước khi messages load

**Given** route `/settings` không có loading state
**When** `apps/web/src/app/(dashboard)/settings/loading.tsx` được tạo với form skeleton (labels + input placeholders)
**Then** khi navigate đến settings, skeleton hiển thị

**Given** route `/markets` không có loading state
**When** `apps/web/src/app/(dashboard)/markets/loading.tsx` được tạo với dashboard skeleton (chart placeholder + table rows)
**Then** khi navigate đến markets, skeleton hiển thị

**Given** route group `(home)` không có loading state
**When** `apps/web/src/app/(home)/loading.tsx` được tạo với hero section skeleton
**Then** khi navigate đến home page, skeleton hiển thị

**Given** tất cả 6 loading.tsx files đã được tạo
**When** `bun run build` được chạy
**Then** build thành công với 0 errors; `bun test src/...` không có regressions

---

### Story 11.4: React Compiler & Performance Validation

As a developer và end-user,
I want React Compiler được bật và toàn bộ performance được validate chính thức,
So that chúng ta xác nhận công việc upgrade đã đạt đúng mục tiêu đề ra và có bằng chứng đo lường được.

**Acceptance Criteria:**

**Given** React 19 đã được cài đặt từ Story 11.1
**When** `reactCompiler: true` được thêm vào `experimental` block trong `next.config.ts`
**Then** `bun run build` thành công với 0 errors

**Given** React Compiler đã được enable
**When** app được start (`bun run dev`) và user navigate qua các flows chính (dashboard → session → markets → settings)
**Then** 0 React runtime errors mới xuất hiện trong browser console (không có "Invalid hook call", "Component cannot be updated", hay compiler-related errors)

**Given** tất cả optimizations từ Stories 11.1–11.3 đã được áp dụng
**When** Lighthouse (production build) được chạy trên trang home (`/`)
**Then** First Contentful Paint (FCP) < 1.5 giây

**Given** tất cả optimizations từ Stories 11.1–11.3 đã được áp dụng
**When** Lighthouse (production build) được chạy trên dashboard (`/dashboard`)
**Then** Time to Interactive (TTI) < 3 giây

**Given** Next.js 16 upgrade đã hoàn thành
**When** thời gian khởi động `bun run dev` được đo và so sánh với baseline pre-upgrade
**Then** startup time giảm ít nhất 50%

**Given** toàn bộ Epic 11 đã hoàn thành
**When** `bun test src/...` được chạy trong `apps/web`
**Then** tất cả tests pass với 0 failures — zero regression so với trước khi bắt đầu Epic 11
