# Suna.so Browser Extension

Browser extension cho phép user click vào tên coin trên bất kỳ website crypto và tạo agent chat mới để analyze coin.

## Project Structure

```
extension/
├── src/
│   ├── content-script/    # Content script cho coin detection và button injection
│   ├── sidepanel/         # Side panel UI với chat interface
│   ├── background/        # Background service worker cho message coordination
│   └── shared/            # Shared utilities và modules
├── public/                # Static assets (icons, etc.)
├── tsconfig.json          # TypeScript configuration với path aliases
├── package.json           # Dependencies và scripts
└── README.md              # This file
```

## Setup Instructions

### Prerequisites

- Node.js 18+ và npm/pnpm
- Frontend project đã được setup (dependencies cần thiết)

### Installation

1. **Install dependencies:**
   ```bash
   cd extension
   npm install
   # hoặc
   pnpm install
   ```

2. **Verify path aliases work:**
   ```bash
   # Test TypeScript compilation
   npx tsc --noEmit
   ```

3. **Build extension:**
   ```bash
   npm run build
   ```

## Build Process

Extension sử dụng webpack để bundle code:

- **Development mode:**
  ```bash
  npm run dev
  ```
  - Watch mode enabled
  - Source maps included
  - Faster rebuild times

- **Production mode:**
  ```bash
  npm run build
  ```
  - Optimized bundle
  - Minified code
  - Tree-shaking enabled

## Development Workflow

1. **Make changes** trong `src/` directory
2. **Run dev build** với `npm run dev` (watch mode)
3. **Load extension** vào Chrome:
   - Open Chrome → Extensions (chrome://extensions/)
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select `extension/dist/` directory
4. **Test changes** trên crypto websites (CoinGecko, Binance, etc.)
5. **Rebuild** khi cần với `npm run build`

## Code Reuse Strategy

Extension sử dụng TypeScript path aliases để import trực tiếp từ frontend:

```typescript
// Extension code
import { Button } from '@/components/ui/button';  // From frontend
import { unifiedAgentStart } from '@/lib/api';    // From frontend
import { cn } from '@/lib/utils';                 // From frontend
```

Path alias `@/*` maps to `../frontend/src/*` trong `tsconfig.json`.

## Key Dependencies

- **React 18+** - UI framework (matches frontend)
- **TypeScript 5+** - Type safety (matches frontend)
- **Tailwind CSS 4+** - Styling (matches frontend)
- **Radix UI** - UI components (matches frontend)
- **Zustand** - State management (matches frontend)
- **React Query** - Server state management (matches frontend)
- **Supabase** - Authentication và backend (matches frontend)

## Architecture

Extension được thiết kế để:
- ✅ Maximize code reuse từ frontend (~95-98%)
- ✅ Provide consistent UI/UX với main app
- ✅ Support side panel UI (không phải popup)
- ✅ Enable coin detection và analysis từ bất kỳ website crypto

Xem thêm architecture details trong:
- [Architecture Document](../../docs/extensions/epic-prd-architecture/architecture-extension-suna.md)
- [PRD](../../docs/extensions/epic-prd-architecture/PRD-extension.md)
- [Epics](../../docs/extensions/epic-prd-architecture/epics-extension.md)

## Testing

### Manual Testing

1. **Path alias resolution:**
   ```bash
   # Verify TypeScript can resolve imports
   npx tsc --noEmit
   ```

2. **Folder structure:**
   ```bash
   # Verify all required folders exist
   ls -la src/
   # Should show: content-script/, sidepanel/, background/, shared/
   ```

3. **Dependencies:**
   ```bash
   # Verify all dependencies install correctly
   npm install
   ```

## Troubleshooting

### Path alias không resolve

- Verify `tsconfig.json` có path alias `@/*` → `../frontend/src/*`
- Verify frontend `src/` directory exists
- Check TypeScript version matches frontend

### Dependencies không match

- Check `package.json` versions match `frontend/package.json`
- Verify React, TypeScript, Tailwind versions match

### Build fails

- Check webpack configuration
- Verify all required dependencies installed
- Check for TypeScript errors với `npx tsc --noEmit`

## Next Steps

1. ✅ Story 10.1: Project structure setup (Complete)
2. ⏳ Story 10.2: Manifest configuration
3. ⏳ Story 10.3: Build configuration
4. ⏳ Story 10.4: Basic side panel skeleton

## Links

- [Architecture Document](../../docs/extensions/epic-prd-architecture/architecture-extension-suna.md)
- [PRD](../../docs/extensions/epic-prd-architecture/PRD-extension.md)
- [Epics](../../docs/extensions/epic-prd-architecture/epics-extension.md)
- [Stories](../../docs/extensions/stories/)


