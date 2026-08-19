/**
 * Luật chọn LÀN khởi động: website công khai hay Desk.
 *
 * Luật này chạy ở HAI nơi. `bootstrap.ts` dùng nó để quyết định nạp gì; script nội tuyến
 * trong `<head>` dùng nó để phát `modulepreload` NGAY lúc trình duyệt còn đang đọc HTML,
 * tức trước khi bất kỳ module nào kịp tải. Chép tay bản thứ hai là đúng kiểu lỗi đã bắt
 * được ở `resolveNavPath` (một bản quên `encodeURIComponent`, hỏng cả hai chiều), nên bản
 * nội tuyến KHÔNG được chép: `vite.config.ts` biên dịch chính file này rồi nhúng vào HTML,
 * và `tests/boot-preload.test.mjs` giữ hai vế bằng nhau.
 *
 * Hệ quả: file này không được import gì cả — nó phải biên dịch một mình thành IIFE cho thẻ
 * script cổ điển.
 */

export type BootLane = "website" | "desk";

/** Làn tải trước: Desk mở thẳng một DocType thì cần luôn chunk màn làm việc. */
export type PreloadLane = "website" | "desk" | "desk-workspace";

export interface BootLocation {
  hostname: string;
  pathname: string;
  search: string;
}

/**
 * Đoạn đường dẫn một-mức thuộc về Desk, không phải slug của website.
 *
 * Mảng chứ không phải Set: bản nội tuyến chạy trong script cổ điển ở mọi trình duyệt mà
 * `index.html` còn phục vụ, và `indexOf` không cần polyfill nào.
 */
export const RESERVED_ROOTS: readonly string[] = [
  "api", "app", "x", "overview", "process", "reports", "master-data", "catalog", "permissions",
  "security", "organization", "companies", "branches", "departments", "workspace", "print", "report",
  "import", "page", "dashboard", "login", "signup", "features", "pricing", "faq", "privacy", "terms",
  "facebook", "shop", "files",
];

/** `decodeURIComponent` ném lỗi với chuỗi `%` hỏng — một URL rác không được làm trắng màn hình. */
function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function resolveBootLane(location: BootLocation): BootLane {
  const params = new URLSearchParams(location.search);

  // Chế độ chạy theo query là hợp đồng công khai đã có: QA đăng nhập Alumdoor và bộ chọn
  // tenant dùng `?alumdoor=1`, còn `?app=<id>` chọn một app đã cài. Website đã xuất bản
  // không được cướp những yêu cầu nói rõ như thế.
  if (params.get("alumdoor") === "1" || params.has("app")) return "desk";

  // Giữ nguyên mặt marketing Social Commerce và fixture hình ảnh cục bộ của nó.
  if (location.hostname.toLowerCase() === "chotdon.kairo.vn" || params.get("landing") === "1") return "desk";

  const trimmed = location.pathname.replace(/^\/+|\/+$/g, "");
  if (!trimmed) return "website";
  const segments = trimmed.split("/").filter(Boolean);
  if (segments.length !== 1) return "desk";
  const root = safeDecode(segments[0] ?? "").toLowerCase();
  if (RESERVED_ROOTS.indexOf(root) >= 0) return "desk";
  return /^[a-z0-9][a-z0-9-]{0,79}$/.test(root) ? "website" : "desk";
}

export function resolvePreloadLane(location: BootLocation): PreloadLane {
  if (resolveBootLane(location) === "website") return "website";
  const trimmed = location.pathname.replace(/^\/+|\/+$/g, "");
  return trimmed === "app" || trimmed.startsWith("app/") ? "desk-workspace" : "desk";
}

/** Trang bán hàng công khai của tenant. Union này khớp `StorefrontPage` của `Storefront.tsx`. */
export type ShopPage = "/shop" | "/shop/product" | "/shop/cart" | "/shop/track";

/**
 * Ở đây chứ không ở `main-base.tsx` vì script nội tuyến cũng cần biết: khách xem hàng không
 * có phiên đăng nhập, nên hỏi trước `get_boot`/`get_app_manifest` cho họ là hai lời gọi chắc
 * chắn trả 401.
 */
export function resolveStorefrontPage(location: Pick<BootLocation, "pathname">): ShopPage | undefined {
  const path = location.pathname.replace(/\/+$/, "") || "/";
  if (path === "/shop") return "/shop";
  if (path === "/shop/cart") return "/shop/cart";
  if (path === "/shop/track") return "/shop/track";
  return path.startsWith("/shop/") ? "/shop/product" : undefined;
}

/**
 * Có nên hỏi trước phiên + manifest ngay trong `<head>` không.
 *
 * Chỉ những mặt CẦN đăng nhập mới đáng: Desk. Trang bán hàng và các trang marketing của
 * Social Commerce đều là mặt công khai.
 */
export function shouldPrefetchSession(location: BootLocation): boolean {
  if (resolveBootLane(location) !== "desk") return false;
  if (resolveStorefrontPage(location)) return false;
  return location.hostname.toLowerCase() !== "chotdon.kairo.vn";
}

export function websiteProbeUrl(pathname: string): string {
  const trimmed = pathname.replace(/^\/+|\/+$/g, "");
  const slug = trimmed ? safeDecode(trimmed) : "";
  const query = slug ? `?slug=${encodeURIComponent(slug)}` : "";
  return `/api/method/forge.website.page${query}`;
}

interface ProbeHost {
  __forgeWebsiteProbe?: Promise<Response>;
}

/**
 * Hỏi server trang website ứng với đường dẫn — bắt đầu SỚM NHẤT có thể.
 *
 * Trước đây lời gọi này chỉ xuất phát sau khi chunk bootstrap tải xong, tức muộn hơn HTML
 * ba chặng mạng. Script nội tuyến gọi trước, `bootstrap.ts` gọi lại và nhận đúng promise đó
 * — nhớ theo `globalThis` chứ không theo module, vì hai bên không cùng một module.
 */
export function startWebsiteProbe(): Promise<Response> {
  const host = globalThis as ProbeHost;
  const existing = host.__forgeWebsiteProbe;
  if (existing) return existing;
  const started = fetch(websiteProbeUrl(window.location.pathname), {
    method: "GET",
    credentials: "same-origin",
    headers: { accept: "application/json" },
  });
  // Người đọc kết quả thật là `bootstrap.ts`, chạy sau. Không có handler nào ở đây thì một
  // lần hỏng mạng sẽ nổi lên thành unhandled rejection trước khi ai kịp bắt.
  void started.catch(() => undefined);
  host.__forgeWebsiteProbe = started;
  return started;
}
