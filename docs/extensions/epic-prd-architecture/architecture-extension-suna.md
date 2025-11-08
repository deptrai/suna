# Browser Extension Architecture - ChainLens.so

**Generated:** 2025-11-07  
**Architect:** Winston (BMAD Architect Agent)  
**For:** Luis  
**Project:** ChainLens.so Browser Extension

---

## Executive Summary

Kiến trúc extension được thiết kế để tối đa hóa code reuse từ frontend Next.js hiện tại, cho phép user click vào tên coin trên bất kỳ website nào và tạo agent chat mới để analyze coin. Extension sử dụng shared components (ChatInput, UI components), API client (unifiedAgentStart, streamAgent), và state management từ frontend để đảm bảo consistency và minimize code duplication. Extension mở side panel (bên phải trình duyệt) với chat interface thay vì popup để provide better UX và persistent view.

**Core Strategy:** Monorepo code sharing với extension như một lightweight wrapper sử dụng shared libraries từ frontend.

---

## Frontend Architecture Analysis

### Current Frontend Stack

**Technology Stack:**
- **Framework:** Next.js 15.3.1 với App Router
- **Language:** TypeScript 5+
- **Styling:** Tailwind CSS 4, Radix UI components
- **State Management:** 
  - Zustand (client state, persistence)
  - React Query (@tanstack/react-query) cho server state
- **API Client:** Custom API client trong `lib/api.ts` với Supabase integration
- **Build Tool:** Next.js với Turbopack
- **UI Components:** Radix UI primitives với custom styling

### Key Frontend Components to Reuse

**1. API Client Layer** (`frontend/src/lib/api.ts`)
- ✅ Comprehensive API client với error handling
- ✅ Supabase authentication integration
- ✅ Type-safe API calls
- ✅ EventSource streaming support
- **Reuse Strategy:** Extract thành shared package hoặc import trực tiếp

**2. UI Components** (`frontend/src/components/ui/`)
- ✅ Radix UI components (Button, Dialog, Card, etc.)
- ✅ Tailwind CSS styling
- ✅ Consistent design system
- **Reuse Strategy:** Shared component library hoặc copy với path aliases

**3. State Management**
- ✅ Zustand stores (`lib/stores/`)
- ✅ React Query hooks (`hooks/react-query/`)
- **Reuse Strategy:** Shared stores và hooks

**4. Utilities** (`frontend/src/lib/utils/`)
- ✅ `cn()` utility cho className merging
- ✅ Error handling utilities
- ✅ Validation helpers
- **Reuse Strategy:** Direct import hoặc shared package

### Frontend Structure

```
frontend/src/
├── app/                    # Next.js App Router
│   ├── (dashboard)/        # Protected routes
│   └── (home)/             # Public routes
├── components/
│   ├── ui/                 # Reusable UI primitives (Radix UI)
│   ├── thread/             # Chat/thread components
│   └── agents/             # Agent management
├── lib/
│   ├── api.ts              # API client (2326 lines - comprehensive)
│   ├── stores/             # Zustand stores
│   └── utils/              # Utilities
├── hooks/
│   └── react-query/        # React Query hooks
└── providers/              # Context providers
```

---

## Extension Architecture Proposal

### Architecture Pattern: **Shared Library + Extension Wrapper**

Extension được xây dựng như một lightweight wrapper sử dụng shared code từ frontend, với extension-specific layers cho browser APIs và content script injection.

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Browser Extension                     │
├─────────────────────────────────────────────────────────┤
│                                                           │
│  ┌──────────────┐      ┌──────────────┐               │
│  │ Content      │      │ Side Panel   │               │
│  │ Script       │◄────►│ (Chat        │               │
│  │ (Coin        │      │  Interface)  │               │
│  │ Detection)   │      │              │               │
│  └──────┬───────┘      └──────┬───────┘               │
│         │                     │                         │
│         └──────────┬──────────┘                        │
│                    │                                    │
│         ┌──────────▼──────────┐                        │
│         │  Shared Frontend    │                        │
│         │  Code (Reused)      │                        │
│         │                     │                        │
│         │  • API Client       │                        │
│         │  • UI Components    │                        │
│         │  • State Management │                        │
│         │  • Utilities        │                        │
│         └──────────┬──────────┘                        │
│                    │                                    │
│         ┌──────────▼──────────┐                        │
│         │  Extension Layer   │                        │
│         │                     │                        │
│         │  • Browser APIs      │                        │
│         │  • Content Script    │                        │
│         │  • Background Worker│                        │
│         └─────────────────────┘                        │
│                    │                                    │
│         ┌──────────▼──────────┐                        │
│         │  Backend API        │                        │
│         │  (Existing)         │                        │
│         └─────────────────────┘                        │
└─────────────────────────────────────────────────────────┘
```

### Extension Components

#### 1. **Content Script** (`content-script.ts`)
**Purpose:** Detect coin names trên web pages và inject UI controls

**Responsibilities:**
- Scan DOM cho coin names (regex patterns, common crypto symbols)
- Highlight detected coins
- Inject "Analyze with ChainLens" button/context menu
- Listen for user clicks on coin names
- Extract coin context (name, symbol, price if available)

**Implementation:**
```typescript
// extension/content-script.ts
import { detectCoins, injectAnalysisButton } from './coin-detector';
import { sendToBackground } from './messaging';

// Detect coins on page load and dynamic content
const observer = new MutationObserver(() => {
  const coins = detectCoins(document.body);
  coins.forEach(coin => {
    injectAnalysisButton(coin.element, coin.data);
  });
});

observer.observe(document.body, { childList: true, subtree: true });

// Handle button clicks
document.addEventListener('click', (e) => {
  if (e.target.matches('.chainlens-analyze-btn')) {
    const coinData = JSON.parse(e.target.dataset.coin || '{}');
    sendToBackground({ 
      type: 'OPEN_SIDE_PANEL_WITH_COIN', 
      coinInfo: {
        name: coinData.name,
        symbol: coinData.symbol,
        price: coinData.price
      }
    });
  }
});
```

#### 2. **Side Panel UI** (`sidepanel.tsx`)
**Purpose:** Display chat interface với coin analysis

**Architecture:**
- Sử dụng React components từ frontend (ChatInput, ThreadComponent patterns)
- Shared API client để call backend (unifiedAgentStart, streamAgent)
- Shared UI components (Button, Card, Dialog, ChatInput)
- React Query cho data fetching (optional, simplified for extension)
- Real-time message streaming với EventSource

**Structure:**
```
extension/
├── sidepanel/
│   ├── sidepanel.tsx        # Main side panel component
│   ├── ChatInterface.tsx    # Chat interface (reuses frontend ChatInput)
│   ├── MessageDisplay.tsx   # Message display (simplified from ThreadContent)
│   ├── LoginForm.tsx        # Authentication UI
│   └── styles.css           # Extension-specific overrides
```

**Code Reuse Example:**
```typescript
// extension/sidepanel/ChatInterface.tsx
import { useEffect, useState } from 'react';
import { ChatInput } from '@/components/thread/chat-input/chat-input';  // From frontend
import { unifiedAgentStart } from '@/lib/api';                          // From frontend
import { streamAgent } from '@/lib/api';                                // From frontend
import { useCoinInfo } from './hooks/useCoinInfo';                      // Extension-specific hook

export function ChatInterface() {
  const [threadId, setThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const coinInfo = useCoinInfo(); // From chrome.storage (pendingCoinInfo)

  // Load thread ID from storage on mount
  useEffect(() => {
    chrome.storage.local.get(['currentThreadId'], (result) => {
      if (result.currentThreadId) {
        setThreadId(result.currentThreadId);
        // Load message history
        loadMessageHistory(result.currentThreadId);
      }
    });
  }, []);

  const handleSubmit = async (prompt: string) => {
    // Pre-fill prompt với coin info if available
    let fullPrompt = prompt;
    if (coinInfo) {
      fullPrompt = `Analyze ${coinInfo.name} (${coinInfo.symbol})${coinInfo.price ? ` - Current price: $${coinInfo.price}` : ''}\n\n${prompt}`;
    }

    // Create agent chat với coin info (or continue existing thread)
    const result = await unifiedAgentStart({
      prompt: fullPrompt,
      thread_id: threadId || undefined, // Continue existing thread if available
    });

    // Store thread ID for continue chatting
    if (result.thread_id) {
      setThreadId(result.thread_id);
      chrome.storage.local.set({ currentThreadId: result.thread_id });
    }

    // Start streaming
    streamAgent(result.agent_run_id, {
      onMessage: (content) => {
        // Update streaming content in real-time
        setMessages(prev => {
          const lastMessage = prev[prev.length - 1];
          if (lastMessage && lastMessage.role === 'assistant' && lastMessage.streaming) {
            // Update streaming message
            return [...prev.slice(0, -1), { ...lastMessage, content: lastMessage.content + content }];
          }
          // Add new message
          return [...prev, { role: 'assistant', content, streaming: true }];
        });
      },
      onError: (error) => {
        // Handle streaming error
        console.error('Streaming error:', error);
      },
      onClose: () => {
        // Streaming completed - mark message as complete
        setMessages(prev => {
          const lastMessage = prev[prev.length - 1];
          if (lastMessage && lastMessage.streaming) {
            return [...prev.slice(0, -1), { ...lastMessage, streaming: false }];
          }
          return prev;
        });
        // Persist messages to chrome.storage
        persistMessages(threadId || result.thread_id, messages);
      },
    });
  };

  return (
    <div className="flex flex-col h-screen">
      <ChatInput onSubmit={handleSubmit} />
      <MessageDisplay messages={messages} />
    </div>
  );
}
```

#### 3. **Background Service Worker** (`background.ts`)
**Purpose:** Coordinate between content script và side panel, handle side panel opening, và API calls

**Responsibilities:**
- Message passing between content script và side panel
- Handle `OPEN_SIDE_PANEL_WITH_COIN` messages từ content script (primary flow)
- Handle `ANALYZE_COIN` messages (legacy support, optional)
- Store coin info trong chrome.storage (key: `pendingCoinInfo`) khi opening side panel
- Open side panel using `chrome.sidePanel.open()` API
- Configure side panel behavior: `chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })`
- Storage management (chrome.storage) - coin info, thread ID, message history
- Authentication token management (sync với Supabase via chrome.storage adapter)

#### 4. **Shared Code Layer**
**Purpose:** Reuse frontend code với minimal changes

**Strategy Options:**

**Option A: Monorepo Shared Package** (Recommended)
```
project/
├── packages/
│   ├── shared-ui/          # UI components
│   ├── shared-api/         # API client
│   └── shared-utils/       # Utilities
├── frontend/               # Next.js app
└── extension/              # Browser extension
    └── package.json        # Imports from shared packages
```

**Option B: Direct Import với Path Aliases**
```
extension/
├── tsconfig.json           # Path aliases to frontend
├── webpack.config.js       # Resolve frontend modules
└── src/
    └── components/         # Import from frontend
```

**Option C: Build-time Copy** (Simplest for MVP)
- Copy shared files vào extension build
- Use symlinks trong development
- Build script copies needed files

---

## Project Structure

### Recommended Structure (Monorepo)

```
chainlens/
├── packages/
│   ├── shared-ui/                    # Shared UI components
│   │   ├── src/
│   │   │   ├── components/
│   │   │   │   └── ui/               # Radix UI components
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   ├── shared-api/                   # Shared API client
│   │   ├── src/
│   │   │   ├── api.ts                 # From frontend/lib/api.ts
│   │   │   ├── types.ts
│   │   │   └── error-handler.ts
│   │   └── package.json
│   │
│   └── shared-utils/                  # Shared utilities
│       ├── src/
│       │   ├── utils.ts               # cn(), etc.
│       │   └── validation.ts
│       └── package.json
│
├── frontend/                          # Existing Next.js app
│   └── package.json                   # Imports shared packages
│
└── extension/                         # Browser extension
    ├── manifest.json                  # Extension manifest (Manifest V3)
    ├── package.json                   # Imports shared packages
    ├── src/
    │   ├── content-script/
    │   │   ├── content-script.ts      # Coin detection
    │   │   ├── coin-detector.ts      # Coin name detection logic
    │   │   └── injector.ts           # UI injection
    │   │
    │   ├── sidepanel/
    │   │   ├── sidepanel.tsx          # Main side panel UI
    │   │   ├── ChatInterface.tsx      # Chat interface
    │   │   ├── MessageDisplay.tsx     # Message display
    │   │   ├── LoginForm.tsx          # Authentication UI
    │   │   └── hooks/
    │   │       ├── useCreateAgentChat.ts
    │   │       ├── useAgentStream.ts
    │   │       └── useCoinInfo.ts
    │   │
    │   ├── background/
    │   │   ├── background.ts          # Service worker
    │   │   ├── messaging.ts           # Message passing
    │   │   └── storage.ts             # Chrome storage wrapper
    │   │
    │   ├── shared/                    # Extension-specific shared code
    │   │   ├── constants.ts
    │   │   └── types.ts
    │   │
    │   └── styles/
    │       └── sidepanel.css          # Extension-specific styles
    │
    ├── public/
    │   ├── icons/                     # Extension icons
    │   └── sidepanel.html             # Side panel HTML (automatically injected by webpack)
    │
    └── webpack.config.js              # Build config
```

**Manifest V3 Configuration:**
```json
{
  "manifest_version": 3,
  "permissions": [
    "storage",
    "activeTab",
    "side_panel"
  ],
  "side_panel": {
    "default_path": "sidepanel.html"
  },
  "action": {
    "default_title": "ChainLens Coin Analysis",
    "default_icon": {
      "16": "icons/icon-16.png",
      "48": "icons/icon-48.png",
      "128": "icons/icon-128.png"
    }
  },
  "background": {
    "service_worker": "background.js",
    "type": "module"
  }
}
```

### Alternative: Simpler Structure (Direct Import)

```
chainlens/
├── frontend/                          # Existing Next.js app
│   └── src/
│       └── lib/                       # Shared code (as-is)
│
└── extension/                         # Browser extension
    ├── manifest.json
    ├── tsconfig.json                   # Path aliases to frontend
    │   {
    │     "compilerOptions": {
    │       "paths": {
    │         "@/*": ["../frontend/src/*"]
    │       }
    │     }
    │   }
    ├── webpack.config.js              # Resolve frontend modules
    └── src/
        ├── content-script/
        ├── sidepanel/
        └── background/
```

---

## Technology Stack Decisions

### Core Technologies

| Category | Technology | Version | Rationale |
|----------|-----------|---------|-----------|
| **Extension Framework** | Chrome Extension Manifest V3 | Latest | Modern standard, required by Chrome |
| **UI Framework** | React | 18+ | Reuse from frontend, consistency |
| **Language** | TypeScript | 5+ | Type safety, shared với frontend |
| **Styling** | Tailwind CSS | 4+ | Reuse styles từ frontend |
| **Component Library** | Radix UI | Latest | Already used in frontend |
| **State Management** | Zustand + React Query | Latest | Reuse từ frontend |
| **Build Tool** | Webpack hoặc Vite | Latest | Bundle extension code |
| **API Client** | Shared từ frontend | - | Consistency, error handling |

### Extension-Specific Technologies

| Category | Technology | Rationale |
|----------|-----------|-----------|
| **Content Script Injection** | Vanilla JS hoặc React | Lightweight, fast DOM manipulation |
| **Storage** | chrome.storage API | Extension-native storage |
| **Messaging** | chrome.runtime.sendMessage | Extension message passing |
| **Background Processing** | Service Worker (Manifest V3) | Required by Chrome |

---

## Code Reuse Strategy

### 1. **UI Components Reuse**

**Components to Reuse:**
- `Button`, `Card`, `Dialog`, `Input` từ `components/ui/`
- Styling utilities (`cn()` function)
- Theme system (dark mode support)

**Implementation:**
```typescript
// extension/sidepanel/ChatInterface.tsx
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { ChatInput } from '@/components/thread/chat-input/chat-input';

// Direct import với path aliases hoặc từ shared package
```

### 2. **API Client Reuse**

**Reuse Strategy:**
- Extract `lib/api.ts` thành shared package
- Hoặc import trực tiếp với path aliases
- Maintain same error handling và authentication

**Adaptation Needed:**
- Replace `fetch` với extension-compatible fetch (nếu cần)
- Handle CORS properly (extension có different CORS rules)
- Store auth tokens trong `chrome.storage` thay vì localStorage

**Example:**
```typescript
// extension/lib/api-extension.ts
import { createClient } from '@/lib/supabase/client'; // From frontend
import { getAuthToken } from './storage'; // Extension storage

// Wrap frontend API calls với extension storage
export const analyzeCoin = async (coinName: string) => {
  const token = await getAuthToken(); // From chrome.storage
  // Reuse API logic từ frontend
  return fetch(`${API_URL}/analyze`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ coinName }),
  });
};
```

### 3. **State Management Reuse**

**Zustand Stores:**
- Reuse stores từ `lib/stores/` với minimal changes
- Use `chrome.storage` as persistence backend thay vì localStorage

**React Query:**
- Reuse hooks từ `hooks/react-query/`
- Same query keys và caching strategy
- Extension có thể share cache với frontend (nếu same domain)

### 4. **Utilities Reuse**

**Direct Import:**
- `lib/utils.ts` - `cn()` function
- `lib/error-handler.ts` - Error handling
- Validation utilities

---

## Implementation Patterns

### Pattern 1: Coin Detection

**Content Script Pattern:**
```typescript
// extension/content-script/coin-detector.ts

interface CoinMatch {
  element: HTMLElement;
  name: string;
  symbol?: string;
  price?: number;
}

const COIN_PATTERNS = [
  /bitcoin|btc/gi,
  /ethereum|eth/gi,
  /(?:^|\s)([A-Z]{2,10})\s*\$?(\d+\.?\d*)/g, // Symbol + price
];

export function detectCoins(root: HTMLElement): CoinMatch[] {
  const matches: CoinMatch[] = [];
  
  // Text-based detection
  const walker = document.createTreeWalker(
    root,
    NodeFilter.SHOW_TEXT,
    null
  );
  
  let node;
  while (node = walker.nextNode()) {
    const text = node.textContent || '';
    COIN_PATTERNS.forEach(pattern => {
      const match = text.match(pattern);
      if (match) {
        matches.push({
          element: node.parentElement!,
          name: match[1] || match[0],
        });
      }
    });
  }
  
  return matches;
}
```

### Pattern 2: UI Injection

**Non-Intrusive Injection:**
```typescript
// extension/content-script/injector.ts

export function injectAnalysisButton(
  element: HTMLElement,
  coinData: CoinMatch
): void {
  // Avoid duplicate injection
  if (element.querySelector('.chainlens-analyze-btn')) return;
  
  const button = document.createElement('button');
  button.className = 'chainlens-analyze-btn';
  button.textContent = '📊 Analyze with ChainLens';
  button.dataset.coin = coinData.name;
  
  // Position relative to coin name
  element.style.position = 'relative';
  element.appendChild(button);
  
  button.addEventListener('click', (e) => {
    e.stopPropagation();
    chrome.runtime.sendMessage({
      type: 'ANALYZE_COIN',
      coin: coinData.name,
    });
  });
}
```

### Pattern 3: Message Passing

**Background ↔ Content Script ↔ Side Panel:**
```typescript
// extension/background/messaging.ts

type MessageType = 
  | { type: 'OPEN_SIDE_PANEL_WITH_COIN'; coinInfo: { name: string; symbol: string; price?: number } }
  | { type: 'ANALYZE_COIN'; coin: string } // Legacy support (optional)
  | { type: 'GET_AUTH_TOKEN' };

export function sendToBackground(message: MessageType): Promise<any> {
  return chrome.runtime.sendMessage(message);
}

// Background worker
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'OPEN_SIDE_PANEL_WITH_COIN') {
    // Store coin info trong chrome.storage
    chrome.storage.local.set({
      pendingCoinInfo: message.coinInfo,
    }, () => {
      // Open side panel
      chrome.sidePanel.open({ windowId: sender.tab?.windowId });
      sendResponse({ success: true });
    });
    return true; // Async response
  }
  
  // Note: ANALYZE_COIN is legacy support - new flow uses OPEN_SIDE_PANEL_WITH_COIN
  // Background worker can handle both for backward compatibility
});
```

### Pattern 4: Authentication

**Extension Storage Pattern:**
```typescript
// extension/lib/storage.ts

export async function getAuthToken(): Promise<string | null> {
  const result = await chrome.storage.local.get('auth_token');
  return result.auth_token || null;
}

export async function setAuthToken(token: string): Promise<void> {
  await chrome.storage.local.set({ auth_token: token });
}

// Sync với Supabase auth
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'AUTH_UPDATE') {
    setAuthToken(message.token);
  }
});
```

---

## User Flow

### Flow 1: Coin Detection và Chat Analysis

```
1. User visits crypto website (e.g., CoinGecko, Binance)
   ↓
2. Content script detects coin names on page
   ↓
3. Extension highlights coins và injects "Analyze" buttons
   ↓
4. User clicks "Analyze" button next to coin name
   ↓
5. Extension sends coin info (name, symbol, price) to background worker
   ↓
6. Background worker stores coin info trong chrome.storage và opens side panel
   ↓
7. Side panel opens với chat interface và pre-filled prompt
   ↓
8. User reviews/edits prompt và submits
   ↓
9. Extension creates agent chat mới (unifiedAgentStart API)
   ↓
10. Messages stream in real-time (EventSource streaming)
   ↓
11. User can continue chatting về coin (follow-up questions)
   ↓
12. User can open full report in new tab (optional)
```

### Flow 2: Continue Chatting

```
1. User has existing chat thread về coin (thread ID stored trong chrome.storage)
   ↓
2. User opens side panel (thread ID loaded từ chrome.storage)
   ↓
3. Side panel loads message history từ chrome.storage (key: thread_{threadId}_messages)
   ↓
4. User sends additional message về coin
   ↓
5. Extension uses existing thread ID để continue conversation (unifiedAgentStart với thread_id parameter)
   ↓
6. New message streams in real-time (EventSource streaming)
   ↓
7. Updated message history persisted trong chrome.storage
   ↓
8. Thread ID maintained for future messages
```

### Flow 3: Report Generation

```
1. User clicks "Open Full Report" trong chat interface (optional)
   ↓
2. Extension opens new tab với report URL (includes thread ID)
   ↓
3. Report page (frontend) loads với coin context và chat history
   ↓
4. Frontend generates comprehensive report using existing infrastructure
   ↓
5. User can share, save, hoặc export report
```

---

## API Integration

### Backend API Endpoints (Existing)

Extension sẽ reuse existing backend APIs từ frontend:

**Agent Creation API:**
```
POST /agent/start
Body: FormData { prompt: string, thread_id?: string, model_name?: string, agent_id?: string }
Response: { thread_id: string, agent_run_id: string, status: string }
```

**Message Streaming API:**
```
GET /agent-run/{agent_run_id}/stream?token={jwt_token}
Response: Server-Sent Events (SSE) stream
```

**Report Generation API:**
```
POST /api/reports/generate
Body: { coinName: string, threadId: string }
Response: { reportId: string, reportUrl: string }
```

### Extension API Adaptations

**Authentication:**
- Store JWT token trong `chrome.storage`
- Sync với Supabase auth state
- Handle token refresh automatically

**CORS:**
- Extension có different CORS rules
- May need backend CORS updates for extension origin
- Or use background worker as proxy

---

## Security Architecture

### Authentication Flow

1. **Initial Auth:**
   - User logs in via extension side panel (reuse frontend auth UI)
   - Token stored in `chrome.storage.local` (encrypted)
   - Token synced với Supabase session via chrome.storage adapter

2. **Token Management:**
   - Background worker handles token refresh
   - Automatic re-authentication on expiry
   - Secure storage using `chrome.storage` API

3. **API Security:**
   - All API calls include JWT token
   - Rate limiting enforced by backend
   - User tier validation (Free/Pro/Enterprise)

### Content Script Security

- **Isolated Execution:** Content script runs in isolated world
- **No Direct DOM Access:** Use message passing for communication
- **XSS Prevention:** Sanitize all user inputs
- **CSP Compliance:** Extension respects page CSP

---

## Performance Considerations

### Content Script Performance

**Optimizations:**
- Lazy detection: Only scan visible content initially
- Debounce DOM mutations observer
- Cache detected coins to avoid re-scanning
- Use `requestIdleCallback` for non-critical operations

### Side Panel Performance

**Optimizations:**
- Lazy load chat components
- Use React Query caching (optional, simplified for extension)
- Stream messages efficiently (EventSource throttling)
- Optimize bundle size (tree-shaking)
- Message history persistence với chrome.storage

### Bundle Size

**Target:** < 2MB total extension size (allows for shared frontend code)

**Strategies:**
- Tree-shake unused frontend code
- Code splitting for side panel vs content script
- Lazy load heavy components (ChatInput, streaming logic)
- Minimize dependencies
- Shared code from frontend (no duplication)

---

## Development Environment

### Prerequisites

- Node.js 18+
- npm hoặc pnpm
- Chrome/Edge browser for testing
- Existing frontend development environment

### Setup Commands

```bash
# Install dependencies
cd extension
npm install

# Link shared packages (if monorepo)
npm link ../packages/shared-ui
npm link ../packages/shared-api

# Development build với watch
npm run dev

# Production build
npm run build

# Load extension in Chrome
# 1. Open chrome://extensions/
# 2. Enable "Developer mode"
# 3. Click "Load unpacked"
# 4. Select extension/dist directory
```

### Development Workflow

1. **Development:**
   - Make changes to extension code
   - Run `npm run dev` (watches for changes)
   - Reload extension in Chrome (click reload button)

2. **Testing:**
   - Test on various crypto websites
   - Verify coin detection accuracy
   - Test analysis flow end-to-end

3. **Shared Code Updates:**
   - Update shared packages
   - Extension automatically picks up changes (if linked)
   - Rebuild extension

---

## Deployment Architecture

### Extension Distribution

**Chrome Web Store:**
- Build production bundle
- Create extension package (zip)
- Submit to Chrome Web Store
- Follow Chrome Web Store policies

**Firefox Add-ons:**
- Similar process for Firefox
- May need minor manifest adjustments

### Version Management

- Version sync với frontend (semantic versioning)
- Extension version in `manifest.json`
- Shared packages versioned independently

---

## Consistency Rules

### Naming Conventions

**Files:**
- Components: `kebab-case.tsx` (e.g., `coin-analysis.tsx`)
- Utilities: `kebab-case.ts` (e.g., `coin-detector.ts`)
- Types: `PascalCase.ts` (e.g., `CoinTypes.ts`)

**Variables:**
- camelCase for variables và functions
- PascalCase for components và types
- UPPER_CASE for constants

**CSS Classes:**
- Tailwind utility classes (reuse từ frontend)
- Custom classes: `chainlens-*` prefix (e.g., `chainlens-analyze-btn`)

### Code Organization

**Structure:**
```
extension/src/
├── content-script/    # Content script code (coin detection)
├── sidepanel/         # Side panel UI (chat interface)
│   ├── ChatInterface.tsx
│   ├── MessageDisplay.tsx
│   ├── LoginForm.tsx
│   └── hooks/
│       ├── useCreateAgentChat.ts
│       ├── useAgentStream.ts
│       └── useCoinInfo.ts
├── background/        # Background worker (message coordination)
├── shared/            # Extension-specific shared
└── lib/               # Reused from frontend (via aliases)
```

**Import Order:**
1. React và external libraries
2. Shared frontend code (via aliases)
3. Extension-specific code
4. Types

### Error Handling

**Consistent với Frontend:**
- Use same error handler từ `lib/error-handler.ts`
- Same error types và messages
- User-friendly error messages

---

## Architecture Decision Records (ADRs)

### ADR-001: Code Reuse Strategy

**Decision:** Use monorepo shared packages approach

**Rationale:**
- Maximum code reuse
- Type safety across packages
- Independent versioning
- Easier maintenance

**Alternatives Considered:**
- Direct import: Simpler but tighter coupling
- Copy code: More maintenance overhead

### ADR-002: Extension Manifest Version

**Decision:** Use Manifest V3

**Rationale:**
- Required by Chrome
- Modern standard
- Better security
- Service worker instead of background pages

### ADR-003: UI Framework

**Decision:** React (same as frontend)

**Rationale:**
- Code reuse
- Component consistency
- Developer familiarity
- Ecosystem compatibility

### ADR-004: Content Script Injection Strategy

**Decision:** Non-intrusive button injection

**Rationale:**
- Doesn't break existing page functionality
- Clear user action required
- Respects page design
- Easy to disable/remove

**Alternatives Considered:**
- Context menu: Less discoverable
- Overlay: More intrusive

---

## Next Steps

### Phase 1: Foundation (Week 1-2)
1. Set up extension project structure
2. Create shared packages (if monorepo)
3. Set up build configuration
4. Basic manifest và side panel skeleton

### Phase 2: Core Features (Week 3-4)
1. Implement coin detection
2. Content script injection
3. Basic side panel UI với shared components
4. API integration (reuse frontend API client)
5. Chat interface setup (Epic 15)

### Phase 3: Analysis Flow (Week 5-6)
1. Analysis request flow
2. Results display
3. Report generation integration
4. Error handling

### Phase 4: Polish & Testing (Week 7-8)
1. UI/UX refinements
2. Performance optimization
3. Cross-browser testing
4. Chrome Web Store preparation

---

## Conclusion

Extension architecture được thiết kế để maximize code reuse từ frontend, ensuring consistency và minimizing development effort. Bằng cách reuse UI components, API client, và state management, extension sẽ provide seamless experience cho users khi analyze coins từ bất kỳ website nào.

**Key Benefits:**
- ✅ Minimal new code required (~95-98% code reuse)
- ✅ Consistent UI/UX với main app (shared components)
- ✅ Shared error handling và authentication
- ✅ Real-time chat interface với streaming
- ✅ Persistent side panel (better UX than popup)
- ✅ Easier maintenance (single source of truth)
- ✅ Type safety across codebase

**Key Features:**
- ✅ Side panel UI (mở bên phải trình duyệt, persistent)
- ✅ Chat interface với ChatInput component từ frontend
- ✅ Real-time message streaming với EventSource
- ✅ Agent creation với unifiedAgentStart API
- ✅ Continue chatting với thread ID persistence
- ✅ Coin context integration (pre-filled prompts)
- ✅ Message history persistence trong chrome.storage

---

_Architecture Document v2.1_  
_Generated: 2025-11-07_  
_Updated: 2025-01-15 (Added Side Panel & Chat Integration, Fixed Consistency Issues)_  
_Reviewed: 2025-01-15 (Architecture consistency với PRD và Epic verified)_  
_Architect: Winston (BMAD Architect Agent)_

