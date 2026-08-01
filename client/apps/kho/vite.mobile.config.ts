import { fileURLToPath, URL } from "node:url";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const here = (relative: string) => fileURLToPath(new URL(relative, import.meta.url));

function alumdoorWarehouseBranding(): Plugin {
  return {
    name: "alumdoor-warehouse-branding",
    enforce: "pre",
    transform(code, id) {
      if (!id.replaceAll("\\", "/").endsWith("/warehouse-mobile/src/main.tsx")) return null;
      return code
        .replaceAll("Forge Kho", "Alumdoor Kho")
        .replaceAll("tài khoản Forge", "tài khoản Alumdoor");
    },
  };
}

export default defineConfig({
  root: here("../warehouse-mobile"),
  base: "/mobile/warehouse/",
  plugins: [alumdoorWarehouseBranding(), tailwindcss(), react()],
  resolve: {
    alias: {
      react: here("./node_modules/react"),
      "react-dom": here("./node_modules/react-dom"),
      "lucide-react": here("./node_modules/lucide-react"),
      "@metaforge/adapter-frappe": here("./node_modules/@metaforge/adapter-frappe"),
      "@metaforge/core": here("./node_modules/@metaforge/core"),
      "@metaforge/shell": here("./node_modules/@metaforge/shell"),
      "@metaforge/ui": here("./node_modules/@metaforge/ui"),
    },
    dedupe: ["react", "react-dom"],
  },
  server: {
    port: 8096,
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
  build: {
    outDir: here("./dist-mobile"),
    emptyOutDir: true,
    sourcemap: true,
  },
});
