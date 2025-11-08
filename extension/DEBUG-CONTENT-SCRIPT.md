# Debug Content Script - Quick Fix

## Vấn đề: Không thấy logs trong console

### Nguyên nhân có thể:

1. **Console filter đang bật** - "Selected context only" hoặc filters khác
2. **Content script chưa được inject** - Extension chưa được reload
3. **Console ở sai context** - Đang ở side panel thay vì page

## Giải pháp nhanh:

### Bước 1: Check Console Settings

**Trong Console, tắt các filters:**
- ❌ Bỏ check "Selected context only"
- ❌ Bỏ check "Hide network" 
- ✅ Bật "Preserve log"
- ✅ Clear console (Ctrl+L)

### Bước 2: Verify Extension đã được reload

1. Vào `chrome://extensions/`
2. Tìm "ChainLens Coin Analysis"
3. **Click nút Reload** (🔄)
4. **Verify không có errors** (red icon)

### Bước 3: Manual Test trong Console

**Chạy command này trong Console (page context):**

```javascript
// Check if extension is loaded
console.log('Testing extension...');
console.log('Window URL:', window.location.href);
console.log('Extension loaded?', window.chainlensExtensionLoaded);

// Check if content script ran
if (window.chainlensExtensionLoaded) {
  console.log('✅ Content script đã chạy!');
} else {
  console.log('❌ Content script chưa chạy');
}
```

### Bước 4: Check Content Script Injection

**Chạy trong Console:**

```javascript
// Check if content script file exists
fetch(chrome.runtime.getURL('content-script.js'))
  .then(r => r.text())
  .then(text => {
    console.log('✅ Content script file exists');
    console.log('Size:', text.length, 'bytes');
  })
  .catch(e => console.error('❌ Content script file not found:', e));
```

### Bước 5: Force Inject Content Script (Test)

**Nếu content script không chạy, test manual:**

1. Vào `chrome://extensions/`
2. Click "Details" trên extension
3. Scroll xuống "Inspect views"
4. Tìm "service worker" và click "Inspect"
5. Trong service worker console, chạy:

```javascript
// Force inject content script
chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
  chrome.scripting.executeScript({
    target: {tabId: tabs[0].id},
    files: ['content-script.js']
  }).then(() => {
    console.log('✅ Content script injected manually');
  }).catch(e => {
    console.error('❌ Injection failed:', e);
  });
});
```

## Quick Test Script

**Tạo file test đơn giản:**

1. Tạo file `test.html`:
```html
<!DOCTYPE html>
<html>
<head><title>Test</title></head>
<body>
  <h1>Test Page</h1>
  <p>Bitcoin BTC is trading at $45,000</p>
  <p>Ethereum ETH price is $3,500</p>
</body>
</html>
```

2. Load file này trong browser (file://)
3. Load extension
4. Check console

## Check Manifest Pattern

**Verify URL matches pattern:**
- Manifest pattern: `*://*.coinmarketcap.com/*`
- Your URL: `https://coinmarketcap.com/` ✅
- Pattern sẽ match: `coinmarketcap.com`, `www.coinmarketcap.com`, `any.subdomain.coinmarketcap.com`

## Still Not Working?

**Check Service Worker:**

1. Vào `chrome://extensions/`
2. Click "Details" trên extension
3. Click "service worker" (blue link)
4. Check console của service worker
5. Look for errors

**Check Background Console:**

1. Vào `chrome://extensions/`
2. Click "Details" trên extension  
3. Scroll to "Inspect views"
4. Click "service worker"
5. Check console logs

