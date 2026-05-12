---
stepsCompleted:
  - step-01-document-discovery
  - step-02-prd-analysis
  - step-03-epic-coverage-validation
  - step-04-ux-alignment
  - step-05-epic-quality-review
  - step-06-final-assessment
scope: Story 6.1.1 — Domain-Specific Token Detection for DexScreener & CoinMarketCap
storyFile: _bmad-output/implementation-artifacts/6-1-1-domain-specific-token-detection.md
documentsInScope:
  prd: _bmad-output/planning-artifacts/prd.md
  architecture: _bmad-output/planning-artifacts/architecture.md
  epics: _bmad-output/planning-artifacts/epics.md
  ux: _bmad-output/planning-artifacts/ux-design-specification.md
---

# Implementation Readiness Assessment Report

**Date:** 2026-05-11
**Project:** chainlens
**Scope:** Story 6.1.1 — Domain-Specific Token Detection (DexScreener & CoinMarketCap)

---

## PRD Analysis

PRD (`prd.md`) không tổ chức theo format `FR1/FR2/NFR1` chuẩn mà chia theo sections: **Product Scope (§4)**, **Domain Requirements (§6)**, **Non-Functional Requirements (§7)**. Mình normalize thành numbered list dưới đây để traceability.

### Functional Requirements (extracted from MVP §4.1)

- **FR1 — Browser Extension (Vigilant Companion):** Extension nhẹ tích hợp Side Panel. Tự động detect token/smart contract khi user lướt **X, Facebook, DexScreener, CoinMarketCap**. Cảnh báo rủi ro nhanh qua tooltip. Đồng bộ chat history với web. Nút Expand mở full web app. *(Đây là parent FR của story 6.1.1.)*
- **FR2 — AI-Generated News & Discover Page:** Trang tin tức tự tổng hợp, cảnh báo sớm/alpha insight cho mọi tier.
- **FR3 — Web3 Authentication Module:** Connect ví đa nền tảng (MetaMask, WalletConnect, Phantom), network switcher, balance, ENS avatar.
- **FR4 — Generative AI Chat Widgets:** Token Info Widget, Smart Contract Risk Badge, Transaction Simulation Card (Vercel AI SDK).
- **FR5 — DeFi & Market Dashboards:** Yield/TVL table với sparklines (DeFiLlama/Nansen), Smart Money Flow Visualizer.
- **FR6 — Advanced Charting:** TradingView OHLCV + overlays (MA, RSI).
- **FR7 — Backtest Sandbox Visualizer (Tier 2):** Monaco Editor, KPI cards (Sharpe, Max Drawdown), Equity Curve.
- **FR8 — Data Integrations:** Agents kết nối DeFiLlama, Nansen, Dune, Perplexity.
- **FR9 — Vibe Trading API:** Tích hợp backtest API.
- **FR10 — Background Data Workers (24/7):** Worker crawl/index liên tục.

**Total FRs: 10**

### Domain Requirements (extracted from §6)

- **DR1 — JIT Data Sync:** Agent tự snapshot khi user query, bù gap từ real-time source.
- **DR2 — Agnostic Multi-chain Support:** Dựa vào LLM nội tại (không hard-code chain).
- **DR3 — Security & Hallucination Mitigation:** Validation layer cho code AI sinh ra + disclaimer bắt buộc.
- **DR4 — Zero-Data-Leakage (Tier 3):** Inbound-only RAG sync cho On-premise.

### Non-Functional Requirements (extracted from §7)

- **NFR1 — TTFB AI Chat < 2s**
- **NFR2 — JIT RAG Sync latency < 1.5s**
- **NFR3 — Sandbox MicroVM init < 1s, hard timeout 30s**
- **NFR4 — Concurrent Users ≥ 1,000 (MVP)**
- **NFR5 — Worker auto-scaling theo số dự án crypto monitored**
- **NFR6 — LLM Provider Fallback < 1s**
- **NFR7 — High Availability 99.9% uptime cho core services**
- **NFR8 — Atomic Credit Deduction**
- **NFR9 — Strict Rate Limiting (IP + Account)**
- **NFR10 — Sandbox Isolation (no outbound network)**

**Total NFRs: 10**

### Additional Constraints

- **Out of Scope (§8)**: Non-custodial (không lưu private key), không Fiat on/off-ramp tự build, không tự xây blockchain, không tư vấn đầu tư trực tiếp.
- **Context type**: Brownfield — cải tiến UI/UX trên web code hiện có, refactor 3-tier.

### PRD Completeness Assessment (cho story 6.1.1 scope)

- ✅ **FR1 (Browser Extension)** đã liệt kê rõ 4 domains target: **X, Facebook, DexScreener, CoinMarketCap**. Story 6.1.1 cover 2/4 domains (DexScreener + CMC). Phù hợp với PRD scope.
- ✅ Yêu cầu cảnh báo rủi ro qua tooltip — match story AC#4 (tooltip integration).
- ⚠️ **Gap**: PRD nói "tự động detect token/smart contract" nhưng không spec rule detection trên từng platform. Story 6.1.1 fill gap này — phù hợp với mục đích của sub-story.
- ⚠️ **Note**: NFR1 (TTFB < 2s) và NFR2 (RAG sync < 1.5s) không trực tiếp áp dụng cho story 6.1.1 (token *detection* chứ không phải LLM call). Nhưng NFR có ảnh hưởng gián tiếp tới tooltip fetch (`/api/v1/advisory/risk`) — story 6.1.1 reuse logic Story 6.1, cần verify ở step Architecture/UX coverage.
- ⚠️ PRD không nhắc domain-specific parser pattern hay extensibility cho future platforms. Story 6.1.1 AC#5 (extensible DomainParser) là kiến trúc decision tự bottom-up, không có top-down trace từ PRD. *Acceptable* vì đây là implementation detail, nhưng đáng note.

---

## Epic Coverage Validation

### Epic FR Coverage extracted from `epics.md`

| FR | PRD coverage claim | Epic |
|---|---|---|
| FR1 | Browser Extension (token detection + tooltip + chat) | Epic 1 |
| FR2 | AI-Generated News (Pulse) | Epic 2 |
| FR3 | Web3 Auth | Epic 2 |
| FR4 | Generative AI Chat Widgets | Epic 3 |
| FR5 | DeFi & Market Dashboards | Epic 2 |
| FR6 | Backtest Sandbox Visualizer | Epic 3 |
| FR7 | Background Data Workers | Epic 1 |
| FR8 | BYOK | Epic 4 |
| FR9 | Local Compute (Ollama) | Epic 4 |
| FR10 | Agent Marketplace (MMOMarket) | Epic 4 |

**Total FRs in epics: 10 / 10 PRD FRs** → 100% coverage trên giấy.

### 🚨 CRITICAL FINDING — Epic numbering mismatch giữa epics.md và implementation-artifacts/

| epics.md label | epics.md description | implementation-artifacts/ filename prefix |
|---|---|---|
| Epic 1 | "Core Security Primitive (Data + Ambient UI)" — Browser Extension + Data Workers | `1-x-*` is Tier 1 backend, `2-x-*` is Data Workers, **`6-x-*` is Browser Extension** |
| Epic 2 | "Intelligence Hub" (Pulse + Auth + Dashboards) | `3-x-*` |
| Epic 3 | "Pro Execution" (Sandbox + Gen Widgets) | `3-x-*` (widgets), `5-x-*` (Vibe Sandbox) |
| Epic 4 | "Autonomy & Scale" (BYOK + Ollama + Marketplace) | (chưa có stories) |
| **Epic 5** | **KHÔNG được define trong epics.md** | `5-x-*` Vibe Trading Platform Foundation (đã ship) |
| **Epic 6** | **KHÔNG được define trong epics.md** | `6-1`, `6-1-1` Browser Extension (story 6.1 đã ship) |
| Epic 7 | "Liquid Glass Design System Overhaul" | (chưa có stories) |

**Impact**: 
- Story 6.1.1 belong logically về **Epic 1 (epics.md)** = **Epic 6 (file naming)**. Hai numbering hoàn toàn khác nhau gây nhầm lẫn cho dev và PM khi tra cứu.
- Epic 5 (Vibe Trading) đã ship 5 stories (5-0 đến 5-4) nhưng **không xuất hiện trong epics.md**. Không có FR/UX-DR/NFR coverage được liệt kê cho Vibe Trading trong PRD/epics document.
- Epic 6 (Browser Extension) cũng không có entry chính thức trong `epics.md`. AC, NFR-DR mapping cho story 6.1.1 không trace được lên epic-level definition.

### FR Coverage Analysis cho story 6.1.1 specifically

| Trace | Source | Status |
|---|---|---|
| FR1 (Browser Extension — detect token trên X/FB/DexScreener/CMC) | PRD §4.1 | ✅ Defined |
| FR1 → Epic 1 (per epics.md) | epics.md L64 | ✅ Mapped |
| FR1 → Epic 6 (per file naming) | implementation-artifacts/ | ❌ Mismatch không document |
| Story 6.1.1 sub-scope (DexScreener + CMC parsers) | story file | ✅ Defined |
| Story 6.1.1 → FR1 trace | story file references "Story 6.1" but không cite PRD FR# | ⚠️ Implicit trace |

### Missing Requirements / Gaps

**Critical**
- 🔴 **Epic 6 missing from `epics.md`**: Browser Extension epic được implement (Story 6.1, 6.1.1) nhưng không có epic-level definition trong epics document. Recommendation: thêm Epic 6 entry vào epics.md với FR1 coverage, UX-DR coverage (UX-DR3 Floating Island, UX-DR8 Shadow DOM), NFR coverage.
- 🔴 **Numbering inconsistency**: epics.md gọi browser-extension là Epic 1, file naming gọi là Epic 6. Cần thống nhất — đề xuất sửa epics.md để match file naming (vì code đã ship theo file naming).

**Medium**
- 🟡 Story 6.1.1 không cite explicit FR# từ PRD trong section References. Chỉ reference Story 6.1. → Khuyến nghị: add một dòng "**Traces to:** PRD FR1 — Browser Extension Vigilant Companion (sub-scope: DexScreener + CMC parsers)" vào References section của story.
- 🟡 Domains target trong PRD (X, Facebook, DexScreener, CMC) — Story 6.1 đã cover X (generic regex). Story 6.1.1 cover DexScreener + CMC. **Facebook chưa có story riêng** — generic regex hiện đang fallback cho Facebook. Không phải gap của 6.1.1 nhưng đáng note cho roadmap.

**Low**
- 🟢 NFRs (NFR1-NFR10) trong PRD đều thuộc backend/AI scope, không trực tiếp áp dụng cho extension content script. Acceptable không trace từ story 6.1.1.

### Coverage Statistics

- Total PRD FRs: 10
- FRs claimed covered in epics.md: 10
- Coverage on paper: 100%
- **Effective coverage cho story 6.1.1 scope**: ✅ FR1 covered (Epic 1 hoặc Epic 6 tùy convention)
- **Documentation health**: ⚠️ epics.md ngoài date — thiếu Epic 5 & 6 chính thức

---

## UX Alignment Assessment

### UX Document Status

✅ **Found** — `ux-design-specification.md` (13 KB, 161 dòng)

### UX ↔ PRD alignment cho story 6.1.1 scope

| UX requirement | PRD requirement | Status |
|---|---|---|
| §1.1 Persona "Degen Explorer" — hover token trên X/DexScreener | PRD §4.1 FR1 — detect token trên X/FB/DexScreener/CMC | ✅ Aligned |
| §2.1 "AI Ghost Tooltip" detection list: X, Facebook, **DexScreener, CoinMarketCap, CoinGecko** | PRD §4.1 FR1 detection list: X, Facebook, DexScreener, CoinMarketCap | ✅ Aligned (UX extends thêm CoinGecko, PRD chưa nhắc) |
| §2.1 "Quick Chat side-panel expander" + "Analyze Deeply" button | PRD §4.1 — "nút Expand mở full web app" | ✅ Aligned |
| §4.4 Floating Island, heavy backdrop-blur trên host | UX-DR3 trong epics.md | ✅ Aligned |
| §9.4 Shadow DOM bắt buộc cho extension | UX-DR8 trong epics.md | ✅ Aligned, đã implement Story 6.1 |

### UX ↔ Story 6.1.1 alignment

| UX expectation | Story 6.1.1 coverage | Status |
|---|---|---|
| Detection trên DexScreener (§2.1) | AC#1 + Task 2 | ✅ |
| Detection trên CoinMarketCap (§2.1) | AC#1 + Task 3 | ✅ |
| Trust Score badge color-coded (§2.1, §7.2) | KHÔNG trong scope story 6.1.1 — đã có sẵn trong Story 6.1 tooltip | ✅ Inherited |
| Liquid Glass tooltip styling (§4, §7.2) | KHÔNG trong scope — deferred sang Epic 7 Story 7.3 | ✅ Out-of-scope đúng |
| Side-panel "Quick Chat" expander (§2.1) | KHÔNG trong scope story 6.1.1 — gap chung của epic, không phải gap của 6.1.1 | ⚠️ Note for epic-level |
| `prefers-reduced-motion` graceful degradation (§9.3) | KHÔNG trong story 6.1.1 — extension content script không có Spring animation hiện tại | ✅ N/A |

### UX-DR Coverage cho story 6.1.1

| UX-DR | Description | Story 6.1.1 |
|---|---|---|
| UX-DR3 | Floating Island Widget cho extension | ❌ Not addressed — sẽ do Story 7.3 Liquid Glass overhaul handle |
| UX-DR8 | Shadow DOM isolation | ✅ Đã có từ Story 6.1, story 6.1.1 không phá vỡ |

### Alignment Issues

**Critical**
- Không có alignment issue blocker cho story 6.1.1.

**Medium**
- 🟡 UX §2.1 list **5 domains**: X, Facebook, DexScreener, CoinMarketCap, **CoinGecko**. PRD §4.1 chỉ list 4 (thiếu CoinGecko). `manifest.json` host_permissions có CoinGecko. Story 6.1.1 chỉ cover 2 (DexScreener + CMC). **Gap**: chưa có story cho Facebook và CoinGecko parsers. **Action**: tạo backlog entry cho follow-up stories 6.1.2 (Facebook) và 6.1.3 (CoinGecko).
- 🟡 UX §2.1 — "Quick Chat side-panel expander" button trong tooltip. Story 6.1 hiện có "Deep Dive on Chainlens" button mở new tab, KHÔNG có side-panel chat. Đây là **gap level epic 6**, không phải story 6.1.1. Khuyến nghị tạo story 6.2 (Side panel chat) trong backlog.

**Low**
- 🟢 Story 6.1.1 không reference UX spec trong References section. Vì story scope = detection logic (không visual), việc không cite UX là acceptable. Nhưng đáng thêm 1 dòng confirm "Visual styling inherits from Story 6.1; Liquid Glass overhaul deferred to Story 7.3 (Epic 7)."

### Warnings

- ⚠️ Khi Story 7.3 (Liquid Glass) thực hiện, parsers trong story 6.1.1 cần verify lại không bị break (event handler binding qua `wrapHighlight` helper). Đã có Task 0 extract helper — giảm coupling, tốt.
- ⚠️ §9.3 yêu cầu `prefers-reduced-motion` tắt backdrop-blur. Hiện code Story 6.1 dùng `glass` class fixed, chưa respect motion preferences. Không phải gap của 6.1.1 nhưng worth tracking.

---

## Architecture Alignment Assessment

### 🚨 CRITICAL FINDING — `apps/extension/` không có trong Architecture document

`architecture.md` §6 (Project Structure) list 4 apps: `api/`, `web/`, `mobile/`, `desktop/`. **`apps/extension/` KHÔNG được liệt kê**, mặc dù:

1. Folder `apps/extension/` đã tồn tại trong repo (verified)
2. Story 6.1 đã ship code (commit a198cb67b)
3. Story 6.1.1 đang ready-for-dev với scope mở rộng

Hệ quả:
- Foundation cho extension app (Bun build, manifest v3, Shadow DOM strategy, Tailwind sharing với web) không có architecture-level definition
- Build pipeline: extension dùng `bun build`, không trong Turborepo pipeline được mô tả
- Boundary giữa `apps/extension` ↔ `apps/api` (REST `/api/v1/advisory/risk`) chưa được formalize trong section "Architectural Boundaries" (line 786-789 của architecture.md)
- Không có Decision record cho việc chọn Manifest V3, content script architecture, hay Shadow DOM strategy

**Recommendation**: Bổ sung architecture document — thêm subsection §3 "Frontend Architecture" mục mới `3.5 Browser Extension (apps/extension)` với:
- Build pipeline (Bun)
- Manifest V3 + host_permissions list
- Content script vs Background service worker split
- Shadow DOM isolation strategy (đã có trong UX-DR8)
- Tooltip → API contract (`GET /api/v1/advisory/risk?query={token}`)
- Future: shared Liquid Glass component package (`@chainlens/ui`) plan

### Architecture ↔ Story 6.1.1 specific alignment

| Story 6.1.1 element | Architecture support | Status |
|---|---|---|
| Bun runtime cho extension | `apps/extension/CLAUDE.md` mandate Bun, but architecture.md không nhắc | ⚠️ Implicit only |
| Shadow DOM isolation | UX-DR8, không có architecture decision record | ⚠️ UX-driven, không arch |
| Tooltip → `/api/v1/advisory/risk` | Architecture line 770-784 không list endpoint này | ❌ Endpoint không document |
| MutationObserver per-parser scope | Implementation pattern, không cần arch decision | ✅ N/A |
| `DomainParser` registry pattern | Module-level, story 6.1.1 đã define đầy đủ | ✅ Self-contained |
| SPA navigation handling (`history.pushState` hook) | Browser-side concern | ✅ N/A |

### 🔴 CRITICAL — Endpoint `/api/v1/advisory/risk` KHÔNG TỒN TẠI trong `apps/api`

Verification kết quả (ngày 2026-05-11):

```bash
$ grep -rn "advisory" apps/api/src
apps/api/src/platform/services/ensure-sandbox.ts:53:  pg_advisory_xact_lock(...)  # Postgres only, không liên quan
```

**Toàn bộ apps/api KHÔNG có endpoint nào tên `advisory` hay path `/advisory/risk`.** Reference duy nhất là call site ở [apps/extension/src/content/index.ts:88](apps/extension/src/content/index.ts#L88).

Git history (`git log -S "advisory/risk"`) confirm: endpoint này được thêm vào extension trong commit `a198cb67b` (story 6.1) và **chưa từng có backing endpoint nào trong API**.

### Real endpoints trong `apps/api/src/router/`

| Endpoint mounted at | Method | Auth | Input shape |
|---|---|---|---|
| `/v1/router/contract-risk` | POST | combinedAuth | `{ address, chain, session_id }` body |
| `/v1/router/token-info` | POST | combinedAuth | body |
| `/v1/router/token-search` | GET | combinedAuth | query |
| `/v1/router/token-holders` | POST | combinedAuth | body |
| `/v1/router/token-transactions` | POST | combinedAuth | body |
| `/v1/router/token-ohlcv` | POST | combinedAuth | body |
| `/v1/router/tx-simulator` | POST | combinedAuth | body |
| `/v1/router/vibe-trading` | POST | combinedAuth | body |

**Closest existing endpoint**: `/v1/router/contract-risk` ([apps/api/src/router/routes/contract-risk.ts](apps/api/src/router/routes/contract-risk.ts)).

### Discrepancies giữa extension call và real endpoint

| Aspect | Extension expects | Reality (`contract-risk`) |
|---|---|---|
| **URL path** | `${app.chainlens.com}/api/v1/advisory/risk` | `${API_BASE}/v1/router/contract-risk` |
| **Base URL** | `getCanonicalBaseUrl()` = web app domain (`app.chainlens.com`) | API domain (separate) |
| **HTTP method** | GET | POST |
| **Request shape** | `?query=<token>` query param | `{ address, chain, session_id }` JSON body |
| **Auth** | None (anonymous fetch từ content script) | `combinedAuth` (Supabase JWT OR API key) — extension không có cái nào |
| **Input validation** | Token có thể là `$BTC`, `0xabc`, hoặc Solana address | EVM_ADDRESS regex (40 hex chars) hoặc SOL_ADDRESS regex — tickers như `BTC` REJECTED |
| **Credit check** | Không cần | Cần `accountId` + `checkCredits()` + 402 if insufficient |
| **Response shape** | `{ risk: { level, liquidity, contractInfo, price, change24h } }` | `ContractRiskSnapshot` (different fields) |

### Impact analysis cho Story 6.1.1

**🔴 BLOCKER**: Story 6.1.1 AC#4 yêu cầu *"Hovering over the highlighted symbol correctly fetches and displays the Risk Tooltip via the API as implemented in Story 6.1"*. Story 6.1's API call **không thể work production**:
- URL không exist → 404
- Even if URL exist, GET vs POST mismatch → 405
- Even if method match, không có auth → 401
- Even if auth, ticker `$BTC` không phải address → 400

→ **Story 6.1.1 không thể demo end-to-end** cho tới khi Story 6.1's API integration được rebuild.

### Tested production reality

Cần verify: extension đã được load thử nghiệm chưa, và tooltip có thực sự hiển thị data không? Hai khả năng:
1. **Tooltip đang fail silent với "Failed to load analysis"** — fallback path tại [index.ts:147](apps/extension/src/content/index.ts#L147) đã handle catch.
2. **Tooltip chưa được manually tested** — Story 6.1 ship mà chưa verify integration.

Recommend: trước khi pickup 6.1.1, dev phải load extension và verify Story 6.1 tooltip thực sự hiển thị data, không phải chỉ "Failed to load analysis".

---

## Epic Quality Review (scoped to Epic 6 / Story 6.1.1)

### Epic-level review

Story 6.1.1 thuộc về Epic 6 (file naming) hoặc Epic 1 (epics.md naming). Như đã flag ở step 3, **Epic 6 không có entry trong epics.md** — không thể review epic quality properly. Dưới đây review dựa trên Epic 1 description trong epics.md (mapped sang Epic 6).

| Check | Epic 1 (= Epic 6) trong epics.md | Status |
|---|---|---|
| User value focus | "Users can install extension and immediately get Invisible Security warnings on X and DexScreener" — user-centric | ✅ |
| Epic independence (standalone) | Epic 1 standalone — không depend epic 2/3/4 | ✅ |
| Epic title clarity | "Core Security Primitive (Data + Ambient UI)" — abstract, dev cần đọc body mới hiểu | ⚠️ Title chưa rõ |
| FR traceability | FR1 + FR7 mapped | ✅ |
| UX-DR coverage | UX-DR1, UX-DR2, UX-DR3, UX-DR8 mapped | ✅ |
| Story breakdown trong epic | Epic 1 trong epics.md KHÔNG list story IDs (6.1, 6.1.1) | ❌ Missing |

### Story 6.1.1 quality review

| Check | Story 6.1.1 | Status |
|---|---|---|
| User story format (As/I want/So that) | ✅ Có ([story L7-9](_bmad-output/implementation-artifacts/6-1-1-domain-specific-token-detection.md#L7)) | ✅ |
| Independent completability | Có phụ thuộc Story 6.1 (đã ship) — không forward dependency | ✅ |
| Acceptance Criteria — testable | 7 ACs đều có thể verify (parser detection, dispatch boundary, span class, tooltip integration, interface contract, SPA nav, URL slug validation) | ✅ |
| AC — Given/When/Then BDD format | ❌ ACs dạng declarative ("On DexScreener..., the content script targets header elements"), không BDD format. Các story khác (7.1-7.5) **CÓ** dùng Given/When/Then. Story 6.1.1 inconsistent với pattern | ⚠️ Minor |
| AC — happy path coverage | ✅ AC#1-4 covers happy path | ✅ |
| AC — error/edge case coverage | ✅ AC#7 (URL slug mismatch) + Task 6.3 idempotency test | ✅ |
| AC — specific outcomes | ✅ Each AC specifies exact behavior | ✅ |
| Tasks breakdown | 6 tasks, 18 subtasks — granular và actionable | ✅ |
| Dev Notes context | ✅ Full `DomainParser` interface, registry pattern, dispatch snippet, risk register, module layout | ✅ Exemplary |
| Forward dependency check | Không reference story chưa exist trong tương lai. Reference Story 6.1 (đã ship) và Story 7.3 (Liquid Glass overhaul, marked "deferred"). | ✅ |
| Database/entity creation | Không cần — story 6.1.1 pure frontend extension | ✅ N/A |

### Inconsistencies & Issues

#### 🔴 Critical
- (None blocker)

#### 🟠 Major
- **M1** — `apps/extension/` không có trong architecture.md. Story 6.1.1 sẽ implement code mở rộng app không-có-trong-architecture. **Action**: cập nhật architecture trước khi dev pickup, hoặc accept gap với note "Documentation debt" trong sprint plan.
- **M2** — Epic 6 không có entry trong epics.md. Stories 6.1 và 6.1.1 không trace lên epic-level. **Action**: thêm Epic 6 entry vào epics.md.

#### 🟡 Minor
- **m1** — Story 6.1.1 AC dạng declarative thay vì BDD Given/When/Then (inconsistent với pattern của Story 7.x). **Action**: convert ACs sang BDD format nếu strict consistency required (low priority).
- **m2** — Story 6.1.1 không cite explicit FR# (FR1) trong References. **Action**: thêm 1 dòng trace.
- **m3** — Epic numbering mismatch giữa epics.md (1-4, 7) và file naming (1-7). **Action**: chốt 1 convention và refactor.
- **m4** — `epics.md` `FR Coverage Map` (L62-73) chỉ list FR1-10. UX spec §2.1 nhắc 5 domains include **CoinGecko**, manifest.json declare 6 host permissions. Roadmap cho Facebook + CoinGecko parsers chưa có story.

---

## Summary and Recommendations

### Overall Readiness Status

**🔴 NOT READY — BLOCKER FOUND** — Story 6.1.1 spec itself chất lượng cao, nhưng **upstream dependency (Story 6.1's API call) hoàn toàn không tồn tại trong backend**. AC#4 của story 6.1.1 ("tooltip correctly fetches and displays Risk Tooltip via the API as implemented in Story 6.1") không thể pass cho tới khi vấn đề này được resolve.

*(Sửa từ initial "🟡 NEEDS MINOR DOCUMENTATION WORK" sau khi verify endpoint reality ở Architecture Alignment section.)*

### Critical Issues Requiring Immediate Action

**🔴 BLOCKER (phải fix trước khi dev 6.1.1):**

1. **Endpoint `/api/v1/advisory/risk` KHÔNG TỒN TẠI trong `apps/api`.** Verified qua grep: zero match trong `apps/api/src/`. Toàn bộ chỉ có 1 reference duy nhất — chính là call site trong `apps/extension/src/content/index.ts:88`. Git log confirm endpoint này thêm vào extension ở commit `a198cb67b` (story 6.1) mà chưa từng có backing endpoint.
   - **Discrepancies với closest existing endpoint (`/v1/router/contract-risk`)**:
     - URL path khác (`/api/v1/advisory/risk` vs `/v1/router/contract-risk`)
     - Method khác (GET vs POST)
     - Request shape khác (query param vs JSON body)
     - **No auth ở extension call vs `combinedAuth` required ở `contract-risk`** (extension không có Supabase JWT lẫn epsilon API key)
     - Input validation khác — `contract-risk` reject ticker `$BTC` (chỉ accept EVM/Solana address)
     - Response shape khác
   - **Hệ quả**: Story 6.1's tooltip fetch luôn fail trong production. Story 6.1.1 AC#4 không thể pass.

**🟠 Documentation debt (không blocker dev, nhưng gây nhầm lẫn lâu dài):**

2. **`apps/extension/` không có trong `architecture.md`** — story 6.1 đã ship + 6.1.1 sắp implement. Architecture doc đang lệch reality.
3. **Epic 6 (Browser Extension) missing trong `epics.md`** — không trace được story → epic. Recommend thêm Epic 6 entry, copy structure từ Epic 1 description.
4. **Epic numbering inconsistency** — epics.md (Epic 1, 2, 3, 4, 7) vs file naming (1-7). Chốt 1 convention.

**🟡 Minor (nice-to-have):**

5. Story 6.1.1 không cite explicit FR1 trong References.
6. AC format declarative thay vì BDD (inconsistent với Story 7.x).
7. Backlog stories cho Facebook + CoinGecko parsers (out-of-scope cho 6.1.1).

### Recommended Next Steps (theo thứ tự priority)

**MUST DO trước khi start dev story 6.1.1:**

1. 🔴 **(P0 — 1-2 ngày)** Resolve API contract cho extension tooltip. Quyết định approach:
   - **Option A**: Build endpoint mới `/v1/router/advisory/risk` (GET, query param, anonymous với strict rate limit, accept ticker + address, lightweight response).
     - Pro: extension code không phải sửa, simple cho user.
     - Con: anonymous endpoint cần rate limiting cứng (PRD NFR9), risk abuse, không có credit deduction (PRD NFR8 violated với extension users).
   - **Option B**: Refactor extension để gọi `/v1/router/contract-risk` qua API key.
     - Pro: reuse infrastructure, billing wired (NFR8 OK).
     - Con: cần provisioning API key flow cho extension users (UX complexity), cần ticker → address lookup, POST không cache-friendly cho hover-heavy use case.
   - **Option C**: Build proxy/gateway riêng cho extension làm anonymous read-only gateway: cache aggressive, gọi internal `contract-risk` với system service token.
     - Pro: clean separation, anonymous extension calls qua proxy với its own auth + rate limit + cache, billing vẫn chạy ở internal call.
     - Con: thêm 1 service mới. *(Note: `apps/chainlens-proxy/` đã exist nhưng scope hiện là MaaS LLM gateway (BYOK chat completions), không phải data proxy — không reuse được trực tiếp.)*
   - Recommend: thảo luận với team trước khi chọn. Mỗi option đụng tới NFR8 (Atomic Credit Deduction) và NFR9 (Rate Limiting) khác nhau, cần product/business input.

2. 🔴 **(P0 — 15 phút)** Manually verify Story 6.1 production reality: load extension lên Chrome, hover token trên X, screenshot xem tooltip có data hay luôn fail. Confirm gap thực sự manifest hay đã có workaround (vd: chainlens-proxy đã handle).

**Documentation cleanup (chạy song song với API resolution):**

3. **(15 phút)** Add Epic 6 entry vào `epics.md` với FR1 coverage, UX-DR3/UX-DR8 coverage, NFR coverage. List stories 6.1 và 6.1.1 dưới epic.
4. **(30 phút)** Add subsection `3.5 Browser Extension (apps/extension)` vào `architecture.md`: build pipeline, manifest V3, content script + Shadow DOM, **tooltip API contract** (sau khi decide P0 #1), Tailwind sharing strategy.
5. **(5 phút)** Thêm 1 dòng "Traces to: PRD FR1 + UX §2.1" vào References của story 6.1.1.
6. *(Backlog)* Create stories cho Facebook (6.1.2) + CoinGecko (6.1.3) parsers using cùng `DomainParser` interface từ 6.1.1.
7. *(Backlog)* Resolve epic numbering convention (epics.md vs file naming).

### Implementation Decision

**🚫 KHÔNG NÊN dev start story 6.1.1 ngay** cho tới khi P0 issues được giải quyết.

Lý do: parsers sẽ chạy ngon (detect tokens, wrap spans), nhưng hover sẽ luôn show "Failed to load analysis" → không demo được end-to-end → không pass AC#4. Tệ hơn, gap này có thể đã âm thầm tồn tại trong Story 6.1 production mà chưa ai notice.

**Trừ trường hợp**:
- Team đã có decision/work-in-progress về API endpoint (vd: `chainlens-proxy` đang build) — thì có thể dev parser logic của 6.1.1 trước, API resolve song song.
- Bạn confirm Story 6.1 hiện đang fail silent acceptable (showing "Failed to load") cho temporary milestone — thì 6.1.1 vẫn ship được tới mức "detection works, integration TBD".

### Final Note

Assessment này identify **7 issues** across **3 categories**. **#1 là production-grade blocker** — gap nghiêm trọng giữa client expectations (extension call site) và server reality (apps/api routes). Story 6.1 ship với broken API integration mà chưa được catch.

Story 6.1.1 spec itself chất lượng **exemplary** (interface contract, risk register, module layout đầy đủ), nhưng build trên broken foundation thì vẫn không demo được. **Phải fix Story 6.1's API integration trước, hoặc concede AC#4 cho phase sau.**

---

**Assessed by:** Winston (System Architect) qua bmad-check-implementation-readiness workflow
**Date:** 2026-05-11
**Scope:** Story 6.1.1 — Domain-Specific Token Detection

---

## Post-Assessment Remediation Log

**2026-05-11** — Documentation cleanup tasks completed:

| Item | File | Status |
|---|---|---|
| Story 6.1.0 (Advisory Risk Endpoint) created — unblocks 6.1.1 AC#4 | [_bmad-output/implementation-artifacts/6-1-0-advisory-risk-endpoint.md](_bmad-output/implementation-artifacts/6-1-0-advisory-risk-endpoint.md) | ✅ Done |
| Story 6.1.1 status updated `ready-for-dev` → `blocked-on-6.1.0` | [_bmad-output/implementation-artifacts/6-1-1-domain-specific-token-detection.md](_bmad-output/implementation-artifacts/6-1-1-domain-specific-token-detection.md) | ✅ Done |
| Story 6.1.1 References section: traces to PRD FR4 + UX §2.1 + 6.1.0 prerequisite | same file | ✅ Done |
| Epic 6 numbering align — user rewrote epics.md (FR4 → Epic 6 ✅) | [_bmad-output/planning-artifacts/epics.md](_bmad-output/planning-artifacts/epics.md) | ✅ Done by user |
| Epic 6 — hierarchical sub-stories note (6.1.0, 6.1.1) + NFR8 carve-out | same file | ✅ Done |
| Architecture §3.5 Browser Extension subsection | [_bmad-output/planning-artifacts/architecture.md](_bmad-output/planning-artifacts/architecture.md) | ✅ Done |
| Architecture — Anonymous Public Endpoint Pattern under API & Communication | same file | ✅ Done |
| Architecture — `apps/*` description includes `extension` | same file | ✅ Done |

**Outstanding** (defer to dev cycle, not blocking):
- Manual verify Story 6.1 production reality (load extension, hover token, confirm gap).
- AC format BDD conversion in Story 6.1.1 (minor consistency).
- Backlog stories 6.1.2 (Facebook), 6.1.3 (CoinGecko) — write when ready.
- Update architecture §6 Project Directory Structure to include `apps/extension/` tree.
- Update architecture §6 Architectural Boundaries to add extension ↔ api boundary line.

**New readiness status**: 🟢 **READY** for Story 6.1.0 dev start. Story 6.1.1 unlocks after 6.1.0 ships.





