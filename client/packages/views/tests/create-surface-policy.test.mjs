import assert from "node:assert/strict";
import test from "node:test";
import { resolveCreateSurface } from "../dist/app/doctype-workspace-support.js";

const field = (fieldname, overrides = {}) => ({ fieldname, fieldtype: "Data", ...overrides });

test("complex master falls back to full create when quick omits editable configuration", () => {
  const meta = {
    fields: [
      field("profile_name", { surface: "quick" }),
      field("inventory_mode", { fieldtype: "Select", surface: "quick" }),
      field("stock_uom", { fieldtype: "Link", surface: "quick" }),
      field("require_length", { fieldtype: "Check", surface: "expanded" }),
      field("require_width", { fieldtype: "Check", surface: "expanded" }),
    ],
    viewPolicy: { quickEntry: { enabled: true, fields: ["profile_name", "inventory_mode", "stock_uom"] } },
  };

  assert.equal(resolveCreateSurface(meta), "full");
});

test("small master may use quick create when every editable business field is covered", () => {
  const meta = {
    fields: [field("uom_name", { surface: "quick" }), field("must_be_whole_number", { fieldtype: "Check", surface: "quick" })],
    viewPolicy: { quickEntry: { enabled: true, fields: ["uom_name", "must_be_whole_number"] } },
  };

  assert.equal(resolveCreateSurface(meta), "quick");
});

test("quick entry must be enabled explicitly by effective metadata", () => {
  const meta = {
    fields: [field("name", { surface: "quick" })],
    viewPolicy: { quickEntry: { enabled: false, fields: ["name"] } },
  };

  assert.equal(resolveCreateSurface(meta), "full");
});

test("child tables always force full create", () => {
  const meta = {
    fields: [field("name", { surface: "quick" }), field("items", { fieldtype: "Table", surface: "quick" })],
    viewPolicy: { quickEntry: { enabled: true, fields: ["name", "items"] } },
  };

  assert.equal(resolveCreateSurface(meta), "full");
});

test("internal and readonly fields do not make an otherwise complete quick form expand", () => {
  const meta = {
    fields: [
      field("reason", { surface: "quick" }),
      field("audit_hash", { surface: "internal", editMode: "hidden" }),
      field("created_by", { surface: "expanded", editMode: "readonly", read_only: 1 }),
    ],
    viewPolicy: { quickEntry: { enabled: true, fields: ["reason"] } },
  };

  assert.equal(resolveCreateSurface(meta), "quick");
});

test("caller can force expanded surface", () => {
  const meta = {
    fields: [field("name", { surface: "quick" })],
    viewPolicy: { quickEntry: { enabled: true, fields: ["name"] } },
  };

  assert.equal(resolveCreateSurface(meta, { forceExpanded: true }), "full");
});
