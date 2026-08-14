import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { compileBrief } from "../scripts/lib/compile-brief.mjs";
import { readBriefSource } from "../scripts/lib/read-brief-source.mjs";
import { applyAlumdoorChildPresentation } from "../scripts/lib/alumdoor-child-presentation.mjs";

const briefUrl = new URL("../briefs/alumdoor-v2.json", import.meta.url);

function fieldOf(brief, doctypeName, fieldname) {
  const doctype = brief.doctypes.find((entry) => entry.name === doctypeName);
  assert.ok(doctype, `missing ${doctypeName}`);
  const field = doctype.fields.find((entry) => typeof entry === "object" && entry.fieldname === fieldname);
  assert.ok(field, `missing ${doctypeName}.${fieldname}`);
  return field;
}

test("cách bán/gói bán đã rời khỏi khai báo phụ thuộc và schema dòng bán", async () => {
  // Sales Option/Sales Package bị loại bỏ 2026-08-14: Alumdoor không còn phụ thuộc
  // "generic Selling authority" đó, và các doctype dòng bán không còn field trỏ tới nó.
  const manifest = compileBrief(await readBriefSource(briefUrl));
  const external = new Map((manifest.externalDocTypes ?? []).map((entry) => [entry.name, entry]));
  for (const name of ["Sales Option", "Sales Package"]) {
    assert.equal(external.has(name), false, `${name} không còn là phụ thuộc — cách bán/gói bán đã bị loại bỏ`);
  }
  for (const childName of ["Quotation Item", "Sales Order Item", "Sales Invoice Item"]) {
    const child = manifest.doctypes.find((entry) => entry.name === childName);
    const salesOption = child?.fields.find((entry) => entry.fieldname === "sales_option");
    assert.equal(salesOption, undefined, `${childName}.sales_option phải xóa khỏi schema`);
  }
});

test("purchase stamping is required only when the aluminum row is applicable", () => {
  const brief = JSON.parse(fs.readFileSync(briefUrl, "utf8"));
  applyAlumdoorChildPresentation(brief);
  for (const doctypeName of ["Purchase Order Item", "Purchase Receipt Item"]) {
    const field = fieldOf(brief, doctypeName, "is_stamped");
    assert.equal(Boolean(field.required), false, `${doctypeName}.is_stamped must not be globally required`);
    assert.equal(field.mandatory_depends_on, "eval:doc.inventory_mode == 'Nhôm cây/lá'", `${doctypeName}.is_stamped must be conditionally required for aluminum`);
    assert.equal(field.surface, "expanded", `${doctypeName}.is_stamped should stay in the conditional detail surface`);
  }
});
