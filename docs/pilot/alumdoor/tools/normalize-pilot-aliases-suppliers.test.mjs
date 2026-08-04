import test from "node:test";
import assert from "node:assert/strict";
import { POLICY, assertAliasSupplierPolicy, reconcileSupplierRoles, resolveJournalItemIdentity } from "./normalize-pilot-aliases-suppliers.mjs";

test("locks all 60 historical journal item identities without fuzzy matching", () => {
  assert.equal(assertAliasSupplierPolicy(), true);
  assert.deepEqual(POLICY.items.counts, { alias_to_existing_master: 41, supplemental_source_identity: 18, explode_composite: 1 });
  assert.equal(POLICY.items.fuzzy_matching_used, false);
});

test("maps explicit variant aliases to canonical master identities", () => {
  assert.equal(resolveJournalItemIdentity("TP-TD-AL501N GS").item_code, "TP-TD-AL501N");
  assert.equal(resolveJournalItemIdentity("TP-UC MTN 5.5D XN-VK").item_code, "TP-UC MTN 5.5D");
  assert.equal(resolveJournalItemIdentity("NVL-TOLE1.2x190-CORON").quantity_axis_requires_reconciliation, true);
});

test("keeps source-only identities explicit and fails unknown identities", () => {
  const row = resolveJournalItemIdentity("CPVC");
  assert.equal(row.disposition, "supplemental_source_identity");
  assert.equal(row.production_create_authorized, false);
  assert.throws(() => resolveJournalItemIdentity("MA-KHONG-CO-TRONG-POLICY"), /unrecognized/);
});

test("explodes the historical leaf-bottom composite", () => {
  assert.deepEqual(resolveJournalItemIdentity("NVL-LD-3LD").item_codes, ["TP-TD325", "TP-TD326", "TP-TD327", "TP-A282"]);
});

test("reconciles purchase parties to Supplier identities and preserves dual role", () => {
  const sourceSuppliers = [
    "CTY NAM PHÁT", "CÔNG TY TNHH TMSX DƯƠNG HỒ", "CÔNG TY TNHH  LOGISTICS APM", "ANH BẢO BỌ - LỘC PHÁT",
    "ANH THÀNH TÔN", "TRẦN ĐẠT BẾN TRE", "ANH TRÌNH ĐỒNG THÁP", "CÔNG TY TNHH VẬN TẢI SQS THIÊN ÂN",
  ].map((supplier_name, index) => ({ source_key: `source:${index + 1}`, supplier_name, active: true }));
  const result = reconcileSupplierRoles(sourceSuppliers);
  assert.equal(result.role_gaps_after, 0);
  assert.equal(result.suppliers.length, 12);
  assert.equal(result.production_data_mutated, false);
  assert.equal(result.suppliers.find((r) => r.supplier_name === "ANH HIẾU CẦN THƠ").identity_disposition, "ensure_supplier_same_name_preserve_customer_dual_role");
  assert.equal(result.suppliers.find((r) => r.supplier_name === "TIẾN ĐẠT").identity_disposition, "bind_existing_canonical_supplier");
});
