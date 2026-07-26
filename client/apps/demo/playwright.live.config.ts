import { defineConfig, devices } from "@playwright/test";

/**
 * E2E LIVE — chạy demo ở live-mode (VITE_LIVE=1) đối chiếu Frappe THẬT (site cô lập metaforge.localhost).
 * Điều kiện: SSH tunnel `-L 8000:172.18.0.8:8000` đang mở (vite proxy /api → localhost:8000 + header site + token).
 * Đây là gate P1 Pha 2: nâng product REQ từ Mock → Done (bằng chứng live).
 */
const TOKEN = process.env.VITE_FRAPPE_TOKEN;
if (!TOKEN) {
  throw new Error(
    "VITE_FRAPPE_TOKEN required (format 'key:secret') — no hard-coded credentials. Set it or `source .env.live.local`.",
  );
}

export default defineConfig({
  testDir: "./e2e-live",
  timeout: 30_000,
  reporter: [["list"]],
  // workers:1 — TẤT CẢ test ở đây đập vào CÙNG 1 backend Frappe thật qua CÙNG 1 SSH tunnel; Playwright
  // mặc định chạy nhiều FILE test SONG SONG (không tự giới hạn), gây tunnel/backend nghẽn giữa 2 file
  // (vd app-mode-receive.spec.ts + live.spec.ts) → timeout ngẫu nhiên trông như flake product nhưng
  // KHÔNG PHẢI — xác nhận LIVE: 3/3 lần chạy `npx playwright test` (mặc định) đều fail đúng 1 test khi
  // 2 file chạy đồng thời; `--workers=1` → 20/20 PASS cả 3 lần lặp lại. Cùng gốc rễ với flake đã biết
  // ở e2e-factory (4 webServer đồng thời) — ở đây chốt hẳn bằng config thay vì ghi "flake, chạy lại".
  workers: 1,
  use: { baseURL: "http://localhost:8090", trace: "off" },
  projects: [{ name: "live", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "vite --port 8090 --strictPort",
    url: "http://localhost:8090",
    reuseExistingServer: true,
    timeout: 60_000,
    env: {
      VITE_LIVE: "1",
      VITE_FRAPPE_BACKEND: "http://localhost:8000",
      VITE_FRAPPE_SITE: "metaforge.localhost",
      VITE_FRAPPE_TOKEN: TOKEN,
    },
  },
});
