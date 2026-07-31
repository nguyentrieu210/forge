import {
  APP_CALLBACK_HEADER,
  assertInternalService,
  D1UserStore,
  staticDevelopmentActor,
  verifyTrustedIdentity,
} from "../../../packages/auth/src/index.js";
import {
  assertSessionCsrf, D1DeskViewStore, D1TranslationStore, establishSession, faultResponse, isFrappePath, isPublicFrappePath,
  buildCommand, isPublicFilePath, isStorefrontPath, isWebFormPath, routeFileDownload, routeFrappeApi, routeFrappeAuth, runAutoRepeat, runNotificationRules, slideSession,
  type AuthRouteContext, type AutoRepeatRunResult, type EstablishedSession,
} from "../../../packages/frappe-api/src/index.js";
import {
  AppHookDispatcher, AppInstaller, runAppValidators, subscribersFor, validatorsFor,
  type AppManifest, type HookDeliveryOutcome,
} from "../../../packages/app-registry/src/index.js";
import type { TrustedIdentityKey } from "../../../packages/auth/src/index.js";
import type { Actor, CanonicalDocument, DomainEvent, JsonObject, MutationCommand, MutationReceipt } from "../../../packages/contracts/src/index.js";
import { parseMutationCommandInput } from "../../../packages/contracts/src/index.js";
import { previewPurchaseReceiptSubmission } from "../../../packages/clouderp-core/src/index.js";
import { D1CommercialReconciliationService, D1DocumentListStore, D1MutationStore, D1RolloutPurchaseAllocationDomainStore, DocumentListService } from "../../../packages/document-kernel/src/index.js";
import { asCloudForgeError, commandPayloadHash, errorResponse, errors, jsonResponse, randomId, readJson } from "../../../packages/core/src/index.js";
import {
  D1CollaborationService, D1DocumentAccessStore, D1MetadataStore, D1SearchStore,
  MetadataDocumentListDefinitionResolver, MetadataPermissionService,
  metadataSummary, parseCsvImport, parseDocTypeMeta, renderPrintFormat, validateWorkflow,
} from "../../../packages/frappe-model/src/index.js";
import { AggregateCoordinator } from "./aggregate-do.js";
import { askAssistant, readReceiptImage } from "./ai-assistant.js";
import { publishPendingOutbox } from "../../../packages/outbox/src/index.js";
import { AppReportService, D1ReportService } from "../../../packages/query/src/index.js";
import { ingestFacebookMessage, storeFacebookOAuthPages, type FacebookOAuthPage } from "../../../packages/social-commerce/src/tenant-handler.js";
import type { SocialQueueMessage } from "../../../packages/social-commerce/src/index.js";
import { routeSocialCommerceApi } from "../../../packages/social-commerce/src/api.js";
import type { TenantEnv } from "./env.js";

export { AggregateCoordinator };

interface AggregateStub extends DurableObjectStub {
  mutate<T extends JsonObject>(command: MutationCommand<T>): Promise<unknown>;
}

/**
 * The tenant this request belongs to — and a refusal when the two sources disagree.
 *
 * `env.TENANT_ID` is what this Worker script was DEPLOYED as; `x-cloudforge-tenant` is
 * what the gateway ROUTED, derived from the hostname and signed into the trusted
 * identity. In a correct deployment they are the same value.
 *
 * When they differ, the script is bound to the wrong database, and serving the request
 * is a CROSS-TENANT DATA BREACH: a customer reaching their own hostname is handed
 * another customer's records, with nothing in any log to say so.
 *
 * It is not hypothetical. `wrangler deploy --config <other tenant's config> --name
 * cloudforge-tenant-hrm` overrides only the SCRIPT NAME — vars and D1 bindings come
 * from the config — so one careless flag silently pointed the `hrm` script at `demo`'s
 * database. It answered logins with demo's credentials and served demo's documents.
 *
 * Neither value can be trusted over the other, so neither is used: `env.TENANT_ID`
 * would serve the wrong tenant, and preferring the header would let anything that can
 * reach this Worker name its own tenant. The only safe answer is to fail.
 */
function resolveTenant(request: Request, env: TenantEnv): string | null {
  const routed = request.headers.get("x-cloudforge-tenant");
  if (env.TENANT_ID && routed && routed !== env.TENANT_ID) {
    // Deliberately not naming either tenant in the message: the caller must not learn
    // which other tenant this script is bound to.
    throw errors.misconfigured("Tenant binding mismatch");
  }
  return env.TENANT_ID ?? routed;
}

export default {
  async fetch(request: Request, env: TenantEnv): Promise<Response> {
    const traceId = request.headers.get("x-cloudforge-trace-id") ?? randomId("trace");
    try {
      const url = new URL(request.url);
      if (url.pathname === "/health") {
        const tenant = env.TENANT_ID ?? null;
        return jsonResponse({
          ok: true,
          service: "tenant-worker",
          tenant,
          maintenance: tenant ? await maintenanceHealth(env.DB, tenant) : null,
        });
      }

      if (request.method === "POST" && url.pathname === "/internal/outbox/flush") {
        assertInternalService(request, env.INTERNAL_SERVICE_TOKEN);
        if (!env.OUTBOX_QUEUE) throw new Error("OUTBOX_QUEUE binding is missing");
        const tenant = resolveTenant(request, env);
        if (!tenant) throw new Error("Missing tenant context");
        return jsonResponse(await publishPendingOutbox(env.DB, env.OUTBOX_QUEUE, tenant));
      }
      // Everything `scheduled()` would have done, for a caller whose crons do fire.
      // Kept separate from /internal/outbox/flush, which drains the outbox only.
      if (request.method === "POST" && url.pathname === "/internal/maintenance") {
        assertInternalService(request, env.INTERNAL_SERVICE_TOKEN);
        const tenant = resolveTenant(request, env);
        if (!tenant) throw new Error("Missing tenant context");
        return jsonResponse(await runMaintenance(env, tenant));
      }
      if (request.method === "GET" && url.pathname === "/internal/reconciliation") {
        assertInternalService(request, env.INTERNAL_SERVICE_TOKEN);
        const tenant = resolveTenant(request, env);
        if (!tenant) throw new Error("Missing tenant context");
        const report = await new D1CommercialReconciliationService(env.DB).run(tenant);
        return jsonResponse(report, report.ok ? 200 : 409, { "x-cloudforge-trace-id": traceId });
      }

      if (request.method === "POST" && url.pathname === "/internal/social/events") {
        assertInternalService(request, env.INTERNAL_SERVICE_TOKEN);
        const tenant = resolveTenant(request, env);
        if (!tenant) throw new Error("Missing tenant context");
        const message = await readJson<JsonObject>(request, 1_100_000) as unknown as SocialQueueMessage;
        const idempotencyKey = request.headers.get("x-cloudforge-idempotency-key");
        if (!idempotencyKey || idempotencyKey !== message.event_id) throw new Error("Social event idempotency key mismatch");
        const result = await ingestFacebookMessage(env.DB, tenant, message);
        return jsonResponse({ committed: true, event_id: message.event_id, ...result }, 200, {
          "x-cloudforge-social-event-committed": message.event_id,
          "x-cloudforge-trace-id": traceId,
        });
      }

      if (request.method === "POST" && url.pathname === "/internal/social/oauth/facebook") {
        assertInternalService(request, env.INTERNAL_SERVICE_TOKEN);
        const tenant = resolveTenant(request, env);
        if (!tenant) throw new Error("Missing tenant context");
        if (!env.SOCIAL_CREDENTIAL_KEK) throw new Error("SOCIAL_CREDENTIAL_KEK is not configured");
        const body = await readJson<JsonObject>(request, 1_000_000) as unknown as { actor_id: string; pages: FacebookOAuthPage[] };
        const result = await storeFacebookOAuthPages(env.DB, tenant, body.actor_id, body.pages, env.SOCIAL_CREDENTIAL_KEK);
        return jsonResponse({ committed: true, ...result });
      }

      if (request.method === "POST" && url.pathname === "/internal/events") {
        assertInternalService(request, env.INTERNAL_SERVICE_TOKEN);
        const event = await readJson<JsonObject>(request, 512_000) as unknown as DomainEvent;
        const tenant = resolveTenant(request, env);
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

        // Fan out to app Workers AFTER the event is durably recorded. Deliveries are
        // tracked per app, so a failing app is retried by the scheduled sweep
        // without holding up this confirmation — the queue must not redeliver the
        // platform event just because one app's Worker is down.
        // Notification rules run on the same committed event, for the same reason app
        // hooks do: an alert is a reaction, and nothing about it can change whether the
        // write should have happened. It never throws — the client has already been
        // told the document exists, so a broken rule must not make a successful save
        // look like a failure.
        const notifications = await runNotificationRules(
          env.DB, new D1DeskViewStore(env.DB), tenant, event, new Date().toISOString(),
        ).catch((error) => {
          console.error(JSON.stringify({
            level: "error", trace_id: traceId, code: "NOTIFICATION_RULES_FAILED",
            detail: error instanceof Error ? error.message : String(error),
          }));
          return { matched: 0, delivered: 0, skipped: 0 };
        });

        let hookOutcomes: HookDeliveryOutcome[] = [];
        try {
          hookOutcomes = await fanOutAppHooks(env, tenant, event);
        } catch (error) {
          // A fan-out failure is logged and left to the sweep. Failing the response
          // here would make the queue redeliver an event the platform already
          // committed.
          console.error(JSON.stringify({
            level: "error", trace_id: traceId, code: "APP_HOOK_FANOUT_FAILED",
            detail: error instanceof Error ? error.message : String(error),
          }));
        }
        return jsonResponse(
          { committed: true, event_id: idempotencyKey, inserted, hooks: hookOutcomes, notifications },
          200,
          { "x-cloudforge-event-committed": idempotencyKey },
        );
      }

      const tenantId = resolveTenant(request, env);
      if (!tenantId) throw new Error("Missing tenant context");

      // ---- Frappe-shaped surface -------------------------------------------
      // Mounted ahead of the native routes and authenticated by cookie session
      // rather than by the gateway's trusted identity, so that revocation is
      // checked against the live user directory on every request.
      // `/files/…` joins them because it is authenticated the same way and, for a public
      // file, not at all: it is the URL that ends up inside an `<img src>` on the public
      // catalogue, so it must resolve for a browser that has never logged in.
      if (isFrappePath(url.pathname) || isPublicFilePath(url.pathname)) {
        const frappeResponse = await serveFrappeApi(request, url, env, tenantId, traceId);
        if (frappeResponse) return frappeResponse;
      }

      const actor = await authenticate(request, env, tenantId, traceId);
      const metadata = new D1MetadataStore(env.DB);
      const access = new D1DocumentAccessStore(env.DB);
      const permissions = new MetadataPermissionService(metadata, undefined, access);
      const documentStore = new D1MutationStore(env.DB);

      if (request.method === "POST" && url.pathname === "/api/v1/social/facebook/oauth/start") {
        requireSystemManager(actor);
        if (!env.SOCIAL_INGRESS || !env.PUBLIC_ORIGIN) throw errors.misconfigured("Facebook OAuth service is not configured");
        const response = await env.SOCIAL_INGRESS.fetch("https://social-ingress.internal/internal/oauth/facebook/start", {
          method: "POST", headers: { "content-type": "application/json", "authorization": `Bearer ${env.INTERNAL_SERVICE_TOKEN}` },
          body: JSON.stringify({ tenant_id: tenantId, actor_id: actor.user_id, return_url: `${env.PUBLIC_ORIGIN}/x/social-commerce` }),
        });
        return new Response(response.body, { status: response.status, headers: response.headers });
      }
      const socialResponse = await routeSocialCommerceApi(request, url, env.DB, tenantId, actor);
      if (socialResponse) return socialResponse;

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
        // The document is forwarded so field-, series- and format-based patterns
        // can read the values they name from.
        const namingDocument = body.document && typeof body.document === "object" && !Array.isArray(body.document) ? body.document : {};
        return jsonResponse({ name: await metadata.nextName(tenantId, doctype, meta.autoname ?? "hash", new Date().toISOString(), namingDocument), metadata_revision: meta.revision });
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
              name = await metadata.nextName(tenantId, doctype, meta.autoname, new Date().toISOString(), row);
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
    if (!env.TENANT_ID) return;
    ctx.waitUntil(runMaintenance(env, env.TENANT_ID).then(() => undefined));
  },
};

/**
 * The periodic work a tenant owes: drain its outbox into the queue, and retry app
 * hook deliveries that failed.
 *
 * Called from BOTH `scheduled()` and `POST /internal/maintenance`, because this
 * Worker's cron trigger never fires in the deployment that matters. A Worker
 * uploaded into a dispatch namespace is only ever invoked through the dispatcher —
 * its `triggers.crons` are accepted at deploy time and silently never run. The
 * symptom is not an error anywhere: events simply accumulate in `outbox` with status
 * `pending` forever. It was found on the live deployment with 27 events two days old.
 *
 * So the jobs Worker — an ordinary Worker, whose crons do fire — calls the endpoint
 * on a schedule for every active tenant. Both entry points run THIS function so the
 * two can never drift into doing different work.
 *
 * Awaited rather than fire-and-forget, so an HTTP caller learns what happened and a
 * failure surfaces instead of vanishing into a discarded promise.
 */
export async function runMaintenance(
  env: TenantEnv,
  tenantId: string,
): Promise<{
  outbox: { published: number; failed: number; skipped: number } | null;
  hooks: number;
  auto_repeat: AutoRepeatRunResult;
  reservations: { expired: number; failed: number };
  alumdoor: { reconciliation_reminders: number; daily_reports: number };
}> {
  const startedAt = new Date().toISOString();
  await recordMaintenanceState(env.DB, tenantId, { last_started_at: startedAt, last_error: null });
  try {
  const outbox = env.OUTBOX_QUEUE
    ? await publishPendingOutbox(env.DB, env.OUTBOX_QUEUE, tenantId)
    : null;
  // Without this a single outage in an app's Worker would drop every event that
  // arrived during it.
  const hooks = env.DISPATCHER
    ? (await new AppHookDispatcher(env.DB, {
      DISPATCHER: env.DISPATCHER,
      ...(env.INTERNAL_AUTH_SECRET ? { INTERNAL_AUTH_SECRET: env.INTERNAL_AUTH_SECRET } : {}),
    }).sweep(tenantId, new Date().toISOString())).length
    : 0;

  // Auto Repeat needs a scheduler, and this Worker's own cron never fires inside a
  // dispatch namespace — so it lives here, driven by the jobs Worker, exactly like the
  // outbox drain above.
  const now = new Date().toISOString();
  const documents = new D1MutationStore(env.DB);
  const directory = new D1UserStore(env.DB);
  const auto_repeat = await runAutoRepeat({
    db: env.DB,
    tenantId,
    today: now.slice(0, 10),
    now,
    loadSource: (doctype, name) => documents.getDocument(tenantId, doctype, name),
    // Through the ORDINARY command path: a scheduled document must pass the same
    // permissions, validators and workflow rules a person's would. A scheduler that
    // bypassed them would be a way to create documents nobody is allowed to create.
    runCommand: async (command) => {
      const stub = env.AGGREGATES.getByName(`${tenantId}:${command.aggregate.doctype}:${command.aggregate.name}`) as AggregateStub;
      const result = typeof stub.mutate === "function" ? await stub.mutate(command) : await callDoFetch(stub, command);
      return result as MutationReceipt;
    },
    buildCreate: async (doctype, document, actor) => buildCommand({
      tenantId, actor, doctype,
      // The server allocates the name from the doctype's series, exactly as it would
      // for a person: a scheduler must not invent names of its own.
      name: "",
      action: "create",
      expectedVersion: null,
      document,
    }),
    // The schedule's owner with their REAL roles: a repeat must not be able to create
    // what the person who set it up could not, and revoking that person's role must
    // stop their schedules too.
    actorFor: async (ownerId) => {
      const userId = ownerId || "Administrator";
      return { user_id: userId, roles: await directory.listRoles(tenantId, userId) };
    },
  });

  const reservations = await expireStockReservations(env, tenantId, now);
  const alumdoor = await runAlumdoorMaintenance(env.DB, tenantId, now);
  await recordMaintenanceState(env.DB, tenantId, { last_success_at: new Date().toISOString(), last_error: null });
  return { outbox, hooks, auto_repeat, reservations, alumdoor };
  } catch (error) {
    await recordMaintenanceState(env.DB, tenantId, {
      last_error: error instanceof Error ? error.message.slice(0, 1000) : String(error).slice(0, 1000),
    });
    throw error;
  }
}

async function recordMaintenanceState(
  db: D1Database,
  tenantId: string,
  patch: { last_started_at?: string; last_success_at?: string; last_error?: string | null },
): Promise<void> {
  await db.prepare(
    `INSERT INTO maintenance_runs(tenant_id,job_name,last_started_at,last_success_at,last_error)
     VALUES(?1,'tenant-maintenance',?2,?3,?4)
     ON CONFLICT(tenant_id,job_name) DO UPDATE SET
       last_started_at=COALESCE(excluded.last_started_at,maintenance_runs.last_started_at),
       last_success_at=COALESCE(excluded.last_success_at,maintenance_runs.last_success_at),
       last_error=CASE WHEN ?5=1 THEN excluded.last_error ELSE maintenance_runs.last_error END`,
  ).bind(
    tenantId,
    patch.last_started_at ?? null,
    patch.last_success_at ?? null,
    patch.last_error ?? null,
    Object.hasOwn(patch, "last_error") ? 1 : 0,
  ).run();
}

async function maintenanceHealth(
  db: D1Database,
  tenantId: string,
): Promise<{ last_started_at: string | null; last_success_at: string | null; failed: boolean; stale: boolean }> {
  const row = await db.prepare(
    `SELECT last_started_at,last_success_at,last_error FROM maintenance_runs
     WHERE tenant_id=?1 AND job_name='tenant-maintenance'`,
  ).bind(tenantId).first<{ last_started_at: string | null; last_success_at: string | null; last_error: string | null }>();
  const successAt = row?.last_success_at ?? null;
  return {
    last_started_at: row?.last_started_at ?? null,
    last_success_at: successAt,
    failed: Boolean(row?.last_error),
    stale: !successAt || Date.now() - Date.parse(successAt) > 5 * 60_000,
  };
}

export async function runAlumdoorMaintenance(
  db: D1Database,
  tenantId: string,
  now: string,
): Promise<{ reconciliation_reminders: number; daily_reports: number }> {
  const installed = await db.prepare(
    `SELECT version FROM installed_apps WHERE tenant_id=?1 AND app_id='alumdoor'`,
  ).bind(tenantId).first<{ version: string }>();
  if (!installed?.version?.startsWith("2.")) return { reconciliation_reminders: 0, daily_reports: 0 };

  const owners = await db.prepare(
    `SELECT DISTINCT u.user_id,u.time_zone
     FROM users u JOIN user_roles r ON r.tenant_id=u.tenant_id AND r.user_id=u.user_id
     WHERE u.tenant_id=?1 AND u.enabled=1 AND r.role='Chủ xưởng'`,
  ).bind(tenantId).all<{ user_id: string; time_zone: string }>();
  let reconciliationReminders = 0;
  let dailyReports = 0;
  for (const owner of owners.results ?? []) {
    const local = localClock(now, owner.time_zone || "Asia/Bangkok");
    if (local.day === 1) {
      reconciliationReminders += await insertNotification(db, {
        tenantId,
        name: `ALUMDOOR-RECON-MAIN-${local.year}-${two(local.month)}-${owner.user_id}`,
        user: owner.user_id,
        subject: `Đến lịch kiểm kê tháng ${two(local.month)}/${local.year}: kho chính`,
        documentType: "Stock Reconciliation",
        createdAt: now,
      });
      if ([1, 4, 7, 10].includes(local.month)) {
        reconciliationReminders += await insertNotification(db, {
          tenantId,
          name: `ALUMDOOR-RECON-OFFCUT-${local.year}-Q${Math.ceil(local.month / 3)}-${owner.user_id}`,
          user: owner.user_id,
          subject: `Đến lịch kiểm kê quý ${Math.ceil(local.month / 3)}/${local.year}: kho đầu thừa`,
          documentType: "Stock Reconciliation",
          createdAt: now,
        });
      }
    }
    if (local.hour >= 17) {
      const summary = await db.prepare(
        `SELECT
           COUNT(DISTINCT CASE WHEN actual_qty_micros>0 THEN voucher_type||':'||voucher_no END) AS inbound,
           COUNT(DISTINCT CASE WHEN actual_qty_micros<0 THEN voucher_type||':'||voucher_no END) AS outbound,
           COUNT(DISTINCT CASE WHEN voucher_type='Cut Order' THEN voucher_no END) AS cuts,
           (
             SELECT COUNT(*)
             FROM documents receipt
             JOIN document_children line
               ON line.tenant_id=receipt.tenant_id
              AND line.parent_key=receipt.doc_key
              AND line.child_doctype='Purchase Receipt Item'
             LEFT JOIN master_records profile
               ON profile.tenant_id=receipt.tenant_id
              AND profile.record_type='Measurement Profile'
              AND profile.name=json_extract(line.payload_json,'$.measurement_profile')
              AND profile.disabled=0
             WHERE receipt.tenant_id=?1
               AND receipt.doctype='Purchase Receipt'
               AND receipt.docstatus=1
               AND substr(COALESCE(json_extract(receipt.payload_json,'$.posting_at'),receipt.modified_at),1,10)=?2
               AND ABS(CAST(json_extract(line.payload_json,'$.weight_variance_pct') AS REAL))
                   > COALESCE(CAST(json_extract(profile.data_json,'$.weight_tolerance_pct') AS REAL),13)
           ) AS weight_warnings
         FROM stock_ledger_entries
         WHERE tenant_id=?1 AND substr(posting_at,1,10)=?2`,
      ).bind(tenantId, local.date).first<{
        inbound: number;
        outbound: number;
        cuts: number;
        weight_warnings: number;
      }>();
      dailyReports += await insertNotification(db, {
        tenantId,
        name: `ALUMDOOR-EOD-${local.date}-${owner.user_id}`,
        user: owner.user_id,
        subject: `Cuối ngày ${local.date}: nhập ${Number(summary?.inbound ?? 0)} · xuất ${Number(summary?.outbound ?? 0)} · cắt ${Number(summary?.cuts ?? 0)} · lệch cân ${Number(summary?.weight_warnings ?? 0)}`,
        documentType: "Stock Ledger",
        createdAt: now,
      });
    }
  }
  return { reconciliation_reminders: reconciliationReminders, daily_reports: dailyReports };
}

async function insertNotification(
  db: D1Database,
  input: {
    tenantId: string;
    name: string;
    user: string;
    subject: string;
    documentType: string;
    createdAt: string;
  },
): Promise<number> {
  const result = await db.prepare(
    `INSERT OR IGNORE INTO notification_log(
       tenant_id,name,for_user,subject,notification_type,document_type,document_name,read,from_user,created_at
     ) VALUES(?1,?2,?3,?4,'Alert',?5,'',0,'Administrator',?6)`,
  ).bind(input.tenantId, input.name, input.user, input.subject, input.documentType, input.createdAt).run();
  return Number(result.meta?.changes ?? 0);
}

function localClock(iso: string, timeZone: string): {
  year: number; month: number; day: number; hour: number; date: string;
} {
  let formatter: Intl.DateTimeFormat;
  try {
    formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23",
    });
  } catch {
    formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23",
    });
  }
  const parts = Object.fromEntries(formatter.formatToParts(new Date(iso)).map((part) => [part.type, part.value]));
  const year = Number(parts.year);
  const month = Number(parts.month);
  const day = Number(parts.day);
  return { year, month, day, hour: Number(parts.hour), date: `${year}-${two(month)}-${two(day)}` };
}

function two(value: number): string {
  return String(value).padStart(2, "0");
}

async function expireStockReservations(
  env: TenantEnv,
  tenantId: string,
  now: string,
): Promise<{ expired: number; failed: number }> {
  const rows = await env.DB.prepare(
    `SELECT name,version,payload_json
     FROM documents
     WHERE tenant_id=?1 AND doctype='Stock Reservation' AND docstatus=0
       AND json_extract(payload_json,'$.state')='Đang giữ'
       AND COALESCE(json_extract(payload_json,'$.expires_at'),'')<>''
       AND json_extract(payload_json,'$.expires_at')<=?2
     ORDER BY json_extract(payload_json,'$.expires_at') LIMIT 500`,
  ).bind(tenantId, now).all<{ name: string; version: number; payload_json: string }>();
  let expired = 0;
  let failed = 0;
  const actor = { user_id: "Administrator", roles: ["System Manager"] };
  for (const row of rows.results ?? []) {
    try {
      const document = JSON.parse(row.payload_json) as JsonObject;
      const command = await buildCommand({
        tenantId,
        actor,
        doctype: "Stock Reservation",
        name: row.name,
        action: "save",
        expectedVersion: row.version,
        document: { ...document, state: "Hết hạn" },
      });
      const stub = env.AGGREGATES.getByName(`${tenantId}:Stock Reservation:${row.name}`) as AggregateStub;
      if (typeof stub.mutate === "function") await stub.mutate(command);
      else await callDoFetch(stub, command);
      expired++;
    } catch (error) {
      failed++;
      console.error(JSON.stringify({
        level: "error",
        code: "STOCK_RESERVATION_EXPIRY_FAILED",
        tenant_id: tenantId,
        reservation: row.name,
        detail: error instanceof Error ? error.message : String(error),
      }));
    }
  }
  return { expired, failed };
}

/**
 * Delivers one domain event to every app that subscribed to it.
 *
 * Reads the installed manifests rather than a separate subscription table, so a
 * subscription cannot drift out of step with the app that declared it.
 */
async function fanOutAppHooks(env: TenantEnv, tenantId: string, event: DomainEvent): Promise<HookDeliveryOutcome[]> {
  if (!env.DISPATCHER) return [];
  const rows = await env.DB.prepare(
    `SELECT app_id, manifest_json FROM installed_apps WHERE tenant_id=?1`,
  ).bind(tenantId).all<{ app_id: string; manifest_json: string }>();
  const manifests = (rows.results ?? []).map((row) => ({ app_id: row.app_id, manifest: JSON.parse(row.manifest_json) as AppManifest }));
  const targets = subscribersFor(manifests, event.event_type);
  if (!targets.length) return [];

  const dispatcher = new AppHookDispatcher(env.DB, {
    DISPATCHER: env.DISPATCHER,
    ...(env.INTERNAL_AUTH_SECRET ? { INTERNAL_AUTH_SECRET: env.INTERNAL_AUTH_SECRET } : {}),
  });
  return dispatcher.fanOut(tenantId, event, targets, new Date().toISOString());
}

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
  try {
    return await serveFrappeApiInner(request, url, env, tenantId, traceId, sessionSecret);
  } catch (error) {
    // Faults raised OUTSIDE the router — failed authentication, a revoked session,
    // a missing CSRF header — must still be reported in Frappe's error shape.
    // Letting them reach the outer handler would return the native
    // `{error:{code}}` envelope, which the client's normaliser cannot read: it
    // branches on `exc_type`, so the whole error would collapse to "unknown" and
    // a lost session would never surface as one.
    return faultResponse(error, traceId);
  }
}

async function serveFrappeApiInner(
  request: Request,
  url: URL,
  env: TenantEnv,
  tenantId: string,
  traceId: string,
  sessionSecret: string | undefined,
): Promise<Response | null> {
  const requestStarted = performance.now();
  const now = (): string => new Date().toISOString();
  const users = new D1UserStore(env.DB);
  const authContext: AuthRouteContext = {
    tenantId, users, sessionSecret: sessionSecret ?? "", traceId, now,
    rateLimit: {
      db: env.DB,
      salt: env.INTERNAL_AUTH_SECRET,
      clientAddress: request.headers.get("CF-Connecting-IP") ?? "unknown",
    },
  };

  if (isPublicFrappePath(url.pathname)) {
    if (!sessionSecret) return jsonResponse({ error: { code: "SESSION_NOT_CONFIGURED" }, trace_id: traceId }, 503);
    return routeFrappeAuth(request, url, authContext);
  }

  /**
   * An app Worker reading or writing as the user who invoked it.
   *
   * The gateway sets this header only after verifying the app's per-(tenant, app)
   * credential AND the platform-signed identity the app presented, and it strips any
   * copy a caller sent first — so its presence is the gateway's own assertion, not the
   * app's. The identity is nonetheless re-verified below against this tenant's key: the
   * gateway proves WHO may act, this proves the assertion reached us unaltered.
   *
   * Without this branch the Frappe surface has no way to authenticate an app at all, and
   * every app callback answered `403 Login to access this resource` — which is why the
   * app-Worker seam had a signed identity flowing end to end and still could not read a
   * single document.
   */
  const appCallback = request.headers.get(APP_CALLBACK_HEADER);

  let established: EstablishedSession | null = null;
  // Not even attempted on an app callback: the gateway deletes the cookie on that path,
  // and trying both would mean one request with two answers to "who is this".
  if (sessionSecret && !appCallback) established = await establishSession(request, authContext);

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
  } else if (appCallback) {
    const keys = trustedIdentityKeys(env);
    const identity = await verifyTrustedIdentity(request, {
      tenantId,
      traceId,
      ...(keys.length > 0 ? { keys } : { masterSecret: env.INTERNAL_AUTH_SECRET }),
    });
    actor = identity.actor;
    fullName = actor.user_id;
    // No CSRF token, and none is checked: CSRF defends a COOKIE-authenticated request
    // from a cross-site caller. There is no cookie here, so there is nothing a third
    // party's page could ride on — and issuing a token would imply a session exists.
  } else if (!sessionSecret && env.AUTH_MODE === "development") {
    // The development actor is a fallback for when cookie sessions are NOT
    // configured — never an override for them. A deployment carrying both would
    // otherwise authenticate every caller as the dev actor while appearing to
    // have real sessions enabled.
    actor = staticDevelopmentActor(env.DEV_ACTOR_JSON);
    fullName = actor.user_id;
  } else if (isWebFormPath(url.pathname) || isPublicFilePath(url.pathname) || isStorefrontPath(url.pathname)) {
    /**
     * The one surface a visitor with no session may reach.
     *
     * The actor is Guest with NO roles: whatever the submission is allowed to do comes
     * from the form's own `submit_as_role`, applied inside the handler after the form
     * has been loaded and found published. Granting anything here would make every web
     * form as powerful as the most permissive one.
     */
    actor = { user_id: "Guest", roles: [] };
    fullName = "Guest";
  } else {
    // Frappe answers an unauthenticated call to a login-required method with
    // PermissionError/403 whose message contains "Login to access" — NOT 401.
    // The client keys its session-expiry detection off exactly that, so a
    // "more correct" 401 here would leave a re-login prompt unreachable.
    throw errors.permission("Login to access this resource");
  }
  const authenticationFinished = performance.now();

  /**
   * TRỢ LÝ AI — đặt trên đường Frappe, không phải `/api/v1/…`.
   *
   * Trình duyệt xác thực bằng COOKIE phiên, còn `/api/v1/…` đòi bearer JWT — nên bản đầu
   * đặt ở đó trả 401 cho đúng những người dùng nó sinh ra để phục vụ. Ở đây phiên đã dựng
   * xong và CSRF đã kiểm ngay phía trên, nên trợ lý thừa hưởng đúng một danh tính người dùng
   * như mọi màn hình khác.
   *
   * Cả hai đều CHỈ ĐỌC: chúng trả về đề xuất, người dùng soát rồi mới bấm lưu.
   */
  if (request.method === "POST" && url.pathname === "/api/method/metaforge.ai.ask") {
    return askAssistant(
      env,
      await readJson<JsonObject>(request, 64_000),
      { tenantId, userId: actor.user_id },
    );
  }
  if (request.method === "POST" && url.pathname === "/api/method/metaforge.ai.read_receipt") {
    return readReceiptImage(env, tenantId, await readJson<JsonObject>(request, 12_000_000));
  }

  const requestDb = readDatabaseForRequest(request, url, env.DB);
  const metadata = new D1MetadataStore(requestDb);
  const access = new D1DocumentAccessStore(requestDb);
  const permissions = new MetadataPermissionService(metadata, undefined, access);
  const documents = new D1MutationStore(requestDb);

  if (request.method === "GET" && url.pathname === "/api/method/metaforge.api.get_submit_preview") {
    const doctype = requireShortText(url.searchParams.get("doctype"), "doctype", 160);
    const name = requireShortText(url.searchParams.get("name"), "name", 320);
    if (doctype !== "Purchase Receipt") return jsonResponse({ message: null });

    const document = await documents.getDocument(tenantId, doctype, name);
    if (!document) throw errors.notFound(`${doctype} ${name} was not found`);
    if (document.docstatus !== 0) {
      throw errors.lifecycle("Only a draft document can be previewed for submission");
    }
    await permissions.assert({
      actor,
      tenantId,
      doctype,
      name,
      owner: document.owner,
      data: document.data,
      action: "submit",
    });
    const preview = await previewPurchaseReceiptSubmission({
      tenantId,
      actor,
      document,
      reader: new D1RolloutPurchaseAllocationDomainStore(requestDb),
      now: now(),
    });
    return jsonResponse({ message: preview });
  }

  const installedApps = new AppInstaller(requestDb, metadata, users);

  /**
   * Bindings for reaching app Workers, shared by app methods and pre-commit validators.
   *
   * Empty when this deployment has no dispatch namespace: app methods then stay a plain
   * 404, and a manifest that declares validators is refused at install rather than
   * silently having its rules ignored.
   */
  const appMethodEnv = {
    ...(env.DISPATCHER ? { DISPATCHER: env.DISPATCHER } : {}),
    ...(env.INTERNAL_AUTH_SECRET ? { INTERNAL_AUTH_SECRET: env.INTERNAL_AUTH_SECRET } : {}),
    ...(env.INTERNAL_AUTH_KEY_ID ? { INTERNAL_AUTH_KEY_ID: env.INTERNAL_AUTH_KEY_ID } : {}),
    ...(env.PUBLIC_ORIGIN ? { PUBLIC_ORIGIN: env.PUBLIC_ORIGIN } : {}),
  };

  const frappeContext = {
    tenantId,
    actor,
    traceId,
    metadata,
    permissions,
    documents,
    access,
    collaboration: new D1CollaborationService(requestDb),
    listService: new DocumentListService(new D1DocumentListStore(requestDb), permissions, new MetadataDocumentListDefinitionResolver(metadata)),
    customizations: metadata.customizationStore,
    translations: new D1TranslationStore(requestDb),
    apps: installedApps,
    users,
    search: new D1SearchStore(requestDb),
    reports: new D1ReportService(requestDb),
    appReports: new AppReportService(requestDb),
    deskViews: new D1DeskViewStore(requestDb),
    // Typed explicitly: the context is now a standalone object rather than an inline
    // argument, so it no longer inherits the parameter's contextual types.
    async runCommand(command: MutationCommand) {
      // Every write in the façade funnels through here, so this is where an app's
      // pre-commit check belongs: nine call sites in the router today, and any handler
      // added later, are covered without each one remembering to ask.
      //
      // Before the Durable Object, deliberately. Inside it, a slow app would stall every
      // write to that aggregate and a timeout would leave "did it commit?" unanswerable.
      await runAppValidators({
        env: appMethodEnv,
        tenantId,
        actor,
        traceId,
        subject: {
          doctype: command.aggregate.doctype,
          name: command.aggregate.name,
          action: command.action,
          payload: (command.document ?? {}) as JsonObject,
        },
        targets: validatorsFor(await installedApps.list(tenantId), command.aggregate.doctype, command.action),
      });

      const stub = env.AGGREGATES.getByName(`${tenantId}:${command.aggregate.doctype}:${command.aggregate.name}`) as AggregateStub;
      const result = typeof stub.mutate === "function" ? await stub.mutate(command) : await callDoFetch(stub, command);
      return result as MutationReceipt;
    },
    now,
    csrfToken,
    fullName,
    language,
    // Present only when this deployment can reach app Workers. Absent, an unknown
    // method stays an honest 404 instead of a binding error.
    //
    // The SAME object the validators use, not a second one assembled here. It was a
    // second one, and it had drifted: it omitted `PUBLIC_ORIGIN`, so an app method
    // received no callback address and every app method that needed to read anything
    // failed with "callback origin was not supplied by the platform" — while the
    // identical call from a validator worked. Two copies of one env is how that gap
    // stayed invisible.
    ...(env.DISPATCHER && env.INTERNAL_AUTH_SECRET ? { appMethods: appMethodEnv } : {}),
    // Public web forms. The salt is derived from the platform master so the visitor
    // counter can tell people apart without ever storing an address. `CF-Connecting-IP`
    // is set by Cloudflare itself and cannot be spoofed by the caller — an
    // `X-Forwarded-For` here would let one visitor spend everyone else's allowance, or
    // evade their own ceiling by inventing a new address per request.
    ...(env.INTERNAL_AUTH_SECRET
      ? {
        webForms: {
          db: requestDb,
          salt: env.INTERNAL_AUTH_SECRET,
          clientAddress: request.headers.get("CF-Connecting-IP") ?? "unknown",
        },
      }
      : {}),
    // Attachments. Absent when no bucket is bound, and then `upload_file` answers 404
    // instead of writing a database row that points at bytes which were never stored.
    ...(env.FILES ? { files: { db: requestDb, bucket: env.FILES } } : {}),
  };

  // Downloads first: they are not `/api/` paths, so the API router would not claim them.
  const fileResponse = await routeFileDownload(url, frappeContext);
  if (fileResponse) return fileResponse;

  let response = await routeFrappeApi(request, url, frappeContext);
  if (!response) return null;
  if (request.method.toUpperCase() !== "GET" && typeof (requestDb as D1DatabaseSession).getBookmark === "function") {
    // The aggregate Durable Object commits through its own D1 session. Advance this
    // request's primary session after it returns so the bookmark sent to the browser
    // includes that completed write and the next replica read is read-your-writes safe.
    await requestDb.prepare("SELECT 1 AS ok").first().catch(() => null);
  }

  // Slide the cookie only when it is close to expiring, so an active user is not
  // logged out mid-session and an idle one still ages out.
  if (established) {
    const refreshed = await slideSession(established, authContext);
    if (refreshed) response.headers.append("set-cookie", refreshed);
  }
  const completed = performance.now();
  const headers = new Headers(response.headers);
  headers.set(
    "server-timing",
    `auth;dur=${(authenticationFinished - requestStarted).toFixed(1)}, route;dur=${(completed - authenticationFinished).toFixed(1)}, total;dur=${(completed - requestStarted).toFixed(1)}`,
  );
  const metaStats = metadata.cacheStats();
  const permissionStats = permissions.cacheStats();
  headers.set("x-forge-meta-cache", `hit=${metaStats.hits}, miss=${metaStats.misses}`);
  headers.set("x-forge-permission-cache", `hit=${permissionStats.hits}, miss=${permissionStats.misses}`);
  const bookmark = typeof (requestDb as D1DatabaseSession).getBookmark === "function"
    ? (requestDb as D1DatabaseSession).getBookmark()
    : null;
  if (bookmark) headers.set("x-d1-bookmark", bookmark);
  response = new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
  return response;
}

const REPLICA_SAFE_METHODS = new Set([
  "frappe.desk.form.load.getdoctype",
  "frappe.client.get_list",
  "frappe.desk.reportview.get",
  "frappe.client.get_count",
  "frappe.desk.reportview.get_count",
  "frappe.client.get_value",
  "metaforge.api.get_business_context",
  "metaforge.api.get_contextual_list",
  "metaforge.api.get_contextual_count",
  "metaforge.api.get_list_view",
  "frappe.desk.search.search_link",
  "metaforge.api.get_capabilities",
  "metaforge.api.resolve_display_values",
  "metaforge.api.get_application_catalog",
  "metaforge.api.get_overview",
  "metaforge.api.get_app_manifest",
  "metaforge.api.global_search",
  "metaforge.api.get_access_profile",
  "metaforge.api.list_users",
]);

function readDatabaseForRequest(request: Request, url: URL, database: D1Database): D1Database {
  if (!database.withSession) return database;
  if (request.method.toUpperCase() !== "GET") return database.withSession("first-primary");
  const resourceRead = url.pathname.startsWith("/api/resource/");
  const methodName = url.pathname.startsWith("/api/method/")
    ? url.pathname.slice("/api/method/".length)
    : "";
  if (!resourceRead && !REPLICA_SAFE_METHODS.has(methodName)) return database.withSession("first-primary");
  const candidate = request.headers.get("x-d1-bookmark")?.trim();
  // The first browser read establishes a primary bookmark. Later reads may use a
  // replica that has reached that bookmark, avoiding stale post-login/post-write data.
  const constraint = candidate && candidate.length <= 1024 ? candidate : "first-primary";
  return database.withSession(constraint);
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
