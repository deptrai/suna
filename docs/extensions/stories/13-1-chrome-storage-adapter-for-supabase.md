# Story 13.1: Chrome Storage Adapter for Supabase

Status: ready-for-dev

## Story

As a developer,  
I want Supabase client với chrome.storage adapter,  
So that authentication works trong extension environment.

## Acceptance Criteria

1. `supabase-extension.ts` created với custom storage adapter
2. Storage adapter uses `chrome.storage.local` thay vì localStorage
3. Adapter implements: `getItem`, `setItem`, `removeItem`
4. Supabase client initialized với storage adapter
5. Authentication state persists across extension restarts
6. Token refresh works automatically

## Tasks / Subtasks

- [ ] Task 1: Create supabase-extension.ts (AC: 1)
  - [ ] Create `extension/src/shared/supabase-extension.ts`
  - [ ] Import Supabase client creation function
  - [ ] Define custom storage adapter interface
  - [ ] Export Supabase client creation function
  - [ ] Add JSDoc comments

- [ ] Task 2: Implement storage adapter (AC: 2, 3)
  - [ ] Create storage adapter object
  - [ ] Implement `getItem(key: string): Promise<string | null>`
  - [ ] Implement `setItem(key: string, value: string): Promise<void>`
  - [ ] Implement `removeItem(key: string): Promise<void>`
  - [ ] Use `chrome.storage.local` API
  - [ ] Handle async operations correctly
  - [ ] Test adapter methods work

- [ ] Task 3: Initialize Supabase client (AC: 4)
  - [ ] Import Supabase client creation từ frontend hoặc create locally
  - [ ] Initialize Supabase client với storage adapter
  - [ ] Configure Supabase URL và anon key
  - [ ] Test client initialization works
  - [ ] Verify client can be used

- [ ] Task 4: Test authentication persistence (AC: 5)
  - [ ] Test auth state persists after extension restart
  - [ ] Test auth state persists after browser restart
  - [ ] Verify tokens stored in chrome.storage.local
  - [ ] Test auth state loads correctly on startup
  - [ ] Verify persistence works correctly

- [ ] Task 5: Test token refresh (AC: 6)
  - [ ] Test token refresh works automatically
  - [ ] Test refresh token stored correctly
  - [ ] Test new tokens saved after refresh
  - [ ] Test refresh happens before token expires
  - [ ] Verify refresh works correctly

- [ ] Testing (AC: 1, 2, 3, 4, 5, 6)
  - [ ] Test storage adapter methods
  - [ ] Test Supabase client initialization
  - [ ] Test authentication persistence
  - [ ] Test token refresh
  - [ ] Test end-to-end authentication flow

## Dev Notes

### Architecture Patterns and Constraints

**Storage Adapter Pattern:**
- Supabase requires storage adapter interface
- Adapter must implement: getItem, setItem, removeItem
- Use chrome.storage.local thay vì localStorage
- Handle async operations (chrome.storage is async)

**Supabase Client:**
- Initialize với custom storage adapter
- Use same Supabase URL và anon key as frontend
- Client should work như frontend client
- Authentication should work seamlessly

**Token Management:**
- Tokens stored in chrome.storage.local
- Tokens persist across extension/browser restarts
- Token refresh should work automatically
- Handle token expiration correctly

### Project Structure Notes

**Module Location:**
- `extension/src/shared/supabase-extension.ts` - Shared module
- Can be used by popup và background worker
- Export Supabase client creation function

**Storage Keys:**
- Use same keys as frontend (if possible)
- Or use extension-specific keys
- Document key names

### References

- [Source: docs/architecture-extension-chainlens.md#Security-Architecture] - Authentication flow với chrome.storage
- [Source: docs/epics-extension.md#Epic-13] - Epic 13 goal: authentication với chrome.storage adapter
- [Source: docs/epics-extension.md#Story-13.1] - Story acceptance criteria và prerequisites
- [Source: docs/stories/10-3-build-configuration-shared-code-setup.md#Dev-Agent-Record] - Build config enables imports
- [Source: frontend/src/lib/supabase/client.ts] - Reference for Supabase client setup

### Learnings from Previous Story

**From Story 10.3 (Status: ready-for-dev)**

- **Build Configuration**: Build tool configured với path aliases
- **Path Aliases**: Can import từ frontend using `@/*` aliases
- **TypeScript Setup**: TypeScript compilation works correctly
- **Shared Code**: Can import utilities và modules từ frontend

**Reuse:**
- Can reference frontend Supabase client setup
- Use same Supabase configuration
- Adapt storage to use chrome.storage.local

[Source: docs/stories/10-3-build-configuration-shared-code-setup.md#Dev-Agent-Record]

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

