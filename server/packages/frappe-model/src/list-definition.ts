import type { Actor, JsonObject } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";
import { DOCUMENT_LIST_DEFINITIONS, type DocumentListDefinition, type DocumentListDefinitionResolver } from "../../document-kernel/src/document-list.js";
import type { MetadataStore } from "./store.js";
import { metadataToListDefinition } from "./list-definition-internal.js";

export class MetadataDocumentListDefinitionResolver implements DocumentListDefinitionResolver {
  constructor(private readonly metadata: MetadataStore) {}
  async resolve(tenantId: string, body: JsonObject, actor?: Actor) {
    const doctype = body.doctype;
    if (typeof doctype !== "string" || !doctype) throw errors.validation("doctype is required");
    const staticDefinition = DOCUMENT_LIST_DEFINITIONS[doctype];
    const meta = await this.metadata.getDocType(tenantId, doctype);
    // Apply permlevel visibility before either the static+metadata merge or the
    // metadata-only path. Otherwise a custom high-permission field added to a
    // built-in doctype becomes list-queryable by every reader.
    const visible = meta && actor && !isAdministrator(actor)
      ? { ...meta, fields: meta.fields.filter((field) => (field.permlevel ?? 0) === 0) }
      : meta;
    /**
     * A built-in definition DESCRIBES the doctype; it does not own it.
     *
     * The platform ships tuned list definitions for the commercial doctypes — the
     * columns the ledger cares about, with filters and sorts chosen for them. Returning
     * one of those outright meant an app that declares `Sales Order` got the platform's
     * five columns and nothing else: every field the app added was refused with
     * `Field is not allowed: …`, and the list rendered "Không tải được dữ liệu" over a
     * table that plainly held rows. The app was correct; the resolver simply could not
     * see it.
     *
     * Merged instead, with the built-in winning on any name they share, so the tuned
     * mappings stay exactly as they were and the app's own fields become queryable.
     * Without tenant metadata there is nothing to merge and the built-in stands alone.
     */
    if (staticDefinition) return visible && !visible.is_child ? mergeListDefinitions(staticDefinition, metadataToListDefinition(visible)) : staticDefinition;
    if (!visible || visible.is_child) throw errors.validation(`Unsupported doctype: ${doctype}`);
    // List projection is deliberately limited to permlevel 0. Higher permlevels
    // are document-context permissions and cannot be projected safely across a
    // mixed owner/shared page with one SQL SELECT.
    return metadataToListDefinition(visible);
  }
}

function isAdministrator(actor: Actor): boolean {
  return actor.user_id === "Administrator" || actor.roles.includes("Administrator") || actor.roles.includes("System Manager");
}

/**
 * Union of a built-in definition and the one derived from an app's metadata.
 *
 * `built` wins on every field name it defines, because its source mapping is the tuned
 * one (a real column rather than a JSON extraction, or a currency the ledger writes in
 * minor units). Everything the app adds is appended.
 *
 * `defaultFields` — the columns actually shown — comes from the APP, because those are
 * the columns its author chose; the built-in list is a fallback for a tenant that has no
 * metadata at all.
 */
function mergeListDefinitions(built: DocumentListDefinition, derived: DocumentListDefinition): DocumentListDefinition {
  const fields = { ...derived.fields, ...built.fields };
  const keep = (names: readonly string[]) => [...new Set(names)].filter((name) => Object.hasOwn(fields, name));
  return {
    ...built,
    fields,
    defaultFields: keep(derived.defaultFields.length ? derived.defaultFields : built.defaultFields),
    searchFields: keep([...built.searchFields, ...derived.searchFields]),
    filterFields: keep([...built.filterFields, ...derived.filterFields]),
    sortFields: keep([...built.sortFields, ...derived.sortFields]),
  };
}
