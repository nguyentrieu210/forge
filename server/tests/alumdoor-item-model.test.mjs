import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { compileBrief } from "../scripts/lib/compile-brief.mjs";
import alumdoorWorker from "../dist/apps-src/alumdoor-worker/src/index.js";

const brief = JSON.parse(await readFile(new URL("../briefs/alumdoor.json", import.meta.url), "utf8"));
const app = compileBrief(brief);
const doctype = (name) => app.doctypes.find((entry) => entry.name === name);
const field = (doctypeName, fieldname) => doctype(doctypeName)?.fields.find((entry) => entry.fieldname === fieldname);

test("Alumdoor Item declares reusable inventory measurement profiles", () => {
  assert.ok(doctype("Measurement Profile"));
  assert.equal(field("Item", "inventory_mode")?.default, "Hàng thường");
  assert.equal(field("Item", "stock_uom")?.default, "Cái");
  assert.equal(field("Item", "measurement_profile")?.options, "Measurement Profile");
  assert.match(field("Item", "measurement_profile")?.depends_on ?? "", /inventory_mode != 'Hàng thường'/);

  const aluminium = brief.fixtures.find((entry) =>
    entry.type === "Measurement Profile" && entry.name === "Nhôm cây/lá");
  assert.deepEqual(
    {
      mode: aluminium?.data?.inventory_mode,
      uom: aluminium?.data?.stock_uom,
      length: aluminium?.data?.require_length,
      pieces: aluminium?.data?.require_piece_qty,
    },
    { mode: "Nhôm cây/lá", uom: "Kg", length: true, pieces: true },
  );
});

test("purchase rows expose aluminium dimensions only for aluminium items", () => {
  for (const child of ["Purchase Order Item", "Purchase Receipt Item"]) {
    assert.equal(field(child, "inventory_mode")?.hidden, true);
    assert.match(field(child, "length_m")?.depends_on ?? "", /Nhôm cây\/lá/);
    assert.match(field(child, "length_m")?.mandatory_depends_on ?? "", /Nhôm cây\/lá/);
    assert.match(field(child, "qty_bar")?.mandatory_depends_on ?? "", /Nhôm cây\/lá/);
    assert.equal(field(child, "total_length_m")?.read_only, true);
    assert.equal(field(child, "actual_kg_per_m")?.read_only, true);
    assert.equal(field(child, "conversion_factor")?.label, "Hệ số quy đổi về ĐVT tồn");
  }
  assert.deepEqual(app.validators, [
    { doctype: "Purchase Order", actions: ["create", "save", "submit"] },
    { doctype: "Purchase Receipt", actions: ["create", "save", "submit"] },
  ]);
});

function validatorRequest(items) {
  return new Request("https://app.internal/hooks/validate", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-cloudforge-tenant": "tenant-test",
      "x-cloudforge-callback": "https://tenant.test/_app/",
    },
    body: JSON.stringify({
      doctype: "Purchase Receipt",
      name: "NEW-PURCHASE-RECEIPT",
      action: "submit",
      payload: { items },
    }),
  });
}

function platform(items) {
  return {
    fetch(request) {
      const code = decodeURIComponent(new URL(request.url).pathname.split("/").at(-1));
      const item = items[code];
      return item
        ? Promise.resolve(Response.json({ data: item }))
        : Promise.resolve(Response.json({ message: "not found" }, { status: 404 }));
    },
  };
}

test("ordinary items keep the simple qty/uom path", async () => {
  const response = await alumdoorWorker.fetch(
    validatorRequest([{ item_code: "MOTOR-01", qty: 2, uom: "Cái", rate: 1_000_000 }]),
    { PLATFORM: platform({ "MOTOR-01": { inventory_mode: "Hàng thường", stock_uom: "Cái" } }) },
    {},
  );
  assert.equal(response.status, 200);
});

test("aluminium is authoritative Kg stock plus required physical dimensions", async () => {
  const env = { PLATFORM: platform({ A282: { inventory_mode: "Nhôm cây/lá", stock_uom: "Kg" } }) };
  const valid = await alumdoorWorker.fetch(
    validatorRequest([{
      item_code: "A282",
      inventory_mode: "Hàng thường",
      uom: "Kg",
      conversion_factor: 1,
      qty: 191.4,
      length_m: 8.5,
      qty_bar: 51,
      qty_bundle: 6,
      so_no: "14JJ",
    }]),
    env,
    {},
  );
  assert.equal(valid.status, 200, await valid.text());

  const wrongUnit = await alumdoorWorker.fetch(
    validatorRequest([{ item_code: "A282", uom: "Cây", qty: 51, length_m: 8.5, qty_bar: 51 }]),
    env,
    {},
  );
  assert.equal(wrongUnit.status, 422);
  assert.match((await wrongUnit.json()).message, /phải nhập theo Kg/);

  const missingDimensions = await alumdoorWorker.fetch(
    validatorRequest([{ item_code: "A282", uom: "Kg", qty: 191.4 }]),
    env,
    {},
  );
  assert.equal(missingDimensions.status, 422);
  assert.match((await missingDimensions.json()).message, /chiều dài/);
});
