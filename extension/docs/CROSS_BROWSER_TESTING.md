# Cross-Browser Testing Guide

**Story 14.4: Cross-Browser Testing & Final Polish**

## Supported Browsers

### ✅ Chrome (Recommended)
- **Version**: Latest stable
- **Manifest V3**: Full support
- **Status**: Fully tested và supported

### ✅ Edge (Chromium-based)
- **Version**: Latest stable
- **Manifest V3**: Full support (Chromium-based)
- **Status**: Fully tested và supported

### ⚠️ Firefox
- **Version**: 109+ (Manifest V3 support)
- **Manifest V3**: Limited support
- **Status**: Compatible với limitations

## Testing Checklist

### Chrome Testing

#### Setup
1. Open Chrome
2. Navigate to `chrome://extensions/`
3. Enable "Developer mode" (toggle in top right)
4. Click "Load unpacked"
5. Select the `extension/dist` directory
6. Verify extension loads without errors

#### Feature Testing
- [ ] **Coin Detection**
  - [ ] Visit CoinGecko: `https://www.coingecko.com/`
  - [ ] Verify coins are detected và highlighted
  - [ ] Verify "Analyze" buttons appear next to coins
  - [ ] Click "Analyze" button
  - [ ] Verify side panel opens với coin info

- [ ] **Side Panel**
  - [ ] Verify side panel opens correctly
  - [ ] Verify authentication flow works
  - [ ] Verify login form displays correctly
  - [ ] Verify coin analysis displays correctly
  - [ ] Verify "Generate Full Report" button works

- [ ] **Authentication**
  - [ ] Sign in với valid credentials
  - [ ] Verify session persists after extension reload
  - [ ] Sign out và verify session cleared
  - [ ] Verify error handling for invalid credentials

- [ ] **Report Generation**
  - [ ] Click "Generate Full Report" button
  - [ ] Verify new tab opens với report URL
  - [ ] Verify report URL contains coin context
  - [ ] Verify authentication required for reports

- [ ] **Error Handling**
  - [ ] Test network error handling
  - [ ] Test authentication error handling
  - [ ] Test API error handling
  - [ ] Verify error messages are user-friendly
  - [ ] Verify error recovery options work

### Edge Testing

#### Setup
1. Open Edge
2. Navigate to `edge://extensions/`
3. Enable "Developer mode" (toggle in bottom left)
4. Click "Load unpacked"
5. Select the `extension/dist` directory
6. Verify extension loads without errors

#### Feature Testing
- [ ] **Coin Detection** (same as Chrome)
- [ ] **Side Panel** (same as Chrome)
- [ ] **Authentication** (same as Chrome)
- [ ] **Report Generation** (same as Chrome)
- [ ] **Error Handling** (same as Chrome)

#### Edge-Specific
- [ ] Verify Manifest V3 compatibility
- [ ] Verify side panel works correctly
- [ ] Verify storage API works correctly
- [ ] Verify no Edge-specific errors

### Firefox Testing

#### Setup
1. Open Firefox
2. Navigate to `about:debugging`
3. Click "This Firefox"
4. Click "Load Temporary Add-on"
5. Select `extension/dist/manifest.json`
6. Verify extension loads without errors

#### Feature Testing
- [ ] **Coin Detection** (same as Chrome)
- [ ] **Side Panel** (Firefox may use different UI)
- [ ] **Authentication** (same as Chrome)
- [ ] **Report Generation** (same as Chrome)
- [ ] **Error Handling** (same as Chrome)

#### Firefox-Specific
- [ ] Verify Manifest V3 compatibility (Firefox 109+)
- [ ] Verify `browser` API works (not `chrome` API)
- [ ] Verify side panel works (may differ from Chrome)
- [ ] Verify storage API works correctly
- [ ] Document any Firefox-specific limitations

## Browser Compatibility Notes

### Chrome API vs Browser API
- **Chrome/Edge**: Use `chrome.*` APIs
- **Firefox**: Use `browser.*` APIs (with polyfill)
- **Solution**: Use `browser-compat.ts` utilities for compatibility

### Manifest V3 Support
- **Chrome**: Full support
- **Edge**: Full support (Chromium-based)
- **Firefox**: Limited support (109+)

### Side Panel API
- **Chrome**: Full support (`chrome.sidePanel`)
- **Edge**: Full support (`chrome.sidePanel`)
- **Firefox**: May differ (check Firefox documentation)

### Storage API
- **Chrome/Edge**: `chrome.storage.local`
- **Firefox**: `browser.storage.local`
- **Solution**: Use `browser-compat.ts` utilities

## Known Issues

### Firefox
- Side panel implementation may differ
- Some Chrome-specific APIs may not work
- Manifest V3 support is limited

### Edge
- Should work identically to Chrome (Chromium-based)
- No known issues

## Testing Websites

Test trên các websites sau:
- CoinGecko: `https://www.coingecko.com/`
- Binance: `https://www.binance.com/`
- CoinMarketCap: `https://coinmarketcap.com/`
- CryptoCompare: `https://www.cryptocompare.com/`

## Performance Testing

- [ ] Verify extension doesn't slow page load
- [ ] Verify coin detection completes quickly (< 1 second)
- [ ] Verify side panel loads quickly (< 2 seconds)
- [ ] Verify no memory leaks
- [ ] Verify bundle size < 2MB

## UI Polish Checklist

- [ ] **Spacing**: Consistent padding và margins
- [ ] **Colors**: Consistent color scheme
- [ ] **Typography**: Consistent font sizes và weights
- [ ] **Dark Mode**: Works correctly trên all browsers
- [ ] **Responsive**: Works on different screen sizes
- [ ] **Accessibility**: Proper ARIA labels và keyboard navigation

## Bug Reporting

When reporting bugs, include:
- Browser name và version
- Extension version
- Steps to reproduce
- Expected behavior
- Actual behavior
- Console errors (if any)
- Screenshots (if applicable)

## Next Steps

After testing:
1. Document any browser-specific issues
2. Fix compatibility issues
3. Update documentation
4. Create browser compatibility matrix
5. Final polish và improvements

