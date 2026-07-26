/**
 * Serializer #2 (Workflow) + #3 (Print Format) — LIVE round-trip trên site thật.
 * Workflow: DocType dùng-một-lần → serializeWorkflow → insert → reload → verify → cleanup.
 * Print: serializePrintFormat cho ToDo → insert → reload → verify html → cleanup.
 * Dùng chính code builder (dist). KHÔNG đụng dữ liệu sản xuất.
 */
import { serializeWorkflow, workflowMasters } from "../../packages/builder/dist/workflow/serialize.js";
import { serializePrintFormat } from "../../packages/builder/dist/print/serialize.js";
import { requireLiveEnv } from "./_live-env.mjs";

const { base: BASE, headers: H } = requireLiveEnv();
const call = async (m, body) => {
  const r = await fetch(`${BASE}/${m}`, { method: body ? "POST" : "GET", headers: H, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = { _raw: t }; }
  return { status: r.status, j };
};
const get = async (doctype, name) => fetch(`${BASE}/frappe.client.get?doctype=${encodeURIComponent(doctype)}&name=${encodeURIComponent(name)}`, { headers: H }).then((r) => r.json());

let ok = true;
const log = (p, m) => { if (!p) ok = false; console.log(`${p ? "  ✓" : "  ✗ FAIL"} ${m}`); };
const ts = Date.now();
const DT = `MF WF Fixture ${ts}`;
const PF = `MF Print ${ts}`;
const cleanup = [];

try {
  // ── Serializer #2 Workflow ─────────────────────────────────────────────
  const dt = await call("frappe.client.insert", { doc: { doctype: "DocType", name: DT, module: "Custom", custom: 1, naming_rule: "Set by user", autoname: "prompt",
    fields: [{ fieldname: "title_x", fieldtype: "Data", label: "Title" }, { fieldname: "status_x", fieldtype: "Select", label: "Status", options: "Draft\nDone" }],
    permissions: [{ role: "System Manager", read: 1, write: 1, create: 1, delete: 1 }] } });
  log(dt.status === 200, `tạo DocType dùng-một-lần (${dt.status})`);
  if (dt.status === 200) cleanup.push(["DocType", DT]);

  const wfModel = {
    name: `${DT} Approval`, document_type: DT, workflow_state_field: "workflow_state",
    states: [{ state: "Draft", doc_status: 0 }, { state: "Done", doc_status: 1 }],
    transitions: [{ state: "Draft", action: "Submit", next_state: "Done", allowed: "System Manager" }],
  };
  // master state/action phải tồn tại TRƯỚC (Frappe Link) — insert-if-missing (bỏ qua duplicate)
  const masters = workflowMasters(wfModel);
  for (const st of masters.states) {
    const r = await call("frappe.client.insert", { doc: { doctype: "Workflow State", workflow_state_name: st } });
    if (r.status === 200) cleanup.unshift(["Workflow State", st]);
  }
  for (const ac of masters.actions) {
    const r = await call("frappe.client.insert", { doc: { doctype: "Workflow Action Master", workflow_action_name: ac } });
    if (r.status === 200) cleanup.unshift(["Workflow Action Master", ac]);
  }
  const wfPayload = serializeWorkflow(wfModel, { defaultEditRole: "System Manager" });
  const wf = await call("frappe.client.insert", { doc: wfPayload });
  log(wf.status === 200, `insert Workflow (${wf.status})`);
  if (wf.status === 200) { cleanup.unshift(["Workflow", wf.j.message.name]); }
  else console.log(JSON.stringify(wf.j).slice(0, 400));

  if (wf.status === 200) {
    const back = await get("Workflow", wf.j.message.name);
    const w = back.message;
    log(w.states?.length === 2 && w.transitions?.length === 1, `reload Workflow: 2 state + 1 transition`);
    log(w.states?.some((s) => s.state === "Done" && String(s.doc_status) === "1"), "state Done doc_status=1 persisted");
    log(w.transitions?.[0]?.action === "Submit" && w.transitions?.[0]?.allowed === "System Manager", "transition action+role persisted");
    // Frappe tự tạo custom field workflow_state → dọn kèm
    cleanup.unshift(["Custom Field", `${DT}-workflow_state`]);
  }

  // ── Serializer #3 Print Format (trên ToDo, không cần fixture) ───────────
  const pfModel = { name: PF, doc_type: "ToDo", blocks: [
    { fieldname: "description", label: "Mô tả", visible: true },
    { fieldname: "status", label: "Trạng thái", visible: true },
  ] };
  const pfPayload = serializePrintFormat(pfModel);
  const pf = await call("frappe.client.insert", { doc: pfPayload });
  log(pf.status === 200, `insert Print Format (${pf.status})`);
  if (pf.status === 200) {
    cleanup.unshift(["Print Format", pf.j.message.name]);
    const back = await get("Print Format", pf.j.message.name);
    log(back.message?.html?.includes("{{ doc.description }}"), "reload Print Format: html Jinja persisted");
    log(back.message?.print_format_type === "Jinja" && back.message?.doc_type === "ToDo", "print_format_type/doc_type đúng");
  } else console.log(JSON.stringify(pf.j).slice(0, 400));
} catch (e) {
  ok = false; console.log("  ✗ EXCEPTION:", e.message);
} finally {
  for (const [doctype, name] of cleanup) {
    const r = await call("frappe.client.delete", { doctype, name });
    console.log(`  cleanup: xoá ${doctype} ${name} (${r.status})`);
  }
}

console.log(ok ? "\nSerializer #2+#3 LIVE round-trip: PASS" : "\nSerializer #2+#3 LIVE round-trip: FAIL");
process.exit(ok ? 0 : 1);
