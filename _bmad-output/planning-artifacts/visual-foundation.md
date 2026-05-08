# Visual Foundation: Chainlens

## 1. Design Aesthetic: "Epsilon Cyber-Glass"
Chainlens leverages a modern, premium aesthetic that blends "Cyberpunk Terminal" functionality with sleek "Glassmorphism." This ensures the tool feels simultaneously like a serious hacker utility for deep-dive analysis, and a highly polished, user-friendly Web3 consumer product.

### Core Visual Principles:
*   **Vibrant Dark Mode:** Deep, rich backgrounds to reduce eye strain during long analysis sessions.
*   **Glassmorphism (Frosted Glass):** Used for tooltips, side panels, and floating elements to maintain context with the background (e.g., when the extension overlays on X/Twitter).
*   **Dynamic Accent Colors:** Functional coloring that reacts to data (Red for high risk, Green for safe, Amber for warning, Neon Blue/Purple for AI generation states).
*   **Micro-animations:** Smooth transitions, pulsing states for "AI thinking", and crisp ease-in tooltips to make the interface feel alive.

## 2. Color Palette
Based on the existing `Epsilon` theme variables (Tailwind v4), we will extend the palette specifically for the AI and Security context:

*   **Backgrounds:** 
    *   App Background: `hsl(240, 10%, 4%)` (Deep Space Black)
    *   Glass Panels: `hsla(240, 10%, 10%, 0.6)` with backdrop blur.
*   **Primary AI Accent:**
    *   AI Brand Gradient: Linear gradient from Electric Purple `hsl(270, 100%, 60%)` to Neon Cyan `hsl(190, 100%, 50%)`.
*   **Security State Colors:**
    *   **Critical Risk (Red):** `hsl(0, 85%, 60%)` (Unrenounced contracts, Honeypots)
    *   **Warning (Amber):** `hsl(35, 90%, 55%)` (Low liquidity, suspicious holder concentration)
    *   **Safe (Green):** `hsl(140, 70%, 50%)` (Audited, renounced, locked liquidity)
    *   **Neutral/Info (Blue):** `hsl(210, 100%, 60%)`

## 3. Typography
Using modern, highly legible sans-serif fonts suitable for both data-heavy tables and conversational AI text.

*   **Primary UI & Reading:** `Inter` or `Geist Sans`. Crisp, neutral, and readable.
*   **Code & Hex Addresses:** `JetBrains Mono` or `Geist Mono`. Used exclusively for contract addresses, transaction hashes, and the Code Sandbox, reinforcing the "developer tool" feel.

## 4. Components & Interactive Elements

### 4.1 The "Ghost" Tooltip (Extension)
*   **Trigger:** 300ms hover delay on `$TOKEN` or `0x...` text.
*   **Animation:** `ease-out` slight scale-up (0.95 -> 1.0) and fade-in to feel responsive but not jarring.
*   **Structure:** Minimalist. A glowing colored border representing the Trust Score, 2 lines of text, and an expand icon.

### 4.2 AI Chat Interface (Web & Side Panel)
*   **Message Bubbles:** User messages are subtle, solid background. AI responses have a very faint gradient border or glowing indicator when typing.
*   **Generative UI (Streamed Components):** When the AI references a chart (e.g., Holder Distribution), the chart renders directly inside the chat flow, expanding smoothly with an accordion animation.
*   **Code Blocks:** Syntax highlighted with a custom dark theme. Includes a "Run in Sandbox" button floating at the top right of the code block.

### 4.3 Chainlens Pulse (News Feed)
*   **Card Design:** Masonry or linear feed. Cards have subtle borders that illuminate on hover.
*   **Trust Indicators:** Each news item includes a visual "AI Confidence Score" regarding the threat/alpha being reported.

## 5. Implementation Strategy (Tailwind v4)
*   Leverage Tailwind v4's CSS variable system (already present in `globals.css`).
*   Utilize `@apply` minimally; prefer utility classes in React components for maximum flexibility.
*   Ensure the Extension (`apps/extension/src/content/styles.css`) reuses the core design tokens without polluting the host page's CSS (using Shadow DOM or highly specific scoping).
