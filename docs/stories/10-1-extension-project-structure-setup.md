# Story 10.1: Extension Project Structure Setup

Status: ready-for-dev

## Story

As a developer,  
I want extension project structure với proper organization,  
So that code is maintainable và follows best practices.

## Acceptance Criteria

1. Extension directory structure created với folders: `src/content-script/`, `src/popup/`, `src/background/`, `src/shared/`
2. TypeScript configuration với path aliases to frontend (`@/*` → `../frontend/src/*`)
3. Package.json với dependencies matching frontend (React, TypeScript, Tailwind, etc.)
4. Basic README với setup instructions

## Tasks / Subtasks

- [ ] Task 1: Create extension directory structure (AC: 1)
  - [ ] Create `extension/` directory at project root
  - [ ] Create `extension/src/content-script/` folder
  - [ ] Create `extension/src/popup/` folder
  - [ ] Create `extension/src/background/` folder
  - [ ] Create `extension/src/shared/` folder
  - [ ] Create `extension/public/` folder for static assets
  - [ ] Verify folder structure matches architecture spec

- [ ] Task 2: Configure TypeScript với path aliases (AC: 2)
  - [ ] Create `extension/tsconfig.json`
  - [ ] Configure path aliases: `@/*` → `../frontend/src/*`
  - [ ] Set TypeScript compiler options (target, module, etc.)
  - [ ] Verify path aliases resolve correctly
  - [ ] Test import từ frontend using alias

- [ ] Task 3: Setup package.json với dependencies (AC: 3)
  - [ ] Create `extension/package.json`
  - [ ] Add React 18+ dependency (match frontend version)
  - [ ] Add TypeScript 5+ dependency
  - [ ] Add Tailwind CSS 4+ dependency
  - [ ] Add other frontend dependencies (Radix UI, Zustand, React Query, etc.)
  - [ ] Add extension-specific dependencies (chrome types, webpack, etc.)
  - [ ] Verify versions match frontend package.json

- [ ] Task 4: Create basic README (AC: 4)
  - [ ] Create `extension/README.md`
  - [ ] Document project structure
  - [ ] Document setup instructions
  - [ ] Document build process
  - [ ] Document development workflow
  - [ ] Include links to architecture docs

- [ ] Testing (AC: 1, 2, 3, 4)
  - [ ] Verify all folders created correctly
  - [ ] Test TypeScript path alias resolution
  - [ ] Test package.json dependencies install correctly
  - [ ] Verify README instructions are clear và complete

## Dev Notes

### Architecture Patterns and Constraints

**Project Structure:**
- Extension follows recommended structure from architecture doc: `extension/src/` với subdirectories cho content-script, popup, background, và shared code
- Alternative simpler structure (Direct Import) is also documented but monorepo approach is preferred for maximum code reuse
- Path aliases enable importing từ frontend without copying code

**Code Reuse Strategy:**
- Extension uses path aliases (`@/*`) to import directly từ frontend codebase
- This approach minimizes code duplication và ensures consistency
- TypeScript configuration must match frontend để ensure compatibility

**Technology Stack:**
- React 18+ (matches frontend)
- TypeScript 5+ (matches frontend)
- Tailwind CSS 4+ (matches frontend)
- Extension-specific: Chrome Extension Manifest V3, webpack for bundling

### Project Structure Notes

**Alignment with Architecture:**
- Structure matches "Recommended Structure (Monorepo)" from architecture doc
- Extension directory at project root: `suna/extension/`
- Source code in `extension/src/` với organized subdirectories
- Public assets in `extension/public/`

**Path Aliases:**
- TypeScript path alias `@/*` maps to `../frontend/src/*`
- This allows importing components, utilities, và types từ frontend
- Example: `import { Button } from '@/components/ui/button'`

**Dependencies:**
- Package.json should mirror frontend dependencies để ensure compatibility
- Check `frontend/package.json` for exact versions
- Add extension-specific build tools (webpack, etc.)

### References

- [Source: docs/architecture-extension-suna.md#Project-Structure] - Recommended extension project structure
- [Source: docs/architecture-extension-suna.md#Technology-Stack-Decisions] - Technology stack requirements
- [Source: docs/epics-extension.md#Epic-10] - Epic 10 goal và value proposition
- [Source: docs/PRD-extension.md#Goals] - Project goals including code reuse target
- [Source: docs/epics-extension.md#Story-10.1] - Story acceptance criteria và prerequisites
- [Source: docs/architecture/coding-standards.md] - Coding standards và best practices
- [Source: frontend/package.json] - Frontend dependencies để match versions
- [Source: frontend/tsconfig.json] - Frontend TypeScript config để ensure compatibility

### Learnings from Previous Story

**First story in epic - no predecessor context**

## Dev Agent Record

### Context Reference

- [Source: docs/stories/10-1-extension-project-structure-setup.context.xml] - Story context XML với technical details

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List

## Change Log

- 2025-11-07: Story created from epics-extension.md

