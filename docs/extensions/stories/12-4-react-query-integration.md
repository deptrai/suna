# Story 12.4: React Query Integration

Status: ready-for-dev

## Story

As a developer,  
I want React Query setup trong side panel,  
So that data fetching và caching works như main app.

## Acceptance Criteria

1. QueryClient provider setup trong side panel
2. React Query hooks imported từ frontend (`@/hooks/react-query/`)
3. Analysis query hook created hoặc reused
4. Caching strategy matches frontend (staleTime, gcTime)
5. Query invalidation works correctly
6. Loading và error states handled properly

## Tasks / Subtasks

- [ ] Task 1: Setup QueryClient provider (AC: 1)
  - [ ] Import QueryClient và QueryClientProvider từ React Query
  - [ ] Create QueryClient instance với configuration
  - [ ] Wrap side panel app với QueryClientProvider
  - [ ] Configure QueryClient với caching settings
  - [ ] Test provider setup works

- [ ] Task 2: Import React Query hooks (AC: 2)
  - [ ] Import hooks từ `@/hooks/react-query/` (if available)
  - [ ] Or create hooks locally trong extension
  - [ ] Test hooks import correctly
  - [ ] Verify hooks work trong side panel context
  - [ ] Test hook usage

- [ ] Task 3: Create analysis query hook (AC: 3)
  - [ ] Create `useCoinAnalysis` hook hoặc reuse từ frontend
  - [ ] Hook should fetch analysis data từ API
  - [ ] Hook should handle loading và error states
  - [ ] Hook should return analysis data
  - [ ] Test hook works correctly

- [ ] Task 4: Configure caching strategy (AC: 4)
  - [ ] Set staleTime to match frontend (e.g., 5 minutes)
  - [ ] Set gcTime (garbage collection time) to match frontend
  - [ ] Configure other cache settings
  - [ ] Test caching works correctly
  - [ ] Verify cache persists appropriately

- [ ] Task 5: Implement query invalidation (AC: 5)
  - [ ] Setup query invalidation khi needed
  - [ ] Test invalidation triggers refetch
  - [ ] Test invalidation works correctly
  - [ ] Verify cache updates properly

- [ ] Task 6: Handle loading và error states (AC: 6)
  - [ ] Use `isLoading` từ query hook
  - [ ] Use `isError` và `error` từ query hook
  - [ ] Display loading state trong component
  - [ ] Display error state trong component
  - [ ] Test states handled correctly

- [ ] Testing (AC: 1, 2, 3, 4, 5, 6)
  - [ ] Test QueryClient provider setup
  - [ ] Test React Query hooks work
  - [ ] Test analysis query hook
  - [ ] Test caching strategy
  - [ ] Test query invalidation
  - [ ] Test loading và error states

## Dev Notes

### Architecture Patterns and Constraints

**React Query Setup:**
- QueryClient provider wraps popup app
- QueryClient configured với caching settings
- Hooks imported từ frontend hoặc created locally
- Caching strategy matches frontend

**Data Fetching:**
- Use React Query hooks for API calls
- Handle loading, error, và success states
- Cache analysis results appropriately
- Invalidate cache khi needed

**Caching Strategy:**
- staleTime: How long data is considered fresh
- gcTime: How long unused data stays in cache
- Match frontend settings for consistency

### Project Structure Notes

**QueryClient Setup:**
- Setup trong `extension/src/popup/popup.tsx`
- Or in separate provider component
- Wrap entire popup app

**Hooks Location:**
- Import từ `@/hooks/react-query/` (if available)
- Or create trong `extension/src/popup/hooks/`
- Reuse frontend hooks if possible

### References

- [Source: docs/epics-extension.md#Epic-12] - Epic 12 goal: React Query integration
- [Source: docs/epics-extension.md#Story-12.4] - Story acceptance criteria và prerequisites
- [Source: docs/stories/12-3-analysis-results-display-component.md#Dev-Agent-Record] - Analysis component ready
- [Source: frontend/src/providers/react-query-provider.tsx] - Reference for React Query setup
- [Source: frontend/src/hooks/react-query/] - Reference for React Query hooks

### Learnings from Previous Story

**From Story 12.3 (Status: ready-for-dev)**

- **Analysis Component Created**: `coin-analysis.tsx` component created
- **Component Ready**: Component ready to receive analysis data
- **Loading/Error States**: Component has loading và error state placeholders
- **UI Components**: Card, Button components available

**Reuse:**
- Use analysis component từ Story 12.3
- Connect React Query hook to component
- Use loading/error states from query hook

[Source: docs/stories/12-3-analysis-results-display-component.md#Dev-Agent-Record]

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

