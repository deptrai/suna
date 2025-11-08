# Story 15.4: Message Streaming

Status: ready-for-dev

## Story

As a user,  
I want see streaming responses từ AI agent,  
So that I get real-time feedback về coin analysis.

## Acceptance Criteria

1. Agent stream API integrated (streamAgent function)
2. Streaming messages display trong message area
3. Messages update in real-time as they stream
4. Streaming status shows (idle, streaming, completed)
5. Error handling works (connection errors, timeout)
6. Stream cleanup works (on component unmount)

## Prerequisites

- Story 12.1: UI Component Library (Button, Card, Dialog)
- Story 12.2: Side Panel Layout & Structure
- Story 13.1: Chrome Storage Adapter for Supabase
- Story 13.2: API Client Adaptation
- Story 13.3: Authentication Flow in Side Panel
- Story 15.1: Chat Interface Setup
- Story 15.2: Coin Context Integration
- Story 15.3: Agent Creation Integration

## Tasks / Subtasks

- [ ] Task 1: Integrate streamAgent API (AC: 1)
  - [ ] **Source file:** `frontend/src/lib/api.ts:1111-1374` (streamAgent function)
  - [ ] **Import streamAgent:**
    ```typescript
    // extension/src/sidepanel/hooks/useAgentStream.ts
    import { streamAgent } from '@/lib/api';
    import { useEffect, useRef, useState, useCallback } from 'react';

    interface StreamCallbacks {
      onMessage: (content: string) => void;
      onError: (error: Error | string) => void;
      onClose: () => void;
      onStatusChange?: (status: string) => void;
    }

    export function useAgentStream(
      agentRunId: string | null,
      callbacks: StreamCallbacks
    ) {
      const [status, setStatus] = useState<string>('idle');
      const [streamContent, setStreamContent] = useState<string>('');
      const streamCleanupRef = useRef<(() => void) | null>(null);
      const isMountedRef = useRef<boolean>(true);

      useEffect(() => {
        isMountedRef.current = true;
        return () => {
          isMountedRef.current = false;
          if (streamCleanupRef.current) {
            streamCleanupRef.current();
          }
        };
      }, []);

      useEffect(() => {
        if (!agentRunId) {
          setStatus('idle');
          setStreamContent('');
          return;
        }

        // Cleanup previous stream
        if (streamCleanupRef.current) {
          streamCleanupRef.current();
        }

        setStatus('streaming');
        setStreamContent('');

        // Start streaming
        streamCleanupRef.current = streamAgent(agentRunId, {
          onMessage: (content: string) => {
            if (isMountedRef.current) {
              setStreamContent((prev) => prev + content);
              callbacks.onMessage(content);
            }
          },
          onError: (error: Error | string) => {
            if (isMountedRef.current) {
              setStatus('error');
              callbacks.onError(error);
            }
          },
          onClose: () => {
            if (isMountedRef.current) {
              setStatus('completed');
              callbacks.onClose();
            }
          },
        });

        return () => {
          if (streamCleanupRef.current) {
            streamCleanupRef.current();
            streamCleanupRef.current = null;
          }
        };
      }, [agentRunId]);

      return { status, streamContent };
    }
    ```
  - [ ] Test streamAgent API integrated correctly
  - [ ] Test streaming starts when agentRunId available
  - [ ] Test streaming stops when agentRunId changes

- [ ] Task 2: Display streaming messages (AC: 2, 3)
  - [ ] **Source:** `frontend/src/components/thread/content/ThreadContent.tsx:1-1211` (message display)
  - [ ] **Create message display component:**
    ```typescript
    // extension/src/sidepanel/components/MessageDisplay.tsx
    import React from 'react';
    import ReactMarkdown from 'react-markdown';

    interface Message {
      id: string;
      role: 'user' | 'assistant';
      content: string;
      isStreaming?: boolean;
    }

    interface MessageDisplayProps {
      messages: Message[];
      streamContent?: string;
      isStreaming?: boolean;
    }

    export function MessageDisplay({ messages, streamContent, isStreaming }: MessageDisplayProps) {
      return (
        <div className="flex flex-col gap-4 p-4">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${
                message.role === 'user' ? 'justify-end' : 'justify-start'
              }`}
            >
              <div
                className={`max-w-[80%] rounded-lg p-3 ${
                  message.role === 'user'
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-100 text-gray-900'
                }`}
              >
                {message.role === 'assistant' ? (
                  <ReactMarkdown>{message.content}</ReactMarkdown>
                ) : (
                  <p>{message.content}</p>
                )}
              </div>
            </div>
          ))}
          
          {/* Streaming message */}
          {isStreaming && streamContent && (
            <div className="flex justify-start">
              <div className="max-w-[80%] rounded-lg p-3 bg-gray-100 text-gray-900">
                <ReactMarkdown>{streamContent}</ReactMarkdown>
                <span className="animate-pulse">▊</span>
              </div>
            </div>
          )}
        </div>
      );
    }
    ```
  - [ ] **Integrate vào ChatInterface:**
    ```typescript
    // extension/src/sidepanel/components/ChatInterface.tsx
    import { useAgentStream } from '../hooks/useAgentStream';
    import { MessageDisplay } from './MessageDisplay';

    export function ChatInterface() {
      const { agentRunId, threadId } = useCreateAgentChat();
      const [messages, setMessages] = useState<Message[]>([]);
      
      const { status, streamContent } = useAgentStream(agentRunId, {
        onMessage: (content: string) => {
          // Message received - streamContent updates automatically
        },
        onError: (error) => {
          console.error('Stream error:', error);
        },
        onClose: () => {
          // Streaming completed, add final message
          if (streamContent) {
            setMessages((prev) => [
              ...prev,
              {
                id: `msg-${Date.now()}`,
                role: 'assistant',
                content: streamContent,
              },
            ]);
          }
        },
      });

      return (
        <div className="flex flex-col h-screen">
          <header>...</header>
          <main className="flex-1 overflow-y-auto">
            <MessageDisplay
              messages={messages}
              streamContent={streamContent}
              isStreaming={status === 'streaming'}
            />
          </main>
          <footer>...</footer>
        </div>
      );
    }
    ```
  - [ ] Test streaming messages display correctly
  - [ ] Test messages update in real-time
  - [ ] Test markdown rendering works

- [ ] Task 3: Show streaming status (AC: 4)
  - [ ] **Status indicator:**
    ```typescript
    // extension/src/sidepanel/components/StreamingStatus.tsx
    interface StreamingStatusProps {
      status: 'idle' | 'streaming' | 'completed' | 'error';
    }

    export function StreamingStatus({ status }: StreamingStatusProps) {
      if (status === 'idle') return null;

      return (
        <div className="flex items-center gap-2 px-4 py-2 bg-gray-50 border-b">
          {status === 'streaming' && (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-900"></div>
              <span className="text-sm text-gray-600">Streaming response...</span>
            </>
          )}
          {status === 'completed' && (
            <span className="text-sm text-green-600">✓ Response completed</span>
          )}
          {status === 'error' && (
            <span className="text-sm text-red-600">✗ Streaming error</span>
          )}
        </div>
      );
    }
    ```
  - [ ] **Integrate vào ChatInterface:**
    ```typescript
    // extension/src/sidepanel/components/ChatInterface.tsx
    import { StreamingStatus } from './StreamingStatus';

    export function ChatInterface() {
      const { status } = useAgentStream(agentRunId, {...});

      return (
        <div className="flex flex-col h-screen">
          <header>...</header>
          <StreamingStatus status={status} />
          <main>...</main>
          <footer>...</footer>
        </div>
      );
    }
    ```
  - [ ] Test streaming status shows correctly
  - [ ] Test status updates correctly
  - [ ] Test status indicator displays

- [ ] Task 4: Handle errors (AC: 5)
  - [ ] **Error handling trong useAgentStream:**
    ```typescript
    // extension/src/sidepanel/hooks/useAgentStream.ts
    streamAgent(agentRunId, {
      onError: (error: Error | string) => {
        if (isMountedRef.current) {
          setStatus('error');
          setError(error instanceof Error ? error.message : error);
          callbacks.onError(error);
        }
      },
      // ...
    });
    ```
  - [ ] **Display errors:**
    ```typescript
    // extension/src/sidepanel/components/ChatInterface.tsx
    const [streamError, setStreamError] = useState<string | null>(null);

    const { status } = useAgentStream(agentRunId, {
      onError: (error) => {
        setStreamError(error instanceof Error ? error.message : error);
      },
      // ...
    });

    return (
      <div>
        {streamError && (
          <div className="text-red-500 text-sm p-2 bg-red-50 rounded">
            {streamError}
          </div>
        )}
        {/* ... */}
      </div>
    );
    ```
  - [ ] Test connection errors handled correctly
  - [ ] Test timeout errors handled correctly
  - [ ] Test error messages display correctly

- [ ] Task 5: Cleanup stream on unmount (AC: 6)
  - [ ] **Cleanup trong useAgentStream:**
    ```typescript
    // extension/src/sidepanel/hooks/useAgentStream.ts
    useEffect(() => {
      return () => {
        if (streamCleanupRef.current) {
          streamCleanupRef.current();
          streamCleanupRef.current = null;
        }
      };
    }, [agentRunId]);

    useEffect(() => {
      isMountedRef.current = true;
      return () => {
        isMountedRef.current = false;
        if (streamCleanupRef.current) {
          streamCleanupRef.current();
        }
      };
    }, []);
    ```
  - [ ] Test stream cleanup works on unmount
  - [ ] Test stream cleanup works on agentRunId change
  - [ ] Test no memory leaks

- [ ] Testing (AC: 1, 2, 3, 4, 5, 6)
  - [ ] Test streaming API integrated correctly
  - [ ] Test streaming messages display correctly
  - [ ] Test streaming status shows correctly
  - [ ] Test error handling works
  - [ ] Test stream cleanup works
  - [ ] Test real-time updates work

## Code Reuse Instructions

### API Function: streamAgent

**Source File:**
- **Path:** `frontend/src/lib/api.ts`
- **Lines:** `1111-1374` (function definition)
- **Export:** `export const streamAgent = (agentRunId: string, callbacks: {...}): (() => void) => {...}`

**Import Statement:**
```typescript
import { streamAgent } from '@/lib/api';
```

**What to Reuse:**
- ✅ **Full function** (no modifications needed)
- ✅ **EventSource streaming** (handled internally)
- ✅ **Error handling** (handled internally)
- ✅ **Cleanup function** (returns cleanup function)

**Key Features:**
- ✅ Uses EventSource for Server-Sent Events (SSE)
- ✅ Handles authentication (token in URL params)
- ✅ Handles reconnection logic
- ✅ Handles error events
- ✅ Returns cleanup function to close stream

**Dependencies:**
- ✅ `@/lib/api` - Available via path aliases (Story 13.2)
- ✅ `createClient` from Supabase - Available from Story 13.1
- ⚠️ `API_URL` environment variable - Need to configure (Story 13.2)

**Usage Example:**
```typescript
// extension/src/sidepanel/hooks/useAgentStream.ts
import { streamAgent } from '@/lib/api';

const cleanup = streamAgent(agentRunId, {
  onMessage: (content: string) => {
    // Handle streaming message
    console.log('Stream content:', content);
  },
  onError: (error: Error | string) => {
    // Handle error
    console.error('Stream error:', error);
  },
  onClose: () => {
    // Handle stream close
    console.log('Stream closed');
  },
});

// Cleanup when done
cleanup();
```

**Callback Types:**
```typescript
interface StreamCallbacks {
  onMessage: (content: string) => void;
  onError: (error: Error | string) => void;
  onClose: () => void;
  onStatusChange?: (status: string) => void;
}
```

**Stream URL:**
```typescript
// Internal implementation (from api.ts:1224)
const url = new URL(`${API_URL}/agent-run/${agentRunId}/stream`);
url.searchParams.append('token', session.access_token);
const eventSource = new EventSource(url.toString());
```

**Test Checklist:**
- [ ] Import works without errors
- [ ] Function starts streaming correctly
- [ ] onMessage callback receives content
- [ ] onError callback handles errors
- [ ] onClose callback called on completion
- [ ] Cleanup function closes stream
- [ ] Token included in URL params

### Hook Pattern: useAgentStream (Reference)

**Source File:**
- **Path:** `frontend/src/hooks/useAgentStream.ts`
- **Lines:** `80-892` (hook implementation)
- **Purpose:** Reference for hook pattern (complex, need simplified version)

**What to Adapt:**
- ⚠️ **Not directly reusable** - Too complex, uses React Query, context usage
- ✅ **Pattern reference:** Use as reference for streaming patterns
- ✅ **Simplified version:** Create simpler hook for extension

**Key Patterns to Reuse:**
- ✅ **Stream management:** Cleanup on unmount, agentRunId changes
- ✅ **State management:** Status, stream content
- ✅ **Error handling:** Error state, error callbacks
- ✅ **Message handling:** Accumulate stream content

### Component: MessageDisplay (Simplified)

**Source File:**
- **Path:** `frontend/src/components/thread/content/ThreadContent.tsx:1-1211` (reference)
- **Purpose:** Reference for message display patterns

**What to Reuse:**
- ⚠️ **Not directly reusable** - Too complex, many dependencies
- ✅ **Pattern reference:** Use as reference for message display
- ✅ **Simplified version:** Create simpler component for extension

**Simplified Implementation:**
```typescript
// extension/src/sidepanel/components/MessageDisplay.tsx
import ReactMarkdown from 'react-markdown';

export function MessageDisplay({ messages, streamContent, isStreaming }: Props) {
  return (
    <div className="flex flex-col gap-4">
      {messages.map((message) => (
        <div key={message.id} className={message.role === 'user' ? 'text-right' : 'text-left'}>
          <div className={message.role === 'user' ? 'bg-blue-500' : 'bg-gray-100'}>
            <ReactMarkdown>{message.content}</ReactMarkdown>
          </div>
        </div>
      ))}
      {isStreaming && streamContent && (
        <div className="text-left">
          <div className="bg-gray-100">
            <ReactMarkdown>{streamContent}</ReactMarkdown>
            <span className="animate-pulse">▊</span>
          </div>
        </div>
      )}
    </div>
  );
}
```

### References

- [Source: docs/epics-extension.md#Epic-15] - Epic 15 goal: chat integration
- [Source: docs/epics-extension.md#Story-15.4] - Story acceptance criteria và prerequisites
- [Source: docs/stories/15-3-agent-creation-integration.md#Dev-Agent-Record] - Agent creation ready
- [Source: frontend/src/lib/api.ts:1111-1374] - streamAgent function
- [Source: frontend/src/hooks/useAgentStream.ts:80-892] - useAgentStream hook (reference)
- [Source: frontend/src/components/thread/content/ThreadContent.tsx:1-1211] - Message display reference

### Learnings from Previous Story

**From Story 15.3 (Status: ready-for-dev)**
- **Agent Creation**: Agent creation returns thread_id và agent_run_id
- **Thread ID**: Thread ID stored để continue chatting
- **Error Handling**: Error handling works correctly

**Reuse:**
- Use agent_run_id từ Story 15.3 để start streaming
- Use thread_id để continue chatting (Story 15.5)
- Use error handling patterns từ Story 15.3

[Source: docs/stories/15-3-agent-creation-integration.md#Dev-Agent-Record]

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


