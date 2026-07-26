/**
 * Storage for the customisation overlay.
 *
 * Every write bumps the doctype's customisation revision in the same batch. That
 * pairing is the point: the revision is what versions the merged schema, so a
 * customisation that landed without bumping it would be invisible to any cache
 * and would appear not to have applied.
 */

import { errors } from "../../core/src/index.js";
import type { CustomFieldRecord, PropertySetterRecord } from "./customization.js";
import type { DocFieldMeta } from "./types.js";

interface CustomFieldRow {
  name: string;
  dt: string;
  fieldname: string;
  metadata_json: string;
  insert_after: string | null;
}

interface PropertySetterRow {
  name: string;
  doc_type: string;
  doctype_or_field: string;
  field_name: string;
  property: string;
  property_type: string;
  value: string | null;
}

export interface CustomizationStore {
  listCustomFields(tenantId: string, doctype: string): Promise<CustomFieldRecord[]>;
  listPropertySetters(tenantId: string, doctype: string): Promise<PropertySetterRecord[]>;
  revision(tenantId: string, doctype: string): Promise<number>;
  putCustomField(tenantId: string, record: CustomFieldRecord, actor: string, now: string): Promise<void>;
  deleteCustomField(tenantId: string, doctype: string, fieldname: string, now: string): Promise<boolean>;
  putPropertySetter(tenantId: string, record: PropertySetterRecord, actor: string, now: string): Promise<void>;
  deletePropertySetter(tenantId: string, name: string, doctype: string, now: string): Promise<boolean>;
}

export class D1CustomizationStore implements CustomizationStore {
  private readonly db: D1Database | D1DatabaseSession;
  constructor(db: D1Database) { this.db = db.withSession?.("first-primary") ?? db; }

  async listCustomFields(tenantId: string, doctype: string): Promise<CustomFieldRecord[]> {
    const result = await this.db.prepare(
      // Ordered by name so the merged field order is deterministic: two custom
      // fields inserted after the same standard field must not swap places
      // between reads, or the form would reorder itself at random.
      `SELECT name, dt, fieldname, metadata_json, insert_after FROM custom_fields
       WHERE tenant_id=?1 AND dt=?2 ORDER BY name`,
    ).bind(tenantId, doctype).all<CustomFieldRow>();
    return (result.results ?? []).map((row) => ({
      name: row.name,
      dt: row.dt,
      fieldname: row.fieldname,
      field: JSON.parse(row.metadata_json) as DocFieldMeta,
      insert_after: row.insert_after,
    }));
  }

  async listPropertySetters(tenantId: string, doctype: string): Promise<PropertySetterRecord[]> {
    const result = await this.db.prepare(
      `SELECT name, doc_type, doctype_or_field, field_name, property, property_type, value
       FROM property_setters WHERE tenant_id=?1 AND doc_type=?2 ORDER BY name`,
    ).bind(tenantId, doctype).all<PropertySetterRow>();
    return (result.results ?? []).map((row) => ({
      name: row.name,
      doc_type: row.doc_type,
      doctype_or_field: row.doctype_or_field === "DocType" ? "DocType" : "DocField",
      field_name: row.field_name,
      property: row.property,
      property_type: row.property_type,
      value: row.value,
    }));
  }

  async revision(tenantId: string, doctype: string): Promise<number> {
    const row = await this.db.prepare(
      `SELECT revision FROM customization_revisions WHERE tenant_id=?1 AND doctype=?2`,
    ).bind(tenantId, doctype).first<{ revision: number }>();
    // Zero means "never customised", which is a distinct cache state from
    // revision 1 ("customised once, then reverted").
    return row?.revision ?? 0;
  }

  async putCustomField(tenantId: string, record: CustomFieldRecord, actor: string, now: string): Promise<void> {
    await this.db.batch([
      this.db.prepare(
        `INSERT INTO custom_fields(tenant_id,name,dt,fieldname,metadata_json,insert_after,modified_by,modified_at)
         VALUES(?1,?2,?3,?4,?5,?6,?7,?8)
         ON CONFLICT(tenant_id,name) DO UPDATE SET
           dt=excluded.dt, fieldname=excluded.fieldname, metadata_json=excluded.metadata_json,
           insert_after=excluded.insert_after, modified_by=excluded.modified_by, modified_at=excluded.modified_at`,
      ).bind(tenantId, record.name, record.dt, record.fieldname, JSON.stringify(record.field), record.insert_after, actor, now),
      this.bumpRevision(tenantId, record.dt, now),
    ]);
  }

  async deleteCustomField(tenantId: string, doctype: string, fieldname: string, now: string): Promise<boolean> {
    const result = await this.db.batch([
      this.db.prepare(`DELETE FROM custom_fields WHERE tenant_id=?1 AND dt=?2 AND fieldname=?3`).bind(tenantId, doctype, fieldname),
      this.bumpRevision(tenantId, doctype, now),
    ]);
    return (result[0]?.meta?.changes ?? 0) > 0;
  }

  async putPropertySetter(tenantId: string, record: PropertySetterRecord, actor: string, now: string): Promise<void> {
    await this.db.batch([
      this.db.prepare(
        `INSERT INTO property_setters(tenant_id,name,doc_type,doctype_or_field,field_name,property,property_type,value,modified_by,modified_at)
         VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)
         ON CONFLICT(tenant_id,name) DO UPDATE SET
           doc_type=excluded.doc_type, doctype_or_field=excluded.doctype_or_field, field_name=excluded.field_name,
           property=excluded.property, property_type=excluded.property_type, value=excluded.value,
           modified_by=excluded.modified_by, modified_at=excluded.modified_at`,
      ).bind(tenantId, record.name, record.doc_type, record.doctype_or_field, record.field_name,
        record.property, record.property_type, record.value, actor, now),
      this.bumpRevision(tenantId, record.doc_type, now),
    ]);
  }

  async deletePropertySetter(tenantId: string, name: string, doctype: string, now: string): Promise<boolean> {
    const result = await this.db.batch([
      this.db.prepare(`DELETE FROM property_setters WHERE tenant_id=?1 AND name=?2`).bind(tenantId, name),
      this.bumpRevision(tenantId, doctype, now),
    ]);
    return (result[0]?.meta?.changes ?? 0) > 0;
  }

  private bumpRevision(tenantId: string, doctype: string, now: string): D1PreparedStatement {
    return this.db.prepare(
      `INSERT INTO customization_revisions(tenant_id,doctype,revision,modified_at) VALUES(?1,?2,1,?3)
       ON CONFLICT(tenant_id,doctype) DO UPDATE SET revision=revision+1, modified_at=excluded.modified_at`,
    ).bind(tenantId, doctype, now);
  }
}

/** In-memory overlay, for tests and the non-D1 harness. */
export class InMemoryCustomizationStore implements CustomizationStore {
  private customFields = new Map<string, CustomFieldRecord[]>();
  private setters = new Map<string, PropertySetterRecord[]>();
  private revisions = new Map<string, number>();

  private key(tenantId: string, doctype: string): string { return `${tenantId}:${doctype}`; }

  async listCustomFields(tenantId: string, doctype: string): Promise<CustomFieldRecord[]> {
    return structuredClone(this.customFields.get(this.key(tenantId, doctype)) ?? []).sort((a, b) => a.name.localeCompare(b.name));
  }

  async listPropertySetters(tenantId: string, doctype: string): Promise<PropertySetterRecord[]> {
    return structuredClone(this.setters.get(this.key(tenantId, doctype)) ?? []).sort((a, b) => a.name.localeCompare(b.name));
  }

  async revision(tenantId: string, doctype: string): Promise<number> {
    return this.revisions.get(this.key(tenantId, doctype)) ?? 0;
  }

  async putCustomField(tenantId: string, record: CustomFieldRecord): Promise<void> {
    const key = this.key(tenantId, record.dt);
    const existing = this.customFields.get(key) ?? [];
    const filtered = existing.filter((entry) => entry.name !== record.name);
    if (filtered.some((entry) => entry.fieldname === record.fieldname)) {
      throw errors.validation(`A custom field named ${record.fieldname} already exists on ${record.dt}`);
    }
    this.customFields.set(key, [...filtered, structuredClone(record)]);
    this.bump(key);
  }

  async deleteCustomField(tenantId: string, doctype: string, fieldname: string): Promise<boolean> {
    const key = this.key(tenantId, doctype);
    const existing = this.customFields.get(key) ?? [];
    const filtered = existing.filter((entry) => entry.fieldname !== fieldname);
    this.customFields.set(key, filtered);
    this.bump(key);
    return filtered.length !== existing.length;
  }

  async putPropertySetter(tenantId: string, record: PropertySetterRecord): Promise<void> {
    const key = this.key(tenantId, record.doc_type);
    const existing = this.setters.get(key) ?? [];
    // Mirrors the UNIQUE index: one setter per target property, or the winner
    // would depend on scan order.
    const filtered = existing.filter((entry) => !(
      entry.doctype_or_field === record.doctype_or_field
      && entry.field_name === record.field_name
      && entry.property === record.property
    ));
    this.setters.set(key, [...filtered, structuredClone(record)]);
    this.bump(key);
  }

  async deletePropertySetter(tenantId: string, name: string, doctype: string): Promise<boolean> {
    const key = this.key(tenantId, doctype);
    const existing = this.setters.get(key) ?? [];
    const filtered = existing.filter((entry) => entry.name !== name);
    this.setters.set(key, filtered);
    this.bump(key);
    return filtered.length !== existing.length;
  }

  private bump(key: string): void {
    this.revisions.set(key, (this.revisions.get(key) ?? 0) + 1);
  }
}
