import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../apps-src/workplace/", import.meta.url);

async function json(path) {
  return JSON.parse(await readFile(new URL(path, root), "utf8"));
}

function permissions(meta, role) {
  return (meta.permissions ?? []).filter((entry) => entry.role === role && Number(entry.permlevel ?? 0) === 0);
}

function permission(meta, role) {
  return permissions(meta, role)[0];
}

test("workplace app uses generic runtime experiences, not hand-written routes", async () => {
  const app = await json("app.json");
  const calendar = app.nav.find((item) => item.label === "Lịch công việc");
  assert.deepEqual(
    { kind: calendar?.kind, key: calendar?.key, permission_doctype: calendar?.permission_doctype },
    { kind: "experience", key: "calendar:Workplace Task", permission_doctype: "Workplace Task" },
  );
  assert.ok(app.nav.some((item) => item.key === "approval:Internal Request" && item.kind === "experience"));
  assert.ok(app.nav.some((item) => item.key === "approval:Managed Document" && item.kind === "experience"));
  assert.ok(app.nav.some((item) => item.key === "approval:Contract" && item.kind === "experience"));
});

test("report labels do not claim filters the report contract does not enforce", async () => {
  const app = await json("app.json");
  const names = new Set(app.reports.map((report) => report.name));
  assert.ok(names.has("Công việc theo trạng thái"));
  assert.ok(names.has("Danh sách hạn hợp đồng"));
  assert.ok(!names.has("Công việc đang mở"));
  assert.ok(!names.has("Hợp đồng sắp hết hạn"));
});

test("personal workplace records can be created but stay owner-scoped afterwards", async () => {
  for (const file of ["workplace-task.json", "workplace-meeting.json", "internal-request.json"]) {
    const meta = await json(`doctypes/${file}`);
    const ordinary = permissions(meta, "Workplace User");
    assert.ok(ordinary.some((entry) => entry.create === true && !entry.if_owner && !entry.read), `${meta.name}: needs doctype-level create permission`);
    assert.ok(ordinary.some((entry) => entry.read === true && entry.write === true && entry.if_owner === true), `${meta.name}: stored records must be owner-scoped`);
    assert.ok(!ordinary.some((entry) => entry.read === true && !entry.if_owner), `${meta.name}: ordinary user must not get tenant-wide read`);
  }
});

test("DMS and contract records require manager permission or an explicit share", async () => {
  for (const file of ["managed-document.json", "document-folder.json", "document-template.json"]) {
    const meta = await json(`doctypes/${file}`);
    assert.equal(permissions(meta, "Workplace User").length, 0, `${meta.name}: broad workplace read leaks DMS records`);
    assert.equal(permission(meta, "Document Manager")?.share, true, `${meta.name}: manager must be able to grant explicit shares`);
  }
  for (const file of ["contract.json", "contract-obligation.json", "contract-amendment.json"]) {
    const meta = await json(`doctypes/${file}`);
    assert.equal(permissions(meta, "Workplace User").length, 0, `${meta.name}: ordinary workplace role must not read contracts`);
    assert.equal(permissions(meta, "Workplace Manager").length, 0, `${meta.name}: generic manager must not imply contract access`);
    assert.equal(permission(meta, "Contract Manager")?.read, true);
  }
});

test("announcement drafts are never readable through the ordinary workplace role", async () => {
  const meta = await json("doctypes/workplace-announcement.json");
  assert.equal(permissions(meta, "Workplace User").length, 0);
  assert.equal(permission(meta, "Workplace Manager")?.share, true);
});

test("notification preferences can be created but remain owner-controlled", async () => {
  const meta = await json("doctypes/notification-preference.json");
  const ordinary = permissions(meta, "Workplace User");
  assert.ok(ordinary.some((entry) => entry.create === true && !entry.if_owner && !entry.read));
  assert.ok(ordinary.some((entry) => entry.read === true && entry.write === true && entry.if_owner === true));
  assert.ok(!ordinary.some((entry) => entry.read === true && !entry.if_owner));
  assert.equal(permissions(meta, "Workplace Manager").length, 0);
  assert.equal(permission(meta, "System Manager")?.write, undefined);
});

test("approval workflows prohibit self approval", async () => {
  for (const file of ["internal-request.json", "managed-document.json", "contract.json", "contract-amendment.json"]) {
    const workflow = await json(`workflows/${file}`);
    const approvals = workflow.transitions.filter((entry) => entry.action === "Phê duyệt");
    assert.ok(approvals.length > 0, `${workflow.name}: approval transition is missing`);
    assert.ok(approvals.every((entry) => entry.allow_self_approval === false), `${workflow.name}: self approval must stay disabled`);
  }
});

test("DMS and CLM metadata keeps external-engine seams explicit", async () => {
  const document = await json("doctypes/managed-document.json");
  const contract = await json("doctypes/contract.json");
  const field = (meta, name) => meta.fields.find((entry) => entry.fieldname === name);
  assert.equal(field(document, "ocr_text")?.read_only, true, "OCR output is system-produced evidence, not user-authored text");
  assert.equal(field(document, "signature_reference")?.read_only, true);
  assert.equal(field(contract, "signature_reference")?.read_only, true);
  assert.equal(field(contract, "parent_contract")?.read_only, true);
});
