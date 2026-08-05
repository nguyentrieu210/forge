import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { compileBrief } from "../scripts/lib/compile-brief-app-factory.mjs";
import { readBriefSource } from "../scripts/lib/read-brief-source.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const briefPath = path.resolve(here, "../briefs/alumdoor-v2.json");

const SALES_KEYS = [
  "alumdoor-operations:workbench",
  "Sales Order",
  "Delivery Note",
  "action:giao-hang-theo-ngay",
  "report:Đơn hàng theo khách",
];
const SALES_LABELS = ["Bán hàng", "Đơn hàng", "Phiếu xuất kho", "Giao hàng", "Báo cáo"];

test("Alumdoor sales exposes five operational tabs in 2.3.0", async () => {
  const brief = await readBriefSource(briefPath);

  assert.equal(brief.version, "2.3.0");
  assert.deepEqual(brief.navigation.items.slice(0, SALES_KEYS.length), SALES_KEYS);

  const experience = brief.experiences.find((entry) => entry.key === "alumdoor-operations:workbench");
  assert.equal(experience?.label, "Bán hàng");
  assert.equal(experience?.group, "Bán hàng");
  assert.equal(experience?.permission, "Sales Order");

  const salesOrder = brief.doctypes.find((entry) => entry.name === "Sales Order");
  const deliveryNote = brief.doctypes.find((entry) => entry.name === "Delivery Note");
  assert.equal(salesOrder?.label, "Đơn hàng");
  assert.equal(salesOrder?.menu, true);
  assert.equal(salesOrder?.group, "Bán hàng");
  assert.equal(deliveryNote?.label, "Phiếu xuất kho");
  assert.equal(deliveryNote?.menu, true);
  assert.equal(deliveryNote?.group, "Bán hàng");

  const delivery = brief.actions.find((entry) => entry.name === "giao-hang-theo-ngay");
  const calculator = brief.actions.find((entry) => entry.name === "tinh-cong-thuc-cua");
  assert.equal(delivery?.label, "Giao hàng");
  assert.equal(delivery?.menu, true);
  assert.equal(delivery?.group, "Bán hàng");
  assert.equal(calculator?.menu, false);

  const salesReport = brief.reports.find((entry) => entry.name === "Đơn hàng theo khách");
  assert.equal(salesReport?.label, "Báo cáo");
  assert.equal(salesReport?.group, "Bán hàng");

  const pkg = compileBrief(brief);
  assert.equal(pkg.version, "2.3.0");
  const sales = pkg.nav.filter((entry) => entry.group === "Bán hàng");
  assert.deepEqual(sales.map((entry) => entry.key), SALES_KEYS);
  assert.deepEqual(sales.map((entry) => entry.label), SALES_LABELS);

  const navByKey = new Map(pkg.nav.map((entry) => [entry.key, entry]));
  assert.equal(navByKey.has("action:tinh-cong-thuc-cua"), false);
  assert.equal(navByKey.get("alumdoor-operations:workbench")?.kind, "experience");

  assert.ok(pkg.actions.some((entry) => entry.name === "tinh-cong-thuc-cua"));
  assert.ok(pkg.doctypes.some((entry) => entry.name === "Sales Order"));
  assert.ok(pkg.doctypes.some((entry) => entry.name === "Delivery Note"));
});
