/**
 * meta-build — thao tác PURE trên DocTypeMeta cho DocType Builder (M17).
 * Builder kéo-thả chỉ gọi các hàm này → dễ test, dễ undo/redo (immutable).
 * Lưu = adapter.saveMeta (DocType/DocField) hoặc saveCustomize (Custom Field/Property Setter).
 */
import type { DocTypeMeta, DocField, Fieldtype } from "@metaforge/core";

export function blankDocType(name = "New DocType"): DocTypeMeta {
  return {
    name,
    fields: [],
    permissions: [{ role: "System Manager", permlevel: 0, read: 1, write: 1, create: 1, delete: 1 }],
  };
}

let seq = 0;
export function newField(fieldtype: Fieldtype): DocField {
  seq += 1;
  const base = fieldtype.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  const layout = ["Section Break", "Column Break", "Tab Break", "Fold", "Heading"].includes(fieldtype);
  return {
    fieldname: `${base || "field"}_${seq}`,
    label: layout ? "" : fieldtype,
    fieldtype,
  };
}

export function addField(meta: DocTypeMeta, field: DocField, at?: number): DocTypeMeta {
  const fields = [...meta.fields];
  fields.splice(at ?? fields.length, 0, field);
  return { ...meta, fields };
}

export function removeField(meta: DocTypeMeta, fieldname: string): DocTypeMeta {
  return { ...meta, fields: meta.fields.filter((f) => f.fieldname !== fieldname) };
}

export function moveField(meta: DocTypeMeta, from: number, to: number): DocTypeMeta {
  const fields = [...meta.fields];
  if (from < 0 || from >= fields.length || to < 0 || to >= fields.length) return meta;
  const [moved] = fields.splice(from, 1);
  fields.splice(to, 0, moved!);
  return { ...meta, fields };
}

export function updateField(meta: DocTypeMeta, fieldname: string, patch: Partial<DocField>): DocTypeMeta {
  return {
    ...meta,
    fields: meta.fields.map((f) => (f.fieldname === fieldname ? { ...f, ...patch } : f)),
  };
}

/** Chỉ số field theo fieldname (để reorder). */
export function indexOfField(meta: DocTypeMeta, fieldname: string): number {
  return meta.fields.findIndex((f) => f.fieldname === fieldname);
}
