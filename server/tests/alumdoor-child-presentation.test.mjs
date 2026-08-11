import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { compileBrief } from "../scripts/lib/compile-brief.mjs";
import { attachBriefUiViewPolicies } from "../scripts/lib/brief-ui-view-policy.mjs";
import {
  applyAlumdoorChildPresentation,
  alumdoorGoldenChildGridPolicies,
} from "../scripts/lib/alumdoor-child-presentation.mjs";

function sourceBrief() {
  return JSON.parse(fs.readFileSync(new URL("../briefs/alumdoor-v2.json", import.meta.url), "utf8"));
}

function compileWithUiPolicies(brief) {
  return attachBriefUiViewPolicies(brief, compileBrief(brief));
}

function compiledDoctype(pkg, name) {
  const value = pkg.doctypes.find((doctype) => doctype.name === name);
  assert.ok(value, `missing compiled ${name}`);
  return value;
}

function names(view) {
  return view?.columns ?? view?.fields ?? [];
}

function hasConditionalApplicability(field) {
  return [field.depends_on, field.mandatory_depends_on, field.reqd_depends_on]
    .some((value) => typeof value === "string" && value.trim().length > 0);
}

function expectedQuick(golden, doctype) {
  const inForm = names(doctype.viewPolicy.form);
  const preferred = new Set(golden);
  for (const field of doctype.fields) {
    if (field.required && !field.read_only && !field.hidden && !hasConditionalApplicability(field)) {
      preferred.add(field.fieldname);
    }
  }
  return inForm.filter((fieldname) => preferred.has(fieldname));
}

function expectedFull(golden, doctype) {
  const existing = new Set(doctype.fields.map((field) => field.fieldname));
  return golden.filter((fieldname) => existing.has(fieldname));
}

function childPresentationSnapshot(brief) {
  return Object.fromEntries(brief.doctypes
    .filter((doctype) => doctype.child === true)
    .map((doctype) => [doctype.name, {
      form: doctype.form?.fields ?? [],
      quickEntry: doctype.quickEntry?.fields ?? [],
      surfaces: Object.fromEntries((doctype.fields ?? []).map((field) => [
        typeof field === "string" ? field.split(":")[0].trim() : field.fieldname,
        typeof field === "string" ? undefined : field.surface,
      ])),
    }]));
}

test("presentation helper migrates every Alumdoor child DocType without changing field order", () => {
  const brief = sourceBrief();
  const before = new Map(brief.doctypes.filter((dt) => dt.child === true).map((dt) => [dt.name, dt.fields.map((field) => typeof field === "string" ? field.split(":")[0].trim() : field.fieldname)]));
  const result = applyAlumdoorChildPresentation(brief);
  assert.equal(result.migrated, 28);
  for (const dt of brief.doctypes.filter((value) => value.child === true)) {
    assert.deepEqual(dt.fields.map((field) => field.fieldname), before.get(dt.name), `${dt.name} field order changed`);
    assert.ok(dt.fields.every((field) => ["quick", "expanded", "internal"].includes(field.surface)), `${dt.name} has missing surface`);
    assert.ok(Array.isArray(dt.form?.fields) && dt.form.fields.length > 0, `${dt.name} missing authored form fields`);
    assert.ok(Array.isArray(dt.quickEntry?.fields) && dt.quickEntry.fields.length > 0, `${dt.name} missing authored quick-entry fields`);
  }
});

test("generated AlumDoor brief is materialized from the canonical child-presentation helper", () => {
  const generated = sourceBrief();
  const expected = structuredClone(generated);
  applyAlumdoorChildPresentation(expected);
  assert.deepEqual(
    childPresentationSnapshot(generated),
    childPresentationSnapshot(expected),
    "server/briefs/alumdoor-v2.json drifted from applyAlumdoorChildPresentation",
  );
});

test("golden Sales and Purchase compact/full policies survive canonical UI-policy attachment", () => {
  const brief = sourceBrief();
  applyAlumdoorChildPresentation(brief);
  const pkg = compileWithUiPolicies(brief);

  for (const name of ["Quotation Item", "Sales Order Item"]) {
    const sales = compiledDoctype(pkg, name);
    assert.equal(sales.viewPolicy.form.enabled, true);
    assert.equal(sales.viewPolicy.quickEntry.enabled, true);
    assert.deepEqual(names(sales.viewPolicy.quickEntry), expectedQuick(alumdoorGoldenChildGridPolicies.salesCompact, sales));
    assert.deepEqual(names(sales.viewPolicy.form), expectedFull(alumdoorGoldenChildGridPolicies.salesFull, sales));
  }

  const po = compiledDoctype(pkg, "Purchase Order Item");
  assert.deepEqual(names(po.viewPolicy.quickEntry), expectedQuick(alumdoorGoldenChildGridPolicies.purchaseCompact, po));
  assert.deepEqual(names(po.viewPolicy.form), expectedFull(alumdoorGoldenChildGridPolicies.purchaseOrderFull, po));

  const receipt = compiledDoctype(pkg, "Purchase Receipt Item");
  assert.deepEqual(names(receipt.viewPolicy.quickEntry), expectedQuick(alumdoorGoldenChildGridPolicies.purchaseCompact, receipt));
  assert.deepEqual(names(receipt.viewPolicy.form), expectedFull(alumdoorGoldenChildGridPolicies.purchaseReceiptFull, receipt));
});

test("current Sales operator contract exposes option and server money, never legacy pricing authority", () => {
  const brief = sourceBrief();
  applyAlumdoorChildPresentation(brief);
  const pkg = compileWithUiPolicies(brief);

  for (const name of ["Quotation Item", "Sales Order Item"]) {
    const sales = compiledDoctype(pkg, name);
    const fields = new Map(sales.fields.map((field) => [field.fieldname, field]));
    const quick = new Set(names(sales.viewPolicy.quickEntry));
    const full = new Set(names(sales.viewPolicy.form));

    for (const fieldname of ["sales_option", "discount_amount", "adjustment_amount", "net_amount"]) {
      assert.ok(fields.has(fieldname), `${name}.${fieldname} missing from effective child schema`);
      assert.ok(quick.has(fieldname), `${name}.${fieldname} missing from compact operator surface`);
    }
    for (const fieldname of ["discount_amount", "adjustment_amount", "net_amount"]) {
      assert.equal(Boolean(fields.get(fieldname)?.read_only), true, `${name}.${fieldname} must remain server-owned/read-only`);
    }
    for (const fieldname of ["sales_mode", "discount_percentage", "formula_policy", "formula_version"]) {
      if (!fields.has(fieldname)) continue;
      assert.equal(quick.has(fieldname), false, `${name}.${fieldname} leaked into compact business surface`);
      assert.equal(full.has(fieldname), false, `${name}.${fieldname} leaked into full business surface`);
      assert.equal(fields.get(fieldname)?.surface, "internal", `${name}.${fieldname} must be internal`);
    }
  }

  const invoice = compiledDoctype(pkg, "Sales Invoice Item");
  const invoiceFields = new Map(invoice.fields.map((field) => [field.fieldname, field]));
  assert.ok(invoiceFields.has("sales_option"), "Sales Invoice Item.sales_option missing from current Selling contract");
  assert.ok(new Set(names(invoice.viewPolicy.quickEntry)).has("sales_option"), "Sales Invoice Item.sales_option missing from compact surface");
  assert.equal(invoiceFields.get("sales_option")?.surface, "quick", "Sales Invoice Item.sales_option must stay operator-visible");
});

test("Sales audit/package/source-line snapshots never leak from generic child policies", () => {
  const brief = sourceBrief();
  applyAlumdoorChildPresentation(brief);
  const pkg = compileWithUiPolicies(brief);
  const internalNames = new Set([
    "sales_option_code", "sales_option_label", "sales_option_version", "price_variant",
    "discount_basis_variant", "discount_basis_item_price", "sales_qty_basis", "sales_package",
    "sales_package_version", "sales_package_checksum", "sales_package_snapshot",
    "sales_order_row_id", "sales_package_component_key",
  ]);

  for (const name of ["Quotation Item", "Sales Order Item", "Delivery Note Item", "Sales Invoice Item"]) {
    const sales = compiledDoctype(pkg, name);
    const quick = new Set(names(sales.viewPolicy.quickEntry));
    const full = new Set(names(sales.viewPolicy.form));
    for (const field of sales.fields) {
      if (!internalNames.has(field.fieldname)) continue;
      assert.equal(field.surface, "internal", `${name}.${field.fieldname} must be internal`);
      assert.equal(quick.has(field.fieldname), false, `${name}.${field.fieldname} leaked into compact surface`);
      assert.equal(full.has(field.fieldname), false, `${name}.${field.fieldname} leaked into full surface`);
    }
  }
});

test("all child doctypes own presentation while conditional required fields stay reachable without blanket quick inflation", () => {
  const brief = sourceBrief();
  applyAlumdoorChildPresentation(brief);
  const pkg = compileWithUiPolicies(brief);
  const children = pkg.doctypes.filter((doctype) => doctype.is_child === true);
  assert.equal(children.length, 28);
  const missing = children
    .filter((doctype) => !doctype.viewPolicy?.form?.enabled || !doctype.viewPolicy?.quickEntry?.enabled)
    .map((doctype) => doctype.name);
  assert.deepEqual(missing, [], `children without explicit presentation ownership: ${missing.join(", ")}`);

  const unreachable = [];
  for (const doctype of children) {
    const quick = new Set(names(doctype.viewPolicy.quickEntry));
    const full = new Set(names(doctype.viewPolicy.form));
    for (const field of doctype.fields) {
      if (field.hidden || field.read_only) continue;
      const conditional = hasConditionalApplicability(field);
      if (field.required && !conditional && !quick.has(field.fieldname)) {
        unreachable.push(`${doctype.name}.${field.fieldname}: unconditional required missing from quick`);
      }
      if ((field.required || field.mandatory_depends_on) && conditional && !full.has(field.fieldname)) {
        unreachable.push(`${doctype.name}.${field.fieldname}: conditional required missing from full/detail`);
      }
    }
  }
  assert.deepEqual(unreachable, [], `unreachable required fields: ${unreachable.join(", ")}`);

  for (const name of ["Purchase Order Item", "Purchase Receipt Item"]) {
    const purchase = compiledDoctype(pkg, name);
    const quick = new Set(names(purchase.viewPolicy.quickEntry));
    const full = new Set(names(purchase.viewPolicy.form));
    if (purchase.fields.some((field) => field.fieldname === "is_stamped" && hasConditionalApplicability(field))) {
      assert.equal(quick.has("is_stamped"), false, `${name}.is_stamped must be conditional/detail, not permanent quick`);
      assert.equal(full.has("is_stamped"), true, `${name}.is_stamped must remain reachable in detail`);
    }
  }

  const receipt = compiledDoctype(pkg, "Purchase Receipt Item");
  const receiptFields = new Map(receipt.fields.map((field) => [field.fieldname, field]));
  const receiptQuick = new Set(names(receipt.viewPolicy.quickEntry));
  const receiptFull = new Set(names(receipt.viewPolicy.form));
  for (const fieldname of [
    "width_m", "height_m", "set_count", "length_m", "qty_bar", "rate_uom",
    "actual_weight_kg", "actual_kg_per_m", "actual_kg_per_sqm", "weight_variance_pct", "condition", "is_stamped",
  ]) {
    if (!receiptFields.has(fieldname)) continue;
    assert.equal(receiptFull.has(fieldname), true, `Purchase Receipt Item.${fieldname} must remain reachable in full/detail`);
  }
  for (const fieldname of ["set_count", "is_stamped"]) {
    if (!receiptFields.has(fieldname) || !hasConditionalApplicability(receiptFields.get(fieldname))) continue;
    assert.equal(receiptQuick.has(fieldname), false, `Purchase Receipt Item.${fieldname} must not be permanently quick`);
    assert.equal(receiptFields.get(fieldname)?.surface, "expanded", `Purchase Receipt Item.${fieldname} must be expanded/detail`);
  }
});
