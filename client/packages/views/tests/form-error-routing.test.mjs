import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Lỗi server phải về ĐÚNG chỗ gây ra nó, và luật đó chỉ được viết một lần.
 *
 * `mapError` tách `_server_messages` thành `fieldErrors` cho MỌI lỗi server — lúc lưu, lúc
 * submit, lúc chuyển trạng thái quy trình đều cùng cấu trúc. Nhưng trước đây chỉ đường LƯU đọc
 * nó; sáu đường còn lại chỉ `toast.error(adapter.mapError(e).message)` rồi vứt phần chi tiết đi.
 *
 * Với operator, khác biệt là: submit hỏng vì thiếu một trường bắt buộc thì hoặc ô đó đỏ lên tại
 * chỗ, hoặc một dòng toast tự tắt sau vài giây và người dùng tự dò trên biểu mẫu vài chục ô.
 *
 * Test canh tính chất chứ không canh số dòng: trong `FormContainer`, không catch nào được tự
 * gọi `toast.error` với lỗi đã map — tất cả phải đi qua `reportError`.
 */

const VIEWS_SRC = path.resolve(import.meta.dirname, "..", "src");
const FORM_CONTAINER = path.join(VIEWS_SRC, "container", "FormContainer.tsx");

test("mọi lỗi server của FormContainer đi qua một cửa duy nhất", () => {
  const code = readFileSync(FORM_CONTAINER, "utf8");

  const bare = code
    .split("\n")
    .map((line, index) => [index + 1, line])
    .filter(([, line]) => /toast\.error\s*\(\s*adapter\.mapError/.test(line));

  assert.deepEqual(
    bare.map(([n, line]) => `${n}: ${line.trim()}`),
    [],
    "catch block tự map lỗi rồi toast — phần `fieldErrors` bị vứt đi; gọi reportError(e) thay vào",
  );
});

test("reportError vừa đánh dấu ô sai vừa xoá dấu cũ", () => {
  const code = readFileSync(FORM_CONTAINER, "utf8");
  const body = code.slice(code.indexOf("const reportError"), code.indexOf("const onSave"));

  assert.ok(body.includes("err.fieldErrors"), "reportError phải đọc fieldErrors");
  assert.match(
    body,
    /setFieldErrors\(err\.fieldErrors \? \{ \.\.\.err\.fieldErrors \} : undefined\)/,
    "lỗi mới không kèm chi tiết trường thì phải XOÁ dấu cũ, không để ô còn đỏ vì lần hỏng trước",
  );
  assert.ok(
    body.includes('err.kind === "conflict"'),
    "xung đột phiên bản vẫn phải đi lối riêng vì nó có UI hoà giải riêng",
  );
});

test("mỗi thao tác bắt đầu bằng việc xoá dấu lỗi của lần trước", () => {
  const code = readFileSync(FORM_CONTAINER, "utf8");
  const lines = code.split("\n");
  const orphans = [];
  lines.forEach((line, index) => {
    if (!/^\s*setSaving\(true\);\s*$/.test(line)) return;
    const next = lines[index + 1] ?? "";
    if (!/setFieldErrors\(undefined\)/.test(next)) orphans.push(index + 1);
  });
  assert.deepEqual(
    orphans,
    [],
    `thao tác bắt đầu mà không xoá dấu lỗi cũ (dòng ${orphans.join(", ")}) — ô của lần hỏng trước sẽ còn đỏ`,
  );
});
