import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

/**
 * Nút chỉ có icon phải có tên đọc được.
 *
 * Một nút mang mỗi hình vẽ thì với trình đọc màn hình nó là "button" trống rỗng — người dùng
 * bàn phím nghe thấy đúng chữ đó và không biết bấm vào sẽ ra gì.
 *
 * Repo hiện đang SẠCH ở điểm này (133/133 nút có nhãn), nên test tồn tại để GIỮ, không phải để
 * đòi dọn. Chi phí thêm một nút thiếu nhãn là gần bằng không nếu không ai canh.
 *
 * Lưu ý cách quét: KHÔNG dùng regex kiểu `<Button[^>]*>` để lấy thẻ mở. `onClick={() => ...}`
 * có dấu '>' bên trong nên mẫu đó cắt thẻ sớm, bỏ sót mọi thuộc tính đứng sau handler — lần đầu
 * quét bằng regex cho ra 69 nút "thiếu nhãn" mà thực tế chỉ có 1. Phải đếm ngoặc.
 */

const CLIENT_ROOT = path.resolve(import.meta.dirname, "..", "..", "..");
const SCANNED = ["apps", "packages"];
const SKIP = new Set(["node_modules", "dist", ".vite", "vendor"]);

const NAMED = /aria-label\s*=|aria-labelledby\s*=|title\s*=/;
const ICON_SIZE = /size\s*=\s*"icon[^"]*"/;

/** Thẻ mở JSX bắt đầu ở `start`: quét ký tự, đếm `{}`, bỏ qua chuỗi. */
function openTag(src, start) {
  let depth = 0;
  let quote = null;
  for (let i = start; i < src.length; i += 1) {
    const ch = src[i];
    if (quote) {
      if (ch === "\\") { i += 1; continue; }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") quote = ch;
    else if (ch === "{") depth += 1;
    else if (ch === "}") depth -= 1;
    else if (ch === ">" && depth === 0) return { text: src.slice(start, i + 1), end: i + 1 };
  }
  return null;
}

function sourceFiles() {
  const files = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (SKIP.has(entry.name)) continue;
        walk(path.join(dir, entry.name));
      } else if (entry.name.endsWith(".tsx")) {
        files.push(path.join(dir, entry.name));
      }
    }
  };
  for (const top of SCANNED) walk(path.join(CLIENT_ROOT, top));
  return files;
}

test("mọi nút chỉ có icon đều có tên đọc được", () => {
  const offenders = [];
  let scanned = 0;

  for (const file of sourceFiles()) {
    const src = readFileSync(file, "utf8");
    let pos = 0;
    for (;;) {
      const start = src.indexOf("<Button", pos);
      if (start < 0) break;
      const tag = openTag(src, start);
      if (!tag) break;
      pos = tag.end;
      if (!ICON_SIZE.test(tag.text)) continue;
      scanned += 1;
      const selfClosing = tag.text.trimEnd().endsWith("/>");
      const close = selfClosing ? -1 : src.indexOf("</Button>", tag.end);
      const body = close >= 0 ? src.slice(tag.end, close) : "";
      // Tên tới từ thuộc tính, hoặc từ chữ ẩn (`sr-only`) đặt trong thân nút.
      if (NAMED.test(tag.text) || body.includes("sr-only")) continue;
      const rel = path.relative(CLIENT_ROOT, file).split(path.sep).join("/");
      offenders.push(`${rel}:${src.slice(0, start).split("\n").length}`);
    }
  }

  assert.ok(scanned > 100, `quét được quá ít nút (${scanned}) — bộ quét có thể đã hỏng`);
  assert.deepEqual(
    offenders,
    [],
    `nút chỉ có icon mà không có aria-label/title/sr-only:\n  ${offenders.join("\n  ")}`,
  );
});
