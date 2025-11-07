# Browser Extension Architecture - Suna.so

**Generated:** 2025-11-07  
**Architect:** Winston (BMAD Architect Agent)  
**For:** Luis  
**Project:** Suna.so Browser Extension

---

## Executive Summary

Kiến trúc extension được thiết kế để tối đa hóa code reuse từ frontend Next.js hiện tại, cho phép user click vào tên coin trên bất kỳ website nào và tạo báo cáo/phân tích ngay lập tức. Extension sử dụng shared components, API client, và state management từ frontend để đảm bảo consistency và minimize code duplication.

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
│  │ Content      │      │ Popup/       │               │
│  │ Script       │◄────►│ Sidebar      │               │
│  │ (Coin        │      │ (Analysis    │               │
│  │ Detection)   │      │  UI)         │               │
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
- Inject "Analyze with Suna" button/context menu
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
  if (e.target.matches('.suna-analyze-btn')) {
    const coinData = e.target.dataset.coin;
    sendToBackground({ type: 'ANALYZE_COIN', data: coinData });
  }
});
```

#### 2. **Popup/Sidebar UI** (`popup.tsx` hoặc `sidebar.tsx`)
**Purpose:** Display analysis results và controls

**Architecture:**
- Sử dụng React components từ frontend
- Shared API client để call backend
- Shared UI components (Button, Card, Dialog)
- React Query cho data fetching

**Structure:**
```
extension/
├── popup/
│   ├── popup.tsx           # Main popup component
│   ├── coin-analysis.tsx    # Analysis display (reuses frontend components)
│   └── styles.css          # Extension-specific overrides
```

**Code Reuse Example:**
```typescript
// extension/popup/coin-analysis.tsx
import { Button } from '@/components/ui/button';  // From frontend
import { Card } from '@/components/ui/card';       // From frontend
import { analyzeCoin } from '@/lib/api';           // From frontend
import { useQuery } from '@tanstack/react-query'; // From frontend

export function CoinAnalysis({ coinName }: { coinName: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['coin-analysis', coinName],
    queryFn: () => analyzeCoin(coinName),
  });

  return (
    <Card>
      {/* Reuse frontend components */}
      <Button onClick={() => generateReport(coinName)}>
        Generate Full Report
      </Button>
    </Card>
  );
}
```

#### 3. **Background Service Worker** (`background.ts`)
**Purpose:** Coordinate between content script và popup, handle API calls

**Responsibilities:**
- Message passing between content script và popup
- API request coordination
- Storage management (chrome.storage)
- Authentication token management

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
suna/
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
    │   ├── popup/
    │   │   ├── popup.tsx              # Main popup UI
    │   │   ├── coin-analysis.tsx      # Analysis display
    │   │   └── report-viewer.tsx      # Report display
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
    │       └── popup.css              # Extension-specific styles
    │
    ├── public/
    │   ├── icons/                     # Extension icons
    │   └── popup.html                 # Popup HTML
    │
    └── webpack.config.js              # Build config
```

### Alternative: Simpler Structure (Direct Import)

```
suna/
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
        ├── popup/
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
// extension/popup/coin-analysis.tsx
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';

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
  if (element.querySelector('.suna-analyze-btn')) return;
  
  const button = document.createElement('button');
  button.className = 'suna-analyze-btn';
  button.textContent = '📊 Analyze with Suna';
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

**Background ↔ Content Script ↔ Popup:**
```typescript
// extension/background/messaging.ts

type MessageType = 
  | { type: 'ANALYZE_COIN'; coin: string }
  | { type: 'ANALYSIS_COMPLETE'; result: AnalysisResult }
  | { type: 'GET_AUTH_TOKEN' };

export function sendToBackground(message: MessageType): Promise<any> {
  return chrome.runtime.sendMessage(message);
}

// Background worker
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'ANALYZE_COIN') {
    analyzeCoin(message.coin).then(result => {
      sendResponse({ type: 'ANALYSIS_COMPLETE', result });
    });
    return true; // Async response
  }
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

### Flow 1: Coin Detection và Analysis

```
1. User visits crypto website (e.g., CoinGecko, Binance)
   ↓
2. Content script detects coin names on page
   ↓
3. Extension highlights coins và injects "Analyze" buttons
   ↓
4. User clicks "Analyze" button next to coin name
   ↓
5. Extension sends coin name to background worker
   ↓
6. Background worker calls backend API (reusing frontend API client)
   ↓
7. Analysis results displayed in popup/sidebar
   ↓
8. User can generate full report (opens in new tab hoặc popup)
```

### Flow 2: Report Generation

```
1. User clicks "Generate Full Report" in extension popup
   ↓
2. Extension opens new tab với report URL
   ↓
3. Report page (frontend) loads với coin context
   ↓
4. Frontend generates comprehensive report using existing infrastructure
   ↓
5. User can share, save, hoặc export report
```

---

## API Integration

### Backend API Endpoints (Existing)

Extension sẽ reuse existing backend APIs:

**Coin Analysis API:**
```
POST /api/analyze
Body: { coinName: string, includeAdvanced?: boolean }
Response: AnalysisResult
```

**Report Generation API:**
```
POST /api/reports/generate
Body: { coinName: string, analysisId: string }
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
   - User logs in via extension popup (reuse frontend auth UI)
   - Token stored in `chrome.storage.local` (encrypted)
   - Token synced với Supabase session

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

### Popup Performance

**Optimizations:**
- Lazy load analysis results
- Use React Query caching
- Prefetch on coin detection
- Optimize bundle size (tree-shaking)

### Bundle Size

**Target:** < 500KB total extension size

**Strategies:**
- Tree-shake unused frontend code
- Code splitting for popup vs content script
- Lazy load heavy components
- Minimize dependencies

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
- Custom classes: `suna-*` prefix (e.g., `suna-analyze-btn`)

### Code Organization

**Structure:**
```
extension/src/
├── content-script/    # Content script code
├── popup/             # Popup UI
├── background/        # Background worker
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
4. Basic manifest và popup skeleton

### Phase 2: Core Features (Week 3-4)
1. Implement coin detection
2. Content script injection
3. Basic popup UI với shared components
4. API integration (reuse frontend API client)

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
- ✅ Minimal new code required
- ✅ Consistent UI/UX với main app
- ✅ Shared error handling và authentication
- ✅ Easier maintenance (single source of truth)
- ✅ Type safety across codebase

---

_Architecture Document v1.0_  
_Generated: 2025-11-07_  
_Architect: Winston (BMAD Architect Agent)_

