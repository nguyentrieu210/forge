import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const viewsSource = fileURLToPath(new URL("../../packages/views/src", import.meta.url));
const viewsDevAliases = [
  ["@metaforge/views/provider", `${viewsSource}/container/provider.tsx`],
  ["@metaforge/views/registry", `${viewsSource}/registry.ts`],
  ["@metaforge/views/url-state", `${viewsSource}/list/useListState.ts`],
  ["@metaforge/views/doctype-workspace", `${viewsSource}/app/DoctypeWorkspace.tsx`],
  ["@metaforge/views/overview", `${viewsSource}/overview/OverviewContainer.tsx`],
  ["@metaforge/views/process", `${viewsSource}/process/ProcessContainer.tsx`],
  ["@metaforge/views/calendar", `${viewsSource}/calendar/CalendarContainer.tsx`],
  ["@metaforge/views/catalog", `${viewsSource}/catalog/ApplicationCatalogContainer.tsx`],
  ["@metaforge/views/permissions", `${viewsSource}/access/PermissionCenter.tsx`],
  ["@metaforge/views/workspace", `${viewsSource}/container/WorkspaceContainer.tsx`],
  ["@metaforge/views/report", `${viewsSource}/report/ReportContainer.tsx`],
  ["@metaforge/views/import", `${viewsSource}/system/Import.tsx`],
  ["@metaforge/views/action", `${viewsSource}/action/NativeActionScreen.tsx`],
  ["@metaforge/views/screen", `${viewsSource}/screen/NativeScreenView.tsx`],
  ["@metaforge/views/matrix", `${viewsSource}/matrix/index.ts`],
  ["@metaforge/views", `${viewsSource}/index.ts`],
].map(([find, replacement]) => ({ find, replacement }));

/**
 * Desk chạy cục bộ.
 *
 * `main-base.tsx` khởi tạo `new FrappeAdapterImpl({})` — base rỗng nghĩa là same-origin, nên mọi
 * lời gọi `/api` đi vào chính dev server này. Không có proxy thì Vite trả `index.html` (200,
 * text/html) cho `/api/method/metaforge.api.get_boot`; adapter map thành `not_found` và Desk
 * dừng ở màn "Forge connection — Không tìm thấy bản ghi", dù worker vẫn khoẻ.
 *
 * `VITE_FORGE_BACKEND` là cổng chỉnh backend mà `server/RUNBOOK_LOCAL.md` đã nhắc tới; mặc định
 * 8799 khớp cổng worker trong runbook.
 */
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Runtime imports workspace packages through /@fs while its own entry is resolved
  // from this app.  Without dedupe, a local nested pnpm install can hand ReactDOM one
  // React instance and @metaforge/ui another, producing an invalid-hook-call blank
  // screen on 5173.  One renderer instance is a correctness requirement, not merely
  // a bundle-size optimization.
  resolve: {
    dedupe: ["react", "react-dom"],
    alias: viewsDevAliases,
  },
  server: {
    proxy: {
      "/api": {
        target: process.env.VITE_FORGE_BACKEND ?? "http://127.0.0.1:8799",
        changeOrigin: true,
      },
    },
  },
});
