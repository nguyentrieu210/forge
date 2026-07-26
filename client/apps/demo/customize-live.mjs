/**
 * Serializer #1 LIVE round-trip — customize STANDARD DocType (ToDo) qua Custom Field/Property Setter.
 * server meta → normalize → draft (thêm field + đổi label) → planCustomization → apply (insert CF/PS) →
 * reload → verify (field mới có + label override) → cleanup (xoá CF/PS, revert). KHÔNG sửa schema gốc.
 * Dùng chính code builder/core (dist).
 */
import { planCustomization } from "../../packages/builder/dist/doctype/customize.js";
import { diffMeta } from "../../packages/builder/dist/doctype/diff.js";
import { addField, updateField } from "../../packages/builder/dist/doctype/meta-build.js";
import { normalizeMeta } from "@metaforge/core";
import { requireLiveEnv } from "./_live-env.mjs";

const { base: BASE, headers: H } = requireLiveEnv();
const call = async (m, { params, body } = {}) => {
  const url = new URL(`${BASE}/${m}`);
  if (params) for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const r = await fetch(url, { method: body ? "POST" : "GET", headers: H, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = { _raw: t }; }
  return { status: r.status, j };
};
const fetchMeta = async () => {
  const r = await call("frappe.desk.form.load.getdoctype", { params: { doctype: "ToDo", with_parent: "1" } });
  const docs = r.j.docs || r.j.message?.docs;
  return docs.find((d) => d.name === "ToDo" && d.doctype === "DocType");
};

let ok = true;
const log = (p, m) => { if (!p) ok = false; console.log(`${p ? "  ✓" : "  ✗ FAIL"} ${m}`); };
const CF = "mf_e2e_custom";
const created = [];

try {
  // 1) baseline
  const baseline = normalizeMeta(await fetchMeta());
  log(baseline.fields.some((f) => f.fieldname === "description"), "baseline ToDo (effective meta)");
  const origLabel = baseline.fields.find((f) => f.fieldname === "description").label;

  // 2) draft: thêm custom field + đổi label description
  let draft = addField(baseline, { fieldname: CF, fieldtype: "Data", label: "MF E2E Custom" });
  draft = updateField(draft, "description", { label: "MF E2E Label" });

  // 3) plan
  const diff = diffMeta(baseline, draft);
  const plan = planCustomization("ToDo", diff, draft.fields.map((f) => f.fieldname));
  log(plan.customFields.length === 1 && plan.customFields[0].fieldname === CF, "plan: 1 Custom Field");
  log(plan.propertySetters.some((p) => p.field_name === "description" && p.property === "label"), "plan: PS label");

  // 4) apply — insert Custom Field + Property Setter
  for (const cf of plan.customFields) {
    const r = await call("frappe.client.insert", { body: { doc: { doctype: "Custom Field", dt: cf.dt, fieldname: cf.fieldname, label: cf.label, fieldtype: cf.fieldtype, options: cf.options, insert_after: cf.insert_after, reqd: cf.reqd } } });
    log(r.status === 200, `insert Custom Field ${cf.fieldname} (${r.status})`);
    if (r.status === 200) created.push(["Custom Field", r.j.message.name]);
    else console.log(JSON.stringify(r.j).slice(0, 300));
  }
  for (const ps of plan.propertySetters) {
    const r = await call("frappe.client.insert", { body: { doc: { doctype: "Property Setter", doctype_or_field: ps.doctype_or_field, doc_type: ps.doc_type, field_name: ps.field_name, property: ps.property, value: String(ps.value), property_type: ps.property_type } } });
    log(r.status === 200, `insert Property Setter ${ps.property} (${r.status})`);
    if (r.status === 200) created.push(["Property Setter", r.j.message.name]);
    else console.log(JSON.stringify(r.j).slice(0, 300));
  }

  // 5) reload → verify customization ÁP DỤNG
  const reloaded = normalizeMeta(await fetchMeta());
  log(reloaded.fields.some((f) => f.fieldname === CF), "reload: custom field mf_e2e_custom XUẤT HIỆN");
  log(reloaded.fields.find((f) => f.fieldname === "description").label === "MF E2E Label", "reload: label override ÁP DỤNG (Property Setter)");
  log(origLabel === "Description", "label gốc = 'Description' (sẽ revert sau cleanup)");
} catch (e) {
  ok = false; console.log("  ✗ EXCEPTION:", e.message);
} finally {
  // cleanup: xoá CF/PS → revert customization (không đụng schema gốc)
  for (const [dt, name] of created.reverse()) {
    const r = await call("frappe.client.delete", { body: { doctype: dt, name } });
    console.log(`  cleanup: xoá ${dt} ${name} (${r.status})`);
  }
  // verify revert
  try {
    const after = normalizeMeta(await fetchMeta());
    const revLabel = after.fields.find((f) => f.fieldname === "description")?.label;
    const cfGone = !after.fields.some((f) => f.fieldname === CF);
    log(revLabel === "Description" && cfGone, `revert OK (label='${revLabel}', custom field gone=${cfGone})`);
  } catch (e) { console.log("  revert check err:", e.message); }
}

console.log(ok ? "\nSerializer #1 LIVE customize round-trip: PASS" : "\nSerializer #1 LIVE customize round-trip: FAIL");
process.exit(ok ? 0 : 1);
