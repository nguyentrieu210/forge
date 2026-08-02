import path from "node:path";
import { fileURLToPath } from "node:url";
import { compileBrief } from "./lib/compile-brief.mjs";
import { readBriefSource } from "./lib/read-brief-source.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const briefPath = path.join(here, "..", "briefs", "alumdoor-v2.json");
const manifest = compileBrief(await readBriefSource(briefPath));

const failures = [];
const fail = (message) => failures.push(message);
const own = new Map(manifest.doctypes.map((doctype) => [doctype.name, doctype]));
const external = new Set((manifest.externalDocTypes ?? []).map((doctype) => doctype.name));
const reports = new Map(manifest.reports.map((report) => [report.name, report]));
const fields = manifest.doctypes.flatMap((doctype) => doctype.fields.map((field) => ({ doctype, field })));

// 74 is the current Alumdoor slice, not the platform ceiling. This gate refuses a
// regression below today's coverage while the canonical contract itself supports every
// ERPNext package that can be compiled later.
if (manifest.metaContractVersion !== 1) fail(`Canonical Meta contract version is not enabled`);
if (manifest.doctypes.length < 74) fail(`DocType coverage regressed: ${manifest.doctypes.length} < 74`);
for (const doctype of manifest.doctypes) {
  if (!doctype.kind) fail(`${doctype.name}: missing kind`);
  if (!doctype.viewPolicy?.list || !doctype.viewPolicy?.form) fail(`${doctype.name}: missing list/form viewPolicy`);
  if (doctype.kind === "child_table" && !doctype.is_child) fail(`${doctype.name}: child_table must set is_child`);
  if (doctype.is_child && manifest.nav.some((item) => item.kind === "doctype" && item.key === doctype.name)) {
    fail(`${doctype.name}: child table must not have a standalone navigation route`);
  }
}

for (const { doctype, field } of fields) {
  if (!field.valueSource || !field.editMode || !field.surface) fail(`${doctype.name}.${field.fieldname}: incomplete field contract`);
  if (["system", "workflow", "formula"].includes(field.valueSource) && (!field.serverEnforced || field.editMode === "editable")) {
    fail(`${doctype.name}.${field.fieldname}: server-owned value is editable or not enforced`);
  }
  if (field.editMode === "hidden" && !field.serverEnforced) fail(`${doctype.name}.${field.fieldname}: hidden value is not server-enforced`);
  if (field.required && field.editMode === "editable" && field.surface !== "quick") {
    fail(`${doctype.name}.${field.fieldname}: required editable field is missing from quick entry`);
  }
  if (field.fieldtype === "Link" && field.options && !own.has(field.options) && !external.has(field.options)) {
    fail(`${doctype.name}.${field.fieldname}: unresolved Link target ${field.options}`);
  }
  if ((field.fieldtype === "Table" || field.fieldtype === "Table MultiSelect") && field.options) {
    const child = own.get(field.options);
    if (!child || child.kind !== "child_table") fail(`${doctype.name}.${field.fieldname}: invalid child target ${field.options}`);
  }
}

if (manifest.charts.length < 1 || manifest.charts.length > 3) fail(`Overview needs 1-3 explicit charts; got ${manifest.charts.length}`);
for (const chart of manifest.charts) {
  const report = reports.get(chart.source);
  if (!report) fail(`${chart.name}: missing source report ${chart.source}`);
  if (!chart.drilldown?.route || !chart.emptyFallback) fail(`${chart.name}: missing drilldown/mobile fallback`);
}

const accountingDependency = manifest.requires.find((dependency) => dependency.id === "vn-accounting");
if (!accountingDependency || accountingDependency.version !== "1.1.0") fail(`Warehouse Cash surface requires vn-accounting 1.1.0`);
for (const doctype of ["Warehouse Cash Fund", "Warehouse Cash Voucher", "Warehouse Cash Transfer", "Warehouse Cash Count"]) {
  if (!external.has(doctype)) fail(`Warehouse Cash external dependency missing: ${doctype}`);
}

if (failures.length) {
  console.error("ALUMDOOR_META_COMPLETENESS_FAIL");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

const kindCounts = Object.fromEntries([...new Set(manifest.doctypes.map((doctype) => doctype.kind))]
  .map((kind) => [kind, manifest.doctypes.filter((doctype) => doctype.kind === kind).length]));
const surfaceCounts = Object.fromEntries([...new Set(fields.map(({ field }) => field.surface))]
  .map((surface) => [surface, fields.filter(({ field }) => field.surface === surface).length]));

console.log("ALUMDOOR_META_COMPLETENESS_PASS");
console.log(JSON.stringify({
  doctypes: manifest.doctypes.length,
  kinds: kindCounts,
  fields: fields.length,
  links: fields.filter(({ field }) => field.fieldtype === "Link").length,
  childTables: fields.filter(({ field }) => field.fieldtype === "Table" || field.fieldtype === "Table MultiSelect").length,
  externalDocTypes: manifest.externalDocTypes.length,
  reports: manifest.reports.length,
  charts: manifest.charts.length,
  surfaces: surfaceCounts,
  nav: manifest.nav.length,
}, null, 2));