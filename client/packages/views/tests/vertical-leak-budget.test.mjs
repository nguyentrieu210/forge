import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

/**
 * `@metaforge/views` là package dùng chung, không phải app của một khách hàng.
 *
 * Thực tế đang ngược lại: `src/app/` có 7656 dòng thì 7336 dòng nằm trong
 * `src/app/vertical/alumdoor` — nghĩa là dựng app thứ hai từ package này vẫn kéo theo cả
 * xưởng nhôm. Dời hẳn thư mục vertical ra package riêng là việc lớn (P4 trong
 * docs/REFACTOR-FORGE-20260819.md), chưa làm trong đợt này.
 *
 * Test này giữ cho vết loang KHÔNG rộng thêm trong lúc chờ: mã dùng chung chỉ được nhắc
 * tới vertical đúng ở những chỗ đã biết. Thêm một chỗ nữa là đỏ ở đây trước, và người thêm
 * phải quyết định có ý thức chứ không lỡ tay.
 */

const VIEWS_SRC = path.resolve(import.meta.dirname, "..", "src");
const VERTICAL_DIR = "app/vertical/alumdoor";

// Tám file dùng chung còn nhắc tên vertical. Danh sách chỉ được ngắn đi, không được dài ra.
const KNOWN_MENTIONS = [
  "access/PermissionCenter.tsx",
  "action/FriendlyActionScreen.tsx",
  "action/SalesDeliveryWorkspace.tsx",
  "app/RuntimeDoctypeWorkspace.tsx",
  "form/ChildGrid.tsx",
  "form/MetadataChildGrid.tsx",
  "system/CustomerImport.tsx",
  "system/ImportRouter.tsx",
];

// Chỗ duy nhất mã dùng chung import thẳng vào thư mục vertical.
const KNOWN_IMPORTS = ["app/RuntimeDoctypeWorkspace.tsx"];

function genericSources() {
  const files = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      const rel = path.relative(VIEWS_SRC, full).split(path.sep).join("/");
      if (entry.isDirectory()) {
        if (rel === VERTICAL_DIR || entry.name === "node_modules") continue;
        walk(full);
      } else if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) {
        files.push([rel, readFileSync(full, "utf8")]);
      }
    }
  };
  walk(VIEWS_SRC);
  return files;
}

test("the shared views package does not grow new references to the AlumDoor vertical", () => {
  const mentions = genericSources()
    .filter(([, text]) => /alumdoor/i.test(text))
    .map(([rel]) => rel)
    .sort();
  assert.deepEqual(
    mentions,
    [...KNOWN_MENTIONS].sort(),
    "mã dùng chung nhắc tới vertical ở chỗ mới — đưa phần đó vào src/app/vertical/alumdoor thay vì viết trong package chung.",
  );
});

test("only the runtime composition root reaches into the vertical folder", () => {
  const importers = genericSources()
    .filter(([, text]) => text.includes(VERTICAL_DIR) || text.includes("./vertical/alumdoor"))
    .map(([rel]) => rel)
    .sort();
  assert.deepEqual(
    importers,
    [...KNOWN_IMPORTS].sort(),
    "chỉ điểm ráp runtime được import vào vertical; chỗ khác cần thì nhận qua tham số.",
  );
});
