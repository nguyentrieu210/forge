import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

/**
 * `@metaforge/views` là package dùng chung, không phải app của một khách hàng.
 *
 * Trước đây `src/app/` có 7656 dòng thì 7325 dòng là `app/vertical/alumdoor` — dựng app thứ
 * hai từ package này vẫn kéo theo cả xưởng nhôm. Nay phần đó là package riêng
 * `@metaforge/vertical-alumdoor`, phụ thuộc NGƯỢC vào views chứ không nằm trong nó.
 *
 * Test giữ ranh giới vừa dựng: code vertical không quay lại, chiều phụ thuộc không đảo, và
 * những chỗ dùng chung còn nhắc tên khách hàng chỉ được ngắn đi chứ không dài ra.
 */

const VIEWS_SRC = path.resolve(import.meta.dirname, "..", "src");

// Bảy file dùng chung còn nhắc tên vertical — nợ cũ, danh sách chỉ được ngắn đi.
const KNOWN_MENTIONS = [
  "access/PermissionCenter.tsx",
  "action/FriendlyActionScreen.tsx",
  "action/SalesDeliveryWorkspace.tsx",
  "form/ChildGrid.tsx",
  "form/MetadataChildGrid.tsx",
  "system/CustomerImport.tsx",
  "system/ImportRouter.tsx",
];

function sources() {
  const files = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules") continue;
        walk(full);
      } else if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) {
        files.push([path.relative(VIEWS_SRC, full).split(path.sep).join("/"), readFileSync(full, "utf8")]);
      }
    }
  };
  walk(VIEWS_SRC);
  return files;
}

test("no vertical implementation lives inside the shared views package", () => {
  assert.ok(
    !existsSync(path.join(VIEWS_SRC, "app", "vertical", "alumdoor")),
    "code vertical đã chuyển sang @metaforge/vertical-alumdoor — đừng dựng lại nó trong views.",
  );
});

test("the shared views package does not grow new references to a vertical", () => {
  const mentions = sources()
    .filter(([, text]) => /alumdoor/i.test(text))
    .map(([rel]) => rel)
    .sort();
  assert.deepEqual(
    mentions,
    [...KNOWN_MENTIONS].sort(),
    "mã dùng chung nhắc tới vertical ở chỗ mới — đưa phần đó sang package vertical thay vì viết trong views.",
  );
});

test("views never imports a vertical package, so the dependency stays one-way", () => {
  const importers = sources()
    .filter(([, text]) => text.includes("@metaforge/vertical-"))
    .map(([rel]) => rel);
  assert.deepEqual(
    importers,
    [],
    "views mà import ngược vào vertical là tạo vòng phụ thuộc; vertical tự đăng ký qua registerVerticalWorkspace.",
  );
});
