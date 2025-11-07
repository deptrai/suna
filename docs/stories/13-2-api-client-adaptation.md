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
  - [ ] Import API client từ `@/lib/api` hoặc extract logic
  - [ ] Adapt API client for extension use
  - [ ] Ensure API client functions work
  - [ ] Test API client imports correctly
  - [ ] Verify API client can make calls

- [ ] Task 2: Implement auth token retrieval (AC: 2)
  - [ ] Create function to get auth token từ chrome.storage
  - [ ] Use Supabase client từ Story 13.1 to get session
  - [ ] Extract JWT token from session
  - [ ] Handle missing token (user not logged in)
  - [ ] Test token retrieval works

- [ ] Task 3: Add JWT token to headers (AC: 3)
  - [ ] Modify API client to include Authorization header
  - [ ] Format: `Authorization: Bearer <token>`
  - [ ] Get token before each API call
  - [ ] Handle token refresh if needed
  - [ ] Test headers include token

- [ ] Task 4: Implement error handling (AC: 4)
  - [ ] Reuse error handler từ frontend (`@/lib/error-handler`)
  - [ ] Handle authentication errors (401, 403)
  - [ ] Handle network errors
  - [ ] Handle API errors
  - [ ] Test error handling works

- [ ] Task 5: Test với coin analysis endpoint (AC: 5)
  - [ ] Test API call to `/api/analyze` endpoint
  - [ ] Test với coin name parameter
  - [ ] Verify response is correct
  - [ ] Test error cases
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

### References

- [Source: docs/architecture-extension-suna.md#API-Integration] - API integration patterns
- [Source: docs/epics-extension.md#Epic-13] - Epic 13 goal: API integration với authentication
- [Source: docs/epics-extension.md#Story-13.2] - Story acceptance criteria và prerequisites
- [Source: docs/stories/13-1-chrome-storage-adapter-for-supabase.md#Dev-Agent-Record] - Supabase client với storage adapter
- [Source: frontend/src/lib/api.ts] - Reference for API client implementation
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

