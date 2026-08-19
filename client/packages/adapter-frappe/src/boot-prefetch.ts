/**
 * Hỏi trước phiên và manifest, ngay từ lúc trình duyệt còn đang đọc `<head>`.
 *
 * Trước đây hai lời gọi này chỉ xuất phát khi `main-base` chạy — tức sau bốn chặng mạng.
 * Đo thật trên `alu.kairo.vn`: một `/api/method` mất ~185 ms, nên chờ chúng xếp hàng sau
 * cả bó JavaScript là mất trắng phần thời gian mạng đang rảnh.
 *
 * File này là NƠI DUY NHẤT biết địa chỉ hai lời gọi đó, và nó được dùng ở hai đầu:
 * `vite.config.ts` biên dịch nó vào script nội tuyến của `index.html` (bên GỌI), còn
 * `frappe-adapter.ts` import nó để NHẬN kết quả. Cùng một nguồn nên không có bản sao nào
 * để trôi dạt — xem thêm chú thích cùng loại trong `apps/runtime/src/boot-route.ts`.
 *
 * Vì lẽ đó file này không được import gì (ngoài type): nó phải biên dịch một mình thành
 * IIFE cho một thẻ script cổ điển.
 */

export type PrefetchName = "boot" | "manifest";

/** Đúng hai method mà mọi lần mở Desk đều gọi, trước cả khi biết người dùng là ai. */
export const BOOT_METHOD = "metaforge.api.get_boot";
export const MANIFEST_METHOD = "metaforge.api.get_app_manifest";

interface PrefetchEntry {
  /** App được yêu cầu lúc hỏi trước; phải khớp thì mới dùng lại được. */
  app: string | undefined;
  response: Promise<Response>;
}

interface PrefetchHost {
  __forgeBootPrefetch?: Partial<Record<PrefetchName, PrefetchEntry>>;
}

/**
 * Giống hệt cách `frappe-js-sdk` dựng URL cho một method GET: `/api/method/<method>` với
 * tham số rỗng/undefined bị bỏ đi. Sai một ly ở đây là lời gọi hỏi trước không bao giờ
 * dùng được — mà cũng không ai thấy, vì bên nhận lặng lẽ gọi lại.
 */
export function methodUrl(method: string, params?: Record<string, string | undefined>): string {
  const encoded = new URLSearchParams();
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value !== undefined && value !== null) encoded.set(key, value);
  }
  const query = encoded.toString();
  return `/api/method/${method}${query ? `?${query}` : ""}`;
}

function requestedApp(search: string): string | undefined {
  return new URLSearchParams(search).get("app") ?? undefined;
}

/** Bắn hai lời gọi. Gọi nhiều lần cũng chỉ bắn một lượt. */
export function startBootPrefetch(search?: string): void {
  const host = globalThis as PrefetchHost;
  if (host.__forgeBootPrefetch) return;
  const app = requestedApp(search ?? window.location.search);
  const send = (url: string): Promise<Response> => {
    const started = fetch(url, {
      method: "GET",
      credentials: "same-origin",
      headers: { accept: "application/json" },
    });
    // Bên nhận chạy sau vài trăm mili-giây; không có handler nào ở đây thì một lần hỏng
    // mạng nổi lên thành unhandled rejection trước khi ai kịp bắt.
    void started.catch(() => undefined);
    return started;
  };
  host.__forgeBootPrefetch = {
    boot: { app: undefined, response: send(methodUrl(BOOT_METHOD)) },
    manifest: { app, response: send(methodUrl(MANIFEST_METHOD, { app })) },
  };
}

/**
 * Lấy kết quả hỏi trước, DÙNG MỘT LẦN.
 *
 * Dùng một lần là điều kiện đúng đắn: lần gọi thứ hai luôn nghĩa là trạng thái đã đổi
 * (vừa đăng nhập, vừa chuyển app), mà kết quả cũ thì không biết chuyện đó.
 */
export async function consumeBootPrefetch(name: PrefetchName, app?: string): Promise<unknown> {
  const host = globalThis as PrefetchHost;
  const entry = host.__forgeBootPrefetch?.[name];
  if (!entry) return undefined;
  delete host.__forgeBootPrefetch?.[name];
  if (name === "manifest" && entry.app !== app) return undefined;
  try {
    const response = await entry.response;
    // Chưa đăng nhập thì lời hỏi trước trả 401 — bỏ đi và để đường gọi thật báo lỗi đúng
    // kiểu của nó.
    if (!response.ok) return undefined;
    return await response.json();
  } catch {
    return undefined;
  }
}
