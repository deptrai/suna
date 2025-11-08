# Story Code Reuse Template - Hướng Dẫn Viết Stories với Code References Rõ Ràng

**Generated:** 2025-01-15  
**Purpose:** Template để đảm bảo stories có code references rõ ràng, file paths, line numbers, và code snippets cụ thể

---

## 📋 Template Format

### 1. Code Reuse Section (Required)

Mỗi story cần có section **"Code Reuse Instructions"** với format sau:

```markdown
## Code Reuse Instructions

### Component/Function: [Name]

**Source File:**
- **Path:** `frontend/src/components/thread/chat-input/chat-input.tsx`
- **Lines:** `134-1038` (full component)
- **Export:** `export const ChatInput = memo(forwardRef<ChatInputHandles, ChatInputProps>(...))`

**Import Statement:**
```typescript
import { ChatInput } from '@/components/thread/chat-input/chat-input';
```

**What to Copy/Reuse:**
- ✅ **Full component** (no modifications needed)
- ✅ **Types:** `ChatInputProps`, `ChatInputHandles` (imported từ same file)
- ✅ **Dependencies:** All dependencies already in package.json

**Adaptations Needed:**
- ⚠️ **None** - Component works as-is trong side panel

**Usage Example:**
```typescript
// extension/src/sidepanel/components/ChatInterface.tsx
import { ChatInput } from '@/components/thread/chat-input/chat-input';

export function ChatInterface() {
  const handleSubmit = (message: string, options?: { model_name?: string }) => {
    // Handle message submission
  };

  return (
    <ChatInput
      onSubmit={handleSubmit}
      placeholder="Analyze coin..."
      loading={false}
    />
  );
}
```

**Test:**
- [ ] Import works without errors
- [ ] Component renders correctly
- [ ] All props work as expected
- [ ] Styling applies correctly
```

### 2. API Function Reuse

```markdown
### API Function: unifiedAgentStart

**Source File:**
- **Path:** `frontend/src/lib/api.ts`
- **Lines:** `695-856` (function definition)
- **Export:** `export const unifiedAgentStart = async (options: {...}): Promise<{...}> => {...}`

**Import Statement:**
```typescript
import { unifiedAgentStart } from '@/lib/api';
```

**What to Copy/Reuse:**
- ✅ **Full function** (no modifications needed)
- ✅ **Types:** `UnifiedAgentStartResponse` (imported từ same file)
- ✅ **Error classes:** `BillingError`, `AgentRunLimitError` (imported từ same file)

**Adaptations Needed:**
- ⚠️ **None** - Function works as-is, chỉ cần ensure auth token từ chrome.storage

**Usage Example:**
```typescript
// extension/src/sidepanel/hooks/useCreateAgentChat.ts
import { unifiedAgentStart } from '@/lib/api';

export function useCreateAgentChat() {
  const createChat = async (prompt: string, coinInfo?: CoinInfo) => {
    const fullPrompt = coinInfo 
      ? `Analyze ${coinInfo.name} (${coinInfo.symbol}) - Current price: $${coinInfo.price}\n\n${prompt}`
      : prompt;

    const result = await unifiedAgentStart({
      prompt: fullPrompt,
      model_name: 'claude-sonnet-4',
    });

    return result.thread_id;
  };

  return { createChat };
}
```

**Dependencies:**
- Requires: `@/lib/api` (already available via path aliases)
- Requires: Auth token từ chrome.storage (via Supabase client from Story 13.1)

**Test:**
- [ ] Import works without errors
- [ ] Function calls backend API correctly
- [ ] Returns thread_id
- [ ] Error handling works
```

### 3. Hook Reuse

```markdown
### React Query Hook: useInitiateAgentMutation

**Source File:**
- **Path:** `frontend/src/hooks/react-query/dashboard/use-initiate-agent.ts`
- **Lines:** `11-45` (hook definition)
- **Export:** `export const useInitiateAgentMutation = createMutationHook<...>(...)`

**Import Statement:**
```typescript
import { useInitiateAgentMutation } from '@/hooks/react-query/dashboard/use-initiate-agent';
```

**What to Copy/Reuse:**
- ✅ **Full hook** (no modifications needed)
- ✅ **Dependencies:** `unifiedAgentStart`, `createMutationHook` (all available)

**Adaptations Needed:**
- ⚠️ **None** - Hook works as-is

**Usage Example:**
```typescript
// extension/src/sidepanel/components/ChatInterface.tsx
import { useInitiateAgentMutation } from '@/hooks/react-query/dashboard/use-initiate-agent';

export function ChatInterface() {
  const initiateAgentMutation = useInitiateAgentMutation();

  const handleSubmit = async (message: string) => {
    const formData = new FormData();
    formData.append('prompt', message);
    
    const result = await initiateAgentMutation.mutateAsync(formData);
    // Handle result
  };

  return <ChatInput onSubmit={handleSubmit} />;
}
```

**Dependencies:**
- Requires: `@/hooks/react-query/dashboard/use-initiate-agent`
- Requires: `@/lib/api` (unifiedAgentStart)
- Requires: React Query setup (from Story 12.4)

**Test:**
- [ ] Import works without errors
- [ ] Hook works correctly
- [ ] Mutations execute successfully
- [ ] Error handling works
```

---

## 📝 Story Section Format

### Task với Code References

```markdown
- [ ] Task 1: Import ChatInput component (AC: 1)
  - [ ] **Import từ:** `frontend/src/components/thread/chat-input/chat-input.tsx:134-1038`
  - [ ] **Import statement:** `import { ChatInput } from '@/components/thread/chat-input/chat-input';`
  - [ ] **File to create:** `extension/src/sidepanel/components/ChatInterface.tsx`
  - [ ] **Code snippet:**
    ```typescript
    // extension/src/sidepanel/components/ChatInterface.tsx
    import { ChatInput } from '@/components/thread/chat-input/chat-input';
    
    export function ChatInterface() {
      return (
        <ChatInput
          onSubmit={(message) => console.log(message)}
          placeholder="Analyze coin..."
        />
      );
    }
    ```
  - [ ] Test import resolves correctly (no build errors)
  - [ ] Test component renders correctly
  - [ ] Test all props work as expected
```

---

## ✅ Checklist cho Story Writers

- [ ] **File Paths:** Có đầy đủ file paths với line numbers?
- [ ] **Code Snippets:** Có code snippets cụ thể cần copy?
- [ ] **Import Statements:** Có exact import statements?
- [ ] **Usage Examples:** Có usage examples rõ ràng?
- [ ] **Dependencies:** Có list dependencies cần thiết?
- [ ] **Adaptations:** Có note về adaptations needed (nếu có)?
- [ ] **Tests:** Có test checklist cho từng component/function?

---

## 📚 Examples từ Existing Stories

### ❌ Bad Example (Not Detailed Enough)

```markdown
- [ ] Task 1: Import ChatInput component
  - [ ] Import ChatInput từ frontend
  - [ ] Test import works
```

### ✅ Good Example (Detailed với Code References)

```markdown
- [ ] Task 1: Import ChatInput component (AC: 1)
  - [ ] **Source:** `frontend/src/components/thread/chat-input/chat-input.tsx:134-1038`
  - [ ] **Import:** `import { ChatInput } from '@/components/thread/chat-input/chat-input';`
  - [ ] **Create:** `extension/src/sidepanel/components/ChatInterface.tsx`
  - [ ] **Code:**
    ```typescript
    import { ChatInput } from '@/components/thread/chat-input/chat-input';
    export function ChatInterface() {
      return <ChatInput onSubmit={handleSubmit} />;
    }
    ```
  - [ ] Test import resolves correctly
  - [ ] Test component renders correctly
```

---

## 🎯 Epic 15 Stories - Recommended Format

Cho Epic 15 (Chat Integration), mỗi story nên có:

1. **Code Reuse Instructions Section** với:
   - File paths + line numbers
   - Import statements
   - Code snippets
   - Usage examples
   - Dependencies list

2. **Tasks với Detailed Code References** như format trên

3. **Implementation Examples** với complete code snippets

---

**Generated by:** Mary (Business Analyst)  
**Date:** 2025-01-15  
**Purpose:** Ensure stories have clear code reuse instructions

