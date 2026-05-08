# Chainlens - Project Overview

**Date:** 2026-05-07
**Type:** Monorepo (Web, Mobile, Desktop, API, Infra)
**Architecture:** Multi-part Distributed System

## Executive Summary

`chainlens` is a comprehensive, multi-platform system encompassing a Next.js web application, an Expo-based mobile app, a Tauri desktop client, and a high-performance backend API powered by Bun and TypeScript. The system utilizes a shared packages architecture (via `pnpm` workspaces) for database access, type sharing, and specialized services like Python-based voice processing and a Cloudflare worker registry for agents.

## Project Classification

- **Repository Type:** Monorepo (pnpm workspace)
- **Project Type(s):** Web, Mobile, Desktop, Backend, Infra, Library
- **Primary Language(s):** TypeScript, Rust, Python, Bash
- **Architecture Pattern:** Microservices-oriented Monorepo with Shared Libraries

## Multi-Part Structure

This project consists of 11 distinct parts:

### apps/api
- **Type:** backend
- **Location:** `apps/api`
- **Purpose:** Core API service serving web, mobile, and desktop clients. Handles authentication, business logic, integrations, billing (Stripe/RevenueCat), and platform provisioning.
- **Tech Stack:** Bun, TypeScript, Supabase, AI SDK, Hono/Elysia (or similar router).

### apps/desktop
- **Type:** desktop
- **Location:** `apps/desktop`
- **Purpose:** Native desktop shell for the application.
- **Tech Stack:** Tauri, Rust, TypeScript.

### apps/frontend
- **Type:** web
- **Location:** `apps/frontend`
- **Purpose:** Auxiliary frontend/Next.js application.
- **Tech Stack:** Next.js, React, TypeScript.

### apps/mobile
- **Type:** mobile
- **Location:** `apps/mobile`
- **Purpose:** Cross-platform mobile application for iOS and Android.
- **Tech Stack:** Expo, React Native, NativeWind/TailwindCSS, TypeScript.

### apps/web
- **Type:** web
- **Location:** `apps/web`
- **Purpose:** Primary web-based user interface.
- **Tech Stack:** Next.js (App Router), React, TailwindCSS, Sentry.

### core
- **Type:** infra
- **Location:** `core`
- **Purpose:** Sandbox environments, initialization scripts, and system infrastructure.
- **Tech Stack:** Docker, s6-services, Bash shell scripts.

### packages/agent-tunnel
- **Type:** library
- **Location:** `packages/agent-tunnel`
- **Purpose:** Tunneling utilities for agent connections.
- **Tech Stack:** Bun, TypeScript.

### packages/db
- **Type:** library
- **Location:** `packages/db`
- **Purpose:** Database schema, migrations, and ORM access layer.
- **Tech Stack:** Drizzle ORM, TypeScript.

### packages/epsilon-ocx-registry
- **Type:** backend
- **Location:** `packages/epsilon-ocx-registry`
- **Purpose:** Registry for agents and OCX capabilities.
- **Tech Stack:** Cloudflare Workers, Wrangler.

### packages/shared
- **Type:** library
- **Location:** `packages/shared`
- **Purpose:** Common utilities, types, and constants shared across apps.
- **Tech Stack:** TypeScript.

### packages/voice
- **Type:** backend
- **Location:** `packages/voice`
- **Purpose:** Voice processing and integration service.
- **Tech Stack:** Python, FastAPI, Vapi.

## Technology Stack Summary

| Category | Technology |
|----------|------------|
| **Web Frontend** | Next.js, React, TailwindCSS, Sentry |
| **Mobile App** | Expo, React Native, NativeWind |
| **Desktop App** | Tauri, Rust |
| **Backend API** | Bun, TypeScript, AI SDK |
| **Database/ORM**| Drizzle ORM, Supabase |
| **Voice Backend**| Python, FastAPI |
| **Edge Compute**| Cloudflare Workers |
| **Infrastructure**| Docker, Bash, s6-services |
| **Package Manager**| pnpm (workspace) |

## Key Features

- **Cross-platform Clients:** Consistent experience across Web, Desktop (Tauri), and Mobile (Expo).
- **Agent Integration:** First-class support for AI agents, tunneling (`agent-tunnel`), and OCX registries.
- **Voice Capabilities:** Dedicated Python-based voice service.
- **Sandbox Platform:** Provisioning and running secure sandboxes (managed via `core` and `apps/api/src/platform`).

## Development Overview

### Prerequisites

- **Node.js / Bun:** Required for backend API and workspace management.
- **pnpm:** Workspace package manager.
- **Rust:** Required for Tauri desktop development.
- **Python 3:** Required for the voice service.
- **Docker:** Required for local sandbox and infrastructure testing.

### Key Commands

- **Install Dependencies:** `pnpm install`
- **Run Local Environments:** Use scripts in the root `scripts/` directory (e.g., `./scripts/start-local.sh`, `./scripts/dev-local.sh`).
- **Database Migrations:** Managed via `packages/db` using Drizzle kit.

## Repository Structure

The monorepo follows a standard structure separating applications (`apps/`) from reusable modules (`packages/`) and infrastructure code (`core/`, `scripts/`).

## Documentation Map

For detailed information, see:

- [source-tree-analysis.md](./source-tree-analysis.md) - Annotated directory structure.
- [development-instructions.md](./development-instructions.md) - Development workflow.
- [deployment-configuration.md](./deployment-configuration.md) - Deployment and CI/CD.
- [integration-architecture.md](./integration-architecture.md) - Inter-service communication.

---
*Generated using BMAD Method `document-project` workflow*