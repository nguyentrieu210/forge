import type { Actor, JsonObject } from "../../../packages/contracts/src/index.js";
import { errors, jsonResponse, readJson } from "../../../packages/core/src/index.js";
import {
  D1GuardedDailyDetailedLedgerService,
  type DailyLedgerAdjustmentInput,
  type DailyLedgerContext,
  type DailyLedgerReconciliation,
  type DailyLedgerReportRow,
  type DailyLedgerSnapshotResult,
} from "../../../packages/document-kernel/src/index.js";
import { PermissionService } from "../../../packages/policy/src/index.js";

const MAX_BODY_BYTES = 32_000;
const reportPermissions = new PermissionService();

const ROUTES = {
  generate: ["/api/v1/daily-ledger/generate", "/api/method/metaforge.accounts.daily_ledger_generate"],
  report: ["/api/v1/reports/daily-detailed-ledger", "/api/method/metaforge.accounts.daily_detailed_ledger"],
  reconcile: ["/api/v1/daily-ledger/reconcile", "/api/method/metaforge.accounts.daily_ledger_reconcile"],
  freeze: ["/api/v1/daily-ledger/freeze", "/api/method/metaforge.accounts.daily_ledger_freeze"],
  adjust: ["/api/v1/daily-ledger/adjust", "/api/method/metaforge.accounts.daily_ledger_adjust"],
} as const;

type DailyLedgerRoute = keyof typeof ROUTES;

export interface DailyLedgerApiService {
  generate(tenantId: string, actor: Actor, input: DailyLedgerContext): Promise<DailyLedgerSnapshotResult>;
  read(tenantId: string, snapshotId: string): Promise<DailyLedgerReportRow[]>;
  reconcile(tenantId: string, input: DailyLedgerContext): Promise<DailyLedgerReconciliation>;
  freeze(tenantId: string, actor: Actor, snapshotId: string, reason?: string): Promise<{ snapshot_id: string; context_key: string; existing: boolean }>;
  adjust(tenantId: string, actor: Actor, input: DailyLedgerAdjustmentInput): Promise<{ adjustment_id: string; existing: boolean }>;
}

export interface DailyLedgerApiContext {
  db: D1Database;
  tenantId: string;
  actor: Actor;
  traceId: string;
}

export interface DailyLedgerApiDependencies {
  service?: DailyLedgerApiService;
}

export function isDailyLedgerApiPath(pathname: string): boolean {
  return classifyRoute(pathname) !== null;
}

export function isDailyLedgerFrappePath(pathname: string): boolean {
  return pathname.startsWith("/api/method/metaforge.accounts.daily_ledger_")
    || pathname === "/api/method/metaforge.accounts.daily_detailed_ledger";
}

export async function routeDailyLedgerApi(
  request: Request,
  url: URL,
  context: DailyLedgerApiContext,
  dependencies: DailyLedgerApiDependencies = {},
): Promise<Response | null> {
  const route = classifyRoute(url.pathname);
  if (!route) return null;
  if (request.method.toUpperCase() !== "POST") {
    return jsonResponse(
      { error: { code: "METHOD_NOT_ALLOWED", message: "Daily ledger operations require POST" } },
      405,
      { allow: "POST", "cache-control": "private, no-store", "x-cloudforge-trace-id": context.traceId },
    );
  }

  const raw = await readJson<JsonObject>(request, MAX_BODY_BYTES);
  rejectTenantSelector(raw);
  const body = isDailyLedgerFrappePath(url.pathname) ? unwrapFrappeArgs(raw) : raw;
  rejectTenantSelector(body);
  const service = dependencies.service ?? new D1GuardedDailyDetailedLedgerService(context.db);

  let result: unknown;
  if (route === "generate") {
    result = await service.generate(context.tenantId, context.actor, parseContext(body));
  } else if (route === "report") {
    reportPermissions.assertReport(context.actor, "Daily Detailed Ledger");
    result = await service.read(context.tenantId, requireText(body.snapshot_id, "snapshot_id", 240));
  } else if (route === "reconcile") {
    reportPermissions.assertReport(context.actor, "Daily Detailed Ledger");
    result = await service.reconcile(context.tenantId, parseContext(body));
  } else if (route === "freeze") {
    const snapshotId = requireText(body.snapshot_id, "snapshot_id", 240);
    const reason = optionalText(body.reason, "reason", 1000);
    result = await service.freeze(context.tenantId, context.actor, snapshotId, reason);
  } else {
    result = await service.adjust(context.tenantId, context.actor, parseAdjustment(body));
  }

  return jsonResponse(
    isDailyLedgerFrappePath(url.pathname) ? { message: result as never } : result as never,
    200,
    {
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
      "x-cloudforge-trace-id": context.traceId,
    },
  );
}

function classifyRoute(pathname: string): DailyLedgerRoute | null {
  for (const [route, paths] of Object.entries(ROUTES) as [DailyLedgerRoute, readonly string[]][]) {
    if (paths.includes(pathname)) return route;
  }
  return null;
}

function parseContext(body: JsonObject): DailyLedgerContext {
  const allowed = new Set(["ledger_date", "company", "warehouse", "customer", "sales_order"]);
  rejectUnknown(body, allowed);
  return {
    ledger_date: requireText(body.ledger_date, "ledger_date", 10),
    company: requireText(body.company, "company", 240),
    ...(body.warehouse === undefined ? {} : { warehouse: optionalText(body.warehouse, "warehouse", 240) }),
    ...(body.customer === undefined ? {} : { customer: optionalText(body.customer, "customer", 240) }),
    ...(body.sales_order === undefined ? {} : { sales_order: optionalText(body.sales_order, "sales_order", 240) }),
  };
}

function parseAdjustment(body: JsonObject): DailyLedgerAdjustmentInput {
  const allowed = new Set([
    "adjustment_id",
    "snapshot_id",
    "line_key",
    "reason",
    "delta_quantity_micros",
    "delta_amount_minor",
    "details",
  ]);
  rejectUnknown(body, allowed);
  const details = body.details;
  if (details !== undefined && !isObject(details)) throw errors.validation("details must be an object");
  return {
    adjustment_id: requireText(body.adjustment_id, "adjustment_id", 240),
    snapshot_id: requireText(body.snapshot_id, "snapshot_id", 240),
    line_key: requireText(body.line_key, "line_key", 500),
    reason: requireText(body.reason, "reason", 1000),
    ...(body.delta_quantity_micros === undefined ? {} : {
      delta_quantity_micros: requireSafeInteger(body.delta_quantity_micros, "delta_quantity_micros"),
    }),
    ...(body.delta_amount_minor === undefined ? {} : {
      delta_amount_minor: requireSafeInteger(body.delta_amount_minor, "delta_amount_minor"),
    }),
    ...(details === undefined ? {} : { details }),
  };
}

function unwrapFrappeArgs(body: JsonObject): JsonObject {
  const args = body.args;
  if (args === undefined) return body;
  if (typeof args === "string") {
    try {
      const parsed = JSON.parse(args) as unknown;
      if (isObject(parsed)) return parsed;
    } catch {
      // One stable validation error is returned below.
    }
    throw errors.validation("Daily ledger Frappe args must contain a JSON object");
  }
  if (!isObject(args)) throw errors.validation("Daily ledger Frappe args must be an object");
  rejectTenantSelector(args);
  return args;
}

function rejectUnknown(body: JsonObject, allowed: Set<string>): void {
  for (const key of Object.keys(body)) {
    if (!allowed.has(key)) throw errors.validation(`Unknown daily ledger field: ${key}`);
  }
}

function rejectTenantSelector(body: JsonObject): void {
  if (Object.hasOwn(body, "tenant_id") || Object.hasOwn(body, "tenantId")) {
    throw errors.validation("Daily ledger tenant scope is controlled by the authenticated server context");
  }
}

function requireText(value: unknown, field: string, max: number): string {
  if (typeof value !== "string") throw errors.validation(`${field} must be a string`);
  const normalized = value.trim();
  if (!normalized || normalized.length > max) throw errors.validation(`${field} must be non-empty and at most ${max} characters`);
  return normalized;
}

function optionalText(value: unknown, field: string, max: number): string {
  if (value === undefined || value === null || value === "") return "";
  return requireText(value, field, max);
}

function requireSafeInteger(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value)) throw errors.validation(`${field} must be a safe integer`);
  return Number(value);
}

function isObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
