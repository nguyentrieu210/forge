import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { registeredVerticalAppIds, verticalWorkspaceExtension } from "@metaforge/views";

/**
 * Vertical đăng ký bằng cách ĐƯỢC NẠP — và đó chính là chỗ dễ hỏng im lặng.
 *
 * `@metaforge/views` không được import ngược vào vertical (sẽ thành vòng phụ thuộc), nên
 * bảng phần mở rộng chỉ có nội dung khi ai đó nạp package vertical. Quên một dòng import là
 * app chạy bình thường nhưng màn làm việc mất sạch phần riêng của AlumDoor, không lỗi, không
 * cảnh báo — đúng kiểu hỏng chỉ phát hiện khi khách gọi.
 *
 * Hai vế được ghim ở đây: nạp package thì bảng phải có, và app runtime phải thật sự nạp nó.
 */

const CLIENT = path.resolve(import.meta.dirname, "..", "..", "..");

test("importing the vertical package registers its workspace extension", async () => {
  assert.deepEqual(registeredVerticalAppIds(), [], "bảng phải rỗng trước khi nạp vertical");
  await import("@metaforge/vertical-alumdoor");
  assert.deepEqual(registeredVerticalAppIds(), ["alumdoor"]);
  const extension = verticalWorkspaceExtension("alumdoor");
  assert.ok(extension, "nạp package rồi thì tra 'alumdoor' phải ra phần mở rộng");
  assert.equal(verticalWorkspaceExtension("ALUMDOOR"), extension, "tra không phân biệt hoa thường");
  assert.equal(verticalWorkspaceExtension("khac"), undefined);
  assert.equal(verticalWorkspaceExtension(undefined), undefined);
});

test("the runtime app actually loads the vertical package", () => {
  const mainBase = readFileSync(path.join(CLIENT, "apps", "runtime", "src", "main-base.tsx"), "utf8");
  assert.match(
    mainBase,
    /import\("@metaforge\/vertical-alumdoor"\)/,
    "apps/runtime phải nạp @metaforge/vertical-alumdoor, nếu không màn làm việc mất phần mở rộng mà không ai biết.",
  );
  const workspaceLoader = mainBase.slice(mainBase.indexOf("const DoctypeWorkspace = lazy("));
  const verticalAt = workspaceLoader.indexOf('import("@metaforge/vertical-alumdoor")');
  const workspaceAt = workspaceLoader.indexOf('import("@metaforge/views/doctype-workspace")');
  assert.ok(verticalAt >= 0 && workspaceAt >= 0, "cả hai lần nạp phải nằm trong cùng bộ nạp lười");
  assert.ok(verticalAt < workspaceAt, "vertical phải được nạp TRƯỚC màn làm việc, không thì lần render đầu đã trễ");
});
