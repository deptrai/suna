# Suna.so Browser Extension

Browser extension for Suna.so that enables instant coin analysis directly from any cryptocurrency website.

## Overview

This extension allows users to click on coin names while browsing crypto websites and instantly generate analysis reports using Suna.so's AI-powered analysis engine.

## Project Structure

```
extension/
├── src/
│   ├── content-script/    # Content script for coin detection và UI injection
│   ├── popup/             # Extension popup UI (React components)
│   ├── background/        # Background service worker
│   └── shared/            # Shared utilities và modules
├── public/                # Static assets (icons, images)
├── package.json           # Dependencies và scripts
├── tsconfig.json          # TypeScript configuration với path aliases
└── README.md              # This file
```

## Architecture

The extension uses a **code reuse strategy** to maximize sharing with the frontend Next.js application:

- **Path Aliases:** TypeScript path aliases (`@/*` → `../frontend/src/*`) allow importing components, utilities, và types directly from the frontend codebase
- **Shared Components:** UI components (Button, Card, Dialog) are imported from `@/components/ui/`
- **Shared API Client:** API client logic is reused from `@/lib/api`
- **Shared State Management:** Zustand stores và React Query hooks are reused from frontend

See [docs/architecture-extension-suna.md](../../docs/architecture-extension-suna.md) for detailed architecture documentation.

## Setup Instructions

### Prerequisites

- Node.js 18+ và pnpm (matching frontend setup)
- Chrome/Edge browser (Manifest V3 compatible)

### Installation

1. **Install dependencies:**
   ```bash
   cd extension
   pnpm install
   ```

2. **Build configuration:**
   Build configuration will be set up in Story 10.3. For now, the basic structure is ready.

3. **Load extension in browser:**
   - Open Chrome/Edge
   - Navigate to `chrome://extensions/` (or `edge://extensions/`)
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select the `extension/` directory

## Development Workflow

### Current Status

- ✅ **Story 10.1:** Project structure setup (complete - review)
- ⏳ **Story 10.2:** Manifest configuration (ready-for-dev)
- ⏳ **Story 10.3:** Build configuration (ready-for-dev)
- ⏳ **Story 10.4:** Basic popup skeleton (ready-for-dev)

### Development Steps

1. **Story 10.1 (Current):** Setup project structure với directories, TypeScript config, package.json, và README
2. **Story 10.2:** Configure `manifest.json` với permissions, content scripts, background worker
3. **Story 10.3:** Setup build tool (Webpack/Vite) với path alias resolution và bundling
4. **Story 10.4:** Create basic popup HTML và React entry point

## Path Aliases

The extension uses TypeScript path aliases to import from the frontend:

```typescript
// Import UI components
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

// Import utilities
import { cn } from '@/lib/utils';

// Import API client
import { analyzeCoin } from '@/lib/api';
```

Path alias configuration is in `tsconfig.json`:
```json
{
  "paths": {
    "@/*": ["../frontend/src/*"]
  }
}
```

## Dependencies

Extension dependencies are aligned with frontend to ensure compatibility:

- **React 18+** - UI framework (matches frontend)
- **TypeScript 5+** - Type safety (matches frontend)
- **Tailwind CSS 4+** - Styling (matches frontend)
- **Radix UI** - Component primitives (matches frontend)
- **Zustand** - State management (matches frontend)
- **React Query** - Server state management (matches frontend)
- **Supabase JS** - Authentication và API client (matches frontend)

See `package.json` for complete dependency list.

## Build Process

Build configuration will be implemented in Story 10.3. The build process will:

1. Bundle content script, popup, và background worker
2. Resolve TypeScript path aliases
3. Include Tailwind CSS styles
4. Output to `dist/` directory for Chrome extension loading

## Testing

Testing strategy:

- **Unit tests:** Test utilities và shared modules
- **Integration tests:** Test extension components với frontend code
- **E2E tests:** Test extension functionality in browser

Test setup will be configured in later stories.

## Documentation

- **Architecture:** [docs/architecture-extension-suna.md](../../docs/architecture-extension-suna.md)
- **PRD:** [docs/PRD-extension.md](../../docs/PRD-extension.md)
- **Epics:** [docs/epics-extension.md](../../docs/epics-extension.md)

## Code Reuse

The extension maximizes code reuse from the frontend:

- **Target:** 95-98% code reuse
- **Strategy:** Path aliases + shared packages
- **Benefits:** Consistent UI/UX, faster development, easier maintenance

## Next Steps

1. Complete Story 10.1 setup
2. Configure manifest.json (Story 10.2)
3. Setup build configuration (Story 10.3)
4. Create basic popup skeleton (Story 10.4)

## Support

For questions or issues, refer to:
- Architecture documentation: `docs/architecture-extension-suna.md`
- Story context: `docs/stories/10-1-extension-project-structure-setup.context.xml`

