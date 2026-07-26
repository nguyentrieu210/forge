/**
 * URL sanitizer (Gate 5) — chặn scheme nguy hiểm khi render href/src từ DỮ LIỆU người dùng
 * (file_url, field URL, ảnh). Chống `javascript:`/`vbscript:`/`data:`/`file:` (kể cả obfuscate
 * bằng control-char/space/uppercase). Thuần hàm, dễ test. KHÔNG thay cho sanitizeHtml (bổ trợ).
 */

/** scheme cho phép khi URL có scheme rõ ràng. Không scheme (relative/anchor) ⇒ luôn cho. */
const SAFE_SCHEMES = new Set(["http:", "https:", "mailto:", "tel:", "ftp:"]);

/** chuẩn hoá để dò scheme: bỏ control-char/space/nbsp, hạ chữ (chống obfuscate scheme). */
function normalizeForScheme(s: string): string {
  let out = "";
  for (const ch of s) {
    const c = ch.codePointAt(0) ?? 0;
    if (c <= 0x20 || c === 0xa0) continue; // bỏ control-char (0x00–0x20), space, nbsp
    out += ch;
  }
  return out.toLowerCase();
}

/**
 * sanitizeUrl — trả URL nếu an toàn, "" nếu scheme nguy hiểm.
 * Relative/anchor/query/không-scheme ⇒ giữ nguyên. Có scheme ⇒ phải ∈ SAFE_SCHEMES.
 */
export function sanitizeUrl(url: unknown): string {
  if (typeof url !== "string") return "";
  const s = url.trim();
  if (!s) return "";
  const norm = normalizeForScheme(s);
  // đường dẫn tương đối / anchor / query → an toàn (không có scheme thực thi).
  if (/^(\/|\.{1,2}\/|#|\?)/.test(s)) return s;
  const m = /^([a-z][a-z0-9+.-]*):/.exec(norm);
  if (!m) return s; // không scheme → coi là relative, an toàn
  return SAFE_SCHEMES.has(m[1] + ":") ? s : "";
}

/**
 * sanitizeImageUrl — như sanitizeUrl nhưng CHO PHÉP data:image raster (png/jpeg/gif/webp/avif).
 * KHÔNG cho `data:image/svg+xml` — SVG data-URI có thể chứa script/nội dung động (L4, phòng thủ sâu).
 */
export function sanitizeImageUrl(url: unknown): string {
  if (typeof url !== "string") return "";
  const s = url.trim();
  if (/^data:image\/(png|jpe?g|gif|webp|avif)[;,]/i.test(normalizeForScheme(s))) return s;
  return sanitizeUrl(url);
}
