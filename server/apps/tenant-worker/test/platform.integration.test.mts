import { env, exports } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";

const DOCTYPE = "Core Beta Import Demo";
const META = {
  name: DOCTYPE,
  module: "Core",
  custom: true,
  autoname: "field:name",
  title_field: "subject",
  revision: 1,
  fields: [
    { fieldname: "subject", label: "Subject", fieldtype: "Data", required: true, in_list_view: true, search_index: true },
    { fieldname: "company", label: "Company", fieldtype: "Link", options: "Company", required: true, in_list_view: true, in_standard_filter: true },
  ],
  permissions: [{ role: "System Manager", read: true, write: true, create: true, print: true, import: true, export: true, share: true }],
};

async function request(path: string, init: RequestInit = {}): Promise<Response> {
  return exports.default.fetch(new Request(`https://tenant.test${path}`, init));
}

beforeAll(async () => {
  await env.DB.prepare(
    `INSERT INTO master_records(tenant_id,record_type,name,data_json,modified_at)
     VALUES('demo','Company','Demo','{}','2026-07-25T00:00:00.000Z')
     ON CONFLICT(tenant_id,record_type,name) DO UPDATE SET disabled=0`,
  ).run();
  const response = await request(`/api/v1/meta/${encodeURIComponent(DOCTYPE)}`, {
    method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(META),
  });
  expect(response.status).toBe(200);
});

describe("Frappe Core Beta routes over real workerd D1", () => {
  it("returns the stable metadata envelope expected by Meta Desk", async () => {
    const response = await request(`/api/v1/meta/${encodeURIComponent(DOCTYPE)}`);
    expect(response.status).toBe(200);
    const body = await response.json() as { meta: { name: string; fields: unknown[] }; workflow: unknown };
    expect(body.meta.name).toBe(DOCTYPE);
    expect(body.meta.fields).toHaveLength(2);
    expect(Object.hasOwn(body, "workflow")).toBe(true);
  });

  it("applies CSV rows independently and reports partial success without hiding committed rows", async () => {
    const csv = "name,subject,company\nCB-IMP-1,Good,Demo\nCB-IMP-2,,Demo\n";
    const response = await request(`/api/v1/import/apply?doctype=${encodeURIComponent(DOCTYPE)}`, {
      method: "POST", headers: { "content-type": "text/csv" }, body: csv,
    });
    expect(response.status).toBe(207);
    const body = await response.json() as { imported: number; failed: number; results: Array<{ row: number; status: string; error?: { code: string } }> };
    expect(body.imported).toBe(1);
    expect(body.failed).toBe(1);
    expect(body.results.map((entry) => entry.status)).toEqual(["imported", "failed"]);
    expect(body.results[1]?.error?.code).toBe("VALIDATION_ERROR");

    const stored = await request(`/api/v1/documents/${encodeURIComponent(DOCTYPE)}/CB-IMP-1`);
    expect(stored.status).toBe(200);
    expect((await stored.json() as { data: { subject: string } }).data.subject).toBe("Good");
    const missing = await request(`/api/v1/documents/${encodeURIComponent(DOCTYPE)}/CB-IMP-2`);
    expect(missing.status).toBe(404);
  });

  it("exports through the same metadata list definition and exposes immutable versions in the timeline", async () => {
    const exported = await request("/api/v1/export/csv", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ doctype: DOCTYPE, fields: ["name", "subject", "company"], max_rows: 10 }),
    });
    expect(exported.status).toBe(200);
    const csv = await exported.text();
    expect(csv).toContain("name,subject,company");
    expect(csv).toContain("CB-IMP-1,Good,Demo");

    const timeline = await request(`/api/v1/documents/${encodeURIComponent(DOCTYPE)}/CB-IMP-1/timeline`);
    expect(timeline.status).toBe(200);
    const timelineBody = await timeline.json() as { versions: Array<{ version: number; action: string }> };
    expect(timelineBody.versions.some((entry) => entry.version === 1 && entry.action === "create")).toBe(true);

    const version = await request(`/api/v1/documents/${encodeURIComponent(DOCTYPE)}/CB-IMP-1/versions/1`);
    expect(version.status).toBe(200);
    expect((await version.json() as { version: number }).version).toBe(1);
  });
});
