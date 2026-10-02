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

import {
  appMethodTarget, areaTierBasisSqm, assertItemPriceTierIsUnambiguous, blocksSelfApproval, combinedNavigation, derivePurchaseQuantityAxis, dispatchAppMethod, errors, evaluateWorkflowCondition, mergeCustomizations,
  navItemPath, parseCsvImport, parseCustomField, parseDocTypeMeta, parsePropertySetter, parseQueryRequest,
  permissionAllows, renderPrintFormat, resolveAutoname, sha256Hex, validateWorkflow,
  type Actor, type AppInstaller, type AppMethodEnv, type AppReportService, type AppReportSpec,
  type CanonicalDocument, type CustomFieldRecord, type CustomizationStore, type D1CollaborationService,
  type D1MutationStore, type D1ReportService, type D1SearchStore, type D1UserStore, type DocTypeMeta,
  type DocumentAccessStore, type DocumentGroupProjection, type DocumentListService, type ExtendedPermissionAction, type JsonObject,
  type JsonValue, type ListFilter, type MetadataPermissionService, type MetadataStore, type MutationAction,
  type MutationCommand, type MutationReceipt, type PropertySetterRecord, type QueryFilter,
} from "./router-platform.js";
import { FrappeArgs, readFrappeArgs } from "./args.js";
import { VERTICAL_METHODS } from "./vertical-methods.js";
import {
  assertDocumentAction, getReadableStoredDocument, isPlatformAdmin, loadReadable, loadWritable, workflowTransitionAccess,
} from "./document-access.js";
import {
  CONTEXT_DIMENSIONS, OVERVIEW_MAX_DOCTYPES, clampPageLength, contextFilters, dedupe, permittedNav,
  requireMeta, stringOr, stripFieldQualifier, toKernelProjection,
} from "./router-helpers.js";
import { batchDisplayValues, resolveDisplayValues, searchLink } from "./link-search.js";
import {
  approvalInbox, businessContext, capabilities, capabilityFlags, listView, numericPermissionFlags,
  openCount, overviewDashboard, runQueryReport,
} from "./desk-surfaces.js";
// Giữ nguyên bề mặt export của router: hai ký hiệu này vốn được export từ đây.
export { hasRequiredNavRole } from "./router-helpers.js";
export { resolveContextDimensionValue } from "./desk-surfaces.js";
import type { VerticalRouterHooks } from "./vertical-methods.js";
import { LINK_DISPLAY_RULES } from "./vertical-display.js";
import { assertModifiedMatches, buildCommand, stripServerOwnedFields } from "./command.js";
import { fromFrappeDoc, toFrappeDoc, toFrappeListRow } from "./doc-shape.js";
import { faultResponse, methodResponse, resourceResponse, responseFieldsResponse, v2DataResponse, v2FaultResponse } from "./envelope.js";
import { consumeSubmissionAllowance, loadPublishedForm, publicFormShape, submissionActor, submissionDocument } from "./web-form-routes.js";
import type { IntegrationApi } from "./integration-methods.js";
import { CloudForgeError } from "../../core/src/index.js";
import { WEB_FORM_READ, WEB_FORM_LIST, WEB_FORM_UPDATE, WEB_FORM_DELETE, webFormPortalRead, webFormPortalList, webFormPortalUpdate, webFormPortalDelete } from "./web-form-portal.js";
import { handleUploadFile, matchFilePath, readFileContent, serveFile, UPLOAD_FILE_PATH, type FileStore } from "./files.js";
import {
  assertStorefrontSpec, buildStorefrontOrder, consumeOrderAllowance, storefrontCatalog,
  storefrontProduct, trackStorefrontOrder, type StorefrontContext,
} from "./storefront.js";
import { toKernelField, toKernelFilters, toKernelSearch, toKernelSort } from "./filters.js";
import {
  childDocTypeNames, maskedFieldNames, tableFieldNames, toFrappeDocType, toFrappeMetaBundle, toFrappeWorkflow,
} from "./meta-shape.js";
import { hashPassword, verifyPassword } from "./password.js";
import { mintImpersonatedSession, type AuthRouteContext, type EstablishedSession } from "./auth-routes.js";
import type { D1TranslationStore } from "./translations.js";
import { assertKanbanField, type D1DeskViewStore } from "./desk-views.js";
import {
  assertExactUserPermission,
  evaluatePermissionCapabilities,
  isAccessAdministrator,
  parseUserPermissionIdentity,
  resolveAccessInspectionActor,
  userPermissionIdentity,
} from "./access-control.js";

/**
 * Contract version, surfaced to the client as `frappe_version`.
 *
 * The client folds this into its cache scope key, so it MUST change whenever the
 * wire contract changes — otherwise a browser keeps serving documents shaped by
 * the previous contract after a deploy.
 */
export const FORGE_CONTRACT_VERSION = "16.0.0-forge.4";

export interface FrappeRouterContext extends VerticalRouterHooks {
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
  /**
   * The verified app id for an app Worker callback.  This is absent for browser
   * sessions and development actors; it is gateway-attributed, never request input.
   */
  appCallbackAppId?: string;
  now(): string;
  /** Overlay store for Custom Field / Property Setter. */
  customizations: CustomizationStore;
  /** Server-side translation catalogue. */
  translations: D1TranslationStore;
  /** Installed-app registry. */
  apps: AppInstaller;
  /** User directory, for roles, password changes and session revocation. */
  users: D1UserStore;
  /** Present only for a browser cookie session; privileged identity-switching needs it. */
  authContext?: AuthRouteContext;
  establishedSession?: EstablishedSession;
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
  /** G03 organization, delegation, SoD and immutable audit query authority. */
  organizationSecurity?: {
    canActThroughDelegation(
      tenantId: string, actor: Actor, transitionRole: string, doctype: string,
      action: string, document: JsonObject, expectedGrantor?: string,
    ): Promise<{ allowed: boolean; delegation?: string; grantor?: string }>;
    listAuditEvents(tenantId: string, actor: Actor, input?: {
      entity_type?: string; entity_name?: string; actor?: string; action?: string;
      from?: string; to?: string; cursor?: string; limit?: number;
    }): Promise<{ events: JsonObject[]; next_cursor: string | null }>;
    checkSoD(tenantId: string, actor: Actor, doctype: string, name: string, action: string): Promise<JsonObject>;
  };
  /** CSRF nonce of the current session, for the boot payload. */
  csrfToken: string;
  /** Epoch seconds of the last password login; absent for app callbacks and dev actors. */
  authenticatedAt?: number;
  /** Continue bounded background work after the HTTP response (Cloudflare waitUntil). */
  defer?: (work: Promise<unknown>) => void;
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
  /** Trusted tenant/user-bound integration control service; never exposes credential material. */
  integrations?: IntegrationApi;
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

function rbacAudit(context: FrappeRouterContext, source: string, reason?: string) {
  return {
    actorUserId: context.actor.user_id,
    traceId: context.traceId,
    source,
    ...(reason ? { reason } : {}),
  };
}

const RESOURCE_PATH = /^\/api\/resource\/([^/]+)(?:\/([^/]+))?$/;
const METHOD_PATH = /^\/api\/method\/([A-Za-z0-9_.]+)$/;
const V2_DOCUMENT_PATH = /^\/api\/v2\/document\/([^/]+)(?:\/([^/]+))?(?:\/(copy|method)(?:\/([^/]+))?)?\/?$/;
const V2_DOCTYPE_PATH = /^\/api\/v2\/doctype\/([^/]+)\/(meta|count)\/?$/;
const V2_METHOD_PATH = /^\/api\/v2\/method\/(.+)$/;

export function isFrappePath(pathname: string): boolean {
  return pathname.startsWith("/api/resource/")
    || pathname.startsWith("/api/method/")
    || pathname.startsWith("/api/v2/");
}

export async function routeFrappeApi(request: Request, url: URL, context: FrappeRouterContext): Promise<Response | null> {
  if (!isFrappePath(url.pathname)) return null;
  try {
    if (url.pathname.startsWith("/api/v2/")) {
      const v2 = await routeFrappeV2(request, url, context);
      if (v2) return v2;
      return v2FaultResponse(errors.notFound("Unknown API v2 path"), context.traceId);
    }

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
    return url.pathname.startsWith("/api/v2/")
      ? v2FaultResponse(error, context.traceId)
      : faultResponse(error, context.traceId);
  }
}

async function routeFrappeV2(
  request: Request,
  url: URL,
  context: FrappeRouterContext,
): Promise<Response | null> {
  const method = request.method.toUpperCase();

  // Upload is multipart and must be handled before generic argument parsing.
  if (url.pathname === "/api/v2/method/upload_file") {
    if (method !== "POST") throw errors.validation("upload_file accepts POST");
    return v2DataResponse(await handleUploadFile(
      request,
      context.actor,
      fileStore(context),
      (doctype, name) => assertDocumentAction(context, doctype, name, "save"),
    ));
  }

  const args = await readFrappeArgs(request, url);

  const docMatch = V2_DOCUMENT_PATH.exec(url.pathname);
  if (docMatch) {
    const doctype = decodeURIComponent(docMatch[1]!);
    const name = docMatch[2] ? decodeURIComponent(docMatch[2]) : null;
    const operation = docMatch[3];
    const operationName = docMatch[4] ? decodeURIComponent(docMatch[4]) : null;

    if (operation === "copy") {
      if (method !== "GET" || !name) throw errors.validation("Document copy accepts GET on a named document");
      const source = await loadReadable(doctype, name, context);
      const meta = await requireMeta(doctype, context);
      const copy = dropNoCopyFields(structuredClone(source.data) as JsonObject, meta);
      // Frappe copy returns a clean insertable document, not the source identity/lifecycle.
      return v2DataResponse({ doctype, ...copy });
    }

    if (operation === "method") {
      if (!name || !operationName) throw errors.validation("Document method requires document and method names");
      // The compatibility layer exposes only methods backed by canonical Forge authorities.
      // It deliberately cannot execute arbitrary Python controller/server-script methods.
      if (operationName === "submit") {
        if (method !== "POST") throw errors.validation("submit requires POST");
        return v2DataResponse(await transition("submit", v2TransitionArgs(doctype, name, args), context));
      }
      if (operationName === "cancel") {
        if (method !== "POST") throw errors.validation("cancel requires POST");
        return v2DataResponse(await transition("cancel", v2TransitionArgs(doctype, name, args), context));
      }
      if (operationName === "add_comment") {
        if (method !== "POST") throw errors.validation("add_comment requires POST");
        const text = args.text("text") ?? args.text("content");
        if (!text) throw errors.validation("text is required");
        await assertDocumentAction(context, doctype, name, "read");
        return v2DataResponse(await context.collaboration.addComment(
          context.tenantId, context.actor, doctype, name, text, context.now(),
        ));
      }
      throw errors.notFound(`Unsupported v2 document method: ${operationName}`);
    }

    if (!name) {
      if (method === "GET") {
        const asDict = !args.has("as_dict") || args.bool("as_dict", true);
        const groupByText = args.text("group_by")?.trim();
        const limit = clampPageLength(args.int("limit", 20));
        if (groupByText) {
          const groupBy = groupByText.split(",")
            .map((field) => toKernelField(stripFieldQualifier(field.trim().replace(/`/g, ""))))
            .filter(Boolean);
          const requestedFields = args.array<string>("fields") ?? groupBy;
          const projections = parseV2GroupProjections(requestedFields, groupBy);
          const body: JsonObject = {
            doctype,
            filters: toKernelFilters(args.json("filters"), doctype) as unknown as JsonValue,
            limit,
            offset: args.int("start", 0),
          };
          const search = toKernelSearch(args.json("or_filters"));
          if (search) body.search = search;
          const grouped = await context.listService.group(context.actor, context.tenantId, body, groupBy, projections);
          const data = asDict
            ? grouped.rows
            : grouped.rows.map((row) => projections.map((projection) => row[projection.alias] ?? null));
          return v2DataResponse(data, 200, { has_next_page: grouped.has_more });
        }

        const requestedFields = args.array<string>("fields") ?? ["name"];
        const adaptedUrl = new URL(url);
        adaptedUrl.searchParams.set("limit", String(limit + 1));
        adaptedUrl.searchParams.set("limit_start", String(args.int("start", 0)));
        const adapted = await readFrappeArgs(new Request(adaptedUrl, { method: "GET", headers: request.headers }), adaptedUrl);
        const rows = await listDocuments(doctype, adapted, context);
        const page = rows.slice(0, limit);
        const data = asDict
          ? page
          : page.map((row) => requestedFields.map((field) => row[field] ?? null));
        return v2DataResponse(data, 200, { has_next_page: rows.length > limit });
      }
      if (method === "POST") return v2DataResponse(await createDocument(doctype, args, context));
      throw errors.validation(`${method} is not supported on a v2 doctype collection`);
    }

    if (method === "GET") return v2DataResponse(toFrappeDoc(await loadReadable(doctype, name, context)));
    if (method === "PATCH" || method === "PUT") {
      // Deliberately stronger than upstream v2: Forge requires the last-read modified token.
      // Never weaken OCC merely for route parity.
      return v2DataResponse(await saveDocument(doctype, name, args, context));
    }
    if (method === "DELETE") {
      await deleteDocument(doctype, name, context);
      return v2DataResponse("ok", 202);
    }
    throw errors.validation(`${method} is not supported on a v2 document`);
  }

  const doctypeMatch = V2_DOCTYPE_PATH.exec(url.pathname);
  if (doctypeMatch) {
    const doctype = decodeURIComponent(doctypeMatch[1]!);
    const operation = doctypeMatch[2];
    if (method !== "GET") throw errors.validation(`${operation} accepts GET`);
    if (operation === "meta") {
      const meta = await requireMeta(doctype, context);
      return v2DataResponse(toFrappeDocType(meta, await context.metadata.getWorkflow(context.tenantId, doctype)));
    }
    const countArgsUrl = new URL(url);
    countArgsUrl.searchParams.set("doctype", doctype);
    const countArgs = await readFrappeArgs(new Request(countArgsUrl, { method: "GET", headers: request.headers }), countArgsUrl);
    return v2DataResponse(await countDocuments(countArgs, context));
  }

  const methodMatch = V2_METHOD_PATH.exec(url.pathname);
  if (methodMatch) {
    const methodName = decodeURIComponent(methodMatch[1]!);
    if (methodName === "ping") return v2DataResponse("pong");
    // Reuse the canonical method dispatcher, then translate only its public envelope.
    // Arbitrary Python/server-script discovery is intentionally not emulated.
    const v1 = await dispatchMethod(methodName, request, args, context);
    const body = await v1.clone().json() as JsonObject;
    if (!v1.ok) throw errors.validation(String(body.message ?? "Frappe method failed"));
    return v2DataResponse(body.message ?? body);
  }

  return null;
}

function parseV2GroupProjections(fields: string[], groupBy: string[]): DocumentGroupProjection[] {
  const aggregatePattern = /^(count|sum|avg|min|max)\(\s*([A-Za-z_][A-Za-z0-9_]*)\s*\)\s+as\s+([A-Za-z_][A-Za-z0-9_]*)$/i;
  return fields.map((raw) => {
    const value = raw.trim().replace(/`/g, "");
    const aggregate = aggregatePattern.exec(value);
    if (aggregate) {
      return {
        aggregate: aggregate[1]!.toLowerCase() as NonNullable<DocumentGroupProjection["aggregate"]>,
        field: toKernelField(aggregate[2]!),
        alias: aggregate[3]!,
      };
    }
    const field = toKernelField(stripFieldQualifier(value));
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(field) || !groupBy.includes(field)) {
      throw errors.validation(`Grouped field must be in group_by or use an aggregate with AS: ${raw}`);
    }
    return { field, alias: field };
  });
}

function v2TransitionArgs(doctype: string, name: string, args: FrappeArgs): FrappeArgs {
  const modified = args.text("modified");
  const doc: JsonObject = { doctype, name, ...(modified ? { modified } : {}) };
  return new FrappeArgs(new Map<string, string | JsonValue>([
    ["doc", doc],
  ]));
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
  if (typeof entry.form_region === "string") field.form_region = entry.form_region;
  if (typeof entry.form_control_width === "string") field.form_control_width = entry.form_control_width;
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

/**
 * Brings an existing tenant up to the platform's standard metadata catalogue.
 *
 * Provisioning already uses this exact store operation for new tenants. Exposing the
 * same operation through the authenticated Frappe surface lets the protected app
 * installer repair an older tenant before resolving declared ERPNext dependencies.
 * It remains an explicit, System-Manager-only POST: a normal app install never gains a
 * hidden schema side effect, and a browser cannot trigger it from a link or image GET.
 */
async function provisionStandardMetadata(request: Request, context: FrappeRouterContext): Promise<JsonObject> {
  if (request.method.toUpperCase() !== "POST") throw errors.validation("Standard metadata provisioning requires POST");
  requireMetadataAdmin(context);
  return await context.metadata.provisionStandardCatalog(
    context.tenantId,
    context.actor.user_id,
    context.now(),
  ) as unknown as JsonObject;
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

/**
 * Điền các trường `fetch_from` từ bản ghi được trỏ tới.
 *
 * `fetch_from` khai dạng `"<trường link>.<trường nguồn>"`. Kernel LƯU khai báo đó nhưng không
 * bao giờ tự tính — chỉ client tính, khi có người ngồi mở form và chọn tay.
 *
 * Hậu quả đo được: mọi tài liệu tạo qua REST đều để trống các ô này. `Item.inventory_mode`
 * (`fetch_from: measurement_profile.inventory_mode`) rỗng sạch 296 mã sau một đợt nhập, và vì
 * nó là cổng vào toàn bộ luật nhôm nên các luật đó ngủ im — không lỗi nào hiện ra, chỉ là
 * không có gì chạy. Tệ hơn: ô rỗng rồi lại thành nguồn của một luật khác, nên đổi Bộ theo dõi
 * bị từ chối với thông báo trỏ vào chính ô mình vừa đổi.
 *
 * Chỉ tính khi trường link CÓ MẶT trong payload — không đụng tới tài liệu không khai link, và
 * không ghi đè khi bản ghi đích đọc không được.
 */
async function resolveFetchFrom(
  doctype: string, payload: JsonObject, meta: DocTypeMeta, context: FrappeRouterContext,
  /**
   * Tên các ô do NGƯỜI GỬI thực sự khai. Bỏ trống = coi mọi ô đang có giá trị là lời người gửi
   * (đường `save`, nơi payload là bản ghi đã lưu trộn với phần sửa).
   *
   * Vì sao phải phân biệt: `createDocument` áp `default` TRƯỚC khi gọi hàm này, nên một ô vừa có
   * `default` vừa có `fetch_from` luôn "đã có giá trị" khi tới đây và nhánh suy ra không bao giờ
   * chạy. Đo trên 8810 ngày 21/08/2026: `Purchase Receipt` tạo từ `against_purchase_order`
   * (Đơn mua thuộc một pháp nhân thật) lại ra mã công ty kỹ thuật lấy từ `default` của brief
   * — mã mặc định đó KHÔNG phải một Company nào có thật trong dữ
   * liệu. Bốn ô rơi vào đúng bẫy này: `Delivery Note.company`, `Delivery Note.currency`,
   * `Purchase Receipt.company`, `Purchase Receipt.currency` — `fetch_from` của chúng là mã chết.
   *
   * Thứ tự đúng: lời người gửi > giá trị suy ra từ liên kết > `default`.
   */
  khaiTay?: ReadonlySet<string>,
): Promise<void> {
  const doc = new Map<string, JsonObject | null>();
  for (const field of meta.fields) {
    const spec = typeof field.fetch_from === "string" ? field.fetch_from.trim() : "";
    if (!spec) continue;
    const [linkField, sourceField] = spec.split(".", 2);
    if (!linkField || !sourceField) continue;
    const linkTarget = meta.fields.find((f) => f.fieldname === linkField);
    const linkDoctype = typeof linkTarget?.options === "string" ? linkTarget.options : "";
    const linkValue = payload[linkField];
    if (!linkDoctype || typeof linkValue !== "string" || !linkValue.trim()) continue;

    const key = `${linkDoctype}|${linkValue}`;
    if (!doc.has(key)) {
      // `loadReadable` trả về bản ghi BỌC (CanonicalDocument); các ô nằm trong `.data`.
      const record = await loadReadable(linkDoctype, linkValue, context).catch(() => null);
      doc.set(key, (record?.data ?? null) as JsonObject | null);
    }
    const nguon = doc.get(key);
    if (!nguon) continue;
    const value = nguon[sourceField];
    if (value === undefined) continue;

    /**
     * Ô CHỈ-ĐỌC thì luôn suy ra; ô SỬA ĐƯỢC chỉ điền khi người gửi bỏ trống.
     *
     * Bản đầu ghi đè vô điều kiện, và nó đã âm thầm phá dữ liệu thật: `Item Price.uom` khai
     * `fetch_from = item_code.default_sales_uom` mà KHÔNG chỉ-đọc. Ngày 21/08/2026 tôi ghi dòng
     * giá cửa Úc dưới 4m² với `uom = "Bộ"` (bán trọn bộ, ảnh bảng giá ghi đ/bộ) và dòng bát khoá
     * âm nền với `uom = "Cặp"`; cả hai bị đổi ngược về ĐVT bán mặc định của mặt hàng — "m2" và
     * "Cái". Không lỗi, không cảnh báo, chỉ có con số giữ nguyên còn đơn vị thì đổi nghĩa. Một
     * dòng ghi "1.800.000 / m²" thay vì "1.800.000 / bộ" là sai tiền gấp mấy lần.
     *
     * `fetch_from` vốn là TIỆN LỢI — điền hộ giá trị hay dùng — chứ không phải RÀNG BUỘC. Chỗ
     * biến nó thành ràng buộc là cờ `read_only`: ô nào chỉ-đọc thì người dùng không có quyền
     * nói khác, ô nào sửa được thì lời người gửi phải thắng.
     */
    const chiDoc = field.read_only === true;
    const daGui = payload[field.fieldname];
    const nguoiGuiKhai = khaiTay === undefined || khaiTay.has(field.fieldname);
    const coGiaTri = nguoiGuiKhai && daGui !== undefined && daGui !== null && daGui !== "";
    if (!chiDoc && coGiaTri) continue;
    payload[field.fieldname] = value as JsonValue;
  }
}

/**
 * Nhân viên gắn với tài khoản đang đăng nhập, hoặc `null` nếu không có.
 *
 * `Sales Order.responsible_person` là `Link → Employee`. Router từng gán thẳng
 * `actor.user_id` — một địa chỉ email — vào ô đó. Đo trên 8810 ngày 21/08/2026: 40/40 đơn bán
 * mang `responsible_person = "dev@example.com"`, tức 100% liên kết TREO: không trỏ tới bản ghi
 * `Employee` nào, và `link_filters` của ô còn đòi `employee_status = "Đang làm việc"`. Không lỗi
 * nào hiện ra vì nền tảng không kiểm tra đích của Link khi ghi.
 *
 * `Employee.user_id` là `Link → User` và `unique`, nên tra ngược là một truy vấn đúng một dòng.
 */
async function employeeCuaNguoiDung(context: FrappeRouterContext): Promise<string | null> {
  const userId = context.actor.user_id;
  if (typeof userId !== "string" || !userId.trim()) return null;
  try {
    const page = await context.listService.list(context.actor, context.tenantId, {
      doctype: "Employee",
      fields: ["name"],
      filters: [{ field: "user_id", operator: "eq", value: userId }] as unknown as JsonValue,
      limit: 1,
    });
    const name = (page.rows[0] as JsonObject | undefined)?.name;
    return typeof name === "string" && name ? name : null;
  } catch {
    // Doctype vắng mặt hoặc không có quyền đọc — thà để ô trống còn hơn ghi một liên kết treo.
    return null;
  }
}

/**
 * Tính lại các ô `valueSource: "formula"` của `Item` sau khi `fetch_from` đã chạy.
 *
 * Thứ tự BẮT BUỘC: `inventory_mode` là ô suy ra từ `measurement_profile`, mà trục số lượng mua
 * lại suy ra từ `inventory_mode`. Chạy trước `resolveFetchFrom` thì lượt TẠO nào cũng đọc phải
 * `inventory_mode` rỗng và không mã nhôm nào có trục — đúng lỗi đang có.
 *
 * Ghi RỖNG chứ không xoá khoá: ô chỉ-đọc mà vắng mặt trong payload thì kernel giữ giá trị CŨ
 * (xem `generic-controller.ts`), nên xoá khoá là cách để `qty_bar` sống sót sau khi mặt hàng
 * đã thôi là nhôm.
 */
function resolveItemQuantityAxis(doctype: string, payload: JsonObject, meta: DocTypeMeta): void {
  if (doctype !== "Item") return;
  const axis = derivePurchaseQuantityAxis(payload);
  for (const [fieldname, value] of Object.entries(axis)) {
    if (!meta.fields.some((field) => field.fieldname === fieldname)) continue;
    payload[fieldname] = value;
  }
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
  // Chụp lại các ô do NGƯỜI GỬI khai, TRƯỚC khi `default` chen vào. `resolveFetchFrom` cần biết
  // ranh giới này: một ô có `default` mà không ai khai thì vẫn là ô TRỐNG đối với luật suy ra.
  const khaiTay: ReadonlySet<string> = new Set(Object.keys(payload));
  // Frappe defaults are part of the server contract, not merely a UI convenience.
  // Applying them here also covers specialised ERP controllers, which run before the
  // generic metadata controller and therefore cannot otherwise see hidden defaults
  // such as Company/Currency on a Purchase Order.
  for (const field of meta.fields) {
    if (payload[field.fieldname] !== undefined || field.default === undefined) continue;
    if (field.default === "Today" && field.fieldtype === "Date") {
      payload[field.fieldname] = context.now().slice(0, 10);
    } else if (field.default === "Now" && field.fieldtype === "Datetime") {
      payload[field.fieldname] = context.now().slice(0, 19).replace("T", " ");
    } else {
      payload[field.fieldname] = structuredClone(field.default);
    }
  }
  if (amendedFrom) {
    const source = await loadReadable(doctype, amendedFrom, context);
    if (source.docstatus !== 2) throw errors.lifecycle("Only a cancelled document can be amended");
    // `no_copy` finally means something: a field marked no_copy must not carry
    // over into the amendment. Frappe honours this and users rely on it — an
    // external reference number copied into the successor would double-post.
    payload = dropNoCopyFields(payload, meta);
  }

  await resolveFetchFrom(doctype, payload, meta, context, khaiTay);
  /**
   * Người chịu trách nhiệm đơn bán: NHÂN VIÊN của người đang đăng nhập, không phải tài khoản.
   *
   * Chạy SAU `resolveFetchFrom` để `fetch_from = customer.account_manager` còn cửa nói trước —
   * đặt trước thì ô luôn có sẵn giá trị và luật suy ra thành mã chết. Tra không ra Nhân viên thì
   * để TRỐNG (ô không bắt buộc): một liên kết treo tệ hơn một ô trống, vì nó lọt lúc tạo rồi vỡ
   * ở báo cáo hoặc màn khác, xa chỗ gây ra.
   */
  if (doctype === "Sales Order" && (payload.responsible_person == null || payload.responsible_person === "")) {
    const nhanVien = await employeeCuaNguoiDung(context);
    if (nhanVien) payload.responsible_person = nhanVien;
  }
  resolveItemQuantityAxis(doctype, payload, meta);
  await assertNoAmbiguousItemPrice(doctype, payload, "", context);

  const name = amendedFrom
    ? await nextAmendmentName(doctype, amendedFrom, context)
    // Đặt tên phải nhìn thấy `default` của trường, nếu không thì `default` là ảo tưởng.
    //
    // `payload` là tài liệu SẼ được ghi (đã áp default ngay trên); `submitted` là thân yêu cầu
    // thô. Trước khi vá, tên được tính từ `submitted`, nên một doctype đặt tên bằng
    // `format:{…}` mà khoá nằm trong đó có `default` thì lượt tạo nào không tự khai khoá ấy
    // cũng bị TỪ CHỐI. Đo được trên `Item Price` (`format:…:{price_variant}:{area_tier}`,
    // `area_tier` có `default: "MOI-DIEN-TICH"`): POST không mang `area_tier` ném
    // "area_tier is required because it appears in the Item Price naming format", trong khi
    // cùng tài liệu đó qua đường có default lại ra tên hợp lệ. Frappe áp default TRƯỚC autoname,
    // và ngay trên đây đã nói "Frappe defaults are part of the server contract" — nên đây là
    // sửa cho khớp hợp đồng đó, không phải nới luật.
    //
    // `name` phải lấy lại từ `submitted`: `stripServerOwnedFields` loại nó khỏi `payload`, mà
    // đường `prompt` của `resolveNewName` đọc đúng trường này để lấy tên do người dùng đặt.
    : await resolveNewName(doctype, meta, namingSource(submitted, payload), context);

  await context.runCommand(await buildCommand({
    tenantId: context.tenantId, actor: context.actor, doctype, name,
    action: "create", expectedVersion: null, document: payload,
    ...(amendedFrom ? { amendedFrom } : {}),
  }));
  await syncCustomerAsSupplier(doctype, name, payload, context);
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
  // `cascade` phải xin rõ ràng. Mặc định vẫn là hành vi cũ — từ chối khi còn thứ trỏ vào tên
  // cũ — nên không lệnh đổi tên nào đang chạy bỗng dưng bắt đầu ghi vào chứng từ khác.
  const cascade = args.bool("cascade");
  await context.documents.renameDocument(
    context.tenantId,
    doctype,
    oldName,
    newName,
    context.actor.user_id,
    context.now(),
    namingField,
    { cascade },
  );
  return { doctype, name: newName, renamed: true, cascaded: cascade };
}

async function saveDocument(doctype: string, name: string, args: FrappeArgs, context: FrappeRouterContext): Promise<JsonObject> {
  const submitted = documentArgument(args);
  const meta = await requireMeta(doctype, context);
  const stored = await context.documents.getDocument(context.tenantId, doctype, name);
  const current = stored ?? await getReadableStoredDocument(doctype, name, context);
  if (!current) throw errors.notFound();
  await context.permissions.assert({
    actor: context.actor, tenantId: context.tenantId, doctype, name,
    owner: current.owner, data: current.data, action: "save",
  });
  // A write must be against the version the client last read. `assertModifiedMatches`
  // rejects a missing value too, so a client that forgets to echo `modified`
  // cannot overwrite a concurrent edit.
  assertModifiedMatches(current, submitted.modified);

  // The Desk intentionally sends a PATCH-shaped PUT containing only dirty fields.
  // Specialised controllers (Purchase Order totals/pricing in particular) normalize
  // a complete document and therefore must see the stored fields and child tables
  // that were not edited in this request. Merge in Frappe shape first so child rows
  // are preserved, then convert the complete document back to the kernel payload.
  const payload = toKernelPayload({ ...toFrappeDoc(current), ...submitted }, meta);
  await resolveFetchFrom(doctype, payload, meta, context);
  resolveItemQuantityAxis(doctype, payload, meta);
  await assertNoAmbiguousItemPrice(doctype, payload, name, context);
  await context.runCommand(await buildCommand({
    tenantId: context.tenantId, actor: context.actor, doctype, name,
    // The first edit of an app fixture creates an ordinary document overlay.  From then
    // on all saves use normal version concurrency, and the app fixture remains an intact
    // fallback/audit source underneath it.
    action: stored ? "save" : "create",
    expectedVersion: stored ? current.version : null,
    document: payload,
  }));
  await syncCustomerAsSupplier(doctype, name, payload, context);
  return toFrappeDoc(await loadReadable(doctype, name, context));
}

/** A party marked as both roles gets a Supplier master with the same stable id.
 * Purchase documents continue to link Supplier, while contact data is entered once
 * on the Customer record that created the counterpart. */
async function syncCustomerAsSupplier(doctype: string, customerName: string, payload: JsonObject, context: FrappeRouterContext): Promise<void> {
  if (doctype !== "Customer" || (payload.is_supplier !== true && payload.is_supplier !== 1)) return;
  const existing = await context.documents.getDocument(context.tenantId, "Supplier", customerName);
  if (existing) return; // Never overwrite a supplier maintained independently.
  const supplierMeta = await requireMeta("Supplier", context);
  const supplier: JsonObject = { supplier_name: customerName };
  for (const key of ["phone", "email", "address", "tax_id", "payment_terms", "note"]) {
    if (payload[key] !== undefined) supplier[key] = payload[key];
  }
  await context.runCommand(await buildCommand({
    tenantId: context.tenantId,
    actor: context.actor,
    doctype: "Supplier",
    name: await resolveNewName("Supplier", supplierMeta, supplier, context),
    action: "create",
    expectedVersion: null,
    document: supplier,
  }));
}

async function deleteDocument(doctype: string, name: string, context: FrappeRouterContext): Promise<JsonObject> {
  await loadWritable(doctype, name, context, "delete");
  await assertNoLinkedDocuments(doctype, name, context);
  const meta = await requireMeta(doctype, context);
  const deleted = await context.documents.deleteDraftDocument(context.tenantId, doctype, name, {
    allowNonDraft: meta.kind === "master" && meta.allow_delete_non_draft === true,
  });
  return { doctype, name, deleted };
}

/**
 * Link values live in document JSON rather than database foreign keys.  A raw
 * delete used to leave records such as Item Price pointing at a Price List that
 * no longer exists; the list then rendered the old name as if it were a valid
 * option.  Resolve the relation from DocType metadata, so this stays generic
 * and no application-specific name or relationship is hard-coded here.
 */
async function assertNoLinkedDocuments(doctype: string, name: string, context: FrappeRouterContext): Promise<void> {
  const sources = await context.metadata.listDocTypes(context.tenantId);
  const references: string[] = [];

  for (const source of sources) {
    if (source.is_child) continue;
    const linkFields = (source.fields ?? []).filter((field) => field.fieldtype === "Link" && field.options === doctype);
    if (linkFields.length === 0) continue;

    const documents = await context.documents.listDocumentsByDoctype<JsonObject>(context.tenantId, source.name);
    for (const field of linkFields) {
      const count = documents.filter((document) =>
        !(source.name === doctype && document.name === name)
        && document.data[field.fieldname] === name,
      ).length;
      if (count > 0) references.push(`${source.label ?? source.name}.${field.label ?? field.fieldname} (${count})`);
    }
  }

  if (references.length > 0) {
    throw errors.validation(`Không thể xóa ${doctype} ${name}: còn dữ liệu đang liên kết — ${references.join(", ")}`);
  }
}

// ---- method dispatch --------------------------------------------------------

async function dispatchMethod(
  methodName: string,
  request: Request,
  args: FrappeArgs,
  context: FrappeRouterContext,
): Promise<Response> {
  // Method của một vertical không nằm trong switch chung: lõi chỉ tra bảng đăng ký,
  // nên thêm/bớt vertical không phải sửa router.
  const verticalMethod = VERTICAL_METHODS[methodName];
  if (verticalMethod) return methodResponse(await verticalMethod(args, context));

  switch (methodName) {
    case WEB_FORM_READ.slice("/api/method/".length):
      if (request.method.toUpperCase() !== "GET") throw errors.validation("Portal read requires GET");
      return methodResponse(await webFormPortalRead(args, context));
    case WEB_FORM_LIST.slice("/api/method/".length):
      if (request.method.toUpperCase() !== "GET") throw errors.validation("Portal list requires GET");
      return methodResponse(await webFormPortalList(args, context));
    case WEB_FORM_UPDATE.slice("/api/method/".length):
      if (request.method.toUpperCase() !== "POST") throw errors.validation("Portal update requires POST");
      return methodResponse(await webFormPortalUpdate(args, context));
    case WEB_FORM_DELETE.slice("/api/method/".length):
      if (request.method.toUpperCase() !== "POST") throw errors.validation("Portal delete requires POST");
      return methodResponse(await webFormPortalDelete(args, context));
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

    case "frappe.auth.get_logged_user":
      return methodResponse(context.actor.user_id);

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

    case "metaforge.api.set_accounting_period_lock":
      return methodResponse(await setAccountingPeriodLock(args, context));


    // The generic client's boot: what to render, from what is installed. Without it
    // every app needs its own compiled bundle.
    case "metaforge.api.get_app_manifest":
      return methodResponse(await clientManifest(args, context));

    // ---- app registry -------------------------------------------------------
    case "forge.apps.list":
      return methodResponse({ apps: await context.apps.list(context.tenantId) });

    case "forge.apps.provision_standard_metadata":
      return methodResponse(await provisionStandardMetadata(request, context));

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
    case "erp_platform.api.simulate_effective_permissions":
      return methodResponse(await explainPermission(args, context));

    case "erp_platform.api.check_sod":
      return methodResponse(await checkSoD(args, context));

    case "erp_platform.api.get_approval_inbox":
      return methodResponse(await approvalInbox(args, context));

    case "erp_platform.api.get_audit_events":
      return methodResponse(await auditEvents(args, context));

    case "erp_platform.api.export_audit_evidence":
      return methodResponse(await exportAuditEvidence(args, context));

    case "metaforge.api.add_user_permission":
      return methodResponse(await addUserPermission(args, context));

    case "metaforge.api.remove_user_permission":
      return methodResponse(await removeUserPermission(args, context));

    case "metaforge.api.set_user_roles":
      return methodResponse(await setUserRoles(args, context));

    // ---- người dùng: liệt kê, tạo tài khoản, khoá/mở --------------------------
    // Không có ba lời gọi này thì màn phân quyền không trả lời được "ai đăng nhập được
    // vào hệ thống", và không có đường nào tạo một tài khoản ngoài việc gọi API tay.
    case "frappe.core.doctype.user.user.generate_keys":
      if (request.method.toUpperCase() !== "POST") throw errors.validation("generate_keys requires POST");
      return methodResponse(await generateApiKeys(args, context));

    case "metaforge.api.list_api_credentials":
      return methodResponse(await listApiCredentials(args, context));

    case "metaforge.api.revoke_api_credential":
      if (request.method.toUpperCase() !== "POST") throw errors.validation("revoke_api_credential requires POST");
      return methodResponse(await revokeApiCredential(args, context));

    case "frappe.core.doctype.user.user.impersonate":
      if (request.method.toUpperCase() !== "POST") throw errors.validation("impersonate requires POST");
      return impersonateUser(args, context);

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
    case "metaforge.api.get_print_formats":
      return methodResponse(await printFormats(args, context));

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
    case "frappe.core.doctype.data_import.data_import.download_template":
      return importTemplate(args, context);

    case "frappe.core.doctype.data_import.data_import.get_preview_from_template":
      return methodResponse(await importPreview(args, context));

    case "frappe.core.doctype.data_import.data_import.form_start_import":
      if (args.text("data_import")) return methodResponse(await startImportJob(args, context));
      return methodResponse(await importApply(args, context));

    case "frappe.core.doctype.data_import.data_import.get_import_status":
      return methodResponse(await importStatus(args, context));

    case "frappe.core.doctype.data_import.data_import.download_errored_template":
      return importErroredTemplate(args, context);

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

    case "metaforge.api.get_list_view":
      return methodResponse(await listView(args, context));

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






async function setAccountingPeriodLock(args: FrappeArgs, context: FrappeRouterContext): Promise<JsonObject> {
  const roles = context.actor.roles;
  if (context.actor.user_id !== "Administrator"
    && !roles.includes("Administrator")
    && !roles.includes("System Manager")
    && !roles.includes("Chủ xưởng")) {
    throw errors.permission("Chỉ Chủ xưởng được khoá hoặc mở kỳ");
  }
  const company = args.requireText("company", 160);
  const action = args.requireText("action", 20);
  const reason = args.requireText("reason", 500);
  if (!["Lock", "Unlock"].includes(action)) throw errors.validation("action must be Lock or Unlock");
  const lockDate = action === "Lock" ? args.requireText("lock_date", 10) : "";
  if (lockDate && !/^\d{4}-\d{2}-\d{2}$/.test(lockDate)) throw errors.validation("Ngày khoá phải có dạng YYYY-MM-DD");
  if (!await context.documents.hasMasterRecord(context.tenantId, "Company", company)) {
    throw errors.reference(`Công ty ${company} không tồn tại hoặc đã ngừng dùng`);
  }
  return await context.documents.setAccountingPeriodLock(
    context.tenantId,
    company,
    lockDate,
    context.actor.user_id,
    reason,
    context.now(),
  );
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
  const filtered = await context.permissions.filterMetaForActorWithPolicies(
    context.tenantId, full, context.actor, context.actor.user_id,
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

  const bundle = toFrappeMetaBundle({
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
  const translations = await context.translations.translate(
    context.tenantId,
    context.language || context.actor.locale || "en",
    collectMetaStrings([filtered, ...children], workflow),
  );
  return { ...bundle, translations: translations as unknown as JsonValue };
}

function collectMetaStrings(
  metas: DocTypeMeta[],
  workflow: Awaited<ReturnType<MetadataStore["getWorkflow"]>>,
): string[] {
  const strings = new Set<string>();
  const add = (value: unknown) => {
    if (typeof value === "string" && value.trim()) strings.add(value.trim());
  };
  for (const meta of metas) {
    add(meta.name);
    add(meta.label);
    for (const field of meta.fields) {
      add(field.label);
      add(field.description);
      if (field.fieldtype === "Select" && typeof field.options === "string") {
        for (const option of field.options.split("\n")) add(option);
      }
    }
  }
  if (workflow) {
    add(workflow.name);
    for (const state of workflow.states) add(state.state);
    for (const transition of workflow.transitions) add(transition.action);
  }
  return [...strings];
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
  const [meta, timeline, tags] = await Promise.all([
    requireMeta(doctype, context),
    context.collaboration.listTimeline(context.tenantId, doctype, name),
    context.collaboration.listTags(context.tenantId, doctype, name),
  ]);

  // `track_seen` was previously validated and stored but read by nothing. Recorded
  // only when the doctype asks for it — tracking every read of every doctype would
  // add a write to the hottest path on the platform for information nobody shows.
  const [views, flags] = await Promise.all([
    meta.track_seen ? recordAndListViews(doctype, name, context) : Promise.resolve([]),
    capabilityFlags(doctype, meta, document, context),
  ]);

  return {
    docs: [toFrappeDoc(document)],
    docinfo: {
      comments: timeline.comments ?? [],
      versions: timeline.versions ?? [],
      communications: [],
      assignments: timeline.assignments ?? [],
      attachments: timeline.files ?? [],
      tags,
      views: views as unknown as JsonValue,
      permissions: numericPermissionFlags(flags),
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
  let transition: typeof workflow.transitions[number] | undefined;
  let delegation: { allowed: boolean; delegation?: string; grantor?: string } | undefined;
  for (const entry of workflow.transitions.filter((candidate) => candidate.state === state && candidate.action === action)) {
    if (entry.condition && !evaluateWorkflowCondition(entry.condition, current.data, current.data)) continue;
    const next = workflow.states.find((candidate) => candidate.state === entry.next_state);
    const delegationAction = next && next.docstatus > current.docstatus ? "submit" : entry.action;
    const decision = await workflowTransitionAccess(context, entry.allowed_role, doctype, delegationAction, current.data);
    if (decision.allowed) { transition = entry; delegation = decision; break; }
  }
  if (!transition) throw errors.permission(`Workflow action ${action} is not permitted from ${state}`);

  const target = workflow.states.find((entry) => entry.state === transition.next_state);
  if (!target) throw errors.validation("Workflow target state is invalid");

  // Publishing a policy changes what other people may see or approve. A CSRF-valid
  // twelve-hour-old browser session is not sufficient for that boundary: require a
  // password login in the last fifteen minutes. App callbacks and development actors
  // deliberately have no authentication instant and therefore cannot publish policy.
  if (target.docstatus === 1 && new Set(["Organization Assignment", "Role Policy", "SoD Rule", "Approval Policy", "Delegation"]).has(doctype)) {
    const authenticatedAt = context.authenticatedAt ?? 0;
    const age = Math.floor(Date.now() / 1000) - authenticatedAt;
    if (authenticatedAt <= 0 || age < -60 || age > 15 * 60) {
      throw errors.authentication("Please sign in again before publishing an organization security policy");
    }
  }

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

  // The metadata controller independently re-validates the workflow role inside the
  // Durable Object. A delegation accepted only by this router would otherwise be
  // offered in the inbox and then rejected during commit. Add exactly the transition
  // role to this one command; document write access and organization scope were already
  // checked for the delegate, and the persisted actor remains the delegate's user id.
  const commandActor = delegation?.delegation && !context.actor.roles.includes(transition.allowed_role)
    ? { ...context.actor, roles: [...context.actor.roles, transition.allowed_role] }
    : context.actor;

  await context.runCommand(await buildCommand({
    tenantId: context.tenantId, actor: commandActor, doctype, name,
    action: lifecycle, expectedVersion: current.version,
    document: { ...current.data, [workflow.state_field]: transition.next_state, workflow_state: transition.next_state },
  }));
  return {
    ...toFrappeDoc(await loadReadable(doctype, name, context)),
    ...(delegation?.delegation ? { _delegation: delegation.delegation, _delegated_by: delegation.grantor ?? null } : {}),
  };
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

  const transitions: JsonObject[] = [];
  for (const entry of workflow.transitions.filter((candidate) => candidate.state === state)) {
    if (entry.condition && !evaluateWorkflowCondition(entry.condition, document.data, document.data)) continue;
    const targetDocstatus = docstatusOf(entry.next_state);
    if (blocksSelfApproval(entry, document.owner, context.actor.user_id, currentDocstatus, targetDocstatus)) continue;
    const delegationAction = targetDocstatus > currentDocstatus ? "submit" : entry.action;
    const decision = await workflowTransitionAccess(context, entry.allowed_role, doctype, delegationAction, document.data);
    if (!decision.allowed) continue;
    transitions.push({
      action: entry.action,
      next_state: entry.next_state,
      allowed: entry.allowed_role,
      allow_self_approval: entry.allow_self_approval ? 1 : 0,
      ...(decision.delegation ? { delegation: decision.delegation, delegated_by: decision.grantor ?? null } : {}),
    });
  }
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
  if (requested && requested !== context.actor.user_id) requireMetadataAdmin(context);
  const user = requested ?? context.actor.user_id;
  const userRecord = await context.users.get(context.tenantId, user);
  if (!userRecord) throw errors.notFound("User not found");
  const roles = user === context.actor.user_id ? [...context.actor.roles] : await context.users.listRoles(context.tenantId, user);
  const permissions = await context.access.listUserPermissions(context.tenantId, user);
  const byDoctype = new Map<string, JsonObject[]>();
  for (const record of permissions) {
    const id = userPermissionIdentity({
      user,
      allow: record.allow_doctype,
      forValue: record.allow_name,
      applicableFor: record.applicable_for_doctype,
    });
    const list = byDoctype.get(record.allow_doctype) ?? [];
    list.push({
      id,
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
    fullName: userRecord.full_name,
    enabled: userRecord.enabled,
    roles,
    assignedRoles: roles,
    scopes: [...byDoctype].map(([doctype, values]) => ({ doctype, values })) as unknown as JsonValue,
    canManage: isAccessAdministrator(context.actor),
    user_permissions: permissions.map((record) => ({
      id: userPermissionIdentity({
        user,
        allow: record.allow_doctype,
        forValue: record.allow_name,
        applicableFor: record.applicable_for_doctype,
      }),
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
  const actor = await resolveAccessInspectionActor({
    ...(args.text("user") ? { requestedUser: args.text("user")! } : {}),
    caller: context.actor,
    tenantId: context.tenantId,
    users: context.users,
  });
  const meta = await requireMeta(doctype, context);
  const document = name ? await context.documents.getDocument(context.tenantId, doctype, name) : null;
  if (name && !document) throw errors.notFound();
  const scope = await context.permissions.getReadScope(actor, context.tenantId, doctype).catch(() => null);
  const evaluation = await evaluatePermissionCapabilities({
    actor,
    tenantId: context.tenantId,
    doctype,
    meta,
    document,
    permissions: context.permissions,
  });
  const policyTrace = context.access.listRolePolicies
    ? await context.access.listRolePolicies(context.tenantId, actor.roles, doctype)
    : [];
  for (const policy of policyTrace) {
    evaluation.trace.push({
      source: "role_policy",
      effect: "info",
      label: `Chính sách ${policy.name}`,
      detail: `Vai trò ${policy.role}; hành động ${policy.actions.join(", ") || "không có"}; policy chỉ được phép thu hẹp DocPerm nền.`,
    });
  }
  return {
    user: actor.user_id,
    doctype,
    ...(name ? { name } : {}),
    roles: [...actor.roles],
    read_scope: scope?.mode ?? "denied",
    user_permissions: (scope?.user_permissions ?? []).map((constraint) => ({
      allow: constraint.allow_doctype,
      fields: constraint.fields,
      allowed_values: constraint.allowed_values,
    })),
    capabilities: evaluation.capabilities,
    trace: evaluation.trace as unknown as JsonValue,
  };
}

async function checkSoD(args: FrappeArgs, context: FrappeRouterContext): Promise<JsonObject> {
  if (!context.organizationSecurity) throw errors.misconfigured("Organization Security service is not configured");
  const actor = await resolveAccessInspectionActor({
    ...(args.text("user") ? { requestedUser: args.text("user")! } : {}),
    caller: context.actor,
    tenantId: context.tenantId,
    users: context.users,
  });
  const doctype = args.requireText("doctype", 160);
  const name = args.requireText("name", 320);
  const action = args.requireText("action", 160);
  const document = await context.documents.getDocument(context.tenantId, doctype, name);
  if (!document) throw errors.notFound();
  await context.permissions.assert({
    actor, tenantId: context.tenantId, doctype, name,
    owner: document.owner, data: document.data, action: "read",
  });
  return context.organizationSecurity.checkSoD(context.tenantId, actor, doctype, name, action);
}

async function auditEvents(args: FrappeArgs, context: FrappeRouterContext): Promise<JsonObject> {
  if (!context.organizationSecurity) throw errors.misconfigured("Organization Security service is not configured");
  return context.organizationSecurity.listAuditEvents(context.tenantId, context.actor, {
    ...(args.text("entity_type") ? { entity_type: args.text("entity_type")! } : {}),
    ...(args.text("entity_name") ? { entity_name: args.text("entity_name")! } : {}),
    ...(args.text("actor") ? { actor: args.text("actor")! } : {}),
    ...(args.text("action") ? { action: args.text("action")! } : {}),
    ...(args.text("from") ? { from: args.text("from")! } : {}),
    ...(args.text("to") ? { to: args.text("to")! } : {}),
    ...(args.text("cursor") ? { cursor: args.text("cursor")! } : {}),
    limit: args.int("limit", 50),
  });
}

async function exportAuditEvidence(args: FrappeArgs, context: FrappeRouterContext): Promise<JsonObject> {
  const reason = args.requireText("reason", 500);
  if (!context.organizationSecurity) throw errors.misconfigured("Organization Security service is not configured");
  const result = await context.organizationSecurity.listAuditEvents(context.tenantId, context.actor, {
    ...(args.text("entity_type") ? { entity_type: args.text("entity_type")! } : {}),
    ...(args.text("entity_name") ? { entity_name: args.text("entity_name")! } : {}),
    ...(args.text("actor") ? { actor: args.text("actor")! } : {}),
    ...(args.text("action") ? { action: args.text("action")! } : {}),
    ...(args.text("from") ? { from: args.text("from")! } : {}),
    ...(args.text("to") ? { to: args.text("to")! } : {}),
    limit: Math.min(Math.max(args.int("limit", 1000), 1), 1000),
  });
  const events = Array.isArray(result.events) ? result.events.filter((value): value is JsonObject => Boolean(value && typeof value === "object" && !Array.isArray(value))) : [];
  const columns = ["event_id", "correlation_id", "actor", "action", "entity_type", "entity_name", "occurred_at", "source"];
  const csv = [columns.join(","), ...events.map((event) => columns.map((column) => csvCell(event[column])).join(","))].join("\r\n");
  const checksum = await sha256Hex(csv);
  return {
    file_name: `audit-evidence-${context.now().slice(0, 10)}.csv`,
    content_type: "text/csv; charset=utf-8",
    content: `\uFEFF${csv}`,
    checksum_sha256: checksum,
    row_count: events.length,
    reason,
    generated_at: context.now(),
  };
}

function csvCell(value: JsonValue | undefined): string {
  const text = value == null ? "" : typeof value === "string" ? value : JSON.stringify(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

async function addUserPermission(args: FrappeArgs, context: FrappeRouterContext): Promise<JsonObject> {
  requireMetadataAdmin(context);
  const user = args.requireText("user", 320);
  const allow = args.requireText("allow", 160);
  const forValue = args.requireText("for_value", 320);
  const applicable = args.text("applicable_for") ?? "";
  const targetUser = await context.users.get(context.tenantId, user);
  if (!targetUser) throw errors.notFound("User not found");
  const hideDescendants = args.bool("hide_descendants", false);
  assertExactUserPermission(hideDescendants);

  const exists = await context.documents.hasMasterRecord(context.tenantId, allow, forValue)
    || Boolean(await context.documents.getDocument(context.tenantId, allow, forValue));
  if (!exists) throw errors.reference(`${allow} ${forValue} does not exist`);

  if (applicable) {
    const target = await context.metadata.getDocType(context.tenantId, applicable);
    if (!target || !target.fields.some((field) => field.fieldtype === "Link" && field.options === allow)) {
      throw errors.validation(`${applicable} has no Link field to ${allow}`);
    }
  }

  const isDefault = args.bool("is_default", false);
  const now = context.now();
  await context.users.administration.putUserPermission(
    context.tenantId,
    {
      user,
      allowDoctype: allow,
      allowName: forValue,
      ...(applicable ? { applicableForDoctype: applicable } : {}),
      isDefault,
      hideDescendants: false,
      createdBy: context.actor.user_id,
    },
    rbacAudit(context, "metaforge.api.add_user_permission", args.text("reason")),
    now,
  );
  return {
    id: userPermissionIdentity({ user, allow, forValue, applicableFor: applicable }),
    user,
    allow,
    for_value: forValue,
    applicable_for: applicable || null,
    is_default: isDefault ? 1 : 0,
    hide_descendants: 0,
  };
}

async function removeUserPermission(args: FrappeArgs, context: FrappeRouterContext): Promise<JsonObject> {
  requireMetadataAdmin(context);
  const encoded = args.text("id");
  const identity = encoded
    ? parseUserPermissionIdentity(encoded)
    : {
      user: args.requireText("user", 320),
      allow: args.requireText("allow", 160),
      forValue: args.requireText("for_value", 320),
      ...(args.text("applicable_for") ? { applicableFor: args.text("applicable_for")! } : {}),
    };
  const removed = await context.users.administration.removeUserPermission(
    context.tenantId,
    {
      user: identity.user,
      allowDoctype: identity.allow,
      allowName: identity.forValue,
      ...(identity.applicableFor ? { applicableForDoctype: identity.applicableFor } : {}),
    },
    rbacAudit(context, "metaforge.api.remove_user_permission", args.text("reason")),
    context.now(),
  );
  return { id: userPermissionIdentity(identity), removed };
}

async function setUserRoles(args: FrappeArgs, context: FrappeRouterContext): Promise<JsonObject> {
  requireMetadataAdmin(context);
  const user = args.requireText("user", 320);
  const roles = (args.array<string>("roles") ?? []).map((role) => String(role));
  const applied = await context.users.administration.replaceRoles(
    context.tenantId,
    user,
    roles,
    rbacAudit(context, "metaforge.api.set_user_roles", args.text("reason")),
    context.now(),
  );
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

async function generateApiKeys(args: FrappeArgs, context: FrappeRouterContext): Promise<JsonObject> {
  requireMetadataAdmin(context);
  const user = args.requireText("user", 320);
  const issued = await context.users.apiCredentials.issue(
    context.tenantId,
    user,
    rbacAudit(context, "frappe.core.doctype.user.user.generate_keys", args.text("reason")),
    context.now(),
  );
  // Match Frappe's one-time response: the secret is never readable again.
  return { api_key: issued.api_key, api_secret: issued.api_secret };
}

async function listApiCredentials(args: FrappeArgs, context: FrappeRouterContext): Promise<JsonObject> {
  const user = args.text("user") ?? context.actor.user_id;
  if (user !== context.actor.user_id) requireMetadataAdmin(context);
  const credentials = await context.users.apiCredentials.list(context.tenantId, user);
  return { user, credentials: credentials as unknown as JsonValue };
}

async function revokeApiCredential(args: FrappeArgs, context: FrappeRouterContext): Promise<JsonObject> {
  const user = args.text("user") ?? context.actor.user_id;
  if (user !== context.actor.user_id) requireMetadataAdmin(context);
  const credentialId = args.requireText("credential_id", 160);
  const revoked = await context.users.apiCredentials.revoke(
    context.tenantId,
    user,
    credentialId,
    rbacAudit(context, "metaforge.api.revoke_api_credential", args.text("reason")),
    context.now(),
  );
  if (!revoked) throw errors.notFound("Active API credential not found");
  return { user, credential_id: credentialId, revoked: true };
}

async function impersonateUser(args: FrappeArgs, context: FrappeRouterContext): Promise<Response> {
  requireMetadataAdmin(context);
  if (!context.authContext || !context.establishedSession) {
    throw errors.permission("Support impersonation requires an authenticated browser session");
  }
  const target = args.requireText("user", 320);
  const reason = args.requireText("reason", 500);
  const impersonated = await mintImpersonatedSession(
    context.authContext,
    context.establishedSession,
    target,
    reason,
  );

  await context.deskViews.notify(context.tenantId, {
    name: `support-impersonation:${context.traceId}`,
    forUser: target,
    subject: `${context.actor.user_id} just impersonated as you. Reason: ${reason}`,
    type: "Alert",
    fromUser: context.actor.user_id,
  }, context.now());

  return methodResponse({ impersonated_as: target }, 200, {
    "set-cookie": impersonated.cookie,
    "x-frappe-csrf-token": impersonated.csrfToken,
  });
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
  const roles = (args.array<string>("roles") ?? []).map((role) => String(role));
  const applied = await context.users.administration.createUserWithRoles(
    context.tenantId,
    {
      userId: user,
      fullName: args.text("full_name") ?? user,
      email: args.text("email") ?? (user.includes("@") ? user : ""),
      enabled: args.bool("enabled", true),
      userType: "System User",
      passwordHash: await hashPassword(password),
    },
    roles,
    rbacAudit(context, "metaforge.api.create_user", args.text("reason")),
    now,
  );
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
  await context.users.administration.setUserEnabled(
    context.tenantId,
    user,
    enabled,
    rbacAudit(context, "metaforge.api.set_user_enabled", args.text("reason")),
    context.now(),
  );
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
  const epoch = await context.users.administration.revokeSessions(
    context.tenantId,
    context.actor.user_id,
    rbacAudit(context, "metaforge.api.logout_other_sessions"),
    context.now(),
  );
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
  const epoch = await context.users.administration.updatePasswordAndRevoke(
    context.tenantId,
    targetUser,
    await hashPassword(newPassword),
    isSelf ? "password.change" : "password.reset",
    rbacAudit(context, "frappe.core.doctype.user.user.update_password", args.text("reason")),
    now,
  );
  return { user: targetUser, session_epoch: epoch, reauthenticate_required: true };
}

// ---- printing, bulk actions, workspaces -------------------------------------

/**
 * Lists the enabled print formats for one concrete document.
 *
 * The document-level print assertion is intentional: owner/share rules cannot be
 * resolved safely from the DocType alone. The client uses this before rendering so
 * "no format configured" is an ordinary empty state, not a failed print request.
 */
async function printFormats(args: FrappeArgs, context: FrappeRouterContext): Promise<JsonObject[]> {
  const doctype = args.requireText("doctype", 160);
  const name = args.requireText("name", 320);
  const document = await context.documents.getDocument(context.tenantId, doctype, name);
  if (!document) throw errors.notFound();
  await context.permissions.assert({
    actor: context.actor, tenantId: context.tenantId, doctype, name,
    owner: document.owner, data: document.data, action: "print",
  });
  await requireMeta(doctype, context);
  return (await context.metadata.listPrintFormats(context.tenantId, doctype)).map((format) => ({
    name: format.name,
    doc_type: format.doc_type,
    is_default: Boolean(format.is_default),
  }));
}

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
  const printable = await context.permissions.redactDocumentWithPolicies(context.tenantId, meta, document, context.actor, Boolean(share?.read));
  const format = await context.metadata.getPrintFormat(context.tenantId, doctype, args.text("format"));
  if (!format) throw errors.notFound("No print format is configured for this doctype");

  // Sales Order keeps the customer as a link, so the customer's phone is not
  // duplicated into every order. Enrich only the print scope, and only when the
  // actor can also read that Customer, so the paper can show SĐT without widening
  // the stored order payload or bypassing document permissions.
  let printableForRender = printable;
  if (doctype === "Sales Order" && typeof printable.data.customer === "string" && !printable.data.phone) {
    const customer = await context.documents.getDocument(context.tenantId, "Customer", printable.data.customer);
    if (customer) {
      try {
        await context.permissions.assert({
          actor: context.actor, tenantId: context.tenantId, doctype: "Customer", name: customer.name,
          owner: customer.owner, data: customer.data, action: "read",
        });
        const phone = customer.data.phone;
        if (phone !== undefined && phone !== null && String(phone).trim()) {
          printableForRender = { ...printable, data: { ...printable.data, phone } };
        }
      } catch {
        // The order remains printable; omit the related phone when Customer read
        // permission is not granted to this actor.
      }
    }
  }

  // HTML is returned as a string for the client to sandbox, matching Frappe. The
  // renderer escapes every interpolated value, so document content cannot inject
  // markup into the page.
  // `meta` is passed so `print_hide` is honoured: a field the author marked as not for
  // print — an internal margin, a private note — must not reach the paper the customer
  // is handed.
  return { html: renderPrintFormat(format, printableForRender, context.actor.locale, meta), style: format.css ?? "" };
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
  const meta = await requireMeta(doctype, context);
  const allowNonDraft = meta.kind === "master" && meta.allow_delete_non_draft === true;
  const names = args.array<string>("items") ?? [];
  if (!names.length) throw errors.validation("items is required");
  if (names.length > 100) throw errors.validation("At most 100 documents may be deleted at once");

  const results: JsonObject[] = [];
  for (const raw of names) {
    const name = String(raw);
    try {
      await loadWritable(doctype, name, context);
      await assertNoLinkedDocuments(doctype, name, context);
      results.push({ name, deleted: await context.documents.deleteDraftDocument(
        context.tenantId,
        doctype,
        name,
        { allowNonDraft },
      ) });
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
 * The platform's own context dimensions, which the CLIENT attaches to every report call.
 *
 * The shell keeps a business-context selection (company, warehouse, branch, …) and sends
 * it as report filters without knowing what any given report accepts. For the platform's
 * fixed reports that is correct — they all carry these columns. For an app's report it is
 * not: `Enrollment` has no `company`, so the filter arrived, the compiler refused it, and
 * every app report answered "Filter is not allowed: company" with an empty table.
 */



// ---- data import ------------------------------------------------------------

const DATA_IMPORT_MAX_ROWS = 100_000;

interface DataImportJobRow {
  data_import_name: string;
  reference_doctype: string;
  import_type: "Insert New Records" | "Update Existing Records";
  source_file_url: string;
  status: "Pending" | "Success" | "Partial Success" | "Error" | "Timed Out";
  payload_count: number;
  success_count: number;
  failed_count: number;
  results_json: string;
  started_at: string | null;
}

function requireImportFiles(context: FrappeRouterContext): FileStore {
  if (!context.files) throw errors.validation("File storage is required for Data Import");
  return {
    db: context.files.db,
    bucket: context.files.bucket,
    tenantId: context.tenantId,
    now: context.now(),
  };
}

function decodeBase64Utf8(value: unknown): string {
  if (typeof value !== "string") throw errors.validation("Import file content is unavailable");
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new TextDecoder().decode(bytes).replace(/^\uFEFF/, "");
}

async function readImportCsv(fileUrl: string, context: FrappeRouterContext): Promise<string> {
  const file = await readFileContent(
    fileUrl,
    context.actor,
    requireImportFiles(context),
    async (doctype, name) => { await loadReadable(doctype, name, context); },
  );
  const fileName = String(file.file_name ?? "").toLowerCase();
  const contentType = String(file.content_type ?? "").toLowerCase();
  if (!fileName.endsWith(".csv") && !contentType.includes("csv") && contentType !== "text/plain") {
    throw errors.validation(
      "Server Data Import accepts CSV files. XLS/XLSX decoding stays in the browser/CLI boundary and must be converted to CSV before upload.",
    );
  }
  return decodeBase64Utf8(file.base64);
}

async function loadDataImportControl(
  name: string,
  context: FrappeRouterContext,
  writable = false,
): Promise<CanonicalDocument<JsonObject>> {
  return writable
    ? loadWritable("Data Import", name, context)
    : loadReadable("Data Import", name, context);
}

function dataImportIdentity(control: CanonicalDocument<JsonObject>): {
  doctype: string;
  importType: "Insert New Records" | "Update Existing Records";
} {
  const doctype = typeof control.data.reference_doctype === "string" ? control.data.reference_doctype.trim() : "";
  if (!doctype) throw errors.validation("Data Import reference_doctype is required");
  const raw = control.data.import_type;
  const importType = raw === "Update Existing Records" ? raw : raw === "Insert New Records" ? raw : null;
  if (!importType) throw errors.validation("Data Import import_type is invalid");
  return { doctype, importType };
}

async function assertImportColumns(headers: string[], meta: DocTypeMeta): Promise<void> {
  const known = new Set(meta.fields.map((field) => field.fieldname));
  const unknown = headers.filter((header) => header !== "name" && !known.has(header));
  if (unknown.length) throw errors.validation(`Unknown import columns: ${unknown.join(", ")}`);
}

function frappeImportPreview(
  headers: string[],
  rows: JsonObject[],
  meta: DocTypeMeta,
  warnings: Array<{ row: number; message: string }>,
): JsonObject {
  const byName = new Map(meta.fields.map((field) => [field.fieldname, field]));
  const columns = headers.map((header, index) => {
    const field = byName.get(header);
    return {
      header_title: header,
      column_number: index,
      skip_import: field || header === "name" ? 0 : 1,
      df: header === "name"
        ? { fieldname: "name", label: "ID", fieldtype: "Data", reqd: 0 }
        : field
          ? { fieldname: field.fieldname, label: field.label, fieldtype: field.fieldtype, reqd: field.required ? 1 : 0 }
          : null,
    } as JsonObject;
  });
  return {
    columns,
    data: [
      headers,
      ...rows.slice(0, 20).map((row) => headers.map((header) => row[header] ?? "")),
    ] as unknown as JsonValue,
    warnings: warnings as unknown as JsonValue,
    total_rows: rows.length + warnings.length,
    max_rows_exceeded: warnings.some((warning) => warning.message.includes("limited to")) ? 1 : 0,
  };
}

/** Frappe-compatible CSV template generated from the exact effective DocType metadata. */
async function importTemplate(args: FrappeArgs, context: FrappeRouterContext): Promise<Response> {
  const doctype = args.requireText("doctype", 160);
  await context.permissions.assert({ actor: context.actor, tenantId: context.tenantId, doctype, action: "import" });
  const meta = await requireMeta(doctype, context);
  if (meta.is_child) throw errors.validation("A child doctype cannot be imported directly");

  const unsupported = new Set([
    "Section Break", "Column Break", "Tab Break", "Heading", "HTML", "Button",
    "Table", "Table MultiSelect", "Password",
  ]);
  const columns = [
    "name",
    ...meta.fields
      .filter((field) => !unsupported.has(field.fieldtype) && !field.read_only)
      .map((field) => field.fieldname),
  ];
  const csv = encodeCsv(columns, []);
  return new Response(`﻿${csv}`, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${doctype.replace(/[^A-Za-z0-9 _-]/g, "_")}-template.csv"`,
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

/**
 * Preview either the native Data Import document contract or the older direct CSV
 * compatibility shape used by low-level callers.
 */
async function importPreview(args: FrappeArgs, context: FrappeRouterContext): Promise<JsonObject> {
  const dataImportName = args.text("data_import");
  if (!dataImportName) {
    const doctype = args.requireText("doctype", 160);
    const csv = args.text("csv") ?? args.text("content") ?? "";
    if (!csv) throw errors.validation("csv content is required");
    await context.permissions.assert({ actor: context.actor, tenantId: context.tenantId, doctype, action: "import" });
    const meta = await requireMeta(doctype, context);
    if (meta.is_child) throw errors.validation("A child doctype cannot be imported directly");
    const preview = parseCsvImport(csv);
    await assertImportColumns(preview.headers, meta);
    return preview as unknown as JsonObject;
  }

  const control = await loadDataImportControl(dataImportName, context);
  const { doctype, importType } = dataImportIdentity(control);
  const fileUrl = args.text("import_file")
    ?? (typeof control.data.import_file === "string" ? control.data.import_file : "");
  if (!fileUrl) throw errors.validation("import_file is required");

  await context.permissions.assert({ actor: context.actor, tenantId: context.tenantId, doctype, action: "import" });
  const meta = await requireMeta(doctype, context);
  if (meta.is_child) throw errors.validation("A child doctype cannot be imported directly");

  const csv = await readImportCsv(fileUrl, context);
  const preview = parseCsvImport(csv, DATA_IMPORT_MAX_ROWS);
  await assertImportColumns(preview.headers, meta);

  const now = context.now();
  const db = requireImportFiles(context).db;
  await db.prepare(
    `INSERT INTO data_import_jobs(
       tenant_id,data_import_name,reference_doctype,import_type,source_file_url,status,
       payload_count,success_count,failed_count,results_json,created_by,started_at,created_at,modified_at
     ) VALUES(?1,?2,?3,?4,?5,'Pending',?6,0,0,'[]',?7,NULL,?8,?8)
     ON CONFLICT(tenant_id,data_import_name) DO UPDATE SET
       reference_doctype=excluded.reference_doctype,
       import_type=excluded.import_type,
       source_file_url=excluded.source_file_url,
       status='Pending',
       payload_count=excluded.payload_count,
       success_count=0,
       failed_count=0,
       results_json='[]',
       created_by=excluded.created_by,
       started_at=NULL,
       modified_at=excluded.modified_at`,
  ).bind(
    context.tenantId, dataImportName, doctype, importType, fileUrl,
    preview.rows.length + preview.errors.length, context.actor.user_id, now,
  ).run();

  return frappeImportPreview(preview.headers, preview.rows, meta, preview.errors);
}

async function loadImportJob(name: string, context: FrappeRouterContext): Promise<DataImportJobRow> {
  const row = await requireImportFiles(context).db.prepare(
    `SELECT data_import_name,reference_doctype,import_type,source_file_url,status,
            payload_count,success_count,failed_count,results_json,started_at
       FROM data_import_jobs WHERE tenant_id=?1 AND data_import_name=?2`,
  ).bind(context.tenantId, name).first<DataImportJobRow>();
  if (!row) throw errors.validation("Preview the Data Import before starting it");
  return row;
}

async function persistImportProgress(
  name: string,
  context: FrappeRouterContext,
  status: DataImportJobRow["status"],
  success: number,
  failed: number,
  results: JsonObject[],
  payloadCount?: number,
): Promise<void> {
  const db = requireImportFiles(context).db;
  await db.prepare(
    `UPDATE data_import_jobs
       SET status=?3,success_count=?4,failed_count=?5,results_json=?6,
           payload_count=COALESCE(?7,payload_count),modified_at=?8
       WHERE tenant_id=?1 AND data_import_name=?2`,
  ).bind(
    context.tenantId, name, status, success, failed, JSON.stringify(results),
    payloadCount ?? null, context.now(),
  ).run();
}

async function executeImportJob(job: DataImportJobRow, context: FrappeRouterContext): Promise<void> {
  const doctype = job.reference_doctype;
  const meta = await requireMeta(doctype, context);
  const csv = await readImportCsv(job.source_file_url, context);
  const parsed = parseCsvImport(csv, DATA_IMPORT_MAX_ROWS);
  await assertImportColumns(parsed.headers, meta);

  const hardLimit = parsed.errors.find((entry) => entry.message.includes(`limited to ${DATA_IMPORT_MAX_ROWS} rows`));
  if (hardLimit) throw errors.validation(`Data Import is bounded to ${DATA_IMPORT_MAX_ROWS} CSV rows per job`);

  const results: JsonObject[] = parsed.errors.map((entry) => ({
    row: entry.row,
    status: "failed",
    error: entry.message,
  }));
  let success = 0;
  let failed = results.length;
  const payloadCount = parsed.rows.length + parsed.errors.length;
  await persistImportProgress(job.data_import_name, context, "Pending", success, failed, results, payloadCount);

  for (let index = 0; index < parsed.rows.length; index += 1) {
    const row = parsed.rows[index] as JsonObject;
    const rowNumber = index + 2;
    try {
      if (job.import_type === "Update Existing Records") {
        const name = typeof row.name === "string" ? row.name.trim() : "";
        if (!name) throw errors.validation("Update Existing Records requires the name/ID column");
        const current = await loadWritable(doctype, name, context);
        const payload = toKernelPayload({ ...current.data, ...row }, meta);
        await context.runCommand(await buildCommand({
          tenantId: context.tenantId,
          actor: context.actor,
          doctype,
          name,
          action: "save",
          expectedVersion: current.version,
          document: payload,
        }));
        results.push({ row: rowNumber, name, status: "imported", input: row });
      } else {
        const payload = toKernelPayload(row, meta);
        const name = typeof row.name === "string" && row.name.trim()
          ? row.name.trim()
          : await resolveNewName(doctype, meta, namingSource(row, payload), context);
        await context.runCommand(await buildCommand({
          tenantId: context.tenantId,
          actor: context.actor,
          doctype,
          name,
          action: "create",
          expectedVersion: null,
          document: payload,
        }));
        results.push({ row: rowNumber, name, status: "imported", input: row });
      }
      success += 1;
    } catch (error) {
      failed += 1;
      results.push({
        row: rowNumber,
        status: "failed",
        error: error instanceof Error ? error.message : "Row failed",
        input: row,
      });
    }

    if ((index + 1) % 25 === 0) {
      await persistImportProgress(job.data_import_name, context, "Pending", success, failed, results, payloadCount);
    }
  }

  const status: DataImportJobRow["status"] =
    failed === 0 ? "Success" : success === 0 ? "Error" : "Partial Success";
  await persistImportProgress(job.data_import_name, context, status, success, failed, results, payloadCount);
}

async function startImportJob(args: FrappeArgs, context: FrappeRouterContext): Promise<JsonObject> {
  const name = args.requireText("data_import", 320);
  await loadDataImportControl(name, context, true);
  const job = await loadImportJob(name, context);

  await context.permissions.assert({
    actor: context.actor,
    tenantId: context.tenantId,
    doctype: job.reference_doctype,
    action: "import",
  });
  if (job.import_type === "Insert New Records") {
    await context.permissions.assert({
      actor: context.actor,
      tenantId: context.tenantId,
      doctype: job.reference_doctype,
      action: "create",
    });
  }

  const now = context.now();
  const lease = await requireImportFiles(context).db.prepare(
    `UPDATE data_import_jobs
       SET started_at=?3,modified_at=?3
       WHERE tenant_id=?1 AND data_import_name=?2 AND status='Pending' AND started_at IS NULL`,
  ).bind(context.tenantId, name, now).run();
  if ((lease.meta?.changes ?? 0) === 0) {
    const current = await loadImportJob(name, context);
    return { status: current.status, queued: current.status === "Pending" ? 1 : 0 };
  }

  const work = executeImportJob({ ...job, started_at: now }, context).catch(async (error) => {
    const message = error instanceof Error ? error.message : "Data Import failed";
    await persistImportProgress(
      name,
      context,
      "Error",
      0,
      Math.max(job.failed_count, 1),
      [{ row: 0, status: "failed", error: message }],
    );
  });
  if (context.defer) context.defer(work);
  else await work;

  return { status: "Pending", queued: 1 };
}

async function importStatus(args: FrappeArgs, context: FrappeRouterContext): Promise<JsonObject> {
  const name = args.requireText("data_import_name", 320);
  await loadDataImportControl(name, context);
  const job = await loadImportJob(name, context);
  return {
    status: job.status,
    success: job.success_count,
    failed: job.failed_count,
    total_records: job.payload_count,
  };
}

async function importErroredTemplate(args: FrappeArgs, context: FrappeRouterContext): Promise<Response> {
  const name = args.requireText("data_import_name", 320);
  await loadDataImportControl(name, context);
  const job = await loadImportJob(name, context);
  let results: JsonObject[] = [];
  try {
    const value = JSON.parse(job.results_json);
    if (Array.isArray(value)) results = value.filter((entry): entry is JsonObject => Boolean(entry && typeof entry === "object" && !Array.isArray(entry)));
  } catch {
    throw errors.validation("Stored Data Import result is invalid");
  }

  const failed = results.filter((entry) => entry.status === "failed");
  const sourceColumns = [...new Set(failed.flatMap((entry) => {
    const input = entry.input;
    return input && typeof input === "object" && !Array.isArray(input) ? Object.keys(input as JsonObject) : [];
  }))];
  const rows = failed.map((entry) => {
    const input = entry.input && typeof entry.input === "object" && !Array.isArray(entry.input)
      ? entry.input as JsonObject
      : {};
    return {
      __row: entry.row ?? "",
      __error: entry.error ?? "Row failed",
      ...input,
    } as JsonObject;
  });
  const csv = encodeCsv(["__row", "__error", ...sourceColumns], rows);
  return new Response(`﻿${csv}`, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${job.reference_doctype.replace(/[^A-Za-z0-9 _-]/g, "_")}-errors.csv"`,
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

/**
 * Applies a direct CSV import row by row for native/legacy callers.
 *
 * The Data Import document route above is the Frappe UI contract. This compatibility
 * path stays because server-side migration callers already use direct doctype+csv.
 */
async function importApply(args: FrappeArgs, context: FrappeRouterContext): Promise<JsonObject> {
  const doctype = args.requireText("doctype", 160);
  const csv = args.text("csv") ?? args.text("content") ?? "";
  if (!csv) throw errors.validation("csv content is required");
  const importType = args.text("import_type") === "Update Existing Records"
    ? "Update Existing Records"
    : "Insert New Records";
  await context.permissions.assert({ actor: context.actor, tenantId: context.tenantId, doctype, action: "import" });
  if (importType === "Insert New Records") {
    await context.permissions.assert({ actor: context.actor, tenantId: context.tenantId, doctype, action: "create" });
  }
  const meta = await requireMeta(doctype, context);
  if (meta.is_child) throw errors.validation("A child doctype cannot be imported directly");

  const preview = parseCsvImport(csv, 100);
  if (preview.errors.length) throw errors.validation("The CSV contains malformed rows", { error_count: preview.errors.length });
  await assertImportColumns(preview.headers, meta);

  const results: JsonObject[] = [];
  let imported = 0;
  let failed = 0;
  for (let index = 0; index < preview.rows.length; index += 1) {
    const row = preview.rows[index] as JsonObject;
    const rowNumber = index + 2;
    try {
      if (importType === "Update Existing Records") {
        const name = typeof row.name === "string" ? row.name.trim() : "";
        if (!name) throw errors.validation("Update Existing Records requires the name/ID column");
        const current = await loadWritable(doctype, name, context);
        const payload = toKernelPayload({ ...current.data, ...row }, meta);
        await context.runCommand(await buildCommand({
          tenantId: context.tenantId, actor: context.actor, doctype, name,
          action: "save", expectedVersion: current.version, document: payload,
        }));
        results.push({ row: rowNumber, name, status: "imported" });
      } else {
        const payload = toKernelPayload(row, meta);
        const name = typeof row.name === "string" && row.name.trim()
          ? row.name.trim()
          : await resolveNewName(doctype, meta, namingSource(row, payload), context);
        await context.runCommand(await buildCommand({
          tenantId: context.tenantId, actor: context.actor, doctype, name,
          action: "create", expectedVersion: null, document: payload,
        }));
        results.push({ row: rowNumber, name, status: "imported" });
      }
      imported += 1;
    } catch (error) {
      failed += 1;
      results.push({ row: rowNumber, status: "failed", error: error instanceof Error ? error.message : "Row failed" });
    }
  }
  return { imported, failed, results, status: failed ? (imported ? "Partial Success" : "Error") : "Success" };
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
 * Resolves one context value without letting a stored/browser-supplied value escape
 * the server's permission-filtered option set.
 *
 * Optional dimensions deliberately stay empty when the caller clears them. Previously
 * every optional selector fell back to its first option, so "Tất cả kho" and selecting
 * a warehouse other than the first one immediately snapped back to K12.
 */



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
  const screens: JsonObject[] = [];
  const seenPaths = new Set<string>();
  for (const app of apps) {
    const permittedActionNames = new Set<string>();
    const permittedScreenNames = new Set<string>();
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
        await context.permissions.assert({
          actor: context.actor,
          tenantId: context.tenantId,
          doctype: action.permission_doctype,
          action: action.permission_action ?? "save",
          data: {},
        });
        actions.push({ ...(action as unknown as JsonObject), app: app.app_id });
        permittedActionNames.add(action.name);
      } catch {
        // Omitted rather than offered-and-refused.
      }
    }
    for (const screen of app.screens ?? []) {
      try {
        await context.permissions.getReadScope(context.actor, context.tenantId, screen.permission_doctype);
        const visibleBlocks = [];
        for (const block of screen.blocks) {
          if (block.type === "action") {
            if (permittedActionNames.has(block.action)) visibleBlocks.push(block);
            continue;
          }
          try {
            await context.permissions.getReadScope(context.actor, context.tenantId, block.doctype);
            visibleBlocks.push(block);
          } catch {
            // A screen gate never grants access to a different block doctype.
          }
        }
        // Do not expose an empty shell or leave a nav item that can only open one.
        if (!visibleBlocks.length) continue;
        screens.push({
          ...(screen as unknown as JsonObject),
          blocks: visibleBlocks as unknown as JsonValue,
          app: app.app_id,
        });
        permittedScreenNames.add(screen.name);
      } catch {
        // A composed screen is omitted before render when its underlying scope is unreadable.
      }
    }
    for (const item of await permittedNav(app.nav, context)) {
      if (
        item.kind === "experience"
        && item.key.startsWith("screen:")
        && !permittedScreenNames.has(item.key.slice("screen:".length))
      ) continue;
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
    ...(client.design ? { design: client.design as unknown as JsonValue } : {}),
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
    screens: screens as unknown as JsonValue,
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
  const actor = submissionActor(form, context.actor);
  if (actor.user_id !== "Guest" && !form.allow_multiple) {
    throw new CloudForgeError("NOT_IMPLEMENTED", "Single-entry portal forms require an atomic kernel uniqueness contract", 501);
  }
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


/**
 * Loads a document the actor may read, hiding the difference between "absent"
 * and "not permitted" so the API cannot be used to probe for existence.
 */

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
  const payload = stripServerOwnedFields(fromFrappeDoc(submitted, tableFieldNames(meta)));
  // `toFrappeDoc` always exposes the derived lifecycle status.  Preserve a submitted
  // status only when the DocType explicitly owns a business field with that name;
  // otherwise a round-tripped framework value would be rejected as an unknown field.
  if (!meta.fields.some((field) => field.fieldname === "status")) delete payload.status;
  return payload;
}

/**
 * Resolves the name for a new document.
 *
 * A client-supplied name is honoured only when the DocType has no autoname or
 * uses `field:name`; otherwise the server allocates from the naming series so a
 * client cannot choose where it lands in the sequence.
 */
/**
 * Tài liệu dùng để ĐẶT TÊN: bản đã áp default, cộng lại `name` do người dùng đặt.
 *
 * `toKernelPayload` dựng một object MỚI và `stripServerOwnedFields` loại `name` khỏi nó, nên
 * truyền thẳng `payload` sẽ làm hỏng đường `prompt` (nơi tên là do người dùng chọn).
 */
function namingSource(submitted: JsonObject, payload: JsonObject): JsonObject {
  return typeof submitted.name === "string" ? { ...payload, name: submitted.name } : payload;
}

/**
 * `Item Price` là doctype metadata thuần, không có controller riêng, nên chốt chặn nghiệp vụ
 * duy nhất đặt được nằm ở đúng hai cửa ghi này (`POST`/`PUT /api/resource/Item Price`) — cả
 * màn Danh mục lẫn importer giá đều đi qua đây.
 */
async function assertNoAmbiguousItemPrice(
  doctype: string,
  payload: JsonObject,
  name: string,
  context: FrappeRouterContext,
): Promise<void> {
  if (doctype !== "Item Price") return;
  await assertItemPriceIsAnchored(payload, context);
  await assertItemPriceTierIsUnambiguous(context.documents, context.tenantId, payload, name);
}

/**
 * Một dòng giá phải NEO được vào danh mục, nếu không nó là tiền không ai tra ra.
 *
 * Kernel chỉ kiểm đích của `Link` lúc CHỐT SỔ (`generic-controller.ts`), mà `Item Price` không
 * chốt sổ — nên trước bản vá này, cả bốn kiểu dưới đây đều trả 201 trên cổng 8810 ngày
 * 21/08/2026 và nằm im trong bảng giá:
 *
 *   · `item_code: "KHONG_CO_MA_NAY"` — dòng giá của một mặt hàng không tồn tại;
 *   · `price_list: "KHONG_CO_BANG_GIA"` — bảng giá tự sinh ra từ một lỗi gõ phím;
 *   · `rate: -5000` — đơn giá âm, cộng vào đơn hàng thành trừ tiền;
 *   · `uom: "Lít"` trên một mã tồn Kg / bán Mét — dòng giá KHÔNG BAO GIỜ khớp, và vì engine
 *     giá fail-closed nên người bán chỉ thấy "không tìm thấy Item Price", không thấy rằng giá
 *     đã khai rồi nhưng khai sai đơn vị. Đo trên dữ liệu thật: một dòng giá phụ kiện theo Bộ —
 *     mặt hàng bán theo *Cặp*, dòng giá ghi theo *Bộ*.
 *
 * Đơn vị hợp lệ lấy đúng bộ mà `applyUomConversion` chấp nhận (ĐVT tồn/mua/bán + bảng quy đổi),
 * nên khai giá và lập chứng từ không thể hiểu khác nhau.
 */
async function assertItemPriceIsAnchored(payload: JsonObject, context: FrappeRouterContext): Promise<void> {
  const text = (value: JsonValue | undefined): string => (typeof value === "string" ? value.trim() : "");
  const priceList = text(payload.price_list);
  const itemCode = text(payload.item_code);
  const tier = text(payload.area_tier);

  if (priceList && !await context.documents.getMasterRecordData(context.tenantId, "Price List", priceList)) {
    throw errors.validation(`Bảng giá ${priceList} không tồn tại hoặc đã ngừng dùng.`);
  }
  if (tier && !await context.documents.getMasterRecordData(context.tenantId, "Bậc diện tích", tier)) {
    throw errors.validation(`Bậc diện tích ${tier} không tồn tại hoặc đã ngừng dùng.`);
  }
  const rate = payload.rate;
  if (rate !== undefined && rate !== null && String(rate).trim() !== "" && Number(rate) < 0) {
    throw errors.validation("Đơn giá không được âm.");
  }
  if (!itemCode) return;
  const item = await context.documents.getMasterRecordData(context.tenantId, "Item", itemCode);
  if (!item) throw errors.validation(`Mặt hàng ${itemCode} không tồn tại hoặc đã ngừng dùng.`);

  const uom = text(payload.uom);
  if (!uom) return;
  const chapNhan = new Set<string>();
  for (const fieldname of ["stock_uom", "default_purchase_uom", "default_sales_uom"]) {
    const value = text((item as JsonObject)[fieldname]);
    if (value) chapNhan.add(value);
  }
  const rows = (item as JsonObject).uom_conversions;
  if (Array.isArray(rows)) {
    for (const row of rows) {
      if (!row || typeof row !== "object" || Array.isArray(row)) continue;
      const value = text((row as JsonObject).uom);
      if (value) chapNhan.add(value);
    }
  }
  if (chapNhan.size && !chapNhan.has(uom)) {
    throw errors.validation(
      `Mặt hàng ${itemCode} không giao dịch theo ĐVT "${uom}", nên dòng giá này không bao giờ được dùng tới.`
      + ` ĐVT hợp lệ: ${[...chapNhan].join(", ")}.`
      + " Sửa ĐVT của dòng giá, hoặc khai thêm nó vào Quy đổi đơn vị của mặt hàng.",
    );
  }
}

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






/** Read-only preview using the exact same selling resolver used by Quotation/Sales Order. */
