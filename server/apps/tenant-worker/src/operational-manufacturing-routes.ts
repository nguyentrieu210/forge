import type { Actor, JsonObject } from "../../../packages/contracts/src/index.js";
import type { StockEntryData } from "../../../packages/clouderp-core/src/index.js";
import type { SalesOrderData } from "../../../packages/clouderp-selling/src/types.js";
import { errors } from "../../../packages/core/src/index.js";
import { D1MutationStore } from "../../../packages/document-kernel/src/index.js";
import { createProjectedMrpAvailabilityResolver } from "../../../packages/clouderp-erpnext/src/index.js";
import type {
  CalibrationRecordData, CapaData, ManufacturingDowntimeData, ManufacturingRoutingData,
  NonConformanceReportData, ProductionPlanData, QualityPlanData, RootCauseAnalysisData,
  VersionedBomData, WorkOrderData, WorkstationCapacityCalendarData,
} from "../../../packages/clouderp-erpnext/src/index.js";
import { D1DocumentAccessStore, D1MetadataStore, MetadataPermissionService } from "../../../packages/frappe-model/src/index.js";
import { isManufacturingBomBulkApiPath, isManufacturingBomBulkFrappePath, routeManufacturingBomBulkApi } from "./manufacturing-bom-bulk-api.js";
import { isManufacturingCapacityApiPath, isManufacturingCapacityFrappePath, routeManufacturingCapacityApi } from "./manufacturing-capacity-api.js";
import { isManufacturingCostingApiPath, isManufacturingCostingFrappePath, routeManufacturingCostingApi } from "./manufacturing-costing-api.js";
import { isManufacturingGenealogyApiPath, isManufacturingGenealogyFrappePath, routeManufacturingGenealogyApi } from "./manufacturing-genealogy-api.js";
import { isManufacturingMrpApiPath, isManufacturingMrpFrappePath, routeManufacturingMrpApi } from "./manufacturing-mrp-api.js";
import { isManufacturingPlanningApiPath, isManufacturingPlanningFrappePath, routeManufacturingPlanningApi } from "./manufacturing-planning-api.js";
import { isQmsApiPath, isQmsFrappePath, routeQmsApi } from "./qms-api.js";
import type { TenantEnv } from "./env.js";

// NOTE (vá P0 21/08/2026 — xem docs/audits/ALUMDOOR-SAN-XUAT-SAU-VONG2-20260821.md §1 S1): "planning"
// từng bị bỏ sót khỏi union này lẫn khỏi matchManufacturingOperationalRoute/
// isManufacturingOperationalFrappePath, khiến get_open_sales_production_demand luôn 404 dù handler
// (routeManufacturingPlanningApi) đã viết xong đầy đủ.
export type ManufacturingOperationalRoute = "bom-bulk" | "mrp" | "capacity" | "costing" | "genealogy" | "qms" | "planning";

export function matchManufacturingOperationalRoute(pathname: string): ManufacturingOperationalRoute | null {
  if (isManufacturingBomBulkApiPath(pathname)) return "bom-bulk";
  if (isManufacturingMrpApiPath(pathname)) return "mrp";
  if (isManufacturingCapacityApiPath(pathname)) return "capacity";
  if (isManufacturingCostingApiPath(pathname)) return "costing";
  if (isManufacturingGenealogyApiPath(pathname)) return "genealogy";
  if (isManufacturingPlanningApiPath(pathname)) return "planning";
  if (isQmsApiPath(pathname)) return "qms";
  return null;
}

export function isManufacturingOperationalFrappePath(pathname: string): boolean {
  return isManufacturingBomBulkFrappePath(pathname)
    || isManufacturingMrpFrappePath(pathname)
    || isManufacturingCapacityFrappePath(pathname)
    || isManufacturingCostingFrappePath(pathname)
    || isManufacturingGenealogyFrappePath(pathname)
    || isManufacturingPlanningFrappePath(pathname)
    || isQmsFrappePath(pathname);
}

interface ManufacturingOperationalRequest {
  request: Request;
  url: URL;
  env: TenantEnv;
  tenantId: string;
  actor: Actor;
  traceId: string;
  route: ManufacturingOperationalRoute;
  createDocument(doctype: string, document: JsonObject): Promise<Response>;
}

export async function routeManufacturingOperationalRequest(input: ManufacturingOperationalRequest): Promise<Response | null> {
  const { request, url, env, tenantId, actor, traceId, route } = input;
  const requestDb = (env.DB.withSession?.("first-primary") ?? env.DB) as D1Database;
  const metadata = new D1MetadataStore(requestDb);
  const access = new D1DocumentAccessStore(requestDb);
  const permissions = new MetadataPermissionService(metadata, undefined, access);
  const documents = new D1MutationStore(env.DB);

  if (route === "bom-bulk") {
    return routeManufacturingBomBulkApi(request, url, {
      tenantId, actor, permissions, traceId,
      findCanonicalRevisions: async (document) => {
        const company = text(document.company);
        const item = text(document.item);
        const revision = integer(document.revision);
        const all = await documents.listDocumentsByDoctype<JsonObject>(tenantId, "Bill of Materials");
        const matches = all.filter((candidate) => candidate.data.company === company
          && candidate.data.item === item && integer(candidate.data.revision) === revision);
        const readable = [];
        for (const candidate of matches) {
          if (await permissions.canReadDocument(actor, tenantId, candidate)) readable.push(candidate);
        }
        if (readable.length !== matches.length) throw errors.permission("A matching BOM revision is outside the current read scope");
        return readable.map((candidate) => ({ name: candidate.name, docstatus: candidate.docstatus, status: candidate.status, ...candidate.data }));
      },
      createCanonicalDraft: (document) => input.createDocument("Bill of Materials", document),
    });
  }
  if (route === "mrp") {
    const projectedResolvers = new Map<string, ReturnType<typeof createProjectedMrpAvailabilityResolver>>();
    const now = new Date().toISOString();
    return routeManufacturingMrpApi(request, url, {
      tenantId, actor, permissions, traceId,
      loadProductionPlan: (name) => documents.getDocument<ProductionPlanData>(tenantId, "Production Plan", name),
      listBomDocuments: () => documents.listDocumentsByDoctype<VersionedBomData>(tenantId, "Bill of Materials"),
      listMaterialRequests: () => documents.listDocumentsByDoctype<JsonObject>(tenantId, "Material Request"),
      getStockBalanceMicros: (itemCode, warehouse) =>
        documents.getStockBalanceMicros(tenantId, itemCode, warehouse),
      getProjectedAvailability: (company, itemCode, warehouse, throughDate) => {
        let resolve = projectedResolvers.get(company);
        if (!resolve) {
          resolve = createProjectedMrpAvailabilityResolver({ tenantId, company, now, reader: documents });
          projectedResolvers.set(company, resolve);
        }
        return resolve(itemCode, warehouse, throughDate);
      },
      createCanonicalMaterialRequest: (document) => input.createDocument("Material Request", document),
    });
  }
  if (route === "capacity") {
    return routeManufacturingCapacityApi(request, url, {
      tenantId, actor, permissions, traceId,
      loadProductionPlan: (name) => documents.getDocument<ProductionPlanData>(tenantId, "Production Plan", name),
      listBomDocuments: () => documents.listDocumentsByDoctype<VersionedBomData>(tenantId, "Bill of Materials"),
      listRoutings: () => documents.listDocumentsByDoctype<ManufacturingRoutingData>(tenantId, "Manufacturing Routing"),
      listCalendars: () => documents.listDocumentsByDoctype<WorkstationCapacityCalendarData>(tenantId, "Workstation Capacity Calendar"),
      listDowntimes: () => documents.listDocumentsByDoctype<ManufacturingDowntimeData>(tenantId, "Manufacturing Downtime"),
    });
  }
  if (route === "costing") {
    return routeManufacturingCostingApi(request, url, {
      tenantId, actor, permissions, traceId,
      loadWorkOrder: (name) => documents.getDocument<WorkOrderData>(tenantId, "Work Order", name),
      loadBom: (name) => documents.getDocument<VersionedBomData>(tenantId, "Bill of Materials", name),
      listStockEntries: () => documents.listDocumentsByDoctype<StockEntryData>(tenantId, "Stock Entry"),
      getVoucherStockEntries: (name, version) => documents.getVoucherStockEntries(tenantId, "Stock Entry", name, version),
    });
  }
  if (route === "genealogy") {
    return routeManufacturingGenealogyApi(request, url, {
      tenantId, actor, permissions, traceId,
      loadWorkOrder: (name) => documents.getDocument<WorkOrderData>(tenantId, "Work Order", name),
      listStockEntries: () => documents.listDocumentsByDoctype<StockEntryData>(tenantId, "Stock Entry"),
      getVoucherStockEntries: (name, version) => documents.getVoucherStockEntries(tenantId, "Stock Entry", name, version),
    });
  }
  if (route === "planning") {
    return routeManufacturingPlanningApi(request, url, {
      tenantId, actor, permissions, traceId,
      listSalesOrders: () => documents.listDocumentsByDoctype<SalesOrderData>(tenantId, "Sales Order"),
      listProductionPlans: () => documents.listDocumentsByDoctype<ProductionPlanData>(tenantId, "Production Plan"),
      listBoms: () => documents.listDocumentsByDoctype<VersionedBomData>(tenantId, "Bill of Materials"),
    });
  }
  return routeQmsApi(request, url, {
    tenantId, actor, permissions, traceId, now: () => new Date().toISOString(),
    loadQualityPlan: (name) => documents.getDocument<QualityPlanData>(tenantId, "Quality Plan", name),
    listNcr: () => documents.listDocumentsByDoctype<NonConformanceReportData>(tenantId, "Non Conformance Report"),
    listRca: () => documents.listDocumentsByDoctype<RootCauseAnalysisData>(tenantId, "Root Cause Analysis"),
    listCapa: () => documents.listDocumentsByDoctype<CapaData>(tenantId, "CAPA"),
    listCalibration: () => documents.listDocumentsByDoctype<CalibrationRecordData>(tenantId, "Calibration Record"),
  });
}

function text(value: unknown): string {
  return typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
}

function integer(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isSafeInteger(parsed) ? parsed : 0;
}
