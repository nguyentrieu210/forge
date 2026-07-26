/**
 * P2-BUILDER-01 (review độc lập) — LIVE round-trip cho diffPermissions/metaEqual/hasChanges MỚI +
 * canonical hoá envelope/idx cho `permissions` trong serializeDocTypeForSave (trước đây gửi RAW,
 * không idx/doctype/parentfield/parenttype/parent như `fields` đã có).
 * DocType DÙNG-MỘT-LẦN (custom=1, module Custom). KHÔNG đụng dữ liệu sản xuất; xoá fixture ở finally.
 * Dùng CHÍNH code builder/core (dist) — add/change/remove rule DocPerm qua đúng đường Apply thật.
 */
import { openDraft } from "../../packages/builder/dist/doctype/validate.js";
import { serializeDocTypeForSave } from "../../packages/builder/dist/doctype/apply.js";
import { diffMeta, diffPermissions, metaEqual, hasChanges, permRuleKey } from "../../packages/builder/dist/doctype/diff.js";
import { normalizeMeta } from "@metaforge/core";
import { requireLiveEnv } from "./_live-env.mjs";

const { base: BASE, headers: H } = requireLiveEnv();
const FIXTURE = `MF PermRoundtrip ${Date.now()}`;

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
  // 1) tạo DocType disposable, 1 rule ban đầu (System Manager full CRUD).
  const created = await call("frappe.client.insert", { body: { doc: {
    doctype: "DocType", name: FIXTURE, module: "Custom", custom: 1, naming_rule: "Set by user", autoname: "prompt",
    fields: [{ fieldname: "title_x", fieldtype: "Data", label: "Title" }],
    permissions: [{ role: "System Manager", permlevel: 0, read: 1, write: 1, create: 1, delete: 1, if_owner: 0 }],
  } } });
  log(created.status === 200, `tạo fixture "${FIXTURE}" (status ${created.status})`);
  if (created.status !== 200) { console.log(JSON.stringify(created.json).slice(0, 400)); throw new Error("create failed"); }

  // 2) fetch → baseline canonical.
  const got = await call("frappe.client.get", { params: { doctype: "DocType", name: FIXTURE } });
  const raw = got.json.message;
  log(got.status === 200 && Array.isArray(raw.permissions), "fetch DocType doc (baseline có permissions)");

  const session = openDraft(raw);
  const baselinePerms = session.baseline.permissions;
  log(baselinePerms.length === 1 && baselinePerms[0].role === "System Manager", "baseline: đúng 1 rule System Manager");

  // 3) draft: THÊM rule "Sales User" (read+write) + ĐỔI rule System Manager (delete 1→0).
  // Rule mới liệt kê ĐỦ 12 ptype khớp default THẬT của Frappe (xác nhận qua reload live trước đó:
  // report/export/print/email/share MẶC ĐỊNH 1 khi rule mới tạo qua frappe.client.save — KHÔNG phải
  // 0 như phần lớn ptype khác). Draft "chỉ set vài ptype rồi để trống phần còn lại" (undefined) là dữ
  // liệu KHÔNG THỰC vì Builder UI cũng phải phản ánh default thật này, không phải giả định của riêng
  // eq() — diffPermissions không nên (và không cần) tự đoán default per-ptype của Frappe.
  session.draft = {
    ...session.draft,
    permissions: [
      { ...session.baseline.permissions[0], delete: 0 },
      {
        role: "Sales User", permlevel: 0, if_owner: 0,
        read: 1, write: 1, create: 0, delete: 0, submit: 0, cancel: 0, amend: 0,
        select: 0, mask: 0, import: 0, impersonate: 0,
        report: 1, export: 1, print: 1, email: 1, share: 1,
      },
    ],
  };

  // 4) diff TRƯỚC apply — đúng những gì Builder UI sẽ hiện cho user (điểm mấu chốt của fix).
  const preDiff = diffMeta(session.baseline, session.draft);
  log(preDiff.added.length === 0 && preDiff.changed.length === 0 && Object.keys(preDiff.doc).length === 0, "field/doc KHÔNG đổi (chỉ permissions)");
  log(preDiff.permissions.added.length === 1 && preDiff.permissions.added[0].role === "Sales User", "diff: thêm rule Sales User");
  log(preDiff.permissions.changed.length === 1 && "delete" in preDiff.permissions.changed[0].props, "diff: đổi delete của System Manager");
  log(hasChanges(preDiff) === true, "hasChanges=true dù CHỈ permissions đổi (trước fix: false — nút Apply không bật)");
  log(metaEqual(session.baseline, session.draft) === false, "metaEqual=false dù CHỈ permissions đổi (trước fix: true — round-trip coi khác nhau là giống)");

  // 5) serialize — permissions PHẢI có idx + envelope (doctype/parentfield/parenttype/parent) GIỐNG fields.
  const payload = serializeDocTypeForSave(session);
  const permOut = payload.permissions;
  log(permOut.every((p) => p.doctype === "DocPerm" && p.parentfield === "permissions" && p.parenttype === "DocType" && p.parent === FIXTURE), "serialize: mọi rule có envelope child-row đúng");
  log(permOut.every((p, i) => p.idx === i + 1), "serialize: idx gán đúng thứ tự");

  // 6) apply (save) THẬT.
  const saved = await call("frappe.client.save", { body: { doc: payload } });
  log(saved.status === 200, `apply (save) status ${saved.status}`);
  if (saved.status !== 200) console.log(JSON.stringify(saved.json).slice(0, 500));

  // 7) reload → normalize → so với draft: permissions PHẢI khớp (metaEqual cho permissions).
  const got2 = await call("frappe.client.get", { params: { doctype: "DocType", name: FIXTURE } });
  const reloaded = normalizeMeta(got2.json.message);
  const reloadedKeys = reloaded.permissions.map(permRuleKey).sort();
  const draftKeys = session.draft.permissions.map(permRuleKey).sort();
  log(JSON.stringify(reloadedKeys) === JSON.stringify(draftKeys), `reload: đúng bộ rule (${reloadedKeys.join(" | ")})`);
  const postDiff = diffPermissions(session.draft.permissions, reloaded.permissions);
  const postDiffEmpty = postDiff.added.length === 0 && postDiff.removed.length === 0 && postDiff.changed.length === 0;
  log(postDiffEmpty, "reload: diffPermissions(draft, reload) rỗng — round-trip KHÔNG mất/méo permission");
  if (!postDiffEmpty) {
    console.log("  DEBUG postDiff:", JSON.stringify(postDiff, null, 2));
    console.log("  DEBUG draft.permissions:", JSON.stringify(session.draft.permissions, null, 2));
    console.log("  DEBUG reloaded.permissions:", JSON.stringify(reloaded.permissions, null, 2));
  }

  // 8) XOÁ rule Sales User khỏi draft2 → apply → reload → verify mất đúng rule đó (không dây vào rule khác).
  const session2 = openDraft(got2.json.message);
  session2.draft = { ...session2.draft, permissions: session2.draft.permissions.filter((p) => p.role !== "Sales User") };
  const removeDiff = diffMeta(session2.baseline, session2.draft);
  log(removeDiff.permissions.removed.length === 1 && removeDiff.permissions.removed[0].role === "Sales User", "diff: xoá rule Sales User khỏi draft2");
  const payload2 = serializeDocTypeForSave(session2);
  const saved2 = await call("frappe.client.save", { body: { doc: payload2 } });
  log(saved2.status === 200, `apply lần 2 (xoá rule) status ${saved2.status}`);
  const got3 = await call("frappe.client.get", { params: { doctype: "DocType", name: FIXTURE } });
  const reloaded3 = normalizeMeta(got3.json.message);
  log(!reloaded3.permissions.some((p) => p.role === "Sales User"), "reload cuối: rule Sales User đã mất thật");
  log(reloaded3.permissions.some((p) => p.role === "System Manager" && p.delete === 0), "reload cuối: rule System Manager vẫn còn (delete=0 như đã sửa) — xoá 1 rule không đụng rule khác");
} catch (e) {
  ok = false;
  console.log("  ✗ EXCEPTION:", e.message);
} finally {
  const del = await call("frappe.client.delete", { body: { doctype: "DocType", name: FIXTURE } });
  console.log(`  cleanup: xoá "${FIXTURE}" status ${del.status}`);
}

console.log(ok ? "\nP2-BUILDER-01 permission round-trip LIVE: PASS" : "\nP2-BUILDER-01 permission round-trip LIVE: FAIL");
process.exit(ok ? 0 : 1);
