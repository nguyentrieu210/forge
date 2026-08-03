import { WorkflowEntrypoint, WorkflowStep } from "cloudflare:workers";
import type { WorkflowEvent } from "cloudflare:workers";
import { errorResponse, jsonResponse, randomId, timingSafeEqualString } from "../../../packages/core/src/index.js";
import {
  assertCursorAdvanced,
  parseRouteIndexRebuildPage,
  parseRouteIndexRebuildParams,
  routeIndexWorkflowInstanceId,
  type RouteIndexRebuildParams,
} from "./contracts.js";

interface WorkflowEnv {
  CONTROL: Fetcher;
  ROUTE_INDEX_REBUILD: Workflow<RouteIndexRebuildParams>;
  CONTROL_TOKEN?: string;
  WORKFLOW_TOKEN?: string;
}

interface RouteIndexWorkflowResult {
  request_id: string;
  pages: number;
  rebuilt: number;
  last_cursor: string | null;
}

export class RouteIndexRebuildWorkflow extends WorkflowEntrypoint<WorkflowEnv, RouteIndexRebuildParams> {
  async run(event: WorkflowEvent<RouteIndexRebuildParams>, step: WorkflowStep): Promise<RouteIndexWorkflowResult> {
    const params = parseRouteIndexRebuildParams(event.payload, event.instanceId);
    const controlToken = requireConfig(this.env.CONTROL_TOKEN, "CONTROL_TOKEN");
    let afterTenantId = params.after_tenant_id;
    let pages = 0;
    let rebuilt = 0;

    for (;;) {
      const pageNumber = pages + 1;
      const previousCursor = afterTenantId;
      const page = await step.do(
        `route-index-page-${pageNumber}`,
        {
          retries: { limit: 5, delay: "2 seconds", backoff: "exponential" },
          timeout: "2 minutes",
        },
        async () => {
          const response = await this.env.CONTROL.fetch("https://control.internal/v1/routes/rebuild-index", {
            method: "POST",
            headers: {
              authorization: `Bearer ${controlToken}`,
              "content-type": "application/json",
              "x-cloudforge-trace-id": params.trace_id,
            },
            body: JSON.stringify({ after_tenant_id: previousCursor, limit: params.page_size }),
          });
          if (!response.ok) {
            const body = (await response.text()).slice(0, 512);
            throw new Error(`control-plane route-index page failed (${response.status}): ${body}`);
          }
          return parseRouteIndexRebuildPage(await response.json());
        },
      );

      assertCursorAdvanced(previousCursor, page);
      pages += 1;
      rebuilt += page.rebuilt;
      if (!page.next_after_tenant_id) {
        return {
          request_id: params.request_id,
          pages,
          rebuilt,
          last_cursor: previousCursor || null,
        };
      }
      afterTenantId = page.next_after_tenant_id;
    }
  }
}

export default {
  async fetch(request: Request, env: WorkflowEnv): Promise<Response> {
    const traceId = request.headers.get("x-cloudforge-trace-id") ?? randomId("trace");
    try {
      const url = new URL(request.url);
      if (request.method === "GET" && url.pathname === "/health") {
        return jsonResponse({ ok: true, service: "workflow-worker" });
      }
      assertOperatorAuth(request, env);

      if (request.method === "POST" && url.pathname === "/v1/workflows/route-index-rebuild") {
        const params = parseRouteIndexRebuildParams(await request.json(), traceId);
        const id = routeIndexWorkflowInstanceId(params.request_id);
        // createBatch is intentionally used with one item: unlike create(), it is
        // idempotent for an already-used instance id. A replay therefore returns the
        // existing instance instead of starting a second rebuild.
        const created = await env.ROUTE_INDEX_REBUILD.createBatch([{ id, params }]);
        const instance = created[0] ?? await env.ROUTE_INDEX_REBUILD.get(id);
        return jsonResponse({ id: instance.id, details: await instance.status() }, 202, {
          "x-cloudforge-trace-id": traceId,
        });
      }

      const match = url.pathname.match(/^\/v1\/workflows\/route-index-rebuild\/([^/]+)(?:\/(restart|terminate))?$/);
      if (match) {
        const id = decodeURIComponent(match[1]!);
        if (!id.startsWith("route-index:") || id.length > 100) {
          return jsonResponse({ error: { code: "WORKFLOW_INSTANCE_ID_INVALID" }, trace_id: traceId }, 400);
        }
        const instance = await env.ROUTE_INDEX_REBUILD.get(id);
        const action = match[2];
        if (request.method === "GET" && !action) {
          return jsonResponse({ id: instance.id, details: await instance.status() }, 200, {
            "x-cloudforge-trace-id": traceId,
          });
        }
        if (request.method === "POST" && action === "restart") {
          await instance.restart();
          return jsonResponse({ id: instance.id, details: await instance.status() }, 202, {
            "x-cloudforge-trace-id": traceId,
          });
        }
        if (request.method === "POST" && action === "terminate") {
          await instance.terminate({ reason: "operator-request" });
          return jsonResponse({ id: instance.id, details: await instance.status() }, 202, {
            "x-cloudforge-trace-id": traceId,
          });
        }
      }

      return jsonResponse({ error: { code: "ROUTE_NOT_FOUND" }, trace_id: traceId }, 404);
    } catch (error) {
      return errorResponse(error, traceId);
    }
  },
};

function assertOperatorAuth(request: Request, env: WorkflowEnv): void {
  const expected = requireConfig(env.WORKFLOW_TOKEN, "WORKFLOW_TOKEN");
  if (!timingSafeEqualString(request.headers.get("authorization") ?? "", `Bearer ${expected}`)) {
    throw new Error("WORKFLOW_AUTH_REQUIRED");
  }
}

function requireConfig(value: string | undefined, name: string): string {
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}
