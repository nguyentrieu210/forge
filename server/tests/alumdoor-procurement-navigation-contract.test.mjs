import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { compileBrief } from "../scripts/lib/compile-brief-app-factory.mjs";
import { readBriefSource } from "../scripts/lib/read-brief-source.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const briefPath = path.resolve(here, "../briefs/alumdoor-v2.json");

test("Alumdoor procurement compiles to one primary Mua hàng workspace entry without removing canonical documents/actions", async () => {
  const brief = await readBriefSource(briefPath);

  assert.equal(brief.version, "2.2.4");

  const purchaseOrder = brief.doctypes.find((entry) => entry.name === "Purchase Order");
  const purchaseReceipt = brief.doctypes.find((entry) => entry.name === "Purchase Receipt");
  assert.equal(purchaseOrder?.menu, false);
  assert.equal(purchaseReceipt?.menu, false);

  const fifo = brief.actions.find((entry) => entry.name === "nhap-nhom-fifo");
  const bulk = brief.actions.find((entry) => entry.name === "nhap-nhom-hang-loat");
  const settlement = brief.actions.find((entry) => entry.name === "doi-soat-giao-hang-ncc");
  assert.equal(fifo?.label, "Mua hàng");
  assert.equal(fifo?.menu, true);
  assert.equal(fifo?.group, "Mua hàng");
  assert.equal(bulk?.menu, false);
  assert.equal(settlement?.menu, false);

  const pkg = compileBrief(brief);
  const navByKey = new Map(pkg.nav.map((entry) => [entry.key, entry]));

  assert.equal(navByKey.has("Purchase Order"), false);
  assert.equal(navByKey.has("Purchase Receipt"), false);
  assert.equal(navByKey.has("action:nhap-nhom-hang-loat"), false);
  assert.equal(navByKey.has("action:doi-soat-giao-hang-ncc"), false);
  assert.equal(navByKey.get("action:nhap-nhom-fifo")?.label, "Mua hàng");

  // Hiding from navigation must not delete canonical authorities or callable actions.
  assert.ok(pkg.doctypes.some((entry) => entry.name === "Purchase Order"));
  assert.ok(pkg.doctypes.some((entry) => entry.name === "Purchase Receipt"));
  assert.ok(pkg.actions.some((entry) => entry.name === "nhap-nhom-fifo"));
  assert.ok(pkg.actions.some((entry) => entry.name === "nhap-nhom-hang-loat"));
  assert.ok(pkg.actions.some((entry) => entry.name === "doi-soat-giao-hang-ncc"));
});
