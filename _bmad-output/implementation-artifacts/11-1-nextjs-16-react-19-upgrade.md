# Story 11.1: Next.js 16 + React 19 Upgrade

Status: done

## Story

As a developer,
I want Next.js và React được nâng cấp lên phiên bản mới nhất (Next.js 16.x + React 19.x) với toàn bộ breaking changes được fix,
so that team được hưởng ~50% faster rendering, ~400% faster dev server startup, và nền tảng để bật React Compiler ở Story 11.4.

## Acceptance Criteria

**AC1 — Package upgrade thành công**
- **Given** `apps/web/package.json` hiện có `next: "15.5.14"`, `react: "^18"`, `react-dom: "^18"`, `@types/react: "^18"`, `@types/react-dom: "^18"`, `eslint-config-next: "15.2.2"`
- **When** upgrade command được chạy (xem Tasks)
- **Then** `package.json` phản ánh versions mới và `pnpm install` thành công không có unresolvable peer dependency errors

> ⚠️ **Version verification required (F1):** Verify latest stable versions trên npmjs.com trước khi chạy — `next@16.x` và `react@19.x` là targets. Sau install, chạy `pnpm install --dry-run` để detect peer dep conflicts với `@sentry/nextjs ^10.47.0`, `framer-motion ^12.6.5`, `react-hook-form ^7.62.0`, `@logtail/next ^0.3.1`, `fumadocs-mdx 11.10.1` trước khi commit.

**AC2 — params/searchParams async migration**
- **Given** Next.js 16 yêu cầu `params` và `searchParams` là `Promise<>` trong page components
- **When** tất cả `page.tsx` files sử dụng `params` hoặc `searchParams` được scan
- **Then** mỗi file đã được cập nhật dùng `await params` hoặc React 19's `use(params)` — không còn synchronous access

> ℹ️ **Pre-verified (F2):** Tất cả dynamic route pages đã dùng async params pattern. Client components dùng `useParams()`/`useSearchParams()` được miễn. AC này sẽ pass ngay sau upgrade — chỉ cần verify bằng `bun run build`.

**AC3 — forwardRef migration**
- **Given** React 19 deprecates `React.forwardRef()`
- **When** codebase được scan cho pattern `forwardRef(`
- **Then** tất cả 7 components đã được refactor sang function component với `ref` là regular prop

> ℹ️ **7 files đã xác định (F3):** `ui/resizable.tsx`, `ui/command.tsx`, `ui/phone-input.tsx`, `home/github-button.tsx`, `epsilon/mention-textarea.tsx`, `session/question-prompt.tsx`, `session/pty-terminal.tsx`

**AC4 — Build pass**
- **Given** tất cả upgrades và breaking change fixes đã xong
- **When** `bun run build` được chạy trong `apps/web`
- **Then** build hoàn thành thành công với 0 TypeScript errors và 0 build errors

**AC5 — Tests pass**
- **Given** tất cả upgrades đã xong
- **When** `bun test src/...` được chạy trong `apps/web`
- **Then** tất cả tests pass với 0 failures (zero regression)

## Tasks / Subtasks

- [ ] **Task 1: Pre-upgrade compatibility check** (AC1)
  - [ ] 1.1 Chạy `pnpm dlx @next/upgrade@latest check` từ `apps/web` để detect breaking changes
  - [ ] 1.2 Verify latest stable versions: `npm view next version`, `npm view react version`
  - [ ] 1.3 Check peer dep compatibility: `@sentry/nextjs`, `framer-motion`, `react-hook-form`, `@logtail/next`, `fumadocs-mdx 11.10.1`

- [ ] **Task 2: Upgrade packages** (AC1)
  - [ ] 2.1 Upgrade React: `pnpm up react@19 react-dom@19 @types/react@19 @types/react-dom@19 --filter apps/web`
  - [ ] 2.2 Upgrade Next.js: `pnpm up next@16 eslint-config-next@16 --filter apps/web`
  - [ ] 2.3 Upgrade Sentry nếu cần: `pnpm up @sentry/nextjs@latest --filter apps/web`
  - [ ] 2.4 Chạy `pnpm install` và resolve tất cả peer dep warnings

- [ ] **Task 3: Fix forwardRef (7 files)** (AC3)
  - [ ] 3.1 `apps/web/src/components/ui/resizable.tsx` — refactor `ResizablePanel` forwardRef → function component với `ref` prop
  - [ ] 3.2 `apps/web/src/components/ui/command.tsx` — refactor `CommandPopoverTrigger` forwardRef
  - [ ] 3.3 `apps/web/src/components/ui/phone-input.tsx` — refactor 2 forwardRef instances (`PhoneInput` + `InputComponent`)
  - [ ] 3.4 `apps/web/src/components/home/github-button.tsx` — refactor `GithubButton` forwardRef
  - [ ] 3.5 `apps/web/src/components/epsilon/mention-textarea.tsx` — refactor `MentionTextarea` forwardRef
  - [ ] 3.6 `apps/web/src/components/session/question-prompt.tsx` — refactor `QuestionPrompt` forwardRef (có `useImperativeHandle`)
  - [ ] 3.7 `apps/web/src/components/session/pty-terminal.tsx` — refactor `PtyTerminal` forwardRef (có `useImperativeHandle`)

- [ ] **Task 4: Verify params/searchParams** (AC2)
  - [ ] 4.1 Chạy `grep -r "params" apps/web/src/app --include="page.tsx" -l` để confirm không còn sync access
  - [ ] 4.2 Verify client components dùng `useParams()`/`useSearchParams()` không bị ảnh hưởng

- [ ] **Task 5: Build & test verification** (AC4, AC5)
  - [ ] 5.1 `cd apps/web && bun run build` — phải pass 0 errors
  - [ ] 5.2 `bun test src/...` — tất cả tests pass
  - [ ] 5.3 `bun run dev` — launch app, verify critical flows: dashboard → session → markets → settings

## Dev Notes

### Scope
Chỉ `apps/web`. Không touch `apps/api`, `apps/mobile`, `core/epsilon-master`.

### Upgrade Command Reference

```bash
cd apps/web

# Step 1: Check compatibility
pnpm dlx @next/upgrade@latest check

# Step 2: Upgrade React 18 → 19
pnpm up react@19 react-dom@19 @types/react@19 @types/react-dom@19

# Step 3: Upgrade Next.js 15 → 16
pnpm up next@16 eslint-config-next@16

# Step 4: Upgrade Sentry (likely needs update for Next.js 16 compat)
pnpm up @sentry/nextjs@latest

# Step 5: Install & check
pnpm install
```

### forwardRef Migration Pattern (React 19)

React 19 cho phép `ref` là regular prop — không cần `forwardRef` wrapper nữa.

**Pattern cũ:**
```tsx
const MyComponent = React.forwardRef<HTMLDivElement, Props>(
  ({ children, ...props }, ref) => {
    return <div ref={ref} {...props}>{children}</div>;
  }
);
MyComponent.displayName = 'MyComponent';
```

**Pattern mới (React 19):**
```tsx
function MyComponent({ children, ref, ...props }: Props & { ref?: React.Ref<HTMLDivElement> }) {
  return <div ref={ref} {...props}>{children}</div>;
}
```

**Lưu ý quan trọng cho `useImperativeHandle`:**
`question-prompt.tsx` và `pty-terminal.tsx` dùng `useImperativeHandle` — pattern mới:
```tsx
function PtyTerminal({ ref, ...props }: PtyTerminalProps & { ref?: React.Ref<PtyTerminalHandle> }) {
  useImperativeHandle(ref, () => ({ ... }));
  // ...
}
```

### Breaking Changes Đã Được Xử Lý (Pre-verified)

| Thay đổi | Status | Ghi chú |
|---|---|---|
| `cookies()`, `headers()` async | ✅ Đã OK | `layout.tsx` đã dùng `await cookies()` |
| `params` → `Promise<>` trong pages | ✅ Đã OK | Tất cả dynamic pages đã async |
| `useParams()`/`useSearchParams()` client | ✅ Không cần migrate | Client components exempt |
| `ReactDOM.render` deprecated | ✅ Không dùng | Scan confirm không có |
| `forwardRef` deprecated | ⚠️ Cần fix | 7 files — xem Task 3 |
| Context `value` required | ✅ Không ảnh hưởng | Tất cả contexts đã có default value |

### Peer Dependency Risk Assessment

| Package | Risk | Ghi chú |
|---|---|---|
| `@sentry/nextjs ^10.47.0` | MEDIUM | Upgrade lên latest cùng lúc |
| `framer-motion ^12.6.5` | LOW | v12 đã support React 19 |
| `react-hook-form ^7.62.0` | LOW | v7.x đã support React 19 |
| `@logtail/next ^0.3.1` | MEDIUM | Verify compat với Next.js 16 |
| `fumadocs-mdx 11.10.1` | MEDIUM | Pinned version — check changelog |
| `@radix-ui/*` | LOW | v1.x đã support React 19 |
| `@tanstack/react-query ^5.75.2` | LOW | v5 đã support React 19 |

### Testing

Không cần viết test mới cho story này — đây là upgrade/refactor. Verify bằng:
1. `bun run build` — TypeScript + build errors
2. `bun test src/...` — regression suite
3. Manual smoke test: dashboard → session → markets → settings

### Project Structure Notes

- Tất cả changes trong `apps/web/` — monorepo root `pnpm-workspace.yaml` không thay đổi
- `apps/web/package.json` — version bumps
- 7 component files — forwardRef refactor
- `apps/web/next.config.ts` — KHÔNG thay đổi trong story này (React Compiler là Story 11.4)

### References

- [fe-performance-upgrade-plan.md](../planning-artifacts/fe-performance-upgrade-plan.md) — Phase 1 upgrade strategy
- [epics.md — Epic 11 Story 11.1](../planning-artifacts/epics.md) — ACs với spec review notes (F1–F3)
- [next.config.ts](../../apps/web/next.config.ts) — current config (không thay đổi trong story này)
- [apps/web/package.json](../../apps/web/package.json) — current deps

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Completion Notes List

- next@16.2.6, react@19.2.6, react-dom@19.2.6, @types/react@19.2.15, @types/react-dom@19.2.3, eslint-config-next@16.2.6, @sentry/nextjs@10.53.1 — all upgraded
- `@next/upgrade` package does not exist on npm — skipped, manual version check used instead
- fumadocs-mdx pinned at 11.10.1 (major bump to 15.x not taken — too risky alongside React/Next upgrade)
- Peer dep warnings: majority are @types/react@^18 unmet peers from radix-ui, tiptap, fumadocs — cosmetic/type-only, not blocking. Runtime-concern packages (cmdk@0.2.1, @emoji-mart/react@1.1.1, react-day-picker@8.10.1) still declare react@^18 but work at runtime with React 19
- 7 forwardRef → function component with `ref` prop: resizable.tsx, command.tsx, phone-input.tsx (×2), github-button.tsx, mention-textarea.tsx, question-prompt.tsx, pty-terminal.tsx
- AC2 (params/searchParams): all dynamic pages already use async pattern or `useParams()` client hook — no changes needed
- Build: `bun run build` → 0 errors, 81 pages generated (Next.js 16.2.6 Turbopack)
- Tests: 248/248 pass, 0 fail

### File List

- apps/web/package.json
- apps/web/src/components/ui/resizable.tsx
- apps/web/src/components/ui/command.tsx
- apps/web/src/components/ui/phone-input.tsx
- apps/web/src/components/home/github-button.tsx
- apps/web/src/components/epsilon/mention-textarea.tsx
- apps/web/src/components/session/question-prompt.tsx
- apps/web/src/components/session/pty-terminal.tsx
