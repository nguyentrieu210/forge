/**
 * AI config storage (Gate 5) — TÁCH bí mật khỏi localStorage.
 * apiKey là BÍ MẬT ⇒ chỉ giữ ở sessionStorage (mất khi đóng tab, không tồn tại qua phiên trình duyệt,
 * giảm cửa sổ lộ do XSS/chia sẻ máy). baseUrl/model KHÔNG nhạy cảm ⇒ localStorage (tiện, giữ qua phiên).
 * Đúng chuẩn hơn nữa là proxy backend (không giữ secret ở client) — ghi KNOWN_GAPS làm bước kế.
 */
export interface AIConfigState {
  baseUrl: string;
  apiKey: string;
  model: string;
}

const PUBLIC_KEY = "metaforge-ai-config"; // baseUrl + model (không nhạy cảm)
const SECRET_KEY = "metaforge-ai-key"; // apiKey (sessionStorage)

export function loadAIConfig(): AIConfigState {
  let baseUrl = "";
  let model = "";
  try {
    const raw = localStorage.getItem(PUBLIC_KEY);
    if (raw) {
      const cfg = JSON.parse(raw) as Partial<AIConfigState>;
      baseUrl = cfg.baseUrl ?? "";
      model = cfg.model ?? "";
    }
  } catch { /* localStorage/JSON lỗi → mặc định rỗng */ }
  let apiKey = "";
  try { apiKey = sessionStorage.getItem(SECRET_KEY) ?? ""; } catch { /* sessionStorage lỗi */ }
  return { baseUrl, apiKey, model };
}

export function saveAIConfig(cfg: AIConfigState): void {
  try { localStorage.setItem(PUBLIC_KEY, JSON.stringify({ baseUrl: cfg.baseUrl, model: cfg.model })); } catch { /* ignore */ }
  try {
    if (cfg.apiKey) sessionStorage.setItem(SECRET_KEY, cfg.apiKey);
    else sessionStorage.removeItem(SECRET_KEY);
  } catch { /* ignore */ }
}

export function clearAIConfig(): void {
  try { localStorage.setItem(PUBLIC_KEY, JSON.stringify({ baseUrl: "", model: "" })); } catch { /* ignore */ }
  try { sessionStorage.removeItem(SECRET_KEY); } catch { /* ignore */ }
}
