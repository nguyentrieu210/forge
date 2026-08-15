import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  isLikelyEnglishUiSource,
  translateVietnameseSource,
  VIETNAMESE_ERP_TRANSLATIONS,
} from "../dist/packages/frappe-api/src/vietnamese-translations.js";
import { D1TranslationStore } from "../dist/packages/frappe-api/src/translations.js";
import { compileBrief } from "../scripts/lib/compile-brief.mjs";
import { readBriefSource } from "../scripts/lib/read-brief-source.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const briefPath = path.join(here, "..", "briefs", "alumdoor-v2.json");

function fakeDb(rows = []) {
  return {
    withSession() { return this; },
    prepare() {
      return {
        bind() {
          return {
            async all() { return { results: rows }; },
            async run() { return { meta: { changes: 0 } }; },
          };
        },
      };
    },
    async batch() { return []; },
  };
}

function collectManifestUiSources(manifest) {
  const sources = new Set();
  for (const doctype of manifest.doctypes ?? []) {
    if (doctype.name) sources.add(doctype.name);
    if (doctype.label) sources.add(doctype.label);
    for (const field of doctype.fields ?? []) {
      if (field.label) sources.add(field.label);
      if (field.fieldtype === "Select" && typeof field.options === "string") {
        for (const option of field.options.split("\n")) if (option.trim()) sources.add(option.trim());
      }
    }
  }
  for (const doctype of manifest.externalDocTypes ?? []) {
    if (doctype.name) sources.add(doctype.name);
    if (doctype.label) sources.add(doctype.label);
  }
  return [...sources];
}

test("Vietnamese ERP catalog covers the main generic form domains", () => {
  const expected = {
    "Company": "Công ty",
    "Fiscal Year": "Năm tài chính",
    "Item Code": "Mã hàng",
    "Stock UOM": "Đơn vị tồn kho",
    "Warehouse": "Kho",
    "Purchase Order": "Đơn mua hàng",
    "Purchase Receipt": "Phiếu nhập hàng",
    "Sales Order": "Đơn bán hàng",
    "Delivery Note": "Phiếu giao hàng",
    "Sales Invoice": "Hóa đơn bán hàng",
    "BOM": "Định mức nguyên vật liệu (BOM)",
    "Work Order": "Lệnh sản xuất",
    "Production Request": "Yêu cầu sản xuất",
    "Employee": "Nhân viên",
    "Employee Name": "Tên nhân viên",
    "Department": "Phòng ban",
    "Attendance": "Chấm công",
    "Salary Slip": "Phiếu lương",
    "Payroll Entry": "Bảng lương",
    "Quality Inspection": "Kiểm tra chất lượng",
    "Warranty Claim": "Yêu cầu bảo hành",
    "Pricing Rule": "Chính sách giá",
    "Customer": "Khách hàng",
    "Supplier": "Nhà cung cấp",
    "Posting Date": "Ngày ghi sổ",
    "Material Transfer": "Chuyển kho",
  };
  for (const [source, translated] of Object.entries(expected)) {
    assert.equal(translateVietnameseSource(source), translated, source);
  }
});

test("Vietnamese fallback is fail-soft for Vietnamese text, codes and unknown prose", () => {
  assert.equal(translateVietnameseSource("Mã hàng"), "Mã hàng");
  assert.equal(translateVietnameseSource("AL548N"), "AL548N");
  assert.equal(translateVietnameseSource("A deliberately unknown explanatory sentence that must not be guessed."),
    "A deliberately unknown explanatory sentence that must not be guessed.");
});

test("D1 tenant wording overrides the platform Vietnamese fallback", async () => {
  const store = new D1TranslationStore(fakeDb([
    { source_text: "Employee", translated_text: "Người lao động" },
  ]));
  const translated = await store.translate("demo", "vi-VN", ["Employee", "Warehouse"]);
  assert.equal(translated.Employee, "Người lao động");
  assert.equal(translated.Warehouse, "Kho");
});

test("non-Vietnamese languages keep source text when tenant catalog is empty", async () => {
  const store = new D1TranslationStore(fakeDb());
  const translated = await store.translate("demo", "en", ["Employee", "Warehouse"]);
  assert.deepEqual(translated, { Employee: "Employee", Warehouse: "Warehouse" });
});

test("canonical Alumdoor manifest UI labels are swept through the Vietnamese fallback", async (t) => {
  const manifest = compileBrief(await readBriefSource(briefPath));
  assert.ok((manifest.doctypes ?? []).length >= 74, "expected current Alumdoor canonical DocType coverage");

  const sources = collectManifestUiSources(manifest);
  const englishLike = sources.filter(isLikelyEnglishUiSource);
  const translated = englishLike.filter((source) => translateVietnameseSource(source) !== source);
  const unresolved = englishLike.filter((source) => translateVietnameseSource(source) === source);

  t.diagnostic(JSON.stringify({
    doctypes: manifest.doctypes.length,
    uiSources: sources.length,
    englishLike: englishLike.length,
    translated: translated.length,
    unresolved: unresolved.slice(0, 30),
    exactCatalogEntries: Object.keys(VIETNAMESE_ERP_TRANSLATIONS).length,
  }));

  // The sweep is intentionally exhaustive over the canonical manifest, while the assertion is
  // semantic: every source we recognise as an English ERP UI label must produce Vietnamese output.
  assert.deepEqual(unresolved, []);
});
