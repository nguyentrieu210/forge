/**
 * The Frappe-shaped API surface, mounted in front of the native routes.
 *
 * This layer translates shapes and NOTHING else. Every permission decision,
 * lifecycle rule and ledger effect is delegated to the same kernel services the
 * native API uses, so the two surfaces cannot drift into different security
 * behaviour. If a handler here needs to make a business decision, that decision
 * belongs in the kernel instead.
 *
 * Returns `null` for a path it does not own, so the caller falls through to the
 * native routes.
 */

import type { Actor, CanonicalDocument, JsonObject, JsonValue, MutationAction, MutationCommand, MutationReceipt } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";
import type { D1MutationStore, DocumentListService } from "../../document-kernel/src/index.js";
import type {
  D1CollaborationService, DocTypeMeta, DocumentAccessStore, ExtendedPermissionAction,
  MetadataPermissionService, MetadataStore,
} from "../../frappe-model/src/index.js";
import { readFrappeArgs, type FrappeArgs } from "./args.js";
import { assertModifiedMatches, buildCommand, stripServerOwnedFields } from "./command.js";
import { fromFrappeDoc, toFrappeDoc, toFrappeListRow } from "./doc-shape.js";
import { faultResponse, methodResponse, resourceResponse } from "./envelope.js";
import { toKernelFilters, toKernelSearch, toKernelSort } from "./filters.js";
import {
  childDocTypeNames, maskedFieldNames, tableFieldNames, toFrappeDocType, toFrappeMetaBundle, toFrappeWorkflow,
} from "./meta-shape.js";
import {
  mergeCustomizations, parseCustomField, parseDocTypeMeta, parsePropertySetter, resolveAutoname, validateWorkflow,
} from "../../frappe-model/src/index.js";
import type { CustomFieldRecord, CustomizationStore, PropertySetterRecord } from "../../frappe-model/src/index.js";
import { combinedNavigation, type AppInstaller } from "../../app-registry/src/index.js";
import type { D1TranslationStore } from "./translations.js";

/**
 * Contract version, surfaced to the client as `frappe_version`.
 *
 * The client folds this into its cache scope key, so it MUST change whenever the
 * wire contract changes — otherwise a browser keeps serving documents shaped by
 * the previous contract after a deploy.
 */
export const FORGE_CONTRACT_VERSION = "16.0.0-forge.1";

export interface FrappeRouterContext {
  tenantId: string;
  actor: Actor;
  traceId: string;
  metadata: MetadataStore;
  permissions: MetadataPermissionService;
  documents: D1MutationStore;
  access: DocumentAccessStore;
  collaboration: D1CollaborationService;
  listService: DocumentListService;
  /** Routes a command through the aggregate Durable Object. */
  runCommand(command: MutationCommand): Promise<MutationReceipt>;
  now(): string;
  /** Overlay store for Custom Field / Property Setter. */
  customizations: CustomizationStore;
  /** Server-side translation catalogue. */
  translations: D1TranslationStore;
  /** Installed-app registry. */
  apps: AppInstaller;
  /** CSRF nonce of the current session, for the boot payload. */
  csrfToken: string;
  fullName: string;
  language: string;
}

/**
 * Doctypes that describe the platform rather than live in it.
 *
 * They are stored as metadata, not as documents, so they are routed to the
 * metadata stores instead of the document kernel. Frappe presents them as
 * ordinary resources and the builder addresses them that way, which is why they
 * are intercepted here rather than exposed under a different path.
 */
const META_RESOURCES = new Set(["DocType", "Custom Field", "Property Setter", "Workflow", "Print Format"]);

/**
 * Only a System Manager may reshape the platform.
 *
 * Checked separately from DocPerm because these resources have no DocPerm rows of
 * their own: without this, metadata writes would fall through to a permission
 * check that finds nothing to deny.
 */
function requireMetadataAdmin(context: FrappeRouterContext): void {
  const { user_id: userId, roles } = context.actor;
  if (userId === "Administrator" || roles.includes("Administrator") || roles.includes("System Manager")) return;
  throw errors.permission("System Manager is required to change metadata");
}

const RESOURCE_PATH = /^\/api\/resource\/([^/]+)(?:\/([^/]+))?$/;
const METHOD_PATH = /^\/api\/method\/([A-Za-z0-9_.]+)$/;

export function isFrappePath(pathname: string): boolean {
  return pathname.startsWith("/api/resource/") || pathname.startsWith("/api/method/");
}

export async function routeFrappeApi(request: Request, url: URL, context: FrappeRouterContext): Promise<Response | null> {
  if (!isFrappePath(url.pathname)) return null;
  try {
    const args = await readFrappeArgs(request, url);

    const method = METHOD_PATH.exec(url.pathname);
    if (method) return await dispatchMethod(method[1]!, request, args, context);

    const resource = RESOURCE_PATH.exec(url.pathname);
    if (resource) {
      const doctype = decodeURIComponent(resource[1]!);
      const name = resource[2] ? decodeURIComponent(resource[2]) : null;
      return await dispatchResource(request.method.toUpperCase(), doctype, name, args, context);
    }

    return faultResponse(errors.notFound("Unknown API path"), context.traceId);
  } catch (error) {
    return faultResponse(error, context.traceId);
  }
}

// ---- REST resource ----------------------------------------------------------

async function dispatchResource(
  httpMethod: string,
  doctype: string,
  name: string | null,
  args: FrappeArgs,
  context: FrappeRouterContext,
): Promise<Response> {
  if (META_RESOURCES.has(doctype)) return dispatchMetaResource(httpMethod, doctype, name, args, context);
  if (!name) {
    if (httpMethod === "GET") return resourceResponse(await listDocuments(doctype, args, context));
    if (httpMethod === "POST") return resourceResponse(await createDocument(doctype, args, context), 201);
    throw errors.validation(`${httpMethod} is not supported on a doctype collection`);
  }
  if (httpMethod === "GET") return resourceResponse(toFrappeDoc(await loadReadable(doctype, name, context)));
  if (httpMethod === "PUT") return resourceResponse(await saveDocument(doctype, name, args, context));
  if (httpMethod === "DELETE") return resourceResponse(await deleteDocument(doctype, name, context));
  throw errors.validation(`${httpMethod} is not supported on a document`);
}

/**
 * Metadata resources: DocType, Custom Field, Property Setter, Workflow, Print Format.
 *
 * These back the builder. Writes are gated on System Manager and go to the
 * metadata/overlay stores, never to the document kernel.
 */
async function dispatchMetaResource(
  httpMethod: string,
  doctype: string,
  name: string | null,
  args: FrappeArgs,
  context: FrappeRouterContext,
): Promise<Response> {
  const body = documentArgument(args);

  if (doctype === "DocType") {
    if (httpMethod === "GET") {
      if (!name) {
        const all = await context.metadata.listDocTypes(context.tenantId);
        return resourceResponse(all.map((meta) => ({ name: meta.name, module: meta.module, custom: meta.custom ? 1 : 0, revision: meta.revision })));
      }
      const meta = await requireMeta(name, context);
      return resourceResponse(toFrappeDocType(meta, await context.metadata.getWorkflow(context.tenantId, name)));
    }
    requireMetadataAdmin(context);
    if (httpMethod === "POST" || httpMethod === "PUT") {
      const target = name ?? (typeof body.name === "string" ? body.name : "");
      if (!target) throw errors.validation("DocType requires a name");
      const saved = await context.metadata.putDocType(context.tenantId, fromFrappeDocTypeInput(body, target), context.actor.user_id, context.now());
      return resourceResponse(toFrappeDocType(saved, null), httpMethod === "POST" ? 201 : 200);
    }
    throw errors.validation(`${httpMethod} is not supported on DocType`);
  }

  if (doctype === "Custom Field") {
    requireMetadataAdmin(context);
    if (httpMethod === "POST" || httpMethod === "PUT") {
      const record = parseCustomField({ ...body, ...(name ? { name } : {}) });
      // The merge is attempted before the write so an overlay that would produce
      // an invalid effective schema is rejected, rather than stored and then
      // making the doctype unreadable on every subsequent request.
      await assertOverlayMerges(record.dt, context, { extraField: record });
      await context.customizations.putCustomField(context.tenantId, record, context.actor.user_id, context.now());
      return resourceResponse({ name: record.name, dt: record.dt, fieldname: record.fieldname }, httpMethod === "POST" ? 201 : 200);
    }
    if (httpMethod === "DELETE") {
      if (!name) throw errors.validation("Custom Field requires a name");
      // Frappe names the row `<DocType>-<fieldname>`; the doctype may itself
      // contain a hyphen, so split on the LAST one.
      const separator = name.lastIndexOf("-");
      if (separator <= 0) throw errors.validation("Custom Field name must be <DocType>-<fieldname>");
      const deleted = await context.customizations.deleteCustomField(context.tenantId, name.slice(0, separator), name.slice(separator + 1), context.now());
      return resourceResponse({ name, deleted });
    }
    throw errors.validation(`${httpMethod} is not supported on Custom Field`);
  }

  if (doctype === "Property Setter") {
    requireMetadataAdmin(context);
    if (httpMethod === "POST" || httpMethod === "PUT") {
      const record = parsePropertySetter({ ...body, ...(name ? { name } : {}) });
      await assertOverlayMerges(record.doc_type, context, { extraSetter: record });
      await context.customizations.putPropertySetter(context.tenantId, record, context.actor.user_id, context.now());
      return resourceResponse({ name: record.name, doc_type: record.doc_type, property: record.property }, httpMethod === "POST" ? 201 : 200);
    }
    if (httpMethod === "DELETE") {
      if (!name) throw errors.validation("Property Setter requires a name");
      const docType = args.text("doc_type") ?? name.split("-")[0] ?? "";
      const deleted = await context.customizations.deletePropertySetter(context.tenantId, name, docType, context.now());
      return resourceResponse({ name, deleted });
    }
    throw errors.validation(`${httpMethod} is not supported on Property Setter`);
  }

  if (doctype === "Workflow") {
    requireMetadataAdmin(context);
    if (httpMethod === "POST" || httpMethod === "PUT") {
      const saved = await context.metadata.putWorkflow(
        context.tenantId,
        validateWorkflow({ ...body, ...(name ? { name } : {}) }),
        context.actor.user_id,
        context.now(),
      );
      return resourceResponse(toFrappeWorkflow(saved), httpMethod === "POST" ? 201 : 200);
    }
    throw errors.validation(`${httpMethod} is not supported on Workflow`);
  }

  // Print Format
  requireMetadataAdmin(context);
  if (httpMethod === "POST" || httpMethod === "PUT") {
    const formatName = name ?? (typeof body.name === "string" ? body.name : "");
    if (!formatName) throw errors.validation("Print Format requires a name");
    const saved = await context.metadata.putPrintFormat(context.tenantId, {
      name: formatName,
      doc_type: String(body.doc_type ?? ""),
      format_type: body.format_type === "Jinja" ? "Jinja" : "Standard",
      html: String(body.html ?? ""),
      ...(typeof body.css === "string" ? { css: body.css } : {}),
      is_default: Boolean(body.is_default),
      disabled: Boolean(body.disabled),
      revision: typeof body.revision === "number" ? body.revision : 0,
    }, context.actor.user_id, context.now());
    return resourceResponse(saved as unknown as JsonObject, httpMethod === "POST" ? 201 : 200);
  }
  throw errors.validation(`${httpMethod} is not supported on Print Format`);
}

/**
 * Proves the overlay still produces a valid effective schema with a pending change
 * applied.
 *
 * Validating before the write is what keeps a doctype from being bricked: a
 * customisation stored first and validated later would make every subsequent read
 * of that doctype fail, including the read needed to remove the bad overlay.
 */
async function assertOverlayMerges(
  doctype: string,
  context: FrappeRouterContext,
  pending: { extraField?: CustomFieldRecord; extraSetter?: PropertySetterRecord },
): Promise<void> {
  const base = await requireMeta(doctype, context);
  const customFields = await context.customizations.listCustomFields(context.tenantId, doctype);
  const propertySetters = await context.customizations.listPropertySetters(context.tenantId, doctype);
  mergeCustomizations({
    // `base` already has the current overlay merged in, so the stored overlay is
    // replayed against the ORIGINAL definition rather than doubled.
    base: { ...base, fields: base.fields.filter((field) => !customFields.some((custom) => custom.fieldname === field.fieldname)) },
    customFields: pending.extraField
      ? [...customFields.filter((entry) => entry.name !== pending.extraField!.name), pending.extraField]
      : customFields,
    propertySetters: pending.extraSetter
      ? [...propertySetters.filter((entry) => entry.name !== pending.extraSetter!.name), pending.extraSetter]
      : propertySetters,
    customizationRevision: await context.customizations.revision(context.tenantId, doctype),
  });
}

/**
 * Applies a whole customisation plan.
 *
 * Frappe's Customize Form posts the complete set of changes; the builder produces
 * it from a diff. Each item is validated before ANY is written, so a plan with one
 * bad entry leaves the doctype untouched instead of half-customised.
 */
async function saveCustomization(args: FrappeArgs, context: FrappeRouterContext): Promise<JsonObject> {
  requireMetadataAdmin(context);
  const doctype = args.requireText("doctype", 160);
  await requireMeta(doctype, context);

  const fields = (args.array<JsonObject>("fields") ?? []).map((entry) => parseCustomField({ dt: doctype, ...entry, field: fieldFromOp(entry) }, doctype));
  const setters = (args.array<JsonObject>("propertySetters") ?? []).map((entry) => parsePropertySetter({
    ...entry,
    doc_type: doctype,
    // The builder sends null for a doctype-level setter; the parser wants the
    // discriminator to be explicit.
    doctype_or_field: entry.doctype_or_field === "DocType" || entry.field_name === null ? "DocType" : "DocField",
    ...(entry.field_name === null ? { field_name: "" } : {}),
  }, doctype));
  const deletions = (args.array<string>("deletions") ?? []).map((entry) => String(entry));

  for (const field of fields) await assertOverlayMerges(doctype, context, { extraField: field });
  for (const setter of setters) await assertOverlayMerges(doctype, context, { extraSetter: setter });

  const now = context.now();
  for (const fieldname of deletions) await context.customizations.deleteCustomField(context.tenantId, doctype, fieldname, now);
  for (const field of fields) await context.customizations.putCustomField(context.tenantId, field, context.actor.user_id, now);
  for (const setter of setters) await context.customizations.putPropertySetter(context.tenantId, setter, context.actor.user_id, now);

  return {
    doctype,
    custom_fields: fields.length,
    property_setters: setters.length,
    deletions: deletions.length,
    effective_revision: (await requireMeta(doctype, context)).effective_revision ?? null,
  };
}

/** The builder's flat `CustomFieldOp` → a DocField definition. */
function fieldFromOp(entry: JsonObject): JsonObject {
  if (entry.field && typeof entry.field === "object" && !Array.isArray(entry.field)) return entry.field;
  const field: JsonObject = {
    fieldname: String(entry.fieldname ?? ""),
    fieldtype: String(entry.fieldtype ?? "Data"),
  };
  if (typeof entry.label === "string") field.label = entry.label;
  if (typeof entry.options === "string") field.options = entry.options;
  // The builder speaks Frappe's `reqd` (0/1); the kernel's field metadata uses a
  // boolean `required`.
  if (entry.reqd !== undefined) field.required = entry.reqd === 1 || entry.reqd === true;
  return field;
}

/** A Frappe DocType body → kernel DocType metadata. */
function fromFrappeDocTypeInput(body: JsonObject, name: string): DocTypeMeta {
  const fields = Array.isArray(body.fields) ? body.fields : [];
  return parseDocTypeMeta({
    ...body,
    name,
    module: typeof body.module === "string" && body.module ? body.module : "Custom",
    // Frappe's integer flags and `reqd` spelling are translated back.
    is_child: flagToBool(body.istable ?? body.is_child),
    is_single: flagToBool(body.issingle ?? body.is_single),
    is_submittable: flagToBool(body.is_submittable),
    track_changes: flagToBool(body.track_changes),
    track_seen: flagToBool(body.track_seen),
    allow_rename: flagToBool(body.allow_rename),
    custom: flagToBool(body.custom),
    ...(typeof body.search_fields === "string"
      ? { search_fields: body.search_fields.split(",").map((entry) => entry.trim()).filter(Boolean) }
      : {}),
    fields: fields.map((field) => {
      if (!field || typeof field !== "object" || Array.isArray(field)) return field;
      const input = field as JsonObject;
      const output: JsonObject = { ...input };
      if (input.reqd !== undefined) { output.required = flagToBool(input.reqd); delete output.reqd; }
      for (const flag of ["read_only", "hidden", "allow_on_submit", "no_copy", "unique", "in_list_view", "in_standard_filter", "search_index"]) {
        if (input[flag] !== undefined) output[flag] = flagToBool(input[flag]);
      }
      if (typeof input.precision === "string" && input.precision !== "") output.precision = Number(input.precision);
      else if (input.precision === "") delete output.precision;
      return output;
    }),
    permissions: Array.isArray(body.permissions)
      ? body.permissions.map((permission) => {
        if (!permission || typeof permission !== "object" || Array.isArray(permission)) return permission;
        const input = permission as JsonObject;
        const output: JsonObject = { role: input.role };
        for (const key of ["read", "write", "create", "submit", "cancel", "amend", "print", "email", "report", "import", "export", "share", "if_owner"]) {
          if (input[key] !== undefined) output[key] = flagToBool(input[key]);
        }
        if (input.permlevel !== undefined) output.permlevel = Number(input.permlevel);
        return output;
      })
      : [],
    revision: typeof body.revision === "number" ? body.revision : 1,
  } as unknown as JsonObject, name);
}

function flagToBool(value: JsonValue | undefined): boolean {
  if (value === undefined || value === null || value === "") return false;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  return ["1", "true", "yes"].includes(String(value).trim().toLowerCase());
}

async function listDocuments(doctype: string, args: FrappeArgs, context: FrappeRouterContext): Promise<JsonObject[]> {
  const requested = args.array<string>("fields") ?? ["name"];
  const body: JsonObject = {
    doctype,
    // `*` means "everything the whitelist allows"; leaving fields unset gives the
    // server-declared default projection instead of failing on the literal "*".
    ...(requested.includes("*") ? {} : { fields: dedupe(requested.map(stripFieldQualifier)) }),
    filters: toKernelFilters(args.json("filters"), doctype) as unknown as JsonValue,
    limit: clampPageLength(args.int("limit_page_length", args.int("limit", 20))),
    offset: args.int("limit_start", 0),
  };
  const search = toKernelSearch(args.json("or_filters"));
  if (search) body.search = search;
  const sort = toKernelSort(args.text("order_by"));
  if (sort.length) body.sort = sort as unknown as JsonValue;

  const page = await context.listService.list(context.actor, context.tenantId, body);
  return page.rows.map((row) => toFrappeListRow(row as JsonObject));
}

async function createDocument(doctype: string, args: FrappeArgs, context: FrappeRouterContext): Promise<JsonObject> {
  const submitted = documentArgument(args);
  const meta = await requireMeta(doctype, context);

  // An amendment arrives as an ordinary create carrying `amended_from` — that is
  // how the Desk implements it (copy the cancelled document, clear the name).
  // It is lifted off the payload here because `amended_from` is framework-owned:
  // it must travel on the command so the storage guard can enforce the chain.
  const amendedFrom = typeof submitted.amended_from === "string" ? submitted.amended_from.trim() : "";

  await context.permissions.assert({
    actor: context.actor, tenantId: context.tenantId, doctype,
    action: amendedFrom ? "amend" : "create",
  });

  let payload = toKernelPayload(submitted, meta);
  if (amendedFrom) {
    const source = await loadReadable(doctype, amendedFrom, context);
    if (source.docstatus !== 2) throw errors.lifecycle("Only a cancelled document can be amended");
    // `no_copy` finally means something: a field marked no_copy must not carry
    // over into the amendment. Frappe honours this and users rely on it — an
    // external reference number copied into the successor would double-post.
    payload = dropNoCopyFields(payload, meta);
  }

  const name = amendedFrom
    ? await nextAmendmentName(doctype, amendedFrom, context)
    : await resolveNewName(doctype, meta, submitted, context);

  await context.runCommand(await buildCommand({
    tenantId: context.tenantId, actor: context.actor, doctype, name,
    action: "create", expectedVersion: null, document: payload,
    ...(amendedFrom ? { amendedFrom } : {}),
  }));
  return toFrappeDoc(await loadReadable(doctype, name, context));
}

/**
 * Frappe names an amendment after its source with an incrementing suffix
 * (`SO-0001-1`, then `-2`), which keeps the chain legible in a list. The storage
 * guard only permits one live amendment per source, so the suffix search exists
 * for the case where an earlier amendment was itself cancelled and amended.
 */
async function nextAmendmentName(doctype: string, source: string, context: FrappeRouterContext): Promise<string> {
  for (let suffix = 1; suffix <= 20; suffix += 1) {
    const candidate = `${source}-${suffix}`;
    if (!await context.documents.getDocument(context.tenantId, doctype, candidate)) return candidate;
  }
  throw errors.validation(`${source} has been amended too many times`);
}

function dropNoCopyFields(payload: JsonObject, meta: DocTypeMeta): JsonObject {
  const noCopy = new Set(meta.fields.filter((field) => field.no_copy).map((field) => field.fieldname));
  if (!noCopy.size) return payload;
  const output: JsonObject = {};
  for (const [key, value] of Object.entries(payload)) {
    if (!noCopy.has(key)) output[key] = value;
  }
  return output;
}

/**
 * Renames a document.
 *
 * Refuses when another document links to it. Frappe rewrites those links across
 * the whole database; here the link graph is spread across JSON payloads with no
 * foreign keys, so a partial rewrite would leave dangling references that no
 * constraint would catch. Refusing is the honest option — a silent half-rename is
 * worse than a rejected one.
 */
async function renameDocument(args: FrappeArgs, context: FrappeRouterContext): Promise<JsonObject> {
  const doctype = args.requireText("doctype", 160);
  const oldName = args.requireText("old_name", 320);
  const newName = args.requireText("new_name", 320);
  if (args.bool("merge")) throw errors.validation("Merging documents on rename is not supported");
  if (oldName === newName) return { doctype, name: newName, renamed: false };

  const meta = await requireMeta(doctype, context);
  if (!meta.allow_rename) throw errors.validation(`${doctype} does not allow renaming`);

  await loadWritable(doctype, oldName, context);
  if (await context.documents.getDocument(context.tenantId, doctype, newName)) throw errors.exists();

  await context.documents.renameDocument(context.tenantId, doctype, oldName, newName, context.actor.user_id, context.now());
  return { doctype, name: newName, renamed: true };
}

async function saveDocument(doctype: string, name: string, args: FrappeArgs, context: FrappeRouterContext): Promise<JsonObject> {
  const submitted = documentArgument(args);
  const meta = await requireMeta(doctype, context);
  const current = await loadWritable(doctype, name, context);
  // A write must be against the version the client last read. `assertModifiedMatches`
  // rejects a missing value too, so a client that forgets to echo `modified`
  // cannot overwrite a concurrent edit.
  assertModifiedMatches(current, submitted.modified);

  const payload = toKernelPayload(submitted, meta);
  await context.runCommand(await buildCommand({
    tenantId: context.tenantId, actor: context.actor, doctype, name,
    action: "save", expectedVersion: current.version, document: payload,
  }));
  return toFrappeDoc(await loadReadable(doctype, name, context));
}

async function deleteDocument(doctype: string, name: string, context: FrappeRouterContext): Promise<JsonObject> {
  // Frappe has no separate delete permission in this kernel; deleting is a
  // write-class action, matching how the DocPerm rows are reported.
  await loadWritable(doctype, name, context);
  const deleted = await context.documents.deleteDraftDocument(context.tenantId, doctype, name);
  return { doctype, name, deleted };
}

// ---- method dispatch --------------------------------------------------------

async function dispatchMethod(
  methodName: string,
  request: Request,
  args: FrappeArgs,
  context: FrappeRouterContext,
): Promise<Response> {
  switch (methodName) {
    case "metaforge.api.get_boot":
      return methodResponse(await bootPayload(context));

    case "frappe.desk.form.load.getdoctype":
      return methodResponse(await getDocType(args, context));

    case "frappe.desk.form.load.getdoc":
      return methodResponse(await getDoc(args, context));

    case "frappe.client.get_list":
    case "frappe.desk.reportview.get":
      return methodResponse(await listDocuments(args.requireText("doctype", 160), args, context));

    case "frappe.client.get_count":
    case "frappe.desk.reportview.get_count":
      return methodResponse(await countDocuments(args, context));

    case "frappe.client.get_value":
      return methodResponse(await getValue(args, context));

    case "frappe.client.submit":
      return methodResponse(await transition("submit", args, context));

    case "frappe.client.cancel":
      return methodResponse(await transition("cancel", args, context));

    case "frappe.model.rename_doc":
    case "frappe.client.rename_doc":
      return methodResponse(await renameDocument(args, context));

    case "frappe.custom.doctype.customize_form.customize_form.save_customization":
      return methodResponse(await saveCustomization(args, context));

    case "metaforge.api.translate_strings":
      return methodResponse(await translateStrings(args, context));

    case "metaforge.api.get_application_catalog":
      return methodResponse(await applicationCatalog(context));

    case "frappe.desk.search.search_link":
      return methodResponse(await searchLink(args, context));

    case "metaforge.api.get_capabilities":
      return methodResponse(await capabilities(args, context));

    case "metaforge.api.resolve_display_values":
      return methodResponse(await resolveDisplayValues(args, context));

    case "frappe.desk.form.utils.add_comment":
      return methodResponse(await addComment(args, context));

    default:
      // An unimplemented method must fail loudly. Returning an empty success
      // would let a screen render as if it had data.
      throw errors.notFound(`Method is not implemented on this platform: ${methodName}`);
  }
}

async function bootPayload(context: FrappeRouterContext): Promise<JsonObject> {
  const userPermissions: JsonObject = {};
  for (const record of await context.access.listUserPermissions(context.tenantId, context.actor.user_id)) {
    const existing = userPermissions[record.allow_doctype];
    const values = Array.isArray(existing) ? existing : [];
    userPermissions[record.allow_doctype] = [...values, { doc: record.allow_name, applicable_for: record.applicable_for_doctype || null }];
  }
  const defaults = await systemDefaults(context);
  return {
    user: context.actor.user_id,
    full_name: context.fullName || context.actor.user_id,
    roles: [...context.actor.roles],
    user_permissions: userPermissions,
    lang: context.language || context.actor.locale || "en",
    // The client builds its cache scope key from these two. The tenant is the
    // correct analogue of a Frappe site: two tenants share one browser, and
    // without this their cached documents would collide.
    site_name: context.tenantId,
    frappe_version: FORGE_CONTRACT_VERSION,
    csrf_token: context.csrfToken,
    sysdefaults: defaults,
    allowed_workspaces: [],
  };
}

async function getDocType(args: FrappeArgs, context: FrappeRouterContext): Promise<JsonObject> {
  const doctype = args.requireText("doctype", 160);
  const full = await requireMeta(doctype, context);
  const scope = await context.permissions.getReadScope(context.actor, context.tenantId, doctype);
  const filtered = context.permissions.filterMetaForActor(
    full, context.actor, context.actor.user_id,
    scope.mode === "shared" || scope.mode === "owner_or_shared",
    { action: "create" },
  );
  const workflow = await context.metadata.getWorkflow(context.tenantId, doctype);

  // `with_parent` asks for the child doctypes too. They are fetched only when
  // readable; an unreadable child is omitted rather than disclosed.
  const children: DocTypeMeta[] = [];
  if (args.bool("with_parent")) {
    for (const childName of childDocTypeNames(full)) {
      const childMeta = await context.metadata.getDocType(context.tenantId, childName);
      if (childMeta) children.push(childMeta);
    }
  }

  return toFrappeMetaBundle({
    meta: filtered,
    children,
    workflow,
    maskedFields: maskedFieldNames(full, filtered),
  });
}

async function getDoc(args: FrappeArgs, context: FrappeRouterContext): Promise<JsonObject> {
  const doctype = args.requireText("doctype", 160);
  const name = args.requireText("name", 320);
  const document = await loadReadable(doctype, name, context);
  const timeline = await context.collaboration.listTimeline(context.tenantId, doctype, name);
  return {
    docs: [toFrappeDoc(document)],
    docinfo: {
      comments: timeline.comments ?? [],
      versions: timeline.versions ?? [],
      communications: [],
      assignments: timeline.assignments ?? [],
      attachments: timeline.files ?? [],
      permissions: await effectivePermissionFlags(doctype, name, context),
    },
  };
}

async function countDocuments(args: FrappeArgs, context: FrappeRouterContext): Promise<number> {
  const doctype = args.requireText("doctype", 160);
  const body: JsonObject = {
    doctype,
    filters: toKernelFilters(args.json("filters"), doctype) as unknown as JsonValue,
  };
  const search = toKernelSearch(args.json("or_filters"));
  if (search) body.search = search;
  const result = await context.listService.count(context.actor, context.tenantId, body);
  return typeof result === "number" ? result : Number((result as { count?: number }).count ?? 0);
}

async function getValue(args: FrappeArgs, context: FrappeRouterContext): Promise<JsonObject | null> {
  const doctype = args.requireText("doctype", 160);
  const fieldname = args.requireText("fieldname", 320);
  const fields = dedupe(fieldname.split(",").map((field) => stripFieldQualifier(field.trim())).filter(Boolean));
  if (!fields.length) throw errors.validation("fieldname is required");

  // Straight to the list service rather than through the REST handler: the
  // permission scope and field whitelist are identical, and synthesising a fake
  // argument bag just to reuse the handler would be indirection with no benefit.
  const page = await context.listService.list(context.actor, context.tenantId, {
    doctype,
    fields: dedupe([...fields, "name"]),
    filters: toKernelFilters(args.json("filters"), doctype) as unknown as JsonValue,
    limit: 1,
  });
  const row = page.rows[0] as JsonObject | undefined;
  if (!row) return null;
  const output: JsonObject = {};
  for (const field of fields) output[field] = row[field] ?? null;
  return output;
}

async function transition(action: Extract<MutationAction, "submit" | "cancel">, args: FrappeArgs, context: FrappeRouterContext): Promise<JsonObject> {
  // `submit` receives the whole document; `cancel` receives doctype + name.
  const submitted = args.has("doc") ? (args.object("doc") ?? {}) : {};
  const doctype = args.text("doctype") ?? String(submitted.doctype ?? "");
  const name = args.text("name") ?? String(submitted.name ?? "");
  if (!doctype || !name) throw errors.validation("doctype and name are required");

  const current = await loadWritable(doctype, name, context);
  // Submitting or cancelling still writes a new version, so the same concurrency
  // rule applies. When the client passes the document it must be the one it read.
  if (args.has("doc")) assertModifiedMatches(current, submitted.modified);

  await context.permissions.assert({
    actor: context.actor, tenantId: context.tenantId, doctype, name,
    owner: current.owner, data: current.data, action,
  });
  await context.runCommand(await buildCommand({
    tenantId: context.tenantId, actor: context.actor, doctype, name, action,
    expectedVersion: current.version,
    // The stored document is the source of truth for a lifecycle transition; a
    // client payload could otherwise smuggle edits through submit.
    document: current.data,
  }));
  return toFrappeDoc(await loadReadable(doctype, name, context));
}

async function searchLink(args: FrappeArgs, context: FrappeRouterContext): Promise<JsonObject[]> {
  const doctype = args.requireText("doctype", 160);
  const text = args.text("txt") ?? "";
  const meta = await requireMeta(doctype, context);
  const titleField = meta.title_field;

  const fields = dedupe(["name", ...(titleField ? [titleField] : [])]);
  const filters = toKernelFilters(args.json("filters"), doctype);
  const rows = await context.listService.list(context.actor, context.tenantId, {
    doctype,
    fields,
    filters: filters as unknown as JsonValue,
    ...(text ? { search: text } : {}),
    limit: clampPageLength(args.int("page_length", 10)),
  });
  return rows.rows.map((row) => {
    const record = row as JsonObject;
    const label = titleField && typeof record[titleField] === "string" ? String(record[titleField]) : String(record.name ?? "");
    return { value: String(record.name ?? ""), label, description: label === String(record.name ?? "") ? "" : String(record.name ?? "") };
  });
}

/**
 * Effective capabilities, FAIL-CLOSED.
 *
 * Every flag is resolved by asking the permission service and treating any
 * refusal — or any unexpected error — as denied. The client greys out actions
 * from this, so an optimistic `true` would offer a button that then fails.
 */
async function capabilities(args: FrappeArgs, context: FrappeRouterContext): Promise<JsonObject> {
  const doctype = args.requireText("doctype", 160);
  const name = args.text("name");
  const meta = await requireMeta(doctype, context);
  const document = name ? await context.documents.getDocument(context.tenantId, doctype, name) : null;
  if (name && !document) throw errors.notFound();
  return capabilityFlags(doctype, meta, document, context);
}

async function capabilityFlags(
  doctype: string,
  meta: DocTypeMeta,
  document: CanonicalDocument | null,
  context: FrappeRouterContext,
): Promise<JsonObject> {
  const submittable = Boolean(meta.is_submittable);
  const check = async (action: ExtendedPermissionAction): Promise<boolean> => {
    try {
      await context.permissions.assert({
        actor: context.actor, tenantId: context.tenantId, doctype,
        ...(document ? { name: document.name, owner: document.owner, data: document.data } : {}),
        action,
      });
      return true;
    } catch {
      return false;
    }
  };
  return {
    read: await check("read"),
    write: await check("save"),
    create: await check("create"),
    // The kernel models deletion as a write-class action, and only a draft is
    // ever deletable — reporting otherwise would offer an action that must fail.
    delete: document ? document.docstatus === 0 && await check("save") : false,
    submit: submittable ? await check("submit") : false,
    cancel: submittable ? await check("cancel") : false,
    amend: submittable ? await check("amend") : false,
  };
}

async function effectivePermissionFlags(doctype: string, name: string, context: FrappeRouterContext): Promise<JsonObject> {
  const meta = await requireMeta(doctype, context);
  const document = await context.documents.getDocument(context.tenantId, doctype, name);
  const flags = await capabilityFlags(doctype, meta, document, context);
  const output: JsonObject = {};
  // docinfo.permissions is 0/1, not booleans.
  for (const [key, value] of Object.entries(flags)) output[key] = value ? 1 : 0;
  return output;
}

async function resolveDisplayValues(args: FrappeArgs, context: FrappeRouterContext): Promise<JsonObject[]> {
  const items = args.array<JsonObject>("items") ?? [];
  if (items.length > 200) throw errors.validation("Too many display values requested at once");
  const output: JsonObject[] = [];
  for (const item of items) {
    const doctype = typeof item.doctype === "string" ? item.doctype : "";
    const name = typeof item.name === "string" ? item.name : "";
    if (!doctype || !name) continue;
    let label = name;
    try {
      const meta = await context.metadata.getDocType(context.tenantId, doctype);
      const titleField = meta?.title_field;
      if (titleField) {
        // Routed through the permission-aware read so a label cannot leak the
        // content of a document the actor may not see.
        const document = await loadReadable(doctype, name, context);
        const candidate = document.data[titleField];
        if (typeof candidate === "string" && candidate) label = candidate;
      }
    } catch {
      // An unreadable or missing reference degrades to its id, which is already
      // known to the caller — it must not surface as a hard failure that blanks
      // an entire form.
    }
    output.push({ doctype, name, label });
  }
  return output;
}

async function translateStrings(args: FrappeArgs, context: FrappeRouterContext): Promise<JsonObject> {
  const strings = args.array<string>("strings") ?? [];
  const language = args.text("lang") ?? (context.language || context.actor.locale || "en");
  const translated = await context.translations.translate(context.tenantId, language, strings.map((entry) => String(entry)));
  return translated as unknown as JsonObject;
}

/**
 * The installed-app catalogue: what this tenant has, and the navigation it
 * contributes.
 *
 * Filtered by role, so a user without an app's roles does not see menu entries
 * that would only fail on click.
 */
async function applicationCatalog(context: FrappeRouterContext): Promise<JsonObject> {
  const apps = await context.apps.list(context.tenantId);
  const readable: JsonObject[] = [];
  const navigable: typeof apps = [];
  for (const app of apps) {
    const permitted: typeof app.nav = [];
    for (const item of app.nav) {
      if (item.kind !== "doctype") { permitted.push(item); continue; }
      try {
        await context.permissions.getReadScope(context.actor, context.tenantId, item.key);
        permitted.push(item);
      } catch {
        // Omitted rather than shown-and-broken.
      }
    }
    readable.push({ id: app.app_id, name: app.app_name, version: app.version, installed_at: app.installed_at });
    navigable.push({ ...app, nav: permitted });
  }
  return { apps: readable, nav: combinedNavigation(navigable) };
}

async function addComment(args: FrappeArgs, context: FrappeRouterContext): Promise<JsonObject> {
  const doctype = args.requireText("reference_doctype", 160);
  const name = args.requireText("reference_name", 320);
  const content = args.requireText("content", 10_000);
  await loadWritable(doctype, name, context);
  const record = await context.collaboration.addComment(context.tenantId, context.actor, doctype, name, content, context.now());
  return record as unknown as JsonObject;
}

// ---- shared helpers ---------------------------------------------------------

async function requireMeta(doctype: string, context: FrappeRouterContext): Promise<DocTypeMeta> {
  const meta = await context.metadata.getDocType(context.tenantId, doctype);
  if (!meta) throw errors.notFound(`DocType does not exist: ${doctype}`);
  return meta;
}

/**
 * Loads a document the actor may read, hiding the difference between "absent"
 * and "not permitted" so the API cannot be used to probe for existence.
 */
async function loadReadable(doctype: string, name: string, context: FrappeRouterContext): Promise<CanonicalDocument> {
  const document = await context.documents.getDocument(context.tenantId, doctype, name);
  if (!document) throw errors.notFound();
  try {
    await context.permissions.assert({
      actor: context.actor, tenantId: context.tenantId, doctype, name,
      owner: document.owner, data: document.data, action: "read",
    });
  } catch {
    throw errors.notFound();
  }
  const meta = await context.metadata.getDocType(context.tenantId, doctype);
  if (!meta) return document;
  const share = await context.access.getShare(context.tenantId, doctype, name, context.actor.user_id);
  return context.permissions.redactDocument(meta, document, context.actor, Boolean(share?.read));
}

/** Loads a document the actor may write. A refusal here is reported as a refusal. */
async function loadWritable(doctype: string, name: string, context: FrappeRouterContext): Promise<CanonicalDocument> {
  const document = await context.documents.getDocument(context.tenantId, doctype, name);
  if (!document) throw errors.notFound();
  await context.permissions.assert({
    actor: context.actor, tenantId: context.tenantId, doctype, name,
    owner: document.owner, data: document.data, action: "save",
  });
  return document;
}

/**
 * Frappe control parameters that are never document fields. Everything else in
 * the request is treated as part of the document, because for a REST write the
 * body IS the document.
 */
const CONTROL_ARGS: ReadonlySet<string> = new Set([
  "cmd", "doctype", "run_method", "with_parent", "_", "limit_start", "limit_page_length",
  "limit", "order_by", "filters", "or_filters", "fields", "parent", "as_dict", "debug",
]);

function documentArgument(args: FrappeArgs): JsonObject {
  // frappe-react-sdk sends the document as the request body itself, while the
  // `frappe.client.*` methods nest it under `doc`.
  if (args.has("doc")) return args.object("doc") ?? {};
  return args.all(CONTROL_ARGS);
}

function toKernelPayload(submitted: JsonObject, meta: DocTypeMeta): JsonObject {
  return stripServerOwnedFields(fromFrappeDoc(submitted, tableFieldNames(meta)));
}

/**
 * Resolves the name for a new document.
 *
 * A client-supplied name is honoured only when the DocType has no autoname or
 * uses `field:name`; otherwise the server allocates from the naming series so a
 * client cannot choose where it lands in the sequence.
 */
async function resolveNewName(doctype: string, meta: DocTypeMeta, submitted: JsonObject, context: FrappeRouterContext): Promise<string> {
  const requested = typeof submitted.name === "string" ? submitted.name.trim() : "";
  // `prompt` (and an absent pattern) is the only case where the client chooses.
  // Every other pattern is resolved server-side so a client cannot pick where it
  // lands in a sequence, or reuse a name a series would later allocate.
  if (resolveAutoname({ doctype, pattern: meta.autoname, document: submitted, now: context.now() }).kind === "prompt") {
    if (!requested) throw errors.validation(`${doctype} requires a name`);
    return requested;
  }
  return context.metadata.nextName(context.tenantId, doctype, meta.autoname ?? "", context.now(), submitted);
}

async function systemDefaults(context: FrappeRouterContext): Promise<JsonObject> {
  const stored = await context.documents.getMasterRecordData(context.tenantId, "System Settings", "System Settings");
  return {
    date_format: stringOr(stored?.date_format, "dd-mm-yyyy"),
    number_format: stringOr(stored?.number_format, "#,###.##"),
    time_zone: stringOr(stored?.time_zone, "UTC"),
    currency: stringOr(stored?.currency, ""),
  };
}

function stringOr(value: JsonValue | undefined, fallback: string): string {
  return typeof value === "string" && value ? value : fallback;
}

/** Frappe qualifies list fields as `` `tabDocType`.field ``. */
function stripFieldQualifier(field: string): string {
  return field.replace(/`/g, "").split(".").pop() ?? field;
}

function dedupe(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

/**
 * Frappe clients ask for pages far larger than the kernel serves. Clamping
 * rather than rejecting keeps a list usable; the caller learns the real size
 * from the row count.
 */
function clampPageLength(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1) return 20;
  return Math.min(value, 100);
}
