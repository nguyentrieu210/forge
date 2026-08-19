import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

/**
 * Cửa "phạm vi dữ liệu" chỉ được có MỘT bản.
 *
 * Trước đây đúng một dòng này được chép ở SÁU nơi — `apps/runtime`, `apps/hrm`,
 * `apps/sample-sales`, `apps/sample-wms`, `apps/demo` và cả `create-metaforge-app/templates.ts`
 * (nghĩa là mọi app sinh mới cũng thừa hưởng):
 *
 *   if (context.loading && !context.dimensions.length)
 *     return <div className="grid h-screen place-items-center …">Đang xác định phạm vi dữ liệu…</div>;
 *
 * Nó `return` TRƯỚC khi shell kịp render, nên mỗi lần tải trang khung điều hướng biến mất và
 * người dùng xem một dòng chữ trần giữa màn hình — sau một màn splash nền đen, tức là hai ngôn
 * ngữ thị giác khác hẳn nhau trong cùng một lần mở app.
 *
 * Tệ hơn: `BusinessContextProvider` CÓ khai `error` và `reload`, nhưng không nơi nào trong sáu
 * bản đó đọc chúng. Lời gọi phạm vi không trả lời thì `loading` ở nguyên `true` và màn hình
 * đứng vĩnh viễn, không lỗi, không đường thoát.
 *
 * Test giữ hai tính chất, không đếm dòng.
 */

const CLIENT_ROOT = path.resolve(import.meta.dirname, "..", "..", "..");
const SCANNED = ["apps", "packages"];
const SKIP = new Set(["node_modules", "dist", ".vite", "vendor"]);

/** Nhà duy nhất của luật. */
const OWNER = "packages/shell/src/scope-gate.tsx";

function sourceFiles() {
  const files = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (SKIP.has(entry.name)) continue;
        walk(path.join(dir, entry.name));
      } else if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) {
        files.push(path.join(dir, entry.name));
      }
    }
  };
  for (const top of SCANNED) walk(path.join(CLIENT_ROOT, top));
  return files.map((file) => [
    path.relative(CLIENT_ROOT, file).split(path.sep).join("/"),
    readFileSync(file, "utf8"),
  ]);
}

test("không app nào tự dựng lại màn chờ phạm vi dữ liệu", () => {
  // Dấu hiệu của bản chép: thoát sớm bằng một khối chiếm trọn chiều cao màn hình khi context
  // đang tải. `h-screen` là điểm nhận dạng — nó chỉ đúng khi KHÔNG có shell bao ngoài.
  const escaped = /context\.loading[^\n]*\breturn\b[^\n]*h-screen|business\.loading[^\n]*\breturn\b[^\n]*h-screen/;
  const offenders = sourceFiles()
    .filter(([file, code]) => file !== OWNER && escaped.test(code))
    .map(([file]) => file);

  assert.deepEqual(
    offenders,
    [],
    `app tự dựng lại màn chờ phạm vi thay vì dùng ScopeGateBody:\n  ${offenders.join("\n  ")}`,
  );
});

test("mọi nơi rẽ nhánh theo phạm vi đều đi qua resolveScopeState", () => {
  const branching = sourceFiles().filter(([file, code]) =>
    file !== OWNER && /!(context|business)\.ready\s*\?/.test(code));
  const withoutGate = branching
    .filter(([, code]) => !code.includes("resolveScopeState"))
    .map(([file]) => file);

  assert.deepEqual(
    withoutGate,
    [],
    `rẽ nhánh theo context.ready mà không qua resolveScopeState — nhánh "đang tải" và "hỏng" sẽ lại lọt:\n  ${withoutGate.join("\n  ")}`,
  );
});

test("cửa phạm vi có đọc error và reload", () => {
  const owner = readFileSync(path.join(CLIENT_ROOT, OWNER), "utf8");
  assert.ok(owner.includes("context.error") || owner.includes("if (context.error)"), "resolveScopeState phải xét error");
  assert.match(owner, /"error"/, "phải có trạng thái error riêng, không gộp vào loading");
  assert.match(owner, /onRetry/, "trạng thái hỏng phải có đường thử lại");
});

test("màn đăng nhập không còn tên của chương trình đã revert", () => {
  const login = readFileSync(path.join(CLIENT_ROOT, "packages/shell/src/auth/LoginForm.tsx"), "utf8");
  // Chỉ soi phần JSX in ra màn hình; chú thích được phép nhắc tên để giải thích lý do.
  const rendered = login.split("\n").filter((line) => !/^\s*(\*|\/\*|\/\/)/.test(line)).join("\n");
  assert.ok(!/>\s*Forge V3\s*</.test(rendered), 'màn đăng nhập không được in "Forge V3"');
  assert.ok(!/\bForge Vben Next\b/.test(rendered), 'màn đăng nhập không được in "Forge Vben Next"');
});
