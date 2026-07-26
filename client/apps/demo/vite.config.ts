import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

/**
 * Demo SPA.
 * - Mock mode (mặc định): App.tsx render từ metadata mẫu, không cần backend.
 * - Live mode (VITE_LIVE=1): LiveApp.tsx dùng MetaForgeProvider + container gọi Frappe thật.
 *
 * Proxy /api → backend Frappe; TIÊM header site + token (site cô lập metaforge.localhost nằm sau
 * nginx hardcode `frontend`, nên phải chỉ định X-Frappe-Site-Name + auth token trong dev).
 *   VITE_FRAPPE_BACKEND=http://localhost:8000 (qua SSH tunnel tới gunicorn backend)
 *   VITE_FRAPPE_SITE=metaforge.localhost
 *   VITE_FRAPPE_TOKEN=api_key:api_secret
 */
export default defineConfig({
  plugins: [tailwindcss(), react()],
  server: {
    port: 8090,
    proxy: {
      "/api": {
        target: process.env.VITE_FRAPPE_BACKEND ?? "http://localhost:8000",
        changeOrigin: true,
        headers: {
          "X-Frappe-Site-Name": process.env.VITE_FRAPPE_SITE ?? "metaforge.localhost",
          ...(process.env.VITE_FRAPPE_TOKEN ? { Authorization: `token ${process.env.VITE_FRAPPE_TOKEN}` } : {}),
        },
      },
    },
  },
  build: { outDir: "dist", sourcemap: true },
});
