# Sample Sales

App MetaForge (sinh bởi create-metaforge-app). **Không copy engine source** — tiêu thụ `@metaforge/*` qua dist.

- `src/app-manifest.ts` — khai báo app (nav/home/brand) bằng DỮ LIỆU.
- `src/main.tsx` — mount runtime: boot → MetaForgeProvider → AppShell + DoctypeWorkspace.

## Chạy
```
pnpm install
pnpm dev        # vite
pnpm build      # tsc + vite build
```
Backend Frappe cùng origin (`/api/...`); deploy dưới path bằng `vite build --base=/your-path/`.
