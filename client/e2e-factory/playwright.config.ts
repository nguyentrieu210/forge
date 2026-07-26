import { defineConfig } from "@playwright/test";

/**
 * Runtime E2E cho app SINH RA (không dùng apps/demo). webServer serve production dist của
 * sample-wms/sample-sales, proxy /api → backend Frappe. Cần SSH tunnel :8000 sẵn.
 *
 * 2 kiểu proxy khác mục đích:
 * - serve-proxy.mjs (project wms/sales) — tiêm token Administrator: smoke test hạ tầng (app sinh ra
 *   CHẠY ĐƯỢC: boot/list/edit-save), KHÔNG chứng minh cookie-session login/CSRF/permission end-user.
 * - serve-proxy-cookie.mjs (project wms-cookie-auth) — KHÔNG token, chỉ forward cookie/CSRF thật của
 *   trình duyệt → chứng minh auth THẬT (P1-AUTH-01): guest/login/logout/session-expiry với user hạn
 *   chế (KHÔNG Administrator) — xem tests/generated-wms-cookie-auth.spec.ts.
 */
const TOKEN = process.env.MF_TOKEN;
if (!TOKEN) {
  throw new Error(
    "MF_TOKEN required (format 'key:secret') — no hard-coded credentials. Set it or `source .env.live.local`.",
  );
}
// 127.0.0.1 (KHÔNG "localhost") — Node fetch chọn ::1 nhưng tunnel SSH bind IPv4.
const BACKEND = process.env.MF_BACKEND || "http://127.0.0.1:8000";
const SITE = process.env.MF_SITE || "metaforge.localhost";
const proxyEnv = {
  BACKEND,
  TOKEN,
  SITE,
  // Administrator-token smoke test là chủ đích ở suite wms/sales (xem ghi chú trên) — xác nhận tường
  // minh để serve-proxy không tự chặn (nó mặc định từ chối khởi động nếu TOKEN xác thực là Administrator).
  E2E_ALLOW_ADMINISTRATOR: "1",
};

export default defineConfig({
  testDir: "tests",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  fullyParallel: false,
  workers: 1,
  webServer: [
    { command: "node serve-proxy.mjs", cwd: ".", env: { ...proxyEnv, APP_DIST: "../apps/sample-wms/dist", PORT: "4180" }, url: "http://localhost:4180", reuseExistingServer: false, timeout: 30_000 },
    { command: "node serve-proxy.mjs", cwd: ".", env: { ...proxyEnv, APP_DIST: "../apps/sample-sales/dist", PORT: "4181" }, url: "http://localhost:4181", reuseExistingServer: false, timeout: 30_000 },
    { command: "node serve-proxy-cookie.mjs", cwd: ".", env: { BACKEND, SITE, APP_DIST: "../apps/sample-wms/dist", PORT: "4190" }, url: "http://localhost:4190", reuseExistingServer: false, timeout: 30_000 },
  ],
  projects: [
    { name: "wms", testMatch: [/generated-wms\.spec\.ts$/, /generated-wms-manifest\.spec\.ts$/, /generated-wms-workflow\.spec\.ts$/, /generated-wms-link\.spec\.ts$/], use: { baseURL: "http://localhost:4180" } },
    { name: "wms-permission", testMatch: /generated-wms-permission\.spec\.ts$/, use: { baseURL: "http://localhost:4190" } },
    { name: "sales", testMatch: /generated-sales\.spec\.ts$/, use: { baseURL: "http://localhost:4181" } },
    { name: "wms-cookie-auth", testMatch: /generated-wms-cookie-auth\.spec\.ts$/, use: { baseURL: "http://localhost:4190" } },
  ],
});
