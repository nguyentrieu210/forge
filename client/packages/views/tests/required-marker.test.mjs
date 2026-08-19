import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

/**
 * Dấu bắt buộc `*` luôn đứng TRƯỚC nhãn.
 *
 * Theo vben (`@core/ui-kit/form-ui/src/form-render/form-label.vue`: `mr-0.5 text-destructive`),
 * và lý do là công thái học chứ không phải thẩm mỹ:
 *
 * - Trên BIỂU MẪU: đặt sau nhãn thì dấu rơi vào một vị trí khác nhau ở mỗi trường, tuỳ nhãn
 *   dài ngắn. Muốn biết còn ô bắt buộc nào chưa điền thì phải đọc hết từng nhãn. Đặt trước
 *   thì tất cả thẳng một mép, quét dọc một lượt là thấy — trên biểu mẫu vài chục trường của
 *   ERP, khác biệt đó là thật.
 * - Trên TIÊU ĐỀ CỘT: nhãn cột bị cắt khi cột hẹp, dấu đứng sau bị cắt mất cùng nhãn; đứng
 *   trước thì luôn còn.
 *
 * Test canh hướng lề chứ không canh vị trí dòng: `mr-*` là trước, `ml-*` là sau.
 */

const VIEWS_SRC = path.resolve(import.meta.dirname, "..", "src");

function sources() {
  const files = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules") continue;
        walk(full);
      } else if (entry.name.endsWith(".tsx")) {
        files.push([path.relative(VIEWS_SRC, full).split(path.sep).join("/"), readFileSync(full, "utf8")]);
      }
    }
  };
  walk(VIEWS_SRC);
  return files;
}

test("dấu bắt buộc đứng trước nhãn ở mọi nơi", () => {
  const wrong = [];
  for (const [file, code] of sources()) {
    code.split("\n").forEach((line, index) => {
      if (!line.includes("mf-required")) return;
      // `ml-*` đẩy dấu ra SAU nhãn — đúng nghĩa là nó đang nằm sau.
      if (/mf-required[^"]*\bml-/.test(line)) wrong.push(`${file}:${index + 1}`);
    });
  }
  assert.deepEqual(
    wrong,
    [],
    `dấu bắt buộc còn đứng sau nhãn (dùng ml-*, phải là mr-*):\n  ${wrong.join("\n  ")}`,
  );
});

test("vẫn còn dấu bắt buộc để mà canh", () => {
  // Bảo hiểm cho chính test trên: nếu ai đó xoá hết `mf-required` thì test đầu vẫn xanh mà
  // biểu mẫu lại không còn báo trường bắt buộc.
  const total = sources().filter(([, code]) => code.includes("mf-required")).length;
  assert.ok(total >= 2, `chỉ còn ${total} file có dấu bắt buộc — nghi đã bị xoá nhầm`);
});
