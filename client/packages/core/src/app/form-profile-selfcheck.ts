import { applyFormSurface, resolveFormRenderPolicy } from "./form-profile.js";
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
    { fieldname: "notes", label: "Notes", fieldtype: "Data", surface: "expanded", valueSource: "user", editMode: "editable" },
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

const quick = resolveFormRenderPolicy(meta, "quick");
if (!quick.enabled) throw new Error("quick: expected enabled policy");
const quickNames = quick.meta.fields.map((field) => field.fieldname);
if (quickNames.length !== 1 || quickNames[0] !== "public_name") {
  throw new Error(`quick: expected viewPolicy public_name only, got ${quickNames.join(",")}`);
}

const expanded = resolveFormRenderPolicy(meta, "expanded");
if (!expanded.enabled) throw new Error("expanded: expected enabled policy");
const expandedNames = expanded.meta.fields.map((field) => field.fieldname);
if (!expandedNames.includes("public_name") || !expandedNames.includes("details")) {
  throw new Error(`expanded: expected public_name/details, got ${expandedNames.join(",")}`);
}
if (expandedNames.includes("notes")) {
  throw new Error(`expanded: viewPolicy.form.fields did not exclude notes: ${expandedNames.join(",")}`);
}
if (expandedNames.includes("server_code")) {
  throw new Error("expanded: canonical internal title/required field leaked through viewPolicy");
}

const quickDisabledMeta: DocTypeMeta = {
  ...meta,
  viewPolicy: {
    ...meta.viewPolicy!,
    quickEntry: { enabled: false, fields: ["public_name"] },
  },
};
const quickDisabled = resolveFormRenderPolicy(quickDisabledMeta, "quick");
if (quickDisabled.enabled) throw new Error("quick: enabled=false must be authoritative");
if (quickDisabled.meta.fields.some((field) => field.fieldname === "server_code")) {
  throw new Error("quick disabled: internal field leaked into unavailable renderer schema");
}

const formDisabledMeta: DocTypeMeta = {
  ...meta,
  viewPolicy: {
    ...meta.viewPolicy!,
    form: { enabled: false, fields: ["public_name", "details"] },
  },
};
if (resolveFormRenderPolicy(formDisabledMeta, "expanded").enabled) {
  throw new Error("expanded: form.enabled=false must be authoritative");
}

const legacyMeta: DocTypeMeta = {
  name: "Legacy Form",
  fields: [
    { fieldname: "legacy_required", label: "Required", fieldtype: "Data", reqd: 1 },
    { fieldname: "legacy_optional", label: "Optional", fieldtype: "Data" },
  ],
  permissions: [],
};
const legacyQuick = resolveFormRenderPolicy(legacyMeta, "quick");
if (!legacyQuick.enabled || legacyQuick.meta.fields.length !== 2) {
  throw new Error("legacy: missing canonical policy must preserve compatibility rendering");
}

console.log("FORM_PROFILE_SURFACE_PASS");
