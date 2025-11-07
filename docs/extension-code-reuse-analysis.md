# Extension Code Reuse Analysis - Chi tiết

**Date:** 2025-11-07  
**Purpose:** Phân tích chi tiết về khả năng reuse code từ frontend cho extension

---

## ✅ CÓ THỂ REUSE (100% Compatible)

### 1. **UI Components (Radix UI)**

**Status:** ✅ **Hoàn toàn có thể reuse**

**Lý do:**
- Radix UI là pure React components, không phụ thuộc Next.js
- Chỉ cần React 18+ và CSS
- Không có server-side dependencies

**Components có thể reuse:**
```typescript
// Tất cả components từ frontend/src/components/ui/
- Button
- Card, CardHeader, CardContent
- Dialog
- Input, Textarea
- Select, DropdownMenu
- Tabs, Accordion
- Tooltip, Popover
- ... (tất cả Radix UI components)
```

**Cách reuse:**
```typescript
// extension/popup/coin-analysis.tsx
import { Button } from '@/components/ui/button';  // Direct import
import { Card } from '@/components/ui/card';
```

**Dependencies cần có:**
- `@radix-ui/*` packages (đã có trong frontend)
- `react`, `react-dom`
- `tailwindcss`, `class-variance-authority`, `clsx`, `tailwind-merge`

---

### 2. **Utilities Functions**

**Status:** ✅ **Hoàn toàn có thể reuse**

**Utilities có thể reuse:**
```typescript
// frontend/src/lib/utils.ts
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// frontend/src/lib/error-handler.ts
export function handleApiError(err: any, context: {...}) {
  // Error handling logic
}

// frontend/src/lib/validation.ts
// Validation utilities
```

**Cách reuse:**
```typescript
// extension/lib/utils.ts
export { cn } from '@/lib/utils';
export { handleApiError } from '@/lib/error-handler';
```

**Dependencies:**
- `clsx`, `tailwind-merge` (đã có)
- Không có Next.js dependencies

---

### 3. **Type Definitions**

**Status:** ✅ **Hoàn toàn có thể reuse**

**Types có thể reuse:**
```typescript
// Tất cả TypeScript types và interfaces
- Project, Thread, Message types
- API response types
- Component prop types
```

**Cách reuse:**
```typescript
// extension/src/types.ts
export type { Project, Thread, Message } from '@/lib/api';
```

---

### 4. **State Management (Zustand)**

**Status:** ✅ **Có thể reuse với minor adaptations**

**Zustand stores có thể reuse:**
```typescript
// frontend/src/lib/stores/model-store.ts
export const useModelStore = create<ModelStore>()(
  persist(
    (set) => ({...}),
    {
      name: 'chainlens-model-selection-v3',
      storage: createJSONStorage(() => localStorage), // ⚠️ Cần thay đổi
    }
  )
);
```

**Adaptation cần thiết:**
- Thay `localStorage` bằng `chrome.storage` cho persistence
- Hoặc tạo storage adapter

**Cách reuse:**
```typescript
// extension/lib/stores/model-store-extension.ts
import { useModelStore as useModelStoreBase } from '@/lib/stores/model-store';

// Create extension-specific storage adapter
const chromeStorage = {
  getItem: async (key: string) => {
    const result = await chrome.storage.local.get(key);
    return result[key] || null;
  },
  setItem: async (key: string, value: string) => {
    await chrome.storage.local.set({ [key]: value });
  },
  removeItem: async (key: string) => {
    await chrome.storage.local.remove(key);
  },
};

// Reuse store logic, chỉ thay storage
export const useModelStore = create<ModelStore>()(
  persist(
    (set) => ({...}), // Same logic
    {
      name: 'chainlens-model-selection-v3',
      storage: createJSONStorage(() => chromeStorage), // Extension storage
    }
  )
);
```

---

### 5. **React Query Hooks**

**Status:** ✅ **Có thể reuse với minor adaptations**

**Hooks có thể reuse:**
```typescript
// frontend/src/hooks/react-query/threads/use-threads.ts
export function useThreadQuery(threadId: string) {
  return useQuery({
    queryKey: ['thread', threadId],
    queryFn: () => getThread(threadId),
  });
}
```

**Adaptation cần thiết:**
- QueryClient setup (có thể reuse)
- API calls (cần adapt authentication)

**Cách reuse:**
```typescript
// extension/hooks/use-threads.ts
import { useThreadQuery as useThreadQueryBase } from '@/hooks/react-query/threads/use-threads';

// Reuse hook logic, chỉ cần ensure QueryClient provider
export function useThreadQuery(threadId: string) {
  // Hook logic giống hệt, chỉ cần wrap trong QueryClientProvider
  return useThreadQueryBase(threadId);
}
```

---

## ⚠️ CẦN ADAPT (Partial Reuse)

### 1. **API Client**

**Status:** ⚠️ **Có thể reuse nhưng cần adaptations**

**Code hiện tại:**
```typescript
// frontend/src/lib/api.ts
export const getProjects = async (): Promise<Project[]> => {
  const supabase = createClient(); // Uses browser localStorage
  // ... API logic
};
```

**Adaptations cần thiết:**

**A. Authentication Storage:**
```typescript
// Extension cần dùng chrome.storage thay vì localStorage
// frontend/src/lib/supabase/client.ts sử dụng localStorage
// Extension cần custom Supabase client với chrome.storage
```

**B. CORS Handling:**
- Extension có different CORS rules
- Có thể cần background worker làm proxy

**C. Fetch API:**
- Extension có thể cần special headers
- Background worker có thể cần làm proxy cho content script

**Cách reuse:**
```typescript
// extension/lib/api-extension.ts
import { getProjects as getProjectsBase } from '@/lib/api';

// Wrap với extension-specific auth
export const getProjects = async (): Promise<Project[]> => {
  const token = await getAuthTokenFromChromeStorage();
  // Reuse API logic, chỉ thay auth method
  return getProjectsBase(); // Với custom auth
};
```

**Hoặc extract shared logic:**
```typescript
// packages/shared-api/src/api.ts
export async function fetchProjects(authToken: string): Promise<Project[]> {
  // Pure API logic, không phụ thuộc storage
  return fetch(`${API_URL}/projects`, {
    headers: { 'Authorization': `Bearer ${authToken}` },
  });
}

// Frontend wrapper
export const getProjects = async () => {
  const token = await getTokenFromLocalStorage();
  return fetchProjects(token);
};

// Extension wrapper
export const getProjects = async () => {
  const token = await getTokenFromChromeStorage();
  return fetchProjects(token);
};
```

---

### 2. **Supabase Client**

**Status:** ⚠️ **Cần custom implementation**

**Vấn đề:**
- `@supabase/ssr` package dành cho Next.js
- Extension cần browser client với chrome.storage

**Solution:**
```typescript
// extension/lib/supabase-extension.ts
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

// Custom storage adapter cho chrome.storage
const chromeStorageAdapter = {
  getItem: async (key: string) => {
    const result = await chrome.storage.local.get(key);
    return result[key] || null;
  },
  setItem: async (key: string, value: string) => {
    await chrome.storage.local.set({ [key]: value });
  },
  removeItem: async (key: string) => {
    await chrome.storage.local.remove(key);
  },
};

export function createClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        storage: chromeStorageAdapter,
        autoRefreshToken: true,
        persistSession: true,
      },
    }
  );
}
```

---

## ❌ KHÔNG THỂ REUSE (Next.js Specific)

### 1. **Next.js Routing**

**Status:** ❌ **Không thể reuse**

**Next.js specific:**
- `useRouter()`, `usePathname()`, `useSearchParams()`
- App Router structure
- Server Components

**Alternative cho Extension:**
- Use React Router hoặc simple state management
- Extension không cần complex routing (chỉ popup/sidebar)

---

### 2. **Next.js Server Components**

**Status:** ❌ **Không thể reuse**

**Next.js specific:**
- Server Components chỉ chạy trên server
- Extension chạy hoàn toàn client-side

**Impact:**
- Không ảnh hưởng vì extension chỉ cần client components
- Tất cả components trong `components/ui/` đều là client components (`'use client'`)

---

### 3. **Next.js API Routes**

**Status:** ❌ **Không thể reuse**

**Next.js specific:**
- `/app/api/` routes chỉ chạy trên Next.js server
- Extension không thể call Next.js API routes trực tiếp

**Solution:**
- Extension call backend API trực tiếp (không qua Next.js)
- Hoặc call Next.js API như external API (cần CORS config)

---

### 4. **Next.js Specific Hooks**

**Status:** ❌ **Không thể reuse**

**Hooks không thể reuse:**
```typescript
import { useRouter } from 'next/navigation';        // ❌
import { usePathname } from 'next/navigation';      // ❌
import { useSearchParams } from 'next/navigation'; // ❌
```

**Impact:**
- Chỉ ảnh hưởng components sử dụng routing
- UI components (`components/ui/`) không dùng routing → ✅ Reuse được

---

### 5. **Next.js Middleware**

**Status:** ❌ **Không thể reuse**

**Next.js specific:**
- `middleware.ts` chỉ chạy trên Next.js server
- Extension không có middleware concept

**Impact:**
- Không ảnh hưởng vì extension không cần middleware

---

## 📊 Code Reuse Summary

### Reuse Percentage Estimate

| Category | Reuse % | Notes |
|----------|---------|-------|
| **UI Components** | 100% | Tất cả Radix UI components |
| **Utilities** | 100% | cn(), error handlers, validation |
| **Types** | 100% | Tất cả TypeScript types |
| **State Management** | 90% | Zustand stores, chỉ cần adapt storage |
| **React Query Hooks** | 85% | Hooks logic, chỉ cần setup QueryClient |
| **API Client Logic** | 70% | Core logic, cần adapt auth & storage |
| **Supabase Client** | 50% | Cần custom storage adapter |
| **Next.js Features** | 0% | Routing, Server Components, etc. |

**Overall Estimated Reuse: ~75-80%**

---

## 🛠️ Implementation Strategies

### Strategy 1: Monorepo Shared Packages (Recommended)

**Structure:**
```
suna/
├── packages/
│   ├── shared-ui/          # UI components (100% reusable)
│   ├── shared-api/         # API client logic (70% reusable)
│   ├── shared-utils/       # Utilities (100% reusable)
│   └── shared-types/       # Types (100% reusable)
├── frontend/               # Next.js app (uses shared packages)
└── extension/              # Extension (uses shared packages)
```

**Pros:**
- Maximum code reuse
- Type safety across packages
- Independent versioning
- Clear separation

**Cons:**
- Cần setup monorepo (pnpm workspaces, npm workspaces, etc.)
- More complex build setup

---

### Strategy 2: Direct Import với Path Aliases (Simpler)

**Structure:**
```
suna/
├── frontend/               # Next.js app
│   └── src/
│       └── lib/           # Shared code (as-is)
└── extension/              # Extension
    ├── tsconfig.json      # Path aliases to frontend
    └── webpack.config.js  # Resolve frontend modules
```

**tsconfig.json:**
```json
{
  "compilerOptions": {
    "paths": {
      "@/components/*": ["../frontend/src/components/*"],
      "@/lib/*": ["../frontend/src/lib/*"],
      "@/hooks/*": ["../frontend/src/hooks/*"]
    }
  }
}
```

**webpack.config.js:**
```javascript
module.exports = {
  resolve: {
    alias: {
      '@/components': path.resolve(__dirname, '../frontend/src/components'),
      '@/lib': path.resolve(__dirname, '../frontend/src/lib'),
    },
  },
};
```

**Pros:**
- Simpler setup
- No monorepo needed
- Direct code sharing

**Cons:**
- Tighter coupling
- Harder to version independently
- Build dependencies

---

### Strategy 3: Build-time Copy (MVP Approach)

**Structure:**
```
suna/
├── frontend/               # Next.js app
└── extension/              # Extension
    └── scripts/
        └── copy-shared.js # Copy shared files on build
```

**Build script:**
```javascript
// extension/scripts/copy-shared.js
const fs = require('fs');
const path = require('path');

// Copy UI components
fs.cpSync(
  '../frontend/src/components/ui',
  './src/shared/components/ui',
  { recursive: true }
);

// Copy utilities
fs.cpSync(
  '../frontend/src/lib/utils.ts',
  './src/shared/lib/utils.ts'
);
```

**Pros:**
- Simplest approach
- No build complexity
- Works immediately

**Cons:**
- Code duplication
- Manual sync needed
- More maintenance

---

## ✅ Recommended Approach

**For MVP:** Strategy 2 (Direct Import với Path Aliases)
- Fastest to implement
- Good code reuse
- Simple setup

**For Production:** Strategy 1 (Monorepo Shared Packages)
- Best long-term maintainability
- Maximum code reuse
- Type safety

---

## 📝 Code Reuse Checklist

### ✅ Ready to Reuse (No Changes Needed)

- [x] All `components/ui/*` components (Radix UI)
- [x] `lib/utils.ts` - cn() và utilities
- [x] `lib/error-handler.ts` - Error handling
- [x] All TypeScript types
- [x] React Query hooks logic (chỉ cần QueryClient setup)

### ⚠️ Needs Adaptation

- [ ] Zustand stores (storage adapter)
- [ ] API client (auth method)
- [ ] Supabase client (storage adapter)
- [ ] React Query setup (QueryClient provider)

### ❌ Cannot Reuse

- [ ] Next.js routing hooks
- [ ] Server Components
- [ ] Next.js API routes
- [ ] Next.js middleware

---

## 🎯 Conclusion

**Extension CÓ THỂ reuse ~75-80% code từ frontend:**

1. **100% UI Components** - Tất cả Radix UI components
2. **100% Utilities** - cn(), error handlers, validation
3. **90% State Management** - Zustand stores với storage adapter
4. **85% React Query** - Hooks với QueryClient setup
5. **70% API Client** - Core logic với auth adaptation

**Chỉ cần adapt:**
- Storage (localStorage → chrome.storage)
- Authentication (Supabase client với chrome.storage)
- Routing (không cần, extension đơn giản hơn)

**Không thể reuse:**
- Next.js specific features (routing, server components, etc.)
- Nhưng extension không cần những features này

**Kết luận:** Extension có thể reuse phần lớn code từ frontend, đặc biệt là UI components và utilities. Chỉ cần minor adaptations cho storage và authentication.

---

_Analysis Date: 2025-11-07_  
_Architect: Winston (BMAD Architect Agent)_

