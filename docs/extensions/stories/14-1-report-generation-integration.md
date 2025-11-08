# Story 14.1: Report Generation Integration

Status: ready-for-dev

## Story

As a user,  
I want generate comprehensive reports từ extension,  
So that I get full analysis details.

## Acceptance Criteria

1. Report generation API call từ extension
2. Report URL returned từ API
3. New tab opens với report URL
4. Report page loads với coin context
5. Report displays correctly với all analysis sections
6. Error handling nếu report generation fails

## Tasks / Subtasks

- [ ] Task 1: Implement report generation API call (AC: 1)
  - [ ] Create report generation function
  - [ ] Call API endpoint: `/api/reports/generate` hoặc similar
  - [ ] Include coin context in request
  - [ ] Use API client từ Story 13.2
  - [ ] Test API call works

- [ ] Task 2: Handle report URL response (AC: 2)
  - [ ] Parse API response to get report URL
  - [ ] Validate URL format
  - [ ] Store URL temporarily if needed
  - [ ] Test URL extraction works
  - [ ] Verify URL is correct

- [ ] Task 3: Open new tab với report URL (AC: 3)
  - [ ] Use `chrome.tabs.create()` to open new tab
  - [ ] Pass report URL to tabs.create()
  - [ ] Handle tab creation errors
  - [ ] Test new tab opens correctly
  - [ ] Verify tab opens với correct URL

- [ ] Task 4: Verify report page loads (AC: 4)
  - [ ] Test report page loads với coin context
  - [ ] Verify coin data displayed correctly
  - [ ] Test với different coins
  - [ ] Verify report page works correctly
  - [ ] Test report displays all sections

- [ ] Task 5: Verify report display (AC: 5)
  - [ ] Test report displays all analysis sections
  - [ ] Test report formatting is correct
  - [ ] Test report is readable
  - [ ] Verify report matches main app reports
  - [ ] Test report functionality

- [ ] Task 6: Implement error handling (AC: 6)
  - [ ] Handle API errors (report generation fails)
  - [ ] Handle network errors
  - [ ] Handle invalid URL errors
  - [ ] Display error message to user
  - [ ] Provide error recovery options
  - [ ] Test error handling works

- [ ] Testing (AC: 1, 2, 3, 4, 5, 6)
  - [ ] Test report generation API call
  - [ ] Test report URL extraction
  - [ ] Test new tab opens
  - [ ] Test report page loads
  - [ ] Test report displays correctly
  - [ ] Test error handling

## Dev Notes

### Architecture Patterns and Constraints

**Report Generation Flow:**
- User triggers report generation (from popup)
- Extension calls report generation API
- API returns report URL
- Extension opens new tab với report URL
- Frontend report page loads và displays analysis

**API Integration:**
- Use API client từ Story 13.2
- Call report generation endpoint
- Include coin context in request
- Handle API response

**Tab Management:**
- Use chrome.tabs.create() to open new tab
- May require `tabs` permission in manifest
- Handle tab creation errors
- Test tab opens correctly

### Project Structure Notes

**Report Generation:**
- Can be triggered from popup (Story 12.5)
- Or from content script button (Story 11.3)
- Use background worker for API call (Story 13.4)
- Or call directly from popup

**URL Construction:**
- Report URL returned from API
- Or construct URL locally với coin context
- Include query parameters for coin data

### References

- [Source: docs/epics-extension.md#Epic-14] - Epic 14 goal: report generation
- [Source: docs/epics-extension.md#Story-14.1] - Story acceptance criteria và prerequisites
- [Source: docs/stories/12-5-report-generation-ui.md#Dev-Agent-Record] - Report generation UI ready
- [Source: docs/stories/13-4-background-worker-api-coordination.md#Dev-Agent-Record] - Background worker ready for API calls
- [Source: docs/PRD-extension.md#Functional-Requirements] - FR006: Report generation

### Learnings from Previous Story

**From Story 13.4 (Status: ready-for-dev)**

- **Background Worker Ready**: Background worker coordinates API calls
- **Message Passing**: Content script và popup can send messages
- **API Integration**: API calls work với authentication
- **Error Handling**: Error handling và retry logic implemented

**Reuse:**
- Use background worker từ Story 13.4 for API calls
- Or call API directly from popup
- Use message passing if using background worker

[Source: docs/stories/13-4-background-worker-api-coordination.md#Dev-Agent-Record]

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

