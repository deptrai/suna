# Product Requirements & Epics: MMOMarket 3rd-Party Integration (Open API & Sync)

**Author:** Luisphan
**Date:** 2026-05-11
**Project:** MMOMarket
**Context:** Chuyển đổi MMOMarket thành một hệ sinh thái mở (Open Ecosystem) tinh gọn. Cho phép các nền tảng SaaS bên thứ 3 (như Chainlens) đóng vai trò là "Creator Studio", tự động đăng bán sản phẩm số (Digital Goods / AI Agents) và đồng bộ trạng thái giao hàng.

---

## 1. Product Vision & Scope

### 1.1. Mục tiêu (Goals)
- Xây dựng hệ thống Open API để các nền tảng bên thứ 3 có thể tự động tạo và quản lý Listing sản phẩm trên MMOMarket.
- Xây dựng cơ chế Polling / Manual Sync để đồng bộ trạng thái đơn hàng thay vì Webhooks phức tạp.
- Sử dụng Personal Access Token (API Key) để user kết nối tài khoản MMOMarket với app bên thứ 3 một cách nhanh chóng và an toàn.

### 1.2. Đối tượng Người dùng (Target Audience)
- **3rd-Party Developers (Platform Partners):** Những nhà phát triển tích hợp hệ thống của họ với MMOMarket.
- **Sellers/Creators:** Người bán liên kết tài khoản bằng API Key để đăng bán "1-click".
- **Buyers:** Người mua sản phẩm số, yêu cầu bàn giao nhanh (Auto-Clone agent).

---

## 2. Functional Requirements (Yêu cầu Chức năng)

### 2.1. Quản lý Personal Access Token (API Key)
- MMOMarket cung cấp giao diện trong phần Cài đặt để user tạo các Personal Access Token (API Key).
- Mỗi API Key có thể được gán scope giới hạn (vd: `write:listings`, `read:orders`).
- User có thể thu hồi (Revoke) API Key bất kỳ lúc nào.

### 2.2. Vendor Open API
- Cung cấp API `POST /api/v1/marketplace/listings` cho phép ứng dụng bên thứ 3 tạo sản phẩm mới bằng API Key.
- Hỗ trợ metadata để lưu tracking ID (`agent_uuid`).

### 2.3. Đồng bộ Đơn hàng (Polling & Manual Sync)
- Chainlens sẽ chủ động Polling định kỳ hoặc cung cấp nút "Sync Orders" để người bán đồng bộ danh sách đơn hàng đã thanh toán từ MMOMarket.
- Khi người mua khiếu nại (Dispute), trạng thái đơn hàng sẽ được cập nhật khi Chainlens poll lại. Các xử lý Dispute sẽ được Customer Support giải quyết thủ công ở Phase 1.

### 2.4. Order Fulfillment API (Báo cáo Giao hàng)
- API `POST /api/v1/orders/{order_id}/fulfill`: Chainlens gọi API này sau khi đã thực hiện Auto-Clone Agent cho người mua thành công.
- MMOMarket chuyển trạng thái đơn hàng sang "Delivered" và đếm ngược thời gian bảo hành.

---

## 3. Epics & User Stories

### Epic 1: API Key Management
Quản lý quyền truy cập qua API Key đơn giản và bảo mật.

*   **Story 1.1: Generate API Key**
    *   *As a MMOMarket user,* I want có thể tạo API Key trong Settings, *So that* tôi có thể dán vào Chainlens để kết nối tài khoản.

*   **Story 1.2: Revoke API Key**
    *   *As a MMOMarket user,* I want quản lý danh sách các API Key đã tạo và thu hồi chúng, *So that* tôi bảo vệ được tài khoản nếu lộ key.

### Epic 2: Vendor Open API
Xây dựng các API mở để tự động hóa việc đăng bán sản phẩm.

*   **Story 2.1: API Authentication Middleware**
    *   *As the MMOMarket system,* I want validate API Key trên mọi Open API request.

*   **Story 2.2: Programmatic Product Listing**
    *   *As a 3rd-party app (Chainlens),* I want gọi API tạo listing (chỉ hỗ trợ SELL/Auto-Clone cho MVP), *So that* người dùng có thể "One-Click Publish".

### Epic 3: Order Synchronization & Fulfillment
Đồng bộ trạng thái giao dịch một cách thực dụng.

*   **Story 3.1: Order Polling API**
    *   *As a 3rd-party app,* I want gọi API lấy danh sách đơn hàng mới nhất (`GET /api/v1/orders?status=paid`), *So that* tôi biết cần giao hàng cho ai.

*   **Story 3.2: Manual Sync Button**
    *   *As a seller on Chainlens,* I want có nút "Sync Orders", *So that* tôi ép hệ thống kiểm tra đơn hàng ngay lập tức mà không cần đợi lịch Polling.

*   **Story 3.3: 3rd-Party Order Fulfillment API**
    *   *As a 3rd-party app,* I want gọi API Fulfillment của MMOMarket sau khi đã Auto-Clone Agent xong, *So that* MMOMarket cập nhật trạng thái "Delivered".
