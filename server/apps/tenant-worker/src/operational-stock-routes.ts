import type { Actor, MutationCommand, MutationReceipt } from "../../../packages/contracts/src/index.js";
import { D1DocumentAccessStore, D1MetadataStore, MetadataPermissionService } from "../../../packages/frappe-model/src/index.js";
import {
  isDailyLedgerApiPath,
  isDailyLedgerFrappePath,
  routeDailyLedgerApi,
} from "./daily-ledger-api.js";
import { isMigrationApiPath, routeMigrationApi } from "./migration-api.js";
import {
  isPhysicalStockApiPath,
  isPhysicalStockFrappePath,
  routePhysicalStockApi,
} from "./physical-stock-api.js";
import type { TenantEnv } from "./env.js";

export type StockOperationalRoute = "physical-stock" | "daily-ledger" | "migration";

export function matchStockOperationalRoute(pathname: string): StockOperationalRoute | null {
  if (isPhysicalStockApiPath(pathname)) return "physical-stock";
  if (isDailyLedgerApiPath(pathname)) return "daily-ledger";
  if (isMigrationApiPath(pathname)) return "migration";
  return null;
}

export function isStockOperationalFrappePath(pathname: string): boolean {
  return isPhysicalStockFrappePath(pathname) || isDailyLedgerFrappePath(pathname);
}

interface StockOperationalRequest {
  request: Request;
  url: URL;
  env: TenantEnv;
  tenantId: string;
  actor: Actor;
  traceId: string;
  route: StockOperationalRoute;
  runCommand(command: MutationCommand): Promise<MutationReceipt>;
}

export async function routeStockOperationalRequest(input: StockOperationalRequest): Promise<Response | null> {
  const { request, url, env, tenantId, actor, traceId, route } = input;
  const requestDb = (env.DB.withSession?.("first-primary") ?? env.DB) as D1Database;
  if (route === "migration") {
    return routeMigrationApi(request, url, {
      db: requestDb,
      tenantId,
      actor,
      traceId,
      runCommand: input.runCommand,
    });
  }
  if (route === "physical-stock") {
    const metadata = new D1MetadataStore(requestDb);
    const access = new D1DocumentAccessStore(requestDb);
    const permissions = new MetadataPermissionService(metadata, undefined, access);
    return routePhysicalStockApi(request, url, {
      db: requestDb,
      tenantId,
      actor,
      permissions,
      traceId,
    });
  }
  return routeDailyLedgerApi(request, url, { db: requestDb, tenantId, actor, traceId });
}
