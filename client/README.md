# MetaForge

Engine React **meta-driven** copy 1:1 hành vi metadata-driven của Frappe/ERPNext **Desk**, chạy trên backend **Frappe v16 headless**. Đầu ra: **engine kit tái dùng** (`@metaforge/*`) + app demo + CLI sinh app mới + module nghiệp vụ thật (kho APHVH WMS) minh chứng deploy công khai.

## Monorepo (pnpm workspaces)

```
packages/
  core/               @metaforge/core             — types (meta/doc/error) + fieldtype registry + resolveMeta/normalize/serialize + app/manifest, THUẦN (không React)
  adapter-frappe/     @metaforge/adapter-frappe    — FrappeAdapter: nơi DUY NHẤT chạm API Frappe
  ui/                 @metaforge/ui                — shadcn/Radix + Tailwind v4 tokens (design system)
  controls/           @metaforge/controls          — fieldtype → control registry
  views/              @metaforge/views             — List/Form/Split/Report/Kanban/Calendar/Gantt/Tree/Dashboard/Print + container (TanStack Query)
  builder/            @metaforge/builder           — BuilderKernel (draft+history) + DocTypeBuilder + diffMeta/serializer (DocType/Customize/Workflow/Print/Dashboard)
  shell/              @metaforge/shell             — AppShell/CommandPalette/theme/i18n/auth (AuthBoundary+LoginForm)/app-mode (MobileShell + touch primitives)
  create-metaforge-app/ create-metaforge-app        — CLI sinh app mỏng (manifest + main.tsx), tiêu thụ dist, không copy engine source
apps/
  demo/               @metaforge/demo              — Vite SPA mount engine (mock + live mode), deploy công khai `/wms`
  sample-wms/         sample-wms                   — app sinh bởi CLI, fixture ManifestAppRuntime parity (route/workspace/system/locale)
  sample-sales/       sample-sales                 — app sinh bởi CLI, manifest khác (module khác) — chứng minh generator tổng quát
frappe-app/
  metaforge/          Frappe app: orchestration methods (get_boot/get_capabilities/get_workflow_transitions/global_search…)
e2e-factory/          Playwright live E2E cho 2 app sinh ra (cookie-auth/manifest/permission/workflow/link)
docs/                 BRD + technical + appendix + builder + screens + history (báo cáo đã archive)
```

## Toolchain

- Node ≥ 20, pnpm 9.15 (qua `corepack pnpm@9.15.0 …`).
- `pnpm install` → cài workspace.
- `pnpm -r run typecheck` → tsc project references toàn bộ.
- `pnpm -r run build` → build 8 package + 3 app (topological).

## Run

```bash
corepack pnpm@9.15.0 install
corepack pnpm@9.15.0 -r run typecheck                    # tsc -b toàn bộ (exit 0)
corepack pnpm@9.15.0 -r run build                         # 8 package + 3 app
corepack pnpm@9.15.0 --filter @metaforge/demo run selfcheck   # mock test logic+render (esbuild→node)
corepack pnpm@9.15.0 --filter @metaforge/demo run e2e         # mock Playwright
corepack pnpm@9.15.0 --filter @metaforge/demo dev             # demo MOCK (không cần backend) → :8090
```
Live mode (data Frappe thật) + deploy công khai `/wms`: xem [`docs/DEPLOY-WMS.md`](docs/DEPLOY-WMS.md) và [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

## Trạng thái — v1.0.0-rc.1 Product RC (xem [CHANGELOG.md](CHANGELOG.md))

**Bằng chứng chạy THẬT** (lệnh + exit code + commit hash + live evidence, cập nhật mỗi thay đổi lớn) —
xem **[TEST_REPORT.md](TEST_REPORT.md)**, số liệu KHÔNG lặp lại ở đây để tránh 2 nguồn drift nhau
(bài học từ chính repo này — xem [KNOWN_GAPS.md](KNOWN_GAPS.md)).

Gate 0–7 (engine/Builder/App-factory nền tảng) đã đóng · App-mode (touch-first, `/x/receive` deploy
thật) · nhiều vòng review độc lập đã vá (auth thật, permission UI, manifest parity, workflow descriptor,
Link fail-visible, cache scope, Builder permission diff, CLI safety, App-mode server-authoritative
actions...). **Còn lại** (ghi trung thực, không giả vờ đã xong): xem [KNOWN_GAPS.md](KNOWN_GAPS.md).

## Docs
- [TEST_REPORT.md](TEST_REPORT.md) — bằng chứng lệnh+exit-code+live evidence hiện tại (nguồn số liệu DUY NHẤT)
- [KNOWN_GAPS.md](KNOWN_GAPS.md) — ledger trung thực từng finding, gate status, debt còn lại
- [ARCHITECTURE.md](ARCHITECTURE.md) · [PERMISSION_MODEL.md](PERMISSION_MODEL.md) · [SECURITY_MODEL.md](SECURITY_MODEL.md) · [APP_MANIFEST.md](APP_MANIFEST.md) · [BUILDER_ROUNDTRIP.md](BUILDER_ROUNDTRIP.md) — thiết kế hệ đã CHẠY THẬT (không phải dự kiến)
- [docs/DEPLOY-WMS.md](docs/DEPLOY-WMS.md) — deploy công khai `/wms` + module kho APHVH WMS thật
- [docs/BRD.md](docs/BRD.md) + [docs/brd-screens/](docs/brd-screens/) — screen spec cards
- [docs/design-import.md](docs/design-import.md) + [docs/design/visual-directions-review/](docs/design/visual-directions-review/) — Claude Design handoff và mapping vào production UI
- [docs/history/](docs/history/) — báo cáo đã archive (KHÔNG còn cập nhật, chỉ tham khảo lịch sử)

## Goal 100 business-suite checkpoint

> **Release status:** source RC đã qua các gate offline; chưa được xem là production deployment cho đến khi hoàn tất [PRODUCT_DEPLOYMENT_CHECKLIST.md](./PRODUCT_DEPLOYMENT_CHECKLIST.md) trên site Frappe đích. Bằng chứng hiện tại: [PRODUCT_RC1_REPORT.md](./PRODUCT_RC1_REPORT.md).


The role-aware Business Context, full Workspace catalog, Overview, Process, wide Create modal, display-value resolver and Permission Center implementation are documented in [GOAL100_IMPLEMENTATION.md](./GOAL100_IMPLEMENTATION.md). Run the live release gate in [RELEASE_ACCEPTANCE_GOAL100.md](./RELEASE_ACCEPTANCE_GOAL100.md) before production rollout.
