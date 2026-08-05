import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const workspace = readFileSync(new URL("../src/operating/ProcurementOperatingWorkspace.tsx", import.meta.url), "utf8");
const boundary = readFileSync(new URL("../src/action/NativeActionScreen.tsx", import.meta.url), "utf8");

test("procurement workspace keeps the six operator surfaces on one route", () => {
  for (const label of ["Quy trình", "Mua hàng", "Nhập hàng", "Thanh toán", "Lịch sử", "Báo cáo"]) {
    assert.equal(workspace.includes(`label: "${label}"`), true, `missing workspace surface: ${label}`);
  }
  assert.match(workspace, /NewFormContainer/);
  assert.match(workspace, /BaseActionScreen/);
  assert.match(workspace, /Inspector/);
});

test("procurement workspace reuses shared chart primitives and supports drilldown", () => {
  assert.match(workspace, /ForgeLineChart/);
  assert.match(workspace, /ForgeBarChart/);
  assert.match(workspace, /onActivate/);
  assert.match(workspace, /onOpen\("Purchase Order"/);
});

test("workspace does not fabricate VAT when canonical read model is absent", () => {
  assert.match(workspace, /canonical VAT read-model/);
  assert.match(workspace, /input_vat == null \? "—"/);
});

test("shared procurement workspace contains no supplier-specific business literal", () => {
  for (const literal of ["TIẾN ĐẠT", "Tiến Đạt", "AL70", "AL71", "VIPST700"]) {
    assert.equal(workspace.includes(literal), false, `shared workspace leaked vertical literal: ${literal}`);
  }
});

test("native action boundary preserves fallback for unrelated actions", () => {
  assert.match(boundary, /PROCUREMENT_RECEIPT_METHODS/);
  assert.match(boundary, /return <ExistingActionScreen/);
  assert.match(boundary, /ProcurementOperatingWorkspace/);
});
