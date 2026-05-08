---
project_name: chainlens
date_generated: 2026-05-07
version: 1.0.0
---

# Chainlens - Project Context & Implementation Rules

## Executive Summary
This document serves as the foundational context and implementation rulebook for AI agents working on the **Chainlens** repository. Chainlens is a multi-part monorepo application incorporating a backend API (Bun), a web frontend (Next.js), a mobile app (Expo), a desktop shell (Tauri), and several shared libraries and services.

## 1. Technology Stack

### General & Infrastructure
- **Package Manager:** `pnpm` workspace
- **Language:** TypeScript (Primary), Rust (Desktop), Python (Voice backend)
- **Infrastructure:** Docker, s6-services (Core sandbox environment)
- **Database Layer:** Drizzle ORM (`packages/db`), Supabase.

### Backend (`apps/api`)
- **Runtime:** Bun
- **Routing/Framework:** Hono/Elysia-like modular setup (TypeScript/Bun native).
- **Core Integrations:** `@ai-sdk/*` (Anthropic, OpenAI, xAI), `@supabase/supabase-js`, Sentry, Logtail.

### Frontend (`apps/web`)
- **Framework:** Next.js (App Router, Turbopack)
- **UI & Styling:** React 18, TailwindCSS, `@floating-ui`, Radix-like primitives.
- **State/Form:** React Hook Form
- **Editor:** CodeMirror 6

### Mobile (`apps/mobile`)
- **Framework:** Expo (React Native)
- **Styling:** NativeWind (Tailwind for React Native)
- **UI Components:** `@rn-primitives/*`

### Desktop (`apps/desktop`)
- **Framework:** Tauri (Rust + Webview)

## 2. Code Organization & Architecture

### Monorepo Structure
- `apps/*`: End-user or primary applications (API, Web, Mobile, Desktop).
- `packages/*`: Shared modules.
  - `packages/db`: Contains all Drizzle schemas, config, and migrations.
  - `packages/shared`: Common types, utilities, and constants.
  - `packages/agent-tunnel`: Network relay utilities for agents.
  - `packages/voice`: Python FastAPI server for voice integrations.
- `core/`: Sandbox and deployment initialization scripts (Docker, shell).

### Import Conventions
- Path aliases are heavily used. In `apps/web` and `apps/api`, `@/*` typically maps to `./src/*`.
- When sharing code across applications, import from the workspace package (e.g., `import { X } from '@epsilon/shared'`).

## 3. Critical Implementation Rules

### A. TypeScript & Backend (Bun)
- **Strict Typing:** All TypeScript must be strictly typed. Avoid `any`.
- **Environment:** Backend runs on Bun. Do NOT use Node.js specific APIs (like `fs`, `path`, `crypto` from `node:`) unless cross-compatible or polyfilled; prefer `Bun.*` native APIs where performance is critical, but standard ECMAScript is best.
- **Database Operations:** All DB queries MUST be routed through Drizzle ORM schemas defined in `packages/db`. Avoid raw SQL strings unless absolutely necessary.

### B. Frontend & React (Next.js / Expo)
- **Next.js:** Use App Router (`app/` directory paradigm) if modifying Next.js structure.
- **Styling:** Use TailwindCSS classes. For mobile (`apps/mobile`), use NativeWind syntax (which mirrors Tailwind).
- **Client vs Server:** In Next.js, strictly separate `"use client"` components from server components. Keep client components as leaf nodes.

### C. AI Agents & External Services
- **AI SDK:** Use the Vercel AI SDK (`@ai-sdk/*`) for all LLM interactions in the backend.

### D. Testing & Quality
- **E2E Testing:** Playwright is configured (`tests/playwright.config.ts`).
- **Unit Testing:** Use `bun test` for the backend and shared libraries.

## 4. Contribution Workflow
1. Use `pnpm install` at the root for dependency management.
2. Read specific `README.md` files within `apps/*` and `packages/*` for localized instructions.
3. NEVER commit secrets. Check `.env.example` templates for required environment variables.
