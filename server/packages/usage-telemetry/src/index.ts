export const USAGE_TELEMETRY_SCHEMA_VERSION = "forge-usage-v1" as const;

export const USAGE_BLOB_SLOTS = [
  "schema_version",
  "event_family",
  "service",
  "plan",
  "route_family",
  "operation_class",
  "status_class",
  "app_id",
  "capability_family",
  "region",
  "provider",
  "model_class",
  "purpose",
  "outcome",
  "queue",
  "workflow",
  "storage_class",
  "source",
  "reserved_19",
  "reserved_20",
] as const;

export const USAGE_DOUBLE_SLOTS = [
  "latency_ms",
  "request_bytes",
  "response_bytes",
  "d1_rows_read",
  "d1_rows_written",
  "queue_messages",
  "workflow_steps",
  "ai_input_tokens",
  "ai_output_tokens",
  "ai_cost_microusd",
  "storage_bytes",
  "retry_count",
  "status_code",
  "cpu_ms_estimate",
  "reserved_15",
  "reserved_16",
  "reserved_17",
  "reserved_18",
  "reserved_19",
  "reserved_20",
] as const;

export type UsageEventFamily = "request" | "data" | "async" | "workflow" | "storage" | "ai" | "security";
export type UsagePlan = "free" | "pro" | "enterprise" | "unassigned";
export type UsageOperationClass = "read" | "write" | "command" | "other";

export interface AnalyticsDataPoint {
  indexes: string[];
  blobs: string[];
  doubles: number[];
}

export interface AnalyticsEngineWriter {
  writeDataPoint(point: AnalyticsDataPoint): void;
}

export interface UsageTelemetryEvent {
  tenantId: string;
  eventFamily: UsageEventFamily;
  service: string;
  plan?: UsagePlan;
  routeFamily?: string;
  operationClass?: UsageOperationClass;
  statusClass?: string;
  appId?: string;
  capabilityFamily?: string;
  region?: string;
  provider?: string;
  modelClass?: string;
  purpose?: string;
  outcome?: string;
  queue?: string;
  workflow?: string;
  storageClass?: string;
  source?: string;
  latencyMs?: number;
  requestBytes?: number;
  responseBytes?: number;
  d1RowsRead?: number;
  d1RowsWritten?: number;
  queueMessages?: number;
  workflowSteps?: number;
  aiInputTokens?: number;
  aiOutputTokens?: number;
  aiCostMicrousd?: number;
  storageBytes?: number;
  retryCount?: number;
  statusCode?: number;
  cpuMsEstimate?: number;
}

const encoder = new TextEncoder();
const MAX_INDEX_BYTES = 96;
const MAX_BLOB_BYTES = 512;
const MAX_TOTAL_BLOB_BYTES = 8 * 1024;

function byteLength(value: string): number {
  return encoder.encode(value).byteLength;
}

function dimension(value: string | undefined, field: string): string {
  if (!value) return "";
  const normalized = value.trim();
  if (!normalized) return "";
  if (byteLength(normalized) > MAX_BLOB_BYTES) {
    throw new Error(`Usage telemetry ${field} exceeds ${MAX_BLOB_BYTES} bytes`);
  }
  return normalized;
}

function measure(value: number | undefined): number {
  if (value === undefined) return 0;
  if (!Number.isFinite(value)) throw new Error("Usage telemetry measure must be finite");
  return Math.max(0, value);
}

export function operationClassForMethod(method: string): UsageOperationClass {
  const upper = method.toUpperCase();
  if (upper === "GET" || upper === "HEAD" || upper === "OPTIONS") return "read";
  if (upper === "POST") return "command";
  if (upper === "PUT" || upper === "PATCH" || upper === "DELETE") return "write";
  return "other";
}

export function statusClassFor(status: number): string {
  if (!Number.isFinite(status) || status < 100 || status > 999) return "unknown";
  return `${Math.floor(status / 100)}xx`;
}

/**
 * Deliberately coarse. Raw paths frequently contain document names, file names or other
 * customer identifiers and therefore must never be used as Analytics Engine dimensions.
 */
export function routeFamilyFor(pathname: string): string {
  if (pathname === "/api/method/login") return "auth.login";
  if (pathname === "/api/v1/public/signup") return "public.signup";
  if (pathname.startsWith("/_app/")) return "app.callback";
  if (pathname.startsWith("/api/resource/")) return "api.resource";
  if (pathname.startsWith("/api/method/")) return "api.method";
  if (pathname.startsWith("/api/")) return "api.other";
  if (pathname.startsWith("/files/")) return "files";
  if (pathname === "/shop" || pathname.startsWith("/shop/")) return "client.shop";
  return "client.shell";
}

export function buildUsageDataPoint(event: UsageTelemetryEvent): AnalyticsDataPoint {
  const tenantId = event.tenantId.trim();
  if (!tenantId) throw new Error("Usage telemetry tenantId is required");
  if (byteLength(tenantId) > MAX_INDEX_BYTES) {
    throw new Error(`Usage telemetry tenantId exceeds Analytics Engine ${MAX_INDEX_BYTES}-byte index limit`);
  }

  const blobs = [
    USAGE_TELEMETRY_SCHEMA_VERSION,
    event.eventFamily,
    dimension(event.service, "service"),
    event.plan ?? "unassigned",
    dimension(event.routeFamily, "routeFamily"),
    dimension(event.operationClass, "operationClass"),
    dimension(event.statusClass, "statusClass"),
    dimension(event.appId, "appId"),
    dimension(event.capabilityFamily, "capabilityFamily"),
    dimension(event.region, "region"),
    dimension(event.provider, "provider"),
    dimension(event.modelClass, "modelClass"),
    dimension(event.purpose, "purpose"),
    dimension(event.outcome, "outcome"),
    dimension(event.queue, "queue"),
    dimension(event.workflow, "workflow"),
    dimension(event.storageClass, "storageClass"),
    dimension(event.source, "source"),
    "",
    "",
  ];

  const totalBlobBytes = blobs.reduce((total, value) => total + byteLength(value), 0);
  if (totalBlobBytes > MAX_TOTAL_BLOB_BYTES) {
    throw new Error(`Usage telemetry blob payload exceeds Forge ${MAX_TOTAL_BLOB_BYTES}-byte safety budget`);
  }

  const doubles = [
    measure(event.latencyMs),
    measure(event.requestBytes),
    measure(event.responseBytes),
    measure(event.d1RowsRead),
    measure(event.d1RowsWritten),
    measure(event.queueMessages),
    measure(event.workflowSteps),
    measure(event.aiInputTokens),
    measure(event.aiOutputTokens),
    measure(event.aiCostMicrousd),
    measure(event.storageBytes),
    measure(event.retryCount),
    measure(event.statusCode),
    measure(event.cpuMsEstimate),
    0,
    0,
    0,
    0,
    0,
    0,
  ];

  return { indexes: [tenantId], blobs, doubles };
}

/**
 * Telemetry is never on the request correctness path. Missing bindings, local-dev
 * limitations and provider write failures must not change the customer response.
 */
export function recordUsageEvent(writer: AnalyticsEngineWriter | undefined, event: UsageTelemetryEvent): boolean {
  if (!writer) return false;
  try {
    writer.writeDataPoint(buildUsageDataPoint(event));
    return true;
  } catch {
    return false;
  }
}
