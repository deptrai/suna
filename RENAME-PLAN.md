# Rename Plan: ChainLens → ChainLens, Epsilon → Epsilon

Branch: `feat/rename-chainlens-epsilon`

## Mapping Table

| Pattern | Replacement | Scope |
|---------|-------------|-------|
| `CHAINLENS` | `CHAINLENS` | env vars, constants |
| `ChainLens` | `ChainLens` | display names, titles |
| `chainlens` | `chainlens` | package names, paths, slugs |
| `EPSILON` | `EPSILON` | env vars, constants |
| `Epsilon` | `Epsilon` | display names, titles |
| `epsilon` | `epsilon` | package names, paths, slugs |
| `@epsilon/` | `@epsilon/` | npm package scope |
| `epsilon-ai/chainlens` | `chainlens-ai/chainlens` | GitHub org/repo |
| `epsilon.com` | `chainlens.net` | domain |
| `epsilon.ai` | `chainlens.net` | domain |
| `epsilon.cloud` | `chainlens.net` | domain |
| `epsilon-sandbox` → was `epsilon-sandbox` | Docker container name |

## Folder / File Renames

| From | To |
|------|----|
| `core/epsilon-master/` | `core/epsilon-master/` |
| `core/s6-services/svc-epsilon-master` | `core/s6-services/svc-epsilon-master` |
| `core/scripts/epsilon-opencode-state` | `core/scripts/epsilon-opencode-state` |
| `core/init-scripts/epsilon-env-setup.sh` | `core/init-scripts/epsilon-env-setup.sh` |
| `packages/epsilon-ocx-registry/` | `packages/epsilon-ocx-registry/` |
| `scripts/get-epsilon.sh` | `scripts/get-epsilon.sh` |
| `apps/web/src/stores/epsilon-computer-store.ts` | `apps/web/src/stores/epsilon-computer-store.ts` |
| `apps/web/src/lib/utils/epsilon-system-tags.ts` | `apps/web/src/lib/utils/epsilon-system-tags.ts` |
| `apps/web/src/lib/utils/epsilon-tool-output.ts` | `apps/web/src/lib/utils/epsilon-tool-output.ts` |
| `apps/web/src/lib/adapters/opencode-to-epsilon-computer.ts` | `apps/web/src/lib/adapters/opencode-to-epsilon-computer.ts` |
| `apps/web/src/components/epsilon/` | `apps/web/src/components/epsilon/` |
| `apps/web/src/hooks/epsilon/` | `apps/web/src/hooks/epsilon/` |
| `apps/web/src/lib/epsilon/` | `apps/web/src/lib/epsilon/` |
| `apps/web/src/components/ui/epsilon-icons.ts` | `apps/web/src/components/ui/epsilon-icons.ts` |
| `apps/web/src/components/ui/epsilon-loader.tsx` | `apps/web/src/components/ui/epsilon-loader.tsx` |
| `apps/web/src/components/sidebar/epsilon-logo.tsx` | `apps/web/src/components/sidebar/epsilon-logo.tsx` |
| `apps/web/src/components/thread/epsilon-computer/` | `apps/web/src/components/thread/epsilon-computer/` |
| `apps/web/src/lib/utils/epsilon-system-tags.ts` | `apps/web/src/lib/utils/epsilon-system-tags.ts` |
| `core/epsilon-master/src/services/epsilon-user-context.ts` | → `epsilon-user-context.ts` |
| `core/epsilon-master/src/services/epsilon-user-middleware.ts` | → `epsilon-user-middleware.ts` |
| `core/epsilon-master/opencode/plugin/epsilon-system/` | → `plugin/epsilon-system/` |
| `core/epsilon-master/opencode/epsilon-system.md` | → `epsilon-system.md` |
| `apps/api/src/routes/epsilon-projects.ts` | → `epsilon-projects.ts` |
| `apps/api/src/shared/epsilon-user-context.ts` | → `epsilon-user-context.ts` |
| `apps/api/src/__tests__/unit-epsilon-projects-security.test.ts` | → `unit-epsilon-projects-security.test.ts` |
| `packages/db/src/schema/epsilon.ts` | → `epsilon.ts` |
| `apps/mobile/stores/epsilon-computer-store.ts` | → `epsilon-computer-store.ts` |
| `apps/mobile/lib/epsilon/` | → `lib/epsilon/` |
| `apps/mobile/components/epsilon-computer/` | → `components/epsilon-computer/` |
| `apps/web/src/components/thread/tool-views/spreadsheet/epsilon-spreadsheet-styles.css` | keep name (internal style) |

## Database

- Supabase `project_id`: `epsilon-local` → `epsilon-local`
- Supabase schema: `epsilon` → `epsilon` (migration required)
- `NEXT_PUBLIC_SANDBOX_ID` / `SANDBOX_CONTAINER_NAME`: `epsilon-sandbox` → `epsilon-sandbox`

## Steps Executed

- [x] Create branch
- [ ] Text replacements (sed pass)
- [ ] Folder/file renames
- [ ] DB schema migration
- [ ] Update supabase config.toml
- [ ] Update .env files
- [ ] Restart services
- [ ] Smoke-test
