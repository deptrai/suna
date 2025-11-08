# Manual Testing Guide - Story 11.2

**Story:** 11.2 - Content Script Injection  
**Date:** 2025-01-15  
**Status:** Ready for Manual Testing

## Overview

This guide provides step-by-step instructions for manually testing the content script coin detection functionality trên các crypto websites. All implementation is complete và ready for verification.

## Prerequisites

1. **Extension Built:** Run `pnpm run build` in `extension/` directory
2. **Extension Loaded:** Load unpacked extension in Chrome
3. **DevTools Ready:** Chrome DevTools Console open
4. **Test Websites:** Access to CoinGecko, Binance, CoinMarketCap

## Test Environment Setup

### 1. Build Extension
```bash
cd extension
pnpm install
pnpm run build
```

### 2. Load Extension in Chrome
1. Open Chrome và navigate to `chrome://extensions/`
2. Enable "Developer mode" (toggle ở top-right)
3. Click "Load unpacked"
4. Select `extension/dist/` directory
5. Verify extension appears với name "ChainLens Coin Analysis"

### 3. Open DevTools
1. Right-click on any page → "Inspect"
2. Go to "Console" tab
3. **Important:** Switch console context to "Page" (not "Extension" or "Side panel")
   - Look for dropdown ở top of console
   - Select context: "Page" or "top"

## Test Cases

### Test 1: CoinGecko (coingecko.com)

#### Test 1.1: Coin List Page
1. Navigate to: `https://www.coingecko.com/`
2. Wait for page to load completely
3. Check Console for logs:
   - Should see: `[INFO] ChainLens Extension: Content script loaded`
   - Should see: `[INFO] Coin Detection Completed in Xms - Detected N coin(s)`
4. Verify detection:
   - Check console logs show detected coins
   - Verify coins like Bitcoin, Ethereum are detected
   - Check for coin symbols (BTC, ETH, etc.)
   - Check for prices if available

#### Test 1.2: Coin Detail Page
1. Navigate to: `https://www.coingecko.com/en/coins/bitcoin`
2. Wait for page to load
3. Check Console for detection logs
4. Verify:
   - Bitcoin (BTC) is detected
   - Price is extracted if visible
   - Detection runs on page load

#### Test 1.3: Dynamic Content Loading
1. Scroll down on coin list page
2. Wait for lazy-loaded content
3. Check Console for new detection logs
4. Verify:
   - New coins detected as content loads
   - MutationObserver triggers detection
   - Debouncing works (not too many rapid detections)

### Test 2: Binance (binance.com)

#### Test 2.1: Trading Pairs Page
1. Navigate to: `https://www.binance.com/en/markets`
2. Wait for page to load
3. Check Console for logs
4. Verify:
   - Content script loads
   - Coins detected from trading pairs
   - Symbols và prices extracted

#### Test 2.2: Coin Price Page
1. Navigate to a specific coin page on Binance
2. Check Console for detection
3. Verify coin information is detected

### Test 3: CoinMarketCap (coinmarketcap.com)

#### Test 3.1: Rankings Page
1. Navigate to: `https://coinmarketcap.com/`
2. Wait for page to load
3. Check Console for logs
4. Verify:
   - Top coins detected (Bitcoin, Ethereum, etc.)
   - Prices extracted from rankings table
   - Multiple coins detected

#### Test 3.2: Coin Detail Page
1. Navigate to: `https://coinmarketcap.com/currencies/bitcoin/`
2. Check Console for detection
3. Verify:
   - Bitcoin (BTC) detected
   - Price information extracted
   - Detection runs correctly

#### Test 3.3: Scroll và Load More
1. Scroll down on rankings page
2. Wait for "Load More" content
3. Check Console for new detections
4. Verify:
   - New coins detected as page loads
   - MutationObserver works correctly
   - Performance is acceptable

## Verification Checklist

### Content Script Loading
- [ ] Extension loads without errors
- [ ] Content script appears in Chrome DevTools (Sources → Content scripts)
- [ ] Console shows: `[INFO] ChainLens Extension: Content script loaded`
- [ ] No console errors related to content script

### Coin Detection
- [ ] Coins detected on CoinGecko
- [ ] Coins detected on Binance
- [ ] Coins detected on CoinMarketCap
- [ ] Coin names detected correctly (Bitcoin, Ethereum, etc.)
- [ ] Coin symbols detected correctly (BTC, ETH, etc.)
- [ ] Prices extracted when available
- [ ] Detection runs on page load
- [ ] Detection runs on DOM mutations (dynamic content)

### Performance
- [ ] Detection completes quickly (< 1 second for initial load)
- [ ] No noticeable page performance impact
- [ ] Debouncing works (not too many rapid detections)
- [ ] requestIdleCallback used for non-critical detection

### Error Handling
- [ ] No console errors
- [ ] Graceful handling of missing elements
- [ ] Retry logic works if detection fails initially
- [ ] Cleanup works on page navigation

## Expected Console Output

### On Page Load
```
[INFO] ChainLens Extension: Content script loaded
[DEBUG] URL: https://www.coingecko.com/
[DEBUG] Ready state: complete
[DEBUG] Extension flag set: window.chainlens.extensionLoaded = true
[DEBUG] Setting up detection triggers...
[DEBUG] Document already loaded, running detection immediately
[DEBUG] Document body found, starting detection...
[INFO] Coin Detection Completed in 45.23ms - Detected 25 coin(s)
[INFO] Unique coins: 20, Coins with prices: 18
```

### On DOM Mutation
```
[DEBUG] Page became visible, running detection...
[DEBUG] Running coin detection (attempt 1/3)...
[INFO] Coin Detection Completed in 32.15ms - Detected 30 coin(s)
```

## Troubleshooting

### Content Script Not Loading
1. Check extension is enabled in `chrome://extensions/`
2. Verify manifest.json matches patterns include target website
3. Check for errors in extension service worker console
4. Reload extension và refresh page

### No Coins Detected
1. Verify page has loaded completely (wait a few seconds)
2. Check console for detection logs
3. Verify page structure matches expected patterns
4. Try scrolling down to trigger lazy-loaded content
5. Check if page uses iframes (content script may not access iframe content)

### Performance Issues
1. Check console for detection timing logs
2. Verify debouncing is working (not too many rapid detections)
3. Check if requestIdleCallback is being used
4. Monitor CPU usage during detection

### Console Context Issues
1. **Critical:** Ensure console context is set to "Page" (not "Extension")
2. Look for dropdown ở top of DevTools Console
3. Select "top" or "Page" context
4. Content script logs appear in page context, not extension context

## Site-Specific Notes

### CoinGecko
- Uses dynamic content loading
- Coin names và symbols in various formats
- Prices in multiple locations
- Test both list và detail pages

### Binance
- Trading pairs format: BTC/USDT
- May require authentication for some pages
- Prices update frequently
- Test markets page và individual coin pages

### CoinMarketCap
- Large data tables
- Lazy loading với scroll
- Multiple price formats
- Test rankings, detail pages, và search results

## Test Results Template

```
Test Date: ___________
Tester: ___________
Browser: Chrome ___________
Extension Version: ___________

### CoinGecko
- [ ] Coin list page: PASS / FAIL
- [ ] Coin detail page: PASS / FAIL
- [ ] Dynamic content: PASS / FAIL
- Notes: ___________

### Binance
- [ ] Trading pairs page: PASS / FAIL
- [ ] Coin price page: PASS / FAIL
- Notes: ___________

### CoinMarketCap
- [ ] Rankings page: PASS / FAIL
- [ ] Coin detail page: PASS / FAIL
- [ ] Scroll và load more: PASS / FAIL
- Notes: ___________

### Issues Found
1. ___________
2. ___________

### Recommendations
1. ___________
2. ___________
```

## Next Steps

After manual testing:
1. Document any site-specific issues
2. Report performance concerns
3. Note any edge cases discovered
4. Update story với test results
5. Proceed to Story 11.3 (Button Injection) if all tests pass

## Additional Resources

- **Integration Tests:** `extension/src/content-script/__tests__/content-script.integration.test.ts`
- **Unit Tests:** `extension/src/shared/__tests__/coin-detector.test.ts`
- **Architecture:** `docs/extensions/epic-prd-architecture/architecture-extension-suna.md`
- **Story:** `docs/extensions/stories/11-2-content-script-injection.md`

