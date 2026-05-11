# Product Requirements & Epics: MMOMarket 3rd-Party Integration (Open API & Webhooks)

**Author:** Luisphan
**Date:** 2026-05-11
**Project:** MMOMarket
**Context:** Chuyển đổi MMOMarket từ một sàn thương mại điện tử C2C/B2C truyền thống thành một hệ sinh thái mở (Open Ecosystem). Cho phép các nền tảng SaaS bên thứ 3 (như Chainlens) đóng vai trò là "Creator Studio", tự động đăng bán sản phẩm số (Digital Goods / AI Agents) và tự động hóa quy trình giao hàng.

---

## 1. Product Vision & Scope

### 1.1. Mục tiêu (Goals)
- Xây dựng hệ thống Open API để các nền tảng bên thứ 3 có thể tự động tạo và quản lý Listing sản phẩm trên MMOMarket.
- Xây dựng hệ thống Webhook để đồng bộ trạng thái đơn hàng (Order Lifecycle) theo thời gian thực với các hệ thống bên ngoài.
- Biến MMOMarket thành Identity Provider (IdP) cho phép user dùng tài khoản MMOMarket để đăng nhập hoặc cấp quyền cho app bên thứ 3.

### 1.2. Đối tượng Người dùng (Target Audience)
- **3rd-Party Developers (Platform Partners):** Những nhà phát triển tích hợp hệ thống của họ (như Chainlens) với MMOMarket.
- **Sellers/Creators:** Người bán muốn liên kết tài khoản MMOMarket với công cụ tạo sản phẩm của họ để đăng bán "1-click".
- **Buyers:** Người mua sản phẩm số, yêu cầu quá trình giao hàng (bàn giao quyền, clone code) diễn ra tức thì sau khi thanh toán.

---

## 2. Functional Requirements (Yêu cầu Chức năng)

### 2.1. Hệ thống OAuth2 Provider (IdP)
- Hệ thống hỗ trợ luồng Authorization Code Grant chuẩn OAuth2.
- Có màn hình Consent Screen: Hiển thị rõ tên ứng dụng bên thứ 3 (vd: Chainlens) và danh sách các quyền đang yêu cầu (vd: `read:profile`, `write:listings`).
- Quản lý Access Token và Refresh Token cho bên thứ 3. Có giao diện cho user thu hồi quyền (Revoke access).

### 2.2. Vendor Open API
- Cung cấp API `POST /api/v1/marketplace/listings` cho phép ứng dụng bên thứ 3 tạo sản phẩm mới.
- API hỗ trợ các thuộc tính đặc thù cho sản phẩm số: `listing_type` (Rent/Sell), `warranty_days` (bảo hành), `metadata` (để lưu tracking ID của hệ thống thứ 3, ví dụ `agent_uuid`).

### 2.3. Webhook Dispatcher
- Cung cấp giao diện Developer Dashboard để Partner đăng ký Webhook URL và lấy Webhook Secret (để ký payload chống giả mạo).
- Dispatcher có khả năng bắn Webhook khi xảy ra các sự kiện:
  - `Payment_Confirmed`: Người mua thanh toán xong, tiền vào Escrow.
  - `Dispute_Raised`: Người mua bấm khiếu nại trong thời gian bảo hành.
  - `Order_Completed`: Hết bảo hành, tiền được chuyển cho người bán.
- Có cơ chế Retry tự động (Exponential Backoff) nếu Webhook call thất bại.

### 2.4. Order Fulfillment Sync (Giao hàng bên thứ 3)
- Cung cấp API để Partner cập nhật trạng thái đơn hàng: `POST /api/v1/orders/{order_id}/fulfill`.
- Khi Partner gọi API này (báo hiệu đã giao hàng/cấp quyền xong), MMOMarket chuyển trạng thái đơn hàng sang "Delivered" và bắt đầu đếm ngược thời gian bảo hành (Escrow).

---

## 3. Epics & User Stories

### Epic 1: OAuth2 Identity Provider (IdP)
Biến MMOMarket thành một máy chủ cấp quyền, cho phép các App bên thứ 3 xin quyền truy cập thay mặt người dùng.

*   **Story 1.1: OAuth2 App Registration**
    *   *As a 3rd-party developer,* I want đăng ký ứng dụng của tôi trên MMOMarket Developer Dashboard, *So that* tôi nhận được `client_id` và `client_secret` để tích hợp.
    *   *Acceptance Criteria:* Developer có thể nhập App Name, Logo, và cấu hình `redirect_uri` hợp lệ.

*   **Story 1.2: User Consent Screen**
    *   *As a MMOMarket user,* I want thấy màn hình xác nhận rõ ràng khi một App bên thứ 3 xin quyền, *So that* tôi biết họ được phép làm gì với tài khoản của tôi trước khi đồng ý.
    *   *Acceptance Criteria:* Màn hình hiển thị logo App, danh sách Scopes. Nút "Allow" sinh ra authorization code, nút "Deny" redirect về kèm access_denied error.

*   **Story 1.3: Token Management & Revocation**
    *   *As a MMOMarket user,* I want quản lý và thu hồi quyền của các App bên thứ 3 trong Settings, *So that* tôi bảo vệ được tài khoản nếu không muốn dùng App đó nữa.
    *   *Acceptance Criteria:* Danh sách "Connected Apps" hiển thị trong cài đặt tài khoản. Nút "Revoke" vô hiệu hóa vĩnh viễn refresh token và access token của App đó.

### Epic 2: Vendor Open API
Xây dựng các API mở để tự động hóa việc đăng bán sản phẩm từ công cụ của bên thứ 3.

*   **Story 2.1: API Authentication Middleware**
    *   *As the MMOMarket system,* I want validate Access Token trên mọi Open API request, *So that* chỉ những App có quyền `write:listings` hợp lệ mới được gọi API.
    *   *Acceptance Criteria:* Trả về HTTP 401 nếu token thiếu/hết hạn. Trả về HTTP 403 nếu token thiếu scope.

*   **Story 2.2: Programmatic Product Listing**
    *   *As a 3rd-party app (Chainlens),* I want gọi API tạo listing với các thông số như Rent/Sell và Warranty, *So that* người dùng có thể "One-Click Publish" từ platform của tôi lên sàn.
    *   *Acceptance Criteria:* API `POST /marketplace/listings` nhận JSON payload, lưu sản phẩm vào DB, trả về HTTP 201 kèm `listing_id` và URL. Data phải bao gồm `metadata.external_item_id` để map giữa 2 hệ thống.

### Epic 3: Webhook & Order Fulfillment Engine
Xây dựng luồng giao tiếp hai chiều: MMOMarket báo cho App biết khi có giao dịch, và App báo lại khi đã giao hàng xong.

*   **Story 3.1: Developer Webhook Configuration**
    *   *As a 3rd-party developer,* I want đăng ký Webhook Endpoint URL trong bảng điều khiển, *So that* server của tôi nhận được thông báo sự kiện từ sàn.
    *   *Acceptance Criteria:* Developer có thể nhập URL (bắt buộc HTTPS). Hệ thống tự sinh `webhook_secret` để ký HMAC SHA256 cho payload. Có nút "Send Test Event" để developer debug.

*   **Story 3.2: Order Lifecycle Webhook Dispatcher**
    *   *As the MMOMarket system,* I want bắn Webhook `Payment_Confirmed` và `Dispute_Raised` tới URL của developer, *So that* hệ thống của họ biết để tự động giao hàng hoặc khóa quyền người dùng.
    *   *Acceptance Criteria:* Khi đơn hàng chuyển sang trạng thái "Paid", job dispatcher chạy ngầm để gửi HTTP POST request tới Webhook URL. Nếu response không phải 2xx, job retry tối đa 5 lần với exponential backoff.

*   **Story 3.3: 3rd-Party Order Fulfillment API**
    *   *As a 3rd-party app (Chainlens),* I want gọi API Fulfillment của MMOMarket sau khi tôi đã tự động cấp quyền (giao hàng) cho người mua, *So that* MMOMarket kích hoạt đồng hồ đếm ngược bảo hành.
    *   *Acceptance Criteria:* API `POST /api/v1/orders/{order_id}/fulfill` cập nhật trạng thái đơn thành "Delivered". Kích hoạt logic Escrow Warranty Countdown. Người mua nhận được email "Đơn hàng đã được giao từ đối tác".
