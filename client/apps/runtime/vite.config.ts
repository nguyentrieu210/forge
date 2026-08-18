import { existsSync, readdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { fileURLToPath, URL } from "node:url";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const packagesRoot = fileURLToPath(new URL("../../packages/", import.meta.url));
const workspaceSource = (name: string) => fileURLToPath(
  new URL(`../../packages/${name}/src/index.ts`, import.meta.url),
);
const viewSource = (relativePath: string) => fileURLToPath(
  new URL(`../../packages/views/src/${relativePath}`, import.meta.url),
);
const runtimeDependency = (name: string) => fileURLToPath(
  new URL(`./node_modules/${name}`, import.meta.url),
);
const attendanceIndex = fileURLToPath(new URL("../attendance-mobile/index.html", import.meta.url));
const attendanceEntry = fileURLToPath(new URL("../attendance-mobile/src/main.tsx", import.meta.url));
const attendancePublic = fileURLToPath(new URL("../attendance-mobile/public/", import.meta.url));

/**
 * The deployed Gateway mounts the standalone attendance PWA at
 * `/mobile/attendance/`. The Desk dev server used to know only its own SPA, so
 * that URL silently fell through to the Forge index and “Mở app” reopened Desk.
 * Serve the real attendance entry and its public metadata on the same local
 * origin; API calls continue through the existing `/api` proxy below.
 */
function attendanceMobileDev(): Plugin {
  const publicFiles = new Map([
    ["/mobile/attendance/manifest.webmanifest", ["manifest.webmanifest", "application/manifest+json"]],
    ["/mobile/attendance/app-icon.svg", ["app-icon.svg", "image/svg+xml"]],
  ] as const);
  return {
    name: "attendance-mobile-dev",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const pathname = new URL(request.url ?? "/", "http://local.test").pathname;
        if (pathname === "/mobile/attendance") {
          response.statusCode = 302;
          response.setHeader("Location", `/mobile/attendance/${new URL(request.url ?? "/", "http://local.test").search}`);
          response.end();
          return;
        }
        if (pathname === "/mobile/attendance/") {
          try {
            const sourcePath = `/@fs/${attendanceEntry.replace(/\\/g, "/")}`;
            const source = (await readFile(attendanceIndex, "utf8"))
              .replace('src="/src/main.tsx"', `src="${sourcePath}"`);
            const html = await server.transformIndexHtml(request.url ?? pathname, source);
            response.statusCode = 200;
            response.setHeader("Content-Type", "text/html; charset=utf-8");
            response.setHeader("Cache-Control", "no-store");
            response.end(html);
          } catch (error) {
            next(error as Error);
          }
          return;
        }
        const publicFile = publicFiles.get(pathname as keyof typeof publicFiles);
        if (!publicFile) {
          next();
          return;
        }
        try {
          response.statusCode = 200;
          response.setHeader("Content-Type", publicFile[1]);
          response.setHeader("Cache-Control", "no-store");
          response.end(await readFile(new URL(publicFile[0], `file:///${attendancePublic.replace(/\\/g, "/")}/`)));
        } catch (error) {
          next(error as Error);
        }
      });
    },
  };
}

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// DEV ONLY: every package under client/packages that exposes src/index.ts is
// resolved straight to source. Production package.json exports can keep pointing
// at dist/, while a fresh Codespace needs no package prebuild and gets HMR for
// workspace edits immediately. This also covers future packages automatically.
const workspacePackageAliases = readdirSync(packagesRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .flatMap((entry) => {
    const source = workspaceSource(entry.name);
    if (!existsSync(source)) return [];
    return [{
      find: new RegExp(`^@metaforge\\/${escapeRegExp(entry.name)}$`),
      replacement: source,
    }];
  });

const viewSourceAliases = [
  // The attendance entry lives beside Runtime rather than below its root. Pin
  // bare third-party imports to Runtime's dependency graph so Vite does not
  // create duplicate React instances.
  { find: /^react$/, replacement: runtimeDependency("react") },
  { find: /^react-dom$/, replacement: runtimeDependency("react-dom") },
  { find: /^lucide-react$/, replacement: runtimeDependency("lucide-react") },
  { find: /^jsqr$/, replacement: runtimeDependency("jsqr") },

  ...workspacePackageAliases,

  // Explicit subpath aliases remain necessary because packages such as views
  // intentionally expose multiple dev entry points. Keep doctype-workspace on
  // the runtime composition wrapper; aliasing it to canonical DoctypeWorkspace
  // bypasses product extensions such as Alumdoor's dedicated Sales Order TSX.
  { find: /^@metaforge\/views\/provider$/, replacement: viewSource("container/provider") },
  { find: /^@metaforge\/views\/registry$/, replacement: viewSource("registry") },
  { find: /^@metaforge\/views\/url-state$/, replacement: viewSource("list/useListState") },
  { find: /^@metaforge\/views\/doctype-workspace$/, replacement: viewSource("app/RuntimeDoctypeWorkspace") },
  { find: /^@metaforge\/views\/overview$/, replacement: viewSource("overview/OverviewContainer") },
  { find: /^@metaforge\/views\/catalog$/, replacement: viewSource("catalog/ApplicationCatalogContainer") },
  { find: /^@metaforge\/views\/permissions$/, replacement: viewSource("access/PermissionCenter") },
  { find: /^@metaforge\/views\/workspace$/, replacement: viewSource("container/WorkspaceContainer") },
  { find: /^@metaforge\/views\/report$/, replacement: viewSource("report/ReportContainer") },
  { find: /^@metaforge\/views\/process$/, replacement: viewSource("process/ProcessContainer") },
  { find: /^@metaforge\/views\/calendar$/, replacement: viewSource("calendar/CalendarContainer") },
  { find: /^@metaforge\/views\/import$/, replacement: viewSource("system/Import") },
  { find: /^@metaforge\/views\/action$/, replacement: viewSource("action/NativeActionScreen") },
  { find: /^@metaforge\/views\/screen$/, replacement: viewSource("screen/ScreenView") },
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
 */
export default defineConfig({
  plugins: [attendanceMobileDev(), react(), tailwindcss()],
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