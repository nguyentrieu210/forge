import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { compileBrief } from "../scripts/lib/compile-brief-app-factory.mjs";
import { readBriefSource } from "../scripts/lib/read-brief-source.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const briefPath = path.resolve(here, "../briefs/alumdoor-v2.json");

test("Alumdoor procurement navigation follows canonical DocType and AppAction declarations", async () => {
  const brief = await readBriefSource(briefPath);

  assert.equal(brief.version, "2.2.5");

  const purchaseOrder = brief.doctypes.find((entry) => entry.name === "Purchase Order");
  const purchaseReceipt = brief.doctypes.find((entry) => entry.name === "Purchase Receipt");
  assert.equal(purchaseOrder?.menu, true);
  assert.equal(purchaseReceipt?.menu, true);

  const fifo = brief.actions.find((entry) => entry.name === "nhap-nhom-fifo");
  const bulk = brief.actions.find((entry) => entry.name === "nhap-nhom-hang-loat");
  const settlement = brief.actions.find((entry) => entry.name === "doi-soat-giao-hang-ncc");
  assert.equal(fifo?.label, "Nhập nhôm FIFO theo đơn cũ");
  assert.equal(fifo?.menu, true);
  assert.equal(fifo?.icon, "truck");
  assert.equal(fifo?.group, "Mua hàng");
  assert.equal(bulk?.menu, true);
  assert.equal(settlement?.menu, true);

  const pkg = compileBrief(brief);
  const navByKey = new Map(pkg.nav.map((entry) => [entry.key, entry]));

  assert.ok(navByKey.has("Purchase Order"));
  assert.ok(navByKey.has("Purchase Receipt"));
  assert.equal(navByKey.get("action:nhap-nhom-fifo")?.label, "Nhập nhôm FIFO theo đơn cũ");
  assert.ok(navByKey.has("action:nhap-nhom-hang-loat"));
  assert.ok(navByKey.has("action:doi-soat-giao-hang-ncc"));

  // Navigation remains presentation only: canonical authorities stay installed/callable.
  assert.ok(pkg.doctypes.some((entry) => entry.name === "Purchase Order"));
  assert.ok(pkg.doctypes.some((entry) => entry.name === "Purchase Receipt"));
  assert.ok(pkg.actions.some((entry) => entry.name === "nhap-nhom-fifo"));
  assert.ok(pkg.actions.some((entry) => entry.name === "nhap-nhom-hang-loat"));
  assert.ok(pkg.actions.some((entry) => entry.name === "doi-soat-giao-hang-ncc"));
});
