import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = new URL("../../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("Alumdoor purchase proposals consume HR and warehouse-cash contracts", async () => {
  const integration = JSON.parse(await read("server/briefs/alumdoor-v2.integrations.json"));
  assert.equal(integration.version, "2.2.3");
  assert.deepEqual(integration.requires.map((entry) => entry.id), ["vn-accounting", "hrm"]);
  assert.ok(integration.externalDocTypes.some((entry) => entry.name === "Employee" && entry.app === "hrm"));
  assert.ok(integration.externalDocTypes.some((entry) => entry.name === "Warehouse Cash Voucher" && entry.app === "vn-accounting"));
});

test("funding approval is server-enforced and bank details stay in HR", async () => {
  const controller = await read("server/packages/clouderp-core/src/purchase-funding-material-request.ts");
  assert.match(controller, /Only Chủ xưởng may approve a purchase funding proposal/);
  assert.match(controller, /Employee\.bank_account_no/);
  assert.match(controller, /purchase_funding_bank_last4/);
  assert.match(controller, /employeeUser !== context\.command\.actor\.user_id/);
  assert.match(controller, /return super\.normalize\(context\)/);
});

test("mobile uses real Material Request fields and never reads the full bank account", async () => {
  const source = await read("client/apps/warehouse-mobile/src/PurchaseFundingScreen.tsx");
  assert.match(source, /"employee_status", "company"/);
  assert.match(source, /purchase_funding_employee/);
  assert.match(source, /purchase_funding_amount/);
  assert.match(source, /purchase_funding_method/);
  assert.match(source, /createDoc\("Material Request"/);
  assert.match(source, /createDoc\("Warehouse Cash Voucher"/);
  assert.match(source, /voucher_type: "Tạm ứng"/);
  assert.match(source, /createDoc\("Payment Entry"/);
  assert.match(source, /party_type: "Employee"/);
  assert.doesNotMatch(source, /bank_account_no/);
  assert.doesNotMatch(source, /bank_ac_no/);
  assert.doesNotMatch(source, /ALUMDOOR_PURCHASE_FUNDING_V1/);
});

test("employee bank payments post employee advance GL without supplier payment ledger", async () => {
  const source = await read("server/packages/clouderp-selling/src/safe-finance-payment-entry.ts");
  assert.match(source, /partyType\(context\.command\.document\) === "Employee"/);
  assert.match(source, /line_key: "EMPLOYEE-ADVANCE"/);
  assert.match(source, /party_type: "Employee"/);
  assert.match(source, /account: data\.paid_to/);
  assert.match(source, /account: data\.paid_from/);
  assert.match(source, /payment: \[\]/);
  assert.match(source, /Employee\.bank_account_no/);
});

test("tenant migration scopes funding metadata to installed Alumdoor tenants", async () => {
  const migration = await read("server/migrations/tenant/0043_alumdoor_purchase_funding.sql");
  assert.match(migration, /installed_apps WHERE app_id='alumdoor'/);
  assert.match(migration, /purchase_funding_employee/);
  assert.match(migration, /purchase_funding_amount/);
  assert.match(migration, /purchase_funding_method/);
  assert.match(migration, /'Customer' \|\| char\(10\) \|\| 'Supplier' \|\| char\(10\) \|\| 'Employee'/);
  assert.match(migration, /'Tiền mặt' \|\| char\(10\) \|\| 'Tài khoản ngân hàng'/);
  assert.match(migration, /'submit',json\('true'\)/);

  const script = fileURLToPath(new URL("server/scripts/test-alumdoor-purchase-funding-migration.py", root));
  const result = spawnSync("python3", [script], { encoding: "utf8" });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /ALUMDOOR_PURCHASE_FUNDING_MIGRATION_OK/);
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
