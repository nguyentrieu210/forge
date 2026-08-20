/**
 * Hook `resolve` chặn bốn tên gói mà màn Danh mục import, trỏ sang bản giả cạnh file này.
 *
 * Vì sao cần: `client/` chưa cài node_modules trong môi trường chạy test của agent, và ngay cả
 * khi cài thì nạp React + toàn bộ design system chỉ để kiểm ba hàm thuần là đổi một test 0,5s
 * lấy một test phụ thuộc vào cả cây phụ thuộc.
 *
 * `shortCircuit: true` là bắt buộc khi không gọi `nextResolve` — thiếu cờ đó Node ném lỗi thay
 * vì im lặng dùng kết quả, và đó là hành vi đúng: một hook nuốt mất chuỗi giải sẽ rất khó soi.
 */
const STUBS = new Map([
  ["react", "./react.mjs"],
  ["react/jsx-runtime", "./react-jsx-runtime.mjs"],
  ["react/jsx-dev-runtime", "./react-jsx-runtime.mjs"],
  ["@metaforge/ui", "./metaforge-ui.mjs"],
  ["lucide-react", "./lucide-react.mjs"],
]);

export async function resolve(specifier, context, nextResolve) {
  const stub = STUBS.get(specifier);
  if (stub) return { url: new URL(stub, import.meta.url).href, shortCircuit: true };
  return nextResolve(specifier, context);
}
