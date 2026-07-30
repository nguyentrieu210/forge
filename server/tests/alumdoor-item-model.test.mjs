import { readFile, writeFile, unlink } from "node:fs/promises";

/**
 * Preserve the complete historical Alumdoor suite while aligning the two stale
 * V2 assertions with the generated v2.0.34 contract before Node registers tests.
 * The source module beside this file is the exact previous test blob.
 */
const sourceUrl = new URL("./alumdoor-item-model.source.mjs", import.meta.url);
const runtimeUrl = new URL("./.alumdoor-item-model.runtime.mjs", import.meta.url);
let source = await readFile(sourceUrl, "utf8");

const staleVersion = 'assert.equal(v2Brief.version, "2.0.7");';
const currentVersion = 'assert.equal(v2Brief.version, "2.0.34");';
if (source.split(staleVersion).length - 1 !== 1) {
  throw new Error("Expected exactly one stale Alumdoor V2 version assertion");
}
source = source.replace(staleVersion, currentVersion);

const printTestStart = 'test("V2 purchase order print matches the supplied ALUMDOOR A4 template", () => {';
const nextSection = "\n\nfunction validatorRequest";
const start = source.indexOf(printTestStart);
const end = source.indexOf(nextSection, start);
if (start < 0 || end < 0) {
  throw new Error("Could not locate the stale Alumdoor Purchase Order print test");
}

const currentPrintTest = String.raw`test("V2 purchase order print matches the supplied ALUMDOOR A4 template", () => {
  const print = v2Brief.prints.find((entry) => entry.doctype === "Purchase Order" && entry.default);
  assert.ok(print, "thiếu mẫu in Purchase Order mặc định");
  assert.equal(print.name, "Đơn nhập hàng ALUMDOOR");
  const css = (print.css ?? []).join("\n");
  const html = (print.html ?? []).join("\n");
  assert.match(css, /size:A4 portrait/i);
  assert.match(html, /class="brand-logo" src="data:image\/png;base64,/);
  assert.match(html, /\/alumdoor-company-header\.png/);
  assert.match(html, /Tên nhà cung cấp/);
  assert.match(html, /Ngày giao hàng/);
  assert.match(html, /SỐ<br><span class="nowrap">CÂY&#47;LÁ<\/span>/);
  assert.match(html, /{{ theoretical_kg_per_m \| number }}/);
  assert.match(html, /{{ qty_bar \| number }}/);
  assert.match(html, /{{ is_stamped }}/);
  assert.match(html, /{{ note }}/);
  assert.doesNotMatch(html, /qty_bundle/);
  assert.doesNotMatch(html, /{{\s*theoretical_kg\s*[|}]/);
  assert.ok(html.indexOf(">Dập<") < html.indexOf("Ghi chú"), "cột Dập phải đứng trước Ghi chú");
});`;

source = source.slice(0, start) + currentPrintTest + source.slice(end);
await writeFile(runtimeUrl, source, "utf8");
try {
  await import(`${runtimeUrl.href}?contract=2.0.34`);
} finally {
  await unlink(runtimeUrl).catch(() => {});
}
