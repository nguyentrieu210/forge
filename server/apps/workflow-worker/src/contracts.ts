export interface RouteIndexRebuildParams {
  request_id: string;
  trace_id: string;
  page_size: number;
  after_tenant_id: string;
}

export interface RouteIndexRebuildPage {
  rebuilt: number;
  next_after_tenant_id: string | null;
}

const REQUEST_ID = /^[A-Za-z0-9._:-]{1,64}$/;
const TRACE_ID = /^[A-Za-z0-9._:-]{1,96}$/;

export function parseRouteIndexRebuildParams(value: unknown, fallbackTraceId: string): RouteIndexRebuildParams {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("workflow input must be an object");
  const input = value as Record<string, unknown>;
  const requestId = typeof input.request_id === "string" ? input.request_id.trim() : "";
  if (!REQUEST_ID.test(requestId)) throw new Error("request_id must be 1-64 safe identifier characters");

  const traceCandidate = typeof input.trace_id === "string" ? input.trace_id.trim() : fallbackTraceId;
  if (!TRACE_ID.test(traceCandidate)) throw new Error("trace_id must be 1-96 safe identifier characters");

  const pageSize = input.page_size === undefined ? 250 : Number(input.page_size);
  // Reuse the exact control-plane authority contract: /v1/routes/rebuild-index accepts 1..1000.
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 1000) {
    throw new Error("page_size must be an integer from 1 to 1000");
  }

  const afterTenantId = input.after_tenant_id === undefined ? "" : String(input.after_tenant_id).trim();
  if (afterTenantId.length > 128 || /[\r\n]/.test(afterTenantId)) {
    throw new Error("after_tenant_id is not transport-safe");
  }

  return {
    request_id: requestId,
    trace_id: traceCandidate,
    page_size: pageSize,
    after_tenant_id: afterTenantId,
  };
}

export function routeIndexWorkflowInstanceId(requestId: string): string {
  if (!REQUEST_ID.test(requestId)) throw new Error("request_id is invalid");
  const id = `route-index:${requestId}`;
  if (id.length > 100) throw new Error("workflow instance id exceeds provider limit");
  return id;
}

export function parseRouteIndexRebuildPage(value: unknown): RouteIndexRebuildPage {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("control-plane response must be an object");
  const input = value as Record<string, unknown>;
  const rebuilt = Number(input.rebuilt);
  if (!Number.isInteger(rebuilt) || rebuilt < 0 || rebuilt > 1000) {
    throw new Error("control-plane rebuilt count is invalid");
  }
  const next = input.next_after_tenant_id;
  if (next !== null && next !== undefined && typeof next !== "string") {
    throw new Error("control-plane cursor is invalid");
  }
  return { rebuilt, next_after_tenant_id: next ? next.trim() : null };
}

export function assertCursorAdvanced(previous: string, page: RouteIndexRebuildPage): void {
  if (page.next_after_tenant_id && page.next_after_tenant_id === previous) {
    throw new Error("control-plane route-index cursor did not advance");
  }
  if (page.rebuilt === 0 && page.next_after_tenant_id) {
    throw new Error("control-plane returned an empty page with a continuation cursor");
  }
}
