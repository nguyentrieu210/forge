import {
  assertInternalService,
  D1UserStore,
  staticDevelopmentActor,
  verifyTrustedIdentity,
} from "../../../packages/auth/src/index.js";
import {
  assertSessionCsrf, establishSession, isFrappePath, isPublicFrappePath, routeFrappeApi, routeFrappeAuth,
  slideSession, type AuthRouteContext, type EstablishedSession,
} from "../../../packages/frappe-api/src/index.js";
import type { TrustedIdentityKey } from "../../../packages/auth/src/index.js";
import type { Actor, CanonicalDocument, DomainEvent, JsonObject, MutationCommand, MutationReceipt } from "../../../packages/contracts/src/index.js";
import { parseMutationCommandInput } from "../../../packages/contracts/src/index.js";
import { D1CommercialReconciliationService, D1DocumentListStore, D1MutationStore, DocumentListService } from "../../../packages/document-kernel/src/index.js";
import { asCloudForgeError, commandPayloadHash, errorResponse, errors, jsonResponse, randomId, readJson } from "../../../packages/core/src/index.js";
import {
  D1CollaborationService, D1DocumentAccessStore, D1MetadataStore, MetadataDocumentListDefinitionResolver, MetadataPermissionService,
  metadataSummary, parseCsvImport, parseDocTypeMeta, renderPrintFormat, validateWorkflow,
} from "../../../packages/frappe-model/src/index.js";
import { AggregateCoordinator } from "./aggregate-do.js";
import { publishPendingOutbox } from "../../../packages/outbox/src/index.js";
import type { TenantEnv } from "./env.js";

export { AggregateCoordinator };

interface AggregateStub extends DurableObjectStub {
  mutate<T extends JsonObject>(command: MutationCommand<T>): Promise<unknown>;
}

export default {
  async fetch(request: Request, env: TenantEnv): Promise<Response> {
    const traceId = request.headers.get("x-cloudforge-trace-id") ?? randomId("trace");
    try {
      const url = new URL(request.url);
      if (url.pathname === "/health") return jsonResponse({ ok: true, service: "tenant-worker", tenant: env.TENANT_ID ?? null });

      if (request.method === "POST" && url.pathname === "/internal/outbox/flush") {
        assertInternalService(request, env.INTERNAL_SERVICE_TOKEN);
        if (!env.OUTBOX_QUEUE) throw new Error("OUTBOX_QUEUE binding is missing");
        const tenant = env.TENANT_ID ?? request.headers.get("x-cloudforge-tenant");
        if (!tenant) throw new Error("Missing tenant context");
        return jsonResponse(await publishPendingOutbox(env.DB, env.OUTBOX_QUEUE, tenant));
      }
      if (request.method === "GET" && url.pathname === "/internal/reconciliation") {
        assertInternalService(request, env.INTERNAL_SERVICE_TOKEN);
        const tenant = env.TENANT_ID ?? request.headers.get("x-cloudforge-tenant");
        if (!tenant) throw new Error("Missing tenant context");
        const report = await new D1CommercialReconciliationService(env.DB).run(tenant);
        return jsonResponse(report, report.ok ? 200 : 409, { "x-cloudforge-trace-id": traceId });
      }

      if (request.method === "POST" && url.pathname === "/internal/events") {
        assertInternalService(request, env.INTERNAL_SERVICE_TOKEN);
        const event = await readJson<JsonObject>(request, 512_000) as unknown as DomainEvent;
        const tenant = env.TENANT_ID ?? request.headers.get("x-cloudforge-tenant");
        if (!tenant || event.tenant_id !== tenant) throw new Error("Inbound event tenant mismatch");
        // Dedup and the committed-confirmation key off the trusted idempotency-key
        // header (bound by the caller to this event), not the request body alone.
        const idempotencyKey = request.headers.get("x-cloudforge-idempotency-key") ?? event.event_id;
        if (!idempotencyKey || idempotencyKey !== event.event_id) throw new Error("Inbound event idempotency key mismatch");
        const result = await env.DB.prepare(
          `INSERT INTO inbound_events(tenant_id,event_id,event_type,payload_json,processed_at)
           VALUES(?1,?2,?3,?4,?5) ON CONFLICT(tenant_id,event_id) DO NOTHING`,
        ).bind(tenant, idempotencyKey, event.event_type, JSON.stringify(event), new Date().toISOString()).run();
        // The confirmation reflects the actual write result — a fresh insert or an
        // already-present row (both durably committed) — never a bare body echo.
        const inserted = (result.meta?.changes ?? 0) === 1;
        return jsonResponse({ committed: true, event_id: idempotencyKey, inserted }, 200, { "x-cloudforge-event-committed": idempotencyKey });
      }

      const tenantId = env.TENANT_ID ?? request.headers.get("x-cloudforge-tenant");
      if (!tenantId) throw new Error("Missing tenant context");

      // ---- Frappe-shaped surface -------------------------------------------
      // Mounted ahead of the native routes and authenticated by cookie session
      // rather than by the gateway's trusted identity, so that revocation is
      // checked against the live user directory on every request.
      if (isFrappePath(url.pathname)) {
        const frappeResponse = await serveFrappeApi(request, url, env, tenantId, traceId);
        if (frappeResponse) return frappeResponse;
      }

      const actor = await authenticate(request, env, tenantId, traceId);
      const metadata = new D1MetadataStore(env.DB);
      const access = new D1DocumentAccessStore(env.DB);
      const permissions = new MetadataPermissionService(metadata, undefined, access);
      const documentStore = new D1MutationStore(env.DB);

      if (request.method === "POST" && url.pathname === "/api/v1/commands") {
        const raw = await readJson<JsonObject>(request);
        const input = parseMutationCommandInput(raw);
        if (input.tenant_id !== tenantId) throw errors.authentication("Command tenant does not match authenticated tenant");
        const command: MutationCommand = { ...input, actor };
        const key = `${tenantId}:${command.aggregate.doctype}:${command.aggregate.name}`;
        const stub = env.AGGREGATES.getByName(key) as AggregateStub;
        const result = typeof stub.mutate === "function" ? await stub.mutate(command) : await callDoFetch(stub, command);
        return jsonResponse(result, 200, { "x-cloudforge-trace-id": traceId });
      }

      if (request.method === "GET" && url.pathname === "/api/v1/whoami") {
        // Identity comes only from the gateway-verified trusted identity (or the
        // dev actor); client-sent identity headers were stripped upstream. Never
        // expose the trusted-identity signature or any secret.
        return jsonResponse({ tenant_id: tenantId, actor_id: actor.user_id, roles: [...actor.roles] }, 200, { "x-cloudforge-trace-id": traceId });
      }

      if (request.method === "POST" && url.pathname === "/api/v1/documents/list") {
        // Narrow server-side document list/search. Permission is asserted inside
        // the service (doctype-level read, before any data access). The tenant
        // predicate is server-injected; the request cannot choose a tenant.
        const body = await readJson<JsonObject>(request, 16_000);
        const service = new DocumentListService(new D1DocumentListStore(env.DB), permissions, new MetadataDocumentListDefinitionResolver(metadata));
        return jsonResponse(await service.list(actor, tenantId, body), 200, { "x-cloudforge-trace-id": traceId });
      }
      if (request.method === "POST" && url.pathname === "/api/v1/documents/count") {
        const body = await readJson<JsonObject>(request, 16_000);
        const service = new DocumentListService(new D1DocumentListStore(env.DB), permissions, new MetadataDocumentListDefinitionResolver(metadata));
        return jsonResponse(await service.count(actor, tenantId, body), 200, { "x-cloudforge-trace-id": traceId });
      }

      if (request.method === "POST" && url.pathname === "/api/v1/setup/provision-standard-metadata") {
        requireSystemManager(actor);
        return jsonResponse(await metadata.provisionStandardCatalog(tenantId, actor.user_id, new Date().toISOString()), 200, { "x-cloudforge-trace-id": traceId });
      }

      if (request.method === "GET" && url.pathname === "/api/v1/meta") {
        const all = await metadata.listDocTypes(tenantId);
        const visible: JsonObject[] = [];
        for (const meta of all) {
          try { await permissions.getReadScope(actor, tenantId, meta.name); visible.push(metadataSummary(meta)); }
          catch { /* omit inaccessible metadata without disclosing it */ }
        }
        return jsonResponse({ doctypes: visible }, 200, { "x-cloudforge-trace-id": traceId });
      }

      const metaMatch = url.pathname.match(/^\/api\/v1\/meta\/([^/]+)$/);
      if (metaMatch && request.method === "GET") {
        const doctype = decodeURIComponent(metaMatch[1]!);
        const meta = await metadata.getDocType(tenantId, doctype);
        if (!meta) return jsonResponse({ error: { code: "DOCTYPE_NOT_FOUND" } }, 404);
        const requestedName = url.searchParams.get("name")?.trim() ?? "";
        let filtered;
        if (requestedName) {
          const current = await loadAuthorizedDocument(documentStore, permissions, actor, tenantId, doctype, requestedName, "read", true);
          const share = await access.getShare(tenantId, doctype, requestedName, actor.user_id);
          filtered = permissions.filterMetaForActor(meta, actor, current.owner, Boolean(share?.read), { action: "save", sharedWrite: Boolean(share?.write) });
        } else {
          const scope = await permissions.getReadScope(actor, tenantId, doctype);
          filtered = permissions.filterMetaForActor(meta, actor, actor.user_id, scope.mode === "shared" || scope.mode === "owner_or_shared", { action: "create" });
        }
        const workflow = await metadata.getWorkflow(tenantId, doctype);
        return jsonResponse({ meta: filtered, workflow }, 200, { "x-cloudforge-trace-id": traceId, etag: `W/"meta-${meta.revision}"` });
      }
      if (metaMatch && request.method === "PUT") {
        requireSystemManager(actor);
        const doctype = decodeURIComponent(metaMatch[1]!);
        const body = await readJson<JsonObject>(request, 512_000);
        const meta = parseDocTypeMeta(body, doctype);
        return jsonResponse(await metadata.putDocType(tenantId, meta, actor.user_id, new Date().toISOString()), 200, { "x-cloudforge-trace-id": traceId });
      }

      if (url.pathname === "/api/v1/user-permissions") {
        requireSystemManager(actor);
        if (request.method === "GET") {
          const user = url.searchParams.get("user")?.trim() ?? "";
          if (!user) throw errors.validation("user is required");
          return jsonResponse({ permissions: await access.listUserPermissions(tenantId, user) });
        }
        if (request.method === "PUT") {
          const body = await readJson<JsonObject>(request, 32_000);
          const user = requireShortText(body.user, "user", 320);
          const allowDoctype = requireShortText(body.allow_doctype, "allow_doctype", 160);
          const allowName = requireShortText(body.allow_name, "allow_name", 320);
          const applicable = typeof body.applicable_for_doctype === "string" ? body.applicable_for_doctype.trim() : "";
          const referenceExists = await documentStore.hasMasterRecord(tenantId, allowDoctype, allowName)
            || Boolean(await documentStore.getDocument(tenantId, allowDoctype, allowName));
          if (!referenceExists) throw errors.reference("Allowed value is invalid or unavailable");
          if (applicable) {
            const targetMeta = await metadata.getDocType(tenantId, applicable);
            if (!targetMeta || !targetMeta.fields.some((field) => field.fieldtype === "Link" && field.options === allowDoctype)) {
              throw errors.validation(`${applicable} has no Link field to ${allowDoctype}`);
            }
          }
          const record = { user, allow_doctype: allowDoctype, allow_name: allowName, applicable_for_doctype: applicable,
            is_default: body.is_default === true, hide_descendants: body.hide_descendants === true, created_by: actor.user_id, created_at: new Date().toISOString() };
          return jsonResponse(await access.putUserPermission(tenantId, record), 200, { "x-cloudforge-trace-id": traceId });
        }
        if (request.method === "DELETE") {
          const user = url.searchParams.get("user")?.trim() ?? "";
          const allowDoctype = url.searchParams.get("allow_doctype")?.trim() ?? "";
          const allowName = url.searchParams.get("allow_name")?.trim() ?? "";
          const applicable = url.searchParams.get("applicable_for_doctype")?.trim() ?? "";
          if (!user || !allowDoctype || !allowName) throw errors.validation("user, allow_doctype and allow_name are required");
          await access.deleteUserPermission(tenantId, user, allowDoctype, allowName, applicable);
          return jsonResponse({ deleted: true });
        }
      }

      if (request.method === "POST" && url.pathname === "/api/v1/naming/next") {
        const body = await readJson<JsonObject>(request, 16_000);
        const doctype = typeof body.doctype === "string" ? body.doctype : "";
        if (!doctype) throw errors.validation("doctype is required");
        await permissions.assert({ actor, tenantId, doctype, action: "create" });
        const meta = await metadata.getDocType(tenantId, doctype);
        if (!meta) throw errors.notFound("DocType metadata not found");
        if (meta.autoname === "field:name") {
          const fieldValue = typeof body.field_value === "string" ? body.field_value.trim() : "";
          if (!fieldValue) throw errors.validation("field_value is required for field:name autoname");
          return jsonResponse({ name: fieldValue, metadata_revision: meta.revision });
        }
        return jsonResponse({ name: await metadata.nextName(tenantId, doctype, meta.autoname ?? "hash", new Date().toISOString()), metadata_revision: meta.revision });
      }

      const workflowMatch = url.pathname.match(/^\/api\/v1\/workflows\/([^/]+)$/);
      if (workflowMatch && request.method === "GET") {
        const doctype = decodeURIComponent(workflowMatch[1]!);
        await permissions.getReadScope(actor, tenantId, doctype);
        return jsonResponse({ workflow: await metadata.getWorkflow(tenantId, doctype) });
      }
      if (workflowMatch && request.method === "PUT") {
        requireSystemManager(actor);
        const doctype = decodeURIComponent(workflowMatch[1]!);
        const body = await readJson<JsonObject>(request, 256_000);
        return jsonResponse(await metadata.putWorkflow(tenantId, validateWorkflow(body, doctype), actor.user_id, new Date().toISOString()));
      }

      const workflowActionsMatch = url.pathname.match(/^\/api\/v1\/workflows\/([^/]+)\/actions$/);
      if (workflowActionsMatch && request.method === "GET") {
        const doctype = decodeURIComponent(workflowActionsMatch[1]!);
        const name = url.searchParams.get("name") ?? "";
        if (!name) throw errors.validation("name is required");
        const document = await loadAuthorizedDocument(documentStore, permissions, actor, tenantId, doctype, name, "read", true);
        const workflow = await metadata.getWorkflow(tenantId, doctype);
        if (!workflow) return jsonResponse({ actions: [] });
        const state = String(document.data[workflow.state_field] ?? workflow.states[0]?.state ?? "");
        const actions = workflow.transitions.filter((entry) => entry.state === state && (actor.roles.includes(entry.allowed_role) || isSystemManager(actor))).map((entry) => ({ action: entry.action, next_state: entry.next_state }));
        return jsonResponse({ state, actions });
      }

      const workflowApplyMatch = url.pathname.match(/^\/api\/v1\/workflows\/([^/]+)\/apply$/);
      if (workflowApplyMatch && request.method === "POST") {
        const doctype = decodeURIComponent(workflowApplyMatch[1]!);
        const body = await readJson<JsonObject>(request, 32_000);
        const name = typeof body.name === "string" ? body.name : "";
        const actionName = typeof body.action === "string" ? body.action : "";
        if (!name || !actionName) throw errors.validation("name and action are required");
        const document = await loadAuthorizedDocument(documentStore, permissions, actor, tenantId, doctype, name, "read", true);
        const workflow = await metadata.getWorkflow(tenantId, doctype);
        if (!workflow) throw errors.validation("No active workflow");
        const state = String(document.data[workflow.state_field] ?? workflow.states[0]?.state ?? "");
        const transition = workflow.transitions.find((entry) => entry.state === state && entry.action === actionName && (actor.roles.includes(entry.allowed_role) || isSystemManager(actor)));
        if (!transition) throw errors.permission("Workflow action is not permitted");
        const target = workflow.states.find((entry) => entry.state === transition.next_state);
        if (!target) throw errors.validation("Workflow target state is invalid");
        const action = target.docstatus === 2 ? "cancel" : target.docstatus === 1 && document.docstatus === 0 ? "submit" : "save";
        const command: MutationCommand = {
          schema_version: 1,
          command_id: typeof body.command_id === "string" && body.command_id ? body.command_id : randomId("workflow"),
          tenant_id: tenantId,
          actor,
          aggregate: { doctype, name },
          action,
          expected_version: typeof body.expected_version === "number" ? body.expected_version : document.version,
          payload_hash: "",
          document: { ...document.data, [workflow.state_field]: transition.next_state, workflow_state: transition.next_state },
        };
        command.payload_hash = await commandPayloadHash(command as unknown as Record<string, unknown>);
        const stub = env.AGGREGATES.getByName(`${tenantId}:${doctype}:${name}`) as AggregateStub;
        return jsonResponse(typeof stub.mutate === "function" ? await stub.mutate(command) : await callDoFetch(stub, command));
      }

      const versionMatch = url.pathname.match(/^\/api\/v1\/documents\/([^/]+)\/([^/]+)\/versions\/(\d+)$/);
      if (versionMatch && request.method === "GET") {
        const doctype = decodeURIComponent(versionMatch[1]!); const name = decodeURIComponent(versionMatch[2]!); const version = Number(versionMatch[3]);
        await loadAuthorizedDocument(documentStore, permissions, actor, tenantId, doctype, name, "read", true);
        const snapshot = await new D1CollaborationService(env.DB).getVersion(tenantId, doctype, name, version); if (!snapshot) throw errors.notFound("Version not found");
        const meta = await metadata.getDocType(tenantId, doctype); const share = await access.getShare(tenantId, doctype, name, actor.user_id);
        return jsonResponse(meta ? permissions.redactDocument(meta, snapshot, actor, Boolean(share?.read)) : snapshot);
      }

      const timelineMatch = url.pathname.match(/^\/api\/v1\/documents\/([^/]+)\/([^/]+)\/timeline$/);
      if (timelineMatch && request.method === "GET") {
        const doctype = decodeURIComponent(timelineMatch[1]!); const name = decodeURIComponent(timelineMatch[2]!);
        await loadAuthorizedDocument(documentStore, permissions, actor, tenantId, doctype, name, "read", true);
        return jsonResponse(await new D1CollaborationService(env.DB).listTimeline(tenantId, doctype, name));
      }
      const commentMatch = url.pathname.match(/^\/api\/v1\/documents\/([^/]+)\/([^/]+)\/comments$/);
      if (commentMatch && request.method === "POST") {
        const doctype = decodeURIComponent(commentMatch[1]!); const name = decodeURIComponent(commentMatch[2]!);
        await loadAuthorizedDocument(documentStore, permissions, actor, tenantId, doctype, name, "save");
        const body = await readJson<JsonObject>(request, 24_000);
        return jsonResponse(await new D1CollaborationService(env.DB).addComment(tenantId, actor, doctype, name, String(body.content ?? ""), new Date().toISOString()), 201);
      }
      const assignMatch = url.pathname.match(/^\/api\/v1\/documents\/([^/]+)\/([^/]+)\/assign$/);
      if (assignMatch && request.method === "POST") {
        const doctype = decodeURIComponent(assignMatch[1]!); const name = decodeURIComponent(assignMatch[2]!);
        await loadAuthorizedDocument(documentStore, permissions, actor, tenantId, doctype, name, "save");
        return jsonResponse(await new D1CollaborationService(env.DB).assign(tenantId, actor, doctype, name, await readJson<JsonObject>(request, 24_000), new Date().toISOString()), 201);
      }
      const assignmentUpdateMatch = url.pathname.match(/^\/api\/v1\/assignments\/([^/]+)$/);
      if (assignmentUpdateMatch && request.method === "PATCH") {
        const assignmentId = decodeURIComponent(assignmentUpdateMatch[1]!);
        const collaboration = new D1CollaborationService(env.DB);
        const assignment = await collaboration.getAssignment(tenantId, assignmentId);
        if (!assignment) throw errors.notFound("Assignment not found");
        // Assignment ownership alone must not preserve access to a document after
        // its role/share/user-permission scope is revoked. Re-check the attached
        // document before exposing or mutating collaboration state.
        await loadAuthorizedDocument(documentStore, permissions, actor, tenantId, assignment.doctype, assignment.name, "read", true);
        return jsonResponse(await collaboration.updateAssignment(tenantId, actor, assignmentId, await readJson<JsonObject>(request, 24_000), new Date().toISOString()));
      }

      const shareMatch = url.pathname.match(/^\/api\/v1\/documents\/([^/]+)\/([^/]+)\/share$/);
      if (shareMatch && request.method === "POST") {
        const doctype = decodeURIComponent(shareMatch[1]!); const name = decodeURIComponent(shareMatch[2]!);
        await loadAuthorizedDocument(documentStore, permissions, actor, tenantId, doctype, name, "share");
        return jsonResponse(await new D1CollaborationService(env.DB).share(tenantId, actor, doctype, name, await readJson<JsonObject>(request, 16_000), new Date().toISOString()), 201);
      }

      const printFormatMatch = url.pathname.match(/^\/api\/v1\/print-formats\/([^/]+)$/);
      if (printFormatMatch && request.method === "PUT") {
        requireSystemManager(actor);
        const name = decodeURIComponent(printFormatMatch[1]!);
        const body = await readJson<JsonObject>(request, 512_000);
        const format = {
          name,
          doc_type: String(body.doc_type ?? ""),
          format_type: body.format_type === "Jinja" ? "Jinja" as const : "Standard" as const,
          html: String(body.html ?? ""),
          ...(typeof body.css === "string" ? { css: body.css } : {}),
          is_default: Boolean(body.is_default),
          disabled: Boolean(body.disabled),
          revision: typeof body.revision === "number" && Number.isInteger(body.revision) ? body.revision : 0,
        };
        return jsonResponse(await metadata.putPrintFormat(tenantId, format, actor.user_id, new Date().toISOString()));
      }
      const printMatch = url.pathname.match(/^\/api\/v1\/print\/([^/]+)\/([^/]+)$/);
      if (printMatch && request.method === "GET") {
        const doctype = decodeURIComponent(printMatch[1]!); const name = decodeURIComponent(printMatch[2]!);
        const document = await loadAuthorizedDocument(documentStore, permissions, actor, tenantId, doctype, name, "print");
        const meta = await metadata.getDocType(tenantId, doctype);
        const share = await access.getShare(tenantId, doctype, name, actor.user_id);
        const printable = meta ? permissions.redactDocument(meta, document, actor, Boolean(share?.read)) : document;
        const format = await metadata.getPrintFormat(tenantId, doctype, url.searchParams.get("format") ?? undefined); if (!format) throw errors.notFound("Print format not found");
        return new Response(renderPrintFormat(format, printable, actor.locale), { status: 200, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff", "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; img-src data: https:; font-src data:", "x-cloudforge-trace-id": traceId } });
      }

      if (request.method === "POST" && url.pathname === "/api/v1/import/preview") {
        const doctype = url.searchParams.get("doctype") ?? ""; if (!doctype) throw errors.validation("doctype is required");
        await permissions.assert({ actor, tenantId, doctype, action: "import" });
        const meta = await metadata.getDocType(tenantId, doctype); if (!meta || meta.is_child) throw errors.validation("Import requires an executable DocType");
        const preview = parseCsvImport(await readBoundedBodyText(request, 5_000_000));
        const known = new Set(meta.fields.map((field) => field.fieldname));
        const unknown = preview.headers.filter((header) => header !== "name" && !known.has(header));
        if (unknown.length) throw errors.validation(`Unknown import columns: ${unknown.join(", ")}`);
        return jsonResponse(preview);
      }
      if (request.method === "POST" && url.pathname === "/api/v1/import/apply") {
        const doctype = url.searchParams.get("doctype") ?? ""; if (!doctype) throw errors.validation("doctype is required");
        await permissions.assert({ actor, tenantId, doctype, action: "import" });
        await permissions.assert({ actor, tenantId, doctype, action: "create" });
        const meta = await metadata.getDocType(tenantId, doctype); if (!meta || meta.is_child) throw errors.validation("Import requires an executable DocType");
        const preview = parseCsvImport(await readBoundedBodyText(request, 5_000_000), 100);
        if (preview.errors.length) throw errors.validation("CSV contains invalid rows", { error_count: preview.errors.length });
        const results: JsonObject[] = []; let imported = 0; let failed = 0;
        for (let index = 0; index < preview.rows.length; index += 1) {
          let name = "";
          try {
            const row = coerceImportRow(preview.rows[index]!, meta.fields);
            name = typeof row.name === "string" ? row.name.trim() : ""; delete row.name;
            if (!name) {
              if (!meta.autoname) throw errors.validation(`Row ${index + 2} requires name because ${doctype} has no autoname`);
              if (meta.autoname === "field:name") throw errors.validation(`Row ${index + 2} requires name for field:name autoname`);
              name = await metadata.nextName(tenantId, doctype, meta.autoname, new Date().toISOString());
            }
            const command: MutationCommand = { schema_version: 1, command_id: randomId("import"), tenant_id: tenantId, actor, aggregate: { doctype, name }, action: "create", expected_version: null, payload_hash: "", document: row };
            command.payload_hash = await commandPayloadHash(command as unknown as Record<string, unknown>);
            const stub = env.AGGREGATES.getByName(`${tenantId}:${doctype}:${name}`) as AggregateStub;
            const receipt = typeof stub.mutate === "function" ? await stub.mutate(command) : await callDoFetch(stub, command);
            results.push({ row: index + 2, name, status: "imported", receipt: receipt as JsonObject }); imported += 1;
          } catch (error) {
            const normalized = asCloudForgeError(error); failed += 1;
            results.push({ row: index + 2, ...(name ? { name } : {}), status: "failed", error: { code: normalized.code, message: normalized.status >= 500 ? "Import row failed" : normalized.message } });
          }
        }
        return jsonResponse({ imported, failed, results }, failed ? 207 : 201, { "x-cloudforge-trace-id": traceId });
      }

      if (request.method === "POST" && url.pathname === "/api/v1/export/csv") {
        const body = await readJson<JsonObject>(request, 32_000);
        const doctype = typeof body.doctype === "string" ? body.doctype : "";
        if (!doctype) throw errors.validation("doctype is required");
        await permissions.assert({ actor, tenantId, doctype, action: "export", owner: actor.user_id });
        const service = new DocumentListService(new D1DocumentListStore(env.DB), permissions, new MetadataDocumentListDefinitionResolver(metadata));
        const maxRows = typeof body.max_rows === "number" && Number.isSafeInteger(body.max_rows) ? Math.min(Math.max(body.max_rows, 1), 1000) : 1000;
        const base: JsonObject = { ...body, doctype, limit: 100 }; delete base.max_rows; delete base.cursor;
        const rows: Array<Record<string, unknown>> = []; let cursor: string | null = null;
        do {
          const page = await service.list(actor, tenantId, { ...base, ...(cursor ? { cursor } : {}) });
          for (const row of page.rows) if (rows.length < maxRows) rows.push(row);
          cursor = page.has_more && rows.length < maxRows ? page.next_cursor : null;
        } while (cursor);
        const requestedFields = Array.isArray(body.fields) ? body.fields.filter((field): field is string => typeof field === "string") : [];
        const fields = requestedFields.length ? requestedFields : [...new Set(rows.flatMap((row) => Object.keys(row)))];
        return new Response(`﻿${encodeCsv(fields, rows)}`, { status: 200, headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${safeFilename(doctype)}.csv"`, "cache-control": "private, no-store", "x-content-type-options": "nosniff", "x-cloudforge-trace-id": traceId } });
      }

      if (request.method === "PUT" && url.pathname === "/api/v1/files") {
        if (!env.FILES) throw errors.validation("File storage is not configured");
        const doctype = url.searchParams.get("doctype") ?? undefined; const name = url.searchParams.get("name") ?? undefined;
        if (Boolean(doctype) !== Boolean(name)) throw errors.validation("doctype and name must be supplied together");
        if (doctype && name) await loadAuthorizedDocument(documentStore, permissions, actor, tenantId, doctype, name, "save");
        const fileName = url.searchParams.get("filename")?.trim() ?? ""; if (!fileName || fileName.length > 240) throw errors.validation("filename is required");
        const bytes = await readBoundedBody(request, 10_000_000); const fileId = randomId("file"); const storageKey = `${tenantId}/${fileId}`; const now = new Date().toISOString();
        const contentType = (request.headers.get("content-type") ?? "application/octet-stream").split(";")[0]!.trim().toLowerCase();
        if (isActiveContentType(contentType, fileName)) throw errors.validation("Active web content and executable attachments are not allowed");
        await env.FILES.put(storageKey, bytes, { httpMetadata: { contentType }, customMetadata: { tenant_id: tenantId, owner: actor.user_id } });
        await env.DB.prepare(`INSERT INTO files(tenant_id,file_id,file_name,content_type,size_bytes,storage_key,attached_to_doctype,attached_to_name,is_private,owner,created_at) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)`).bind(tenantId, fileId, fileName, contentType, bytes.byteLength, storageKey, doctype ?? null, name ?? null, url.searchParams.get("private") === "false" ? 0 : 1, actor.user_id, now).run();
        return jsonResponse({ file_id: fileId, file_name: fileName, size_bytes: bytes.byteLength, attached_to_doctype: doctype ?? null, attached_to_name: name ?? null }, 201);
      }
      const fileMatch = url.pathname.match(/^\/api\/v1\/files\/([^/]+)$/);
      if (fileMatch && (request.method === "GET" || request.method === "DELETE")) {
        if (!env.FILES) throw errors.notFound();
        const fileId = decodeURIComponent(fileMatch[1]!);
        const row = await env.DB.prepare(`SELECT file_name,content_type,storage_key,attached_to_doctype,attached_to_name,is_private,owner FROM files WHERE tenant_id=?1 AND file_id=?2`).bind(tenantId, fileId).first<{ file_name: string; content_type: string; storage_key: string; attached_to_doctype: string | null; attached_to_name: string | null; is_private: number; owner: string }>();
        if (!row) throw errors.notFound();
        if (row.attached_to_doctype && row.attached_to_name) {
          await loadAuthorizedDocument(documentStore, permissions, actor, tenantId, row.attached_to_doctype, row.attached_to_name, request.method === "GET" ? "read" : "save", request.method === "GET");
        } else if (row.is_private && row.owner !== actor.user_id && !isSystemManager(actor)) throw errors.notFound();
        if (request.method === "DELETE") {
          if (row.owner !== actor.user_id && !isSystemManager(actor)) throw errors.permission("Only the file owner or manager may delete it");
          await env.FILES.delete(row.storage_key);
          await env.DB.prepare(`DELETE FROM files WHERE tenant_id=?1 AND file_id=?2`).bind(tenantId, fileId).run();
          return jsonResponse({ deleted: true, file_id: fileId });
        }
        const object = await env.FILES.get(row.storage_key); if (!object) throw errors.notFound();
        const objectBody = (object as unknown as { body: BodyInit }).body;
        return new Response(objectBody, { headers: { "content-type": row.content_type, "content-disposition": `attachment; filename="${safeFilename(row.file_name)}"`, "cache-control": row.is_private ? "private, no-store" : "public, max-age=3600", "x-content-type-options": "nosniff", "content-security-policy": "default-src 'none'" } });
      }

      const match = url.pathname.match(/^\/api\/v1\/documents\/([^/]+)\/([^/]+)$/);
      if (request.method === "GET" && match) {
        const doctype = decodeURIComponent(match[1]!);
        const name = decodeURIComponent(match[2]!);
        const document = await loadAuthorizedDocument(documentStore, permissions, actor, tenantId, doctype, name, "read", true);
        const meta = await metadata.getDocType(tenantId, doctype);
        const share = await access.getShare(tenantId, doctype, name, actor.user_id);
        const response = meta ? permissions.redactDocument(meta, document, actor, Boolean(share?.read)) : document;
        return jsonResponse(response, 200, { "x-cloudforge-trace-id": traceId });
      }

      return jsonResponse({ error: { code: "ROUTE_NOT_FOUND" } }, 404);
    } catch (error) {
      return errorResponse(error, traceId);
    }
  },
  async scheduled(_controller: unknown, env: TenantEnv, ctx: ExecutionContext): Promise<void> {
    if (!env.OUTBOX_QUEUE || !env.TENANT_ID) return;
    ctx.waitUntil(publishPendingOutbox(env.DB, env.OUTBOX_QUEUE, env.TENANT_ID).then(() => undefined));
  },
};

/**
 * Serves the Frappe-compatible surface.
 *
 * Returns null only when cookie sessions are not configured at all, so the caller
 * falls through to the native routes rather than failing a request the platform
 * could still answer with bearer auth.
 */
async function serveFrappeApi(
  request: Request,
  url: URL,
  env: TenantEnv,
  tenantId: string,
  traceId: string,
): Promise<Response | null> {
  const sessionSecret = env.SESSION_SECRET;
  if (!sessionSecret && env.AUTH_MODE !== "development") return null;

  const now = (): string => new Date().toISOString();
  const users = new D1UserStore(env.DB);
  const authContext: AuthRouteContext = { tenantId, users, sessionSecret: sessionSecret ?? "", traceId, now };

  if (isPublicFrappePath(url.pathname)) {
    if (!sessionSecret) return jsonResponse({ error: { code: "SESSION_NOT_CONFIGURED" }, trace_id: traceId }, 503);
    return routeFrappeAuth(request, url, authContext);
  }

  let established: EstablishedSession | null = null;
  if (sessionSecret) established = await establishSession(request, authContext);

  let actor;
  let fullName = "";
  let language = "";
  let csrfToken = "";
  if (established) {
    assertSessionCsrf(request, established);
    actor = established.actor;
    fullName = established.user.full_name;
    language = established.user.language;
    csrfToken = established.session.csrfToken;
  } else if (env.AUTH_MODE === "development") {
    actor = staticDevelopmentActor(env.DEV_ACTOR_JSON);
    fullName = actor.user_id;
  } else {
    // Frappe answers an unauthenticated call to a login-required method with
    // PermissionError/403 whose message contains "Login to access" — NOT 401.
    // The client keys its session-expiry detection off exactly that, so a
    // "more correct" 401 here would leave a re-login prompt unreachable.
    throw errors.permission("Login to access this resource");
  }

  const metadata = new D1MetadataStore(env.DB);
  const access = new D1DocumentAccessStore(env.DB);
  const permissions = new MetadataPermissionService(metadata, undefined, access);
  const documents = new D1MutationStore(env.DB);

  const response = await routeFrappeApi(request, url, {
    tenantId,
    actor,
    traceId,
    metadata,
    permissions,
    documents,
    access,
    collaboration: new D1CollaborationService(env.DB),
    listService: new DocumentListService(new D1DocumentListStore(env.DB), permissions, new MetadataDocumentListDefinitionResolver(metadata)),
    async runCommand(command) {
      const stub = env.AGGREGATES.getByName(`${tenantId}:${command.aggregate.doctype}:${command.aggregate.name}`) as AggregateStub;
      const result = typeof stub.mutate === "function" ? await stub.mutate(command) : await callDoFetch(stub, command);
      return result as MutationReceipt;
    },
    now,
    csrfToken,
    fullName,
    language,
  });
  if (!response) return null;

  // Slide the cookie only when it is close to expiring, so an active user is not
  // logged out mid-session and an idle one still ages out.
  if (established) {
    const refreshed = await slideSession(established, authContext);
    if (refreshed) response.headers.append("set-cookie", refreshed);
  }
  return response;
}

function coerceImportRow(row: JsonObject, fields: Array<{ fieldname: string; fieldtype: string }>): JsonObject {
  const output: JsonObject = {}; const types = new Map(fields.map((field) => [field.fieldname, field.fieldtype]));
  for (const [key, raw] of Object.entries(row)) {
    if (key === "name") { output.name = String(raw ?? ""); continue; }
    const type = types.get(key); if (!type) throw errors.validation(`Unknown import column ${key}`);
    const value = String(raw ?? "").trim();
    if (value === "") continue;
    if (type === "Int") { const parsed = Number(value); if (!Number.isSafeInteger(parsed)) throw errors.validation(`${key} must be an integer`); output[key] = parsed; }
    else if (type === "Check") { if (!["0","1","true","false","yes","no"].includes(value.toLowerCase())) throw errors.validation(`${key} must be a boolean`); output[key] = ["1","true","yes"].includes(value.toLowerCase()); }
    else if (["Table","Table MultiSelect","JSON"].includes(type)) { try { output[key] = JSON.parse(value) as JsonObject; } catch { throw errors.validation(`${key} must contain valid JSON`); } }
    else output[key] = value;
  }
  return output;
}

async function authenticate(request: Request, env: TenantEnv, tenantId: string, traceId: string): Promise<Actor> {
  if (env.AUTH_MODE === "development") return staticDevelopmentActor(env.DEV_ACTOR_JSON);
  const keys = trustedIdentityKeys(env);
  const identity = await verifyTrustedIdentity(request, {
    tenantId,
    traceId,
    // Hardened: verify against this tenant's own derived key(s). Otherwise treat
    // INTERNAL_AUTH_SECRET as the platform master and derive on the fly.
    ...(keys.length > 0 ? { keys } : { masterSecret: env.INTERNAL_AUTH_SECRET }),
  });
  return identity.actor;
}

function trustedIdentityKeys(env: TenantEnv): TrustedIdentityKey[] {
  const keys: TrustedIdentityKey[] = [];
  if (env.INTERNAL_AUTH_KEY_ID) keys.push({ key_id: env.INTERNAL_AUTH_KEY_ID, secret: env.INTERNAL_AUTH_SECRET });
  if (env.INTERNAL_AUTH_KEY_ID_PREVIOUS && env.INTERNAL_AUTH_SECRET_PREVIOUS) {
    keys.push({ key_id: env.INTERNAL_AUTH_KEY_ID_PREVIOUS, secret: env.INTERNAL_AUTH_SECRET_PREVIOUS });
  }
  return keys;
}

async function callDoFetch(stub: DurableObjectStub, command: MutationCommand): Promise<unknown> {
  const response = await stub.fetch("https://aggregate.internal/mutate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(command),
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json() as Promise<unknown>;
}


function isSystemManager(actor: Actor): boolean {
  return actor.user_id === "Administrator" || actor.roles.includes("Administrator") || actor.roles.includes("System Manager");
}
function requireSystemManager(actor: Actor): void { if (!isSystemManager(actor)) throw errors.permission("System Manager is required"); }
async function readBoundedBody(request: Request, maxBytes: number): Promise<ArrayBuffer> {
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(declared) && declared > maxBytes) throw errors.validation("Request body exceeds size limit");
  const chunks: Uint8Array[] = []; let total = 0;
  if (!request.body) return new ArrayBuffer(0);
  for await (const chunk of request.body as unknown as AsyncIterable<Uint8Array>) {
    total += chunk.byteLength; if (total > maxBytes) throw errors.validation("Request body exceeds size limit"); chunks.push(chunk);
  }
  const result = new Uint8Array(total); let offset = 0; for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength; } return result.buffer;
}
async function readBoundedBodyText(request: Request, maxBytes: number): Promise<string> { return new TextDecoder().decode(await readBoundedBody(request, maxBytes)); }
function requireShortText(value: unknown, field: string, max: number): string {
  if (typeof value !== "string" || !value.trim() || value.length > max) throw errors.validation(`${field} is required and must be at most ${max} characters`);
  return value.trim();
}

async function loadAuthorizedDocument(
  store: D1MutationStore,
  permissions: MetadataPermissionService,
  actor: Actor,
  tenantId: string,
  doctype: string,
  name: string,
  action: "read" | "save" | "print" | "share",
  hideUnauthorized = false,
): Promise<CanonicalDocument<JsonObject>> {
  const document = await store.getDocument(tenantId, doctype, name);
  if (!document) throw errors.notFound();
  try {
    await permissions.assert({ actor, tenantId, doctype, name, owner: document.owner, data: document.data, action });
  } catch (error) {
    if (hideUnauthorized) throw errors.notFound();
    throw error;
  }
  return document;
}

function encodeCsv(fields: string[], rows: Array<Record<string, unknown>>): string {
  const escape = (value: unknown): string => {
    const text = value === null || value === undefined ? "" : typeof value === "object" ? JSON.stringify(value) : String(value);
    const safe = /^[=+@-]/.test(text) ? `'${text}` : text;
    return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  return [fields.map(escape).join(","), ...rows.map((row) => fields.map((field) => escape(row[field])).join(","))].join("\r\n");
}
function isActiveContentType(contentType: string, fileName: string): boolean {
  const extension = fileName.toLowerCase().split(".").pop() ?? "";
  return ["text/html", "image/svg+xml", "application/javascript", "text/javascript", "application/x-msdownload", "application/x-sh", "text/x-shellscript"].includes(contentType)
    || ["html", "htm", "svg", "js", "mjs", "exe", "dll", "bat", "cmd", "sh", "ps1"].includes(extension);
}
function safeFilename(value: string): string { return value.replace(/[\r\n"\\/]/g, "_").slice(0, 240); }
