import { describe, expect, it } from "vitest";
import { MetadataPermissionService } from "../../../packages/frappe-model/src/index.js";
import { PermissionService } from "../../../packages/policy/src/index.js";

const tenantId = "tenant-security";
const meta = { name: "Security Fixture", module: "Test", revision: 1, fields: [
  { fieldname: "title", label: "Title", fieldtype: "Data", permlevel: 0 },
  { fieldname: "items", label: "Items", fieldtype: "Table", options: "Security Fixture Row", permlevel: 0 },
], permissions: [{ role: "Writer", read: true, write: true, create: true, delete: false, permlevel: 0 }] };
const childMeta = { name: "Security Fixture Row", module: "Test", revision: 1, is_child: true, fields: [
  { fieldname: "public_value", label: "Public", fieldtype: "Data", permlevel: 0 },
  { fieldname: "secret_value", label: "Secret", fieldtype: "Data", permlevel: 1 },
], permissions: [] };
const metadata = { async getDocType(_tenant: string, doctype: string) { if (doctype === meta.name) return meta as any; if (doctype === childMeta.name) return childMeta as any; return null; } };

describe("RBAC security convergence", () => {
  it("keeps write and delete independent", async () => {
    const service = new MetadataPermissionService(metadata as any); const actor = { user_id: "writer@example.test", roles: ["Writer"] };
    await expect(service.assert({ actor, tenantId, doctype: meta.name, name: "FIX-1", owner: actor.user_id, data: { title: "ok" }, existingData: { title: "before" }, action: "save" })).resolves.toBeUndefined();
    await expect(service.assert({ actor, tenantId, doctype: meta.name, name: "FIX-1", owner: actor.user_id, data: { title: "ok" }, action: "delete" })).rejects.toBeTruthy();
  });
  it("does not treat System Manager as a data superadmin", async () => {
    const service = new MetadataPermissionService(metadata as any);
    await expect(service.assert({ actor: { user_id: "manager@example.test", roles: ["System Manager"] }, tenantId, doctype: meta.name, action: "read" })).rejects.toBeTruthy();
    expect(() => new PermissionService().assert({ actor: { user_id: "manager@example.test", roles: ["System Manager"] }, doctype: "Sales Order", action: "read" })).toThrow();
  });
  it("preserves Administrator recovery", async () => {
    const service = new MetadataPermissionService(metadata as any);
    await expect(service.assert({ actor: { user_id: "Administrator", roles: [] }, tenantId, doctype: meta.name, action: "delete" })).resolves.toBeUndefined();
    expect(() => new PermissionService().assert({ actor: { user_id: "Administrator", roles: [] }, doctype: "Sales Order", action: "read" })).not.toThrow();
  });
  it("rejects high-permlevel child mutations and redacts them on read", async () => {
    const service = new MetadataPermissionService(metadata as any); const actor = { user_id: "writer@example.test", roles: ["Writer"] };
    await expect(service.assert({ actor, tenantId, doctype: meta.name, name: "FIX-1", owner: actor.user_id, action: "save", data: { title: "ok", items: [{ public_value: "visible", secret_value: "blocked" }] }, existingData: { title: "ok", items: [{ public_value: "visible" }] } })).rejects.toBeTruthy();
    const redacted = await service.redactDocumentWithPolicies(tenantId, meta as any, { tenant_id: tenantId, doctype: meta.name, name: "FIX-1", owner: actor.user_id, docstatus: 0, status: "Draft", version: 1, created_at: "2026-01-01T00:00:00.000Z", modified_at: "2026-01-01T00:00:00.000Z", data: { title: "ok" }, children: [{ fieldname: "items", child_doctype: childMeta.name, row_id: "ROW-1", idx: 1, data: { public_value: "visible", secret_value: "hidden" } }] } as any, actor);
    expect(redacted.children[0]?.data.public_value).toBe("visible"); expect(redacted.children[0]?.data.secret_value).toBeUndefined();
  });
  it("rejects handcrafted server-owned field changes", async () => {
    const service = new MetadataPermissionService(metadata as any); const actor = { user_id: "writer@example.test", roles: ["Writer"] };
    await expect(service.assert({ actor, tenantId, doctype: meta.name, name: "FIX-1", owner: actor.user_id, action: "save", data: { title: "ok", docstatus: 1 }, existingData: { title: "ok" } })).rejects.toBeTruthy();
  });
});
