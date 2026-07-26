import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 8092,
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
});
