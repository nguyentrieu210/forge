import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Dev proxy (Task 2): the browser calls same-origin /api/* — no CORS/preflight.
// Reports live on the query-worker; everything else on the gateway. Order matters:
// the more specific /api/v1/reports rule must come before the catch-all /api.
// Edit these if your deployed worker origins differ.
const GATEWAY = "https://cloudforge-gateway.trieu-nt93.workers.dev";
const REPORTS = "https://cloudforge-query-demo.trieu-nt93.workers.dev";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      "/api/v1/reports": { target: REPORTS, changeOrigin: true, secure: true },
      "/api": { target: GATEWAY, changeOrigin: true, secure: true },
    },
  },
});
