/**
 * Ghép đường dẫn tệp của Frappe với BASE của app.
 *
 * Frappe luôn trả `file_url` tính từ GỐC SITE: "/files/anh.jpg". Nhưng app không nhất thiết chạy ở
 * gốc — bản Kho chạy dưới "/kho/". Dùng thẳng chuỗi Frappe trả về thì trình duyệt gọi
 * "/files/anh.jpg" (ngoài phạm vi app) và nhận 404: ảnh mặt hàng không bao giờ hiện, mà cũng không
 * có lỗi nào rõ ràng để lần ra.
 *
 * Thuần hàm, KHÔNG đọc `import.meta.env` ở đây: core còn chạy trong test Node nơi biến đó không tồn
 * tại. Base do nơi gọi truyền vào.
 */

/** Đường dẫn Frappe phục vụ từ gốc site — cần ghép base khi app chạy ở thư mục con. */
const SITE_ROOTED = /^\/(files|private|assets)\//;

export function withAppBase(url: string | undefined | null, base: string): string {
  if (!url) return "";
  // Địa chỉ tuyệt đối (http://…, //cdn…, data:) do nơi khác quyết định — không đụng vào.
  if (/^[a-z][a-z0-9+.-]*:/i.test(url) || url.startsWith("//")) return url;
  if (!SITE_ROOTED.test(url)) return url;

  const b = base.replace(/\/+$/, "");
  if (!b || b === "") return url;
  // Đã có tiền tố rồi thì thôi — tránh "/kho/kho/files/…" khi hàm bị gọi hai lần.
  if (url.startsWith(`${b}/`)) return url;
  return `${b}${url}`;
}
