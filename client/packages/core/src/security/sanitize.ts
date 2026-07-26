/**
 * sanitizeHtml — làm sạch HTML từ server/metadata trước khi render (P0-07, rule #15).
 * Chính sách allowlist rõ ràng: chỉ giữ tag định dạng cơ bản + href an toàn; loại bỏ
 * script/style/iframe, thuộc tính sự kiện on…, và URL javascript:/data:/vbscript:. KHÔNG dùng
 * regex để "parse" HTML — dùng DOMParser (inert, KHÔNG thực thi script) rồi duyệt cây theo allowlist.
 */

const ALLOWED_TAGS = new Set([
  "B", "I", "EM", "STRONG", "U", "S", "SMALL", "SPAN", "P", "BR", "HR",
  "UL", "OL", "LI", "CODE", "PRE", "A", "DIV", "TABLE", "THEAD", "TBODY", "TR", "TH", "TD",
  "H1", "H2", "H3", "H4", "H5", "H6", "BLOCKQUOTE",
]);
const ALLOWED_ATTRS = new Set(["href", "title", "colspan", "rowspan", "align"]);
const UNSAFE_URL = /^\s*(javascript|data|vbscript):/i;

function stripAllTags(html: string): string {
  return html.replace(/<[^>]*>/g, "");
}

function scrub(el: Element): void {
  for (const child of Array.from(el.children)) {
    if (!ALLOWED_TAGS.has(child.tagName)) {
      child.remove(); // loại hẳn (script/style/iframe/… + nội dung)
      continue;
    }
    for (const attr of Array.from(child.attributes)) {
      const name = attr.name.toLowerCase();
      if (name.startsWith("on") || !ALLOWED_ATTRS.has(name)) {
        child.removeAttribute(attr.name);
        continue;
      }
      if (name === "href" && UNSAFE_URL.test(attr.value)) child.removeAttribute("href");
    }
    scrub(child);
  }
}

/** Trả về HTML an toàn (đã allowlist). SSR/không DOM → strip toàn bộ tag (an toàn tuyệt đối). */
export function sanitizeHtml(html: string): string {
  if (!html) return "";
  if (typeof DOMParser === "undefined" || typeof document === "undefined") return stripAllTags(html);
  const doc = new DOMParser().parseFromString(html, "text/html"); // inert: KHÔNG chạy script
  scrub(doc.body);
  return doc.body.innerHTML;
}
