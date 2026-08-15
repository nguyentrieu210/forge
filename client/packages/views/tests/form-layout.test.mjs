import assert from "node:assert/strict";
import test from "node:test";
import { groupLayout } from "../dist/form/layout.js";

const layoutTypes = new Set(["Tab Break", "Section Break", "Column Break", "Heading", "HTML"]);

function resolved(field, overrides = {}) {
  const layout = layoutTypes.has(field.fieldtype);
  return {
    field,
    layout,
    visible: true,
    masked: false,
    readOnly: layout,
    required: false,
    state: layout ? "locked" : "editable",
    ...overrides,
  };
}

function dataNames(tab) {
  return tab.sections.flatMap((section) =>
    section.columns.flatMap((column) => column.fields)
  ).filter((entry) => !entry.layout).map((entry) => entry.field.fieldname);
}

test("Employee-like metadata splits required fields from optional BHXH/bank details", () => {
  const tabs = groupLayout([
    resolved({ fieldname: "employee_name", fieldtype: "Data", reqd: 1 }),
    resolved({ fieldname: "company", fieldtype: "Link", reqd: 1 }),
    resolved({ fieldname: "branch", fieldtype: "Link", reqd: 1 }),
    resolved({ fieldname: "date_of_joining", fieldtype: "Date", reqd: 1 }),
    resolved({ fieldname: "social_insurance_number", fieldtype: "Data" }),
    resolved({ fieldname: "tax_code", fieldtype: "Data" }),
    resolved({ fieldname: "bank_account_no", fieldtype: "Data" }),
    resolved({ fieldname: "emergency_contact_phone", fieldtype: "Data" }),
  ]);

  assert.deepEqual(tabs.map((tab) => tab.label), ["Thông tin chính", "Nâng cao"]);
  assert.deepEqual(dataNames(tabs[0]), ["employee_name", "company", "branch", "date_of_joining"]);
  assert.deepEqual(dataNames(tabs[1]), ["social_insurance_number", "tax_code", "bank_account_no", "emergency_contact_phone"]);
});

test("small master stays on one screen instead of gaining pointless tabs", () => {
  const tabs = groupLayout([
    resolved({ fieldname: "designation_name", fieldtype: "Data", reqd: 1 }),
    resolved({ fieldname: "job_level", fieldtype: "Int", reqd: 1 }),
    resolved({ fieldname: "disabled", fieldtype: "Check" }),
  ]);

  assert.equal(tabs.length, 1);
  assert.deepEqual(dataNames(tabs[0]), ["designation_name", "job_level", "disabled"]);
});

test("authored Tab Break metadata always wins over automatic organization", () => {
  const tabs = groupLayout([
    resolved({ fieldname: "tab_main", label: "Hồ sơ", fieldtype: "Tab Break" }),
    resolved({ fieldname: "employee_name", fieldtype: "Data", reqd: 1 }),
    resolved({ fieldname: "tab_private", label: "Thông tin riêng", fieldtype: "Tab Break" }),
    resolved({ fieldname: "social_insurance_number", fieldtype: "Data" }),
  ]);

  assert.deepEqual(tabs.map((tab) => tab.label), ["Hồ sơ", "Thông tin riêng"]);
  assert.deepEqual(dataNames(tabs[0]), ["employee_name"]);
  assert.deepEqual(dataNames(tabs[1]), ["social_insurance_number"]);
});

test("dynamic-required controllers stay with primary fields and metadata may override grouping", () => {
  const tabs = groupLayout([
    resolved({ fieldname: "employee", fieldtype: "Link", reqd: 1 }),
    resolved({ fieldname: "insurance_required", fieldtype: "Check" }),
    resolved({ fieldname: "insurance_number", fieldtype: "Data", mandatory_depends_on: "eval:doc.insurance_required" }),
    resolved({ fieldname: "important_note", fieldtype: "Data", form_tab: "primary" }),
    resolved({ fieldname: "bank_account", fieldtype: "Data" }),
    resolved({ fieldname: "emergency_phone", fieldtype: "Data", form_tab: "advanced" }),
  ]);

  assert.equal(tabs.length, 2);
  assert.deepEqual(dataNames(tabs[0]), ["employee", "insurance_required", "insurance_number", "important_note"]);
  assert.deepEqual(dataNames(tabs[1]), ["bank_account", "emergency_phone"]);
});
