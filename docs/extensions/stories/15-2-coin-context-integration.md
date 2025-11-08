# Story 15.2: Coin Context Integration

Status: ready-for-dev

## Story

As a user,  
I want prompt pre-filled với coin info khi click "Analyze",  
So that I can quickly start analyzing coin without manually typing coin name.

## Acceptance Criteria

1. Content script passes coin info to side panel khi click "Analyze"
2. Side panel receives coin info và pre-fills prompt trong ChatInput
3. User can edit prompt trước khi submit
4. Coin info formatted correctly (name, symbol, price)
5. Prompt shows coin context clearly

## Prerequisites

- Story 12.1: UI Component Library (Button, Card, Dialog)
- Story 12.2: Side Panel Layout & Structure
- Story 13.1: Chrome Storage Adapter for Supabase
- Story 13.2: API Client Adaptation
- Story 13.3: Authentication Flow in Side Panel
- Story 15.1: Chat Interface Setup

## Tasks / Subtasks

- [ ] Task 1: Pass coin info từ content script (AC: 1)
  - [ ] **Source:** `extension/src/content-script/content-script.ts` (existing content script)
  - [ ] **Modify content script để send coin info:**
    ```typescript
    // extension/src/content-script/content-script.ts
    // When user clicks "Analyze" button
    async function handleAnalyzeClick(coinInfo: {
      name: string;
      symbol: string;
      price?: number;
    }) {
      // Send message to background worker
      chrome.runtime.sendMessage({
        type: 'OPEN_SIDE_PANEL_WITH_COIN',
        coinInfo: {
          name: coinInfo.name,
          symbol: coinInfo.symbol,
          price: coinInfo.price,
        },
      });
    }
    ```
  - [ ] **Update button click handler:**
    ```typescript
    // In content script, when detecting coin và injecting button
    analyzeButton.addEventListener('click', () => {
      handleAnalyzeClick({
        name: detectedCoinName,
        symbol: detectedCoinSymbol,
        price: detectedCoinPrice, // Optional
      });
    });
    ```
  - [ ] Test content script sends coin info correctly
  - [ ] Test message arrives at background worker

- [ ] Task 2: Handle coin info trong background worker (AC: 1)
  - [ ] **Source:** `extension/src/background/background.ts` (existing background worker)
  - [ ] **Add message handler:**
    ```typescript
    // extension/src/background/background.ts
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
        return true; // Keep channel open for async response
      }
    });
    ```
  - [ ] Test background worker stores coin info
  - [ ] Test side panel opens correctly

- [ ] Task 3: Retrieve coin info trong side panel (AC: 2)
  - [ ] **Create hook để get coin info:**
    ```typescript
    // extension/src/sidepanel/hooks/useCoinInfo.ts
    import { useEffect, useState } from 'react';

    interface CoinInfo {
      name: string;
      symbol: string;
      price?: number;
    }

    export function useCoinInfo() {
      const [coinInfo, setCoinInfo] = useState<CoinInfo | null>(null);

      useEffect(() => {
        // Get coin info từ chrome.storage
        chrome.storage.local.get(['pendingCoinInfo'], (result) => {
          if (result.pendingCoinInfo) {
            setCoinInfo(result.pendingCoinInfo);
            // Clear pending coin info after retrieving
            chrome.storage.local.remove(['pendingCoinInfo']);
          }
        });

        // Listen for storage changes (if coin info updated)
        const listener = (changes: { [key: string]: chrome.storage.StorageChange }) => {
          if (changes.pendingCoinInfo) {
            setCoinInfo(changes.pendingCoinInfo.newValue);
            // Clear pending coin info
            chrome.storage.local.remove(['pendingCoinInfo']);
          }
        };
        chrome.storage.onChanged.addListener(listener);

        return () => {
          chrome.storage.onChanged.removeListener(listener);
        };
      }, []);

      return coinInfo;
    }
    ```
  - [ ] Test hook retrieves coin info correctly
  - [ ] Test coin info cleared after retrieval

- [ ] Task 4: Pre-fill prompt trong ChatInput (AC: 2, 3)
  - [ ] **Source:** `frontend/src/components/thread/chat-input/chat-input.tsx:78-122` (ChatInputProps)
  - [ ] **Props available:**
    - `value?: string` - Controlled value
    - `onChange?: (value: string) => void` - Change handler
  - [ ] **Format prompt với coin info:**
    ```typescript
    // extension/src/sidepanel/components/ChatInterface.tsx
    import { useCoinInfo } from '../hooks/useCoinInfo';
    import { ChatInput } from '@/components/thread/chat-input/chat-input';
    import { useState, useEffect } from 'react';

    export function ChatInterface() {
      const coinInfo = useCoinInfo();
      const [prompt, setPrompt] = useState('');

      // Pre-fill prompt khi coin info available
      useEffect(() => {
        if (coinInfo) {
          const coinContext = `Analyze ${coinInfo.name} (${coinInfo.symbol})${coinInfo.price ? ` - Current price: $${coinInfo.price}` : ''}`;
          const defaultPrompt = `${coinContext}\n\nProvide a comprehensive analysis including:\n- Current market status\n- Technical indicators\n- Price trends\n- Market sentiment\n- Risk assessment`;
          setPrompt(defaultPrompt);
        }
      }, [coinInfo]);

      return (
        <div className="flex flex-col h-screen">
          <header>...</header>
          <main>...</main>
          <footer className="p-4 border-t">
            <ChatInput
              value={prompt}
              onChange={setPrompt}
              onSubmit={handleSubmit}
              placeholder="Analyze coin..."
              loading={false}
              disabled={false}
              isAgentRunning={false}
              hideAttachments={true}
              hideAgentSelection={true}
            />
          </footer>
        </div>
      );
    }
    ```
  - [ ] Test prompt pre-fills correctly
  - [ ] Test user can edit prompt
  - [ ] Test prompt formatting is correct

- [ ] Task 5: Format coin info correctly (AC: 4)
  - [ ] **Coin info format:**
    ```typescript
    interface CoinInfo {
      name: string;      // e.g., "Bitcoin"
      symbol: string;    // e.g., "BTC"
      price?: number;    // e.g., 103571.23 (optional)
    }
    ```
  - [ ] **Prompt format:**
    ```typescript
    // Format 1: With price
    `Analyze ${coinInfo.name} (${coinInfo.symbol}) - Current price: $${coinInfo.price.toLocaleString()}`

    // Format 2: Without price
    `Analyze ${coinInfo.name} (${coinInfo.symbol})`
    ```
  - [ ] **Helper function:**
    ```typescript
    // extension/src/sidepanel/utils/coin-formatter.ts
    export function formatCoinPrompt(coinInfo: {
      name: string;
      symbol: string;
      price?: number;
    }): string {
      const coinContext = `Analyze ${coinInfo.name} (${coinInfo.symbol})`;
      const priceContext = coinInfo.price
        ? ` - Current price: $${coinInfo.price.toLocaleString()}`
        : '';
      return `${coinContext}${priceContext}`;
    }
    ```
  - [ ] Test coin info formatted correctly
  - [ ] Test price formatting (commas, decimals)
  - [ ] Test handles missing price

- [ ] Task 6: Display coin context clearly (AC: 5)
  - [ ] **Show coin info trong header (optional):**
    ```typescript
    // extension/src/sidepanel/components/ChatInterface.tsx
    export function ChatInterface() {
      const coinInfo = useCoinInfo();

      return (
        <div className="flex flex-col h-screen">
          <header className="flex items-center justify-between p-4 border-b">
            <div>
              <h1 className="text-lg font-bold">ChainLens Coin Analysis</h1>
              {coinInfo && (
                <p className="text-sm text-gray-600">
                  Analyzing: {coinInfo.name} ({coinInfo.symbol})
                  {coinInfo.price && ` - $${coinInfo.price.toLocaleString()}`}
                </p>
              )}
            </div>
            <button onClick={handleClose}>✕</button>
          </header>
          {/* ... */}
        </div>
      );
    }
    ```
  - [ ] Test coin context displays clearly
  - [ ] Test header shows coin info
  - [ ] Test prompt shows coin context

- [ ] Testing (AC: 1, 2, 3, 4, 5)
  - [ ] Test content script passes coin info
  - [ ] Test background worker handles coin info
  - [ ] Test side panel receives coin info
  - [ ] Test prompt pre-fills correctly
  - [ ] Test user can edit prompt
  - [ ] Test coin info formatted correctly
  - [ ] Test coin context displays clearly

## Code Reuse Instructions

### Message Passing: chrome.runtime.sendMessage

**Source File:**
- **Path:** `extension/src/content-script/content-script.ts` (existing)
- **Pattern:** Chrome extension message passing

**What to Implement:**
- ✅ **Message from content script to background worker**
- ✅ **Message type:** `OPEN_SIDE_PANEL_WITH_COIN`
- ✅ **Data:** `{ coinInfo: { name, symbol, price? } }`

**Usage Example:**
```typescript
// Content script
chrome.runtime.sendMessage({
  type: 'OPEN_SIDE_PANEL_WITH_COIN',
  coinInfo: {
    name: 'Bitcoin',
    symbol: 'BTC',
    price: 103571.23,
  },
});
```

**Background Worker Handler:**
```typescript
// Background worker
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'OPEN_SIDE_PANEL_WITH_COIN') {
    chrome.storage.local.set({ pendingCoinInfo: message.coinInfo }, () => {
      chrome.sidePanel.open({ windowId: sender.tab?.windowId });
      sendResponse({ success: true });
    });
    return true;
  }
});
```

### Storage: chrome.storage.local

**Source File:**
- **Path:** Extension storage API
- **Pattern:** Chrome extension storage

**What to Implement:**
- ✅ **Store coin info:** `chrome.storage.local.set({ pendingCoinInfo: coinInfo })`
- ✅ **Retrieve coin info:** `chrome.storage.local.get(['pendingCoinInfo'])`
- ✅ **Clear coin info:** `chrome.storage.local.remove(['pendingCoinInfo'])`

**Usage Example:**
```typescript
// Store
chrome.storage.local.set({ pendingCoinInfo: coinInfo }, () => {
  console.log('Coin info stored');
});

// Retrieve
chrome.storage.local.get(['pendingCoinInfo'], (result) => {
  if (result.pendingCoinInfo) {
    console.log('Coin info:', result.pendingCoinInfo);
  }
});

// Clear
chrome.storage.local.remove(['pendingCoinInfo'], () => {
  console.log('Coin info cleared');
});
```

### Component: ChatInput (Controlled Value)

**Source File:**
- **Path:** `frontend/src/components/thread/chat-input/chat-input.tsx`
- **Lines:** `78-122` (ChatInputProps)
- **Props:** `value?: string`, `onChange?: (value: string) => void`

**What to Reuse:**
- ✅ **Controlled value mode** (pre-fill prompt)
- ✅ **onChange handler** (allow user to edit)
- ✅ **Component** (no modifications needed)

**Usage Example:**
```typescript
// extension/src/sidepanel/components/ChatInterface.tsx
import { ChatInput } from '@/components/thread/chat-input/chat-input';
import { useState } from 'react';

export function ChatInterface() {
  const [prompt, setPrompt] = useState('');

  // Pre-fill prompt
  useEffect(() => {
    if (coinInfo) {
      setPrompt(formatCoinPrompt(coinInfo));
    }
  }, [coinInfo]);

  return (
    <ChatInput
      value={prompt}
      onChange={setPrompt}
      onSubmit={handleSubmit}
      placeholder="Analyze coin..."
    />
  );
}
```

**Dependencies:**
- ✅ `@/components/thread/chat-input/chat-input` - Available from Story 15.1
- ✅ React hooks - Available (useState, useEffect)

**Test Checklist:**
- [ ] Controlled value works correctly
- [ ] onChange handler works
- [ ] User can edit prompt
- [ ] Pre-filled value displays correctly

### References

- [Source: docs/epics-extension.md#Epic-15] - Epic 15 goal: chat integration
- [Source: docs/epics-extension.md#Story-15.2] - Story acceptance criteria và prerequisites
- [Source: docs/stories/15-1-chat-interface-setup.md#Dev-Agent-Record] - Chat interface ready
- [Source: docs/stories/12-2-popup-layout-structure.md#Dev-Agent-Record] - Side panel layout ready
- [Source: frontend/src/components/thread/chat-input/chat-input.tsx:78-122] - ChatInput props
- [Source: extension/src/content-script/content-script.ts] - Content script reference
- [Source: extension/src/background/background.ts] - Background worker reference

### Learnings from Previous Story

**From Story 15.1 (Status: ready-for-dev)**
- **Chat Interface**: ChatInterface component created với ChatInput
- **ChatInput Component**: ChatInput imported và ready for use
- **Side Panel Layout**: Side panel layout structure ready

**Reuse:**
- Use ChatInterface từ Story 15.1
- Use ChatInput với controlled value mode
- Use side panel layout từ Story 12.2

[Source: docs/stories/15-1-chat-interface-setup.md#Dev-Agent-Record]

## Dev Agent Record

### Context Reference

<!-- Path(s) to story context XML will be added here by context workflow -->

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List

## Change Log

- 2025-01-15: Story created with detailed code reuse instructions

