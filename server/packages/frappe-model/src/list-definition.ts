import type { Actor, JsonObject } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";
import { DOCUMENT_LIST_DEFINITIONS, type DocumentListDefinitionResolver } from "../../document-kernel/src/document-list.js";
import type { MetadataStore } from "./store.js";
import { metadataToListDefinition } from "./list-definition-internal.js";

export class MetadataDocumentListDefinitionResolver implements DocumentListDefinitionResolver {
  constructor(private readonly metadata: MetadataStore) {}
  async resolve(tenantId: string, body: JsonObject, actor?: Actor) {
    const doctype = body.doctype;
    if (typeof doctype !== "string" || !doctype) throw errors.validation("doctype is required");
    const staticDefinition = DOCUMENT_LIST_DEFINITIONS[doctype];
    if (staticDefinition) return staticDefinition;
    const meta = await this.metadata.getDocType(tenantId, doctype);
    if (!meta || meta.is_child) throw errors.validation(`Unsupported doctype: ${doctype}`);
    // List projection is deliberately limited to permlevel 0. Higher permlevels
    // are document-context permissions and cannot be projected safely across a
    // mixed owner/shared page with one SQL SELECT.
    const visible = actor && !isAdministrator(actor)
      ? { ...meta, fields: meta.fields.filter((field) => (field.permlevel ?? 0) === 0) }
      : meta;
    return metadataToListDefinition(visible);
  }
}

function isAdministrator(actor: Actor): boolean {
  return actor.user_id === "Administrator" || actor.roles.includes("Administrator") || actor.roles.includes("System Manager");
}
