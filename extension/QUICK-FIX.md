# 🚨 QUICK FIX - Content Script Not Loading

## Problem: `window.chainlensExtensionLoaded` is `undefined`

This means content script is **NOT running** on the page.

## Solution Steps:

### Step 1: Verify Extension is Loaded

1. Go to `chrome://extensions/`
2. Find "ChainLens Coin Analysis"
3. **Verify extension is ENABLED** (toggle is ON)
4. **Click "Reload" button** (🔄)
5. **Check for ERRORS** (red icon or error messages)

### Step 2: Check Service Worker

1. In `chrome://extensions/`, click "Details" on extension
2. Scroll to "Inspect views"
3. Click "service worker" (blue link)
4. **Check console for ERRORS**
5. Look for any red error messages

### Step 3: Verify URL Matches Manifest

**Your URL must match one of these patterns:**
- `*://*.coinmarketcap.com/*` ✅
- `*://*.coingecko.com/*`
- `*://*.binance.com/*`
- etc.

**Check your current URL:**
```javascript
// Run in console
console.log('Current URL:', window.location.href);
console.log('Hostname:', window.location.hostname);
```

**Should match:** `coinmarketcap.com` or `www.coinmarketcap.com`

### Step 4: Force Reload Everything

1. **Close all CoinMarketCap tabs**
2. **Reload extension** in `chrome://extensions/`
3. **Open NEW tab** với CoinMarketCap
4. **Open Console** (F12)
5. **Check again:** `window.chainlensExtensionLoaded`

### Step 5: Manual Test

**Run this in console to check extension:**
```javascript
// Test 1: Check if extension is installed
console.log('Extension ID:', chrome?.runtime?.id);

// Test 2: Check content script file
fetch(chrome.runtime.getURL('content-script.js'))
  .then(r => r.text())
  .then(text => console.log('✅ Content script file exists, size:', text.length))
  .catch(e => console.error('❌ Content script file not found:', e));

// Test 3: Check manifest
chrome.runtime.getManifest().then(manifest => {
  console.log('Manifest:', manifest);
  console.log('Content scripts:', manifest.content_scripts);
});
```

## Common Issues:

### Issue 1: Extension Not Enabled
- **Fix:** Enable extension in `chrome://extensions/`

### Issue 2: URL Doesn't Match
- **Fix:** Check URL matches manifest pattern
- **Test:** Try different crypto website (CoinGecko, Binance)

### Issue 3: Content Script Error
- **Fix:** Check service worker console for errors
- **Fix:** Check browser console for content script errors

### Issue 4: Extension Not Reloaded
- **Fix:** Reload extension after build
- **Fix:** Close and reopen browser tabs

## Debug Checklist:

- [ ] Extension is **enabled** in chrome://extensions/
- [ ] Extension has been **reloaded** after build
- [ ] **No errors** in extension details
- [ ] **No errors** in service worker console
- [ ] URL **matches** manifest pattern
- [ ] Page has been **reloaded** (F5) after extension reload
- [ ] Console is on **page context** (not side panel)
- [ ] Content script file exists in `dist/content-script.js`

## Still Not Working?

**Check these:**

1. **Service Worker Console:**
   - Go to `chrome://extensions/`
   - Click "Details" → "service worker"
   - Check for errors

2. **Browser Console (Page Context):**
   - Open console on CoinMarketCap page
   - Check for content script errors
   - Look for "Failed to load" messages

3. **Extension Details:**
   - Check "Errors" section
   - Check "Inspect views" section
   - Verify content script is listed

4. **Test với Different Website:**
   - Try CoinGecko: `https://www.coingecko.com/`
   - Try Binance: `https://www.binance.com/`
   - Check if content script runs there

## Expected Result:

After reloading extension và page, you should see:
- `window.chainlensExtensionLoaded === true` ✅
- Console logs từ content script ✅
- Coin detection results ✅

