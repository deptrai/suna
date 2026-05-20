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
  - step-e-01-discovery
  - step-e-02-review
  - step-e-03-edit
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
  - _bmad-output/planning-artifacts/architecture.md
  - _bmad-output/planning-artifacts/research/technical-self-host-defillama-chainlens-research-2026-05-18.md
documentCounts:
  briefCount: 0
  researchCount: 0
  brainstormingCount: 0
  projectDocsCount: 9
workflowType: prd
workflow: edit
lastEdited: '2026-05-18'
editHistory:
  - date: '2026-05-18'
    changes: 'Aligned DeFiLlama requirements with self-host provider boundary, hybrid fallback, and unchanged Epic 1/2 tool contracts.'
  - date: '2026-05-18'
    changes: 'Added backend-owned model availability/quota requirements, FE disable-hide behavior, measurable reliability targets, and a dedicated Functional Requirements section.'
---

# Product Requirements Document - chainlens

**Author:** Luisphan
**Date:** 2026-05-08

## 0. Product Introduction (Project Narrative)

### 0.1. Vấn đề Chainlens giải quyết
Người dùng crypto hiện phải đi qua quá nhiều công cụ rời rạc: đọc tin ở một nơi, kiểm tra rủi ro contract ở nơi khác, phân tích dòng tiền ở nơi khác nữa, rồi tự dựng môi trường backtest để xác thực chiến lược. Quy trình này chậm, dễ sai, và khó kiểm soát chất lượng quyết định.

### 0.2. Chainlens là gì
Chainlens là nền tảng AI crypto-native hợp nhất **research + risk intelligence + strategy validation** trong một workflow liền mạch:
- Phát hiện tín hiệu và rủi ro thị trường theo thời gian gần real-time.
- Phân tích bằng các tool chuyên dụng on-chain/DeFi thay vì chỉ trả lời LLM chung chung.
- Xác thực chiến lược bằng sandbox/backtest trước khi đưa ra quyết định triển khai.

### 0.3. Giá trị cốt lõi theo 3 tầng
- **Tier 1 - Free Intelligence:** Cảnh báo rủi ro, Discover feed, và insight research cho người dùng phổ thông.
- **Tier 2 - Premium Execution:** Bộ Vibe-Trading toolkit, backtest/sandbox, multi-strategy & swarm workflows cho trader/quant.
- **Tier 3 - Enterprise Privacy:** Triển khai private/on-prem với kiểm soát dữ liệu và boundary bảo mật cấp doanh nghiệp.

### 0.4. Đối tượng chính
- Nhà đầu tư cá nhân cần tín hiệu nhanh và kiểm tra rủi ro.
- Trader/quant cần vòng lặp nghiên cứu → giả thuyết → backtest.
- Team/quỹ cần môi trường private deployment và kiểm soát dữ liệu nghiêm ngặt.

## 1. Project Classification
* **Loại hình:** SaaS B2B / Enterprise / Blockchain Web3 (AI Advisory, Code Gen & Backtesting).
* **Domain:** Fintech (Crypto Intelligence & Algorithmic Strategy Validation).
* **Độ phức tạp:** Medium-High.
* **Context:** Brownfield (Cải tiến UI/UX dựa trên nền tảng web code hiện có, không thiết kế mới hoàn toàn. Refactor thành kiến trúc 3 tầng để tối ưu và mở rộng).

## 2. Product Vision & Moat (Lợi thế cạnh tranh)
Chainlens (Chain = Blockchain + Lens = Soi dữ liệu) định vị là một nền tảng tư vấn và tự động hóa sinh code dành riêng cho lĩnh vực crypto, hoạt động theo mô hình Non-custodial (tuyệt đối không lưu trữ Private Key của người dùng). Được sinh ra từ Web3, phục vụ cộng đồng Web3, mục tiêu là cung cấp các công cụ "Crypto-Native" mà các mô hình AI đa dụng hiện nay không thể đáp ứng.

**Các Lợi thế Cạnh tranh (Moat) cốt lõi:**
1. **Trang Tin tức & Cảnh báo AI-Generated (Vượt trội CoinMarketCap):** Một trang "Discover" tin tức sinh bởi AI (tương tự Perplexity) tổng hợp từ đa nguồn và từ chính quá trình tương tác của cộng đồng người dùng với AI Chat Assistant. Thông tin này hiển thị real-time, public cho mọi user (kể cả Free), tạo ra sức mạnh cảnh báo rủi ro đám đông tức thì.
2. **Bảo mật & Quyền riêng tư Cấp Doanh nghiệp (Tier 3 - Enterprise):** Khác với ChatGPT hay Claude yêu cầu setup thủ công và đẩy dữ liệu lên cloud, Chainlens cung cấp giải pháp đóng gói sẵn để deploy trực tiếp trên server/VPC của khách hàng, tích hợp Local LLM. Dữ liệu research và chiến lược giao dịch được giữ kín hoàn toàn (Zero-knowledge/Trustless), chính Chainlens cũng không có quyền truy cập.
3. **Crypto-Native Tooling & Hiệu ứng Bánh đà Dữ liệu (Data Flywheel):** Hệ thống sở hữu bộ công cụ chuyên biệt cho crypto, được cộng đồng tinh chỉnh. Quan trọng hơn, thông qua hoạt động của lượng lớn người dùng ở Tier 1 (Free/Shared) và Tier 2 (Premium), Chainlens liên tục crawl, index dữ liệu dự án và on-chain mới nhất. Các worker sẽ cập nhật, làm dày ngữ cảnh (RAG) và fine-tune tool mỗi ngày. Đây là kho dữ liệu sống động mà các LLM chung chung không bao giờ có.
4. **Môi trường Automated Backtesting (Tier 2 - Premium):** Tích hợp Sandbox cô lập (microVM/Firecracker) cho phép tự động kiểm thử, xác thực chiến lược/bot do AI sinh ra ngay trên dữ liệu thị trường trước khi trả kết quả cho người dùng.

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
- **Độ tin cậy nguồn dữ liệu DeFi:** Các tool DeFi phải giữ nguyên response contract khi đổi nguồn dữ liệu phía sau. Nếu bật self-host DeFiLlama, hệ thống phải chạy shadow validation tối thiểu 7 ngày, TVL divergence < 2% cho core protocols, fees/revenue divergence < 5%, và tự fallback sang public/pro API khi self-host lỗi hoặc timeout.

## 4. Product Scope

### 4.1. MVP (Minimum Viable Product)
- **Ưu tiên Tier 1:** Tận dụng tối đa core Chainlens hiện tại để phục vụ tập người dùng Free.
- **Giao diện Crypto-Native (Frontend Features - Cải tiến từ nền tảng cũ):**
  - **Browser Extension (Vigilant Companion):** Dạng extension nhẹ tích hợp thẳng vào trình duyệt (Side Panel). Tự động detect token/smart contract khi người dùng lướt X, Facebook, Dexscreener, CoinMarketCap. Cung cấp cảnh báo rủi ro nhanh qua tooltip và đồng bộ lịch sử chat với tài khoản web chính. Cung cấp nút Expand để mở full web app khi cần phân tích sâu.
  - **AI-Generated News & Discover Page:** Trang tin tức thông minh tổng hợp tự động từ nhiều nguồn và từ dữ liệu tương tác ẩn danh của các user với AI. Cung cấp cảnh báo sớm (early warnings) và alpha insights cho tất cả người dùng (bao gồm Free Tier), mục tiêu vượt qua trải nghiệm truyền thống của CoinMarketCap.
  - **Web3 Authentication Module:** UI kết nối ví đa nền tảng (MetaMask, WalletConnect, Phantom), UI chuyển đổi mạng (Ethereum, Arbitrum, Solana), hiển thị số dư, rút gọn địa chỉ ví và ENS Avatar.
  - **Generative AI Chat Widgets:** Tích hợp Vercel AI SDK để trả về UI Components thay vì text (Token Info Widget, Smart Contract Risk Badge, Transaction Simulation Card).
  - **DeFi & Market Dashboards (DeFiLlama/Nansen Data):** Bảng Yield / TVL đa cột có thể sort, kèm Sparklines. Đồ thị luân chuyển vốn (Smart Money Flow Visualizer).
  - **Advanced Charting:** Tích hợp TradingView cho biểu đồ nến (OHLCV), hỗ trợ vẽ overlay (Moving Averages, RSI).
  - **Backtest Sandbox Visualizer (Tier 2):** Trình soạn thảo Monaco Editor cho phép code/sửa chiến lược giao dịch. Các thẻ KPI (Sharpe Ratio, Max Drawdown) và Equity Curve Chart so sánh với Benchmark.
- **Data Integrations:** Xây dựng các Agent chuyên biệt kết nối dữ liệu Crypto (DeFiLlama, Nansen, Dune, Token Terminal) và Non-crypto (Perplexity AI) thông qua API nội bộ của Chainlens. Agent/OpenCode tool không gọi trực tiếp provider bên thứ ba hoặc self-host data service; backend chịu trách nhiệm chọn provider, chuẩn hóa response, cache, billing, fallback, và bảo vệ API keys.
- **DeFiLlama Provider Boundary:** Toàn bộ dữ liệu DeFiLlama phải đi qua một lớp provider phía backend với 4 mode vận hành: `public`, `pro`, `selfhost`, `hybrid`. `selfhost` chỉ hợp lệ khi Chainlens tự chạy selected DefiLlama adapters, tự gọi RPC, và lưu metric snapshots riêng; không tạo service trung gian nếu service đó chỉ proxy `api.llama.fi` hoặc `pro-api.llama.fi`. Mode migration mặc định là `hybrid`: thử self-host trước cho protocol/category được hỗ trợ, fallback public/pro khi lỗi.
- **Model Availability & Quota Signaling (LLM Catalog):** Hệ thống phải cung cấp trạng thái model theo tài khoản ở API nội bộ (available/unavailable + reason code). Model picker trên frontend/extension phải tiêu thụ trạng thái này để disable hoặc ẩn model không khả dụng, ngăn người dùng chọn model sẽ fail do hết quota hoặc provider tạm ngưng.
- **Vibe Trading Platform Integration (Tier 2):** Tích hợp toàn bộ Vibe-Trading research toolkit — không chỉ backtest. Cung cấp cho Tier 2 agent truy cập:
  - **Backtesting Engine:** Kết nối Celery-backed backtest với Monaco Editor UI (Sharpe/Drawdown/Equity Curve visualization). Tích hợp qua HTTP + SSE streaming cho Backtest Sandbox Visualizer.
  - **Research Toolkit (21 MCP tools):** Market data (6 sources: yfinance/OKX/Tushare/AKShare/CCXT), options pricing (Black-Scholes + Greeks), chart pattern recognition, factor analysis (IC/IR), 72 finance skill methodologies.
  - **Shadow Account Loop (flagship):** Upload broker CSV (同花顺/东财/富途/generic) → agent tự động chạy 5-step analysis (journal profiling → strategy extraction → multi-market backtest → HTML/PDF report → today signals scan).
  - **Multi-Agent Swarm Teams:** 29 pre-built research teams (Investment Committee, Quant Strategy Desk, Crypto Trading Desk, Risk Committee, v.v.) chạy DAG-based collaborative LLM workflows. Sử dụng user's own LLM API key (BYOK pattern) — LLM tokens billed by provider directly; Chainlens chỉ charge orchestration fee.
  - **Integration architecture:** MCP Proxy pattern (Story 5.5) — epsilon-api intercepts MCP JSON-RPC tool calls cho atomic billing (NFR8), sandbox egress unchanged (NFR10 preserved). Zero per-tool boilerplate — tools auto-discovered via MCP `tools/list`.
- **Background Data Workers:** Xây dựng hệ thống lưu trữ thông tin crypto project và các worker chạy 24/7 liên tục phân tích và tạo báo cáo sẵn. Với DeFiLlama, chỉ được chọn một ingestion owner làm primary tại một thời điểm: Chainlens BullMQ crawler crawl public/pro API vào DB Chainlens, hoặc `chainlens-data-service` tự chạy adapters/RPC và Chainlens đọc qua HTTP. Không chạy cả hai làm primary song song. Với các luồng real-time như Mempool Sniffing & MEV Tracking, worker chạy nền qua provider WebSocket do platform/operator cấu hình (MVP: QuickNode WSS), lưu alert vào DB, sau đó Agent/OpenCode tool chỉ query dữ liệu đã index qua API nội bộ; tool không tự mở kết nối mempool theo từng lần gọi. Với các luồng on-chain verification như Fact Checking, QuickNode HTTP RPC là provider mặc định để đọc logs/balance/call theo chain được cấu hình; Etherscan/Blockscout/Moralis chỉ là fallback hoặc supplemental. Với Entity/Hacker Wallet Tracking, Arkham là provider chính cho entity labels, còn QuickNode chỉ là optional verification adapter. Với Financial Statement/Valuation, Token Terminal API là paid/custom provider; worker chạy daily/cache-first theo project/metric allowlist, lưu normalized fundamentals vào DB, và Agent/OpenCode chỉ gọi API/tool nội bộ chứ không nhận API key hoặc raw provider payload. Tất cả worker multi-chain hoặc multi-project theo env/config allowlist, không crawl toàn bộ blockchain mặc định.

### 4.2. Growth Features (Post-MVP)
- **Autonomous AI Agents (Manus.ai Clone Capabilities):** Tận dụng tối đa kiến trúc Sandbox, Triggers, và agent-browser để cung cấp các luồng tự động hóa sâu:
  1. **Autonomous Deep Research:** Agent tự động mở trình duyệt vượt paywall, cào dữ liệu từ nhiều nguồn và tổng hợp báo cáo chuyên sâu.
  2. **Data Analyst & Visualizer:** Cung cấp môi trường Sandbox an toàn chạy code Python/Bash để clean dữ liệu thô (từ CSV/DB) và xuất biểu đồ (interactive dashboards).
  3. **Auto-Dev & QA:** Tự động build ứng dụng (Frontend/Backend) thông qua cơ chế Fork Sandbox, tự động test giao diện với agent-browser và sửa lỗi.
  4. **Smart Ops & Auto-Resolution:** Kết nối Pipedream webhook và Slack. Khi có lỗi (ví dụ lỗi thanh toán Stripe), Agent kiểm tra log và tự động đề xuất phương án khắc phục qua Slack (chờ Human Approval).
  5. **24/7 Market Monitor:** Bot chạy ngầm (Heartbeats), theo dõi tin tức/social media real-time và kích hoạt lệnh dừng giao dịch khi phát hiện rủi ro.
  6. **Multi-Agent Swarm Orchestration:** Người quản lý (Manager Agent) chia nhỏ task cho Researcher Agent, Coder Agent, và QA Agent làm việc song song để giải quyết bài toán lớn.
- **Dual-Tokenomics System & Universal Billing:** Triển khai mô hình 2 token kết hợp áp dụng cho MỌI user (từ Tier 1 đến Tier 3 Enterprise):
  1. **Internal Credits:** Điểm nạp nội bộ neo theo Fiat (vd: nạp $10 = 10 Credits). Mỗi khi user sử dụng hệ thống (sinh code LLM, query kho RAG data, chạy backtest), hệ thống trừ điểm theo công thức: `Chi phí thực tế × Hệ số lợi nhuận (Markup)`. Kể cả Enterprise (Tier 3) cũng phải nạp Credits để trả phí đồng bộ/mua quyền truy cập kho RAG data khổng lồ do cộng đồng đóng góp.
  2. **Native Token ($CLENS) & Cơ chế Burn:** User thanh toán mua Credits bằng Fiat ($) hoặc $CLENS token.
     - **Nếu thanh toán bằng $CLENS:** Một phần swap sang USDT để cover chi phí vận hành, phần lợi nhuận trích ra để **Burn (đốt) trực tiếp**.
     - **Nếu thanh toán bằng Fiat ($):** Trích phần lợi nhuận để thực hiện **Buy-back (mua lại $CLENS trên thị trường) và Burn**.
     - Tỷ lệ Buy-back & Burn sẽ được tính toán linh hoạt theo từng giai đoạn dự án, tạo động lực tăng giá trị dài hạn (tương tự $BNB).
- **Tier 2 Customization:** Mở rộng giao diện tạo bot/agent cá nhân hóa mạnh mẽ hơn cho Premium.
- **Tier 3 Packaging:** Đóng gói giải pháp On-premise + Local LLM + Team Workspace cho Enterprise (kèm API/Credit Gateway để đồng bộ RAG Data).
- **Advanced Code Gen:** Liên tục nâng cấp bộ sinh code dựa trên model LLM tiên tiến nhất.
- **Bring Your Own Key (BYOK) & Proof of Contribution:** Cơ chế bootstrapping thông minh giải quyết bài toán chi phí API khổng lồ ban đầu. User sử dụng API Key cá nhân (OpenAI/Anthropic) để tương tác với hệ thống. Chainlens sẽ đo lường chi phí này và thưởng lại cho user bằng `$CLENS` token (Airdrop) dựa trên lượng token tiêu thụ và chất lượng dữ liệu họ đóng góp vào kho RAG.
- **Local Compute (Ollama Integration):** Hỗ trợ user kết nối Local LLM thông qua Ollama. User có thể chạy các model open-source ngay trên máy cá nhân để sử dụng Chainlens hoàn toàn miễn phí và đảm bảo quyền riêng tư tuyệt đối (Zero-Data-Leakage), dữ liệu không gửi qua bất kỳ API bên thứ ba nào.
- **LLM Proxy & Crypto-Specific MaaS (Model-as-a-Service):** Đóng vòng lặp Tokenomics bằng cách biến Chainlens thành "OpenRouter cho Web3". User nạp `$CLENS` hoặc USDT để mua quyền truy cập ẩn danh vào các model thương mại, hoặc mua quyền truy cập vào model tự host (Qwen 3.6 27B) với giá cực rẻ. Dự án sẽ thu biên lợi nhuận (Profit Margin) cao từ việc bán model do chính mình host.
- **Agent Marketplace Integration (MMOMarket):** Biến Chainlens thành "Creator Studio" bằng cách cho phép người dùng đăng bán (Sell) hoặc cho thuê (Rent) Custom Agent của họ thông qua nền tảng MMOMarket. Tích hợp SSO để liên kết tài khoản cho cả người bán và người mua. Người bán có nút "One-Click Publish" để đẩy lên sàn; Người mua sau khi thanh toán trên MMOMarket phải kết nối tài khoản với Chainlens để nhận bàn giao. Hệ thống dùng Webhook để tự động Clone code (khi Sell) hoặc cấp quyền Execution-Role (khi Rent - không lộ source code người bán) mỗi khi giao dịch hoàn tất.

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

### 5.5. Hành trình 5: Kevin - AI Agent Creator (Marketplace Seller)
*   **Tình huống:** Kevin tạo được một Custom Agent backtest chiến lược Arbitrage hiệu quả và muốn kiếm tiền từ nó.
*   **Diễn biến:** Kevin vào giao diện Agent của mình trên Chainlens, bấm "Publish to MMOMarket". Hệ thống kết nối tài khoản MMOMarket của anh, yêu cầu Validator Agent kiểm duyệt code, sau đó cho phép anh cấu hình giá bán (Sell) hoặc cho thuê (Rent) cùng thời gian bảo hành. Khi có người mua thanh toán trên MMOMarket, Chainlens nhận Webhook và tự động cấp quyền truy cập/clone code cho Buyer. Tiền thanh toán được giữ ở Escrow và tự động chuyển cho Kevin khi hết thời hạn bảo hành mà không có tranh chấp.

### 5.6. Hành trình 6: David - Người mua Agent (Marketplace Buyer)
*   **Tình huống:** David đang tìm một bot tự động phân tích dòng tiền Smart Money trên mạng Solana. Anh lên MMOMarket và thấy Agent của Kevin đang cho thuê (Rent) với giá $20/tháng, bảo hành 7 ngày.
*   **Diễn biến:** David bấm thuê và thanh toán trên MMOMarket. Hệ thống yêu cầu David kết nối tài khoản Chainlens của anh (thông qua SSO hoặc ví Web3). Sau khi kết nối, Chainlens tự động cấp cho David một quyền truy cập (Execution-Role) vào Agent của Kevin. David có thể sử dụng Agent này để phân tích thị trường trên bảng điều khiển Chainlens của mình, nhưng **tuyệt đối không xem được source code** bên trong (để bảo vệ IP của Kevin). Nếu trong 7 ngày đầu, Agent không hoạt động như quảng cáo, David có thể ấn nút "Dispute" (Khiếu nại) trên MMOMarket, lập tức Chainlens sẽ tạm khóa Agent và xuất file log cho ban quản trị xử lý. Nếu David mua đứt (Sell), Chainlens sẽ tự động copy (clone) toàn bộ code của Agent sang workspace của David để anh toàn quyền chỉnh sửa.

### 5.7. Hành trình 7: Ryan - Người dùng Multi-Agent Swarm (Tier 2/3)
*   **Tình huống:** Ryan muốn phân tích toàn diện một hệ sinh thái DeFi mới nổi và xây dựng luôn một con bot chênh lệch giá (arbitrage) trên đó, nhưng anh không rành về code hay lấy dữ liệu phức tạp.
*   **Diễn biến:** Ryan yêu cầu Chainlens "Nghiên cứu hệ sinh thái X và viết cho tôi một con bot arbitrage". Hệ thống khởi động **Multi-Agent Swarm**: Manager Agent chia task cho Researcher Agent tự động lướt web (agent-browser) cào whitepaper và tokenomics. Sau đó, Coder Agent vào Sandbox (Epsilon Instance) viết code bot, kết nối API sàn. Cuối cùng QA Agent chạy test thử trên môi trường testnet và vá lỗi (Auto-Dev). Cuối ngày, Ryan nhận được file code hoàn chỉnh cùng báo cáo nghiên cứu chuyên sâu, tất cả diễn ra hoàn toàn tự động mà anh không cần can thiệp.

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

### 6.5. Crypto Data Provider Boundary
- **Stable Tool Contract:** Các tool Epic 1/2 (`jit_sync`, `price_lookup`, `yields_lookup`, `risk_lookup`) luôn gọi Chainlens API và giữ nguyên response shape khi backend đổi provider.
- **Provider Ownership:** Chainlens backend sở hữu auth, billing, cache, fallback, logging, và response normalization. Provider bên dưới có thể là DeFiLlama public API, DeFiLlama Pro API, self-host adapter service, hoặc hybrid mode theo cấu hình vận hành.
- **Self-Host Scope:** DeFiLlama self-host chỉ thay thế các metric mà service tự tính được từ selected adapters và RPC. Nó không tự động thay thế Nansen smart-money labels, Dune arbitrary analytics, Token Terminal DAU/developer activity, hoặc Pro-only risk data nếu service chưa implement tương đương.
- **Data Isolation:** Nếu self-host service dùng chung PostgreSQL instance với Chainlens, nó phải dùng database/schema và DB user riêng. Chainlens ưu tiên đọc qua HTTP API thay vì query trực tiếp bảng nội bộ của self-host service.

### 6.6. LLM Model Availability Boundary
- **Backend Authoritative Policy:** Availability/quota entitlement của model là policy ở backend và được publish qua API nội bộ theo account scope; frontend/extension không tự suy đoán bằng metadata local.
- **Stable UX Contract:** Khi model chuyển sang unavailable, UI phải chặn chọn ngay ở model picker và gợi ý model thay thế khả dụng tương đương.
- **Reason Codes for Routing:** API availability state phải kèm reason codes chuẩn hóa (ví dụ quota_exceeded, provider_unhealthy, plan_not_entitled) để frontend hiển thị trạng thái nhất quán và traceable.
- **No Secret Leakage:** Thông điệp availability gửi ra client không được chứa API key, provider raw error, hoặc thông tin nhạy cảm vận hành.

## 7. Functional Requirements

- **FR-7.1 (Model Availability State):** Người dùng có thể xem danh sách model theo trạng thái khả dụng của tài khoản hiện tại; mỗi model phải có trạng thái `available` hoặc `unavailable` kèm reason code chuẩn hóa.
- **FR-7.2 (Selection Guardrail):** Người dùng không thể chọn model đang `unavailable` trong model picker; UI phải disable/ẩn model này trước khi gửi request chạy tác vụ.
- **FR-7.3 (Fallback Guidance):** Khi model đang dùng trở thành `unavailable`, hệ thống phải hiển thị ít nhất một model thay thế khả dụng cùng nhóm năng lực (chat/code/reasoning) để người dùng chuyển nhanh.
- **FR-7.4 (Server-Enforced Entitlement):** Hệ thống phải từ chối request dùng model không còn entitlement ở backend, trả response có reason code nhất quán với catalog availability.
- **FR-7.5 (Cross-Surface Consistency):** Cùng một account và thời điểm, trạng thái availability của model phải nhất quán giữa web app và browser extension.

## 8. Non-Functional Requirements (Yêu cầu Phi chức năng)

### 7.1. Performance & Latency (Hiệu suất & Độ trễ)
- **Time-to-First-Byte (TTFB) cho AI Chat:** Độ trễ từ khi User gửi câu hỏi đến khi AI trả về token đầu tiên (streaming) phải **< 2 giây**.
- **JIT RAG Sync Latency:** Quá trình Agent tự động snapshot và bù đắp dữ liệu (gaps) từ nguồn thời gian thực trước khi gọi LLM không được vượt quá **1.5 giây**.
- **Sandbox Execution (Tier 2):** Thời gian khởi tạo MicroVM (Firecracker) để chạy code backtest phải **< 1 giây**. Hệ thống áp dụng cơ chế Timeout cứng (vd: 30s) cho mỗi tiến trình chạy code để tránh treo tài nguyên.

### 7.2. Scalability (Khả năng mở rộng)
- **Concurrent Users (CCU):** Hệ thống MVP phải xử lý mượt mà tối thiểu **1,000 CCU** (tương tác trực tiếp với Agent) mà không suy giảm hiệu năng.
- **Worker Auto-scaling:** Đội ngũ Data Workers cào dữ liệu ngầm phải tự động scale-out dựa trên số lượng dự án crypto mới được thêm vào hệ thống giám sát.

### 7.3. Reliability & Fallback (Độ tin cậy & Chống đứt gãy)
- **LLM Provider Fallback:** Không phụ thuộc hoàn toàn vào một nhà cung cấp LLM. Nếu API chính sự cố, hệ thống tự động chuyển sang (fallback) model dự phòng tương đương trong vòng < 1 giây.
- **Crypto Data Provider Fallback:** Khi `DEFILLAMA_PROVIDER=hybrid`, Chainlens phải timeout self-host data calls trong 2-3 giây, fallback sang public/pro DeFiLlama provider khi có lỗi, và log provider name, latency, cache source, fallback reason. Provider errors không được leak API keys hoặc raw secrets.
- **High Availability (HA):** Cam kết uptime 99.9% cho các dịch vụ Core (Tương tác AI và Quản lý Credits).
- **Session Data Durability (NFR-R1):** OpenCode session history (chat turns, file state, onboarding) PHẢI survive sandbox delete + recreate. Implementation: Litestream WAL replication tới Supabase Storage S3 — near-zero RPO (<1s lag), RTO ~seconds. Mỗi user có isolated path trong storage. *→ Story 8.5 Sprint 1*
- **Sandbox Wake Verification (NFR-R2):** Sau khi wake sandbox từ stopped/archived state, API PHẢI verify `/epsilon/health` respond OK trước khi trả endpoint về caller. Unverified wake = thước đo UX thất bại. *→ Story 8.5 Sprint 4*
- **Provisioning Retry Backoff (NFR-R3):** Retry delay PHẢI tăng theo exponential: `[2s, 15s, 60s]` thay vì fixed 2s — giảm thundering herd khi Daytona transient failures. *→ Story 8.5 Sprint 4*
- **Provisioning Status Accuracy (NFR-R4):** Sau khi `provider.create()` resolve thành công, DB row PHẢI được update `status='active'` trong tất cả provisioning paths bao gồm async path (Daytona). Bug confirmed: `provisionAsync()` hiện tại thiếu transition này. *→ Story 8.5 Sprint 1 fix*

### 7.4. Security & Abuse Prevention (Bảo mật & Chống lạm dụng)
- **Atomic Credit Deduction:** Giao dịch trừ Internal Credits khi sử dụng LLM hoặc RAG phải đảm bảo tính nguyên tử (Atomic). Implementation: PostgreSQL `atomic_use_credits` function — check + deduct in 1 statement, no TOCTOU. Nếu trừ điểm thất bại, hệ thống sẽ chặn request.
- **No Fire-and-Forget Billing (NFR-S1):** Tất cả `deductToolCredits()` call PHẢI là `await` — không được dùng `.catch(console.error)` pattern cho billing. Revenue leak = critical bug. *→ Story 8.5 Sprint 1 audit*
- **Strict Rate Limiting (NFR-S2):** Sandbox provisioning endpoint: max 3 request/hour/user. LLM proxy routes: max 100 request/minute/user. Implementation: `hono-rate-limiter` middleware, return 429 với `Retry-After` header. *→ Story 8.5 Sprint 3*
- **Secrets Encryption at Rest (NFR-S3):** `serviceKey` (sandbox auth token) KHÔNG được lưu plaintext trong DB. Implementation: AES-256-GCM tại application layer qua `sandbox-secrets.ts` (`setSandboxServiceKeyInConfig` / `getSandboxServiceKeyFromConfig`) với `SANDBOX_SERVICE_KEY_ENCRYPTION_SECRET` env var (required trong cloud mode). ~~pgcrypto + BYTEA column — không cần, đã có application-layer encryption.~~ *→ Story 8.5 Sprint 2*
- **Token-in-URL Prevention (NFR-S4):** JWT/auth tokens KHÔNG được xuất hiện trong WebSocket/SSE URL query string (nginx logs, browser history). Implementation: first-message authentication pattern — token trong WS frame đầu tiên, không trong URL. *→ Story 8.5 Sprint 2*
- **Sandbox Isolation:** Code sinh ra chạy trong Sandbox (Tier 2) bị ngắt truy cập mạng bên ngoài (no outbound network), chỉ được kết nối đến Vibe Trading API nội bộ, nhằm chống lại mã độc (C2C).

### 7.5. Frontend Performance (Hiệu suất Giao diện)

- **First Contentful Paint (NFR-FE1):** FCP phải **< 1.5 giây** trên kết nối 4G trung bình. Hiện tại ước tính 3–4s do initial JS bundle quá lớn. *→ Epic 11*
- **Time to Interactive (NFR-FE2):** TTI phải **< 3 giây**. Hiện tại ước tính 6–8s do blocking script execution. *→ Epic 11*
- **Initial JS Bundle (NFR-FE3):** Bundle JS ban đầu KHÔNG được vượt quá **800KB** (compressed). Các library > 200KB chưa dùng trên first paint (mermaid, three.js, pdfjs, syncfusion, sql.js, ag-grid, v.v.) PHẢI được lazy-load bằng `next/dynamic` hoặc `React.lazy()`. *→ Story 11.2*
- **Dev Server Startup (NFR-FE4):** `next dev` startup time phải giảm ≥ 50% so với baseline Next.js 15. *→ Story 11.1*
- **Zero Regression (NFR-FE5):** Sau mọi thay đổi FE performance, toàn bộ test suite (`bun test`) PHẢI pass. Không có trang nào bị blank screen khi navigate (đảm bảo bởi `loading.tsx` coverage). *→ Story 11.3*

### 7.6. Observability & Operational (Vận hành & Quan sát)
- **Distributed Tracing & Metrics (NFR-O1):** API PHẢI export traces và metrics qua OpenTelemetry Protocol (OTLP). Key metrics: `sandbox.provision.duration_ms` (histogram, label: success/fail), `sandbox.provision.attempts_total` (counter), HTTP request duration (auto-instrumented). *→ Story 8.5 Sprint 3*
- **Stable Tunnel URL (NFR-O2):** `EPSILON_URL` (cloudflared bridge sandbox→API) PHẢI trỏ vào permanent URL (named Cloudflare Tunnel), không phải quick-tunnel URL thay đổi khi restart. *→ Story 8.5 Sprint 3*
- **Multi-Replica Safe Dedup (NFR-O3):** Sandbox provisioning deduplication PHẢI work khi API scale lên 2+ replicas. Implementation: Postgres **session-level** advisory lock (`pg_advisory_lock` + `pg_advisory_unlock` trong try/finally) thay in-memory `Set<string>`. ~~`pg_try_advisory_xact_lock` không phù hợp — Daytona provision mất tới 16 phút, xact-level lock sẽ exhaust connection pool.~~ *→ Story 8.5 Sprint 3*
- **Model Availability Freshness (NFR-O4):** Trạng thái availability/quota của model hiển thị trên UI phải được đồng bộ với backend trong tối đa 30 giây kể từ khi backend đổi trạng thái.
- **Unavailable Selection Failure Rate (NFR-O5):** Sau rollout guardrail, tỷ lệ request thất bại do user chọn model unavailable phải dưới 0.5% tổng request model-selection mỗi ngày.

## 9. Out of Scope (Ngoài Phạm vi Dự án)

Để tránh tình trạng "phình to" yêu cầu (Scope Creep) và giữ vững định vị của sản phẩm, Chainlens sẽ **KHÔNG** làm những việc sau:

1. **Không lưu trữ Private Key & Không tự động trade (Non-Custodial):** Chainlens là nền tảng AI Tư vấn & Sinh code (Advisory & Code Gen). Hệ thống tuyệt đối không lưu trữ seed phrase/private key của người dùng và không trực tiếp đặt lệnh giao dịch thay người dùng trên các sàn CEX/DEX.
2. **Không làm Fiat On-ramp / Off-ramp nội bộ:** Các giao dịch nạp tiền bằng Fiat ($) hoặc đổi Crypto sang Fiat sẽ sử dụng Gateway của bên thứ 3 (như Stripe, MoonPay, Binance Pay). Chainlens không tự xây dựng cổng thanh toán pháp định để tránh gánh nặng về pháp lý và Compliance (KYC/AML) phức tạp.
3. **Không xây dựng Blockchain hay Layer 2 riêng:** Sản phẩm tập trung vào Data Intelligence và LLM Application. Việc tạo mạng lưới blockchain riêng là không cần thiết ở giai đoạn này và gây phân tán nguồn lực.
4. **Không tư vấn đầu tư tài chính trực tiếp (Financial Advice):** Mọi kết quả phân tích từ AI là báo cáo kỹ thuật và rủi ro dựa trên dữ liệu on-chain/smart contract. Chainlens không đưa ra các lời khuyên dạng "Buy/Sell", luôn có Disclaimer rõ ràng.

## 10. Roadmap & Milestones (Lộ trình Phát hành)

Để đảm bảo dự án ra mắt nhanh chóng và kiểm chứng được mô hình kinh doanh, Chainlens sẽ được triển khai theo các giai đoạn sau:

### Phase 1: Minimum Viable Product (MVP) - Mở khóa Data Flywheel
*   **Mục tiêu:** Chứng minh năng lực tư vấn crypto của AI và đưa Data Workers vào hoạt động.
*   **Tính năng chính:**
    *   Tái cấu trúc (Refactor) Chainlens Core để hỗ trợ Multi-Agent (Tier 1 & Tier 2).
    *   Xây dựng crypto data provider boundary trước, sau đó triển khai Background Workers để crawl/index dữ liệu từ DeFiLlama, Dune, Nansen. Với DeFiLlama, MVP chạy public/pro API hoặc self-host adapter service theo `public|pro|selfhost|hybrid`; tool contract không đổi và fallback được xử lý ở Chainlens API.
    *   Tích hợp Vibe Trading API & Sandbox (MicroVM) cho Tier 2 backtest cơ bản.
*   **Target:** Đạt 10.000 users miễn phí đầu tiên để đóng góp làm giàu RAG Data.

### Phase 2: Dual-Tokenomics, Enterprise & Autonomous Agents - Đột phá tính năng & Dòng tiền
*   **Mục tiêu:** Kích hoạt mô hình kinh tế bền vững, onboard khách hàng doanh nghiệp và triển khai đội ngũ Autonomous AI Agents (tương đương Manus.ai).
*   **Tính năng chính:**
    *   Phát hành $CLENS Token và Hệ thống quản lý Internal Credits.
    *   Triển khai Smart Contract cho cơ chế Burn / Buy-back.
    *   Đóng gói giải pháp On-premise + Local LLM (Tier 3).
    *   Tích hợp Agent Marketplace với MMOMarket (One-Click Publish, Webhooks).
    *   **Phát hành Autonomous Agents Suite:** Deep Research, Data Analyst, Smart Ops, Auto-Dev và Multi-Agent Swarm (sử dụng Sandbox & agent-browser).
*   **Target:** Đạt doanh thu ổn định, thực hiện đợt Burn token đầu tiên và có ít nhất 1000 lượt Agent được thuê/bán trên Marketplace.

### Phase 3: Model-as-a-Service (MaaS) - Hệ sinh thái Khép kín
*   **Mục tiêu:** Trở thành nhà cung cấp hạ tầng AI chuyên biệt cho Web3.
*   **Tính năng chính:**
    *   Fine-tune / Train model LLM độc quyền cho Crypto (Crypto-Specific LLM) dựa trên tập dữ liệu đã được clean.
    *   Mở API cho phép bên thứ 3 (Các Dapp, Sàn giao dịch) thuê lại model và RAG Data.
*   **Target:** Đạt độ chính xác > 95% cho các kịch bản dự đoán rủi ro smart contract và tối ưu lợi nhuận farming.
