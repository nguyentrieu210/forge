import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Ghim chuỗi `design` xuyên bốn tầng, vì nó đi qua BA cách viết tên khác nhau.
 *
 * Một app khai diện mạo trong brief rồi nó chạy tới CSS qua đường này:
 *
 *   brief.json            design.contentWidth        (camelCase — schema chốt)
 *     -> compile-brief.mjs  design.content_width     (đổi tên tại đây)
 *     -> AppDesign (client) design.content_width
 *     -> applyDesign()      data-content-width="…"   (đổi tên lần nữa)
 *     -> styles.css         [data-content-width="…"]
 *
 * Mỗi mũi tên là một chỗ có thể gõ sai mà KHÔNG ai báo: sai ở đâu thì thuộc tính đơn giản là
 * không được dán, giao diện giữ nguyên mặc định, không có lỗi nào bật ra. Trước test này chỉ
 * một mắt xích (`compile-brief.test.mjs`) được canh.
 *
 * Cái làm chuyện này nguy hiểm thật là Alumdoor KHÔNG khai `design`, nên nếu chuỗi gãy thì
 * sáu app App Factory đang khai (`app-factory`, `erp-organization-security`, `logistics`,
 * `plastic-erp`, `website`, `workplace`) mới là bên chịu, mà chúng không phải thứ ta mở hằng
 * ngày để nhìn thấy.
 */

const SHELL_SRC = path.resolve(import.meta.dirname, "..", "src");
const CLIENT_ROOT = path.resolve(SHELL_SRC, "..", "..", "..");
const REPO_ROOT = path.resolve(CLIENT_ROOT, "..");

const read = (...parts) => readFileSync(path.join(...parts), "utf8");

/** Khoá brief (camelCase) -> khoá manifest (snake_case) -> attribute trên <html>. */
const CHAIN = [
  { brief: "density", manifest: "density", attribute: "data-density" },
  { brief: "radius", manifest: "radius", attribute: "data-radius" },
  { brief: "contentWidth", manifest: "content_width", attribute: "data-content-width" },
];

/**
 * `comfortable` cố ý KHÔNG có block CSS riêng: nó chính là giá trị nền của `:root`. Ghi ra đây
 * để lần sau ai thấy thiếu thì biết là chủ ý, không phải sót.
 */
const CSS_DEFAULTS = new Set(["data-density=comfortable"]);

function schemaDesign() {
  const schema = JSON.parse(read(REPO_ROOT, "server", "briefs", "brief.schema.json"));
  return schema.properties.design.properties;
}

test("schema, manifest server, kiểu client và applyDesign khai cùng một bộ khoá", () => {
  const schema = schemaDesign();
  assert.deepEqual(
    Object.keys(schema).sort(),
    CHAIN.map((c) => c.brief).sort(),
    "brief.schema.json đổi bộ khoá design mà chuỗi bên dưới chưa theo",
  );

  const clientType = read(CLIENT_ROOT, "packages", "core", "src", "app", "manifest.ts");
  const serverType = read(REPO_ROOT, "server", "packages", "app-registry", "src", "manifest.ts");
  const applyDesign = read(SHELL_SRC, "design.ts");

  for (const link of CHAIN) {
    assert.match(clientType, new RegExp(`^\\s*${link.manifest}\\?:`, "m"), `AppDesign (client) thiếu ${link.manifest}`);
    assert.match(serverType, new RegExp(`^\\s*${link.manifest}\\?:`, "m"), `AppDesignManifest (server) thiếu ${link.manifest}`);
    assert.match(applyDesign, new RegExp(`${link.manifest}:\\s*"${link.attribute}"`), `applyDesign không dán ${link.attribute}`);
  }
});

test("compile-brief dịch đủ mọi khoá design, không bỏ rơi khoá nào", () => {
  const compile = read(REPO_ROOT, "server", "scripts", "lib", "compile-brief.mjs");
  for (const link of CHAIN) {
    assert.match(
      compile,
      new RegExp(`brief\\.design\\.${link.brief}\\s*\\?\\s*\\{\\s*${link.manifest}:`),
      `compile-brief.mjs không dịch brief.design.${link.brief} -> ${link.manifest}; app khai khoá này sẽ bị bỏ im lặng`,
    );
  }
});

test("mọi giá trị schema cho phép đều có chỗ đáp ở CSS", () => {
  const schema = schemaDesign();
  const css = read(CLIENT_ROOT, "packages", "ui", "src", "styles.css");
  const missing = [];
  for (const link of CHAIN) {
    for (const value of schema[link.brief].enum) {
      if (CSS_DEFAULTS.has(`${link.attribute}=${value}`)) continue;
      if (!css.includes(`[${link.attribute}="${value}"]`)) missing.push(`${link.attribute}="${value}"`);
    }
  }
  assert.deepEqual(missing, [], `schema cho phép giá trị mà CSS không có luật nào đáp:\n  ${missing.join("\n  ")}`);
});

test("app đang khai design vẫn khai bằng đúng tên manifest", () => {
  // Sáu app này là bên duy nhất đang dùng thật. Nếu ai đổi chúng sang camelCase (giống brief)
  // thì `applyDesign` đọc `content_width` sẽ ra undefined và diện mạo lặng lẽ về mặc định.
  const apps = [
    "app-factory", "erp-organization-security", "logistics", "plastic-erp", "website", "workplace",
  ];
  for (const app of apps) {
    const raw = read(REPO_ROOT, "server", "apps-src", app, "app.json");
    if (!raw.includes('"design"')) continue;
    assert.ok(!raw.includes('"contentWidth"'), `${app}/app.json dùng "contentWidth" — app.json phải dùng tên manifest "content_width"`);
  }
});
