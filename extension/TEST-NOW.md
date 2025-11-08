# 🚨 TEST NGAY - Step by Step

## ⚡ Quick Test (5 phút)

### 1. Reload Extension
```
1. Mở chrome://extensions/
2. Tìm "ChainLens Coin Analysis"
3. Click nút RELOAD (🔄)
4. Đợi 2 giây
```

### 2. Reload Page
```
1. Quay lại CoinMarketCap tab
2. Nhấn F5 (reload page)
3. Đợi page load xong
```

### 3. Mở Console ĐÚNG CÁCH

**⚠️ QUAN TRỌNG:**

1. **Đóng tất cả DevTools windows**

2. **Click chuột phải VÀO PAGE** (CoinMarketCap):
   - Không click vào side panel
   - Click vào bất kỳ đâu trên page content
   - Chọn "Inspect" (hoặc nhấn F12)

3. **Verify Console Context:**
   - Trong Console, tìm dropdown ở góc trên bên trái
   - Dropdown phải hiển thị: `top` hoặc `coinmarketcap.com`
   - **KHÔNG PHẢI** `chrome-extension://...`

4. **Clear Console:**
   - Nhấn Ctrl+L để clear
   - Hoặc click icon Clear (🚫)

5. **Tắt Filters:**
   - ❌ Bỏ check "Selected context only"
   - ❌ Bỏ check "Hide network"
   - ✅ Bật "Preserve log"

### 4. Check Logs

**Bạn PHẢI thấy log này (rất lớn, màu vàng, viền đỏ):**

```
🔵🔵🔵 ChainLens Extension: Content script loaded 🔵🔵🔵
```

**Nếu KHÔNG thấy:**

### 5. Manual Test

**Chạy trong Console (page context):**

```javascript
// Test 1: Check extension
console.log('Test 1: Extension loaded?', window.chainlensExtensionLoaded);

// Test 2: Check content script file
fetch(chrome.runtime.getURL('content-script.js'))
  .then(r => r.text())
  .then(text => console.log('Test 2: Content script exists, size:', text.length))
  .catch(e => console.error('Test 2: Error', e));

// Test 3: Check manifest
console.log('Test 3: Current URL:', window.location.href);
console.log('Test 3: Should match pattern: *://*.coinmarketcap.com/*');
```

## 🆘 Nếu vẫn không thấy:

### Check Extension Status

1. Vào `chrome://extensions/`
2. Tìm extension "ChainLens Coin Analysis"
3. Check:
   - ✅ Extension is **enabled** (toggle bật)
   - ✅ No errors (red icon)
   - ✅ Version is correct

### Check Service Worker

1. Vào `chrome://extensions/`
2. Click "Details" trên extension
3. Scroll xuống "Inspect views"
4. Click "service worker" (blue link)
5. Check console của service worker
6. Look for errors

### Check Console Settings

**Trong Console:**
- Tắt tất cả filters
- Bật "Preserve log"
- Clear console
- Reload page

## ✅ Expected Output

Sau khi reload page, bạn PHẢI thấy:

```
🔵🔵🔵 ChainLens Extension: Content script loaded 🔵🔵🔵
📍📍📍 Content script running on: https://coinmarketcap.com/
⏰⏰⏰ Document ready state: complete
📦📦📦 Extension ID: ifnpefdoainkfgjkcgimdeldiiocmlga
✅✅✅ Extension loaded flag set: window.chainlensExtensionLoaded = true
✅ Shared code import test passed
🚀 Setting up detection triggers...
✅ Document already loaded, running detection immediately
🔍 Running coin detection (attempt 1/3)...
📄 Document body found, starting detection...
✅ Coin Detection Completed in XX.XXms
📊 Detected X coin(s):
  ...
```

## 🔍 Debug Tips

1. **Check URL:** Phải là `coinmarketcap.com` hoặc `www.coinmarketcap.com`
2. **Check Console Context:** Phải là page context, không phải side panel
3. **Check Extension:** Phải được reload sau khi build
4. **Check Filters:** Tắt "Selected context only"
5. **Check Service Worker:** Xem có errors không

## 📞 Next Steps

Nếu vẫn không thấy logs sau khi làm tất cả các bước trên:

1. Check browser console errors (red messages)
2. Check service worker console
3. Test với different website (CoinGecko)
4. Verify extension permissions
5. Check if content script file exists in dist/

