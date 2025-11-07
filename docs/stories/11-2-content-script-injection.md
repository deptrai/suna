# Story 11.2: Content Script Injection

Status: ready-for-dev

## Story

As a developer,  
I want content script để run coin detection trên web pages,  
So that coins are detected khi user visits crypto websites.

## Acceptance Criteria

1. `content-script.ts` created và registered in manifest
2. Content script runs on page load
3. Content script scans page DOM cho coin names
4. Detection runs on DOM mutations (new content loaded)
5. Performance optimization: use `requestIdleCallback` cho non-critical detection
6. Content script tested trên CoinGecko, Binance, CoinMarketCap

## Tasks / Subtasks

- [ ] Task 1: Create content-script.ts (AC: 1)
  - [ ] Create `extension/src/content-script/content-script.ts`
  - [ ] Import coin-detector từ shared module
  - [ ] Register content script in manifest.json (verify from Story 10.2)
  - [ ] Verify content script loads correctly
  - [ ] Test content script appears in Chrome DevTools

- [ ] Task 2: Implement page load detection (AC: 2)
  - [ ] Add DOMContentLoaded event listener
  - [ ] Add window load event listener (for dynamic pages)
  - [ ] Run coin detection khi page is ready
  - [ ] Handle different page load scenarios
  - [ ] Test với various page types

- [ ] Task 3: Implement DOM scanning (AC: 3)
  - [ ] Call `detectCoins()` function từ coin-detector module
  - [ ] Pass document.body as root element
  - [ ] Store detection results
  - [ ] Log detection results for debugging
  - [ ] Test detection finds coins on sample pages

- [ ] Task 4: Implement DOM mutation observer (AC: 4)
  - [ ] Create MutationObserver instance
  - [ ] Observe document.body for childList changes
  - [ ] Run detection on new content added
  - [ ] Debounce detection calls to avoid performance issues
  - [ ] Test với dynamically loaded content

- [ ] Task 5: Implement performance optimization (AC: 5)
  - [ ] Use `requestIdleCallback` for non-critical detection
  - [ ] Fallback to setTimeout if requestIdleCallback not available
  - [ ] Limit detection frequency (throttle/debounce)
  - [ ] Skip detection on hidden elements
  - [ ] Test performance impact on page load

- [ ] Task 6: Test trên crypto websites (AC: 6)
  - [ ] Test trên CoinGecko (coingecko.com)
  - [ ] Test trên Binance (binance.com)
  - [ ] Test trên CoinMarketCap (coinmarketcap.com)
  - [ ] Verify detection works on each site
  - [ ] Document any site-specific issues
  - [ ] Test với different page sections (coin lists, detail pages, etc.)

- [ ] Testing (AC: 1, 2, 3, 4, 5, 6)
  - [ ] Verify content script loads on target websites
  - [ ] Test coin detection runs on page load
  - [ ] Test detection runs on DOM mutations
  - [ ] Test performance optimization works
  - [ ] Test trên all target crypto websites
  - [ ] Verify no console errors

## Dev Notes

### Architecture Patterns and Constraints

**Content Script Execution:**
- Content script runs in isolated world (separate from page JavaScript)
- Can access DOM but not page's JavaScript variables
- Must be registered in manifest.json với matches patterns
- Runs on page load và can observe DOM mutations

**Detection Strategy:**
- Run detection on page load (DOMContentLoaded)
- Also run on window load (for dynamic pages)
- Observe DOM mutations để detect new content
- Use requestIdleCallback để avoid blocking page rendering

**Performance Considerations:**
- Use requestIdleCallback for non-critical detection
- Debounce/throttle detection calls
- Skip detection on hidden elements
- Limit detection frequency to avoid performance impact

**Crypto Website Testing:**
- CoinGecko: Coin lists, detail pages, price charts
- Binance: Trading pairs, coin listings
- CoinMarketCap: Rankings, coin pages
- Each site may have different DOM structure

### Project Structure Notes

**Content Script Location:**
- `extension/src/content-script/content-script.ts` - Main content script
- Will be compiled to `dist/content-script.js` by build tool
- Manifest references built file: `content-script.js`

**Module Imports:**
- Import `detectCoins` từ `@/shared/coin-detector` hoặc relative import
- Use path aliases if configured correctly

**Manifest Registration:**
- Content script already registered in manifest.json (Story 10.2)
- Verify matches patterns include target crypto websites
- Verify run_at setting (document_idle recommended)

### References

- [Source: docs/architecture-extension-suna.md#Implementation-Patterns] - Content script patterns và coin detection
- [Source: docs/epics-extension.md#Epic-11] - Epic 11 goal: coin detection trên web pages
- [Source: docs/epics-extension.md#Story-11.2] - Story acceptance criteria và prerequisites
- [Source: docs/PRD-extension.md#Functional-Requirements] - FR001: Coin detection trên crypto websites
- [Source: docs/stories/10-2-extension-manifest-configuration.md#Dev-Agent-Record] - Content script configuration in manifest
- [Source: docs/stories/11-1-coin-detection-algorithm.md#Dev-Agent-Record] - Coin detector module created

### Learnings from Previous Story

**From Story 11.1 (Status: ready-for-dev)**

- **Coin Detector Module**: `coin-detector.ts` created với detection logic
- **Detection Function**: `detectCoins(element: HTMLElement): CoinDetection[]` available
- **Pattern Matching**: Coin name, symbol, và price pattern matching implemented
- **Result Structure**: Returns `CoinDetection[]` với element, name, symbol, price

**Reuse:**
- Import `detectCoins` function từ shared module
- Use detection results để identify coins on page
- Detection results include HTMLElement references for UI injection

[Source: docs/stories/11-1-coin-detection-algorithm.md#Dev-Agent-Record]

## Dev Agent Record

### Context Reference

- [Source: docs/stories/11-2-content-script-injection.context.xml] - Story context XML với technical details

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List

## Change Log

- 2025-11-08: Story created from epics-extension.md

