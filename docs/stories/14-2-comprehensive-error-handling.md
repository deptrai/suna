# Story 14.2: Comprehensive Error Handling

Status: ready-for-dev

## Story

As a user,  
I want clear error messages khi things go wrong,  
So that I understand what happened và how to fix it.

## Acceptance Criteria

1. Error handling matches frontend patterns (reuse error handler)
2. Network errors display user-friendly messages
3. Authentication errors prompt re-login
4. API errors show specific error details
5. Content script errors logged but don't break page
6. Error recovery suggestions provided

## Tasks / Subtasks

- [ ] Task 1: Reuse frontend error handler (AC: 1)
  - [ ] Import error handler từ `@/lib/error-handler`
  - [ ] Or adapt error handler for extension
  - [ ] Use error handler trong API calls
  - [ ] Test error handler works
  - [ ] Verify error handling matches frontend

- [ ] Task 2: Handle network errors (AC: 2)
  - [ ] Detect network errors (timeout, connection failed)
  - [ ] Display user-friendly error message
  - [ ] Suggest checking internet connection
  - [ ] Provide retry option
  - [ ] Test network error handling

- [ ] Task 3: Handle authentication errors (AC: 3)
  - [ ] Detect 401/403 errors
  - [ ] Prompt user to re-login
  - [ ] Redirect to login UI
  - [ ] Clear invalid auth state
  - [ ] Test authentication error handling

- [ ] Task 4: Display API error details (AC: 4)
  - [ ] Extract error details from API response
  - [ ] Display specific error message
  - [ ] Show error code if available
  - [ ] Format error message clearly
  - [ ] Test API error display

- [ ] Task 5: Handle content script errors (AC: 5)
  - [ ] Wrap content script code in try-catch
  - [ ] Log errors to console
  - [ ] Don't break page functionality
  - [ ] Handle errors gracefully
  - [ ] Test content script error handling

- [ ] Task 6: Provide error recovery (AC: 6)
  - [ ] Add retry buttons for recoverable errors
  - [ ] Add "Go to Login" for auth errors
  - [ ] Add "Refresh" for network errors
  - [ ] Provide helpful error messages
  - [ ] Test error recovery options

- [ ] Testing (AC: 1, 2, 3, 4, 5, 6)
  - [ ] Test error handler works
  - [ ] Test network error handling
  - [ ] Test authentication error handling
  - [ ] Test API error display
  - [ ] Test content script error handling
  - [ ] Test error recovery options

## Dev Notes

### Architecture Patterns and Constraints

**Error Handling Strategy:**
- Reuse frontend error handler patterns
- Display user-friendly error messages
- Provide error recovery options
- Log errors for debugging
- Don't break user experience

**Error Types:**
- Network errors: Connection issues, timeouts
- Authentication errors: 401, 403, expired tokens
- API errors: 400, 500, validation errors
- Content script errors: DOM errors, injection failures

**Error Recovery:**
- Retry for transient errors
- Re-login for auth errors
- Refresh for network errors
- Clear state for fatal errors

### Project Structure Notes

**Error Handler:**
- Import từ `@/lib/error-handler` (if available)
- Or create extension-specific error handler
- Use throughout extension (popup, content script, background)

**Error Display:**
- Show errors in popup UI
- Use error components (Alert, Toast, etc.)
- Provide actionable error messages

### References

- [Source: docs/epics-extension.md#Epic-14] - Epic 14 goal: comprehensive error handling
- [Source: docs/epics-extension.md#Story-14.2] - Story acceptance criteria và prerequisites
- [Source: docs/stories/13-4-background-worker-api-coordination.md#Dev-Agent-Record] - API calls ready
- [Source: frontend/src/lib/error-handler.ts] - Reference for error handling patterns

### Learnings from Previous Story

**From Story 14.1 (Status: ready-for-dev)**

- **Report Generation**: Report generation API integration implemented
- **Error Handling Started**: Basic error handling for report generation
- **API Integration**: API calls work với error handling
- **User Experience**: Error messages displayed to user

**Reuse:**
- Extend error handling to all extension features
- Use error patterns from report generation
- Provide comprehensive error coverage

[Source: docs/stories/14-1-report-generation-integration.md#Dev-Agent-Record]

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

