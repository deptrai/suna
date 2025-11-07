# Suna.so Browser Extension - Product Requirements Document (PRD)

**Author:** Luis  
**Date:** 2025-11-07  
**Project Level:** 2-3  
**Target Scale:** Medium (Browser Extension)

---

## Goals and Background Context

### Goals

- Cho phép user click vào tên coin trên bất kỳ website crypto và tạo báo cáo/phân tích ngay lập tức
- Tối đa hóa code reuse từ frontend Next.js (target ~95-98%) để giảm thiểu development effort
- Cung cấp trải nghiệm nhất quán với main app thông qua shared components, API client, và state management
- Tận dụng lợi ích của browser extension (content script injection, background processing, storage)

### Background Context

Hiện tại, user phải copy/paste coin name vào main Suna.so app để phân tích. Extension sẽ cho phép phân tích trực tiếp từ bất kỳ website crypto (CoinGecko, Binance, etc.) bằng cách detect coin names và inject "Analyze" buttons.

Architecture đã được thiết kế để reuse ~95-98% code từ frontend Next.js app, bao gồm UI components (Radix UI), API client, state management (Zustand + React Query), và utilities. Extension sẽ là lightweight wrapper với extension-specific layers cho browser APIs và content script injection.

---

## Requirements

### Functional Requirements

**FR001:** Extension phải detect coin names trên bất kỳ website crypto nào (CoinGecko, Binance, etc.) sử dụng content script với pattern matching

**FR002:** Extension phải inject "Analyze with Suna" button next to detected coin names trên web pages

**FR003:** User có thể click vào injected button để trigger coin analysis

**FR004:** Extension popup/sidebar phải display analysis results sử dụng shared UI components từ frontend

**FR005:** Extension phải reuse API client từ frontend để call backend analysis APIs

**FR006:** Extension phải support authentication sử dụng Supabase với chrome.storage adapter

**FR007:** Extension phải allow user generate full report từ analysis results

**FR008:** Extension phải store authentication tokens securely trong chrome.storage

**FR009:** Extension background worker phải coordinate messages giữa content script và popup

**FR010:** Extension phải handle errors gracefully với same error handling patterns như frontend

**FR011:** Extension phải support dark mode nếu frontend supports it

**FR012:** Extension phải work trên Chrome, Edge, và Firefox (Manifest V3 compatible)

**FR013:** Extension phải highlight detected coins trên page để improve discoverability

**FR014:** Extension phải support multiple coin detection trên cùng một page

**FR015:** Extension phải allow user disable/enable extension per website

### Non-Functional Requirements

**NFR001:** Extension bundle size phải < 2MB để ensure fast load time

**NFR002:** Extension popup phải load và display results trong < 2 seconds

**NFR003:** Content script coin detection phải không impact page performance (use requestIdleCallback)

**NFR004:** Extension phải maintain code reuse rate > 90% với frontend

**NFR005:** Extension phải support same authentication flow như main app

**NFR006:** Extension phải handle network errors gracefully với retry logic

**NFR007:** Extension phải be secure với proper CSP và XSS prevention

---

## User Journeys

### Journey 1: Quick Coin Analysis from Web Page

**User:** Crypto investor browsing CoinGecko

**Steps:**
1. User visits CoinGecko và views coin list
2. Extension automatically detects coin names trên page
3. Extension highlights detected coins và injects "Analyze" buttons
4. User clicks "Analyze" button next to "Bitcoin"
5. Extension popup opens với analysis results
6. User reviews analysis (price, sentiment, tokenomics, etc.)
7. User clicks "Generate Full Report" để get comprehensive report
8. Report opens in new tab với full details

**Success Criteria:** User gets coin analysis trong < 5 seconds từ click

---

## UX Design Principles

1. **Consistency First:** Extension UI phải match main app design system
2. **Non-Intrusive:** Extension không break existing page functionality
3. **Fast & Lightweight:** Quick actions, minimal friction
4. **Discoverable:** Clear visual indicators cho detected coins

---

## User Interface Design Goals

**Platform:** Browser Extension (Chrome, Edge, Firefox)

**Core Screens/Views:**
- Extension popup (400x600px) - Analysis results display
- Content script injected buttons - "Analyze with Suna" buttons
- Background worker - Silent processing

**Key Interaction Patterns:**
- Click-to-analyze: Single click trên coin name triggers analysis
- Popup display: Results shown in extension popup
- Report generation: Opens full report in new tab

**Design Constraints:**
- Reuse Radix UI components từ frontend
- Match Tailwind CSS styling từ main app
- Support dark mode nếu frontend supports it

---

## Epic List

**Epic 1: Extension Foundation & Setup**
- Goal: Establish extension project structure, build configuration, và basic manifest
- Estimated Stories: 3-4

**Epic 2: Coin Detection & Content Script**
- Goal: Implement coin name detection trên web pages và inject analysis buttons
- Estimated Stories: 3-4

**Epic 3: Popup UI & Shared Components Integration**
- Goal: Create extension popup UI reusing frontend components và display analysis results
- Estimated Stories: 4-5

**Epic 4: API Integration & Authentication**
- Goal: Integrate backend APIs với authentication using chrome.storage adapter
- Estimated Stories: 3-4

**Epic 5: Report Generation & Polish**
- Goal: Implement full report generation, error handling, và final polish
- Estimated Stories: 3-4

> **Note:** Detailed epic breakdown with full story specifications is available in [epics-extension.md](./epics-extension.md)

---

## Out of Scope

**Not Included in MVP:**
- Mobile browser extensions (focus on desktop Chrome/Edge/Firefox)
- Extension marketplace features (Chrome Web Store submission separate)
- Advanced coin detection với ML/AI (using pattern matching for MVP)
- Extension analytics/tracking (can add later)
- Multi-language support (English only for MVP)
- Extension settings page (basic settings in popup only)

**Future Considerations:**
- Firefox-specific optimizations
- Extension marketplace optimization
- Advanced coin detection algorithms
- User preferences sync across devices
- Extension analytics dashboard

---

_Generated: 2025-11-07_  
_Product Manager: John (BMAD PM Agent)_

