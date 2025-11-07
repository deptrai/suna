# Story 10.3: Build Configuration & Shared Code Setup

Status: ready-for-dev

## Story

As a developer,  
I want build configuration để bundle extension và setup shared code access,  
So that extension can reuse frontend components và utilities.

## Acceptance Criteria

1. Webpack hoặc Vite configuration để build extension
2. Build script outputs to `dist/` directory
3. Path aliases configured để import từ frontend (`@/components`, `@/lib`, etc.)
4. Shared code import test: successfully import `cn()` utility từ frontend
5. Build produces: `content-script.js`, `background.js`, `popup.js`, `popup.html`

## Tasks / Subtasks

- [ ] Task 1: Setup build tool configuration (AC: 1)
  - [ ] Choose build tool: Webpack hoặc Vite (recommend Webpack for extension)
  - [ ] Create `extension/webpack.config.js` hoặc `extension/vite.config.ts`
  - [ ] Configure entry points: content-script, background, popup
  - [ ] Configure output directory: `dist/`
  - [ ] Configure build mode (development/production)
  - [ ] Test build command runs successfully

- [ ] Task 2: Configure build output directory (AC: 2)
  - [ ] Set output path to `extension/dist/`
  - [ ] Configure output filenames: `content-script.js`, `background.js`, `popup.js`
  - [ ] Configure HTML output: `popup.html` (if using HTML plugin)
  - [ ] Ensure dist directory structure matches manifest requirements
  - [ ] Test build outputs files correctly

- [ ] Task 3: Configure path aliases trong build tool (AC: 3)
  - [ ] Configure webpack resolve aliases: `@/*` → `../frontend/src/*`
  - [ ] Hoặc configure Vite alias: `@/*` → `../frontend/src/*`
  - [ ] Ensure aliases match TypeScript path config từ Story 10.1
  - [ ] Test alias resolution trong build process
  - [ ] Verify imports resolve correctly during build

- [ ] Task 4: Test shared code import (AC: 4)
  - [ ] Create test file trong extension: `extension/src/shared/test-import.ts`
  - [ ] Import `cn()` utility: `import { cn } from '@/lib/utils'`
  - [ ] Use `cn()` function trong test file
  - [ ] Run build và verify import resolves correctly
  - [ ] Verify no build errors related to path aliases
  - [ ] Test import works at runtime (if possible)

- [ ] Task 5: Verify build outputs (AC: 5)
  - [ ] Run build command
  - [ ] Verify `dist/content-script.js` exists
  - [ ] Verify `dist/background.js` exists
  - [ ] Verify `dist/popup.js` exists
  - [ ] Verify `dist/popup.html` exists
  - [ ] Verify all files are properly bundled (check file sizes)
  - [ ] Test loading extension với built files

- [ ] Testing (AC: 1, 2, 3, 4, 5)
  - [ ] Test build command completes without errors
  - [ ] Verify all output files exist và are valid
  - [ ] Test path alias imports resolve correctly
  - [ ] Test shared code import works (cn() utility)
  - [ ] Verify build outputs match manifest.json references
  - [ ] Test extension loads với built files

## Dev Notes

### Architecture Patterns and Constraints

**Build Tool Selection:**
- Webpack recommended for extensions (better extension-specific plugins)
- Vite also viable but may need more configuration
- Build tool must support:
  - Multiple entry points (content-script, background, popup)
  - Path alias resolution
  - TypeScript compilation
  - React/JSX compilation
  - CSS processing (Tailwind)

**Build Output Structure:**
- Output to `extension/dist/` directory
- Files referenced in manifest.json must match output filenames
- Structure: `dist/content-script.js`, `dist/background.js`, `dist/popup.js`, `dist/popup.html`
- Icons và static assets copied to `dist/` (from `public/`)

**Path Alias Configuration:**
- Must match TypeScript path config: `@/*` → `../frontend/src/*`
- Build tool resolve aliases must match TypeScript compiler
- Test với actual import to verify resolution works

**Shared Code Import:**
- Import `cn()` utility từ `@/lib/utils` as test case
- This verifies path aliases work correctly
- If this works, other frontend imports should work too

### Project Structure Notes

**Build Configuration Location:**
- Webpack config: `extension/webpack.config.js`
- Vite config: `extension/vite.config.ts`
- Package.json scripts: `build`, `dev`, `watch`

**Output Directory:**
- `extension/dist/` - Build output directory
- This directory will be loaded as extension in Chrome
- Manifest.json references files in this directory

**Path Alias Alignment:**
- TypeScript: `tsconfig.json` paths config (from Story 10.1)
- Build tool: webpack resolve aliases hoặc vite alias
- Both must match: `@/*` → `../frontend/src/*`

### References

- [Source: docs/architecture-extension-suna.md#Project-Structure] - Extension project structure và build output requirements
- [Source: docs/architecture-extension-suna.md#Technology-Stack-Decisions] - Build tool requirements (Webpack hoặc Vite)
- [Source: docs/epics-extension.md#Epic-10] - Epic 10 goal và value proposition
- [Source: docs/epics-extension.md#Story-10.3] - Story acceptance criteria và prerequisites
- [Source: docs/stories/10-1-extension-project-structure-setup.md#Dev-Agent-Record] - TypeScript config và path aliases setup
- [Source: docs/stories/10-2-extension-manifest-configuration.md#Dev-Agent-Record] - Manifest references built files
- [Source: frontend/tsconfig.json] - Frontend TypeScript config để ensure compatibility
- [Source: frontend/src/lib/utils.ts] - cn() utility function to test import

### Learnings from Previous Story

**From Story 10.2 (Status: ready-for-dev)**

- **Manifest Created**: `extension/manifest.json` created với Manifest V3 format
- **File References**: Manifest references built files: `content-script.js`, `background.js`, `popup.html`
- **Build Output Required**: Build process must produce files matching manifest references
- **Icons Created**: `extension/public/icons/` directory với placeholder icons

**Reuse:**
- Manifest references built files in `dist/` directory
- Build output must match manifest file references exactly
- Use manifest.json as reference for required output files

[Source: docs/stories/10-2-extension-manifest-configuration.md#Dev-Agent-Record]

## Dev Agent Record

### Context Reference

- [Source: docs/stories/10-3-build-configuration-shared-code-setup.context.xml] - Story context XML với technical details

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List

## Change Log

- 2025-11-08: Story created from epics-extension.md

