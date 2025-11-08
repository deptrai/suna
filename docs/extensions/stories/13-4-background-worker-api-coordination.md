# Story 13.4: Background Worker API Coordination

Status: ready-for-dev

## Story

As a developer,  
I want background worker coordinate API calls,  
So that content script và side panel can request analysis và open chat.

## Acceptance Criteria

1. Background worker listens for messages từ content script và side panel
2. Worker handles `ANALYZE_COIN` và `OPEN_SIDE_PANEL_WITH_COIN` message types
3. Worker stores coin info trong chrome.storage khi opening side panel
4. Worker calls API với proper authentication
5. Worker sends results back to requester
6. Error handling và retry logic implemented
7. Message passing tested end-to-end

## Tasks / Subtasks

- [ ] Task 1: Setup message listener (AC: 1)
  - [ ] Create `extension/src/background/background.ts`
  - [ ] Add `chrome.runtime.onMessage.addListener()`
  - [ ] Listen for messages từ content script và side panel
  - [ ] Route messages to appropriate handlers
  - [ ] Test message listener works

- [ ] Task 2: Handle message types (AC: 2, 3)
  - [ ] Create handler for `ANALYZE_COIN` message type
  - [ ] Create handler for `OPEN_SIDE_PANEL_WITH_COIN` message type
  - [ ] Extract coin info (name, symbol, price) từ message
  - [ ] Store coin info trong chrome.storage khi opening side panel
  - [ ] Open side panel using chrome.sidePanel.open()
  - [ ] Validate message format
  - [ ] Route to appropriate handlers
  - [ ] Test message handling works

- [ ] Task 3: Call API với authentication (AC: 4)
  - [ ] Get auth token từ chrome.storage (via Supabase client)
  - [ ] Call coin analysis API với token
  - [ ] Use API client từ Story 13.2
  - [ ] Handle API response
  - [ ] Test API call works

- [ ] Task 4: Send results back (AC: 5)
  - [ ] Format API response
  - [ ] Send response back to requester via `sendResponse()`
  - [ ] Handle async response correctly
  - [ ] Test results sent back correctly
  - [ ] Verify requester receives results

- [ ] Task 5: Implement error handling và retry (AC: 6)
  - [ ] Handle API errors
  - [ ] Handle authentication errors
  - [ ] Implement retry logic for network errors
  - [ ] Send error messages back to requester
  - [ ] Test error handling works

- [ ] Task 6: Test end-to-end message passing (AC: 7)
  - [ ] Test message từ content script to background
  - [ ] Test message từ side panel to background
  - [ ] Test side panel opening với coin info
  - [ ] Test API call và response
  - [ ] Test error handling
  - [ ] Test retry logic
  - [ ] Verify end-to-end flow works

- [ ] Testing (AC: 1, 2, 3, 4, 5, 6, 7)
  - [ ] Test message listener works
  - [ ] Test ANALYZE_COIN message handling
  - [ ] Test API call với authentication
  - [ ] Test results sent back
  - [ ] Test error handling và retry
  - [ ] Test end-to-end message passing

## Dev Notes

### Architecture Patterns and Constraints

**Message Passing:**
- Content script và side panel send messages to background
- Background worker handles messages
- Worker opens side panel với coin info (OPEN_SIDE_PANEL_WITH_COIN)
- Worker calls API và sends results back
- Use chrome.runtime.sendMessage() và onMessage

**API Coordination:**
- Background worker centralizes API calls
- Handles authentication centrally
- Can handle CORS issues
- Provides single point for API coordination

**Error Handling:**
- Handle API errors
- Handle authentication errors
- Implement retry logic
- Send errors back to requester

### Project Structure Notes

**Background Worker:**
- `extension/src/background/background.ts` - Main background worker
- Will be compiled to `dist/background.js`
- Manifest references background service worker

**Message Types:**
- Define message types trong shared types file
- Message format: `{ type: 'ANALYZE_COIN', coin: string }` hoặc `{ type: 'OPEN_SIDE_PANEL_WITH_COIN', coinInfo: { name, symbol, price? } }`
- Response format: `{ success: boolean, data?: any, error?: string }`

### References

- [Source: docs/architecture-extension-suna.md#Implementation-Patterns] - Message passing patterns
- [Source: docs/epics-extension.md#Epic-13] - Epic 13 goal: background worker API coordination
- [Source: docs/epics-extension.md#Story-13.4] - Story acceptance criteria và prerequisites
- [Source: docs/stories/13-2-api-client-adaptation.md#Dev-Agent-Record] - API client ready
- [Source: docs/stories/11-3-analysis-button-injection.md#Dev-Agent-Record] - Content script sends ANALYZE_COIN messages

### Learnings from Previous Story

**From Story 13.2 (Status: ready-for-dev)**

- **API Client Ready**: API client adapted với extension-specific auth
- **Token Retrieval**: Can get auth token từ chrome.storage
- **API Calls Work**: API calls include JWT token in headers
- **Error Handling**: Error handling implemented

**Reuse:**
- Use API client từ Story 13.2
- Use authentication từ Story 13.1
- Coordinate API calls from background worker

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

