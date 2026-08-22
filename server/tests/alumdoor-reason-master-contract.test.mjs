import assert from "node:assert/strict";
import test from "node:test";
import { readBriefSource } from "../scripts/lib/read-brief-source.mjs";
import { parseField } from "../scripts/lib/compile-brief.mjs";

const brief = await readBriefSource(new URL("../briefs/alumdoor-v2.json", import.meta.url));

function doctype(name) {
  const value = brief.doctypes.find((entry) => entry.name === name);
  assert.ok(value, `missing DocType ${name}`);
  return value;
}

function field(meta, fieldname) {
  const value = meta.fields
    .map((entry, index) => parseField(entry, index, `doctype ${meta.name}`))
    .find((entry) => entry.fieldname === fieldname);
  assert.ok(value, `missing field ${meta.name}.${fieldname}`);
  return value;
}

test("Alumdoor keeps separate canonical cancellation and variance masters", () => {
  const cancellation = doctype("Lý do huỷ");
  const variance = doctype("Nguyên nhân chênh lệch");
  assert.equal(cancellation.naming, "field:reason_code");
  assert.equal(variance.naming, "field:reason_code");
  assert.equal(field(cancellation, "reason_code").unique, true);
  assert.equal(field(variance, "reason_code").unique, true);
  assert.match(field(cancellation, "applies_to_doctype").options, /Kiểm kê/);
  assert.equal(field(variance, "variance_kind").options, "Thừa\nThiếu\nCả hai");
});

test("reason consumers link to canonical masters instead of free text", () => {
  const cutOrder = doctype("Cut Order");
  const reservation = doctype("Stock Reservation");
  const reconciliation = doctype("Stock Reconciliation");
  const reconciliationItem = doctype("Stock Reconciliation Item");
  assert.equal(field(cutOrder, "cancel_reason").options, "Lý do huỷ");
  assert.equal(field(reservation, "released_reason").options, "Lý do huỷ");
  assert.equal(field(reconciliation, "cancel_reason").options, "Lý do huỷ");
  assert.equal(field(reconciliationItem, "variance_reason").options, "Nguyên nhân chênh lệch");
  const releaseAction = brief.actions.find((action) => action.name === "nha-giu-cho");
  assert.ok(releaseAction);
  assert.ok(releaseAction.fields.includes("released_reason:Link(Lý do huỷ)! Lý do nhả"));
});

test("reason fixtures are unique, active and include mandatory fallback codes", () => {
  const reasons = brief.fixtures.filter((fixture) => ["Lý do huỷ", "Nguyên nhân chênh lệch"].includes(fixture.type));
  const identities = new Set();
  for (const fixture of reasons) {
    const identity = `${fixture.type}:${fixture.name}`;
    assert.equal(identities.has(identity), false, `duplicate ${identity}`);
    identities.add(identity);
    assert.equal(fixture.data.reason_code, fixture.name);
    assert.equal(fixture.data.disabled, 0);
  }
  assert.ok(identities.has("Lý do huỷ:KHAC"));
  assert.ok(identities.has("Nguyên nhân chênh lệch:KHAC"));
  assert.ok(identities.has("Nguyên nhân chênh lệch:THO_CAT_SAI_KHONG_BAO"));
});
