import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const viewSource = (relativePath: string) => fileURLToPath(
  new URL(`../../packages/views/src/${relativePath}`, import.meta.url),
);
const controlsSource = fileURLToPath(
  new URL("../../packages/controls/src/index.ts", import.meta.url),
);

const viewSourceAliases = [
  { find: /^@metaforge\/controls$/, replacement: controlsSource },
  { find: /^@metaforge\/views$/, replacement: viewSource("index.ts") },
  { find: /^@metaforge\/views\/provider$/, replacement: viewSource("container/provider") },
  { find: /^@metaforge\/views\/registry$/, replacement: viewSource("registry") },
  { find: /^@metaforge\/views\/url-state$/, replacement: viewSource("list/useListState") },
  { find: /^@metaforge\/views\/doctype-workspace$/, replacement: viewSource("app/DoctypeWorkspace") },
  { find: /^@metaforge\/views\/overview$/, replacement: viewSource("overview/OverviewContainer") },
  { find: /^@metaforge\/views\/catalog$/, replacement: viewSource("catalog/ApplicationCatalogContainer") },
  { find: /^@metaforge\/views\/permissions$/, replacement: viewSource("access/PermissionCenter") },
  { find: /^@metaforge\/views\/workspace$/, replacement: viewSource("container/WorkspaceContainer") },
  { find: /^@metaforge\/views\/report$/, replacement: viewSource("report/ReportContainer") },
  { find: /^@metaforge\/views\/process$/, replacement: viewSource("process/ProcessContainer") },
  { find: /^@metaforge\/views\/calendar$/, replacement: viewSource("calendar/CalendarContainer") },
  { find: /^@metaforge\/views\/import$/, replacement: viewSource("system/Import") },
  { find: /^@metaforge\/views\/action$/, replacement: viewSource("action/NativeActionScreen") },
  { find: /^@metaforge\/views\/screen$/, replacement: viewSource("screen/NativeScreenView") },
  { find: /^@metaforge\/views\/matrix$/, replacement: viewSource("matrix/index") },
];

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
 *
 * DEV ONLY: runtime phải đọc workspace source trực tiếp. Package @metaforge/views export dist
 * cho production, nên nếu không alias ở đây thì sửa TSX trong packages/views/src không thể HMR
 * trên cổng 5173 cho tới khi build lại package. Alias này giữ production exports nguyên vẹn nhưng
 * làm preview local phản ánh source ngay lập tức.
 */
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Runtime imports workspace packages through /@fs while its own entry is resolved
  // from this app. Without dedupe, a local nested pnpm install can hand ReactDOM one
  // React instance and @metaforge/ui another, producing an invalid-hook-call blank
  // screen on 5173. One renderer instance is a correctness requirement, not merely
  // a bundle-size optimization.
  resolve: {
    alias: viewSourceAliases,
    dedupe: ["react", "react-dom"],
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
