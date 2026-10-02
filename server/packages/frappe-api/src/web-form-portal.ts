/** Owner-only portal operations; the form never replaces document permissions. */
import type { CanonicalDocument, JsonObject } from "../../contracts/src/index.js";
import { CloudForgeError, errors } from "../../core/src/index.js";
import type { FrappeArgs } from "./args.js";
import type { FrappeRouterContext } from "./router.js";
import { loadPublishedForm, type WebFormStore } from "./web-form-routes.js";
import { submissionDocument } from "./web-form-routes.js";
import { assertModifiedMatches, buildCommand } from "./command.js";
import { fromFrappeDoc, toFrappeDoc } from "./doc-shape.js";
import { tableFieldNames } from "./meta-shape.js";

export const WEB_FORM_READ = "/api/method/metaforge.api.web_form_get_document";
export const WEB_FORM_LIST = "/api/method/metaforge.api.web_form_list_documents";
export const WEB_FORM_UPDATE = "/api/method/metaforge.api.web_form_update_document";
export const WEB_FORM_DELETE = "/api/method/metaforge.api.web_form_delete_document";

function portalStore(context: FrappeRouterContext): WebFormStore {
  if (!context.actor.user_id || context.actor.user_id === "Guest") throw errors.authentication();
  if (!context.webForms) throw errors.notFound();
  return { db: context.webForms.db, tenantId: context.tenantId, now: context.now(), salt: context.webForms.salt };
}

async function ownedDocument(doctype: string, name: string, context: FrappeRouterContext): Promise<CanonicalDocument> {
  const current = await context.documents.getDocument(context.tenantId, doctype, name);
  // Even administrators cannot use this surface to enumerate another owner's records.
  if (!current || current.owner !== context.actor.user_id) throw errors.notFound();
  return current;
}

async function requireMeta(doctype: string, context: FrappeRouterContext) {
  const meta = await context.metadata.getDocType(context.tenantId, doctype);
  if (!meta) throw errors.notFound();
  return meta;
}

async function portalReadable(doctype: string, name: string, context: FrappeRouterContext): Promise<CanonicalDocument> {
  const current = await ownedDocument(doctype, name, context);
  try {
    await context.permissions.assert({ actor: context.actor, tenantId: context.tenantId,
      doctype, name, owner: current.owner, data: current.data, action: "read" });
  } catch (error) {
    if (!(error instanceof CloudForgeError) || error.status !== 403) throw error;
    throw errors.notFound();
  }
  const meta = await requireMeta(doctype, context);
  return context.permissions.redactDocumentWithPolicies(context.tenantId, meta, current, context.actor, false);
}

function formDocument(document: CanonicalDocument, fields: readonly string[]): JsonObject {
  const wire = toFrappeDoc(document);
  const output: JsonObject = { name: wire.name, modified: wire.modified };
  for (const field of fields) if (wire[field] !== undefined) output[field] = wire[field];
  return output;
}

export async function webFormPortalRead(args: FrappeArgs, context: FrappeRouterContext): Promise<JsonObject> {
  const form = await loadPublishedForm(portalStore(context), args.requireText("route", 200));
  const name = args.requireText("name", 240);
  await ownedDocument(form.doc_type, name, context);
  const readable = await portalReadable(form.doc_type, name, context);
  return formDocument(readable, form.fields);
}

export async function webFormPortalList(args: FrappeArgs, context: FrappeRouterContext): Promise<JsonObject> {
  const form = await loadPublishedForm(portalStore(context), args.requireText("route", 200));
  if (!form.show_list) throw errors.permission("This form does not allow listing");
  const limit = args.int("limit_page_length", 20);
  const offset = args.int("limit_start", 0);
  if (limit < 1 || limit > 100 || offset < 0 || offset > 10_000) throw errors.validation("Invalid portal page bounds");
  // Request inputs never control the doctype, owner filter, fields, or sort.
  const page = await context.listService.list(context.actor, context.tenantId, {
    doctype: form.doc_type, fields: ["name"],
    filters: [{ field: "owner", operator: "eq", value: context.actor.user_id }],
    sort: [{ field: "name", direction: "asc" }], limit, offset,
  });
  const rows: JsonObject[] = [];
  for (const row of page.rows) {
    if (typeof row.name !== "string") continue;
    // Recheck ownership and current per-record permissions, then redact before projection.
    // A concurrent owner change or permission revocation fails closed for that row.
    try {
      await ownedDocument(form.doc_type, row.name, context);
      rows.push(formDocument(await portalReadable(form.doc_type, row.name, context), form.fields));
    } catch (error) {
      if (!(error instanceof CloudForgeError) || error.status !== 404) throw error;
    }
  }
  return { rows, limit_start: offset, limit_page_length: limit };
}

export async function webFormPortalUpdate(args: FrappeArgs, context: FrappeRouterContext): Promise<JsonObject> {
  const form = await loadPublishedForm(portalStore(context), args.requireText("route", 200));
  if (!form.allow_edit) throw errors.permission("This form does not allow editing");
  const name = args.requireText("name", 240);
  const current = await ownedDocument(form.doc_type, name, context);
  await portalReadable(form.doc_type, name, context);
  await context.permissions.assert({ actor: context.actor, tenantId: context.tenantId,
    doctype: form.doc_type, name, owner: current.owner, data: current.data, action: "save" });
  assertModifiedMatches(current, args.get("modified"));
  const meta = await requireMeta(form.doc_type, context);
  const submitted = submissionDocument(form, meta, args.object("data") ?? {});
  const patch = fromFrappeDoc(submitted, tableFieldNames(meta));
  // Preserve fields and children omitted by the form. Kernel still validates the complete save.
  const document = fromFrappeDoc(toFrappeDoc(current), tableFieldNames(meta));
  if (!meta.fields.some((field) => field.fieldname === "status")) delete document.status;
  Object.assign(document, patch);
  await context.runCommand(await buildCommand({ tenantId: context.tenantId, actor: context.actor,
    doctype: form.doc_type, name, action: "save", expectedVersion: current.version, document }));
  return formDocument(await portalReadable(form.doc_type, name, context), form.fields);
}

export async function webFormPortalDelete(args: FrappeArgs, context: FrappeRouterContext): Promise<JsonObject> {
  const form = await loadPublishedForm(portalStore(context), args.requireText("route", 200));
  if (!form.allow_delete) throw errors.permission("This form does not allow deletion");
  const current = await ownedDocument(form.doc_type, args.requireText("name", 240), context);
  await context.permissions.assert({ actor: context.actor, tenantId: context.tenantId,
    doctype: form.doc_type, name: current.name, owner: current.owner, data: current.data, action: "delete" });
  // The existing delete store lacks atomic expected-version/idempotency support. Do not
  // replace that with a racy preflight check followed by an unguarded destructive write.
  throw new CloudForgeError("NOT_IMPLEMENTED", "Portal deletion requires a versioned kernel delete command", 501);
}
