---
stepsCompleted:
  - step-01-init
  - step-02-discovery
  - step-02b-vision
  - step-02c-executive-summary
  - step-03-success
  - step-04-user-journeys
  - step-05-domain-requirements
  - step-06-nfrs
  - step-07-out-of-scope
  - step-08-roadmap
inputDocuments:
  - docs/config-degradation-visual-handover.md
  - docs/opencode-config-failsafe-spec.md
  - docs/justavps-restart-hardening-spec.md
  - docs/epsilon-agent-os-framework-cloud-spec.md
  - docs/instance-three-layer-health-and-actions-spec.md
  - docs/index.md
  - docs/development-release-guide.md
  - docs/project-overview.md
  - docs/admin-panel-handoff.md
documentCounts:
  briefCount: 0
  researchCount: 0
  brainstormingCount: 0
  projectDocsCount: 9
workflowType: prd
---

# Product Requirements Document - chainlens

**Author:** Luisphan
**Date:** 2026-05-08

## 1. Project Classification
* **Loại hình:** SaaS B2B / Enterprise / Blockchain Web3 (AI Advisory, Code Gen & Backtesting).
* **Domain:** Fintech (Crypto Intelligence & Algorithmic Strategy Validation).
* **Độ phức tạp:** Medium-High.
* **Context:** Brownfield (Sử dụng lõi Chainlens hiện có, refactor thành kiến trúc 3 tầng).

## 2. Product Vision & Moat (Lợi thế cạnh tranh)
Chainlens (Chain = Blockchain + Lens = Soi dữ liệu) định vị là một nền tảng tư vấn và tự động hóa sinh code dành riêng cho lĩnh vực crypto, hoạt động theo mô hình Non-custodial (tuyệt đối không lưu trữ Private Key của người dùng). Được sinh ra từ Web3, phục vụ cộng đồng Web3, mục tiêu là cung cấp các công cụ "Crypto-Native" mà các mô hình AI đa dụng hiện nay không thể đáp ứng.

**Các Lợi thế Cạnh tranh (Moat) cốt lõi:**
1. **Bảo mật & Quyền riêng tư Cấp Doanh nghiệp (Tier 3 - Enterprise):** Khác với ChatGPT hay Claude yêu cầu setup thủ công và đẩy dữ liệu lên cloud, Chainlens cung cấp giải pháp đóng gói sẵn để deploy trực tiếp trên server/VPC của khách hàng, tích hợp Local LLM. Dữ liệu research và chiến lược giao dịch được giữ kín hoàn toàn (Zero-knowledge/Trustless), chính Chainlens cũng không có quyền truy cập.
2. **Crypto-Native Tooling & Hiệu ứng Bánh đà Dữ liệu (Data Flywheel):** Hệ thống sở hữu bộ công cụ chuyên biệt cho crypto, được cộng đồng tinh chỉnh. Quan trọng hơn, thông qua hoạt động của lượng lớn người dùng ở Tier 1 (Free/Shared) và Tier 2 (Premium), Chainlens liên tục crawl, index dữ liệu dự án và on-chain mới nhất. Các worker sẽ cập nhật, làm dày ngữ cảnh (RAG) và fine-tune tool mỗi ngày. Đây là kho dữ liệu sống động mà các LLM chung chung không bao giờ có.
3. **Môi trường Automated Backtesting (Tier 2 - Premium):** Tích hợp Sandbox cô lập (microVM/Firecracker) cho phép tự động kiểm thử, xác thực chiến lược/bot do AI sinh ra ngay trên dữ liệu thị trường trước khi trả kết quả cho người dùng.

## 3. Success Criteria

### 3.1. User Success
- **Tier 1 (Free):** Nhận được các cảnh báo rủi ro chuẩn xác (thông qua RAG Data) và các báo cáo phân tích tiềm năng dự án đầy đủ, cập nhật theo thời gian thực.
- **Tier 2 (Premium):** Có toàn bộ trải nghiệm của Tier 1, cộng thêm khả năng tùy biến sâu (tạo bot, agent, tool riêng). Đạt được "aha moment" khi thấy bot của họ được backtest thành công trong Sandbox và giả lập sinh lời.
- **Tier 3 (Enterprise):** Trải nghiệm toàn bộ sức mạnh của Tier 1 & 2 kết hợp với không gian làm việc nhóm (Team Collaboration). Yếu tố thành công cốt lõi là sự "an tâm 100%": hệ thống chạy mượt mà trên server riêng, bảo mật tuyệt đối chiến lược và research, không có rò rỉ dữ liệu.

### 3.2. Business Success
- **Khởi động Data Flywheel (3-6 tháng):** Đạt mốc 10.000 người dùng Tier 1 thường xuyên để làm giàu kho dữ liệu cộng đồng.
- **Doanh thu & Enterprise (6-12 tháng):** Đạt tỷ lệ chuyển đổi (conversion rate) từ 3-5% từ Tier 1 sang Tier 2. Chốt được 2-3 hợp đồng Enterprise (Tier 3).
- **Mô hình Dual-Token & Mở rộng Toàn cầu:** Triển khai Tokenomics để tạo động lực tăng trưởng. Tận dụng thanh toán xuyên biên giới để chạy Airdrop/Affiliate, đạt tốc độ User Acquisition đột phá toàn cầu. Biến chi phí marketing thành phần thưởng (Earn) chia sẻ ngược lại cho những user đóng góp giá trị.

### 3.3. Technical Success
- **Độ chính xác dữ liệu (Accuracy):** Các báo cáo research và kết quả sử dụng tool phải đạt độ chính xác > 80%.
- **Trải nghiệm mượt mà:** Tốc độ trả lời phải cực nhanh nhờ dữ liệu đã được crawl và xử lý sẵn bởi hệ thống worker 24/7 (khắc phục triệt để tình trạng "vỏ rỗng").
- **Khả năng mở rộng (Extensibility):** Chất lượng sinh code và backtest được nâng cấp theo thời gian dựa trên các model LLM mới nhất. Cung cấp hệ thống tài liệu/training để người dùng tối ưu kỹ năng prompt.

## 4. Product Scope

### 4.1. MVP (Minimum Viable Product)
- **Ưu tiên Tier 1:** Tận dụng tối đa core Chainlens hiện tại để phục vụ tập người dùng Free.
- **Giao diện Crypto-Native (Frontend Features):**
  - **Web3 Authentication Module:** UI kết nối ví đa nền tảng (MetaMask, WalletConnect, Phantom), UI chuyển đổi mạng (Ethereum, Arbitrum, Solana), hiển thị số dư, rút gọn địa chỉ ví và ENS Avatar.
  - **Generative AI Chat Widgets:** Tích hợp Vercel AI SDK để trả về UI Components thay vì text (Token Info Widget, Smart Contract Risk Badge, Transaction Simulation Card).
  - **DeFi & Market Dashboards (DeFiLlama/Nansen Data):** Bảng Yield / TVL đa cột có thể sort, kèm Sparklines. Đồ thị luân chuyển vốn (Smart Money Flow Visualizer).
  - **Advanced Charting:** Tích hợp TradingView cho biểu đồ nến (OHLCV), hỗ trợ vẽ overlay (Moving Averages, RSI).
  - **Backtest Sandbox Visualizer (Tier 2):** Trình soạn thảo Monaco Editor cho phép code/sửa chiến lược giao dịch. Các thẻ KPI (Sharpe Ratio, Max Drawdown) và Equity Curve Chart so sánh với Benchmark.
- **Data Integrations:** Xây dựng các Agent chuyên biệt kết nối API Crypto (DeFiLlama, Nansen, Dune) và Non-crypto (Perplexity AI).
- **Vibe Trading API:** Tích hợp API kết nối với hệ thống backtest "Vibe Trading" đã hoàn thiện.
- **Background Data Workers:** Xây dựng hệ thống lưu trữ thông tin crypto project và các worker chạy 24/7 liên tục phân tích và tạo báo cáo sẵn.

### 4.2. Growth Features (Post-MVP)
- **Dual-Tokenomics System & Universal Billing:** Triển khai mô hình 2 token kết hợp áp dụng cho MỌI user (từ Tier 1 đến Tier 3 Enterprise):
  1. **Internal Credits:** Điểm nạp nội bộ neo theo Fiat (vd: nạp $10 = 10 Credits). Mỗi khi user sử dụng hệ thống (sinh code LLM, query kho RAG data, chạy backtest), hệ thống trừ điểm theo công thức: `Chi phí thực tế × Hệ số lợi nhuận (Markup)`. Kể cả Enterprise (Tier 3) cũng phải nạp Credits để trả phí đồng bộ/mua quyền truy cập kho RAG data khổng lồ do cộng đồng đóng góp.
  2. **Native Token ($CLENS) & Cơ chế Burn:** User thanh toán mua Credits bằng Fiat ($) hoặc $CLENS token.
     - **Nếu thanh toán bằng $CLENS:** Một phần swap sang USDT để cover chi phí vận hành, phần lợi nhuận trích ra để **Burn (đốt) trực tiếp**.
     - **Nếu thanh toán bằng Fiat ($):** Trích phần lợi nhuận để thực hiện **Buy-back (mua lại $CLENS trên thị trường) và Burn**.
     - Tỷ lệ Buy-back & Burn sẽ được tính toán linh hoạt theo từng giai đoạn dự án, tạo động lực tăng giá trị dài hạn (tương tự $BNB).
- **Tier 2 Customization:** Mở rộng giao diện tạo bot/agent cá nhân hóa mạnh mẽ hơn cho Premium.
- **Tier 3 Packaging:** Đóng gói giải pháp On-premise + Local LLM + Team Workspace cho Enterprise (kèm API/Credit Gateway để đồng bộ RAG Data).
- **Advanced Code Gen:** Liên tục nâng cấp bộ sinh code dựa trên model LLM tiên tiến nhất.
- **Crypto-Specific LLM & MaaS (Model-as-a-Service):** Phát triển một model LLM riêng biệt, chuyên sâu về dự đoán và phân tích kiến thức Crypto (có thể fine-tune từ open-source hoặc phát triển mới). Model này sẽ tận dụng nguồn dữ liệu chuẩn, chất lượng cao được sinh ra từ quá trình research của AI cùng với sự đồng ý chia sẻ từ tập người dùng Free và Premium. Từ đó, cung cấp dịch vụ LLM chuyên ngành cho cộng đồng và đối tác.

## 5. User Journeys (Hành trình Người dùng)

### 5.1. Hành trình 1: Minh - Nhà Đầu tư Cá nhân (Tier 1) & "Airdrop Hunter"
*   **Tình huống:** Minh bị ngợp bởi thông tin rác và muốn tìm kiếm insight an toàn, đồng thời muốn kiếm thêm $CLENS token.
*   **Diễn biến:** Minh đăng ký Chainlens miễn phí và được tặng một ít **Internal Credits** khởi điểm. Anh hỏi AI về một đồng meme coin. Hệ thống trừ một lượng Credit cực nhỏ, truy xuất báo cáo RAG và cảnh báo rủi ro về smart contract. Minh tránh được mất tiền. Thấy hữu ích, Minh tham gia xác thực dữ liệu on-chain cho cộng đồng. Minh được hệ thống thưởng **$CLENS token**. Minh dùng số token này nạp ngược lại vào hệ thống để quy đổi thành Credits dùng tiếp, hoặc đem bán. Anh cũng lấy link Affiliate giới thiệu bạn bè để kiếm thêm token thụ động.

### 5.2. Hành trình 2: Alex - Quant Trader (Tier 2 - Premium)
*   **Tình huống:** Alex cần môi trường Sandbox để backtest các bot giao dịch tốn nhiều tài nguyên tính toán.
*   **Diễn biến:** Alex nạp $100 bằng thẻ tín dụng (Fiat). Anh nhận được **100 Internal Credits**. Alex tạo Custom Agent để sinh code Arbitrage và đẩy vào Sandbox (MicroVM) chạy qua Vibe Trading API. Quá trình sinh code dùng LLM tốn $1 thực tế, hệ thống tính hệ số 2x và trừ 2 Credits. Alex thấy chi phí minh bạch và rẻ hơn nhiều so với việc tự thuê server/LLM API riêng lẻ. *(Từ $100 Fiat này, sau khi trừ chi phí vận hành hệ thống, một phần lợi nhuận được trích ra tự động lên sàn mua lại $CLENS và Burn).*

### 5.3. Hành trình 3: Sarah - Quỹ Đầu tư (Tier 3 - Enterprise)
*   **Tình huống:** Quỹ của Sarah mua gói On-premise để bảo mật tuyệt đối chiến lược giao dịch, nhưng họ vẫn "khát" dữ liệu thị trường (RAG Data).
*   **Diễn biến:** Sarah cho deploy Chainlens Local LLM lên Server riêng của quỹ. Để có dữ liệu phân tích, quỹ của Sarah phải mua một lượng lớn **Internal Credits** (thanh toán bằng Fiat hoặc $CLENS). Mỗi khi Local LLM của Sarah query dữ liệu thị trường mới nhất từ kho RAG của Chainlens (do cộng đồng toàn cầu đóng góp), Credits của quỹ sẽ bị trừ. Quỹ của Sarah vừa đảm bảo được Zero-Data-Leakage (không lộ code chiến lược), vừa có nguồn dữ liệu on-chain khổng lồ mà không cần tự xây dựng Data Pipeline.

### 5.4. Hành trình 4: Đạt - Admin & System Ops (Internal)
*   **Tình huống:** Chainlens đang tăng trưởng nóng, lượng request đổ về rất lớn.
*   **Diễn biến:** Đạt theo dõi Admin Dashboard. Anh thấy lượng **Internal Credits** bị đốt đang tăng vọt ở cả 3 Tier. Cuối tháng, hệ thống tự động tổng kết doanh thu. Đạt chạy kịch bản Smart Contract: (1) Với doanh thu từ $CLENS, trích phần lợi nhuận để **Burn trực tiếp**. (2) Với doanh thu từ Fiat, trích lợi nhuận để **Buy-back $CLENS trên thị trường rồi Burn**. Đạt sau đó công bố báo cáo "Burn Report" hàng tháng, tạo hiệu ứng FOMO tích cực trên cộng đồng Web3 và đẩy giá trị $CLENS tăng trưởng.

## 6. Domain Requirements (Yêu cầu Đặc thù Ngành)

Bởi vì Chainlens hoạt động trong không gian Crypto/Web3, hệ thống phải tuân thủ các nguyên tắc thiết kế kỹ thuật và nghiệp vụ sau:

### 6.1. JIT Data Sync (Đồng bộ dữ liệu Just-In-Time)
- **Cơ chế:** Không cần định nghĩa SLA cứng (độ trễ) cho hệ thống index nền. Worker index sẽ chạy hết công suất để làm giàu dữ liệu nền. Tuy nhiên, khi có truy vấn từ người dùng (User Request), Agent sẽ tự động lấy snapshot ở thời điểm hiện tại và bù đắp các khoảng trống dữ liệu (gaps) trực tiếp từ các nguồn Real-time.
- **Mục đích:** Đảm bảo LLM luôn có dữ liệu mới nhất (real-time) trước khi đưa ra phân tích hay sinh code, ngăn chặn việc ra quyết định dựa trên dữ liệu cũ.

### 6.2. Agnostic Multi-chain Support (Hỗ trợ Đa chuỗi)
- **Cơ chế:** Dựa vào năng lực nội tại của các model LLM chất lượng cao và hệ thống OpenCode. Các LLM xịn đã được train trên toàn bộ dữ liệu code của hầu hết các blockchain (EVM, Solana, Move, v.v.). Hệ thống không cần hard-code hỗ trợ từng chuỗi mà sẽ dựa vào khả năng tự nhận diện và sinh code của LLM.

### 6.3. Security & Hallucination Mitigation (Bảo mật & Giảm thiểu Ảo giác)
- **Validation Layer:** Mọi đoạn code smart contract hay bot giao dịch do AI sinh ra bắt buộc phải đi qua một lớp kiểm duyệt (quét lỗ hổng cơ bản, reentrancy, v.v.) và Sandbox testing.
- **Disclaimer:** Áp dụng miễn trừ trách nhiệm pháp lý bắt buộc đối với mọi tư vấn đầu tư và code sinh ra, người dùng hoàn toàn chịu trách nhiệm với quyết định của mình.

### 6.4. Zero-Data-Leakage (Riêng tư tuyệt đối cho Enterprise)
- **Inbound-Only RAG Sync:** Đối với bản On-premise (Tier 3), Local LLM chỉ được phép nhận dữ liệu RAG (Market Market Data) từ máy chủ trung tâm của Chainlens thông qua API. Hệ thống nội bộ của khách hàng bị ngắt hoàn toàn kết nối gửi dữ liệu chiều ra (outbound telemetry) về Chainlens để đảm bảo chiến lược giao dịch và code riêng tư không bị rò rỉ hay sử dụng để train model.

## 7. Non-Functional Requirements (Yêu cầu Phi chức năng)

### 7.1. Performance & Latency (Hiệu suất & Độ trễ)
- **Time-to-First-Byte (TTFB) cho AI Chat:** Độ trễ từ khi User gửi câu hỏi đến khi AI trả về token đầu tiên (streaming) phải **< 2 giây**.
- **JIT RAG Sync Latency:** Quá trình Agent tự động snapshot và bù đắp dữ liệu (gaps) từ nguồn thời gian thực trước khi gọi LLM không được vượt quá **1.5 giây**.
- **Sandbox Execution (Tier 2):** Thời gian khởi tạo MicroVM (Firecracker) để chạy code backtest phải **< 1 giây**. Hệ thống áp dụng cơ chế Timeout cứng (vd: 30s) cho mỗi tiến trình chạy code để tránh treo tài nguyên.

### 7.2. Scalability (Khả năng mở rộng)
- **Concurrent Users (CCU):** Hệ thống MVP phải xử lý mượt mà tối thiểu **1,000 CCU** (tương tác trực tiếp với Agent) mà không suy giảm hiệu năng.
- **Worker Auto-scaling:** Đội ngũ Data Workers cào dữ liệu ngầm phải tự động scale-out dựa trên số lượng dự án crypto mới được thêm vào hệ thống giám sát.

### 7.3. Reliability & Fallback (Độ tin cậy & Chống đứt gãy)
- **LLM Provider Fallback:** Không phụ thuộc hoàn toàn vào một nhà cung cấp LLM. Nếu API chính sự cố, hệ thống tự động chuyển sang (fallback) model dự phòng tương đương trong vòng < 1 giây.
- **High Availability (HA):** Cam kết uptime 99.9% cho các dịch vụ Core (Tương tác AI và Quản lý Credits).

### 7.4. Security & Abuse Prevention (Bảo mật & Chống lạm dụng)
- **Atomic Credit Deduction:** Giao dịch trừ Internal Credits khi sử dụng LLM hoặc RAG phải đảm bảo tính nguyên tử (Atomic). Nếu trừ điểm thất bại, hệ thống sẽ chặn request.
- **Strict Rate Limiting:** Thiết lập giới hạn request chặt chẽ cho Tier 1 (Free) dựa trên IP và Account để ngăn chặn tấn công bào mòn tài nguyên LLM.
- **Sandbox Isolation:** Code sinh ra chạy trong Sandbox (Tier 2) bị ngắt truy cập mạng bên ngoài (no outbound network), chỉ được kết nối đến Vibe Trading API nội bộ, nhằm chống lại mã độc (C2C).

## 8. Out of Scope (Ngoài Phạm vi Dự án)

Để tránh tình trạng "phình to" yêu cầu (Scope Creep) và giữ vững định vị của sản phẩm, Chainlens sẽ **KHÔNG** làm những việc sau:

1. **Không lưu trữ Private Key & Không tự động trade (Non-Custodial):** Chainlens là nền tảng AI Tư vấn & Sinh code (Advisory & Code Gen). Hệ thống tuyệt đối không lưu trữ seed phrase/private key của người dùng và không trực tiếp đặt lệnh giao dịch thay người dùng trên các sàn CEX/DEX.
2. **Không làm Fiat On-ramp / Off-ramp nội bộ:** Các giao dịch nạp tiền bằng Fiat ($) hoặc đổi Crypto sang Fiat sẽ sử dụng Gateway của bên thứ 3 (như Stripe, MoonPay, Binance Pay). Chainlens không tự xây dựng cổng thanh toán pháp định để tránh gánh nặng về pháp lý và Compliance (KYC/AML) phức tạp.
3. **Không xây dựng Blockchain hay Layer 2 riêng:** Sản phẩm tập trung vào Data Intelligence và LLM Application. Việc tạo mạng lưới blockchain riêng là không cần thiết ở giai đoạn này và gây phân tán nguồn lực.
4. **Không tư vấn đầu tư tài chính trực tiếp (Financial Advice):** Mọi kết quả phân tích từ AI là báo cáo kỹ thuật và rủi ro dựa trên dữ liệu on-chain/smart contract. Chainlens không đưa ra các lời khuyên dạng "Buy/Sell", luôn có Disclaimer rõ ràng.

## 9. Roadmap & Milestones (Lộ trình Phát hành)

Để đảm bảo dự án ra mắt nhanh chóng và kiểm chứng được mô hình kinh doanh, Chainlens sẽ được triển khai theo các giai đoạn sau:

### Phase 1: Minimum Viable Product (MVP) - Mở khóa Data Flywheel
*   **Mục tiêu:** Chứng minh năng lực tư vấn crypto của AI và đưa Data Workers vào hoạt động.
*   **Tính năng chính:**
    *   Tái cấu trúc (Refactor) Chainlens Core để hỗ trợ Multi-Agent (Tier 1 & Tier 2).
    *   Xây dựng hệ thống Background Workers để Crawl & Index dữ liệu từ DeFiLlama, Dune, Nansen.
    *   Tích hợp Vibe Trading API & Sandbox (MicroVM) cho Tier 2 backtest cơ bản.
*   **Target:** Đạt 10.000 users miễn phí đầu tiên để đóng góp làm giàu RAG Data.

### Phase 2: Dual-Tokenomics & Enterprise - Dòng tiền & Bảo mật
*   **Mục tiêu:** Kích hoạt mô hình kinh tế bền vững và onboard khách hàng doanh nghiệp.
*   **Tính năng chính:**
    *   Phát hành $CLENS Token và Hệ thống quản lý Internal Credits.
    *   Triển khai Smart Contract cho cơ chế Burn / Buy-back.
    *   Ra mắt tính năng Affiliate/Airdrop trả thưởng cho người dùng cung cấp dữ liệu.
    *   Đóng gói giải pháp On-premise + Local LLM (Tier 3) và bán cho Quỹ đầu tư đầu tiên.
*   **Target:** Đạt doanh thu ổn định, thực hiện đợt Burn token đầu tiên.

### Phase 3: Model-as-a-Service (MaaS) - Hệ sinh thái Khép kín
*   **Mục tiêu:** Trở thành nhà cung cấp hạ tầng AI chuyên biệt cho Web3.
*   **Tính năng chính:**
    *   Fine-tune / Train model LLM độc quyền cho Crypto (Crypto-Specific LLM) dựa trên tập dữ liệu đã được clean.
    *   Mở API cho phép bên thứ 3 (Các Dapp, Sàn giao dịch) thuê lại model và RAG Data.
*   **Target:** Đạt độ chính xác > 95% cho các kịch bản dự đoán rủi ro smart contract và tối ưu lợi nhuận farming.
