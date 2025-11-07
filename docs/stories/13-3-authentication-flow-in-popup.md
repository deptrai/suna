# Story 13.3: Authentication Flow in Popup

Status: ready-for-dev

## Story

As a user,  
I want login trong extension popup,  
So that I can access authenticated features.

## Acceptance Criteria

1. Login UI trong popup (reuse frontend auth components)
2. Login form submits credentials
3. Auth token stored in chrome.storage after login
4. Popup shows logged-in state
5. Logout functionality works
6. Auth state persists across browser sessions

## Tasks / Subtasks

- [ ] Task 1: Create login UI (AC: 1)
  - [ ] Import auth components từ frontend hoặc create locally
  - [ ] Create login form component
  - [ ] Add email và password fields
  - [ ] Add submit button
  - [ ] Style login form
  - [ ] Test login UI displays correctly

- [ ] Task 2: Implement login form submission (AC: 2)
  - [ ] Add form submit handler
  - [ ] Get credentials from form
  - [ ] Call Supabase signIn function
  - [ ] Handle login errors
  - [ ] Test login submission works

- [ ] Task 3: Store auth token (AC: 3)
  - [ ] After successful login, get session từ Supabase
  - [ ] Session automatically stored via chrome.storage adapter (Story 13.1)
  - [ ] Verify token stored correctly
  - [ ] Test token persistence
  - [ ] Verify storage works

- [ ] Task 4: Show logged-in state (AC: 4)
  - [ ] Check auth state on popup open
  - [ ] Display user info if logged in
  - [ ] Hide login form if logged in
  - [ ] Show authenticated UI
  - [ ] Test logged-in state displays

- [ ] Task 5: Implement logout (AC: 5)
  - [ ] Add logout button
  - [ ] Call Supabase signOut function
  - [ ] Clear auth state
  - [ ] Show login form after logout
  - [ ] Test logout works

- [ ] Task 6: Test auth persistence (AC: 6)
  - [ ] Test auth state persists after popup close
  - [ ] Test auth state persists after browser restart
  - [ ] Test auth state loads on popup open
  - [ ] Verify persistence works correctly
  - [ ] Test across browser sessions

- [ ] Testing (AC: 1, 2, 3, 4, 5, 6)
  - [ ] Test login UI displays
  - [ ] Test login form submission
  - [ ] Test auth token storage
  - [ ] Test logged-in state
  - [ ] Test logout functionality
  - [ ] Test auth persistence

## Dev Notes

### Architecture Patterns and Constraints

**Authentication Flow:**
- User enters credentials in popup
- Submit to Supabase signIn
- Session stored via chrome.storage adapter
- Popup shows logged-in state
- Logout clears session

**UI Components:**
- Reuse frontend auth components if possible
- Or create extension-specific login UI
- Use shared UI components (Button, Input, etc.)
- Match frontend design

**State Management:**
- Use Supabase auth state
- Check auth state on popup open
- Update UI based on auth state
- Handle auth state changes

### Project Structure Notes

**Login Component:**
- Create `extension/src/popup/components/LoginForm.tsx`
- Or import từ frontend if possible
- Use trong popup layout

**Auth State:**
- Use Supabase client từ Story 13.1
- Check `supabase.auth.getSession()` on popup open
- Listen for auth state changes

### References

- [Source: docs/epics-extension.md#Epic-13] - Epic 13 goal: authentication flow
- [Source: docs/epics-extension.md#Story-13.3] - Story acceptance criteria và prerequisites
- [Source: docs/stories/13-1-chrome-storage-adapter-for-supabase.md#Dev-Agent-Record] - Supabase client available
- [Source: docs/stories/13-2-api-client-adaptation.md#Dev-Agent-Record] - API client ready
- [Source: docs/stories/12-2-popup-layout-structure.md#Dev-Agent-Record] - Popup layout ready
- [Source: frontend/src/components/] - Reference for auth components

### Learnings from Previous Story

**From Story 13.2 (Status: ready-for-dev)**

- **API Client Ready**: API client adapted với extension-specific auth
- **Token Retrieval**: Can get auth token từ chrome.storage
- **API Calls Work**: API calls include JWT token in headers
- **Error Handling**: Error handling matches frontend patterns

**Reuse:**
- Use API client từ Story 13.2
- Use Supabase client từ Story 13.1
- Integrate authentication vào popup

[Source: docs/stories/13-2-api-client-adaptation.md#Dev-Agent-Record]

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

