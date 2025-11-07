# Story 12.1: Shared UI Components Integration

Status: ready-for-dev

## Story

As a developer,  
I want import và use UI components từ frontend,  
So that popup UI matches main app design.

## Acceptance Criteria

1. Successfully import `Button` component từ `@/components/ui/button`
2. Successfully import `Card` component từ `@/components/ui/card`
3. Successfully import `Dialog` component từ `@/components/ui/dialog`
4. Components render correctly trong extension popup
5. Tailwind CSS styles applied correctly
6. Components tested với various props

## Tasks / Subtasks

- [ ] Task 1: Import Button component (AC: 1)
  - [ ] Import Button từ `@/components/ui/button` trong popup component
  - [ ] Test import resolves correctly (no build errors)
  - [ ] Render Button component trong popup
  - [ ] Test Button với different variants và sizes
  - [ ] Verify Button styles apply correctly

- [ ] Task 2: Import Card component (AC: 2)
  - [ ] Import Card components từ `@/components/ui/card` (Card, CardHeader, CardTitle, CardContent)
  - [ ] Test import resolves correctly
  - [ ] Render Card component trong popup
  - [ ] Test Card với different content
  - [ ] Verify Card styles apply correctly

- [ ] Task 3: Import Dialog component (AC: 3)
  - [ ] Import Dialog components từ `@/components/ui/dialog` (Dialog, DialogContent, DialogTrigger)
  - [ ] Test import resolves correctly
  - [ ] Render Dialog component trong popup
  - [ ] Test Dialog open/close functionality
  - [ ] Verify Dialog styles apply correctly

- [ ] Task 4: Verify components render correctly (AC: 4)
  - [ ] Test all components render trong popup
  - [ ] Verify no console errors
  - [ ] Test components với different props
  - [ ] Verify components are interactive (buttons clickable, dialogs open)
  - [ ] Test components on popup open/close

- [ ] Task 5: Verify Tailwind CSS styles (AC: 5)
  - [ ] Verify Tailwind CSS is loaded trong popup
  - [ ] Test Tailwind classes work correctly
  - [ ] Verify component styles match frontend
  - [ ] Test với dark mode (if applicable)
  - [ ] Verify no style conflicts

- [ ] Task 6: Test components với various props (AC: 6)
  - [ ] Test Button với variants (default, destructive, outline, etc.)
  - [ ] Test Button với sizes (sm, md, lg)
  - [ ] Test Card với different content layouts
  - [ ] Test Dialog với different sizes và positions
  - [ ] Test components với disabled states
  - [ ] Test components với loading states

- [ ] Testing (AC: 1, 2, 3, 4, 5, 6)
  - [ ] Test all imports resolve correctly
  - [ ] Test all components render
  - [ ] Test Tailwind styles apply correctly
  - [ ] Test components với various props
  - [ ] Test components are interactive
  - [ ] Verify no build errors

## Dev Notes

### Architecture Patterns and Constraints

**Component Import Strategy:**
- Use path aliases (`@/components/ui/*`) to import từ frontend
- Path aliases configured in Story 10.1 và 10.3
- Components should import without errors
- Build tool must resolve path aliases correctly

**Component Reuse:**
- Reuse exact same components từ frontend
- No modifications needed to components
- Components should work as-is trong extension popup
- Tailwind CSS must be available trong popup

**Styling:**
- Tailwind CSS must be configured trong popup
- Styles should match frontend exactly
- Test với different themes (light/dark)
- Ensure no style conflicts

### Project Structure Notes

**Component Imports:**
- Import từ `@/components/ui/button`
- Import từ `@/components/ui/card`
- Import từ `@/components/ui/dialog`
- Path aliases resolve to `../frontend/src/components/ui/*`

**Popup Location:**
- Components used trong `extension/src/popup/popup.tsx`
- Or trong popup-specific components
- Popup HTML must have Tailwind CSS loaded

**Build Configuration:**
- Build tool must resolve path aliases
- Tailwind CSS must be included in popup build
- Components must be bundled correctly

### References

- [Source: docs/architecture-extension-suna.md#Code-Reuse-Strategy] - UI Components Reuse strategy
- [Source: docs/epics-extension.md#Epic-12] - Epic 12 goal: reuse frontend components
- [Source: docs/epics-extension.md#Story-12.1] - Story acceptance criteria và prerequisites
- [Source: docs/stories/10-3-build-configuration-shared-code-setup.md#Dev-Agent-Record] - Path aliases configured
- [Source: frontend/src/components/ui/button.tsx] - Button component reference
- [Source: frontend/src/components/ui/card.tsx] - Card component reference
- [Source: frontend/src/components/ui/dialog.tsx] - Dialog component reference

### Learnings from Previous Story

**From Story 10.4 (Status: ready-for-dev)**

- **Popup Created**: Basic popup HTML và React entry point created
- **Build Working**: Build configuration produces popup.js và popup.html
- **Path Aliases**: Path aliases configured (`@/*` → `../frontend/src/*`)
- **TypeScript Setup**: TypeScript compilation works correctly

**Reuse:**
- Use path aliases từ Story 10.3
- Import components using `@/components/ui/*` syntax
- Build tool should resolve imports correctly
- Tailwind CSS should be available trong popup

[Source: docs/stories/10-4-basic-popup-skeleton.md#Dev-Agent-Record]

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

