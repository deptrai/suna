# Suna.so Browser Extension - Epic Breakdown

**Author:** Luis  
**Date:** 2025-11-07  
**Project Level:** 2-3  
**Target Scale:** Medium (Browser Extension)

---

## Overview

This document provides the detailed epic breakdown for Suna.so Browser Extension, expanding on the high-level epic list in the [PRD](./PRD-extension.md).

Each epic includes:

- Expanded goal and value proposition
- Complete story breakdown with user stories
- Acceptance criteria for each story
- Story sequencing and dependencies

**Epic Sequencing Principles:**

- Epic 1 establishes foundational infrastructure and initial functionality
- Subsequent epics build progressively, each delivering significant end-to-end value
- Stories within epics are vertically sliced and sequentially ordered
- No forward dependencies - each story builds only on previous work

---

## Epic 10: Extension Foundation & Setup

**Goal:** Establish extension project structure, build configuration, basic manifest, và shared code setup để enable code reuse từ frontend.

**Value Proposition:** Foundation cho phép tất cả subsequent work reuse frontend code, minimizing development effort và ensuring consistency.

**Story Breakdown:**

### Story 10.1: Extension Project Structure Setup

**As a** developer,  
**I want** extension project structure với proper organization,  
**So that** code is maintainable và follows best practices.

**Acceptance Criteria:**
1. Extension directory structure created với folders: `src/content-script/`, `src/sidepanel/`, `src/background/`, `src/shared/`
2. TypeScript configuration với path aliases to frontend (`@/*` → `../frontend/src/*`)
3. Package.json với dependencies matching frontend (React, TypeScript, Tailwind, etc.)
4. Basic README với setup instructions

**Prerequisites:** None

---

### Story 10.2: Extension Manifest Configuration

**As a** developer,  
**I want** Chrome Extension Manifest V3 configuration,  
**So that** extension can be loaded và run in browser.

**Acceptance Criteria:**
1. `manifest.json` created với Manifest V3 format
2. Manifest includes: name, version, description, permissions (storage, activeTab, side_panel)
3. Content script configuration với matches pattern for crypto websites
4. Background service worker configuration
5. Side panel configuration (`side_panel.default_path`)
6. Extension icons (16x16, 48x48, 128x128) placeholder

**Prerequisites:** Story 10.1

---

### Story 10.3: Build Configuration & Shared Code Setup

**As a** developer,  
**I want** build configuration để bundle extension và setup shared code access,  
**So that** extension can reuse frontend components và utilities.

**Acceptance Criteria:**
1. Webpack hoặc Vite configuration để build extension
2. Build script outputs to `dist/` directory
3. Path aliases configured để import từ frontend (`@/components`, `@/lib`, etc.)
4. Shared code import test: successfully import `cn()` utility từ frontend
5. Build produces: `content-script.js`, `background.js`, `sidepanel.js`, `sidepanel.html`

**Prerequisites:** Story 10.1, Story 10.2

---

### Story 10.4: Basic Side Panel Skeleton

**As a** developer,  
**I want** basic side panel HTML và React entry point,  
**So that** side panel UI can be developed.

**Acceptance Criteria:**
1. `sidepanel.html` created với React root element
2. `sidepanel.tsx` entry point với React setup
3. Basic "Hello Extension" component renders in side panel
4. Side panel opens khi clicking extension icon (chrome.sidePanel API)
5. Side panel displays correctly (400-600px width, full height)
6. Background worker configured để open side panel on action click

**Prerequisites:** Story 10.3

---

## Epic 11: Coin Detection & Content Script

**Goal:** Implement coin name detection trên web pages và inject "Analyze with Suna" buttons next to detected coins.

**Value Proposition:** Core functionality cho phép user discover và trigger analysis từ any crypto website.

**Story Breakdown:**

### Story 11.1: Coin Detection Algorithm

**As a** developer,  
**I want** coin detection algorithm để identify coin names trên web pages,  
**So that** extension can find relevant coins to analyze.

**Acceptance Criteria:**
1. `coin-detector.ts` module với detection logic
2. Pattern matching cho common coin names (Bitcoin, Ethereum, etc.)
3. Pattern matching cho coin symbols (BTC, ETH, etc.)
4. Pattern matching cho coin symbols với prices (BTC $45,000)
5. Detection returns: `{ element: HTMLElement, name: string, symbol?: string, price?: number }`
6. Detection tested trên sample HTML với various coin formats

**Prerequisites:** Story 10.3

---

### Story 11.2: Content Script Injection

**As a** developer,  
**I want** content script để run coin detection trên web pages,  
**So that** coins are detected khi user visits crypto websites.

**Acceptance Criteria:**
1. `content-script.ts` created và registered in manifest
2. Content script runs on page load
3. Content script scans page DOM cho coin names
4. Detection runs on DOM mutations (new content loaded)
5. Performance optimization: use `requestIdleCallback` cho non-critical detection
6. Content script tested trên CoinGecko, Binance, CoinMarketCap

**Prerequisites:** Story 11.1

---

### Story 11.3: Analysis Button Injection

**As a** developer,  
**I want** inject "Analyze with Suna" buttons next to detected coins,  
**So that** user can easily trigger analysis.

**Acceptance Criteria:**
1. `injector.ts` module với button injection logic
2. Button injected next to detected coin elements
3. Button styling matches extension design (reuse Tailwind classes)
4. Button click handler sends message to background worker
5. Duplicate injection prevention (check if button already exists)
6. Button visible và clickable trên various page layouts

**Prerequisites:** Story 11.2

---

### Story 11.4: Coin Highlighting & Visual Feedback

**As a** user,  
**I want** detected coins highlighted trên page,  
**So that** I can easily see which coins can be analyzed.

**Acceptance Criteria:**
1. Detected coins have visual highlight (subtle border hoặc background)
2. Highlight appears khi coin is detected
3. Highlight removed khi button is clicked (optional)
4. Highlight styling không interfere với page design
5. Highlight works với dark mode pages

**Prerequisites:** Story 11.3

---

## Epic 12: Side Panel UI & Shared Components Integration

**Goal:** Create extension side panel UI (mở bên phải trình duyệt) reusing frontend components và setup chat interface.

**Value Proposition:** Persistent side panel với better UX than popup, consistent UI/UX với main app, fast development through code reuse.

**Story Breakdown:**

### Story 12.1: Shared UI Components Integration

**As a** developer,  
**I want** import và use UI components từ frontend,  
**So that** side panel UI matches main app design.

**Acceptance Criteria:**
1. Successfully import `Button` component từ `@/components/ui/button`
2. Successfully import `Card` component từ `@/components/ui/card`
3. Successfully import `Dialog` component từ `@/components/ui/dialog`
4. Components render correctly trong extension side panel
5. Tailwind CSS styles applied correctly
6. Components tested với various props

**Prerequisites:** Story 10.3

---

### Story 12.2: Side Panel Layout & Structure

**As a** user,  
**I want** well-organized side panel layout (mở bên phải trình duyệt),  
**So that** I have more space và persistent view for chat interface.

**Acceptance Criteria:**
1. Side panel layout với header, content area, và footer (full height, resizable)
2. Header shows extension name/logo với close button
3. Content area ready for analysis results display (scrollable, full height)
4. Responsive layout works với different panel widths (400-600px resizable)
5. Side panel opens when clicking extension icon (chrome.sidePanel API)
6. Side panel persists (doesn't close when clicking outside)

**Prerequisites:** Story 12.1

---

### Story 12.3: Analysis Results Display Component

**As a** user,  
**I want** see analysis results trong side panel,  
**So that** I can review coin analysis quickly.

**Note:** This story is optional/legacy. With Epic 15 (Chat Integration), analysis results are displayed through chat interface instead of static results. This story may be removed or simplified.

**Acceptance Criteria:**
1. Message display component created for chat interface (prepares for Epic 15)
2. Component ready for chat messages display
3. Component uses shared UI components (Card, Button, etc.)
4. Loading state displayed while analysis in progress
5. Error state displayed nếu analysis fails
6. Results formatted clearly và readable

**Prerequisites:** Story 12.2

---

### Story 12.4: React Query Integration

**As a** developer,  
**I want** React Query setup trong side panel,  
**So that** data fetching và caching works như main app.

**Acceptance Criteria:**
1. QueryClient provider setup trong side panel
2. React Query hooks imported từ frontend (`@/hooks/react-query/`)
3. Analysis query hook created hoặc reused
4. Caching strategy matches frontend (staleTime, gcTime)
5. Query invalidation works correctly
6. Loading và error states handled properly

**Prerequisites:** Story 12.3

---

### Story 12.5: Report Generation UI

**As a** user,  
**I want** generate full report từ side panel,  
**So that** I can get comprehensive analysis.

**Acceptance Criteria:**
1. "Generate Full Report" button trong side panel
2. Button click opens new tab với report URL
3. Report URL includes coin context (query params)
4. Report page (frontend) loads với correct coin data
5. Error handling nếu report generation fails

**Prerequisites:** Story 12.4

---

## Epic 13: API Integration & Authentication

**Goal:** Integrate backend APIs với authentication using chrome.storage adapter.

**Value Proposition:** Seamless integration với existing backend, secure authentication.

**Story Breakdown:**

### Story 13.1: Chrome Storage Adapter for Supabase

**As a** developer,  
**I want** Supabase client với chrome.storage adapter,  
**So that** authentication works trong extension environment.

**Acceptance Criteria:**
1. `supabase-extension.ts` created với custom storage adapter
2. Storage adapter uses `chrome.storage.local` thay vì localStorage
3. Adapter implements: `getItem`, `setItem`, `removeItem`
4. Supabase client initialized với storage adapter
5. Authentication state persists across extension restarts
6. Token refresh works automatically

**Prerequisites:** Story 10.3

---

### Story 13.2: API Client Adaptation

**As a** developer,  
**I want** reuse API client từ frontend với extension-specific auth,  
**So that** API calls work correctly.

**Acceptance Criteria:**
1. API client logic extracted hoặc imported từ frontend
2. Auth token retrieved từ chrome.storage
3. API calls include JWT token in headers
4. Error handling matches frontend patterns
5. API client tested với coin analysis endpoint
6. CORS handling works (hoặc background worker proxy)

**Prerequisites:** Story 13.1

---

### Story 13.3: Authentication Flow in Side Panel

**As a** user,  
**I want** login trong extension side panel,  
**So that** I can access authenticated features.

**Acceptance Criteria:**
1. Login UI trong side panel (reuse frontend auth components)
2. Login form submits credentials
3. Auth token stored in chrome.storage after login
4. Side panel shows logged-in state
5. Logout functionality works
6. Auth state persists across browser sessions

**Prerequisites:** Story 13.2, Story 12.2

---

### Story 13.4: Background Worker API Coordination

**As a** developer,  
**I want** background worker coordinate API calls và side panel opening,  
**So that** content script và side panel can request analysis và open chat.

**Acceptance Criteria:**
1. Background worker listens for messages từ content script và side panel
2. Worker handles `ANALYZE_COIN` và `OPEN_SIDE_PANEL_WITH_COIN` message types
3. Worker stores coin info trong chrome.storage khi opening side panel
4. Worker calls API với proper authentication
5. Worker sends results back to requester
6. Error handling và retry logic implemented
7. Message passing tested end-to-end

**Prerequisites:** Story 13.2

---

## Epic 14: Report Generation & Polish

**Goal:** Implement full report generation, error handling, và final polish.

**Value Proposition:** Complete user experience với robust error handling và professional polish.

**Story Breakdown:**

### Story 14.1: Report Generation Integration

**As a** user,  
**I want** generate comprehensive reports từ extension,  
**So that** I get full analysis details.

**Acceptance Criteria:**
1. Report generation API call từ extension
2. Report URL returned từ API
3. New tab opens với report URL
4. Report page loads với coin context
5. Report displays correctly với all analysis sections
6. Error handling nếu report generation fails

**Prerequisites:** Story 13.4, Story 12.5

---

### Story 14.2: Comprehensive Error Handling

**As a** user,  
**I want** clear error messages khi things go wrong,  
**So that** I understand what happened và how to fix it.

**Acceptance Criteria:**
1. Error handling matches frontend patterns (reuse error handler)
2. Network errors display user-friendly messages
3. Authentication errors prompt re-login
4. API errors show specific error details
5. Content script errors logged but don't break page
6. Error recovery suggestions provided

**Prerequisites:** Story 13.4

---

### Story 14.3: Performance Optimization

**As a** user,  
**I want** fast extension performance,  
**So that** analysis feels instant.

**Acceptance Criteria:**
1. Extension bundle size < 2MB (analyze với bundle analyzer)
2. Side panel loads trong < 2 seconds
3. Content script detection doesn't slow page
4. Lazy loading implemented cho heavy components
5. Code splitting cho side panel vs content script
6. Performance tested trên various websites

**Prerequisites:** Story 14.1

---

### Story 14.4: Cross-Browser Testing & Final Polish

**As a** developer,  
**I want** extension tested trên multiple browsers,  
**So that** it works everywhere.

**Acceptance Criteria:**
1. Extension tested trên Chrome (latest)
2. Extension tested trên Edge (latest)
3. Extension tested trên Firefox (nếu supported)
4. All features work correctly trên all browsers
5. UI polish: spacing, colors, typography consistent
6. Final bug fixes và improvements

**Prerequisites:** Story 14.3

---

## Story Guidelines Reference

**Story Format:**

```
**Story [EPIC.N]: [Story Title]**

As a [user type],
I want [goal/desire],
So that [benefit/value].

**Acceptance Criteria:**
1. [Specific testable criterion]
2. [Another specific criterion]
3. [etc.]

**Prerequisites:** [Dependencies on previous stories, if any]
```

**Story Requirements:**

- **Vertical slices** - Complete, testable functionality delivery
- **Sequential ordering** - Logical progression within epic
- **No forward dependencies** - Only depend on previous work
- **AI-agent sized** - Completable in 2-4 hour focused session
- **Value-focused** - Integrate technical enablers into value-delivering stories

---

---

## Epic 15: Chat Integration

**Goal:** Integrate chat functionality vào extension với agent creation để allow user chat về coin analysis.

**Value Proposition:** Interactive chat interface thay vì static analysis results, allowing user ask follow-up questions và get contextual responses về coin.

**Story Breakdown:**

### Story 15.1: Chat Interface Setup

**As a** user,  
**I want** chat interface trong side panel,  
**So that** I can interact với AI agent về coin analysis.

**Acceptance Criteria:**
1. Side panel chat layout created với header, message area, và input area
2. ChatInput component imported và reused từ frontend
3. Message display area ready for messages
4. Layout responsive với side panel width (400-600px)
5. Chat interface matches main app design

**Prerequisites:** Story 12.2

---

### Story 15.2: Coin Context Integration

**As a** user,  
**I want** prompt pre-filled với coin info khi click "Analyze",  
**So that** I can quickly start analyzing coin.

**Acceptance Criteria:**
1. Content script passes coin info (name, symbol, price) to background worker
2. Background worker stores coin info trong chrome.storage
3. Side panel reads coin info on open
4. Prompt pre-filled với format: "Analyze {coin_name} ({symbol}) - Current price: ${price}"
5. User can edit prompt trước khi submit
6. Coin info displayed in header

**Prerequisites:** Story 15.1, Story 13.4

---

### Story 15.3: Agent Creation Integration

**As a** developer,  
**I want** integrate unifiedAgentStart API để tạo agent chat mới,  
**So that** user can start chatting về coin.

**Acceptance Criteria:**
1. unifiedAgentStart API imported từ frontend
2. useInitiateAgentMutation hook imported và used
3. Submit prompt creates new agent chat (thread + project)
4. Thread ID stored và used for continue chatting
5. Error handling matches frontend patterns
6. Loading states displayed during creation

**Prerequisites:** Story 15.2, Story 13.2

---

### Story 15.4: Message Streaming

**As a** user,  
**I want** see streaming responses từ AI agent,  
**So that** I get real-time feedback.

**Acceptance Criteria:**
1. Message streaming implemented (EventSource)
2. Streaming messages display in real-time
3. Streaming logic reused từ frontend
4. Handle streaming errors gracefully
5. Loading indicators during streaming
6. Messages persist after streaming completes

**Prerequisites:** Story 15.3

---

### Story 15.5: Continue Chatting

**As a** user,  
**I want** send additional messages trong same chat,  
**So that** I can ask follow-up questions về coin.

**Acceptance Criteria:**
1. User can send additional messages after initial response
2. Messages added to existing thread
3. Thread ID maintained across messages
4. Message history displayed correctly
5. Streaming works for subsequent messages
6. Chat history persists trong side panel

**Prerequisites:** Story 15.4

---

**For implementation:** Use the `create-story` workflow to generate individual story implementation plans from this epic breakdown.

---

_Generated: 2025-11-07_  
_Updated: 2025-01-15 (Added Epic 15: Chat Integration, Updated Epic 12: Side Panel UI)_  
_Product Manager: John (BMAD PM Agent)_

