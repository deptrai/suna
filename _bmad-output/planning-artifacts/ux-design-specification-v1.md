---
stepsCompleted:
  - step-09-design-directions
  - step-10-user-journeys
  - step-11-component-strategy
  - step-12-ux-patterns
  - step-13-responsive-accessibility
  - step-14-complete
---
# UX Design Specification: Chainlens

## 1. User Personas & Context
### 1.1 "The Degen Explorer" (Trader/Investor)
*   **Context:** Constantly scrolling X (Twitter), Facebook, or DexScreener looking for the next hidden gem or new pair. Speed is everything.
*   **Pain Point:** By the time they open a new tab to paste a contract address into a security scanner, the alpha is gone or they might have already bought a honeypot.
*   **Chainlens UX:** 
    *   They hover over a `$TOKEN` or `0x...` on X or DexScreener.
    *   **Vigilant Companion Extension** instantly pops up a minimal tooltip: "Trust Score: 30/100 (Red) - Unrenounced Mint, 90% Liquidity Unlocked". 
    *   They avoid the scam without leaving their feed. If they want more info, they click "Expand", opening the side-panel assistant for a quick chat ("What does the code look like?").

### 1.2 "The Crypto Researcher" (Analyst)
*   **Context:** Doing deep dives on CoinMarketCap/CoinGecko or analyzing trends. Needs macro views and verified insights.
*   **Pain Point:** Information is siloed. They want to know what the community is investigating right now and catch macro threats early.
*   **Chainlens UX:** 
    *   They visit the **Chainlens Pulse** (News Feed).
    *   They see a Perplexity-style feed of AI-generated alerts: "3 new Meme coins on Base have matching suspicious deployer patterns (analyzed by 40+ users today)".
    *   They click into an alert to see the full AI breakdown, leveraging crowdsourced, anonymized intelligence.

## 2. Core Experience
Chainlens is an evolution of the existing code structure, reimagined into a dynamic, AI-first, proactive assistant experience. The core design philosophy centers on ambient intelligence—providing the right information, at the right time, exactly where the user is looking.

### 2.1 The Proactive "AI Ghost" Tooltip (Extension)
*   **Behavior:** A lightweight, non-intrusive extension that detects token addresses (`0x...` or `$TOKEN`) across platforms like X/Twitter, Facebook, DexScreener, CoinMarketCap, and CoinGecko.
*   **Visuals:** A sleek, glassmorphic tooltip that appears smoothly upon hovering over a detected token.
*   **Content:**
    *   **Trust Score:** A prominent, color-coded score (e.g., Red/Orange/Green).
    *   **Quick Insights:** 1-2 bullet points highlighting critical risks or positive signals.
    *   **Actionable:** A "Quick Chat" side-panel expander, and an "Analyze Deeply" button linking to the main Web App.
*   **Sync:** Synced with the user's logged-in Chainlens account, bringing their context, portfolio, and past queries into the extension.

### 2.2 The Chainlens Pulse (Global AI News Feed)
*   **Concept:** A live, AI-generated news feed reminiscent of Perplexity, strictly focused on Web3 security and token intelligence.
*   **Data Source:** Aggregated from global security alerts, on-chain anomalies, and *anonymized insights derived from user interactions with the AI assistant*.
*   **Visibility:** Available to all users (including free tier) to build community trust and showcase the AI's capability.
*   **Features:**
    *   **Trending Threats:** Real-time alerts on honeypots, rug pulls, or trending tokens with hidden risks.
    *   **Smart Summaries:** "Why is $XYZ trending?" explained through the lens of contract safety.

### 2.3 The Interactive Audit Panel (Web App & Extension Side-Panel)
*   **Layout:** A clean, fluid interface integrating natively into the operating system environment for deep token analysis.
*   **Components:**
    *   **Chat Interface:** The primary interaction mode. Users can converse natively with the AI.
    *   **Data Visualizations:** Dynamic charts for holder distribution, rendered *as the AI explains them*.
    *   **Code Sandbox (Premium):** A safe execution environment for advanced users to simulate transactions alongside the AI's explanation.

## 3. Integration with Existing Architecture
This UX design is a direct extension of the established architectural decisions:
*   **Vercel AI SDK:** Powers the streaming chat and dynamic tooltips (using generated UI).
*   **REST API:** `apps/api` (Epsilon API) provides fast data delivery to both the web app and the extension.
*   **Fault Isolation:** The resource-intensive AI orchestration and sandbox execution happen in `apps/api` with async workers, ensuring the web UI and extension remain perfectly smooth and responsive.

## 4. Visual Design Foundation: "Liquid Glass (macOS 26 Tahoe Style)"

### 4.1 Aesthetic Philosophy
The visual direction completely moves away from flat or cyberpunk themes and embraces **"Liquid Glass"**, heavily inspired by macOS 26 (Tahoe). It focuses on hyper-refractive, ultra-smooth translucency, vibrant yet highly diffused ambient colors, organic liquid shadows, and seamless blurring of background content. The philosophy is **"Premium OS-Native Ambient Intelligence"**: the UI feels less like a web app and more like an integrated, high-end operating system layer.

**Core Principles for a Simple & Modern Execution:**
1. **Progressive Disclosure:** Hide complex on-chain data behind "Expand" or "Hover" interactions to keep the primary view completely clean.
2. **Whitespace as a Design Element:** Maximize padding and margins. Use soft shadows and whitespace instead of hard borders to separate content.
3. **Monochrome UI Controls:** Keep buttons and inputs monochrome (black/white/gray) so they do not compete with the Aurora background gradients.
4. **Purposeful Micro-interactions:** Use smooth spring physics for state changes to make the UI feel "alive" without being distracting.

### 4.2 Unified Color System
*   **Base Backgrounds:** Extreme translucency (`backdrop-blur-3xl` or higher) with adaptive light/dark mode tinting (e.g., `bg-white/10` or `bg-black/15`). Panels should refract underlying content softly without sacrificing text legibility.
*   **Brand & AI Accents:** "Aurora" style fluid gradients—soft teals, lilacs, and pinks that bleed naturally into the frosted glass. *Crucially, these gradients stay in the background.*
*   **Interactive Controls (Monochrome Focus):** Buttons, inputs, and dropdowns should rely on high-contrast monochrome tones (e.g., solid white/black text over frosted white/black backgrounds) to avoid a "circus" effect against the Aurora backgrounds.
*   **Security States (Highest Priority):** Elegant, liquid-like fills with high legibility.
    *   **Critical Risk:** Ruby Red (Vivid, deep red with soft pinkish-red inner glows).
    *   **Warning/Caution:** Amber Gold.
    *   **Safe/Verified:** Emerald/Mint Green.

### 4.3 Typography
*   **UI & Reading:** `SF Pro Display` (Apple) or `Inter` for clean, hyper-legible interface text, tight kerning, and modern conversational outputs.
*   **Data & Code:** `SF Mono` or `JetBrains Mono` for contract addresses, wallet hashes, code blocks, and numerical data to ensure tabular alignment while retaining the OS-native feel.

### 4.4 Extension Visual Strategy
*   **Shared Foundation:** The browser extension strictly shares the same Liquid Glass components and Tailwind v4 CSS variables as the Web App.
*   **Ghost Overlay:** The in-page injection acts as a "Floating Island" or macOS notification pill. It uses heavy backdrop-blur and delicate inner borders (`box-shadow: inset 0 0 0 1px rgba(255,255,255,0.1)`) to ensure it looks physically elevated above the host website (X, DexScreener) while remaining lightweight.

## 5. Design Direction Decision

### 5.1 Chosen Direction: Adaptive Liquid Glass
A state-based system prioritizing context and physical depth. The UI consists of two main states:
- **Ambient Mode:** Uses "Thin Glass"—almost completely transparent overlays with heavy blur. Text floats elegantly over the user's current context.
- **Alert Mode:** Uses "Frosted Tint"—when risk is detected, the glass dynamically tints (e.g., translucent Ruby Red) to draw immediate attention without breaking the physical glass metaphor.

### 5.2 Design Rationale
"Liquid Glass" matches the high-end expectation of modern crypto users who are accustomed to premium, polished products (like Phantom or modern macOS apps). It reduces visual fatigue compared to dark/neon cyberpunk themes and allows the extension to blend beautifully over ANY website background color, adapting to the user's environment.

## 6. User Journey Flows

*(Flows 6.1 through 6.8 remain structurally the same as the underlying business logic is unchanged. The UI rendering at each node now employs the Liquid Glass visual principles.)*

### 6.9 Journey Patterns
- **State-based UI Transition:** Smooth spring-animated transitions between Thin Glass (Ambient) and Frosted Tint (Alert).
- **Progressive Disclosure:** UI expands fluidly like macOS folders or island components, revealing Monaco editors or charts naturally.
- **Atomic Feedback:** Haptic-feeling visual feedback (micro-bounces, light ripples) when credits are deducted or actions completed.

### 6.10 Flow Optimization Principles
- **Fluidity:** All state changes must feel liquid. Zero harsh snaps.
- **Graceful Error Handling:** Errors appear in elegant frosted popovers that feel like native system dialogue warnings.

## 7. Component Strategy

### 7.1 Design System Components
Sử dụng **Radix UI** kết hợp với **Tailwind v4 CSS variables** làm nền tảng.
- **Lý do:** Radix UI cho phép chúng ta tuỳ biến style unstyled hoàn toàn, dễ dàng apply các class `backdrop-blur`, `mix-blend-mode`, và các shadow phức tạp của Liquid Glass mà không bị override.

### 7.2 Custom Components

#### Floating Island Widget (Extension)
*   **Purpose:** Cảnh báo bảo mật tức thì trên host web.
*   **Anatomy:** Pill-shaped (bo góc tròn trịa hoàn toàn `rounded-full` hoặc `rounded-[32px]`), border trong suốt với inset shadow mỏng tạo cảm giác khối 3D.
*   **States:** Ambient (Thin Glass), Alert (Tinted Glass).

#### Trust Score Badge
*   **Anatomy:** Pill hoặc Circle nhỏ, dùng màu dạng "liquid fill" (trong suốt 20% nhưng viền và chữ màu Solid). Ví dụ: Nền `bg-red-500/20`, chữ `text-red-500`.

#### Generative Chat Message
*   **Anatomy:** Bubble chat dạng Frosted Glass, góc bo tròn mềm mại. Gradient "Aurora" xuất hiện nhẹ ở background của tin nhắn AI.
*   **Sub-Agent Transparency Button:** Nút trạng thái (Action pill) ở góc trên bên phải của khung chat. Nút hiển thị animation khi các sub-agent/tools đang chạy (vd: "⚡ JIT Syncing") và có thể click mở rộng (Drawer) để xem logs/thought process. Khi xong sẽ thu nhỏ thành tick xanh.

#### Vibe Sandbox Editor (Premium)
*   **Anatomy:** Container có giao diện giống cửa sổ macOS nguyên bản (có hiệu ứng window shadow lớn, thanh tiêu đề mờ).

#### Dynamic Equity Curve Chart
*   **Anatomy:** Line chart với hiệu ứng gradient mờ rủ xuống (Area chart) tiệp vào nền kính.

### 7.3 Implementation Strategy
- **Advanced Tailwind v4:** Tận dụng `@theme` để khai báo các shadow nhiều lớp (cho Liquid shadows) và các cấp độ backdrop-blur tuỳ chỉnh.
- **Isomorphic Components:** Đóng gói thư viện UI nội bộ (ví dụ: `@chainlens/ui`), chia sẻ giữa Next.js và Extension.

## 8. UX Consistency Patterns

### 8.1 Button & Action Hierarchy
- **Primary Action:** Nút bấm pill-shape, màu Gradient mềm mại, có đổ bóng mờ (soft drop shadow) trùng với màu nút bấm để tạo cảm giác phát sáng tự nhiên.
- **Secondary Action:** Nút nền kính mờ (`bg-white/10`), viền siêu mỏng (`border-white/10`).
- **Animations:** Khi hover hoặc click, sử dụng "Spring Physics" animation (dạng nảy nhẹ) thay vì transition tuyến tính. Không dùng hiệu ứng glow gắt.

### 8.2 Feedback & States
- **Loading:** Skeleton dạng shimmer mờ (shimmering glass) hoặc các vòng tròn lỏng (liquid loading spinners) pha trộn vào nhau (Gooey effect).
- **Success/Warning:** Sử dụng các icon có phong cách 3D/Skeuomorphic nhẹ hoặc icon mượt mà đi kèm Tinted Glass.

## 9. Responsive Design & Accessibility

### 9.1 Responsive Strategy
*   **Web App:** Tối ưu hiển thị dạng Grid Card bằng kính, các panel có thể thu gọn mượt mà.
*   **Extension:** Side-panel hiển thị như một lớp kính phủ đè lên cạnh trình duyệt, tạo chiều sâu 3D giữa Extension và Host Website.

### 9.2 Breakpoint Strategy
Tuân thủ chuẩn Tailwind v4, tối ưu hóa kích thước padding để tạo "thở" (breathing room) cho thiết kế Glassmorphism - thiết kế kính cần nhiều khoảng trắng để nhìn đẹp.

### 9.3 Accessibility Strategy (WCAG 2.1 AA)
*   **Contrast (Thách thức lớn của Glassmorphism):** Áp dụng thuật toán tính toán độ tương phản động. Hoặc sử dụng text Shadow siêu mỏng (`text-shadow: 0 1px 2px rgba(0,0,0,0.5)`) để chữ luôn nổi bật trên nền kính dù đằng sau là gì.
*   **Motion Control:** `prefers-reduced-motion` phải tắt các hiệu ứng Spring và Backdrop-blur (chuyển sang màu đục) nếu thiết bị yếu hoặc user bị chóng mặt.

### 9.4 Implementation Guidelines
*   **Shadow DOM cho Extension:** BẮT BUỘC sử dụng Shadow DOM cho Browser Extension. Nếu không, các class Tailwind của Host Website (như X, DexScreener) sẽ ghi đè và làm vỡ toàn bộ cấu trúc Liquid Glass tinh tế của chúng ta. Shadow DOM giữ cho style macOS 26 Tahoe được bảo toàn 100%.