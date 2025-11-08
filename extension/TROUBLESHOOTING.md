# Troubleshooting Guide - Coin Detector

## Vấn đề: Không thấy log trong console

### Nguyên nhân thường gặp:

1. **Console context sai** - Console đang ở side panel context thay vì page context
2. **Extension chưa được reload** sau khi build
3. **Content script chưa được inject** vào page

## Giải pháp:

### Bước 1: Switch Console Context

**Vấn đề:** Console đang ở side panel context (`chrome-extension://.../sidepanel.html`)

**Giải pháp:**
1. Đóng DevTools của side panel
2. **Click chuột phải vào page** (CoinMarketCap) → **Inspect** (hoặc F12)
3. Console sẽ hiển thị logs từ **content script** (page context)

**Hoặc:**
1. Trong Console, tìm dropdown "top ▾" 
2. Switch từ "top" (side panel) sang page context

### Bước 2: Reload Extension

Sau khi build, cần reload extension:

1. Go to `chrome://extensions/`
2. Find "ChainLens Analysis" extension
3. Click **Reload** button (🔄)
4. Reload page (CoinMarketCap) với F5

### Bước 3: Verify Content Script đã chạy

**Check trong Console (page context):**

```javascript
// Test 1: Check if content script loaded
console.log('Content script test');

// Test 2: Check if coin detector is available
// (Only works if content script is running)
```

**Expected logs:**
```
Suna Extension: Content script loaded
✅ Shared code import test: ...
✅ Coin Detection Results: [...]
📊 Detected X coin(s):
  ...
```

### Bước 4: Debug Steps

1. **Check Extension Status:**
   - Go to `chrome://extensions/`
   - Verify extension is **enabled**
   - Check for errors (red icon)

2. **Check Console Context:**
   - Make sure console is on **page context**, not side panel
   - Look for "top ▾" dropdown in console
   - Select page context (not extension)

3. **Check Content Script Injection:**
   - Open `chrome://extensions/`
   - Click "Details" on extension
   - Scroll to "Inspect views"
   - Check if content script is listed

4. **Check Manifest Matches:**
   - Verify CoinMarketCap URL matches manifest pattern
   - Pattern: `*://*.coinmarketcap.com/*`
   - URL should be: `https://coinmarketcap.com/...`

### Bước 5: Manual Test

**Test trong Console (page context):**

```javascript
// Test coin detection manually
// This should work if content script is loaded

// Check if detectCoins function is available
// (Note: This won't work directly, content script runs in isolated context)

// Instead, check console logs from content script
// Look for: "Suna Extension: Content script loaded"
```

## Quick Fix Checklist

- [ ] Console is on **page context** (not side panel)
- [ ] Extension is **reloaded** after build
- [ ] Page is **reloaded** (F5) after extension reload
- [ ] Extension is **enabled** in chrome://extensions/
- [ ] No errors in extension details
- [ ] URL matches manifest pattern (`*://*.coinmarketcap.com/*`)

## Expected Console Output

When content script runs successfully, you should see:

```
Suna Extension: Content script loaded
✅ Shared code import test: test class from frontend
✅ Coin Detection Results: Array(10)
📊 Detected 10 coin(s):
  1. Bitcoin (BTC) $45,000
  2. Ethereum (ETH) $3,500
  3. Solana (SOL) $150
  ...
🎯 Unique coins: 5
💰 Coins with prices: 8
```

## Still Not Working?

1. **Check Build Output:**
   ```bash
   cd extension
   pnpm run build
   # Verify no errors
   ```

2. **Check Content Script File:**
   ```bash
   ls -lh extension/dist/content-script.js
   # Should exist and have content
   ```

3. **Check Browser Console Errors:**
   - Look for red errors in console
   - Check "Network" tab for failed requests
   - Check "Sources" tab for file loading issues

4. **Test với Simple Page:**
   - Create simple HTML file với coin names
   - Load locally và test
   - Verify detection works

