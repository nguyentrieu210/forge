/**
 * Gate 6.4 — LIVE round-trip test trên DocType DÙNG-MỘT-LẦN (custom=1, module Custom).
 * server metadata → normalize → builder draft → serialize/apply → reload → semantic check + conflict.
 * KHÔNG đụng dữ liệu sản xuất; xoá fixture ở finally. Dùng CHÍNH code builder/core (dist).
 */
// import THẲNG các module THUẦN (tránh index.js kéo React/reactflow CSS vào Node).
import { openDraft } from "../../packages/builder/dist/doctype/validate.js";
import { serializeDocTypeForSave } from "../../packages/builder/dist/doctype/apply.js";
import { diffMeta } from "../../packages/builder/dist/doctype/diff.js";
import { normalizeMeta } from "@metaforge/core";
import { requireLiveEnv } from "./_live-env.mjs";

const { base: BASE, headers: H } = requireLiveEnv();
const FIXTURE = `MF Roundtrip ${Date.now()}`;

async function call(method, { params, body } = {}) {
  const url = new URL(`${BASE}/${method}`);
  if (params) for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, { method: body ? "POST" : "GET", headers: H, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = { _raw: text }; }
  return { status: res.status, json };
}

let ok = true;
const log = (pass, msg) => { if (!pass) ok = false; console.log(`${pass ? "  ✓" : "  ✗ FAIL"} ${msg}`); };

try {
  // 1) tạo DocType disposable (custom=1)
  const created = await call("frappe.client.insert", { body: { doc: {
    doctype: "DocType", name: FIXTURE, module: "Custom", custom: 1, naming_rule: "Set by user", autoname: "prompt",
    fields: [
      { fieldname: "title_x", fieldtype: "Data", label: "Title" },
      { fieldname: "status_x", fieldtype: "Select", label: "Status", options: "Open\nClosed" },
    ],
    permissions: [{ role: "System Manager", read: 1, write: 1, create: 1, delete: 1 }],
  } } });
  log(created.status === 200, `tạo fixture "${FIXTURE}" (status ${created.status})`);
  if (created.status !== 200) { console.log(JSON.stringify(created.json).slice(0, 400)); throw new Error("create failed"); }

  // 2) fetch DocType doc → baseline canonical
  const got = await call("frappe.client.get", { params: { doctype: "DocType", name: FIXTURE } });
  log(got.status === 200 && Array.isArray(got.json.message?.fields), "fetch DocType doc (baseline)");
  const raw = got.json.message;

  // 3) normalize → draft, sửa: thêm field qty_x, đảo status_x lên đầu
  const session = openDraft(raw);
  log(session.baseline.fields.some((f) => f.fieldname === "title_x"), "openDraft → baseline có field ta định nghĩa");
  const beforeCount = session.draft.fields.length;
  session.draft = { ...session.draft, fields: [
    session.draft.fields.find((f) => f.fieldname === "status_x"),
    session.draft.fields.find((f) => f.fieldname === "title_x"),
    { fieldname: "qty_x", fieldtype: "Int", label: "Qty" },
  ] };

  // 4) serialize + apply
  const payload = serializeDocTypeForSave(session);
  log(payload.modified != null, `payload mang OCC modified (${payload.modified})`);
  const saved = await call("frappe.client.save", { body: { doc: payload } });
  log(saved.status === 200, `apply (save) status ${saved.status}`);
  if (saved.status !== 200) console.log(JSON.stringify(saved.json).slice(0, 500));

  // 5) reload → normalize → semantic check (edit của ta PHẢI tồn tại; thứ tự đúng)
  const got2 = await call("frappe.client.get", { params: { doctype: "DocType", name: FIXTURE } });
  const reloaded = normalizeMeta(got2.json.message);
  const rfields = reloaded.fields.map((f) => f.fieldname);
  log(rfields.includes("qty_x"), "reload: field mới qty_x tồn tại (edit persisted)");
  log(reloaded.fields.length === beforeCount + 1, `reload: số field = ${beforeCount + 1} (thực ${reloaded.fields.length})`);
  const ix = (n) => rfields.indexOf(n);
  log(ix("status_x") < ix("title_x") && ix("title_x") < ix("qty_x"), `reload: thứ tự giữ đúng (${rfields.join(",")})`);
  // diff draft↔reloaded: KHÔNG field nào của ta bị mất (removed rỗng cho field ta set)
  const d = diffMeta(session.draft, reloaded);
  log(d.removed.length === 0, `diff draft↔reload: removed=${d.removed.map((f) => f.fieldname).join(",") || "∅"}`);
  log(!d.reordered, `diff draft↔reload: thứ tự khớp (reordered=${d.reordered})`);

  // 6) conflict/version detection: save lại với modified CŨ (đã stale) → phải lỗi TimestampMismatch
  const stalePayload = { ...serializeDocTypeForSave(session), modified: payload.modified };
  const conflict = await call("frappe.client.save", { body: { doc: stalePayload } });
  const cmsg = JSON.stringify(conflict.json);
  const isConflict = conflict.status === 409 || conflict.status === 417 || /TimestampMismatch|Document has been modified|modified after you have opened/i.test(cmsg);
  log(isConflict, `conflict với modified stale → phát hiện (status ${conflict.status})`);
} catch (e) {
  ok = false;
  console.log("  ✗ EXCEPTION:", e.message);
} finally {
  // cleanup: xoá fixture (không để rác trên site)
  const del = await call("frappe.client.delete", { body: { doctype: "DocType", name: FIXTURE } });
  console.log(`  cleanup: xoá "${FIXTURE}" status ${del.status}`);
}

console.log(ok ? "\nGate 6.4 LIVE round-trip: PASS" : "\nGate 6.4 LIVE round-trip: FAIL");
process.exit(ok ? 0 : 1);
