import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("Alumdoor purchase proposals depend on HR employee data without copying HR schema", async () => {
  const integration = JSON.parse(await read("server/briefs/alumdoor-v2.integrations.json"));
  assert.equal(integration.version, "2.2.3");
  assert.deepEqual(integration.requires.map((entry) => entry.id), ["vn-accounting", "hrm"]);
  assert.ok(integration.externalDocTypes.some((entry) => entry.name === "Employee" && entry.app === "hrm"));
  assert.ok(integration.externalDocTypes.some((entry) => entry.name === "Warehouse Cash Voucher" && entry.app === "vn-accounting"));
});

test("employees can draft Material Request but only owner can submit it", async () => {
  const sidecar = JSON.parse(await read("server/briefs/alumdoor-v2.permissions.json"));
  const perms = sidecar.permissions["Material Request"];
  assert.equal(perms["Chủ xưởng"], "rwcsxa");
  for (const role of ["Kinh doanh", "Thủ kho", "Sản xuất"]) {
    assert.equal(perms[role], "rwc");
    assert.ok(!perms[role].includes("s"), `${role} must not submit its own proposal`);
  }
  assert.equal(perms["Kế toán"], "r");
});

test("mobile funding screen uses Material Request, HR bank details and canonical cash voucher", async () => {
  const source = await read("client/apps/warehouse-mobile/src/PurchaseFundingScreen.tsx");
  assert.match(source, /ALUMDOOR_PURCHASE_FUNDING_V1/);
  assert.match(source, /getList\("Employee"/);
  assert.match(source, /"bank_name", "bank_ac_no"/);
  assert.match(source, /createDoc\("Material Request"/);
  assert.match(source, /adapter\.submit\(doc\)/);
  assert.match(source, /createDoc\("Warehouse Cash Voucher"/);
  assert.match(source, /voucher_type: "Tạm ứng"/);
  assert.doesNotMatch(source, /createDoc\("Payment Entry"/);
});

test("mobile shell exposes proposal tab and desktop hides advanced cash operations", async () => {
  const mobile = await read("client/apps/warehouse-mobile/src/main.tsx");
  const desktop = await read("client/apps/runtime/src/experiences/AlumdoorOperationsCenter.tsx");
  assert.match(mobile, /"funding", label: "Đề xuất"/);
  assert.match(mobile, /PurchaseFundingScreen/);
  assert.match(desktop, /Đề xuất mua & thu chi nội bộ/);
  assert.match(desktop, /Thu \/ chi nội bộ/);
  assert.doesNotMatch(desktop, /Quỹ tiền mặt theo từng kho/);
  assert.doesNotMatch(desktop, /Kiểm quỹ \/ bàn giao/);
});
