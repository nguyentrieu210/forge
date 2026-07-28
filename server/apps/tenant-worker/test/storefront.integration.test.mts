/**
 * The public storefront, end to end, with NO session anywhere.
 *
 * Every request here is what a stranger's browser sends: no cookie, no token, no CSRF
 * header. That is the whole point — these paths exist to be reached by people who have
 * never logged in, which is also why each one is a way to leak the tenant's data if it
 * is a shade too generous. The tests are written to fail if it becomes so.
 *
 * The app under test is the real `phanbon` brief, compiled by the real compiler and
 * installed through the real installer: a storefront that only works against a
 * hand-built fixture proves nothing about the app that ships.
 */
import { env, exports } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";
import { compileBrief } from "../../../scripts/lib/compile-brief.mjs";
// The real brief, imported as data: bundled by vite, so the test runs the file that ships.
import brief from "../../../briefs/phanbon.json" with { type: "json" };
import { AppInstaller, parseAppManifest } from "../../../packages/app-registry/src/index.js";
import { D1MetadataStore } from "../../../packages/frappe-model/src/index.js";
import { D1UserStore } from "../../../packages/auth/src/index.js";

const NOW = "2026-07-27T08:00:00.000Z";

async function call(method: string, args: Record<string, unknown> = {}, init: RequestInit = {}): Promise<Response> {
  const url = new URL(`https://tenant.test/api/method/${method}`);
  if (init.method === "POST") {
    return exports.default.fetch(new Request(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(args),
    }));
  }
  for (const [key, value] of Object.entries(args)) url.searchParams.set(key, String(value));
  return exports.default.fetch(new Request(url));
}

async function message<T>(response: Response): Promise<T> {
  const body = await response.json() as { message: T };
  return body.message;
}

/** Writes a product straight into `documents`, the way the Desk would have. */
async function seedProduct(row: Record<string, unknown>): Promise<void> {
  const name = String(row.item_code);
  await env.DB.prepare(
    `INSERT INTO documents(tenant_id,doc_key,doctype,name,owner,docstatus,status,version,created_at,modified_at,payload_json)
     VALUES('demo',?1,'Item',?2,'Administrator',0,'Draft',1,?3,?3,?4)
     ON CONFLICT(tenant_id,doc_key) DO UPDATE SET payload_json=excluded.payload_json`,
  ).bind(`Item:${name}`, name, NOW, JSON.stringify(row)).run();
}

beforeAll(async () => {
  const manifest = parseAppManifest(compileBrief(brief));
  const metadata = new D1MetadataStore(env.DB);
  const installer = new AppInstaller(env.DB, metadata, new D1UserStore(env.DB));

  /**
   * A CLEAN tenant, which is what a fertiliser customer actually gets.
   *
   * The app ships its own Item, Customer and Sales Order — under exactly those names, so
   * the selling and stock controllers still recognise them — and the installer refuses to
   * overwrite a doctype it does not own. That refusal is correct and worth keeping: it is
   * what stops an app from quietly redefining another app's data. It also means a tenant
   * running this app must NOT be pre-loaded with the standard catalogue; the app is the
   * catalogue. The test suite's own tenant carries the migration's `demo` seed rows, so
   * they are cleared here rather than pretending the conflict does not exist.
   */
  const owned = manifest.doctypes.map((doctype) => doctype.name);
  await env.DB.batch(owned.map((doctype) =>
    env.DB.prepare(`DELETE FROM doctype_definitions WHERE tenant_id='demo' AND doctype=?1`).bind(doctype)));

  await installer.install("demo", manifest, "Administrator", NOW);

  await seedProduct({
    item_code: "NPK-16-16-8", item_name: "NPK 16-16-8 bao 50kg", item_group: "Phân bón",
    stock_uom: "Bao", pack_size: "Bao 50kg", retail_price: 620000,
    valuation_rate: 410000, npk_ratio: "16-16-8", origin: "Nhà máy Long An",
    short_description: "Phân bón NPK cân đối cho lúa", slug: "npk-16-16-8",
    image: "/files/file-abc/npk.png", published: 1, is_stock_item: 1,
  });
  await seedProduct({
    item_code: "GAO-ST25", item_name: "Gạo ST25 túi 5kg", item_group: "Gạo",
    stock_uom: "Túi", pack_size: "Túi 5kg", retail_price: 210000,
    valuation_rate: 150000, rice_variety: "ST25", origin: "Sóc Trăng",
    short_description: "Gạo thơm ST25", slug: "gao-st25", published: 1, is_stock_item: 1,
  });
  await seedProduct({
    item_code: "RUOU-NEP", item_name: "Rượu nếp 12 độ", item_group: "Rượu",
    stock_uom: "Chai", retail_price: 95000, alcohol_abv: 12, slug: "ruou-nep",
    published: 1, is_stock_item: 1,
  });
  // Deliberately unpublished: the product exists, and no public path may reveal it.
  await seedProduct({
    item_code: "NGUYEN-LIEU-URE", item_name: "Ure nguyên liệu", item_group: "Nguyên liệu",
    stock_uom: "Tấn", retail_price: 9000000, valuation_rate: 8000000,
    slug: "ure-nguyen-lieu", published: 0, is_stock_item: 1,
  });
});

describe("catalogue", () => {
  it("serves published products to a visitor with no session", async () => {
    const result = await message<{ total: number; items: Array<Record<string, unknown>>; facets: string[] }>(
      await call("forge.storefront.catalog"),
    );
    expect(result.total).toBe(3);
    expect(result.items.map((item) => item.item_code).sort()).toEqual(["GAO-ST25", "NPK-16-16-8", "RUOU-NEP"]);
  });

  it("NEVER returns a field the app did not publish", async () => {
    const result = await message<{ items: Array<Record<string, unknown>> }>(await call("forge.storefront.catalog"));
    for (const item of result.items) {
      // Cost price sits on the same doctype, one field away from the retail price.
      expect(item).not.toHaveProperty("valuation_rate");
      expect(item).not.toHaveProperty("published");
      expect(item).not.toHaveProperty("disabled");
    }
  });

  it("hides an unpublished product from the list, the facets and the search", async () => {
    const all = await message<{ items: Array<Record<string, unknown>>; facets: string[] }>(await call("forge.storefront.catalog"));
    expect(all.items.some((item) => item.item_code === "NGUYEN-LIEU-URE")).toBe(false);
    expect(all.facets).not.toContain("Nguyên liệu");

    const searched = await message<{ items: Array<Record<string, unknown>> }>(
      await call("forge.storefront.catalog", { search: "Ure" }),
    );
    expect(searched.items).toHaveLength(0);
  });

  it("filters by group and searches by name", async () => {
    const rice = await message<{ items: Array<Record<string, unknown>> }>(
      await call("forge.storefront.catalog", { facet: "Gạo" }),
    );
    expect(rice.items.map((item) => item.item_code)).toEqual(["GAO-ST25"]);

    const searched = await message<{ items: Array<Record<string, unknown>> }>(
      await call("forge.storefront.catalog", { search: "st25" }),
    );
    expect(searched.items.map((item) => item.item_code)).toEqual(["GAO-ST25"]);
  });

  it("serves one product by slug, and 404s an unpublished one", async () => {
    const product = await message<Record<string, unknown>>(await call("forge.storefront.product", { slug: "npk-16-16-8" }));
    expect(product.item_name).toBe("NPK 16-16-8 bao 50kg");
    expect(product.image).toBe("/files/file-abc/npk.png");
    expect(product).not.toHaveProperty("valuation_rate");

    const hidden = await call("forge.storefront.product", { slug: "ure-nguyen-lieu" });
    expect(hidden.status).toBe(404);
  });
});

describe("placing an order", () => {
  it("accepts an order from a stranger and prices it on the SERVER", async () => {
    const response = await call("forge.storefront.place_order", {
      order: {
        buyer_name: "Nguyễn Văn A", phone: "0909123456", ship_address: "12 Đường số 2, Long An",
        province: "Long An", payment_method: "COD",
        items: [
          // A client that names its own price is ignored: 1đ here, 620.000đ in the answer.
          { item_code: "NPK-16-16-8", qty: 2, rate: 1, amount: 2 },
          { item_code: "GAO-ST25", qty: 1 },
        ],
      },
    }, { method: "POST" });

    expect(response.status).toBe(200);
    const result = await message<{ code: string }>(response);
    expect(result.code).toMatch(/^DW-\d{4}-\d{5}$/);

    const stored = await env.DB.prepare(
      `SELECT payload_json FROM documents WHERE tenant_id='demo' AND doctype='Web Order' AND name=?1`,
    ).bind(result.code).first<{ payload_json: string }>();
    const payload = JSON.parse(stored!.payload_json) as Record<string, any>;

    // Money is stored as a decimal STRING, never a float: the ledger derives every
    // figure in minor units, and a JSON number would reintroduce the rounding error the
    // whole money layer exists to avoid.
    expect(Number(payload.total_amount)).toBe(620000 * 2 + 210000);
    expect(Number(payload.items[0].rate)).toBe(620000);
    expect(Number(payload.items[0].amount)).toBe(1240000);
    // The line label is copied at order time: renaming the product later must not
    // silently rewrite what the customer believed they bought.
    expect(payload.items[0].item_name).toBe("NPK 16-16-8 bao 50kg");
  });

  it("refuses to sell something that is not published", async () => {
    const response = await call("forge.storefront.place_order", {
      order: {
        buyer_name: "Kẻ tò mò", phone: "0900000001", ship_address: "x",
        items: [{ item_code: "NGUYEN-LIEU-URE", qty: 1 }],
      },
    }, { method: "POST" });
    expect(response.status).toBeGreaterThanOrEqual(400);
  });

  it("refuses an empty cart and a nonsense quantity", async () => {
    for (const items of [[], [{ item_code: "GAO-ST25", qty: 0 }], [{ item_code: "GAO-ST25", qty: -5 }]]) {
      const response = await call("forge.storefront.place_order", {
        order: { buyer_name: "A", phone: "0900000002", ship_address: "x", items },
      }, { method: "POST" });
      expect(response.status).toBeGreaterThanOrEqual(400);
    }
  });

  it("refuses a field the buyer was never meant to set", async () => {
    const response = await call("forge.storefront.place_order", {
      order: {
        buyer_name: "A", phone: "0900000003", ship_address: "x",
        // Staff-only: an order that arrives already linked to a customer, or already
        // pointing at a Sales Order, is an order that skipped the people who check it.
        staff_note: "đã duyệt", customer: "CUST-0001",
        items: [{ item_code: "GAO-ST25", qty: 1 }],
      },
    }, { method: "POST" });

    expect(response.status).toBe(200);
    const { code } = await message<{ code: string }>(response);
    const stored = await env.DB.prepare(
      `SELECT payload_json FROM documents WHERE tenant_id='demo' AND doctype='Web Order' AND name=?1`,
    ).bind(code).first<{ payload_json: string }>();
    const payload = JSON.parse(stored!.payload_json) as Record<string, unknown>;
    // Dropped, not stored: the buyer field list is a whitelist.
    expect(payload.staff_note).toBeUndefined();
    expect(payload.customer).toBeUndefined();
  });

  it("does not move stock — a web order is a request, not a document", async () => {
    const before = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM stock_ledger_entries WHERE tenant_id='demo'`,
    ).first<{ n: number }>();

    await call("forge.storefront.place_order", {
      order: {
        buyer_name: "B", phone: "0900000004", ship_address: "x",
        items: [{ item_code: "NPK-16-16-8", qty: 500 }],
      },
    }, { method: "POST" });

    const after = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM stock_ledger_entries WHERE tenant_id='demo'`,
    ).first<{ n: number }>();
    expect(after!.n).toBe(before!.n);
  });
});

describe("tracking an order", () => {
  let code = "";
  const phone = "0912345678";

  beforeAll(async () => {
    const response = await call("forge.storefront.place_order", {
      order: {
        buyer_name: "Trần Thị B", phone, ship_address: "45 Quốc lộ 1", province: "Tiền Giang",
        items: [{ item_code: "RUOU-NEP", qty: 3 }],
      },
    }, { method: "POST" });
    code = (await message<{ code: string }>(response)).code;
  });

  it("finds the order for the buyer who placed it", async () => {
    const result = await message<{ code: string; total: number; items: unknown[] }>(
      await call("forge.storefront.track_order", { code, phone }),
    );
    expect(result.code).toBe(code);
    expect(Number(result.total)).toBe(95000 * 3);
    expect(result.items).toHaveLength(1);
  });

  it("accepts the same number written another way", async () => {
    // The buyer who typed 0912… on the form and +8491… in the tracking box is one
    // person, and telling them their order does not exist is a support call.
    const result = await message<{ code: string }>(await call("forge.storefront.track_order", { code, phone: "+84912345678" }));
    expect(result.code).toBe(code);
  });

  it("refuses the code ALONE — the whole reason for a second factor", async () => {
    const wrong = await call("forge.storefront.track_order", { code, phone: "0900000000" });
    expect(wrong.status).toBe(404);

    const missing = await call("forge.storefront.track_order", { code });
    expect(missing.status).toBeGreaterThanOrEqual(400);
  });

  it("answers a non-existent code exactly like a wrong phone number", async () => {
    const ghost = await call("forge.storefront.track_order", { code: "DW-2026-99999", phone: "0900000000" });
    const wrongPhone = await call("forge.storefront.track_order", { code, phone: "0900000000" });
    expect(ghost.status).toBe(wrongPhone.status);
  });

  it("returns what the buyer needs and nothing internal", async () => {
    const result = await message<Record<string, unknown>>(await call("forge.storefront.track_order", { code, phone }));
    expect(result).not.toHaveProperty("staff_note");
    expect(result).not.toHaveProperty("ship_address");
    expect(result).not.toHaveProperty("customer");
  });
});
