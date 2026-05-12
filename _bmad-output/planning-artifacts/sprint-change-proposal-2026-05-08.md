# Sprint Change Proposal

## Section 1: Issue Summary
- **Trigger:** Người dùng yêu cầu phân tích chuyên sâu hơn về các giao diện hiển thị (UI/UX) khi tích hợp các API đặc thù của Crypto (DeFiLlama, Nansen, Dune, Web3 Auth, TradingView) cho dự án Chainlens.
- **Context:** Dự án Chainlens (đã được đổi tên từ Chainlens) đang định hướng trở thành một Nền tảng AI Crypto-Native Assistant. Việc chỉ gọi API ở backend và trả về văn bản thuần là trải nghiệm rất tồi đối với Crypto/DeFi. Người dùng cần có các widget trực quan (Generative UI), biểu đồ tương tác, bảng dữ liệu động và khả năng kết nối ví mượt mà để tương tác với dữ liệu chuỗi (on-chain) và thực hiện các giao dịch hoặc backtest.
- **Evidence:** Kế hoạch hiện tại bỏ sót việc thiết kế và lập trình các UI Components chuyên biệt (như Token Cards, Risk Badges, Yield Tables, Interactive Charts) để hiển thị dữ liệu từ DeFiLlama, Nansen, hay kết quả Backtest.

## Section 2: Impact Analysis
- **Epic Impact:** Mở rộng EPIC-4 (Chainlens Crypto-Native UI/UX Integration) với độ chi tiết cao hơn về các module Frontend cần xây dựng.
- **Technical Impact:** 
  - **Generative UI:** Cần sử dụng `Vercel AI SDK` (`ai/rsc` hoặc `ai/solid`) để stream các React/Solid Components trực tiếp vào khung chat thay vì text.
  - **Web3 Integration:** Sử dụng `wagmi`, `viem`, `ConnectKit` hoặc `RainbowKit` cho luồng Wallet Connection & Network Management.
  - **Data Visualization:** Tích hợp `TradingView Lightweight Charts` (cho nến Nhật/giá) và `Recharts` (cho line/bar chart đơn giản như TVL, APY).
  - **Editor:** Tích hợp `@monaco-editor/react` cho môi trường Sandbox Backtest.

## Section 3: Recommended Approach
- **Selected Approach:** **Option 1 (Direct Adjustment)** - Nâng cấp Frontend hiện có của Chainlens.
- **Rationale:** Tận dụng core frontend hiện tại, nhưng xây dựng thêm một thư viện Crypto-UI Components dùng chung, sau đó tích hợp chúng vào Chat Interface và Dashboard. Đây là con đường duy nhất để đạt được chất lượng sản phẩm Web3 chuyên nghiệp.
- **Effort:** High (Đòi hỏi thiết kế và lập trình nhiều component phức tạp).
- **Risk:** Medium (Cần quản lý tốt trạng thái giữa Web3 Provider, Chat State và Backend Server).

## Section 4: Detailed Change Proposals

### 4.1. Thay đổi trên `prd.md`
**Vị trí:** `4.1 MVP (Minimum Viable Product)`
- **NEW:**
  - **Giao diện Crypto-Native (Frontend Features Detailed):**
    - **Web3 Authentication Module:** UI kết nối ví (MetaMask, WalletConnect, Phantom), UI chuyển đổi mạng (Ethereum, Arbitrum, Solana), hiển thị số dư, rút gọn địa chỉ ví và ENS Avatar.
    - **Generative AI Chat Widgets:** Tích hợp Vercel AI SDK để trả về UI Components thay vì text:
      - *Token Info Widget:* Hiển thị Price, 24h Change, Market Cap, FDV, Smart Contract (có nút Copy/Explorer).
      - *Smart Contract Risk Badge:* Cảnh báo trực quan (Xanh/Vàng/Đỏ) về tỷ lệ rủi ro (Honeypot, Audit Status).
      - *Transaction Simulation Card:* Preview giao dịch (Estimated Output, Slippage, Gas Fee) với nút "Approve/Swap" an toàn.
    - **DeFi & Market Dashboards (DeFiLlama/Nansen Data):**
      - *Yield / TVL Tables:* Bảng dữ liệu đa cột có thể sort, kèm Sparklines (biểu đồ nhỏ) hiển thị biến động APY 7 ngày.
      - *Smart Money Flow Visualizer:* Đồ thị Sankey hoặc Bubble chart biểu diễn dòng tiền của cá mập (Nansen data).
    - **Advanced Charting:** Tích hợp TradingView cho biểu đồ nến (OHLCV), hỗ trợ vẽ overlay (Moving Averages, RSI).
    - **Backtest Sandbox Visualizer (Tier 2):**
      - *IDE Widget:* Trình soạn thảo Monaco Editor cho phép code/sửa chiến lược giao dịch.
      - *Performance Report:* Các thẻ KPI (Sharpe Ratio, Max Drawdown, Win Rate, Total Return).
      - *Equity Curve Chart:* Biểu đồ PnL so sánh với Benchmark (ví dụ: Buy & Hold ETH).

### 4.2. Thay đổi trên `epics.md`
**Vị trí:** `EPIC-4: Chainlens Crypto-Native UI/UX Integration` (Bổ sung chi tiết)
- **NEW:**
  - **Story 4.1: Xây dựng Hệ thống Web3 Auth & Wallet Management:** UI kết nối ví đa nền tảng, quản lý network, hiển thị ENS/Avatar.
  - **Story 4.2: Phát triển Crypto-UI Component Library:** Xây dựng Token Card, Risk Badge, Address Formatter, Sparklines, Data Grids chuyên biệt cho Web3.
  - **Story 4.3: Tích hợp Vercel AI SDK Generative UI:** Chuyển đổi response từ Agent thành React/Solid Components (Stream biểu đồ, Token Info trực tiếp vào chat).
  - **Story 4.4: Xây dựng Advanced Market Dashboard:** Tích hợp TradingView Lightweight Charts và Recharts để trực quan hóa dữ liệu từ DeFiLlama/Nansen.
  - **Story 4.5: Xây dựng Sandbox IDE & Backtest Visualizer:** Tích hợp Monaco Editor và biểu đồ Performance Report (Equity Curve, KPI Dashboard).

### 4.3. Thay đổi trên `sprint-status.yaml`
**Vị trí:** Bổ sung EPIC-4 vào danh sách epics và backlog.

## Section 5: Implementation Handoff
- **Scope:** Major (Tác động sâu đến kiến trúc UI/UX và yêu cầu nhiều tool mới).
- **Handoff To:** UX Designer Agent (Bắt đầu vẽ Wireframes/User Flows cho các Widgets và Dashboards), Developer Agent (Cập nhật codebase, cài đặt các thư viện `wagmi`, `tradingview`, `ai`).
- **Success Criteria:** Hệ thống UI/UX của Chainlens phản ánh đúng định vị nền tảng AI Web3 chuyên nghiệp, dữ liệu on-chain được hiển thị qua các Widget động thay vì text.
