# Story 15.3: Agent Creation Integration

Status: ready-for-dev

## Story

As a developer,  
I want integrate unifiedAgentStart API để tạo agent chat mới,  
So that user can start chatting về coin khi submit prompt.

## Acceptance Criteria

1. ChatInterface calls unifiedAgentStart khi user submits prompt
2. Agent creation uses coin info từ prompt (if available)
3. Agent creation returns thread_id và agent_run_id
4. Thread ID stored để continue chatting
5. Error handling works (billing, limits, auth)
6. Loading state shows during agent creation

## Prerequisites

- Story 12.1: UI Component Library (Button, Card, Dialog)
- Story 12.2: Side Panel Layout & Structure
- Story 13.1: Chrome Storage Adapter for Supabase
- Story 13.2: API Client Adaptation
- Story 13.3: Authentication Flow in Side Panel
- Story 15.1: Chat Interface Setup
- Story 15.2: Coin Context Integration

## Tasks / Subtasks

- [ ] Task 1: Create agent creation hook (AC: 1, 2, 3)
  - [ ] **Source file:** `frontend/src/lib/api.ts:695-856` (unifiedAgentStart function)
  - [ ] **Source file:** `frontend/src/hooks/react-query/dashboard/use-initiate-agent.ts:11-68` (useInitiateAgentMutation hook)
  - [ ] **Create hook:**
    ```typescript
    // extension/src/sidepanel/hooks/useCreateAgentChat.ts
    import { useState } from 'react';
    import { unifiedAgentStart, UnifiedAgentStartResponse, BillingError, AgentRunLimitError, NoAccessTokenAvailableError } from '@/lib/api';

    export function useCreateAgentChat() {
      const [loading, setLoading] = useState(false);
      const [error, setError] = useState<string | null>(null);

      const createChat = async (
        prompt: string,
        options?: {
          model_name?: string;
          agent_id?: string;
        }
      ): Promise<UnifiedAgentStartResponse | null> => {
        setLoading(true);
        setError(null);

        try {
          const result = await unifiedAgentStart({
            prompt,
            model_name: options?.model_name || 'claude-sonnet-4',
            agent_id: options?.agent_id,
          });

          return result;
        } catch (err) {
          if (err instanceof BillingError) {
            setError('Payment required. Please upgrade your subscription.');
          } else if (err instanceof AgentRunLimitError) {
            setError('Agent run limit reached. Please try again later.');
          } else if (err instanceof NoAccessTokenAvailableError) {
            setError('Please log in to continue.');
          } else {
            setError(err instanceof Error ? err.message : 'Failed to create agent chat');
          }
          return null;
        } finally {
          setLoading(false);
        }
      };

      return { createChat, loading, error };
    }
    ```
  - [ ] Test hook creates agent correctly
  - [ ] Test hook handles errors correctly
  - [ ] Test loading state works

- [ ] Task 2: Integrate agent creation vào ChatInterface (AC: 1, 2)
  - [ ] **Source:** `extension/src/sidepanel/components/ChatInterface.tsx` (from Story 15.1)
  - [ ] **Update ChatInterface:**
    ```typescript
    // extension/src/sidepanel/components/ChatInterface.tsx
    import { useCreateAgentChat } from '../hooks/useCreateAgentChat';
    import { useState } from 'react';

    export function ChatInterface() {
      const { createChat, loading, error: createError } = useCreateAgentChat();
      const [threadId, setThreadId] = useState<string | null>(null);
      const [agentRunId, setAgentRunId] = useState<string | null>(null);
      const coinInfo = useCoinInfo();

      const handleSubmit = async (
        message: string,
        options?: { model_name?: string; agent_id?: string }
      ) => {
        // Create agent chat
        const result = await createChat(message, options);

        if (result) {
          setThreadId(result.thread_id);
          setAgentRunId(result.agent_run_id);
          // Will implement message streaming in Story 15.4
        }
      };

      return (
        <div className="flex flex-col h-screen">
          <header>...</header>
          <main>...</main>
          <footer className="p-4 border-t">
            <ChatInput
              onSubmit={handleSubmit}
              loading={loading}
              disabled={loading}
              isAgentRunning={loading}
              placeholder="Analyze coin..."
            />
            {createError && (
              <div className="text-red-500 text-sm mt-2">{createError}</div>
            )}
          </footer>
        </div>
      );
    }
    ```
  - [ ] Test agent creation integrated correctly
  - [ ] Test submit handler works
  - [ ] Test loading state shows

- [ ] Task 3: Store thread ID để continue chatting (AC: 4)
  - [ ] **Store thread ID:**
    ```typescript
    // extension/src/sidepanel/hooks/useCreateAgentChat.ts
    import { useState } from 'react';

    export function useCreateAgentChat() {
      const [threadId, setThreadId] = useState<string | null>(null);
      const [agentRunId, setAgentRunId] = useState<string | null>(null);

      const createChat = async (prompt: string, options?: {...}) => {
        // ... create agent ...
        if (result) {
          setThreadId(result.thread_id);
          setAgentRunId(result.agent_run_id);
          
          // Store thread ID trong chrome.storage để persist
          chrome.storage.local.set({
            currentThreadId: result.thread_id,
            currentAgentRunId: result.agent_run_id,
          });
        }
        return result;
      };

      return { createChat, loading, error, threadId, agentRunId };
    }
    ```
  - [ ] **Load thread ID on mount:**
    ```typescript
    // extension/src/sidepanel/hooks/useCreateAgentChat.ts
    useEffect(() => {
      chrome.storage.local.get(['currentThreadId', 'currentAgentRunId'], (result) => {
        if (result.currentThreadId) {
          setThreadId(result.currentThreadId);
          setAgentRunId(result.currentAgentRunId);
        }
      });
    }, []);
    ```
  - [ ] Test thread ID stored correctly
  - [ ] Test thread ID loaded on mount
  - [ ] Test thread ID persists across extension restarts

- [ ] Task 4: Handle errors correctly (AC: 5)
  - [ ] **Error handling patterns:**
    ```typescript
    // extension/src/sidepanel/hooks/useCreateAgentChat.ts
    try {
      const result = await unifiedAgentStart({ prompt, ... });
    } catch (err) {
      if (err instanceof BillingError) {
        // Show billing error message
        setError('Payment required. Please upgrade your subscription.');
      } else if (err instanceof AgentRunLimitError) {
        // Show agent limit error
        setError('Agent run limit reached. Please try again later.');
      } else if (err instanceof NoAccessTokenAvailableError) {
        // Show auth error
        setError('Please log in to continue.');
      } else {
        // Show generic error
        setError(err instanceof Error ? err.message : 'Failed to create agent chat');
      }
    }
    ```
  - [ ] **Display errors trong UI:**
    ```typescript
    // extension/src/sidepanel/components/ChatInterface.tsx
    {createError && (
      <div className="text-red-500 text-sm mt-2 p-2 bg-red-50 rounded">
        {createError}
      </div>
    )}
    ```
  - [ ] Test billing error handled correctly
  - [ ] Test agent limit error handled correctly
  - [ ] Test auth error handled correctly
  - [ ] Test generic error handled correctly

- [ ] Task 5: Show loading state (AC: 6)
  - [ ] **Loading state trong ChatInput:**
    ```typescript
    // extension/src/sidepanel/components/ChatInterface.tsx
    <ChatInput
      onSubmit={handleSubmit}
      loading={loading}
      disabled={loading}
      isAgentRunning={loading}
      placeholder="Analyze coin..."
    />
    ```
  - [ ] **Loading indicator (optional):**
    ```typescript
    // extension/src/sidepanel/components/ChatInterface.tsx
    {loading && (
      <div className="flex items-center justify-center p-4">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-gray-900"></div>
        <span className="ml-2">Creating agent chat...</span>
      </div>
    )}
    ```
  - [ ] Test loading state shows during agent creation
  - [ ] Test loading state hides after creation
  - [ ] Test ChatInput disabled during loading

- [ ] Task 6: Use coin info từ prompt (AC: 2)
  - [ ] **Note:** Coin info already included trong prompt từ Story 15.2
  - [ ] **No additional code needed** - Prompt already contains coin context
  - [ ] **Verify prompt format:**
    ```typescript
    // Prompt format từ Story 15.2
    const prompt = `Analyze ${coinInfo.name} (${coinInfo.symbol})${coinInfo.price ? ` - Current price: $${coinInfo.price}` : ''}\n\nProvide a comprehensive analysis...`;
    ```
  - [ ] Test coin info included trong prompt
  - [ ] Test agent receives coin context correctly

- [ ] Testing (AC: 1, 2, 3, 4, 5, 6)
  - [ ] Test agent creation works
  - [ ] Test thread ID stored correctly
  - [ ] Test error handling works
  - [ ] Test loading state shows
  - [ ] Test coin info included trong prompt
  - [ ] Test agent creation returns thread_id và agent_run_id

## Code Reuse Instructions

### API Function: unifiedAgentStart

**Source File:**
- **Path:** `frontend/src/lib/api.ts`
- **Lines:** `695-856` (function definition)
- **Export:** `export const unifiedAgentStart = async (options: {...}): Promise<UnifiedAgentStartResponse> => {...}`

**Import Statement:**
```typescript
import { unifiedAgentStart, UnifiedAgentStartResponse, BillingError, AgentRunLimitError, NoAccessTokenAvailableError } from '@/lib/api';
```

**What to Reuse:**
- ✅ **Full function** (no modifications needed)
- ✅ **Types:** `UnifiedAgentStartResponse` (imported từ same file)
- ✅ **Error classes:** `BillingError`, `AgentRunLimitError`, `NoAccessTokenAvailableError` (imported từ same file)

**Key Features:**
- ✅ Handles authentication internally (gets token from Supabase session)
- ✅ Includes Authorization header automatically
- ✅ Handles errors (billing, limits, auth)
- ✅ Creates new thread + project if threadId not provided
- ✅ Returns `{ thread_id, agent_run_id, status }`

**Dependencies:**
- ✅ `@/lib/api` - Available via path aliases (Story 13.2)
- ✅ `createClient` from Supabase - Available from Story 13.1
- ⚠️ `API_URL` environment variable - Need to configure (Story 13.2)

**Usage Example:**
```typescript
// extension/src/sidepanel/hooks/useCreateAgentChat.ts
import { unifiedAgentStart, BillingError, AgentRunLimitError } from '@/lib/api';

export function useCreateAgentChat() {
  const createChat = async (prompt: string, options?: {...}) => {
    try {
      const result = await unifiedAgentStart({
        prompt,
        model_name: options?.model_name || 'claude-sonnet-4',
        agent_id: options?.agent_id,
      });

      return result;
    } catch (error) {
      if (error instanceof BillingError) {
        // Handle billing error
      } else if (error instanceof AgentRunLimitError) {
        // Handle agent limit error
      } else {
        // Handle other errors
      }
      return null;
    }
  };

  return { createChat };
}
```

**Response Type:**
```typescript
interface UnifiedAgentStartResponse {
  thread_id: string;
  agent_run_id: string;
  status: string;
}
```

**Error Handling:**
```typescript
// Error types
- BillingError: Payment required (402)
- AgentRunLimitError: Agent run limit reached (429)
- NoAccessTokenAvailableError: User not logged in
- Generic Error: Other errors
```

**Test Checklist:**
- [ ] Import works without errors
- [ ] Function calls backend API correctly
- [ ] Returns thread_id và agent_run_id
- [ ] Error handling works (billing, limits, auth)
- [ ] Token included in headers
- [ ] Creates new thread correctly

### Hook Pattern: useInitiateAgentMutation (Reference)

**Source File:**
- **Path:** `frontend/src/hooks/react-query/dashboard/use-initiate-agent.ts`
- **Lines:** `11-68` (hook implementation)
- **Purpose:** Reference for hook pattern (not directly reusable - uses React Query)

**What to Adapt:**
- ⚠️ **Not directly reusable** - Uses React Query mutations
- ✅ **Pattern reference:** Use as reference for error handling patterns
- ✅ **Simplified version:** Create simpler hook without React Query

**Adapted Version:**
```typescript
// extension/src/sidepanel/hooks/useCreateAgentChat.ts
// Simplified version without React Query
export function useCreateAgentChat() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createChat = async (prompt: string, options?: {...}) => {
    setLoading(true);
    setError(null);

    try {
      const result = await unifiedAgentStart({ prompt, ... });
      return result;
    } catch (err) {
      // Handle errors
      setError(err.message);
      return null;
    } finally {
      setLoading(false);
    }
  };

  return { createChat, loading, error };
}
```

### Storage: chrome.storage.local (Thread ID Persistence)

**Source File:**
- **Path:** Extension storage API
- **Pattern:** Chrome extension storage

**What to Implement:**
- ✅ **Store thread ID:** `chrome.storage.local.set({ currentThreadId: thread_id })`
- ✅ **Retrieve thread ID:** `chrome.storage.local.get(['currentThreadId'])`
- ✅ **Clear thread ID:** `chrome.storage.local.remove(['currentThreadId'])`

**Usage Example:**
```typescript
// Store
chrome.storage.local.set({
  currentThreadId: result.thread_id,
  currentAgentRunId: result.agent_run_id,
}, () => {
  console.log('Thread ID stored');
});

// Retrieve
chrome.storage.local.get(['currentThreadId', 'currentAgentRunId'], (result) => {
  if (result.currentThreadId) {
    console.log('Thread ID:', result.currentThreadId);
  }
});
```

### References

- [Source: docs/epics-extension.md#Epic-15] - Epic 15 goal: chat integration
- [Source: docs/epics-extension.md#Story-15.3] - Story acceptance criteria và prerequisites
- [Source: docs/stories/15-1-chat-interface-setup.md#Dev-Agent-Record] - Chat interface ready
- [Source: docs/stories/15-2-coin-context-integration.md#Dev-Agent-Record] - Coin context integration ready
- [Source: docs/stories/13-2-api-client-adaptation.md#Dev-Agent-Record] - API client ready
- [Source: frontend/src/lib/api.ts:695-856] - unifiedAgentStart function
- [Source: frontend/src/hooks/react-query/dashboard/use-initiate-agent.ts:11-68] - useInitiateAgentMutation hook (reference)

### Learnings from Previous Story

**From Story 15.2 (Status: ready-for-dev)**
- **Coin Context**: Coin info pre-filled trong prompt
- **Prompt Format**: Prompt format includes coin context
- **ChatInput**: ChatInput ready với controlled value

**Reuse:**
- Use prompt từ Story 15.2 (already includes coin info)
- Use ChatInput từ Story 15.1
- Use API client từ Story 13.2

[Source: docs/stories/15-2-coin-context-integration.md#Dev-Agent-Record]

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

