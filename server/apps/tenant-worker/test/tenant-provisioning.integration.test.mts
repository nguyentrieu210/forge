/**
 * What a brand-new tenant actually receives.
 *
 * Every other suite runs as `demo`, and `demo` is the one tenant whose ERP core was
 * written literally into the migrations. So a tenant provisioned for a real customer
 * could be missing Item and Customer entirely while every test stayed green — the
 * failure only appears the first time somebody who is not `demo` tries to sell
 * something. These tests provision a tenant that is not `demo` and then ask whether it
 * can be used.
 */
import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { D1MetadataStore } from "../../../packages/frappe-model/src/index.js";

const NOW = "2026-07-27T00:00:00.000Z";

/** Doctypes without which a trading tenant cannot record a single transaction. */
const ERP_CORE = [
  "Company", "Currency", "UOM",
  "Item", "Customer", "Warehouse", "Item Price",
  "Sales Order", "Delivery Note", "Sales Invoice", "Payment Entry",
  "Supplier", "Purchase Order", "Purchase Receipt",
  "Stock Entry", "Account", "Journal Entry",
  "Bill of Materials", "Work Order",
];

async function standardDoctypes(): Promise<Set<string>> {
  const rows = await env.DB.prepare(
    `SELECT doctype FROM doctype_definitions WHERE tenant_id='__standard__'`,
  ).all<{ doctype: string }>();
  return new Set((rows.results ?? []).map((row) => row.doctype));
}

describe("standard catalogue", () => {
  it("carries the ERP core, not only the business-suite additions", async () => {
    const standard = await standardDoctypes();
    const missing = ERP_CORE.filter((doctype) => !standard.has(doctype));
    expect(missing).toEqual([]);
  });

  it("keeps the CRM entry points a sales tenant starts from", async () => {
    const standard = await standardDoctypes();
    expect(standard.has("Lead")).toBe(true);
    expect(standard.has("Opportunity")).toBe(true);
  });
});

describe("provisioning a tenant that is not demo", () => {
  it("copies the ERP core into the new tenant", async () => {
    const store = new D1MetadataStore(env.DB);
    const result = await store.provisionStandardCatalog("acme", "Administrator", NOW);
    expect(result.doctypes).toBeGreaterThan(0);

    for (const doctype of ["Item", "Customer", "Sales Order", "Warehouse"]) {
      const meta = await store.getDocType("acme", doctype);
      expect(meta).not.toBeNull();
    }
  });

  it("creates every role the copied DocPerms name", async () => {
    const store = new D1MetadataStore(env.DB);
    await store.provisionStandardCatalog("roles-tenant", "Administrator", NOW);

    const rows = await env.DB.prepare(
      `SELECT role FROM roles WHERE tenant_id='roles-tenant'`,
    ).all<{ role: string }>();
    const roles = new Set((rows.results ?? []).map((row) => row.role));

    // Named individually because each one is a job somebody has to be able to do:
    // without the row, the grant is refused and the person cannot be staffed.
    for (const role of ["Sales Manager", "Sales User", "Stock Manager", "Stock User", "Accounts Manager"]) {
      expect(roles.has(role)).toBe(true);
    }
  });

  it("makes those roles grantable — the point of creating them", async () => {
    const store = new D1MetadataStore(env.DB);
    await store.provisionStandardCatalog("staffed", "Administrator", NOW);

    await env.DB.prepare(
      `INSERT INTO users(tenant_id,user_id,full_name,email,enabled,user_type,password_hash,session_epoch,created_at,modified_at)
       VALUES('staffed','kho@forge.test','Thu kho','kho@forge.test',1,'System User','',1,?1,?1)`,
    ).bind(NOW).run();

    // The trigger refuses a grant whose role has no row, so this insert IS the test:
    // it throws if provisioning left the metadata describing a role that cannot exist.
    await env.DB.prepare(
      `INSERT INTO user_roles(tenant_id,user_id,role) VALUES('staffed','kho@forge.test','Stock User')`,
    ).run();

    const granted = await env.DB.prepare(
      `SELECT role FROM user_roles WHERE tenant_id='staffed' AND user_id='kho@forge.test'`,
    ).all<{ role: string }>();
    expect((granted.results ?? []).map((row) => row.role)).toEqual(["Stock User"]);
  });

  it("is idempotent — a second run adds nothing and removes nothing", async () => {
    const store = new D1MetadataStore(env.DB);
    await store.provisionStandardCatalog("twice", "Administrator", NOW);
    const second = await store.provisionStandardCatalog("twice", "Administrator", NOW);

    expect(second.doctypes).toBe(0);
    expect(second.roles).toBe(0);
    expect(await store.getDocType("twice", "Item")).not.toBeNull();
  });

  it("refuses to provision the standard catalogue onto itself", async () => {
    const store = new D1MetadataStore(env.DB);
    await expect(store.provisionStandardCatalog("__standard__", "Administrator", NOW)).rejects.toThrow();
  });
});
