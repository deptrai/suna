# Story 12.5: Report Generation UI

Status: ready-for-dev

## Story

As a user,  
I want generate full report từ side panel,  
So that I can get comprehensive analysis.

## Acceptance Criteria

1. "Generate Full Report" button trong side panel
2. Button click opens new tab với report URL
3. Report URL includes coin context (query params)
4. Report page (frontend) loads với correct coin data
5. Error handling nếu report generation fails

## Tasks / Subtasks

- [ ] Task 1: Add Generate Report button (AC: 1)
  - [ ] Add "Generate Full Report" button trong side panel footer
  - [ ] Style button appropriately
  - [ ] Position button in footer layout
  - [ ] Test button displays correctly
  - [ ] Test button is clickable

- [ ] Task 2: Implement button click handler (AC: 2)
  - [ ] Add click handler to button
  - [ ] Use `chrome.tabs.create()` to open new tab
  - [ ] Construct report URL
  - [ ] Open new tab với report URL
  - [ ] Test new tab opens correctly

- [ ] Task 3: Include coin context in URL (AC: 3)
  - [ ] Get current coin name từ analysis data
  - [ ] Add coin name as query parameter: `?coin=BTC` hoặc `?coinName=Bitcoin`
  - [ ] Add other context if needed (symbol, etc.)
  - [ ] Construct complete URL với query params
  - [ ] Test URL includes correct context

- [ ] Task 4: Verify report page loads (AC: 4)
  - [ ] Test report page opens với correct URL
  - [ ] Verify report page loads coin data from query params
  - [ ] Test report page displays analysis correctly
  - [ ] Test với different coins
  - [ ] Verify report page works correctly

- [ ] Task 5: Implement error handling (AC: 5)
  - [ ] Handle errors khi opening new tab fails
  - [ ] Handle errors khi report URL is invalid
  - [ ] Display error message to user
  - [ ] Provide error recovery options
  - [ ] Test error handling works

- [ ] Testing (AC: 1, 2, 3, 4, 5)
  - [ ] Test button displays và is clickable
  - [ ] Test new tab opens với report URL
  - [ ] Test URL includes coin context
  - [ ] Test report page loads correctly
  - [ ] Test error handling

## Dev Notes

### Architecture Patterns and Constraints

**Report Generation Flow:**
- User clicks "Generate Full Report" button
- Extension opens new tab với report URL
- Report URL includes coin context (query params)
- Frontend report page loads và displays analysis

**URL Construction:**
- Base URL: Frontend report page URL
- Query params: `coin`, `coinName`, `symbol`, etc.
- Example: `https://suna.so/reports?coinName=Bitcoin&symbol=BTC`

**Chrome Tabs API:**
- Use `chrome.tabs.create()` to open new tab
- Requires `tabs` permission in manifest (if not already)
- Handle errors appropriately

### Project Structure Notes

**Button Location:**
- Button in popup footer (from Story 12.2)
- Or in analysis results component
- Use Button component từ Story 12.1

**URL Configuration:**
- Define report URL base trong config
- Or use environment variable
- Construct URL dynamically với coin context

### References

- [Source: docs/epics-extension.md#Epic-12] - Epic 12 goal: report generation UI
- [Source: docs/epics-extension.md#Story-12.5] - Story acceptance criteria và prerequisites
- [Source: docs/stories/12-2-popup-layout-structure.md#Dev-Agent-Record] - Footer với action buttons
- [Source: docs/stories/12-4-react-query-integration.md#Dev-Agent-Record] - Analysis data available
- [Source: docs/PRD-extension.md#Functional-Requirements] - FR005: Report generation

### Learnings from Previous Story

**From Story 12.4 (Status: ready-for-dev)**

- **React Query Setup**: QueryClient provider setup trong popup
- **Analysis Data Available**: Analysis data available via React Query hook
- **Data Fetching**: Data fetching và caching working correctly
- **Loading/Error States**: Loading và error states handled

**Reuse:**
- Use analysis data từ React Query hook
- Get coin name/symbol from analysis data
- Use data to construct report URL

[Source: docs/stories/12-4-react-query-integration.md#Dev-Agent-Record]

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

