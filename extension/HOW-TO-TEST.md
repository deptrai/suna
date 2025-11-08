# Hướng Dẫn Test Coin Detector - Chi Tiết

## ⚠️ QUAN TRỌNG: Console Context

**Vấn đề phổ biến:** Console đang ở **side panel context** thay vì **page context**

### Cách xác định console context:

1. **Nhìn vào dropdown "top ▾" trong console:**
   - Nếu thấy `chrome-extension://.../sidepanel.html` → **SAI CONTEXT**
   - Nếu thấy `coinmarketcap.com` hoặc `top` → **ĐÚNG CONTEXT**

2. **Nhìn vào title bar của DevTools:**
   - `DevTools - chrome-extension://.../sidepanel.html` → **SAI** (side panel)
   - `DevTools - coinmarketcap.com` → **ĐÚNG** (page)

## 📋 Steps để test (từng bước):

### Bước 1: Build Extension
```bash
cd extension
pnpm run build
```

### Bước 2: Load Extension vào Chrome
1. Mở `chrome://extensions/`
2. Bật "Developer mode" (góc trên bên phải)
3. Click "Load unpacked"
4. Chọn folder: `extension/dist/`
5. **Verify extension loaded:** Tên extension xuất hiện trong list

### Bước 3: Mở CoinMarketCap
1. Mở tab mới
2. Đi tới: `https://coinmarketcap.com/`
3. **Đợi page load hoàn toàn** (thấy danh sách coins)

### Bước 4: Mở Console ĐÚNG CÁCH

**❌ SAI - Đừng làm:**
- Click vào side panel → Inspect
- Mở DevTools từ extension popup

**✅ ĐÚNG - Làm như sau:**

1. **Đóng tất cả DevTools windows** (nếu đang mở)

2. **Click chuột phải VÀO PAGE** (CoinMarketCap):
   - Click chuột phải vào bất kỳ đâu trên page (không phải side panel)
   - Chọn "Inspect" (hoặc nhấn F12)

3. **Verify Console Context:**
   - Trong Console, tìm dropdown ở góc trên bên trái
   - Dropdown phải hiển thị: `top` hoặc `coinmarketcap.com`
   - **KHÔNG PHẢI** `chrome-extension://...` hoặc `sidepanel.html`

4. **Clear Console:**
   - Click icon "Clear console" (🚫) hoặc nhấn Ctrl+L

### Bước 5: Reload Extension và Page

1. **Reload Extension:**
   - Vào `chrome://extensions/`
   - Tìm extension "Suna Coin Analysis"
   - Click nút **Reload** (🔄)

2. **Reload Page:**
   - Quay lại tab CoinMarketCap
   - Nhấn **F5** hoặc **Ctrl+R**

### Bước 6: Xem Logs

**Bạn sẽ thấy logs như sau:**

```
🔵 Suna Extension: Content script loaded
📍 Content script running on: https://coinmarketcap.com/
⏰ Document ready state: complete
✅ Shared code import test passed
🚀 Setting up detection triggers...
✅ Document already loaded, running detection immediately
🔍 Running coin detection (attempt 1/3)...
📄 Document body found, starting detection...
✅ Coin Detection Completed in 45.23ms
📊 Detected 25 coin(s):
  1. Bitcoin (BTC) $45,000
  2. Ethereum (ETH) $3,500
  ...
🎯 Unique coins: 10
💰 Coins with prices: 15
```

## 🔍 Troubleshooting

### Không thấy logs?

1. **Check Console Context:**
   ```javascript
   // Chạy trong console để check context
   console.log('Current context:', window.location.href);
   // Nếu thấy chrome-extension://... → SAI CONTEXT
   // Nếu thấy coinmarketcap.com → ĐÚNG CONTEXT
   ```

2. **Check Extension Status:**
   - Vào `chrome://extensions/`
   - Verify extension is **enabled** (toggle bật)
   - Check for errors (red icon)

3. **Check Content Script Injection:**
   - Vào `chrome://extensions/`
   - Click "Details" trên extension
   - Scroll xuống "Inspect views"
   - Tìm "service worker" và click "Inspect"
   - Check console của service worker

4. **Check Manifest Matches:**
   - URL phải match: `*://*.coinmarketcap.com/*`
   - Verify bạn đang ở `coinmarketcap.com` (không phải subdomain khác)

5. **Manual Test:**
   ```javascript
   // Chạy trong console (page context)
   // Nếu content script đã chạy, bạn sẽ thấy:
   console.log('Testing...');
   // Nếu không thấy log này → Console ở sai context
   ```

### Vẫn không thấy logs?

**Test với simple page:**

1. Tạo file `test.html`:
   ```html
   <!DOCTYPE html>
   <html>
   <head><title>Test</title></head>
   <body>
     <p>Bitcoin BTC is trading at $45,000</p>
     <p>Ethereum ETH price is $3,500</p>
   </body>
   </html>
   ```

2. Serve file này (dùng Python hoặc local server)
3. Load extension
4. Open file trong browser
5. Check console

## 🎯 Expected Results

Sau khi reload page, bạn **PHẢI** thấy:

1. **Initial logs:**
   - 🔵 Suna Extension: Content script loaded
   - 📍 Content script running on: [URL]
   - ✅ Shared code import test passed

2. **Detection logs:**
   - 🔍 Running coin detection...
   - ✅ Coin Detection Completed
   - 📊 Detected X coin(s)
   - 🎯 Unique coins: X
   - 💰 Coins with prices: X

3. **Table output:**
   - Console table với detected coins

## 📝 Notes

- Logs có màu sắc để dễ nhận biết
- Detection chạy nhiều lần (immediate + after delay) để catch dynamic content
- Có retry logic nếu detection fails
- Check cả service worker console nếu cần

## 🆘 Still Having Issues?

1. Check browser console errors (red messages)
2. Check network tab for failed requests
3. Verify extension permissions
4. Test với different website (CoinGecko, Binance)
5. Check extension service worker console

