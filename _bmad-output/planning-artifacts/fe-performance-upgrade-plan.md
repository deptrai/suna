---
status: ready-for-implementation
createdAt: '2026-05-17'
scope: apps/web
type: performance-architecture
---

# Kế hoạch Nâng cấp & Tối ưu Frontend

**Mục tiêu:** Giảm thời gian load ban đầu (FCP/LCP), cải thiện TTI, tăng tốc dev iteration.

---

## 1. Bối cảnh & Phân tích Hiện trạng

### Stack hiện tại

| | Hiện tại | Mục tiêu |
|---|---|---|
| Next.js | 15.5.14 | **16.2.6** |
| React | ^18.x | **19.0.6** |
| Turbopack | dev only | dev + build (khi ổn định) |
| React Compiler | chưa dùng | enable (React 19) |

### Những gì đã tốt (giữ nguyên)
- `optimizePackageImports` trong `next.config.ts` cho lucide-react, framer-motion, recharts
- `lazy()` cho analytics (Analytics, SpeedInsights, GTM, PostHog) trong root layout
- Image optimization AVIF/WebP
- Turbopack dev mode
- Sentry/BetterStack skip trong dev

### Vấn đề phát hiện

**A. Heavy deps CHƯA được lazy load:**

| Thư viện | Kích thước ước tính | Dùng ở đâu |
|---|---|---|
| `mermaid` | ~2.5MB | `mermaid-renderer.tsx`, `code-block.tsx` |
| `@syncfusion/*` (6 packages) | ~3MB+ | `SpreadsheetApp.tsx`, `SpreadsheetViewer.tsx` |
| `@univerjs/preset-sheets-core` | ~2MB+ | Spreadsheet components |
| `three` + `@react-three/*` | ~1.2MB | `ChainLensBoxScene.tsx` (landing page!) |
| `pdfjs-dist` | ~3MB | PDF viewer |
| `konva` + `react-konva` | ~400KB | Canvas components |
| `@react-pdf/renderer` | ~800KB | PDF rendering |
| `gsap` | ~200KB | Animation |
| `sql.js` | ~1.5MB | SQL in browser |
| `ag-grid-community` + `ag-grid-react` | ~1.5MB | Grid components |

**B. loading.tsx coverage cực thấp:**
- **97 pages** nhưng chỉ có **3 loading.tsx** — hầu hết routes không có skeleton
- Người dùng thấy blank screen khi navigate giữa routes

**C. React 18 — chưa dùng React 19 improvements:**
- React Compiler chưa enable
- Server Components chưa được tận dụng triệt để (nhiều Client Components không cần thiết)

---

## 2. Chiến lược Upgrade

### Phase 1 — Next.js 16 + React 19 Upgrade (Ưu tiên cao)

**Tại sao làm trước:**
- Next.js 16.2.6 mang lại ~50% faster rendering và ~400% faster dev startup
- React 19 mang React Compiler — auto-memoization toàn bộ components
- Breaking changes cần xử lý trước khi làm bundle optimization

**Bước thực hiện:**

```bash
# Step 1: Upgrade React 18 → 19
pnpm up react@19.0.6 react-dom@19.0.6 @types/react@19 @types/react-dom@19

# Step 2: Upgrade Next.js 15 → 16
pnpm up next@16.2.6 eslint-config-next@16.2.6

# Step 3: Verify peer deps
pnpm install
```

**Breaking changes cần xử lý (Next.js 15 → 16):**

| Thay đổi | File bị ảnh hưởng | Cách fix |
|---|---|---|
| `cookies()`, `headers()` async API (đã async từ 15) | `apps/web/src/app/(dashboard)/layout.tsx` | Đã dùng `await cookies()` — OK |
| `params` và `searchParams` → `Promise<>` trong pages | Tất cả `page.tsx` dùng params | Thêm `await` hoặc dùng `use()` |
| `useRouter`, `useParams` thay đổi nhỏ | Session/thread pages | Verify từng file |

**Breaking changes cần xử lý (React 18 → 19):**

| Thay đổi | Cách fix |
|---|---|
| `ref` prop — không dùng `forwardRef` nữa | Tìm tất cả `forwardRef`, refactor sang function component |
| Context `value` required | Kiểm tra tất cả `<Context>` usage |
| `ReactDOM.render` deprecated | Kiểm tra có dùng không |
| `string ref` deprecated | Scan codebase |

**Cách verify sau upgrade:**
```bash
cd apps/web
bun run build          # phải pass
bun test src/...       # tất cả tests phải pass
bunx next dev          # launch app, check critical flows
```

---

### Phase 2 — Bundle Splitting (Sau khi upgrade xong)

**Nguyên tắc:** Mọi component > 200KB chưa dùng trên first paint **phải** được `dynamic()` hoặc `React.lazy()`.

#### 2.1 Mermaid — Chuyển sang dynamic

**File:** `apps/web/src/components/ui/mermaid-renderer.tsx`

```tsx
// Trước
import mermaid from 'mermaid';

// Sau — chỉ load khi component mount
const loadMermaid = () => import('mermaid').then(m => m.default);
```

#### 2.2 Syncfusion Spreadsheet — dynamic với SSR off

**File:** `apps/web/src/components/thread/epsilon-computer/components/SpreadsheetApp.tsx`

```tsx
// apps/web/src/components/thread/tool-views/spreadsheet/SpreadsheetViewer.tsx
import dynamic from 'next/dynamic';

const SpreadsheetViewer = dynamic(
  () => import('./SpreadsheetViewerInner'),
  { ssr: false, loading: () => <SpreadsheetSkeleton /> }
);
```

#### 2.3 Three.js — dynamic cho landing page

**File:** `apps/web/src/components/landing/ChainLensBoxScene.tsx`

```tsx
// Trong page.tsx yang memuat component này
const ChainLensBoxScene = dynamic(
  () => import('@/components/landing/ChainLensBoxScene'),
  { ssr: false, loading: () => <div className="h-[400px] bg-muted animate-pulse rounded-lg" /> }
);
```

#### 2.4 PDF.js — dynamic + worker config

```tsx
// apps/web/src/components/file-viewers/PdfViewer.tsx
import dynamic from 'next/dynamic';

const PdfViewerInner = dynamic(() => import('./PdfViewerInner'), {
  ssr: false,
  loading: () => <PdfSkeleton />,
});
```

#### 2.5 SQL.js — dynamic + web worker

```tsx
const SqlRunner = dynamic(() => import('./SqlRunner'), {
  ssr: false,
});
```

#### 2.6 AG Grid — dynamic

```tsx
const AgGridTable = dynamic(() => import('./AgGridTable'), {
  ssr: false,
  loading: () => <TableSkeleton />,
});
```

#### 2.7 optimizePackageImports mở rộng

Thêm vào `next.config.ts`:

```ts
optimizePackageImports: [
  'lucide-react',
  'framer-motion',
  '@radix-ui/react-icons',
  'recharts',
  'date-fns',
  '@tanstack/react-query',
  'react-icons',
  // Thêm mới:
  '@tiptap/core',
  '@tiptap/react',
  'gsap',
  'chart.js',
  'lowlight',
],
```

---

### Phase 3 — Loading States & Streaming (Cải thiện UX)

**Vấn đề:** 97 routes, chỉ 3 loading.tsx → blank screen khi navigate.

**Thêm loading.tsx cho các route groups quan trọng:**

```
apps/web/src/app/(dashboard)/loading.tsx          — dashboard skeleton
apps/web/src/app/(dashboard)/sessions/loading.tsx  — session list skeleton  
apps/web/src/app/(dashboard)/sessions/[sessionId]/loading.tsx — chat skeleton
apps/web/src/app/(dashboard)/settings/loading.tsx  — settings skeleton
apps/web/src/app/(dashboard)/markets/loading.tsx   — markets skeleton
apps/web/src/app/(home)/loading.tsx                — home skeleton
```

**Pattern chuẩn cho skeleton:**

```tsx
// apps/web/src/app/(dashboard)/loading.tsx
export default function DashboardLoading() {
  return (
    <div className="flex h-screen w-full animate-pulse">
      <div className="w-64 bg-muted/50 h-full" />
      <div className="flex-1 p-6 space-y-4">
        <div className="h-8 bg-muted/50 rounded w-1/3" />
        <div className="h-40 bg-muted/50 rounded" />
        <div className="h-40 bg-muted/50 rounded" />
      </div>
    </div>
  );
}
```

---

### Phase 4 — React Compiler (React 19)

**Sau khi upgrade React 19 xong:**

```ts
// next.config.ts
experimental: {
  reactCompiler: true, // auto-memoization toàn bộ components
  optimizePackageImports: [...],
},
```

**Lưu ý:** React Compiler sẽ auto-optimize `useMemo`, `useCallback` patterns. Cần audit các hooks tự viết để không có side-effects ngầm.

---

### Phase 5 — Server Components Migration (Nâng cao, sau cùng)

**Mục tiêu:** Chuyển các page/component không cần client state sang RSC.

**Candidates:**
- Market data display pages (static rendering)
- Settings pages (mostly forms, có thể split server/client)
- Documentation pages trong `/docs/`

**Không nên chuyển:**
- Chat interface (real-time state)
- Trading dashboard (WebSocket)
- Session view (live updates)

---

## 3. Thứ tự Triển khai

```
Sprint 1 (1-2 ngày):
  ├── Upgrade Next.js 16 + React 19
  ├── Fix breaking changes (params async, forwardRef)
  └── Verify build + tests pass

Sprint 2 (2-3 ngày):
  ├── Dynamic imports cho top 5 heaviest: mermaid, syncfusion, three.js, pdfjs, sql.js
  ├── Mở rộng optimizePackageImports
  └── Verify bundle size giảm (dùng next build --analyze hoặc @next/bundle-analyzer)

Sprint 3 (1 ngày):
  ├── Thêm loading.tsx cho 6 routes quan trọng
  └── Polish skeleton designs

Sprint 4 (1 ngày):
  ├── Enable React Compiler
  └── Smoke test toàn bộ app
```

---

## 4. Đo lường Thành công

| Metric | Hiện tại (ước tính) | Mục tiêu |
|---|---|---|
| First Contentful Paint | ~3-4s | < 1.5s |
| Time to Interactive | ~6-8s | < 3s |
| Initial JS bundle | ~2-4MB | < 800KB |
| Dev server startup | baseline | -60% (Next.js 16) |
| `next dev` HMR | baseline | -50% |

**Công cụ đo:**
```bash
# Bundle analysis
ANALYZE=true bun run build

# Lighthouse
bunx lighthouse http://localhost:3000 --output json
```

---

## 5. Rủi ro & Giảm thiểu

| Rủi ro | Xác suất | Cách giảm |
|---|---|---|
| Syncfusion + React 19 peer dep conflict | Cao | Kiểm tra trước, có thể cần pin version |
| `@univerjs` không support React 19 | Trung bình | Kiểm tra changelog, nếu không support → lazy + wrapper |
| `pdfjs-dist` 4.8.x compat | Thấp | Version đã stable |
| `ag-grid` breaking changes | Thấp | v35 đã support React 18/19 |
| `@sentry/nextjs` + Next.js 16 | Trung bình | Upgrade sentry lên version mới nhất cùng lúc |

**Trước khi bắt đầu — chạy compatibility check:**
```bash
cd apps/web
pnpm dlx @next/upgrade@latest check
```

---

## 6. Files Sẽ Thay Đổi (Tóm tắt)

**Phase 1 — Upgrade:**
- `apps/web/package.json` — version bumps
- `apps/web/next.config.ts` — react compiler, new experimental flags
- Các `page.tsx` dùng `params` → thêm `await`/`use()`

**Phase 2 — Bundle:**
- `apps/web/src/components/ui/mermaid-renderer.tsx`
- `apps/web/src/components/thread/tool-views/spreadsheet/SpreadsheetViewer.tsx`
- `apps/web/src/components/landing/ChainLensBoxScene.tsx`
- `apps/web/src/components/file-viewers/` (PDF)
- `apps/web/next.config.ts` (optimizePackageImports)

**Phase 3 — Loading:**
- `apps/web/src/app/(dashboard)/loading.tsx` (mới)
- `apps/web/src/app/(dashboard)/sessions/loading.tsx` (mới)
- `apps/web/src/app/(dashboard)/sessions/[sessionId]/loading.tsx` (mới)
- `apps/web/src/app/(home)/loading.tsx` (mới)
