/**
 * Error mapping — api-map §0 / appendix §F.
 * Nguồn phân biệt: `exc_type` của Frappe (KHÔNG chỉ dựa HTTP status).
 * TimestampMismatchError kế thừa ValidationError → cùng HTTP 417 với validation,
 * nên PHẢI tách bằng exc_type để hiện Conflict UI đúng.
 */

export type AppErrorKind =
  | "auth"        // 401 AuthenticationError / no session
  | "permission"  // 403 PermissionError
  | "not_found"   // 404 DoesNotExistError
  | "validation"  // 417 ValidationError / Mandatory / LinkValidation / LinkExists
  | "conflict"    // 417 TimestampMismatchError (optimistic-lock)
  | "rate_limit"  // 429
  | "server"      // 500
  | "network"     // offline / fetch fail — V1: đọc cache, GHI disable
  | "unknown";

export interface AppError {
  kind: AppErrorKind;
  httpStatus?: number;
  excType?: string;
  /** thông điệp tiếng Việt an toàn (KHÔNG lộ stack/SQL). */
  message: string;
  /** payload lỗi field-level (validation) để hiện inline. */
  fieldErrors?: Record<string, string>;
  raw?: unknown;
}

const EXC_TYPE_KIND: Record<string, AppErrorKind> = {
  AuthenticationError: "auth",
  SessionExpired: "auth",
  PermissionError: "permission",
  DoesNotExistError: "not_found",
  ValidationError: "validation",
  MandatoryError: "validation",
  LinkValidationError: "validation",
  LinkExistsError: "validation",
  TimestampMismatchError: "conflict",
};

const KIND_MESSAGE: Record<AppErrorKind, string> = {
  auth: "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.",
  permission: "Bạn không có quyền thực hiện thao tác này.",
  not_found: "Không tìm thấy bản ghi.",
  validation: "Dữ liệu chưa hợp lệ. Vui lòng kiểm tra các trường.",
  conflict: "Bản ghi vừa bị người khác thay đổi. Tải lại để xem bản mới nhất.",
  rate_limit: "Thao tác quá nhanh. Vui lòng thử lại sau.",
  server: "Có lỗi phía máy chủ. Vui lòng thử lại.",
  network: "Mất kết nối mạng. Chỉ có thể xem dữ liệu đã tải; thao tác ghi tạm khoá.",
  unknown: "Đã xảy ra lỗi không xác định.",
};

interface FrappeErrorData {
  exc_type?: string;
  exception?: string; // "frappe.exceptions.ValidationError: msg" hoặc traceback
  _server_messages?: string; // JSON array (mỗi phần tử là JSON string {message,title,...})
  message?: string;
}
interface AxiosLike {
  response?: { status?: number; data?: FrappeErrorData };
  code?: string;
  message?: string;
  // một số nơi ném thẳng shape Frappe (không qua axios)
  exc_type?: string;
  exception?: string;
  _server_messages?: string;
  httpStatus?: number;
  status?: number;
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]*>/g, "").trim();
}

/** exc_type từ field exc_type, hoặc parse từ chuỗi `exception` ("...SomeError: msg" → "SomeError"). */
function excTypeFrom(data: FrappeErrorData): string | undefined {
  if (data.exc_type) return data.exc_type;
  if (data.exception) {
    const m = data.exception.match(/([A-Za-z_][A-Za-z0-9_]*Error)\b/);
    if (m) return m[1];
  }
  return undefined;
}

/** _server_messages (double-encoded JSON) → text người dùng + field errors. */
function parseServerMessages(raw?: string): { text?: string; fieldErrors?: Record<string, string> } {
  if (!raw) return {};
  try {
    const arr = JSON.parse(raw) as unknown[];
    const msgs: string[] = [];
    const fieldErrors: Record<string, string> = {};
    for (const el of arr) {
      let o: { message?: string; fieldname?: string } | undefined;
      if (typeof el === "string") {
        try { o = JSON.parse(el); } catch { o = { message: el }; }
      } else if (el && typeof el === "object") {
        o = el as { message?: string; fieldname?: string };
      }
      if (o?.message) {
        const m = stripHtml(o.message);
        if (m) msgs.push(m);
        if (o.fieldname && m) fieldErrors[o.fieldname] = m;
      }
    }
    return {
      text: msgs.length ? msgs.join("\n") : undefined,
      fieldErrors: Object.keys(fieldErrors).length ? fieldErrors : undefined,
    };
  } catch {
    return {};
  }
}

/**
 * Chuẩn hoá lỗi bất kỳ → AppError (P0-10). Đào lỗi kiểu axios (`response.data/status`) LẪN
 * shape ném thẳng; parse `exception`→exc_type; đọc `_server_messages`→message+fieldErrors.
 * Chỉ coi là network khi thực sự lỗi mạng (không response + ERR_NETWORK/Network Error) —
 * KHÔNG nhầm Error thường thành network. Logic thuần → test không cần network.
 */
export function mapError(e: unknown): AppError {
  const err = (e ?? {}) as AxiosLike;
  const data: FrappeErrorData = err.response?.data ?? {
    exc_type: err.exc_type,
    exception: err.exception,
    _server_messages: err._server_messages,
    message: err.message,
  };
  const http = err.response?.status ?? err.httpStatus ?? err.status;
  const excType = excTypeFrom(data);
  const { text: serverText, fieldErrors } = parseServerMessages(data._server_messages);

  const isNetwork =
    http === undefined &&
    excType === undefined &&
    (err.code === "ERR_NETWORK" || /network error|failed to fetch/i.test(err.message ?? ""));

  let kind: AppErrorKind = "unknown";
  if (excType && EXC_TYPE_KIND[excType]) kind = EXC_TYPE_KIND[excType]!;
  else if (http === 401) kind = "auth";
  else if (http === 403) kind = "permission";
  else if (http === 404) kind = "not_found";
  else if (http === 429) kind = "rate_limit";
  else if (http === 417) kind = "validation";
  else if (http !== undefined && http >= 500) kind = "server";
  else if (isNetwork) kind = "network";

  // Frappe (verified live) ném `PermissionError`/403 — KHÔNG `AuthenticationError`/401 — khi Guest
  // (chưa đăng nhập / session hết hạn) gọi 1 method chỉ whitelist cho user đã login; message luôn
  // kèm "Login to access" (chuỗi framework Frappe, không phải business message của app). Không tách
  // riêng ⇒ mất-phiên giữa lúc dùng bị hiểu nhầm thành "permission" (từ chối 1 record cụ thể) thay vì
  // "auth" (cần đăng nhập lại) ⇒ onSessionExpired không bao giờ bắn cho đúng trường hợp thật này.
  if (kind === "permission" && /login to access/i.test(`${serverText ?? ""} ${data.message ?? ""}`)) {
    kind = "auth";
  }

  // Ưu tiên message nghiệp vụ từ server (validation cụ thể) khi kind là validation/permission;
  // conflict/auth/network dùng KIND_MESSAGE (ổn định) để UI xử lý đồng nhất.
  const useServer = serverText && (kind === "validation" || kind === "permission" || kind === "unknown");
  return {
    kind,
    httpStatus: http,
    excType,
    message: useServer ? serverText! : KIND_MESSAGE[kind],
    fieldErrors,
    raw: e,
  };
}
