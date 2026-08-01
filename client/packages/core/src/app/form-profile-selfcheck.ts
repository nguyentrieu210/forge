import { applyFormSurface } from "./form-profile.js";
import type { DocTypeMeta } from "../types/meta.js";

const meta: DocTypeMeta = {
  name: "Canonical Surface Check",
  kind: "transaction",
  fields: [
    { fieldname: "public_name", label: "Public", fieldtype: "Data", reqd: 1, surface: "quick", valueSource: "user", editMode: "editable" },
    // Deliberately required and the title field: legacy FormProfile safety rules would
    // normally pull this back into the renderer. Canonical `internal` must still win.
    { fieldname: "server_code", label: "Server Code", fieldtype: "Data", reqd: 1, surface: "internal", valueSource: "system", editMode: "hidden", serverEnforced: true },
    { fieldname: "details", label: "Details", fieldtype: "Data", surface: "expanded", valueSource: "user", editMode: "editable" },
  ],
  title_field: "server_code",
  viewPolicy: {
    list: { enabled: true, columns: ["public_name"] },
    form: { enabled: true, fields: ["public_name", "details"] },
    quickEntry: { enabled: true, fields: ["public_name"] },
    kanban: { enabled: true, stageField: "public_name", reasonRequiredOn: ["backward", "cancel"] },
  },
  permissions: [],
};

for (const surface of ["quick", "expanded"] as const) {
  const rendered = applyFormSurface(meta, surface);
  const names = new Set(rendered.fields.map((field) => field.fieldname));
  if (names.has("server_code")) throw new Error(`${surface}: internal field leaked into rendered form`);
}

const quick = applyFormSurface(meta, "quick").fields.map((field) => field.fieldname);
if (quick.length !== 1 || quick[0] !== "public_name") {
  throw new Error(`quick: expected only public_name, got ${quick.join(",")}`);
}

const expanded = applyFormSurface(meta, "expanded").fields.map((field) => field.fieldname);
if (!expanded.includes("public_name") || !expanded.includes("details")) {
  throw new Error(`expanded: expected public_name/details, got ${expanded.join(",")}`);
}

console.log("FORM_PROFILE_SURFACE_PASS");
