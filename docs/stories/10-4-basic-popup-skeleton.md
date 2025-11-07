# Story 10.4: Basic Popup Skeleton

Status: ready-for-dev

## Story

As a developer,  
I want basic popup HTML và React entry point,  
So that popup UI can be developed.

## Acceptance Criteria

1. `popup.html` created với React root element
2. `popup.tsx` entry point với React setup
3. Basic "Hello Extension" component renders in popup
4. Popup opens khi clicking extension icon
5. Popup displays correctly (400x600px recommended size)

## Tasks / Subtasks

- [ ] Task 1: Create popup.html (AC: 1)
  - [ ] Create `extension/public/popup.html`
  - [ ] Add HTML structure với DOCTYPE, html, head, body
  - [ ] Add React root element: `<div id="extension-root"></div>`
  - [ ] Add script tag để load popup.js (will be built)
  - [ ] Add basic CSS for popup sizing (400x600px)
  - [ ] Verify HTML structure is valid

- [ ] Task 2: Create popup.tsx entry point (AC: 2)
  - [ ] Create `extension/src/popup/popup.tsx`
  - [ ] Import React và ReactDOM
  - [ ] Create root element reference: `document.getElementById('extension-root')`
  - [ ] Setup React root: `ReactDOM.createRoot(rootElement)`
  - [ ] Render basic component vào root
  - [ ] Verify React setup works

- [ ] Task 3: Create basic Hello Extension component (AC: 3)
  - [ ] Create `extension/src/popup/components/HelloExtension.tsx`
  - [ ] Create simple component: displays "Hello Extension" text
  - [ ] Import và render component trong popup.tsx
  - [ ] Add basic styling (use Tailwind classes if available)
  - [ ] Verify component renders correctly

- [ ] Task 4: Test popup opens correctly (AC: 4)
  - [ ] Build extension (using build config từ Story 10.3)
  - [ ] Load extension in Chrome Developer mode
  - [ ] Click extension icon trong browser toolbar
  - [ ] Verify popup opens
  - [ ] Verify popup displays content
  - [ ] Test popup closes khi clicking outside

- [ ] Task 5: Verify popup sizing (AC: 5)
  - [ ] Add CSS để set popup size: width 400px, height 600px
  - [ ] Verify popup displays at correct size
  - [ ] Test với different content sizes
  - [ ] Verify popup is scrollable nếu content exceeds size
  - [ ] Test popup sizing on different screen resolutions

- [ ] Testing (AC: 1, 2, 3, 4, 5)
  - [ ] Verify popup.html structure is valid
  - [ ] Test React entry point renders without errors
  - [ ] Verify Hello Extension component displays
  - [ ] Test popup opens khi clicking extension icon
  - [ ] Verify popup size is correct (400x600px)
  - [ ] Test popup functionality (open, close, display)

## Dev Notes

### Architecture Patterns and Constraints

**Popup Structure:**
- Popup HTML at `extension/public/popup.html` (source) hoặc `extension/dist/popup.html` (built)
- React entry point at `extension/src/popup/popup.tsx`
- Popup size: 400x600px recommended (can be adjusted)
- Popup opens when clicking extension icon (configured in manifest)

**React Setup:**
- Use React 18+ (matches frontend)
- Use ReactDOM.createRoot() (React 18 API)
- Entry point: `popup.tsx` renders into `#extension-root` element
- Component structure: Start simple, build up complexity

**Styling:**
- Use Tailwind CSS (matches frontend)
- Popup-specific styles can be added
- Ensure styles don't conflict với browser default styles
- Test với dark mode if applicable

**Build Integration:**
- Popup HTML và JS will be processed by build tool (Story 10.3)
- Build output: `dist/popup.html` và `dist/popup.js`
- Manifest references `popup.html` (from dist/)

### Project Structure Notes

**Popup Files:**
- HTML: `extension/public/popup.html` (source) → `extension/dist/popup.html` (built)
- React entry: `extension/src/popup/popup.tsx` → `extension/dist/popup.js` (built)
- Components: `extension/src/popup/components/` (can create subdirectory)

**React Root:**
- Root element: `<div id="extension-root"></div>` trong popup.html
- React renders into this element
- Element must exist before React tries to render

**Popup Size:**
- Recommended: 400px width, 600px height
- Can be set via CSS trong popup.html hoặc inline styles
- Browser may enforce minimum/maximum sizes

### References

- [Source: docs/architecture-extension-suna.md#Project-Structure] - Extension project structure với popup location
- [Source: docs/architecture-extension-suna.md#Technology-Stack-Decisions] - React 18+ requirement
- [Source: docs/epics-extension.md#Epic-10] - Epic 10 goal và value proposition
- [Source: docs/epics-extension.md#Story-10.4] - Story acceptance criteria và prerequisites
- [Source: docs/stories/10-2-extension-manifest-configuration.md#Dev-Agent-Record] - Popup configuration in manifest
- [Source: docs/stories/10-3-build-configuration-shared-code-setup.md#Dev-Agent-Record] - Build configuration for popup.js và popup.html
- [Source: frontend/src/app/layout.tsx] - Reference for React setup patterns (if applicable)

### Learnings from Previous Story

**From Story 10.3 (Status: ready-for-dev)**

- **Build Configuration**: Webpack/Vite config created với entry points including popup
- **Build Output**: Build produces `popup.js` và `popup.html` in `dist/` directory
- **Path Aliases**: Path aliases configured (`@/*` → `../frontend/src/*`) - can import từ frontend
- **Shared Code Import**: Tested importing `cn()` utility - path aliases work correctly

**Reuse:**
- Use build configuration từ Story 10.3
- Popup entry point should be configured in build tool
- Can import utilities từ frontend using path aliases
- Build output must match manifest.json popup reference

[Source: docs/stories/10-3-build-configuration-shared-code-setup.md#Dev-Agent-Record]

## Dev Agent Record

### Context Reference

- [Source: docs/stories/10-4-basic-popup-skeleton.context.xml] - Story context XML với technical details

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List

## Change Log

- 2025-11-08: Story created from epics-extension.md

