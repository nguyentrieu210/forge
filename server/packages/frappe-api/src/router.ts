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
import type { D1MutationStore, DocumentListService, ListFilter } from "../../document-kernel/src/index.js";
import type {
  D1CollaborationService, DocTypeMeta, DocumentAccessStore, ExtendedPermissionAction,
  MetadataPermissionService, MetadataStore,
} from "../../frappe-model/src/index.js";
import { readFrappeArgs, type FrappeArgs } from "./args.js";
import { assertModifiedMatches, buildCommand, stripServerOwnedFields } from "./command.js";
import { fromFrappeDoc, toFrappeDoc, toFrappeListRow } from "./doc-shape.js";
import { faultResponse, methodResponse, resourceResponse, responseFieldsResponse } from "./envelope.js";
import { consumeSubmissionAllowance, loadPublishedForm, publicFormShape, submissionActor, submissionDocument } from "./web-form-routes.js";
import { handleUploadFile, matchFilePath, readFileContent, serveFile, UPLOAD_FILE_PATH, type FileStore } from "./files.js";
import {
  assertStorefrontSpec, buildStorefrontOrder, consumeOrderAllowance, storefrontCatalog,
  storefrontProduct, trackStorefrontOrder, type StorefrontContext,
} from "./storefront.js";
import { toKernelField, toKernelFilters, toKernelSearch, toKernelSort } from "./filters.js";
import {
  childDocTypeNames, maskedFieldNames, tableFieldNames, toFrappeDocType, toFrappeMetaBundle, toFrappeWorkflow,
} from "./meta-shape.js";
import {
  blocksSelfApproval, mergeCustomizations, parseCsvImport, parseCustomField, parseDocTypeMeta,
  parsePropertySetter, renderPrintFormat, resolveAutoname, validateWorkflow,
} from "../../frappe-model/src/index.js";
import type { CustomFieldRecord, CustomizationStore, D1SearchStore, PropertySetterRecord } from "../../frappe-model/src/index.js";
import type { D1UserStore } from "../../auth/src/index.js";
import { parseQueryRequest, type AppReportService, type AppReportSpec, type D1ReportService, type QueryFilter } from "../../query/src/index.js";
import { hashPassword, verifyPassword } from "./password.js";
import {
  appMethodTarget, combinedNavigation, dispatchAppMethod, navItemPath,
  type AppInstaller, type AppMethodEnv,
} from "../../app-registry/src/index.js";
import type { D1TranslationStore } from "./translations.js";
import { assertKanbanField, type D1DeskViewStore } from "./desk-views.js";

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
  /** User directory, for roles, password changes and session revocation. */
  users: D1UserStore;
  /** Global-search candidate index. Never an authorisation decision. */
  search: D1SearchStore;
  /** Server-defined report engine. */
  reports: D1ReportService;
  /**
   * The same engine for reports an APP declares.
   *
   * A second service rather than a case inside the first: the platform's reports read
   * purpose-built SQL views and an app's read `documents`. Folding both into one compiler
   * would mean a single function deciding, per report, which of two entirely different
   * access paths applies — and getting that wrong reads another app's rows.
   */
  appReports: AppReportService;
  /** Kanban boards and the notification log — per-user Desk state. */
  deskViews: D1DeskViewStore;
  /** CSRF nonce of the current session, for the boot payload. */
  csrfToken: string;
  fullName: string;
  language: string;
  /**
   * Bindings needed to call an app's own Worker in the dispatch namespace.
   *
   * Optional: a deployment without a dispatch namespace simply has no app methods, and
   * an unknown method stays a 404 rather than becoming a confusing binding error.
   */
  appMethods?: AppMethodEnv;
  /**
   * What public web forms need: the database, a per-deployment salt for the visitor
   * counter, and the caller's address.
   *
   * Optional — absent, the web-form methods answer 404 like any other method this
   * deployment does not serve, rather than failing obscurely.
   */
  webForms?: { db: D1Database; salt: string; clientAddress: string };
  /**
   * Where attachments live: the database row and the object store.
   *
   * Optional, and the reason is a deployment that has no bucket bound. Absent, uploads
   * answer 404 like any unserved method — as opposed to the previous behaviour, where
   * the Desk's attach button called a method nobody answered and simply did nothing.
   */
  files?: { db: D1Database; bucket: R2Bucket };
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
    // BEFORE `readFrappeArgs`, which turns the body into text: an upload is multipart,
    // and reading it as text either fails outright or produces a mangled string.
    if (url.pathname === UPLOAD_FILE_PATH) {
      if (request.method.toUpperCase() !== "POST") throw errors.validation("upload_file accepts POST");
      return methodResponse(await handleUploadFile(
        request,
        context.actor,
        fileStore(context),
        // Attaching to a document is a WRITE to that document, so it is authorised as
        // one. Anything weaker would let a user attach — and therefore publish, if the
        // file is public — against a record they may only read.
        (doctype, name) => assertDocumentAction(context, doctype, name, "save"),
      ));
    }

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

  // A Single DocType holds exactly one document, named after the doctype itself.
  // Both `/api/resource/X` and `/api/resource/X/X` address it, which is how the
  // client reaches a Settings page.
  const singleMeta = await context.metadata.getDocType(context.tenantId, doctype);
  if (singleMeta?.is_single) return dispatchSingle(httpMethod, singleMeta, args, context);

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
  if (typeof entry.form_width === "string") field.form_width = entry.form_width;
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

/**
 * Installs or upgrades an app.
 *
 * Reshaping a tenant's schema is the most consequential thing this API can do, so
 * it requires System Manager — the same bar as editing a DocType, which installing
 * an app does wholesale.
 *
 * Namespaced `forge.*` rather than `frappe.*`: Frappe installs apps with a CLI
 * against the filesystem, so there is no endpoint to imitate, and pretending
 * otherwise would invite a Frappe client to call something that means
 * something else here.
 */
async function installApp(args: FrappeArgs, context: FrappeRouterContext): Promise<JsonObject> {
  requireMetadataAdmin(context);
  const manifest = args.object("app") ?? args.object("manifest");
  if (!manifest) throw errors.validation("app package is required");
  return await context.apps.install(context.tenantId, manifest, context.actor.user_id, context.now()) as unknown as JsonObject;
}

async function uninstallApp(args: FrappeArgs, context: FrappeRouterContext): Promise<JsonObject> {
  requireMetadataAdmin(context);
  const appId = args.requireText("app_id", 64);
  return await context.apps.uninstall(context.tenantId, appId, context.now()) as unknown as JsonObject;
}

/**
 * Single DocTypes — the Settings-page pattern.
 *
 * `is_single` was previously validated and stored but read by nothing, so a
 * doctype declared Single behaved as an ordinary list. Here the one document is
 * named after the doctype, so there is exactly one and its name is predictable.
 *
 * A read before the document exists returns an EMPTY SHELL rather than 404: a
 * Settings page that has never been saved must render its form so the user can
 * fill it in, not an error telling them the settings do not exist.
 */
async function dispatchSingle(
  httpMethod: string,
  meta: DocTypeMeta,
  args: FrappeArgs,
  context: FrappeRouterContext,
): Promise<Response> {
  const doctype = meta.name;
  const name = doctype;

  if (httpMethod === "GET") {
    await context.permissions.getReadScope(context.actor, context.tenantId, doctype);
    const existing = await context.documents.getDocument(context.tenantId, doctype, name);
    if (!existing) return resourceResponse(emptySingleDocument(meta));
    return resourceResponse(toFrappeDoc(await loadReadable(doctype, name, context)));
  }

  if (httpMethod === "PUT" || httpMethod === "POST") {
    const submitted = documentArgument(args);
    const current = await context.documents.getDocument(context.tenantId, doctype, name);
    const payload = toKernelPayload(submitted, meta);

    if (!current) {
      await context.permissions.assert({ actor: context.actor, tenantId: context.tenantId, doctype, action: "create" });
      await context.runCommand(await buildCommand({
        tenantId: context.tenantId, actor: context.actor, doctype, name,
        action: "create", expectedVersion: null, document: payload,
      }));
    } else {
      await context.permissions.assert({
        actor: context.actor, tenantId: context.tenantId, doctype, name,
        owner: current.owner, data: current.data, action: "save",
      });
      // The concurrency rule still applies: two admins on one Settings page must
      // not silently overwrite each other.
      assertModifiedMatches(current, submitted.modified);
      await context.runCommand(await buildCommand({
        tenantId: context.tenantId, actor: context.actor, doctype, name,
        action: "save", expectedVersion: current.version, document: payload,
      }));
    }
    return resourceResponse(toFrappeDoc(await loadReadable(doctype, name, context)));
  }

  // Deleting a Single would leave the doctype with no document at all, and the next
  // read would silently start from defaults — losing configuration without saying so.
  throw errors.validation(`${httpMethod} is not supported on a single doctype`);
}

/** The unsaved form of a Single: field defaults only, no framework identity yet. */
function emptySingleDocument(meta: DocTypeMeta): JsonObject {
  const doc: JsonObject = {
    doctype: meta.name,
    name: meta.name,
    docstatus: 0,
    // Marked so the client treats it as unsaved rather than as a stored document
    // whose fields all happen to be blank.
    __islocal: 1,
    __unsaved: 1,
  };
  for (const field of meta.fields) {
    if (field.default !== undefined) doc[field.fieldname] = field.default;
  }
  return doc;
}

/**
 * Frappe field names in a projection → kernel columns.
 *
 * Filters and sort already went through `toKernelField`; the projection did not, so a
 * client asking for the framework timestamps got "Field is not allowed: modified" —
 * the kernel column is `modified_at`. The Desk asks for `modified` on EVERY list, so
 * this made the list view fail outright for every doctype.
 *
 * `modified` also needs a companion: it is not a stored column but a token packed
 * from `modified_at` AND `version` (see `toFrappeModified`), so both must be pulled
 * or `toFrappeListRow` cannot emit it. Silently omitting it is worse than an error —
 * the Desk's inline editing would then send an empty token and the server would
 * refuse every save as a stale write.
 */
function toKernelProjection(requested: string[]): string[] {
  const fields = new Set<string>();
  for (const raw of requested) {
    const field = toKernelField(stripFieldQualifier(raw));
    fields.add(field);
    if (field === "modified_at") fields.add("version");
  }
  return [...fields];
}

async function listDocuments(doctype: string, args: FrappeArgs, context: FrappeRouterContext): Promise<JsonObject[]> {
  const requested = args.array<string>("fields") ?? ["name"];
  const body: JsonObject = {
    doctype,
    // `*` means "everything the whitelist allows"; leaving fields unset gives the
    // server-declared default projection instead of failing on the literal "*".
    ...(requested.includes("*") ? {} : { fields: toKernelProjection(requested) }),
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

  const namingField = meta.autoname?.startsWith("field:") ? meta.autoname.slice("field:".length) : undefined;
  await context.documents.renameDocument(
    context.tenantId,
    doctype,
    oldName,
    newName,
    context.actor.user_id,
    context.now(),
    namingField,
  );
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
    // ---- public web forms ---------------------------------------------------
    // Reachable without a session. Everything they may do comes from the form's own
    // `submit_as_role` and the tenant's ordinary DocPerm grant for it.
    case "metaforge.api.get_web_form":
      return methodResponse(publicFormShape(
        await loadPublishedForm(webFormStore(context), args.requireText("route", 200)),
      ));

    case "frappe.website.doctype.web_form.web_form.accept":
      return methodResponse(await acceptWebForm(args, context));

    // ---- public storefront --------------------------------------------------
    // Also reachable without a session, and bounded the same way: what a visitor may
    // read is an explicit field list in the installed manifest, and what an order may
    // write comes from the role the manifest names.
    case "forge.storefront.catalog":
      return methodResponse(await storefrontCatalog(await storefrontContext(context), {
        ...(args.text("search") ? { search: args.text("search")! } : {}),
        ...(args.text("facet") ? { facet: args.text("facet")! } : {}),
        limit: args.int("limit", 24),
        offset: args.int("offset", 0),
      }));

    case "forge.storefront.product":
      return methodResponse(await storefrontProduct(await storefrontContext(context), args.requireText("slug", 200)));

    case "forge.storefront.place_order":
      return methodResponse(await placeStorefrontOrder(args, context));

    case "forge.storefront.track_order":
      return methodResponse(await trackStorefrontOrder(
        await storefrontContext(context),
        args.requireText("code", 200),
        args.requireText("phone", 40),
      ));

    case "metaforge.api.get_boot":
      return methodResponse(await bootPayload(context));

    // Both write onto `frappe.response` rather than returning, so their keys are
    // top-level with no `message` wrapper — see `responseFieldsResponse`.
    case "frappe.desk.form.load.getdoctype":
      return responseFieldsResponse(await getDocType(args, context));

    case "frappe.desk.form.load.getdoc":
      return responseFieldsResponse(await getDoc(args, context));

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

    case "metaforge.api.get_overview":
      return methodResponse(await overviewDashboard(args, context));

    // The generic client's boot: what to render, from what is installed. Without it
    // every app needs its own compiled bundle.
    case "metaforge.api.get_app_manifest":
      return methodResponse(await clientManifest(args, context));

    // ---- app registry -------------------------------------------------------
    case "forge.apps.list":
      return methodResponse({ apps: await context.apps.list(context.tenantId) });

    case "forge.apps.install":
      return methodResponse(await installApp(args, context));

    case "forge.apps.uninstall":
      return methodResponse(await uninstallApp(args, context));

    /**
     * Đọc lại nội dung một file đã tải lên — cho app Worker phải NHÌN vào nó.
     *
     * App gọi ngược qua `/_app/…`, và cổng rewrite thành `/api/…` một cách cố ý, để app
     * chỉ chạm được bề mặt API chứ không phải một đường bất kỳ trên tenant. Hệ quả là
     * `/files/<id>` nằm ngoài tầm với, nên app cầm `file_url` do ô đính kèm trả về mà
     * không có cách nào đọc thứ nó trỏ tới. OCR đúng là việc đó: người dùng đính kèm ảnh
     * bảng giá, app phải đọc được điểm ảnh.
     *
     * Quyền dùng ĐÚNG chốt của `/files/<id>`, gọi y hệt cách đó — file riêng tư được kiểm
     * lại theo chứng từ nó gắn vào, và danh tính là NGƯỜI gọi app, không phải app.
     */
    case "forge.files.content":
      return methodResponse(await readFileContent(
        args.text("file") ?? args.requireText("file_url", 400),
        context.actor,
        fileStore(context),
        (doctype, name) => assertDocumentAction(context, doctype, name, "read"),
      ));

    // ---- workflow ---------------------------------------------------------
    case "frappe.model.workflow.apply_workflow":
      return methodResponse(await applyWorkflow(args, context));

    case "metaforge.api.get_workflow_transitions":
      return methodResponse(await workflowTransitions(args, context));

    case "metaforge.api.workflow_action_with_comment":
      return methodResponse(await workflowActionWithComment(args, context));

    // ---- sharing and assignment -------------------------------------------
    case "frappe.share.get_users":
      return methodResponse(await listShares(args, context));

    case "frappe.share.add":
      return methodResponse(await addShare(args, context));

    case "frappe.share.remove":
      return methodResponse(await removeShare(args, context));

    case "frappe.desk.form.assign_to.add":
      return methodResponse(await addAssignment(args, context));

    case "frappe.desk.form.assign_to.remove":
      return methodResponse(await removeAssignment(args, context));

    // ---- tags --------------------------------------------------------------
    case "frappe.desk.doctype.tag.tag.add_tag":
      return methodResponse(await addTag(args, context));

    case "frappe.desk.doctype.tag.tag.remove_tag":
      return methodResponse(await removeTag(args, context));

    // ---- global search -----------------------------------------------------
    case "metaforge.api.global_search":
      return methodResponse(await globalSearch(args, context));

    // ---- users and permissions --------------------------------------------
    case "metaforge.api.get_access_profile":
      return methodResponse(await accessProfile(args, context));

    // ---- permission manager -------------------------------------------------
    // The Desk's permission screen. Every one of these was missing, so the screen
    // rendered blank on a 404 — a menu entry that led to nothing.
    case "frappe.core.page.permission_manager.permission_manager.get_roles_and_doctypes":
      return methodResponse(await permissionRolesAndDoctypes(context));

    case "frappe.core.page.permission_manager.permission_manager.get_permissions":
      return methodResponse(await permissionRules(args, context));

    case "frappe.core.page.permission_manager.permission_manager.add":
    case "frappe.core.page.permission_manager.permission_manager.update":
    case "frappe.core.page.permission_manager.permission_manager.remove":
    case "frappe.core.page.permission_manager.permission_manager.reset":
      /**
       * Editing a DocPerm here is refused ON PURPOSE, with the reason.
       *
       * On this platform a DocType's permissions come from the app package that
       * declares it. An edit made through this screen would live until the next
       * `forge.apps.install` and then vanish without trace — worse than not being
       * offered, because the operator would believe a policy is in force that the
       * next deploy silently reverts. Role ASSIGNMENT is tenant data and stays
       * editable through `metaforge.api.set_user_roles`.
       */
      throw errors.validation(
        "Quyền của DocType do gói app khai và cài đặt, không sửa trực tiếp ở đây — sửa trong brief rồi cài lại. Gán vai trò cho người dùng thì vẫn sửa được.",
      );

    case "metaforge.api.explain_permission":
      return methodResponse(await explainPermission(args, context));

    case "metaforge.api.add_user_permission":
      return methodResponse(await addUserPermission(args, context));

    case "metaforge.api.remove_user_permission":
      return methodResponse(await removeUserPermission(args, context));

    case "metaforge.api.set_user_roles":
      return methodResponse(await setUserRoles(args, context));

    // ---- người dùng: liệt kê, tạo tài khoản, khoá/mở --------------------------
    // Không có ba lời gọi này thì màn phân quyền không trả lời được "ai đăng nhập được
    // vào hệ thống", và không có đường nào tạo một tài khoản ngoài việc gọi API tay.
    case "metaforge.api.list_users":
      return methodResponse(await listUsers(context));

    case "metaforge.api.create_user":
      return methodResponse(await createUser(args, context));

    case "metaforge.api.set_user_enabled":
      return methodResponse(await setUserEnabled(args, context));

    case "metaforge.api.logout_other_sessions":
      return methodResponse(await logoutOtherSessions(context));

    case "frappe.core.doctype.user.user.update_password":
      return methodResponse(await updatePassword(args, context));

    // ---- printing, bulk actions, workspaces --------------------------------
    case "frappe.www.printview.get_html_and_style":
      return methodResponse(await printView(args, context));

    case "frappe.desk.reportview.delete_items":
      return methodResponse(await bulkDelete(args, context));

    case "frappe.desk.desktop.get_workspaces":
      return methodResponse(await workspaces(context));

    case "frappe.desk.desktop.get_desktop_page":
      return methodResponse(await desktopPage(args, context));

    case "frappe.desk.notifications.get_open_count":
      return methodResponse(await openCount(args, context));

    case "frappe.desk.reportview.export_query":
      // Returns CSV rather than a JSON envelope, because the client requests it as
      // a blob and hands it straight to a download.
      return exportQuery(args, context);

    // ---- tree view ---------------------------------------------------------
    case "frappe.desk.treeview.get_children":
      return methodResponse(await treeChildren(args, context));

    case "frappe.desk.treeview.add_node":
      // Frappe's own endpoint returns nothing and the client refetches.
      await addTreeNode(args, context);
      return methodResponse(null);

    case "metaforge.api.add_tree_node":
      return methodResponse(await addTreeNode(args, context));

    // ---- query report ------------------------------------------------------
    case "frappe.desk.query_report.run":
      return methodResponse(await runQueryReport(args, context));

    case "frappe.desk.query_report.get_script":
      // No server-side report scripts exist on this platform, and none can: a
      // report script is arbitrary code. Reported as an empty script rather than
      // 404 so the client renders the plain table instead of an error.
      return methodResponse({ script: "", html_format: null, execution_time: 0 });

    // ---- data import -------------------------------------------------------
    case "frappe.core.doctype.data_import.data_import.get_preview_from_template":
      return methodResponse(await importPreview(args, context));

    case "frappe.core.doctype.data_import.data_import.form_start_import":
      return methodResponse(await importApply(args, context));

    // ---- kanban ------------------------------------------------------------
    case "frappe.desk.doctype.kanban_board.kanban_board.get_kanban_boards":
      return methodResponse(await kanbanBoards(args, context));

    case "frappe.desk.doctype.kanban_board.kanban_board.update_order_for_single_card":
      return methodResponse(await kanbanReorder(args, context));

    case "metaforge.api.kanban_move_with_comment":
      return methodResponse(await kanbanMove(args, context));

    // ---- notification log ---------------------------------------------------
    case "frappe.desk.doctype.notification_log.notification_log.get_notification_logs":
      return methodResponse(await notificationLogs(args, context));

    case "frappe.desk.doctype.notification_log.notification_log.mark_as_read":
      return methodResponse({ marked: await context.deskViews.markRead(context.tenantId, context.actor.user_id, args.requireText("docname", 320)) });

    case "frappe.desk.doctype.notification_log.notification_log.mark_all_as_read":
      return methodResponse({ marked: await context.deskViews.markAllRead(context.tenantId, context.actor.user_id) });

    case "frappe.desk.doctype.notification_log.notification_log.trigger_indicator_hide":
      // A UI-only signal in Frappe; there is no server state behind it, and saying
      // so is better than inventing some.
      return methodResponse(null);

    // ---- business context ---------------------------------------------------
    case "metaforge.api.get_business_context":
      return methodResponse(await businessContext(args, context));

    case "metaforge.api.get_contextual_list":
      return methodResponse(await contextualList(args, context));

    case "metaforge.api.get_contextual_count":
      return methodResponse(await contextualCount(args, context));

    case "frappe.desk.search.search_link":
      return methodResponse(await searchLink(args, context));

    case "metaforge.api.get_capabilities":
      return methodResponse(await capabilities(args, context));

    case "metaforge.api.resolve_display_values":
      return methodResponse(await resolveDisplayValues(args, context));

    case "frappe.desk.form.utils.add_comment":
      return methodResponse(await addComment(args, context));

    default: {
      // An app owns its own dotted namespace: `hrm.api.something` goes to the `hrm`
      // app's Worker. Checked only AFTER every platform method, so an app can never
      // shadow one of ours by choosing a colliding id.
      const fromApp = await callAppMethod(methodName, args, context);
      if (fromApp) return fromApp;

      // An unimplemented method must fail loudly. Returning an empty success
      // would let a screen render as if it had data.
      throw errors.notFound(`Method is not implemented on this platform: ${methodName}`);
    }
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
    // `filterMetaForActor` strips the DocPerm rows, which is right for the native
    // API — it deliberately never discloses the permission matrix. But the Frappe
    // contract carries them, and the client derives its list columns and field
    // editability from them: with an empty `permissions` array it shows a single
    // `ID` column and never issues the list query at all. So the rows are restored,
    // narrowed to the roles this actor actually holds. The actor learns what THEY
    // can do — which they could discover by trying anyway — not what every other
    // role can do.
    meta: { ...filtered, permissions: visiblePermissions(full, context) },
    children,
    workflow,
    maskedFields: maskedFieldNames(full, filtered),
  });
}

/**
 * DocPerm rows the actor is entitled to see: their own roles' rows, or all of them
 * for a platform administrator (who can read the definition anyway).
 */
function visiblePermissions(meta: DocTypeMeta, context: FrappeRouterContext): DocTypeMeta["permissions"] {
  if (isPlatformAdmin(context)) return meta.permissions;
  const roles = new Set(context.actor.roles);
  return meta.permissions.filter((permission) => roles.has(permission.role));
}

async function getDoc(args: FrappeArgs, context: FrappeRouterContext): Promise<JsonObject> {
  const doctype = args.requireText("doctype", 160);
  const name = args.requireText("name", 320);
  const document = await loadReadable(doctype, name, context);
  const meta = await requireMeta(doctype, context);
  const timeline = await context.collaboration.listTimeline(context.tenantId, doctype, name);

  // `track_seen` was previously validated and stored but read by nothing. Recorded
  // only when the doctype asks for it — tracking every read of every doctype would
  // add a write to the hottest path on the platform for information nobody shows.
  const views = meta.track_seen
    ? await recordAndListViews(doctype, name, context)
    : [];

  return {
    docs: [toFrappeDoc(document)],
    docinfo: {
      comments: timeline.comments ?? [],
      versions: timeline.versions ?? [],
      communications: [],
      assignments: timeline.assignments ?? [],
      attachments: timeline.files ?? [],
      tags: await context.collaboration.listTags(context.tenantId, doctype, name),
      views: views as unknown as JsonValue,
      permissions: await effectivePermissionFlags(doctype, name, context),
    },
  };
}

/**
 * Records this read and returns everyone who has seen the document.
 *
 * A failure to record must not fail the read: knowing who looked at a document is
 * strictly less important than being able to open it.
 */
async function recordAndListViews(doctype: string, name: string, context: FrappeRouterContext): Promise<JsonObject[]> {
  try {
    await context.collaboration.recordView(context.tenantId, doctype, name, context.actor.user_id, context.now());
    return (await context.collaboration.listViewers(context.tenantId, doctype, name))
      .map((entry) => ({ owner: entry.viewer, creation: entry.last_seen_at }));
  } catch {
    return [];
  }
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
  // Translated like every other projection: `get_value(dt, filters, "modified")` is
  // ordinary Frappe client code and must not die on "Field is not allowed".
  const fields = toKernelProjection(fieldname.split(",").map((field) => field.trim()).filter(Boolean));
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

        /**
         * ONE more hop when the title field is itself a Link.
         *
         * A doctype whose most identifying field is a reference — a class session is best
         * named by its class, an attendance row by its student — otherwise resolves to
         * another id, so the user reads `LOP-2026-0008` where a name belongs. Following
         * the reference once turns that into the class's actual name.
         *
         * Exactly ONE hop, deliberately: a chain of Link title fields would otherwise
         * recurse, and two references is already past the point where the label describes
         * the record the user is looking at. The same permission-aware read is used, so
         * the second hop cannot leak either.
         */
        const titleMeta = meta?.fields?.find((field) => field.fieldname === titleField);
        if (titleMeta?.fieldtype === "Link" && titleMeta.options && label === candidate) {
          try {
            const targetMeta = await context.metadata.getDocType(context.tenantId, titleMeta.options);
            const targetTitle = targetMeta?.title_field;
            if (targetTitle) {
              const referenced = await loadReadable(titleMeta.options, label, context);
              const deeper = referenced.data[targetTitle];
              if (typeof deeper === "string" && deeper) label = deeper;
            }
          } catch {
            // Reference unreadable or gone — keep the first-hop value rather than failing.
          }
        }
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

// ---- workflow ---------------------------------------------------------------

/**
 * Applies a workflow action.
 *
 * The transition, target docstatus and resulting lifecycle action are all decided
 * from server-held workflow metadata. The client names an ACTION only — it never
 * chooses the next state, or it could walk a document into a state its role is not
 * allowed to reach.
 */
async function applyWorkflow(args: FrappeArgs, context: FrappeRouterContext): Promise<JsonObject> {
  const submitted = args.has("doc") ? (args.object("doc") ?? {}) : {};
  const doctype = args.text("doctype") ?? String(submitted.doctype ?? "");
  const name = args.text("name") ?? String(submitted.name ?? "");
  const action = args.requireText("action", 160);
  if (!doctype || !name) throw errors.validation("doctype and name are required");

  const current = await loadWritable(doctype, name, context);
  if (args.has("doc")) assertModifiedMatches(current, submitted.modified);

  const workflow = await context.metadata.getWorkflow(context.tenantId, doctype);
  if (!workflow) throw errors.validation(`${doctype} has no active workflow`);
  const state = String(current.data[workflow.state_field] ?? workflow.states[0]?.state ?? "");
  const transition = workflow.transitions.find((entry) => entry.state === state && entry.action === action
    && (context.actor.roles.includes(entry.allowed_role) || isPlatformAdmin(context)));
  if (!transition) throw errors.permission(`Workflow action ${action} is not permitted from ${state}`);

  const target = workflow.states.find((entry) => entry.state === transition.next_state);
  if (!target) throw errors.validation("Workflow target state is invalid");

  // Self-approval, by the SAME rule the kernel enforces and the listing offers.
  //
  // This copy had drifted twice over: it exempted a platform administrator — defeating
  // a segregation-of-duties control for exactly the account it exists to constrain —
  // and it omitted the docstatus condition, so it also blocked an author from moving
  // their OWN DRAFT forward. "Gửi duyệt" does not change docstatus and is not an
  // approval, yet it was refused with "You cannot approve a document you created",
  // which left no way for anyone to submit their own request at all.
  if (blocksSelfApproval(transition, current.owner, context.actor.user_id, current.docstatus, target.docstatus)) {
    throw errors.permission("You cannot approve a document you created");
  }
  const lifecycle: MutationAction = target.docstatus === 2 ? "cancel"
    : target.docstatus === 1 && current.docstatus === 0 ? "submit" : "save";

  await context.runCommand(await buildCommand({
    tenantId: context.tenantId, actor: context.actor, doctype, name,
    action: lifecycle, expectedVersion: current.version,
    document: { ...current.data, [workflow.state_field]: transition.next_state, workflow_state: transition.next_state },
  }));
  return toFrappeDoc(await loadReadable(doctype, name, context));
}

async function workflowTransitions(args: FrappeArgs, context: FrappeRouterContext): Promise<JsonObject> {
  const submitted = args.has("doc") ? (args.object("doc") ?? {}) : {};
  const doctype = args.text("doctype") ?? String(submitted.doctype ?? "");
  const name = args.text("name") ?? String(submitted.name ?? "");
  if (!doctype || !name) throw errors.validation("doctype and name are required");

  const document = await loadReadable(doctype, name, context);
  const workflow = await context.metadata.getWorkflow(context.tenantId, doctype);
  // `has_workflow` is load-bearing and separate from the transition list: an empty
  // list cannot distinguish "this doctype has no workflow" from "it has one, but
  // this state/role leaves no action available". Without the flag the client cannot
  // tell a plain document from one sitting in a terminal state.
  if (!workflow) return { has_workflow: false, state: null, transitions: [] };
  const state = String(document.data[workflow.state_field] ?? workflow.states[0]?.state ?? "");
  const currentDocstatus = Number(document.docstatus ?? 0);
  const docstatusOf = (stateName: string): number =>
    Number(workflow.states.find((entry) => entry.state === stateName)?.docstatus ?? currentDocstatus);

  const transitions = workflow.transitions
    .filter((entry) => entry.state === state && (context.actor.roles.includes(entry.allowed_role) || isPlatformAdmin(context)))
    // An action the actor could not complete is omitted rather than offered and then
    // refused on click. This MUST use the same rule the write path enforces: it used to
    // exempt a platform admin and ignore the docstatus condition, so the server offered
    // "Duyệt" and then answered the tap with 403 "Self approval is not allowed".
    .filter((entry) => !blocksSelfApproval(entry, document.owner, context.actor.user_id, currentDocstatus, docstatusOf(entry.next_state)))
    .map((entry) => ({
      action: entry.action,
      next_state: entry.next_state,
      allowed: entry.allowed_role,
      allow_self_approval: entry.allow_self_approval ? 1 : 0,
    }));
  return { has_workflow: true, state, transitions };
}

/** Workflow action plus a comment, as one call so the comment cannot be orphaned. */
async function workflowActionWithComment(args: FrappeArgs, context: FrappeRouterContext): Promise<JsonObject> {
  const document = await applyWorkflow(args, context);
  const comment = args.text("comment");
  if (comment) {
    await context.collaboration.addComment(
      context.tenantId, context.actor,
      String(document.doctype), String(document.name), comment, context.now(),
    );
  }
  return document;
}

// ---- sharing and assignment -------------------------------------------------

async function listShares(args: FrappeArgs, context: FrappeRouterContext): Promise<JsonObject[]> {
  const doctype = args.requireText("doctype", 160);
  const name = args.requireText("name", 320);
  // Reading the share list requires read on the document itself, or it would
  // disclose who has access to something the caller cannot see.
  await loadReadable(doctype, name, context);
  return (await context.collaboration.listShares(context.tenantId, doctype, name)).map((share) => ({
    user: share.user,
    read: share.read ? 1 : 0,
    write: share.write ? 1 : 0,
    share: share.share ? 1 : 0,
  }));
}

async function addShare(args: FrappeArgs, context: FrappeRouterContext): Promise<JsonObject> {
  const doctype = args.requireText("doctype", 160);
  const name = args.requireText("name", 320);
  const user = args.requireText("user", 320);
  const document = await context.documents.getDocument(context.tenantId, doctype, name);
  if (!document) throw errors.notFound();
  // Sharing is its own permission: a user who can edit a document is not
  // automatically entitled to widen who else can see it.
  await context.permissions.assert({
    actor: context.actor, tenantId: context.tenantId, doctype, name,
    owner: document.owner, data: document.data, action: "share",
  });
  const record = await context.collaboration.share(context.tenantId, context.actor, doctype, name, {
    user,
    read: args.bool("read", true),
    write: args.bool("write", false),
    share: args.bool("share", false),
  }, context.now());
  return record as unknown as JsonObject;
}

async function removeShare(args: FrappeArgs, context: FrappeRouterContext): Promise<JsonObject> {
  const doctype = args.requireText("doctype", 160);
  const name = args.requireText("name", 320);
  const user = args.requireText("user", 320);
  const document = await context.documents.getDocument(context.tenantId, doctype, name);
  if (!document) throw errors.notFound();
  await context.permissions.assert({
    actor: context.actor, tenantId: context.tenantId, doctype, name,
    owner: document.owner, data: document.data, action: "share",
  });
  return { removed: await context.collaboration.removeShare(context.tenantId, doctype, name, user) };
}

async function addAssignment(args: FrappeArgs, context: FrappeRouterContext): Promise<JsonObject> {
  const doctype = args.requireText("doctype", 160);
  const name = args.requireText("name", 320);
  await loadWritable(doctype, name, context);
  const assignees = args.array<string>("assign_to") ?? (args.text("assign_to") ? [args.text("assign_to")!] : []);
  if (!assignees.length) throw errors.validation("assign_to is required");
  const created: JsonObject[] = [];
  for (const assignee of assignees) {
    created.push(await context.collaboration.assign(context.tenantId, context.actor, doctype, name, {
      assigned_to: String(assignee),
      ...(args.text("description") ? { description: args.text("description") } : {}),
    }, context.now()) as unknown as JsonObject);
  }
  return { assignments: created };
}

async function removeAssignment(args: FrappeArgs, context: FrappeRouterContext): Promise<JsonObject> {
  const doctype = args.requireText("doctype", 160);
  const name = args.requireText("name", 320);
  const assignee = args.requireText("assign_to", 320);
  await loadWritable(doctype, name, context);
  return { removed: await context.collaboration.removeAssignment(context.tenantId, doctype, name, assignee, context.now()) };
}

// ---- tags -------------------------------------------------------------------

async function addTag(args: FrappeArgs, context: FrappeRouterContext): Promise<string> {
  const doctype = args.requireText("dt", 160);
  const name = args.requireText("dn", 320);
  const tag = args.requireText("tag", 140);
  await loadWritable(doctype, name, context);
  await context.collaboration.addTag(context.tenantId, context.actor, doctype, name, tag, context.now());
  return tag;
}

async function removeTag(args: FrappeArgs, context: FrappeRouterContext): Promise<JsonObject> {
  const doctype = args.requireText("dt", 160);
  const name = args.requireText("dn", 320);
  const tag = args.requireText("tag", 140);
  await loadWritable(doctype, name, context);
  return { removed: await context.collaboration.removeTag(context.tenantId, doctype, name, tag) };
}

// ---- global search ----------------------------------------------------------

/**
 * Cross-doctype search, permission-aware and FAIL-CLOSED.
 *
 * Candidates come from the search index, but every hit is re-checked against the
 * permission layer before being returned. The index is a shortlist, never an
 * authorisation decision — a document the actor cannot read must not surface even
 * as a title.
 */
async function globalSearch(args: FrappeArgs, context: FrappeRouterContext): Promise<JsonObject[]> {
  const text = args.text("text");
  if (!text || text.length < 2) return [];
  const doctype = args.text("doctype");
  const limit = Math.min(Math.max(args.int("limit", 20), 1), 50);

  const candidates = await context.search.candidates(context.tenantId, text, doctype ?? null, limit * 4);
  const results: JsonObject[] = [];
  for (const candidate of candidates) {
    if (results.length >= limit) break;
    try {
      await loadReadable(candidate.doctype, candidate.name, context);
    } catch {
      continue;
    }
    results.push({ doctype: candidate.doctype, name: candidate.name, title: candidate.title || candidate.name, content: candidate.snippet });
  }
  return results;
}

// ---- users and permissions --------------------------------------------------

async function accessProfile(args: FrappeArgs, context: FrappeRouterContext): Promise<JsonObject> {
  const requested = args.text("user");
  // Inspecting somebody else's access is an administrative act.
  if (requested && requested !== context.actor.user_id) requireMetadataAdmin(context);
  const user = requested ?? context.actor.user_id;
  const roles = user === context.actor.user_id ? [...context.actor.roles] : await context.users.listRoles(context.tenantId, user);
  const permissions = await context.access.listUserPermissions(context.tenantId, user);
  /**
   * `scopes` is what the client actually reads — grouped by doctype, not a flat list.
   *
   * The server sent only `user_permissions`, so `profile.scopes` was `undefined` and the
   * permission screen crashed on `scopes.reduce(...)` before rendering anything: a blank
   * page, not an error message. Two implementations of one contract, disagreeing quietly.
   * `user_permissions` is kept alongside because the Frappe-shaped surface promises it.
   */
  const byDoctype = new Map<string, JsonObject[]>();
  for (const record of permissions) {
    const list = byDoctype.get(record.allow_doctype) ?? [];
    list.push({
      value: record.allow_name,
      label: record.allow_name,
      ...(record.applicable_for_doctype ? { applicableFor: record.applicable_for_doctype } : {}),
      ...(record.is_default ? { isDefault: true } : {}),
      ...(record.hide_descendants ? { hideDescendants: true } : {}),
    });
    byDoctype.set(record.allow_doctype, list);
  }
  return {
    user,
    roles,
    scopes: [...byDoctype].map(([doctype, values]) => ({ doctype, values })) as unknown as JsonValue,
    // Only a System Manager may change anyone's access, so the screen hides its own
    // controls rather than offering buttons the server will refuse.
    canManage: isPlatformAdmin(context),
    user_permissions: permissions.map((record) => ({
      allow: record.allow_doctype,
      for_value: record.allow_name,
      applicable_for: record.applicable_for_doctype || null,
      is_default: record.is_default ? 1 : 0,
      hide_descendants: record.hide_descendants ? 1 : 0,
    })),
  };
}

/**
 * Explains an effective permission decision.
 *
 * Reports the same capability flags the UI gates on, so a "why can't I?" question
 * is answered by the authority that made the decision rather than by a second
 * implementation that could disagree with it.
 */
async function explainPermission(args: FrappeArgs, context: FrappeRouterContext): Promise<JsonObject> {
  const doctype = args.requireText("doctype", 160);
  const name = args.text("name");
  const meta = await requireMeta(doctype, context);
  const document = name ? await context.documents.getDocument(context.tenantId, doctype, name) : null;
  if (name && !document) throw errors.notFound();
  const scope = await context.permissions.getReadScope(context.actor, context.tenantId, doctype).catch(() => null);
  return {
    doctype,
    ...(name ? { name } : {}),
    roles: [...context.actor.roles],
    read_scope: scope?.mode ?? "denied",
    user_permissions: (scope?.user_permissions ?? []).map((constraint) => ({
      allow: constraint.allow_doctype, fields: constraint.fields, allowed_values: constraint.allowed_values,
    })),
    capabilities: await capabilityFlags(doctype, meta, document, context),
  };
}

async function addUserPermission(args: FrappeArgs, context: FrappeRouterContext): Promise<JsonObject> {
  requireMetadataAdmin(context);
  const user = args.requireText("user", 320);
  const allow = args.requireText("allow", 160);
  const forValue = args.requireText("for_value", 320);
  const applicable = args.text("applicable_for") ?? "";

  // The referenced value must exist, or the restriction would silently deny
  // everything rather than restricting to something.
  const exists = await context.documents.hasMasterRecord(context.tenantId, allow, forValue)
    || Boolean(await context.documents.getDocument(context.tenantId, allow, forValue));
  if (!exists) throw errors.reference(`${allow} ${forValue} does not exist`);

  if (applicable) {
    const target = await context.metadata.getDocType(context.tenantId, applicable);
    // Without a Link field to restrict on, the permission can never be applied.
    if (!target || !target.fields.some((field) => field.fieldtype === "Link" && field.options === allow)) {
      throw errors.validation(`${applicable} has no Link field to ${allow}`);
    }
  }

  const record = await context.access.putUserPermission?.(context.tenantId, {
    user,
    allow_doctype: allow,
    allow_name: forValue,
    applicable_for_doctype: applicable,
    is_default: args.bool("is_default", false),
    hide_descendants: args.bool("hide_descendants", false),
    created_by: context.actor.user_id,
    created_at: context.now(),
  });
  if (!record) throw errors.validation("User permissions are not writable on this deployment");
  return record as unknown as JsonObject;
}

async function removeUserPermission(args: FrappeArgs, context: FrappeRouterContext): Promise<JsonObject> {
  requireMetadataAdmin(context);
  const user = args.requireText("user", 320);
  const allow = args.requireText("allow", 160);
  const forValue = args.requireText("for_value", 320);
  await context.access.deleteUserPermission?.(context.tenantId, user, allow, forValue, args.text("applicable_for") ?? "");
  return { removed: true };
}

async function setUserRoles(args: FrappeArgs, context: FrappeRouterContext): Promise<JsonObject> {
  requireMetadataAdmin(context);
  const user = args.requireText("user", 320);
  const roles = args.array<string>("roles") ?? [];
  const applied = await context.users.setRoles(context.tenantId, user, roles.map((role) => String(role)), context.now());
  return { user, roles: applied };
}

/**
 * Everyone who can sign in to this tenant.
 *
 * The permission screen had no way to ask this. It could load one profile by exact login,
 * which answers "what can this person do" but never "who can get in at all" — so an
 * account created for a trial, or one belonging to somebody who left, stayed open and
 * nobody had a screen that would show it.
 */
async function listUsers(context: FrappeRouterContext): Promise<JsonObject> {
  requireMetadataAdmin(context);
  const users = await context.users.list(context.tenantId);
  const roles = await context.users.listAllRoles(context.tenantId);
  return {
    users: users.map((user) => ({
      user: user.user_id,
      full_name: user.full_name,
      email: user.email,
      enabled: user.enabled,
      user_type: user.user_type,
      roles: user.roles,
      ...(user.last_login_at ? { last_login_at: user.last_login_at } : {}),
    })) as unknown as JsonValue,
    // The roles a new account can be given, in the same answer, so the screen that lists
    // users can also open the form that creates one without a second call.
    available_roles: roles.filter((role) => !["All", "Guest"].includes(role)) as unknown as JsonValue,
  };
}

/** Logins are ids, not display names: they end up in `owner` on every document. */
const LOGIN_PATTERN = /^[A-Za-z0-9._%+-]+(@[A-Za-z0-9.-]+\.[A-Za-z]{2,})?$/;
const MIN_PASSWORD_LENGTH = 8;

/**
 * Creates a login, with its roles, in one call.
 *
 * One call rather than three (create, set password, assign roles) because the intermediate
 * states are all wrong to leave lying around: an account with no password cannot be used
 * but exists, and an account with a password and no roles can sign in and see nothing,
 * which reads to the person as "the system is broken".
 *
 * Refuses to overwrite an existing login. Creating and updating look identical from a form
 * that is titled "add a user", so an id that is already taken must be an error rather than
 * a silent password reset on somebody else's account.
 */
async function createUser(args: FrappeArgs, context: FrappeRouterContext): Promise<JsonObject> {
  requireMetadataAdmin(context);
  const user = args.requireText("user", 320).toLowerCase();
  if (!LOGIN_PATTERN.test(user)) {
    throw errors.validation("Tên đăng nhập chỉ gồm chữ, số, dấu chấm, gạch dưới, gạch ngang — hoặc một địa chỉ email.");
  }
  const password = args.requireText("password", 256);
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw errors.validation(`Mật khẩu phải có ít nhất ${MIN_PASSWORD_LENGTH} ký tự.`);
  }
  const existing = await context.users.get(context.tenantId, user);
  if (existing) throw errors.validation(`Tên đăng nhập "${user}" đã tồn tại. Mở tài khoản đó để sửa, hoặc chọn tên khác.`);

  const now = context.now();
  await context.users.upsert(context.tenantId, {
    userId: user,
    fullName: args.text("full_name") ?? user,
    email: args.text("email") ?? (user.includes("@") ? user : ""),
    enabled: args.bool("enabled", true),
    userType: "System User",
    passwordHash: await hashPassword(password),
  }, now);

  const roles = (args.array<string>("roles") ?? []).map((role) => String(role));
  const applied = roles.length ? await context.users.setRoles(context.tenantId, user, roles, now) : [];
  return { user, roles: applied as unknown as JsonValue, created: true };
}

/**
 * Closes or reopens a login.
 *
 * An administrator cannot close their OWN account here. Locking yourself out of the screen
 * that unlocks accounts leaves a tenant with no way back in short of a support request.
 */
async function setUserEnabled(args: FrappeArgs, context: FrappeRouterContext): Promise<JsonObject> {
  requireMetadataAdmin(context);
  const user = args.requireText("user", 320);
  const enabled = args.bool("enabled", false);
  if (user === context.actor.user_id && !enabled) {
    throw errors.validation("Không tự khoá tài khoản của chính mình — sẽ không còn ai mở lại được.");
  }
  await context.users.setEnabled(context.tenantId, user, enabled, context.now());
  return { user, enabled };
}

/**
 * Revokes every other session for the caller.
 *
 * Implemented by bumping the credential epoch, which invalidates ALL sessions
 * including this one — the client re-authenticates. That is deliberate: keeping
 * the current session alive would require tracking individual sessions, and a
 * user asking to log out everywhere is better served by an over-broad revocation
 * than by one that might miss a session.
 */
async function logoutOtherSessions(context: FrappeRouterContext): Promise<JsonObject> {
  const epoch = await context.users.bumpSessionEpoch(context.tenantId, context.actor.user_id, context.now());
  return { revoked: true, session_epoch: epoch, reauthenticate_required: true };
}

/**
 * Changes a password.
 *
 * Changing your own requires the old one — a stolen session must not be enough to
 * lock the real owner out. An administrator may reset another user's without it,
 * which is the recovery path.
 */
async function updatePassword(args: FrappeArgs, context: FrappeRouterContext): Promise<JsonObject> {
  const targetUser = args.text("user") ?? context.actor.user_id;
  const newPassword = args.requireText("new_password", 256);
  const isSelf = targetUser === context.actor.user_id;
  if (!isSelf) requireMetadataAdmin(context);

  if (isSelf) {
    const oldPassword = args.text("old_password");
    if (!oldPassword) throw errors.validation("old_password is required to change your own password");
    const found = await context.users.findByLogin(context.tenantId, targetUser);
    if (!found || !found.passwordHash || !await verifyPassword(oldPassword, found.passwordHash)) {
      throw errors.authentication("Current password is incorrect");
    }
  }

  const now = context.now();
  await context.users.upsert(context.tenantId, { userId: targetUser, passwordHash: await hashPassword(newPassword) }, now);
  // A password change must end every existing session, or a stolen one would keep
  // working after the owner rotated their credential.
  const epoch = await context.users.bumpSessionEpoch(context.tenantId, targetUser, now);
  return { user: targetUser, session_epoch: epoch, reauthenticate_required: true };
}

// ---- printing, bulk actions, workspaces -------------------------------------

/**
 * Renders a print format.
 *
 * The document is redacted by the permission layer before rendering, so a field
 * the actor may not read cannot appear in a printout — a printed page is the
 * easiest place for a leak to escape the system entirely.
 */
async function printView(args: FrappeArgs, context: FrappeRouterContext): Promise<JsonObject> {
  const doctype = args.requireText("doctype", 160);
  const name = args.requireText("name", 320);
  const document = await context.documents.getDocument(context.tenantId, doctype, name);
  if (!document) throw errors.notFound();
  await context.permissions.assert({
    actor: context.actor, tenantId: context.tenantId, doctype, name,
    owner: document.owner, data: document.data, action: "print",
  });

  const meta = await requireMeta(doctype, context);
  const share = await context.access.getShare(context.tenantId, doctype, name, context.actor.user_id);
  const printable = context.permissions.redactDocument(meta, document, context.actor, Boolean(share?.read));
  const format = await context.metadata.getPrintFormat(context.tenantId, doctype, args.text("format"));
  if (!format) throw errors.notFound("No print format is configured for this doctype");

  // HTML is returned as a string for the client to sandbox, matching Frappe. The
  // renderer escapes every interpolated value, so document content cannot inject
  // markup into the page.
  // `meta` is passed so `print_hide` is honoured: a field the author marked as not for
  // print — an internal margin, a private note — must not reach the paper the customer
  // is handed.
  return { html: renderPrintFormat(format, printable, context.actor.locale, meta), style: format.css ?? "" };
}

/**
 * Deletes several documents.
 *
 * Each is deleted through the same guarded path as a single delete, and the
 * outcome is reported per item rather than as one pass/fail — a partial result is
 * the truth, and collapsing it would leave the caller unsure what happened.
 */
async function bulkDelete(args: FrappeArgs, context: FrappeRouterContext): Promise<JsonObject> {
  const doctype = args.requireText("doctype", 160);
  const names = args.array<string>("items") ?? [];
  if (!names.length) throw errors.validation("items is required");
  if (names.length > 100) throw errors.validation("At most 100 documents may be deleted at once");

  const results: JsonObject[] = [];
  for (const raw of names) {
    const name = String(raw);
    try {
      await loadWritable(doctype, name, context);
      results.push({ name, deleted: await context.documents.deleteDraftDocument(context.tenantId, doctype, name) });
    } catch (error) {
      results.push({ name, deleted: false, error: error instanceof Error ? error.message : "Delete failed" });
    }
  }
  return { results, deleted: results.filter((entry) => entry.deleted).length, failed: results.filter((entry) => !entry.deleted).length };
}

/**
 * Workspaces, derived from installed apps rather than stored separately.
 *
 * A separate workspace table would drift from the apps that own the screens; here
 * uninstalling an app removes its workspace by construction.
 */
async function workspaces(context: FrappeRouterContext): Promise<JsonObject> {
  const catalog = await applicationCatalog(context);
  const nav = Array.isArray(catalog.nav) ? catalog.nav as JsonObject[] : [];
  const pages: JsonObject[] = [];
  const seen = new Set<string>();
  for (const item of nav) {
    const group = typeof item.group === "string" && item.group ? item.group : String(item.app_id ?? "App");
    if (seen.has(group)) continue;
    seen.add(group);
    pages.push({ name: group, title: group, label: group, public: 1 });
  }
  return { pages, has_access: true };
}

async function desktopPage(args: FrappeArgs, context: FrappeRouterContext): Promise<JsonObject> {
  const page = args.text("page") ?? args.text("name") ?? "";
  const catalog = await applicationCatalog(context);
  const nav = (Array.isArray(catalog.nav) ? catalog.nav as JsonObject[] : [])
    .filter((item) => !page || String(item.group ?? item.app_id ?? "") === page);
  return {
    // Frappe's shortcut/card shape, filled from app navigation.
    shortcuts: { items: nav.map((item) => ({ label: item.label, type: item.kind === "doctype" ? "DocType" : "Page", link_to: item.key, doc_view: "List" })) },
    cards: { items: [] },
    charts: { items: [] },
    number_cards: { items: [] },
  };
}

/**
 * Open-document counts for the sidebar badges.
 *
 * Counted through the list service, so the number respects the actor's read scope
 * — a badge showing documents the user cannot open would be worse than no badge.
 */
async function openCount(args: FrappeArgs, context: FrappeRouterContext): Promise<JsonObject> {
  const doctype = args.text("doctype");
  if (!doctype) return { count: 0, open_count: 0 };
  const name = args.text("name");
  if (name) {
    // Form sidebar: trả CÁC DocType đang trỏ trực tiếp tới bản ghi hiện tại.
    //
    // Bản cũ bỏ qua hoàn toàn `name`, rồi đếm chính DocType hiện tại theo docstatus. Shape trả về
    // `{count:number}` cũng không phải danh sách connection mà adapter cần, nên panel "Liên kết"
    // luôn rỗng dù Item đã có Item Price/Pricing Rule/Supplier Item trỏ tới.
    await assertDocumentAction(context, doctype, name, "read");
    const metas = await context.metadata.listDocTypes(context.tenantId);
    const related: JsonObject[] = [];
    for (const target of metas) {
      if (target.is_child) continue;
      for (const field of target.fields ?? []) {
        if (field.fieldtype !== "Link" || field.options !== doctype) continue;
        try {
          const result = await context.listService.count(context.actor, context.tenantId, {
            doctype: target.name,
            filters: [{ field: field.fieldname, operator: "eq", value: name }] as unknown as JsonValue,
          });
          const count = Number(result.count ?? 0);
          if (count <= 0) continue;
          related.push({
            name: target.name,
            label: target.label ?? target.name,
            relation_label: field.label ?? field.fieldname,
            fieldname: field.fieldname,
            filter_value: name,
            count,
            open_count: count,
          });
        } catch {
          // Không có quyền đọc DocType đích hoặc field không khả dụng trong list definition:
          // bỏ quan hệ đó, không dùng count làm existence oracle.
        }
      }
    }
    related.sort((a, b) =>
      String(a.label ?? a.name).localeCompare(String(b.label ?? b.name), context.language === "vi" ? "vi" : "en"));
    return { count: related };
  }
  try {
    const result = await context.listService.count(context.actor, context.tenantId, {
      doctype,
      filters: [{ field: "docstatus", operator: "eq", value: 0 }] as unknown as JsonValue,
    });
    const count = typeof result === "number" ? result : Number((result as { count?: number }).count ?? 0);
    return { count, open_count: count };
  } catch {
    // A doctype without a list definition or without read access reports zero
    // rather than failing the whole sidebar.
    return { count: 0, open_count: 0 };
  }
}

// ---- tree view --------------------------------------------------------------

/**
 * The self-referencing Link field that makes a doctype a tree.
 *
 * Frappe's convention, and the one the client already assumes when it reparents a
 * node: `parent_<doctype in snake_case>`. Derived rather than configured so the two
 * sides cannot disagree about which field holds the parent.
 */
function parentFieldFor(doctype: string): string {
  return `parent_${doctype.toLowerCase().replace(/ /g, "_")}`;
}

function assertTreeDoctype(meta: DocTypeMeta): string {
  const parentField = parentFieldFor(meta.name);
  const field = meta.fields.find((entry) => entry.fieldname === parentField);
  // Refused rather than returning an empty tree: an empty tree reads as "no data",
  // while the real problem is that the doctype was never modelled as one.
  if (!field || (field.fieldtype !== "Link" && field.fieldtype !== "Data")) {
    throw errors.validation(`${meta.name} is not a tree: it has no ${parentField} field`);
  }
  return parentField;
}

/**
 * Children of a tree node.
 *
 * `expandable` is computed from `is_group` when the doctype has it, because that is
 * what lets the UI show a disclosure arrow without fetching a level it does not
 * need. Falls back to "expandable" so a group is never rendered as a leaf that
 * cannot be opened.
 */
async function treeChildren(args: FrappeArgs, context: FrappeRouterContext): Promise<JsonObject[]> {
  const doctype = args.requireText("doctype", 160);
  const meta = await requireMeta(doctype, context);
  const parentField = assertTreeDoctype(meta);
  const parent = args.text("parent") ?? "";
  const hasIsGroup = meta.fields.some((field) => field.fieldname === "is_group");
  const titleField = meta.title_field;

  const page = await context.listService.list(context.actor, context.tenantId, {
    doctype,
    fields: dedupe(["name", parentField, ...(hasIsGroup ? ["is_group"] : []), ...(titleField ? [titleField] : [])]),
    // A root query asks for nodes with no parent; Frappe passes the doctype name
    // itself as `parent` for the root, so both forms are treated as "root".
    filters: (parent && parent !== doctype
      ? [{ field: parentField, operator: "eq", value: parent }]
      : [{ field: parentField, operator: "is_null" }]) as unknown as JsonValue,
    limit: 100,
  });

  return page.rows.map((row) => {
    const record = row as JsonObject;
    const name = String(record.name ?? "");
    return {
      value: name,
      title: titleField && typeof record[titleField] === "string" && record[titleField] ? String(record[titleField]) : name,
      expandable: hasIsGroup ? Boolean(record.is_group) : true,
    };
  });
}

/**
 * Creates a tree node.
 *
 * The parent is set from the tree argument, not from the document body, so a node
 * cannot be created claiming a parent the caller did not navigate to.
 */
async function addTreeNode(args: FrappeArgs, context: FrappeRouterContext): Promise<JsonObject> {
  const doctype = args.requireText("doctype", 160);
  const meta = await requireMeta(doctype, context);
  const parentField = assertTreeDoctype(meta);
  const isRoot = args.bool("is_root", false) || !args.text("parent");
  const parent = isRoot ? null : args.requireText("parent", 320);

  if (parent) {
    // The parent must exist and be readable, or the new node would dangle.
    await loadReadable(doctype, parent, context);
  }

  const body = args.all(new Set(["cmd", "doctype", "parent", "is_root", "_"]));
  const payload: JsonObject = { ...body, ...(parent ? { [parentField]: parent } : {}) };
  delete payload.value;

  await context.permissions.assert({ actor: context.actor, tenantId: context.tenantId, doctype, action: "create" });
  const name = await resolveNewName(doctype, meta, payload, context);
  await context.runCommand(await buildCommand({
    tenantId: context.tenantId, actor: context.actor, doctype, name,
    action: "create", expectedVersion: null,
    document: toKernelPayload(payload, meta),
  }));

  const created = await loadReadable(doctype, name, context);
  const titleField = meta.title_field;
  const title = titleField && typeof created.data[titleField] === "string" ? String(created.data[titleField]) : name;
  return { value: name, title, expandable: Boolean(created.data.is_group) };
}

// ---- query report -----------------------------------------------------------

/**
 * Runs a server-defined report.
 *
 * `ignore_prepared_report` is honoured: the client re-runs synchronously when the
 * server queued a heavy report and has no cached result, because showing an empty
 * table would be read as "there is no stock" rather than "still calculating".
 */
async function runQueryReport(args: FrappeArgs, context: FrappeRouterContext): Promise<JsonObject> {
  const report = args.requireText("report_name", 160);
  const forceSynchronous = args.bool("ignore_prepared_report", false);
  const rawFilters = args.json<JsonValue>("filters");

  /**
   * A report an installed app declares takes precedence over nothing and shadows nothing:
   * it is looked up FIRST because the platform's own names are fixed and few, so an app
   * report can only ever be a name the platform does not have.
   *
   * Permission is asserted against the DOCTYPE the report reads, not against the report's
   * name. Frappe conflates the two — the report is named after its doctype — but an app
   * report is called "Doanh thu theo lớp" and reads `Enrollment`, and checking the name
   * would look up a doctype that does not exist and let everyone through.
   */
  const appReport = await findAppReport(report, context);
  if (appReport) {
    await context.permissions.assert({
      actor: context.actor, tenantId: context.tenantId,
      doctype: appReport.doctype, action: "report",
    });
    const answer = await context.appReports.run(appReport, {
      tenant_id: context.tenantId,
      report,
      filters: await applicableFilters(appReport, normalizeReportFilters(rawFilters), context),
      order_by: [],
      limit: appReport.limit,
      offset: 0,
    }) as JsonObject;
    return { ...answer, columns: frappeReportColumns(answer.columns) };
  }

  await context.permissions.assert({
    actor: context.actor, tenantId: context.tenantId,
    // Report access is gated on the report permission of the doctype the report is
    // named after when one exists; otherwise on being able to read reports at all.
    doctype: report, action: "report",
  }).catch(async () => {
    if (!isPlatformAdmin(context)) throw errors.permission(`Report ${report} is not permitted`);
  });

  const result = await context.reports.run({
    tenant_id: context.tenantId,
    report,
    filters: normalizeReportFilters(rawFilters),
    order_by: [],
    limit: 500,
    offset: 0,
  }, forceSynchronous);

  if (result.prepared === true) {
    // Frappe's shape for "queued, nothing cached": no columns, no result, `doc`
    // null. The client detects exactly this and re-runs synchronously.
    return { prepared_report: true, doc: null, columns: [], result: [] };
  }
  return {
    result: result.result ?? [],
    columns: frappeReportColumns(result.columns),
    message: result.message ?? null,
    chart: result.chart ?? null,
    report_summary: result.report_summary ?? [],
    skip_total_row: result.skip_total_row === true ? 1 : 0,
  };
}

/**
 * Report columns in the shape a Frappe client actually reads.
 *
 * The report engines describe a column as `{field, label, type}` — their own vocabulary.
 * Every Frappe consumer reads `{fieldname, label, fieldtype, options}`, and reads the
 * cell out of the row BY `fieldname`. Handing over the engine's names produced a table
 * with the right headers, the right row count, and every cell blank: the client asked
 * each row for `row[undefined]`. Nothing errored, so it read as "no data".
 *
 * Translated here, at the façade, because that is what this layer is for — the engines
 * should not have to know Frappe's field names, and the client should not have to know
 * theirs.
 */
function frappeReportColumns(columns: JsonValue | undefined): JsonValue {
  if (!Array.isArray(columns)) return [];
  return columns.map((entry) => {
    const column = (entry ?? {}) as JsonObject;
    // Already Frappe-shaped (a report engine may grow to emit it directly) — leave it.
    if (column.fieldname !== undefined) return column;
    const fieldtype = String(column.type ?? "Data");
    return {
      fieldname: String(column.field ?? ""),
      label: String(column.label ?? column.field ?? ""),
      fieldtype,
      ...(column.options === undefined ? {} : { options: column.options }),
      width: fieldtype === "Currency" || fieldtype === "Float" || fieldtype === "Int" ? 140 : 180,
    };
  }) as JsonValue;
}

/**
 * Roles and doctypes for the permission screen, from what is INSTALLED.
 *
 * Not a fixed list: a tenant sees the doctypes its apps actually shipped, and the roles
 * those apps declared plus the platform's own. A hard-coded list would show a customer
 * rows for doctypes they do not have and hide the ones they do.
 */
async function permissionRolesAndDoctypes(context: FrappeRouterContext): Promise<JsonObject> {
  if (!isPlatformAdmin(context)) throw errors.permission("Trung tâm phân quyền cần quyền System Manager");
  const metas = await context.metadata.listDocTypes(context.tenantId);
  const roles = new Set<string>();
  const doctypes: JsonObject[] = [];
  const ptypeMap: Record<string, JsonValue> = {};
  for (const meta of metas) {
    // A child table has no permissions of its own — it is read through its parent, so
    // offering it here would be a row that cannot mean anything.
    if (meta.is_child) continue;
    doctypes.push({ label: meta.label ?? meta.name, value: meta.name });
    for (const permission of meta.permissions ?? []) roles.add(permission.role);
    ptypeMap[meta.name] = [...PERMISSION_PTYPES] as unknown as JsonValue;
  }
  return {
    roles: [...roles].sort().map((role) => ({ label: role, value: role })) as unknown as JsonValue,
    doctypes: doctypes.sort((a, b) => String(a.value).localeCompare(String(b.value))) as unknown as JsonValue,
    doctype_ptype_map: ptypeMap as unknown as JsonValue,
  };
}

/** The permission letters the Desk screen may show. `delete` is a copy of `write` here. */
const PERMISSION_PTYPES = ["read", "write", "create", "delete", "submit", "cancel", "amend", "print", "email", "report", "import", "export", "share"] as const;

/** DocPerm rows, optionally narrowed to one doctype or one role. */
async function permissionRules(args: FrappeArgs, context: FrappeRouterContext): Promise<JsonValue> {
  if (!isPlatformAdmin(context)) throw errors.permission("Trung tâm phân quyền cần quyền System Manager");
  const wantDoctype = args.text("doctype");
  const wantRole = args.text("role");
  const metas = wantDoctype
    ? [await context.metadata.getDocType(context.tenantId, wantDoctype)].filter(Boolean)
    : await context.metadata.listDocTypes(context.tenantId);
  const rules: JsonObject[] = [];
  for (const meta of metas) {
    if (!meta || meta.is_child) continue;
    for (const permission of meta.permissions ?? []) {
      if (wantRole && permission.role !== wantRole) continue;
      rules.push({
        parent: meta.name,
        role: permission.role,
        permlevel: permission.permlevel ?? 0,
        if_owner: permission.if_owner ? 1 : 0,
        // `delete` mirrors `write` because that is what this kernel enforces; showing a
        // separate column would describe a policy the platform does not implement.
        ...Object.fromEntries(PERMISSION_PTYPES.map((ptype) => [
          ptype,
          (ptype === "delete" ? permission.write : permission[ptype]) ? 1 : 0,
        ])),
      });
    }
  }
  return rules as unknown as JsonValue;
}

/**
 * The installed app that declares this report, or null.
 *
 * Reports live in the manifest rather than in `app_objects` because they own no schema:
 * nothing else can collide with them, and uninstalling the app removes the row that
 * carries them. Two apps declaring the same report NAME is possible, and the first
 * installed wins — stated here rather than left to be discovered, but not worth a
 * migration to prevent, since a report that shadows another is visibly the wrong report
 * while a missing DocType is a broken app.
 */
async function findAppReport(name: string, context: FrappeRouterContext): Promise<AppReportSpec | null> {
  for (const installed of await context.apps.list(context.tenantId)) {
    for (const report of installed.reports ?? []) {
      if (report.name === name) return report;
    }
  }
  return null;
}

/**
 * The platform's own context dimensions, which the CLIENT attaches to every report call.
 *
 * The shell keeps a business-context selection (company, warehouse, branch, …) and sends
 * it as report filters without knowing what any given report accepts. For the platform's
 * fixed reports that is correct — they all carry these columns. For an app's report it is
 * not: `Enrollment` has no `company`, so the filter arrived, the compiler refused it, and
 * every app report answered "Filter is not allowed: company" with an empty table.
 */
function clientContextFilters(): Set<string> {
  // Derived from the one list rather than restated, so a dimension added there is
  // covered here without anyone remembering. A function because `CONTEXT_DIMENSIONS`
  // is declared further down the file and a top-level constant would read it too early.
  // `contextToReportFilters` renames the two date bounds on its way out, so they are not
  // dimension keys and have to be named.
  return new Set([...CONTEXT_DIMENSIONS.map((dimension) => dimension.key), "from_date", "to_date"]);
}

/**
 * Drops a context dimension the report's doctype does not have — and ONLY that.
 *
 * The distinction matters more than it looks. If the doctype has no such field, the
 * dimension does not apply to this data at all and ignoring it changes nothing. If the
 * doctype DOES have the field but the report did not declare it filterable, then dropping
 * it would silently widen the report past the scope the user selected — one branch's
 * manager reading every branch's numbers, with the branch still named on screen. That
 * stays a refusal, because it is an app defect and must be visible as one.
 */
async function applicableFilters(
  report: AppReportSpec,
  filters: QueryFilter[],
  context: FrappeRouterContext,
): Promise<QueryFilter[]> {
  const unknown = filters.filter((filter) => !report.filters.includes(filter.field));
  if (!unknown.length) return filters;
  const meta = await context.metadata.getDocType(context.tenantId, report.doctype);
  const fields = new Set((meta?.fields ?? []).map((field) => field.fieldname));
  const contextual = clientContextFilters();
  return filters.filter((filter) => {
    if (report.filters.includes(filter.field)) return true;
    if (contextual.has(filter.field) && !fields.has(filter.field)) return false;
    // Anything else reaches the compiler, which refuses it by name.
    return true;
  });
}

/** Frappe report filters arrive as an object; the report engine wants a list. */
function normalizeReportFilters(raw: JsonValue | undefined): QueryFilter[] {
  if (raw === undefined || raw === null || raw === "") return [];
  if (Array.isArray(raw)) {
    return parseQueryRequest({ report: "Report Filter Validation", filters: raw }, "__filter_validation__").filters ?? [];
  }
  if (typeof raw !== "object") throw errors.validation("filters must be an object or array");
  const filters: QueryFilter[] = [];
  for (const [field, value] of Object.entries(raw as JsonObject)) {
    if (value === undefined || value === null || value === "") continue;
    if (Array.isArray(value) && value.length === 2 && typeof value[0] === "string") {
      filters.push({ field, operator: value[0] as QueryFilter["operator"], value: value[1] ?? null });
      continue;
    }
    filters.push({ field, operator: "=", value });
  }
  // Frappe's array form carries the operator as user input. Run both forms through
  // the query package's parser before a compiler can place that operator in SQL.
  return parseQueryRequest({ report: "Report Filter Validation", filters }, "__filter_validation__").filters ?? [];
}

// ---- data import ------------------------------------------------------------

/**
 * Previews an import without writing anything.
 *
 * Unknown columns are refused here rather than silently ignored during apply: a
 * dropped column means rows import with fields missing, and the user has no way to
 * see which.
 */
async function importPreview(args: FrappeArgs, context: FrappeRouterContext): Promise<JsonObject> {
  const doctype = args.requireText("doctype", 160);
  const csv = args.text("csv") ?? args.text("content") ?? "";
  if (!csv) throw errors.validation("csv content is required");
  await context.permissions.assert({ actor: context.actor, tenantId: context.tenantId, doctype, action: "import" });
  const meta = await requireMeta(doctype, context);
  if (meta.is_child) throw errors.validation("A child doctype cannot be imported directly");

  const preview = parseCsvImport(csv);
  const known = new Set(meta.fields.map((field) => field.fieldname));
  const unknown = preview.headers.filter((header) => header !== "name" && !known.has(header));
  if (unknown.length) throw errors.validation(`Unknown import columns: ${unknown.join(", ")}`);
  return preview as unknown as JsonObject;
}

/**
 * Applies an import row by row.
 *
 * Each row is its own command, so a bad row fails alone and the outcome is
 * reported per row. Importing as one transaction would mean one typo on row 400
 * discards the 399 valid rows before it.
 */
async function importApply(args: FrappeArgs, context: FrappeRouterContext): Promise<JsonObject> {
  const doctype = args.requireText("doctype", 160);
  const csv = args.text("csv") ?? args.text("content") ?? "";
  if (!csv) throw errors.validation("csv content is required");
  await context.permissions.assert({ actor: context.actor, tenantId: context.tenantId, doctype, action: "import" });
  await context.permissions.assert({ actor: context.actor, tenantId: context.tenantId, doctype, action: "create" });
  const meta = await requireMeta(doctype, context);
  if (meta.is_child) throw errors.validation("A child doctype cannot be imported directly");

  const preview = parseCsvImport(csv, 100);
  if (preview.errors.length) throw errors.validation("The CSV contains malformed rows", { error_count: preview.errors.length });

  const results: JsonObject[] = [];
  let imported = 0;
  let failed = 0;
  for (let index = 0; index < preview.rows.length; index += 1) {
    const row = preview.rows[index] as JsonObject;
    const rowNumber = index + 2;
    try {
      const payload = toKernelPayload(row, meta);
      const name = typeof row.name === "string" && row.name.trim()
        ? row.name.trim()
        : await resolveNewName(doctype, meta, payload, context);
      await context.runCommand(await buildCommand({
        tenantId: context.tenantId, actor: context.actor, doctype, name,
        action: "create", expectedVersion: null, document: payload,
      }));
      results.push({ row: rowNumber, name, status: "imported" });
      imported += 1;
    } catch (error) {
      failed += 1;
      results.push({ row: rowNumber, status: "failed", error: error instanceof Error ? error.message : "Row failed" });
    }
  }
  return { imported, failed, results, status: failed ? "Partial Success" : "Success" };
}

/**
 * Exports a filtered list as CSV.
 *
 * Gated on the `export` permission specifically, not on read: taking a whole list
 * out of the system is a different act from looking at a page of it, and Frappe
 * models it as a separate permission for exactly that reason.
 *
 * Rows are paged through the same list service, so the export can never contain a
 * row the actor could not have seen on screen.
 */
async function exportQuery(args: FrappeArgs, context: FrappeRouterContext): Promise<Response> {
  const doctype = args.requireText("doctype", 160);
  await context.permissions.assert({
    actor: context.actor, tenantId: context.tenantId, doctype,
    action: "export", owner: context.actor.user_id,
  });

  // Same translation as the list projection: an export asking for `modified` must not
  // die on "Field is not allowed".
  const requested = toKernelProjection((args.array<string>("fields") ?? []).map(String));
  const filters = toKernelFilters(args.json("filters"), doctype);
  const search = toKernelSearch(args.json("or_filters"));
  const maxRows = Math.min(Math.max(args.int("max_rows", 1000), 1), 5000);

  const rows: JsonObject[] = [];
  let offset = 0;
  // Paged rather than one large query: the list service caps a page, and a single
  // unbounded read would exceed both the row cap and the query budget.
  while (rows.length < maxRows) {
    const body: JsonObject = {
      doctype,
      ...(requested.length ? { fields: dedupe(requested) } : {}),
      filters: filters as unknown as JsonValue,
      ...(search ? { search } : {}),
      limit: 100,
      offset,
    };
    const page = await context.listService.list(context.actor, context.tenantId, body);
    for (const row of page.rows) {
      if (rows.length < maxRows) rows.push(toFrappeListRow(row as JsonObject));
    }
    if (!page.has_more || page.rows.length === 0) break;
    offset += page.rows.length;
  }

  const columns = requested.length ? dedupe(requested) : [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const csv = encodeCsv(columns, rows);
  return new Response(`﻿${csv}`, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${doctype.replace(/[^A-Za-z0-9 _-]/g, "_")}.csv"`,
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

/**
 * CSV encoding with formula-injection defence.
 *
 * A value beginning `=`, `+`, `-` or `@` is prefixed with an apostrophe: without
 * that, opening the export in a spreadsheet EXECUTES it, which turns "download
 * your data" into remote code execution on the analyst's machine.
 */
function encodeCsv(columns: string[], rows: JsonObject[]): string {
  const escape = (value: unknown): string => {
    const text = value === null || value === undefined
      ? ""
      : typeof value === "object" ? JSON.stringify(value) : String(value);
    const guarded = /^[=+@-]/.test(text) ? `'${text}` : text;
    return /[",\r\n]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded;
  };
  return [
    columns.map(escape).join(","),
    ...rows.map((row) => columns.map((column) => escape(row[column])).join(",")),
  ].join("\r\n");
}

// ---- kanban -----------------------------------------------------------------

async function kanbanBoards(args: FrappeArgs, context: FrappeRouterContext): Promise<JsonObject[]> {
  const doctype = args.text("doctype") ?? null;
  if (doctype) {
    // Boards for a doctype the actor cannot read would disclose how that doctype
    // is organised, so read access is required before any board is listed.
    await context.permissions.getReadScope(context.actor, context.tenantId, doctype);
  }
  const boards = await context.deskViews.listKanbanBoards(context.tenantId, doctype, context.actor.user_id);
  return boards.map((board) => ({
    name: board.name,
    reference_doctype: board.reference_doctype,
    field_name: board.field_name,
    columns: board.columns as unknown as JsonValue,
    private: board.private ? 1 : 0,
  }));
}

/** Persists a column's card order. Never touches the documents themselves. */
async function kanbanReorder(args: FrappeArgs, context: FrappeRouterContext): Promise<JsonObject> {
  const boardName = args.requireText("board_name", 160);
  const columnName = args.requireText("column_name", 160);
  const order = args.array<string>("order") ?? [];
  const board = await context.deskViews.getKanbanBoard(context.tenantId, boardName);
  if (!board) throw errors.notFound("Kanban board not found");
  await context.permissions.getReadScope(context.actor, context.tenantId, board.reference_doctype);
  if (board.private && board.owner !== context.actor.user_id) throw errors.permission("This kanban board is private");

  await context.deskViews.setCardOrder(context.tenantId, boardName, columnName, order.map((entry) => String(entry)), context.now());
  return { board: boardName, column: columnName, cards: order.length };
}

/**
 * Moves a card between columns.
 *
 * This one DOES write the document, because the column is a real field value — the
 * move is a business change, not view state. It therefore goes through the normal
 * command path with its own concurrency check, so dragging a card cannot silently
 * overwrite an edit somebody else made to the same document.
 */
async function kanbanMove(args: FrappeArgs, context: FrappeRouterContext): Promise<JsonObject> {
  const boardName = args.requireText("board", 160);
  const documentName = args.requireText("docname", 320);
  const toColumn = args.requireText("to", 160);

  const board = await context.deskViews.getKanbanBoard(context.tenantId, boardName);
  if (!board) throw errors.notFound("Kanban board not found");
  const meta = await requireMeta(board.reference_doctype, context);
  const field = meta.fields.find((entry) => entry.fieldname === board.field_name);
  if (!field) throw errors.validation(`${board.reference_doctype} has no field ${board.field_name}`);
  assertKanbanField(field.options, board.field_name, [{ column_name: toColumn }]);

  const current = await loadWritable(board.reference_doctype, documentName, context);
  await context.runCommand(await buildCommand({
    tenantId: context.tenantId, actor: context.actor,
    doctype: board.reference_doctype, name: documentName,
    action: "save", expectedVersion: current.version,
    document: { ...current.data, [board.field_name]: toColumn },
  }));

  const comment = args.text("comment");
  if (comment) {
    await context.collaboration.addComment(
      context.tenantId, context.actor, board.reference_doctype, documentName, comment, context.now(),
    );
  }
  return toFrappeDoc(await loadReadable(board.reference_doctype, documentName, context));
}

// ---- notification log -------------------------------------------------------

async function notificationLogs(args: FrappeArgs, context: FrappeRouterContext): Promise<JsonObject> {
  const limit = args.int("limit", 20);
  // Always the caller's own inbox: a user id argument would be a way to read
  // somebody else's notifications.
  const logs = await context.deskViews.listNotifications(context.tenantId, context.actor.user_id, limit);
  return {
    notification_logs: logs as unknown as JsonValue,
    user_info: { [context.actor.user_id]: { fullname: context.fullName || context.actor.user_id } } as unknown as JsonValue,
  };
}

// ---- business context -------------------------------------------------------

/**
 * The dimensions a Desk-wide context selector offers (company, fiscal year, …).
 *
 * Each dimension's options come from master data, narrowed by the actor's User
 * Permissions — so the selector cannot offer a company the user is not permitted
 * to see, which would produce an empty screen after selecting it.
 */
// Nhãn tiếng Việt: đây là chữ hiện trên thanh chọn phạm vi ở đầu mọi màn hình, và nó là
// một trong số ít chuỗi do SERVER quyết định — client không có chỗ nào dịch nó.
const CONTEXT_DIMENSIONS: Array<{ key: string; label: string; recordType: string; required: boolean; dependsOn?: string }> = [
  { key: "company", label: "Công ty", recordType: "Company", required: true },
  { key: "fiscal_year", label: "Năm tài chính", recordType: "Fiscal Year", required: false },
  { key: "warehouse", label: "Kho", recordType: "Warehouse", required: false, dependsOn: "company" },
  { key: "branch", label: "Chi nhánh", recordType: "Branch", required: false, dependsOn: "company" },
  { key: "cost_center", label: "Trung tâm chi phí", recordType: "Cost Center", required: false, dependsOn: "company" },
  { key: "project", label: "Dự án", recordType: "Project", required: false },
  { key: "territory", label: "Khu vực", recordType: "Territory", required: false },
  { key: "selling_price_list", label: "Bảng giá bán", recordType: "Price List", required: false },
  { key: "buying_price_list", label: "Bảng giá mua", recordType: "Price List", required: false },
];

async function businessContext(args: FrappeArgs, context: FrappeRouterContext): Promise<JsonObject> {
  const requested = args.array<string>("dimensions");
  const wanted = requested?.length ? new Set(requested.map((entry) => String(entry))) : null;
  const permissions = await context.access.listUserPermissions(context.tenantId, context.actor.user_id);

  const dimensions: JsonObject[] = [];
  for (const dimension of CONTEXT_DIMENSIONS) {
    if (wanted && !wanted.has(dimension.key)) continue;
    const restrictions = permissions.filter((record) => record.allow_doctype === dimension.recordType);
    let options = await context.documents.listMasterRecords(context.tenantId, dimension.recordType, 200);
    // Kho nhóm chỉ là nút cấu trúc trong cây (ví dụ "Kho Alumdoor"), không phải
    // địa điểm vật lý có thể nhập/xuất. Không đưa nó vào bộ chọn phạm vi toàn hệ
    // thống, nếu không người dùng chọn một kho vốn không bao giờ có tồn.
    if (dimension.recordType === "Warehouse") {
      const warehouseData = new Map(
        (await context.documents.listMasterRecordData(context.tenantId, "Warehouse"))
          .map((record) => [record.name, record.data]),
      );
      options = options.filter((option) => Number(warehouseData.get(option.name)?.is_group ?? 0) !== 1);
    }
    const permitted = restrictions.length
      ? options.filter((option) => restrictions.some((record) => record.allow_name === option.name))
      : options;
    const defaultValue = restrictions.find((record) => record.is_default)?.allow_name ?? permitted[0]?.name;

    dimensions.push({
      key: dimension.key,
      label: dimension.label,
      // A dimension with no master data is reported disabled rather than as an
      // empty dropdown the user would try to use.
      enabled: permitted.length > 0,
      required: dimension.required,
      // Locked when a User Permission pins exactly one value: the user has no
      // choice to make, and offering one would imply they do.
      locked: restrictions.length === 1,
      ...(dimension.dependsOn ? { dependsOn: dimension.dependsOn } : {}),
      ...(defaultValue ? { defaultValue } : {}),
      options: permitted.map((option) => ({ value: option.name, label: option.label })) as unknown as JsonValue,
    });
  }
  return { dimensions: dimensions as unknown as JsonValue, selection: {} };
}

/**
 * Translates a context selection into list filters.
 *
 * Only dimensions the target doctype actually has a field for are applied. Applying
 * one it lacks would either error or filter on nothing; skipping it silently is
 * correct here because the selection is a global preference, not a request-specific
 * filter the user typed.
 */
async function contextFilters(doctype: string, selection: JsonObject, context: FrappeRouterContext): Promise<ListFilter[]> {
  const meta = await requireMeta(doctype, context);
  const fieldNames = new Set(meta.fields.map((field) => field.fieldname));
  const filters: ListFilter[] = [];
  for (const dimension of CONTEXT_DIMENSIONS) {
    const value = selection[dimension.key];
    if (typeof value !== "string" || !value) continue;
    if (!fieldNames.has(dimension.key)) continue;
    filters.push({ field: dimension.key, operator: "eq", value });
  }
  return filters;
}

async function contextualList(args: FrappeArgs, context: FrappeRouterContext): Promise<JsonObject[]> {
  const doctype = args.requireText("doctype", 160);
  const selection = args.object("context") ?? {};
  const contextual = await contextFilters(doctype, selection, context);
  const explicit = toKernelFilters(args.json("filters"), doctype);

  const body: JsonObject = {
    doctype,
    // Same translation as `listDocuments`. This is the path the Desk actually takes
    // whenever a business context is selected, so leaving it untranslated broke the
    // list view even after the plain list was fixed.
    fields: toKernelProjection((args.array<string>("fields") ?? ["name"]).map(String)),
    filters: [...explicit, ...contextual] as unknown as JsonValue,
    limit: clampPageLength(args.int("page_length", 20)),
    offset: args.int("limit_start", 0),
  };
  const search = toKernelSearch(args.json("or_filters"));
  if (search) body.search = search;
  const sort = toKernelSort(args.text("order_by"));
  if (sort.length) body.sort = sort as unknown as JsonValue;

  const page = await context.listService.list(context.actor, context.tenantId, body);
  return page.rows.map((row) => toFrappeListRow(row as JsonObject));
}

async function contextualCount(args: FrappeArgs, context: FrappeRouterContext): Promise<number> {
  const doctype = args.requireText("doctype", 160);
  const selection = args.object("context") ?? {};
  const contextual = await contextFilters(doctype, selection, context);
  const explicit = toKernelFilters(args.json("filters"), doctype);
  const body: JsonObject = { doctype, filters: [...explicit, ...contextual] as unknown as JsonValue };
  const search = toKernelSearch(args.json("or_filters"));
  if (search) body.search = search;
  const result = await context.listService.count(context.actor, context.tenantId, body);
  return typeof result === "number" ? result : Number((result as { count?: number }).count ?? 0);
}

function isPlatformAdmin(context: FrappeRouterContext): boolean {
  const { user_id: userId, roles } = context.actor;
  return userId === "Administrator" || roles.includes("Administrator") || roles.includes("System Manager");
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
    const permitted = await permittedNav(app.nav, context);
    readable.push({
      id: app.app_id,
      name: app.app_name,
      version: app.version,
      installed_at: app.installed_at,
      // `key` and `label` are what the client's catalog reads; `id`/`name` are kept
      // because the install and uninstall responses use those names.
      key: app.app_id,
      label: app.app_name,
      workspaces: workspacesFromNav(app.app_id, app.app_name, permitted),
    });
    navigable.push({ ...app, nav: permitted });
  }
  return { apps: readable, nav: combinedNavigation(navigable) };
}

/**
 * The overview dashboard, DERIVED from what is installed rather than configured.
 *
 * Every other approach here needs a definition per domain — a file someone writes for
 * "stock", another for "hr", another for "center" — and an app generated from a brief has
 * nobody to write it. So this reads the same metadata the rest of the platform already
 * holds: how many documents each doctype has, and for doctypes with a workflow, how many
 * sit in each state.
 *
 * That yields a real dashboard for an app that declared nothing beyond its doctypes, which
 * is the only version of this feature compatible with apps being data.
 *
 * Cost is bounded deliberately. One count per doctype plus one per workflow state is a lot
 * of round trips on a tenant with many apps, and a dashboard that times out is worse than a
 * thin one — so doctypes are capped and only the ones with a workflow pay for state counts.
 */
const OVERVIEW_MAX_DOCTYPES = 12;
const OVERVIEW_MAX_STATES = 6;

async function overviewDashboard(args: FrappeArgs, context: FrappeRouterContext): Promise<JsonObject> {
  const requested = args.text("domain") ?? args.text("app");
  const installed = await context.apps.list(context.tenantId);
  // `domain` names a client-side grouping, not an app id, so it is matched loosely and
  // never used to exclude everything — an unrecognised domain shows the whole tenant
  // rather than an empty screen the user cannot explain.
  const apps = installed.filter((app) => !requested || app.app_id === requested) .length
    ? installed.filter((app) => !requested || app.app_id === requested)
    : installed;

  const metrics: JsonObject[] = [];
  const tasks: JsonObject[] = [];
  const charts: JsonObject[] = [];
  const actions: JsonObject[] = [];

  const doctypes: Array<{ key: string; label: string; icon?: string; app: string }> = [];
  for (const app of apps) {
    for (const item of await permittedNav(app.nav, context)) {
      if (item.kind !== "doctype" || doctypes.some((entry) => entry.key === item.key)) continue;
      doctypes.push({ key: item.key, label: item.label, ...(item.icon ? { icon: item.icon } : {}), app: app.app_id });
    }
  }

  /**
   * Counts through `toKernelFilters`, the SAME translator every other list path uses.
   *
   * Handing the kernel a raw Frappe-shaped filter looks like it should work and does not:
   * field names differ (`modified` vs `modified_at`) and the operator form is not the one
   * the compiler expects. It fails silently into the catch below, so the dashboard renders
   * with every state count missing and no error anywhere — which is exactly what happened
   * on the first run: twelve correct totals and not one task.
   */
  const count = async (doctype: string, filters?: JsonValue): Promise<number> => {
    const result = await context.listService.count(context.actor, context.tenantId, {
      doctype,
      ...(filters === undefined ? {} : { filters: toKernelFilters(filters, doctype) as unknown as JsonValue }),
    });
    return typeof result === "number" ? result : Number((result as { count?: number }).count ?? 0);
  };

  /**
   * Every doctype's numbers are fetched CONCURRENTLY, then folded in declaration order.
   *
   * Written as a plain `for … await` first, and that cost roughly what you would expect:
   * one round trip per doctype, plus one per workflow state, all in series. On a tenant
   * with nine doctypes the dashboard took ~800 ms to answer while each individual query
   * took ~20 ms — the screen was not doing hard work, it was queueing.
   *
   * The fold below stays sequential on purpose: metrics, tasks and charts are arrays the
   * client renders in order, and resolving concurrently while APPENDING concurrently
   * would reorder the cards run to run for no reason a user could understand.
   */
  const perDoctype = await Promise.all(doctypes.slice(0, OVERVIEW_MAX_DOCTYPES).map(async (entry) => {
    let total: number | null = null;
    try {
      total = await count(entry.key);
    } catch {
      // A doctype that cannot be counted is skipped, not reported as zero: "0 học viên"
      // on a tenant with 120 of them is a lie, while a missing card is visibly missing.
      return { entry, total: null, workflow: null, states: [] as Array<{ state: string; docstatus: number; count: number }> };
    }
    const workflow = await context.metadata.getWorkflow(context.tenantId, entry.key);
    if (!workflow?.is_active) return { entry, total, workflow: null, states: [] as Array<{ state: string; docstatus: number; count: number }> };
    // Deliberately NOT wrapped in a catch. A state count that fails and is swallowed
    // produces a dashboard reporting "0 việc đang chờ" on a tenant with sixty — a
    // confident lie, and the exact failure this whole screen exists to prevent.
    const states = await Promise.all(workflow.states.slice(0, OVERVIEW_MAX_STATES).map(async (state) => ({
      state: state.state,
      docstatus: state.docstatus,
      count: await count(entry.key, [[workflow.state_field || "workflow_state", "=", state.state]] as unknown as JsonValue),
    })));
    return { entry, total, workflow, states };
  }));

  for (const { entry, total, workflow, states } of perDoctype) {
    if (total === null) continue;
    metrics.push({
      key: `count:${entry.key}`,
      label: entry.label,
      value: total,
      icon: entry.icon ?? "layers",
      route: `/app/${encodeURIComponent(entry.key)}`,
      tone: "neutral",
      description: `Tổng số bản ghi`,
    });
    actions.push({ key: `new:${entry.key}`, label: `Thêm ${entry.label.toLowerCase()}`, icon: "plus", route: `/app/${encodeURIComponent(entry.key)}?new=1` });

    if (!workflow) continue;

    // States a transition can LEAVE are the ones with work outstanding — the same
    // derivation the approval inbox uses, so the number on this card and the number of
    // cards in that queue cannot disagree.
    const pending = [...new Set(workflow.transitions.map((transition) => transition.state))];
    const labels: string[] = [];
    const values: number[] = [];
    for (const { state, docstatus, count: stateCount } of states) {
      labels.push(state);
      values.push(stateCount);
      if (!pending.includes(state) || stateCount === 0) continue;
      tasks.push({
        key: `pending:${entry.key}:${state}`,
        label: `${entry.label} · ${state}`,
        count: stateCount,
        tone: docstatus === 0 ? "warning" : "info",
        // Straight to the operational queue when the app declared one, so a number on a
        // dashboard is one click from the work it describes.
        route: `/x/${encodeURIComponent(`approval:${entry.key}`)}`,
        description: "Đang chờ xử lý",
      });
    }
    if (labels.length) {
      charts.push({
        key: `states:${entry.key}`,
        label: `${entry.label} theo trạng thái`,
        type: "donut",
        labels,
        series: [{ name: entry.label, values }],
        route: `/app/${encodeURIComponent(entry.key)}`,
      });
    }
  }

  // Recent activity, from the doctypes most likely to move. Bounded to two so the
  // dashboard stays one screen's worth of queries.
  const activities: JsonObject[] = [];
  for (const entry of doctypes.filter((candidate) => tasks.some((task) => String(task.key).includes(candidate.key))).slice(0, 2)) {
    try {
      const page = await context.listService.list(context.actor, context.tenantId, {
        doctype: entry.key,
        limit: 5,
        sort: [{ field: "modified_at", direction: "desc" }] as unknown as JsonValue,
      });
      for (const row of page.rows as JsonObject[]) {
        activities.push({
          key: `${entry.key}:${String(row.name)}`,
          label: `${entry.label} ${String(row.name)}`,
          ...(row.workflow_state ? { description: String(row.workflow_state) } : {}),
          ...(row.modified_at ? { timestamp: String(row.modified_at) } : {}),
          route: `/app/${encodeURIComponent(entry.key)}/${encodeURIComponent(String(row.name))}`,
        });
      }
    } catch { /* a doctype that will not list simply contributes nothing */ }
  }

  const primary = apps.find((app) => app.client) ?? apps[0];
  return {
    key: requested ?? primary?.app_id ?? "forge",
    label: primary?.app_name ?? "Tổng quan",
    subtitle: metrics.length ? `${metrics.length} nhóm dữ liệu · ${tasks.reduce((sum, task) => sum + Number(task.count ?? 0), 0)} việc đang chờ` : "Chưa có dữ liệu để tổng hợp",
    metrics: metrics as unknown as JsonValue,
    charts: charts as unknown as JsonValue,
    tasks: tasks as unknown as JsonValue,
    activities: activities.slice(0, 8) as unknown as JsonValue,
    actions: actions.slice(0, 6) as unknown as JsonValue,
  };
}

/** Nav entries whose target this actor may actually open. */
async function permittedNav<T extends { key: string; kind?: string; permission_doctype?: string }>(nav: T[], context: FrappeRouterContext): Promise<T[]> {
  const permitted: T[] = [];
  for (const item of nav) {
    // Data-backed experiences (approval inboxes today, richer workspaces later)
    // must be hidden by the same read gate as their underlying DocType.
    const permissionDoctype = item.permission_doctype
      ?? (item.kind === "doctype" ? item.key : undefined)
      ?? (item.kind === "experience" && item.key.startsWith("approval:")
        ? item.key.slice("approval:".length)
        : undefined);
    if (!permissionDoctype) { permitted.push(item); continue; }
    try {
      await context.permissions.getReadScope(context.actor, context.tenantId, permissionDoctype);
      permitted.push(item);
    } catch {
      // Omitted rather than shown-and-broken.
    }
  }
  return permitted;
}

/**
 * The whole client manifest for this tenant, assembled from what is installed.
 *
 * This is what makes ONE client bundle serve every app. Previously the brand, landing
 * screen, domain and context dimensions lived in a TypeScript file compiled into a
 * per-app build, so a new app meant a new build to host somewhere — and "install an
 * app" only did half the job.
 *
 * Nav is the union across apps, and it is filtered by permission BEFORE `home` is
 * resolved: an actor who cannot read the landing doctype must not be sent there, or
 * their first screen after login is a permission error.
 */
async function clientManifest(args: FrappeArgs, context: FrappeRouterContext): Promise<JsonObject> {
  const requested = args.text("app");
  const installed = await context.apps.list(context.tenantId);
  const apps = requested ? installed.filter((app) => app.app_id === requested) : installed;
  if (requested && !apps.length) throw errors.validation(`App ${requested} is not installed on this tenant`);

  // The app that owns presentation: the one asked for, else the first that declares any.
  // Falling back to the first installed app rather than to nothing means a tenant whose
  // apps all omit `client` still gets a working Desk instead of a blank screen.
  const primary = apps.find((app) => app.client) ?? apps[0];
  const client = primary?.client ?? {};

  const nav: JsonObject[] = [];
  const actions: JsonObject[] = [];
  const seenPaths = new Set<string>();
  for (const app of apps) {
    /**
     * Actions the actor may actually run, by the SAME gate their menu entry uses.
     *
     * Sent even when no nav entry opens them, because a screen can also be reached by
     * URL — filtering here rather than in the menu is what makes the two agree. The
     * server still checks every write the method performs; this only decides whether the
     * form is worth showing, so that a refusal arrives before it is filled in and not
     * after.
     */
    for (const action of app.actions ?? []) {
      try {
        await context.permissions.assert({ actor: context.actor, tenantId: context.tenantId, doctype: action.permission_doctype, action: "save", data: {} });
        actions.push({ ...(action as unknown as JsonObject), app: app.app_id });
      } catch {
        // Omitted rather than offered-and-refused.
      }
    }
    for (const item of await permittedNav(app.nav, context)) {
      const path = navItemPath(item as Parameters<typeof navItemPath>[0]);
      // Two entries resolving to one path is not a duplicate menu line — the client
      // router matches the FIRST only, so the second is permanently unreachable.
      if (!path || seenPaths.has(path)) continue;
      seenPaths.add(path);
      nav.push({
        key: item.key,
        label: item.label,
        kind: item.kind,
        app: app.app_id,
        ...(item.icon ? { icon: item.icon } : {}),
        ...(item.group ? { group: item.group } : {}),
        ...(item.route ? { route: item.route } : {}),
      });
    }
  }

  // A home the actor cannot reach is worse than no home: the router would bounce off
  // its catch-all straight back to it. Drop to the first nav entry they DO have.
  const declaredHome = client.home ?? {};
  const homeRoute = typeof declaredHome.route === "string" ? declaredHome.route : undefined;
  const homeDoctype = typeof declaredHome.doctype === "string" ? declaredHome.doctype : undefined;
  const home = homeRoute && seenPaths.has(homeRoute)
    ? { route: homeRoute, ...(homeDoctype ? { doctype: homeDoctype } : {}) }
    : homeDoctype && seenPaths.has(`/app/${encodeURIComponent(homeDoctype)}`)
      ? { doctype: homeDoctype }
      : fallbackHome(nav);

  return {
    id: primary?.app_id ?? "forge",
    name: primary?.app_name ?? "Forge",
    ...(primary?.version ? { version: primary.version } : {}),
    ...(client.brand ? { brand: client.brand } : {}),
    ...(client.domain ? { domain: client.domain } : {}),
    ...(client.locale ? { locale: client.locale as unknown as JsonValue } : {}),
    catalogMode: client.catalog_mode ?? "hybrid",
    businessContext: {
      mode: "server-resolved",
      // Absent means "no global scope selector". An app that does not need one must not
      // be given the default set, or the shell blocks on a scope it never uses.
      dimensions: (client.dimensions ?? []) as unknown as JsonValue,
    },
    home: home as unknown as JsonValue,
    nav: nav as unknown as JsonValue,
    actions: actions as unknown as JsonValue,
    apps: apps.map((app) => ({ id: app.app_id, name: app.app_name, version: app.version })) as unknown as JsonValue,
  };
}

/** First reachable nav target, or the catalog — never nothing. */
function fallbackHome(nav: JsonObject[]): JsonObject {
  for (const item of nav) {
    if (item.kind === "doctype") return { doctype: String(item.key) };
    const path = navItemPath(item as unknown as Parameters<typeof navItemPath>[0]);
    if (path) return { route: path };
  }
  return { route: "/catalog" };
}

/**
 * An app's nav entries as the catalog workspaces the client expects.
 *
 * `workspaces` was missing entirely, and its absence is not a degraded menu — the
 * client does `for (const ws of app.workspaces)` while flattening the catalog, so an
 * app without it throws `workspaces is not iterable` and the WHOLE Desk renders blank.
 *
 * It stayed hidden because the loop never runs when no app is installed: a tenant with
 * an empty catalog works perfectly, and the first app installed is what breaks it.
 *
 * Nav entries are grouped by their declared `group`, which is the only structure an app
 * gives us. An app that declares no groups gets one workspace named after itself rather
 * than none — a workspace-less app would silently vanish from the catalog.
 */
function workspacesFromNav(appId: string, appName: string, nav: { key: string; label: string; kind?: string; icon?: string; group?: string }[]): JsonObject[] {
  const groups = new Map<string, typeof nav>();
  for (const item of nav) {
    const group = item.group?.trim() || appName;
    const bucket = groups.get(group);
    if (bucket) bucket.push(item);
    else groups.set(group, [item]);
  }

  return [...groups.entries()].map(([group, items], index) => ({
    key: `${appId}:${group}`,
    label: group,
    module: appName,
    route: `/app/${encodeURIComponent(items[0]?.key ?? appId)}`,
    order: index,
    sections: [{
      key: `${appId}:${group}:items`,
      label: group,
      kind: "transactions",
      items: items.map((item, position) => ({
        key: item.key,
        label: item.label,
        kind: item.kind ?? "doctype",
        route: `/app/${encodeURIComponent(item.key)}`,
        ...(item.icon ? { icon: item.icon } : {}),
        ...(item.kind === "doctype" || !item.kind ? { doctype: item.key } : {}),
        order: position,
      })),
    }],
  })) as unknown as JsonObject[];
}

/**
 * Forwards a method to the app that owns its namespace, or returns null.
 *
 * Null — not a throw — when no app claims it, so the caller still reports the honest
 * "not implemented on this platform" instead of an app-flavoured error for a method no
 * app was ever asked about.
 *
 * The app's answer is wrapped in `message` like any other method: from the client's
 * side an app method is indistinguishable from a platform one, which is the point.
 */
async function callAppMethod(methodName: string, args: FrappeArgs, context: FrappeRouterContext): Promise<Response | null> {
  if (!context.appMethods?.DISPATCHER) return null;

  const target = appMethodTarget(await context.apps.list(context.tenantId), methodName);
  if (!target) return null;

  const result = await dispatchAppMethod({
    env: context.appMethods,
    tenantId: context.tenantId,
    target,
    methodName,
    args: args.all(),
    actor: context.actor,
    traceId: context.traceId,
  });
  return methodResponse(result.value);
}

/**
 * Assembles the storefront context from the INSTALLED manifest.
 *
 * Read per request rather than cached, because the alternative is a storefront that
 * keeps serving a product list an administrator has just unpublished — and "I removed
 * it and it is still on the website" is the one bug nobody accepts an explanation for.
 */
async function storefrontContext(context: FrappeRouterContext): Promise<StorefrontContext> {
  if (!context.webForms) throw errors.notFound("This deployment has no public surface");

  const apps = await context.apps.list(context.tenantId);
  const withStorefront = apps.filter((app) => app.storefront);
  if (withStorefront.length === 0) throw errors.notFound("No storefront is installed");
  // More than one storefront would make "the catalogue" ambiguous, and picking the first
  // silently would serve one shop's products under another shop's URL.
  if (withStorefront.length > 1) {
    throw errors.validation(`More than one installed app declares a storefront: ${withStorefront.map((app) => app.app_id).join(", ")}`);
  }
  const spec = withStorefront[0]!.storefront!;

  const catalogMeta = await context.metadata.getDocType(context.tenantId, spec.catalog.doctype);
  if (!catalogMeta) throw errors.notFound("The storefront's catalogue doctype is not installed");
  assertStorefrontSpec(spec, catalogMeta);

  return {
    db: context.webForms.db,
    tenantId: context.tenantId,
    now: context.now(),
    salt: context.webForms.salt,
    clientAddress: context.webForms.clientAddress,
    spec,
    catalogMeta,
  };
}

/**
 * Accepts a public order.
 *
 * The write goes through the SAME command path as every other write — `runCommand`, the
 * aggregate, the audit trail — with an actor carrying one role. A separate insert here
 * would be a second write path with its own rules, and the rules that get forgotten are
 * always the ones on the path nobody looks at.
 */
async function placeStorefrontOrder(args: FrappeArgs, context: FrappeRouterContext): Promise<JsonObject> {
  const storefront = await storefrontContext(context);
  // Counted BEFORE the write, so a flood cannot fill the tenant's database and only
  // then be told to stop.
  await consumeOrderAllowance(storefront);

  const submitted = args.json<JsonObject>("order") ?? {};
  const built = await buildStorefrontOrder(storefront, submitted);

  const name = await context.metadata.nextName(
    context.tenantId,
    built.doctype,
    (await context.metadata.getDocType(context.tenantId, built.doctype))?.autoname ?? "hash",
    storefront.now,
    built.document,
  );

  const command = await buildCommand({
    tenantId: context.tenantId,
    doctype: built.doctype,
    name,
    action: "create",
    expectedVersion: null,
    document: built.document,
    actor: built.actor,
  });
  await context.runCommand(command);

  // The buyer is told the code and nothing else. Echoing the stored document back would
  // hand an unauthenticated caller whatever defaults and server-side fields it picked up.
  return { code: name, tracking_field: storefront.spec.order?.track_field ?? "" };
}

function fileStore(context: FrappeRouterContext): FileStore {
  if (!context.files) throw errors.notFound("File storage is not configured on this deployment");
  return { db: context.files.db, bucket: context.files.bucket, tenantId: context.tenantId, now: context.now() };
}

/**
 * Asserts that the caller may perform `action` on a specific document.
 *
 * Loads the document first because the permission layer decides on the ROW, not on the
 * doctype alone: owner-only rules and field conditions cannot be evaluated without it,
 * and a doctype-level check would quietly grant access to records the user's own
 * permission rules exclude.
 */
async function assertDocumentAction(
  context: FrappeRouterContext,
  doctype: string,
  name: string,
  action: "read" | "save",
): Promise<void> {
  const document = await context.documents.getDocument(context.tenantId, doctype, name);
  if (!document) throw errors.notFound();
  await context.permissions.assert({
    actor: context.actor, tenantId: context.tenantId, doctype, name,
    owner: document.owner, data: document.data, action,
  });
}

/**
 * Serves `/files/<id>`, or null when the path is not one.
 *
 * Separate from `routeFrappeApi` because this path is NOT under `/api/`: it is a URL that
 * ends up inside an `<img src>` on a public page, and it has to look like one. The
 * tenant worker calls it before its own routing for the same reason.
 */
export async function routeFileDownload(url: URL, context: FrappeRouterContext): Promise<Response | null> {
  const fileId = matchFilePath(url.pathname);
  if (!fileId) return null;
  try {
    return await serveFile(fileId, context.actor, fileStore(context), (doctype, name) =>
      assertDocumentAction(context, doctype, name, "read"));
  } catch (error) {
    return faultResponse(error, context.traceId);
  }
}

function webFormStore(context: FrappeRouterContext) {
  if (!context.webForms) throw errors.notFound("Web forms are not available on this deployment");
  return { db: context.webForms.db, tenantId: context.tenantId, now: context.now(), salt: context.webForms.salt };
}

/**
 * Accepts a public submission.
 *
 * Order matters and is deliberate: published → login requirement → CEILING → payload
 * validation → write. The ceiling is consumed before anything expensive, so a visitor
 * cannot make the platform do work it will then refuse to keep.
 */
async function acceptWebForm(args: FrappeArgs, context: FrappeRouterContext): Promise<JsonObject> {
  const store = webFormStore(context);
  const form = await loadPublishedForm(store, args.requireText("route", 200));

  // A form marked `login_required` is an internal one served through the same
  // machinery; a guest reaching it gets the ordinary refusal, not a form-specific one.
  if (form.login_required && context.actor.user_id === "Guest") {
    throw errors.permission("Login to access this resource");
  }

  await consumeSubmissionAllowance(store, form, context.webForms!.clientAddress);

  const meta = await requireMeta(form.doc_type, context);
  const document = submissionDocument(form, meta, args.object("data") ?? {});

  // The submission's own actor — Guest carrying only the form's role — so the ordinary
  // permission layer decides. Nothing here grants anything.
  const actor = submissionActor(form);
  await context.permissions.assert({
    actor, tenantId: context.tenantId, doctype: form.doc_type,
    action: "create", owner: actor.user_id,
  });

  const name = await resolveNewName(form.doc_type, meta, document, context);
  await context.runCommand(await buildCommand({
    tenantId: context.tenantId, actor, doctype: form.doc_type, name,
    action: "create", expectedVersion: null, document,
  }));

  // The submitter is told their submission landed and nothing else — not the document's
  // name, which would let anyone who can post to a public form enumerate the series.
  return { ok: true, message: form.success_message || "Đã ghi nhận" };
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
  // A Single is named after its doctype, so there is exactly one and its name is
  // predictable. Honouring an autoname here would mint a second one.
  if (meta.is_single) return doctype;
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
