# Story 13.2: API Client Adaptation

Status: ready-for-dev

## Story

As a developer,  
I want reuse API client từ frontend với extension-specific auth,  
So that API calls work correctly.

## Acceptance Criteria

1. API client logic extracted hoặc imported từ frontend
2. Auth token retrieved từ chrome.storage
3. API calls include JWT token in headers
4. Error handling matches frontend patterns
5. API client tested với coin analysis endpoint
6. CORS handling works (hoặc background worker proxy)

## Tasks / Subtasks

- [ ] Task 1: Extract/import API client (AC: 1)
  - [ ] **Source file:** `frontend/src/lib/api.ts`
  - [ ] **Function to import:** `unifiedAgentStart` (lines `695-856`)
  - [ ] **Export:** `export const unifiedAgentStart = async (options: {...}): Promise<{...}> => {...}`
  - [ ] **Import statement:**
    ```typescript
    import { unifiedAgentStart, UnifiedAgentStartResponse, BillingError, AgentRunLimitError, NoAccessTokenAvailableError } from '@/lib/api';
    ```
  - [ ] **Dependencies check:**
    - ✅ `@/lib/api` - Available via path aliases
    - ✅ `createClient` from Supabase - Available from Story 13.1
    - ⚠️ `API_URL` environment variable - Need to configure
  - [ ] **Create API client wrapper:**
    ```typescript
    // extension/src/shared/api-extension.ts
    import { unifiedAgentStart, UnifiedAgentStartResponse } from '@/lib/api';
    import { createClient } from '@/lib/supabase/client'; // From Story 13.1

    export async function createAgentChat(options: {
      prompt: string;
      coinInfo?: { name: string; symbol: string; price?: number };
      model_name?: string;
      agent_id?: string;
    }): Promise<UnifiedAgentStartResponse> {
      // Format prompt với coin info
      let fullPrompt = options.prompt;
      if (options.coinInfo) {
        fullPrompt = `Analyze ${options.coinInfo.name} (${options.coinInfo.symbol})${options.coinInfo.price ? ` - Current price: $${options.coinInfo.price}` : ''}\n\n${options.prompt}`;
      }

      // Call unifiedAgentStart
      return await unifiedAgentStart({
        prompt: fullPrompt,
        model_name: options.model_name,
        agent_id: options.agent_id,
      });
    }
    ```
  - [ ] Test import resolves correctly (no build errors)
  - [ ] Test API client functions work
  - [ ] Verify API client can make calls

- [ ] Task 2: Implement auth token retrieval (AC: 2)
  - [ ] **Source:** `frontend/src/lib/api.ts:703-710` (session retrieval pattern)
  - [ ] **Supabase client:** Use từ Story 13.1 (`extension/src/shared/supabase-extension.ts`)
  - [ ] **Create token retrieval function:**
    ```typescript
    // extension/src/shared/api-extension.ts
    import { createClient } from '@/lib/supabase/client'; // From Story 13.1

    export async function getAuthToken(): Promise<string | null> {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.access_token) {
        return null; // User not logged in
      }
      
      return session.access_token;
    }
    ```
  - [ ] **Note:** `unifiedAgentStart` already handles token retrieval internally (line `703-710` in `api.ts`)
  - [ ] **Adaptation:** Ensure Supabase client from Story 13.1 works correctly
  - [ ] Test token retrieval works
  - [ ] Test handles missing token (user not logged in)

- [ ] Task 3: Add JWT token to headers (AC: 3)
  - [ ] **Source:** `frontend/src/lib/api.ts:744-751` (Authorization header pattern)
  - [ ] **Note:** `unifiedAgentStart` already includes Authorization header (line `747`):
    ```typescript
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    }
    ```
  - [ ] **No modification needed** - `unifiedAgentStart` handles this internally
  - [ ] **Verification:** Ensure Supabase client provides valid token
  - [ ] Test headers include token (verify in network tab)
  - [ ] Test token refresh works (handled by Supabase client)

- [ ] Task 4: Implement error handling (AC: 4)
  - [ ] **Source:** `frontend/src/lib/api.ts:753-856` (error handling pattern)
  - [ ] **Error classes to import:**
    ```typescript
    import { BillingError, AgentRunLimitError, NoAccessTokenAvailableError } from '@/lib/api';
    ```
  - [ ] **Error handling:** `unifiedAgentStart` already handles errors (lines `753-856`):
    - ✅ Billing errors (402)
    - ✅ Agent run limit errors (429)
    - ✅ Authentication errors (401, 403)
    - ✅ Network errors
  - [ ] **Error handler:** Import từ frontend (optional):
    ```typescript
    import { handleApiError } from '@/lib/error-handler';
    ```
  - [ ] **Usage:** Errors are thrown as exceptions, catch và handle:
    ```typescript
    try {
      const result = await unifiedAgentStart({ prompt, ... });
    } catch (error) {
      if (error instanceof BillingError) {
        // Handle billing error
      } else if (error instanceof AgentRunLimitError) {
        // Handle agent limit error
      } else {
        // Handle other errors
        handleApiError(error, { operation: 'create agent chat' });
      }
    }
    ```
  - [ ] Test error handling works
  - [ ] Test all error types are handled correctly

- [ ] Task 5: Test với agent creation endpoint (AC: 5)
  - [ ] **Endpoint:** `/agent/start` (POST) - used by `unifiedAgentStart`
  - [ ] **Source:** `frontend/src/lib/api.ts:744` (API endpoint)
  - [ ] **Test API call:**
    ```typescript
    // Test creating agent chat với coin info
    const result = await unifiedAgentStart({
      prompt: "Analyze Bitcoin (BTC) - Current price: $103,571",
      model_name: 'claude-sonnet-4',
    });

    // Verify response
    console.log('Thread ID:', result.thread_id);
    console.log('Agent Run ID:', result.agent_run_id);
    console.log('Status:', result.status);
    ```
  - [ ] **Expected response:**
    ```typescript
    {
      thread_id: string;
      agent_run_id: string;
      status: string;
    }
    ```
  - [ ] Test với coin name parameter
  - [ ] Verify response is correct
  - [ ] Test error cases (billing, limit, auth)
  - [ ] Verify API integration works

- [ ] Task 6: Handle CORS (AC: 6)
  - [ ] Test CORS với direct API calls từ popup
  - [ ] If CORS issues, use background worker as proxy
  - [ ] Implement background worker proxy if needed
  - [ ] Test CORS handling works
  - [ ] Document CORS solution

- [ ] Testing (AC: 1, 2, 3, 4, 5, 6)
  - [ ] Test API client works correctly
  - [ ] Test auth token retrieval
  - [ ] Test JWT token in headers
  - [ ] Test error handling
  - [ ] Test coin analysis endpoint
  - [ ] Test CORS handling

## Dev Notes

### Architecture Patterns and Constraints

**API Client Reuse:**
- Import API client logic từ frontend
- Or extract và adapt for extension
- Maintain same API interface
- Ensure compatibility

**Authentication:**
- Get auth token từ chrome.storage (via Supabase client)
- Include token in Authorization header
- Handle token refresh automatically
- Handle missing token (prompt login)

**CORS Handling:**
- Extension popup may have CORS restrictions
- Use background worker as proxy if needed
- Or configure CORS on backend
- Test CORS works correctly

### Project Structure Notes

**API Client Location:**
- Import từ `@/lib/api` (if path aliases work)
- Or create `extension/src/shared/api-extension.ts`
- Adapt for extension-specific auth

**Token Management:**
- Use Supabase client từ Story 13.1
- Get session và extract token
- Store token reference for API calls

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

**What to Copy/Reuse:**
- ✅ **Full function** (no modifications needed)
- ✅ **Types:** `UnifiedAgentStartResponse` (imported từ same file)
- ✅ **Error classes:** `BillingError`, `AgentRunLimitError`, `NoAccessTokenAvailableError` (imported từ same file)

**Key Features:**
- ✅ Handles authentication internally (gets token from Supabase session)
- ✅ Includes Authorization header automatically
- ✅ Handles errors (billing, limits, auth)
- ✅ Supports file uploads
- ✅ Creates new thread + project if threadId not provided

**Dependencies:**
- ✅ `@/lib/api` - Available via path aliases
- ✅ `createClient` from Supabase - Available from Story 13.1
- ⚠️ `API_URL` environment variable - Need to configure

**Usage Example:**
```typescript
// extension/src/sidepanel/hooks/useCreateAgentChat.ts
import { unifiedAgentStart, BillingError, AgentRunLimitError } from '@/lib/api';

export function useCreateAgentChat() {
  const createChat = async (
    prompt: string,
    coinInfo?: { name: string; symbol: string; price?: number },
    model_name?: string
  ) => {
    try {
      // Format prompt với coin info
      let fullPrompt = prompt;
      if (coinInfo) {
        fullPrompt = `Analyze ${coinInfo.name} (${coinInfo.symbol})${coinInfo.price ? ` - Current price: $${coinInfo.price}` : ''}\n\n${prompt}`;
      }

      // Call unifiedAgentStart
      const result = await unifiedAgentStart({
        prompt: fullPrompt,
        model_name: model_name || 'claude-sonnet-4',
      });

      return result.thread_id;
    } catch (error) {
      if (error instanceof BillingError) {
        // Handle billing error
        throw error;
      } else if (error instanceof AgentRunLimitError) {
        // Handle agent limit error
        throw error;
      } else {
        // Handle other errors
        throw error;
      }
    }
  };

  return { createChat };
}
```

**Test Checklist:**
- [ ] Import works without errors
- [ ] Function calls backend API correctly
- [ ] Returns thread_id
- [ ] Error handling works (billing, limits, auth)
- [ ] Token included in headers
- [ ] Coin info formatted correctly trong prompt

### Error Handling: Error Classes

**Source File:**
- **Path:** `frontend/src/lib/api.ts`
- **Lines:** Check for error class definitions
- **Exports:** `BillingError`, `AgentRunLimitError`, `NoAccessTokenAvailableError`

**Import Statement:**
```typescript
import { BillingError, AgentRunLimitError, NoAccessTokenAvailableError } from '@/lib/api';
```

**What to Reuse:**
- ✅ **Error classes** (no modifications needed)
- ✅ **Error handling patterns** (catch và handle specific error types)

**Usage Example:**
```typescript
try {
  const result = await unifiedAgentStart({ prompt, ... });
} catch (error) {
  if (error instanceof BillingError) {
    // Show billing error message
    console.error('Billing error:', error);
  } else if (error instanceof AgentRunLimitError) {
    // Show agent limit error
    console.error('Agent limit error:', error);
  } else {
    // Handle other errors
    console.error('Error:', error);
  }
}
```

### References

- [Source: docs/architecture-extension-chainlens.md#API-Integration] - API integration patterns
- [Source: docs/epics-extension.md#Epic-13] - Epic 13 goal: API integration với authentication
- [Source: docs/epics-extension.md#Story-13.2] - Story acceptance criteria và prerequisites
- [Source: docs/stories/13-1-chrome-storage-adapter-for-supabase.md#Dev-Agent-Record] - Supabase client với storage adapter
- [Source: frontend/src/lib/api.ts:695-856] - unifiedAgentStart function
- [Source: frontend/src/lib/api.ts:753-856] - Error handling pattern
- [Source: frontend/src/lib/error-handler.ts] - Reference for error handling

### Learnings from Previous Story

**From Story 13.1 (Status: ready-for-dev)**

- **Supabase Client Created**: Supabase client với chrome.storage adapter created
- **Storage Adapter**: Storage adapter implements getItem, setItem, removeItem
- **Authentication Ready**: Authentication state persists, token refresh works
- **Client Available**: Supabase client can be used trong extension

**Reuse:**
- Use Supabase client từ Story 13.1
- Get auth token from Supabase session
- Use client to manage authentication state

[Source: docs/stories/13-1-chrome-storage-adapter-for-supabase.md#Dev-Agent-Record]

## Dev Agent Record

### Context Reference

<!-- Path(s) to story context XML will be added here by context workflow -->

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List

## Change Log

- 2025-11-08: Story created from epics-extension.md

