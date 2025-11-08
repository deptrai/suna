# Story 15.5: Continue Chatting

Status: ready-for-dev

## Story

As a user,  
I want send additional messages trong same chat,  
So that I can ask follow-up questions về coin.

## Acceptance Criteria

1. User can send additional messages trong same thread
2. Thread ID used để continue conversation
3. New messages appended to message list
4. Streaming works for follow-up messages
5. Message history persists trong chat
6. Chat state persists across extension restarts

## Prerequisites

- Story 12.1: UI Component Library (Button, Card, Dialog)
- Story 12.2: Side Panel Layout & Structure
- Story 13.1: Chrome Storage Adapter for Supabase
- Story 13.2: API Client Adaptation
- Story 13.3: Authentication Flow in Side Panel
- Story 15.1: Chat Interface Setup
- Story 15.2: Coin Context Integration
- Story 15.3: Agent Creation Integration
- Story 15.4: Message Streaming

## Tasks / Subtasks

- [ ] Task 1: Use thread ID để continue conversation (AC: 1, 2)
  - [ ] **Source file:** `frontend/src/lib/api.ts:695-856` (unifiedAgentStart function)
  - [ ] **Key:** `unifiedAgentStart` accepts `threadId` parameter để continue conversation
  - [ ] **Update useCreateAgentChat hook:**
    ```typescript
    // extension/src/sidepanel/hooks/useCreateAgentChat.ts
    export function useCreateAgentChat() {
      const [threadId, setThreadId] = useState<string | null>(null);
      const [agentRunId, setAgentRunId] = useState<string | null>(null);

      const createChat = async (
        prompt: string,
        options?: { model_name?: string; agent_id?: string; threadId?: string }
      ): Promise<UnifiedAgentStartResponse | null> => {
        setLoading(true);
        setError(null);

        try {
          // Use existing threadId if provided, otherwise create new thread
          const result = await unifiedAgentStart({
            prompt,
            threadId: options?.threadId || threadId || undefined,
            model_name: options?.model_name || 'claude-sonnet-4',
            agent_id: options?.agent_id,
          });

          // Update thread ID và agent run ID
          if (result.thread_id) {
            setThreadId(result.thread_id);
          }
          if (result.agent_run_id) {
            setAgentRunId(result.agent_run_id);
          }

          // Store thread ID
          chrome.storage.local.set({
            currentThreadId: result.thread_id,
            currentAgentRunId: result.agent_run_id,
          });

          return result;
        } catch (err) {
          // Error handling...
          return null;
        } finally {
          setLoading(false);
        }
      };

      return { createChat, loading, error, threadId, agentRunId };
    }
    ```
  - [ ] Test thread ID used correctly
  - [ ] Test new thread created if thread ID not provided
  - [ ] Test existing thread used if thread ID provided

- [ ] Task 2: Append new messages to message list (AC: 3)
  - [ ] **Update ChatInterface:**
    ```typescript
    // extension/src/sidepanel/components/ChatInterface.tsx
    export function ChatInterface() {
      const { createChat, threadId, agentRunId } = useCreateAgentChat();
      const [messages, setMessages] = useState<Message[]>([]);

      const handleSubmit = async (
        message: string,
        options?: { model_name?: string; agent_id?: string }
      ) => {
        // Add user message to list immediately
        const userMessage: Message = {
          id: `user-${Date.now()}`,
          role: 'user',
          content: message,
        };
        setMessages((prev) => [...prev, userMessage]);

        // Create agent chat (will use existing threadId if available)
        const result = await createChat(message, {
          ...options,
          threadId: threadId || undefined, // Use existing thread ID
        });

        if (result) {
          // Agent response will be added via streaming (Story 15.4)
          // Streaming will add assistant message when complete
        }
      };

      return (
        <div className="flex flex-col h-screen">
          <header>...</header>
          <main className="flex-1 overflow-y-auto">
            <MessageDisplay messages={messages} />
          </main>
          <footer>...</footer>
        </div>
      );
    }
    ```
  - [ ] Test user messages appended correctly
  - [ ] Test assistant messages appended correctly
  - [ ] Test message list updates correctly

- [ ] Task 3: Streaming works for follow-up messages (AC: 4)
  - [ ] **Update useAgentStream:**
    ```typescript
    // extension/src/sidepanel/hooks/useAgentStream.ts
    export function useAgentStream(
      agentRunId: string | null,
      callbacks: StreamCallbacks
    ) {
      // ... existing code ...

      // Streaming will automatically work when agentRunId updates
      // No changes needed - streaming already handles new agent runs
    }
    ```
  - [ ] **Update ChatInterface để handle streaming:**
    ```typescript
    // extension/src/sidepanel/components/ChatInterface.tsx
    export function ChatInterface() {
      const { createChat, threadId, agentRunId } = useCreateAgentChat();
      const [messages, setMessages] = useState<Message[]>([]);

      const { status, streamContent } = useAgentStream(agentRunId, {
        onMessage: (content: string) => {
          // Stream content updates automatically
        },
        onClose: () => {
          // Add final assistant message when streaming completes
          if (streamContent) {
            const assistantMessage: Message = {
              id: `assistant-${Date.now()}`,
              role: 'assistant',
              content: streamContent,
            };
            setMessages((prev) => [...prev, assistantMessage]);
          }
        },
      });

      const handleSubmit = async (message: string, options?: {...}) => {
        // Add user message
        setMessages((prev) => [...prev, {
          id: `user-${Date.now()}`,
          role: 'user',
          content: message,
        }]);

        // Create agent chat (will trigger new streaming)
        const result = await createChat(message, {
          ...options,
          threadId: threadId || undefined,
        });
      };

      return (
        <div>
          <MessageDisplay
            messages={messages}
            streamContent={streamContent}
            isStreaming={status === 'streaming'}
          />
          {/* ... */}
        </div>
      );
    }
    ```
  - [ ] Test streaming works for follow-up messages
  - [ ] Test streaming starts when new agent run created
  - [ ] Test streaming stops when message complete

- [ ] Task 4: Load message history (AC: 5)
  - [ ] **Store messages trong chrome.storage:**
    ```typescript
    // extension/src/sidepanel/components/ChatInterface.tsx
    useEffect(() => {
      if (threadId && messages.length > 0) {
        chrome.storage.local.get(['threadMessages'], (result) => {
          const threadMessages = result.threadMessages || {};
          threadMessages[threadId] = messages;
          chrome.storage.local.set({ threadMessages });
        });
      }
    }, [threadId, messages]);
    ```
  - [ ] **Load messages on mount:**
    ```typescript
    // extension/src/sidepanel/components/ChatInterface.tsx
    useEffect(() => {
      if (threadId) {
        chrome.storage.local.get(['threadMessages'], (result) => {
          if (result.threadMessages && result.threadMessages[threadId]) {
            setMessages(result.threadMessages[threadId]);
          }
        });
      }
    }, [threadId]);
    ```
  - [ ] Test message history loads correctly
  - [ ] Test messages persist trong storage
  - [ ] Test messages load on thread ID change

- [ ] Task 5: Persist chat state (AC: 6)
  - [ ] **Store chat state:**
    ```typescript
    // extension/src/sidepanel/hooks/useCreateAgentChat.ts
    useEffect(() => {
      // Load thread ID on mount
      chrome.storage.local.get(['currentThreadId', 'currentAgentRunId'], (result) => {
        if (result.currentThreadId) {
          setThreadId(result.currentThreadId);
          setAgentRunId(result.currentAgentRunId);
        }
      });
    }, []);

    useEffect(() => {
      // Store thread ID when it changes
      if (threadId) {
        chrome.storage.local.set({
          currentThreadId: threadId,
          currentAgentRunId: agentRunId,
        });
      }
    }, [threadId, agentRunId]);
    ```
  - [ ] **Store messages:**
    ```typescript
    // extension/src/sidepanel/components/ChatInterface.tsx
    useEffect(() => {
      if (threadId && messages.length > 0) {
        chrome.storage.local.get(['threadMessages'], (result) => {
          const threadMessages = result.threadMessages || {};
          threadMessages[threadId] = messages;
          chrome.storage.local.set({ threadMessages });
        });
      }
    }, [threadId, messages]);
    ```
  - [ ] **Load messages on mount:**
    ```typescript
    // extension/src/sidepanel/components/ChatInterface.tsx
    useEffect(() => {
      if (threadId) {
        chrome.storage.local.get(['threadMessages'], (result) => {
          if (result.threadMessages && result.threadMessages[threadId]) {
            setMessages(result.threadMessages[threadId]);
          }
        });
      }
    }, [threadId]);
    ```
  - [ ] Test chat state persists across extension restarts
  - [ ] Test thread ID persists
  - [ ] Test messages persist

- [ ] Testing (AC: 1, 2, 3, 4, 5, 6)
  - [ ] Test user can send additional messages
  - [ ] Test thread ID used correctly
  - [ ] Test messages appended correctly
  - [ ] Test streaming works for follow-up messages
  - [ ] Test message history loads
  - [ ] Test chat state persists

## Code Reuse Instructions

### API Function: unifiedAgentStart (Continue Conversation)

**Source File:**
- **Path:** `frontend/src/lib/api.ts`
- **Lines:** `695-856` (function definition)
- **Key Parameter:** `threadId?: string` - Use existing thread ID để continue conversation

**Import Statement:**
```typescript
import { unifiedAgentStart, UnifiedAgentStartResponse } from '@/lib/api';
```

**What to Reuse:**
- ✅ **Continue conversation:** Pass `threadId` parameter để use existing thread
- ✅ **Create new thread:** Omit `threadId` parameter để create new thread
- ✅ **Response:** Returns `{ thread_id, agent_run_id, status }`

**Usage Example:**
```typescript
// Continue existing conversation
const result = await unifiedAgentStart({
  prompt: 'Follow-up question about Bitcoin',
  threadId: existingThreadId, // Use existing thread ID
  model_name: 'claude-sonnet-4',
});

// Create new conversation
const result = await unifiedAgentStart({
  prompt: 'New question',
  // No threadId - creates new thread
  model_name: 'claude-sonnet-4',
});
```

**Key Behavior:**
- ✅ If `threadId` provided: Uses existing thread, appends new message
- ✅ If `threadId` not provided: Creates new thread + project
- ✅ Returns same thread ID if continuing conversation
- ✅ Returns new thread ID if creating new conversation

**Test Checklist:**
- [ ] Continue conversation works với threadId
- [ ] New conversation works without threadId
- [ ] Thread ID persists correctly
- [ ] Messages appended to existing thread

### Storage: chrome.storage.local (Message Persistence)

**Source File:**
- **Path:** Extension storage API
- **Pattern:** Chrome extension storage

**What to Implement:**
- ✅ **Store thread ID:** `chrome.storage.local.set({ currentThreadId: thread_id })`
- ✅ **Store messages:** `chrome.storage.local.set({ threadMessages: { [threadId]: messages } })`
- ✅ **Retrieve thread ID:** `chrome.storage.local.get(['currentThreadId'])`
- ✅ **Retrieve messages:** `chrome.storage.local.get(['threadMessages'])`

**Usage Example:**
```typescript
// Store thread ID
chrome.storage.local.set({
  currentThreadId: threadId,
  currentAgentRunId: agentRunId,
});

// Store messages
chrome.storage.local.get(['threadMessages'], (result) => {
  const threadMessages = result.threadMessages || {};
  threadMessages[threadId] = messages;
  chrome.storage.local.set({ threadMessages });
});

// Retrieve thread ID
chrome.storage.local.get(['currentThreadId', 'currentAgentRunId'], (result) => {
  if (result.currentThreadId) {
    setThreadId(result.currentThreadId);
    setAgentRunId(result.currentAgentRunId);
  }
});

// Retrieve messages
chrome.storage.local.get(['threadMessages'], (result) => {
  if (result.threadMessages && result.threadMessages[threadId]) {
    setMessages(result.threadMessages[threadId]);
  }
});
```

### Message Management: State Updates

**Source File:**
- **Path:** React state management
- **Pattern:** useState, useEffect

**What to Implement:**
- ✅ **Add user message:** Immediately add to messages list
- ✅ **Add assistant message:** Add after streaming completes
- ✅ **Update messages:** Use setMessages với spread operator
- ✅ **Load messages:** Load from storage on mount

**Usage Example:**
```typescript
// Add user message
const userMessage: Message = {
  id: `user-${Date.now()}`,
  role: 'user',
  content: message,
};
setMessages((prev) => [...prev, userMessage]);

// Add assistant message (after streaming)
const assistantMessage: Message = {
  id: `assistant-${Date.now()}`,
  role: 'assistant',
  content: streamContent,
};
setMessages((prev) => [...prev, assistantMessage]);

// Load messages on mount
useEffect(() => {
  if (threadId) {
    chrome.storage.local.get(['threadMessages'], (result) => {
      if (result.threadMessages && result.threadMessages[threadId]) {
        setMessages(result.threadMessages[threadId]);
      }
    });
  }
}, [threadId]);
```

### References

- [Source: docs/epics-extension.md#Epic-15] - Epic 15 goal: chat integration
- [Source: docs/epics-extension.md#Story-15.5] - Story acceptance criteria và prerequisites
- [Source: docs/stories/15-3-agent-creation-integration.md#Dev-Agent-Record] - Agent creation ready
- [Source: docs/stories/15-4-message-streaming.md#Dev-Agent-Record] - Message streaming ready
- [Source: frontend/src/lib/api.ts:695-856] - unifiedAgentStart function
- [Source: frontend/src/lib/api.ts:721-722] - threadId parameter

### Learnings from Previous Story

**From Story 15.4 (Status: ready-for-dev)**
- **Message Streaming**: Streaming works correctly
- **Stream Management**: Stream cleanup works correctly
- **Message Display**: Messages display correctly

**Reuse:**
- Use streaming từ Story 15.4 để handle follow-up messages
- Use agentRunId từ Story 15.3 để start streaming
- Use threadId từ Story 15.3 để continue conversation

[Source: docs/stories/15-4-message-streaming.md#Dev-Agent-Record]

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


