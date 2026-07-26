import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    /**
     * Tách bundle. Trước đây toàn app nằm trong MỘT file ~2.09 MB (534 KB sau gzip): thủ kho
     * cầm điện thoại giữa kho, sóng 3G/4G yếu, phải tải trọn khối đó mới thấy được màn hình
     * đầu tiên.
     *
     * Cắt theo TỐC ĐỘ ĐỔI, không cắt bừa cho nhiều mảnh:
     *  - react/router  : gần như không bao giờ đổi ⇒ trình duyệt giữ cache qua mọi lần deploy.
     *  - query/vendor  : đổi khi nâng thư viện, hiếm.
     * Phần code ứng dụng (đổi mỗi lần deploy) vì thế nhỏ hẳn lại, người dùng chỉ tải phần đó.
     *
     * KHÔNG gom "lucide-react" thành chunk riêng: liệt kê cả gói ở đây buộc Rollup lấy trọn gói
     * làm gốc chunk, tức là vô hiệu hoá tree-shaking và kéo lại đủ ~1500 icon (777 KB) — đúng
     * thứ vừa bỏ công loại đi bằng danh bạ icon tĩnh ở packages/shell/src/icon-registry.ts.
     */
    rollupOptions: {
      output: {
        manualChunks: {
          "vendor-react": ["react", "react-dom", "react-router-dom"],
          "vendor-query": ["@tanstack/react-query"],
        },
      },
    },
    // Ngưỡng cảnh báo mặc định 500 KB sẽ kêu ở mọi build và bị lờ đi. Đặt 700 KB để cảnh báo
    // chỉ nổ khi thật sự có chunk phình bất thường.
    chunkSizeWarningLimit: 700,
  },
  server: {
    // Cổng riêng để chạy song song với app "kho" cũ (8092) mà không đụng nhau.
    port: 8093,
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
