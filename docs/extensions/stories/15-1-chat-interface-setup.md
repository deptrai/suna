# Story 15.1: Chat Interface Setup

Status: ready-for-dev

## Story

As a user,  
I want chat interface trong side panel,  
So that I can interact với AI agent về coin analysis.

## Acceptance Criteria

1. Side panel chat layout created với header, message area, và input area
2. ChatInput component imported và reused từ frontend
3. Message display area ready for messages
4. Layout responsive với side panel width (400-600px)
5. Chat interface matches main app design

## Tasks / Subtasks

- [ ] Task 1: Create side panel chat layout (AC: 1)
  - [ ] **Create file:** `extension/src/sidepanel/components/ChatInterface.tsx`
  - [ ] **Layout structure:**
    ```typescript
    // extension/src/sidepanel/components/ChatInterface.tsx
    import React from 'react';

    export function ChatInterface() {
      return (
        <div className="flex flex-col h-screen">
          {/* Header */}
          <header className="flex items-center justify-between p-4 border-b">
            <h1 className="text-lg font-bold">ChainLens Coin Analysis</h1>
            <button onClick={handleClose}>✕</button>
          </header>

          {/* Message Area */}
          <main className="flex-1 overflow-y-auto p-4">
            {/* Messages will be displayed here */}
          </main>

          {/* Input Area */}
          <footer className="p-4 border-t">
            {/* ChatInput will be here */}
          </footer>
        </div>
      );
    }
    ```
  - [ ] Test layout renders correctly
  - [ ] Test layout is responsive (400-600px width)
  - [ ] Verify header, message area, footer all display

- [ ] Task 2: Import ChatInput component (AC: 2)
  - [ ] **Source file:** `frontend/src/components/thread/chat-input/chat-input.tsx`
  - [ ] **Lines:** `134-1038` (full component)
  - [ ] **Export:** `export const ChatInput = memo(forwardRef<ChatInputHandles, ChatInputProps>(...))`
  - [ ] **Import statement:**
    ```typescript
    import { ChatInput, ChatInputHandles, ChatInputProps } from '@/components/thread/chat-input/chat-input';
    ```
  - [ ] **Dependencies check:**
    - ✅ `@/components/ui/button` (already available from Story 12.1)
    - ✅ `@/components/ui/textarea` (need to verify)
    - ✅ `@/components/ui/card` (already available from Story 12.1)
    - ✅ `@/hooks/react-query/agents/use-agents` (need to verify)
    - ✅ `@/lib/utils` (already available)
  - [ ] **Create wrapper component:**
    ```typescript
    // extension/src/sidepanel/components/ChatInterface.tsx
    import { ChatInput } from '@/components/thread/chat-input/chat-input';
    import { useRef } from 'react';

    export function ChatInterface() {
      const chatInputRef = useRef<ChatInputHandles>(null);

      const handleSubmit = (message: string, options?: { model_name?: string }) => {
        console.log('Message:', message);
        // Will implement agent creation in Story 15.3
      };

      return (
        <div className="flex flex-col h-screen">
          <header>...</header>
          <main>...</main>
          <footer className="p-4 border-t">
            <ChatInput
              ref={chatInputRef}
              onSubmit={handleSubmit}
              placeholder="Analyze coin..."
              loading={false}
              disabled={false}
              isAgentRunning={false}
              hideAttachments={true} // Simplified for extension
              hideAgentSelection={true} // Simplified for extension
            />
          </footer>
        </div>
      );
    }
    ```
  - [ ] Test import resolves correctly (no build errors)
  - [ ] Test ChatInput renders correctly
  - [ ] Test ChatInput props work as expected
  - [ ] Verify styling applies correctly

- [ ] Task 3: Setup message display area (AC: 3)
  - [ ] **Reference:** `frontend/src/components/thread/content/ThreadContent.tsx`
  - [ ] **Lines:** Check message display implementation
  - [ ] **Create placeholder component:**
    ```typescript
    // extension/src/sidepanel/components/MessageList.tsx
    import React from 'react';

    interface Message {
      id: string;
      role: 'user' | 'assistant';
      content: string;
    }

    interface MessageListProps {
      messages: Message[];
    }

    export function MessageList({ messages }: MessageListProps) {
      return (
        <div className="flex flex-col gap-4">
          {messages.map((message) => (
            <div
              key={message.id}
              className={message.role === 'user' ? 'text-right' : 'text-left'}
            >
              <div
                className={`inline-block p-2 rounded ${
                  message.role === 'user'
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-200 text-black'
                }`}
              >
                {message.content}
              </div>
            </div>
          ))}
        </div>
      );
    }
    ```
  - [ ] **Integrate vào ChatInterface:**
    ```typescript
    import { MessageList } from './MessageList';

    export function ChatInterface() {
      const [messages, setMessages] = useState<Message[]>([]);

      return (
        <div className="flex flex-col h-screen">
          <header>...</header>
          <main className="flex-1 overflow-y-auto p-4">
            <MessageList messages={messages} />
          </main>
          <footer>...</footer>
        </div>
      );
    }
    ```
  - [ ] Test message display area renders correctly
  - [ ] Test scrolling works for long messages
  - [ ] Test message list updates correctly

- [ ] Task 4: Ensure responsive layout (AC: 4)
  - [ ] **Test layout với different widths:**
    - [ ] 400px width (minimum)
    - [ ] 500px width (default)
    - [ ] 600px width (maximum)
  - [ ] **CSS adjustments:**
    ```css
    /* extension/src/sidepanel/sidepanel.css */
    .chat-interface {
      width: 100%;
      min-width: 400px;
      max-width: 600px;
    }

    .message-area {
      width: 100%;
      overflow-y: auto;
    }

    .input-area {
      width: 100%;
    }
    ```
  - [ ] Test layout adapts correctly to panel width
  - [ ] Test no horizontal scrolling
  - [ ] Test all elements visible at different widths

- [ ] Task 5: Match main app design (AC: 5)
  - [ ] **Reference:** `frontend/src/components/thread/ThreadComponent.tsx:60-1119`
  - [ ] **Reference:** `frontend/src/app/(dashboard)/projects/[projectId]/thread/_components/ThreadLayout.tsx:47-217`
  - [ ] **Design elements to match:**
    - [ ] Spacing và padding
    - [ ] Typography (font sizes, weights)
    - [ ] Colors (background, text, borders)
    - [ ] Border radius
    - [ ] Shadow effects
  - [ ] **Use Tailwind classes từ frontend:**
    ```typescript
    // Match frontend styling
    <div className="flex flex-col h-screen bg-background">
      <header className="flex items-center justify-between p-4 border-b border-border">
        <h1 className="text-lg font-semibold text-foreground">ChainLens Coin Analysis</h1>
      </header>
      <main className="flex-1 overflow-y-auto p-4 bg-background">
        {/* Messages */}
      </main>
      <footer className="p-4 border-t border-border bg-background">
        {/* ChatInput */}
      </footer>
    </div>
    ```
  - [ ] Test design matches main app
  - [ ] Test dark mode support (if applicable)
  - [ ] Test consistency với frontend components

- [ ] Testing (AC: 1, 2, 3, 4, 5)
  - [ ] Test side panel chat layout renders correctly
  - [ ] Test ChatInput component imports và renders
  - [ ] Test message display area works
  - [ ] Test responsive layout (400-600px)
  - [ ] Test design matches main app
  - [ ] Test no build errors
  - [ ] Test no runtime errors

## Code Reuse Instructions

### Component: ChatInput

**Source File:**
- **Path:** `frontend/src/components/thread/chat-input/chat-input.tsx`
- **Lines:** `134-1038` (full component)
- **Export:** `export const ChatInput = memo(forwardRef<ChatInputHandles, ChatInputProps>(...))`

**Import Statement:**
```typescript
import { ChatInput, ChatInputHandles, ChatInputProps } from '@/components/thread/chat-input/chat-input';
```

**What to Copy/Reuse:**
- ✅ **Full component** (no modifications needed)
- ✅ **Types:** `ChatInputProps`, `ChatInputHandles` (imported từ same file)
- ✅ **Dependencies:** All dependencies should be available via path aliases

**Dependencies Required:**
- `@/components/ui/button` - ✅ Available (Story 12.1)
- `@/components/ui/textarea` - ⚠️ Need to verify availability
- `@/components/ui/card` - ✅ Available (Story 12.1)
- `@/components/ui/tooltip` - ⚠️ Need to verify availability
- `@/components/ui/dropdown-menu` - ⚠️ Need to verify availability
- `@/hooks/react-query/agents/use-agents` - ⚠️ Need to verify availability
- `@/lib/utils` - ✅ Available (Story 10.3)
- `@/lib/stores/agent-selection-store` - ⚠️ Need to verify availability
- `lucide-react` - ✅ Available (package.json)
- `react` - ✅ Available (package.json)

**Adaptations Needed:**
- ⚠️ **Simplified props:** Hide advanced features (attachments, agent selection) for extension
- ⚠️ **Props to set:**
  - `hideAttachments={true}` - Simplify UI
  - `hideAgentSelection={true}` - Simplify UI
  - `enableAdvancedConfig={false}` - Simplify UI

**Usage Example:**
```typescript
// extension/src/sidepanel/components/ChatInterface.tsx
import { ChatInput, ChatInputHandles } from '@/components/thread/chat-input/chat-input';
import { useRef } from 'react';

export function ChatInterface() {
  const chatInputRef = useRef<ChatInputHandles>(null);

  const handleSubmit = (message: string, options?: { model_name?: string }) => {
    console.log('Submit message:', message);
    // Implementation in Story 15.3
  };

  return (
    <div className="flex flex-col h-screen">
      <footer className="p-4 border-t">
        <ChatInput
          ref={chatInputRef}
          onSubmit={handleSubmit}
          placeholder="Analyze coin..."
          loading={false}
          disabled={false}
          isAgentRunning={false}
          hideAttachments={true}
          hideAgentSelection={true}
          enableAdvancedConfig={false}
        />
      </footer>
    </div>
  );
}
```

**Test Checklist:**
- [ ] Import works without errors
- [ ] Component renders correctly
- [ ] All required props work
- [ ] Styling applies correctly
- [ ] Input field works
- [ ] Submit button works
- [ ] No missing dependencies

### Component: ThreadContent (Reference for Message Display)

**Source File:**
- **Path:** `frontend/src/components/thread/content/ThreadContent.tsx`
- **Lines:** Check file for message display implementation
- **Purpose:** Reference for how messages are displayed in frontend

**What to Reuse:**
- ⚠️ **Not directly reusable** - Too complex, need simplified version
- ✅ **Pattern reference:** Use as reference for message display patterns
- ✅ **Styling reference:** Use Tailwind classes từ ThreadContent

**Simplified Version:**
```typescript
// extension/src/sidepanel/components/MessageList.tsx
// Simplified message display for extension
// Full implementation in Story 15.4 (Message Streaming)
```

### Layout: ThreadLayout (Reference)

**Source File:**
- **Path:** `frontend/src/app/(dashboard)/projects/[projectId]/thread/_components/ThreadLayout.tsx`
- **Lines:** `47-217` (layout structure)
- **Purpose:** Reference for side panel layout patterns

**What to Reuse:**
- ✅ **Layout pattern:** Flex column với header, content, footer
- ✅ **Styling patterns:** Tailwind classes, spacing, borders
- ⚠️ **Not directly reusable** - Need simplified version for extension

**Adapted Layout:**
```typescript
// extension/src/sidepanel/components/ChatInterface.tsx
// Simplified layout based on ThreadLayout patterns
<div className="flex flex-col h-screen">
  <header>...</header>
  <main className="flex-1 overflow-y-auto">...</main>
  <footer>...</footer>
</div>
```

## Dev Notes

### Architecture Patterns and Constraints

**Component Import Strategy:**
- Use path aliases (`@/components/thread/chat-input/chat-input`) to import từ frontend
- Path aliases configured in Story 10.1 và 10.3
- Components should import without errors
- Build tool must resolve path aliases correctly

**Component Reuse:**
- Reuse ChatInput component từ frontend
- Simplify props for extension use (hide advanced features)
- Keep core functionality (input, submit, basic styling)

**Layout Structure:**
- Header: Coin info, close button, fixed height
- Message Area: Scrollable, full height (flex: 1)
- Input Area: ChatInput component, fixed height
- Use flexbox layout (100vh height)

**Design Consistency:**
- Match frontend layout patterns
- Use similar spacing, typography, colors
- Reuse shared UI components
- Maintain consistent design language

### Project Structure Notes

**Files to Create:**
- `extension/src/sidepanel/components/ChatInterface.tsx` - Main chat interface component
- `extension/src/sidepanel/components/MessageList.tsx` - Message display component (simplified)
- `extension/src/sidepanel/components/ChatHeader.tsx` - Header component (optional)

**Component Organization:**
- ChatInterface: Main component với layout
- MessageList: Message display (simplified version)
- ChatInput: Reused from frontend (no modifications)

**Side Panel Files:**
- `sidepanel.html` - HTML entry point (from Story 12.2)
- `sidepanel.tsx` - React entry point (from Story 12.2)
- `sidepanel.css` - Side panel specific styles (from Story 12.2)

### References

- [Source: docs/epics-extension.md#Epic-15] - Epic 15 goal: chat integration
- [Source: docs/epics-extension.md#Story-15.1] - Story acceptance criteria và prerequisites
- [Source: docs/stories/12-2-popup-layout-structure.md#Dev-Agent-Record] - Side panel layout ready
- [Source: docs/extensions/reviews-analysis/extension-chat-integration-analysis.md] - Chat integration analysis
- [Source: frontend/src/components/thread/chat-input/chat-input.tsx:134-1038] - ChatInput component
- [Source: frontend/src/components/thread/ThreadComponent.tsx:60-1119] - ThreadComponent reference
- [Source: frontend/src/app/(dashboard)/projects/[projectId]/thread/_components/ThreadLayout.tsx:47-217] - Layout reference

### Learnings from Previous Story

**From Story 12.2 (Status: ready-for-dev)**
- **Side Panel Layout**: Side panel layout structure created
- **Path Aliases**: Path aliases configured và working
- **UI Components**: Button, Card, Dialog components available

**Reuse:**
- Use side panel layout từ Story 12.2
- Use path aliases để import ChatInput
- Use shared UI components from Story 12.1

[Source: docs/stories/12-2-popup-layout-structure.md#Dev-Agent-Record]

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

