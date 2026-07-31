import {
  D1PurchaseAllocationTimelineService as D1PurchaseAllocationBaseTimelineService,
  type PurchaseAllocationTimeline,
  type PurchaseAllocationTimelineDoctype,
  type PurchaseAllocationTimelineWindow,
} from "./purchase-allocation-timeline.js";
import {
  D1PurchaseSupplierDebtReportService,
  type PurchaseSupplierDebtReport,
} from "./purchase-supplier-debt-report.js";

export interface PurchaseAllocationOperatorWindow extends PurchaseAllocationTimelineWindow {
  queue_key: string;
}

export interface PurchaseAllocationOperatorTimeline extends Omit<PurchaseAllocationTimeline, "windows"> {
  windows: PurchaseAllocationOperatorWindow[];
  /**
   * Report snapshots are restricted to the settlement windows already visible in
   * this document timeline. The API permission check therefore cannot widen into
   * unrelated suppliers or materials.
   */
  supplier_debt_reports: PurchaseSupplierDebtReport[];
}

interface WindowScopeRow {
  window_id: string;
  queue_key: string;
}

/**
 * Operator read model. It keeps the existing append-only timeline projection,
 * adds queue identity for settlement controls, and attaches supplier-debt report
 * snapshots for exactly the windows represented by the current document.
 */
export class D1PurchaseAllocationOperatorTimelineService {
  private readonly base: D1PurchaseAllocationBaseTimelineService;
  private readonly reports: D1PurchaseSupplierDebtReportService;
  private readonly reader: D1Database | D1DatabaseSession;

  constructor(db: D1Database) {
    this.base = new D1PurchaseAllocationBaseTimelineService(db);
    this.reports = new D1PurchaseSupplierDebtReportService(db);
    this.reader = db.withSession?.("first-primary") ?? db;
  }

  async getTimeline(
    tenantId: string,
    doctype: PurchaseAllocationTimelineDoctype,
    name: string,
  ): Promise<PurchaseAllocationOperatorTimeline | null> {
    const timeline = await this.base.getTimeline(tenantId, doctype, name);
    if (!timeline) return null;
    if (timeline.windows.length === 0) {
      return { ...timeline, windows: [], supplier_debt_reports: [] };
    }

    const placeholders = timeline.windows.map((_, index) => `?${index + 2}`).join(",");
    const result = await this.reader.prepare(
      `SELECT window_id,queue_key
       FROM purchase_settlement_windows
       WHERE tenant_id=?1 AND window_id IN (${placeholders})`,
    ).bind(tenantId, ...timeline.windows.map((window) => window.window_id)).all<WindowScopeRow>();

    const scoped = attachPurchaseAllocationQueueKeys(timeline, result.results ?? []);
    const generatedAt = new Date().toISOString();
    const reportResults = await Promise.all(
      [...new Set(scoped.windows.map((window) => window.window_id))].map((windowId) =>
        this.reports.run(tenantId, { window_id: windowId, limit: 1 }, generatedAt),
      ),
    );

    return {
      ...scoped,
      supplier_debt_reports: reportResults.filter(
        (report): report is PurchaseSupplierDebtReport => report !== null,
      ),
    };
  }
}

export function attachPurchaseAllocationQueueKeys(
  timeline: PurchaseAllocationTimeline,
  scopes: WindowScopeRow[],
): PurchaseAllocationOperatorTimeline {
  const queueByWindow = new Map(scopes.map((scope) => [String(scope.window_id), String(scope.queue_key)]));
  return {
    ...timeline,
    windows: timeline.windows.map((window) => {
      const queueKey = queueByWindow.get(window.window_id);
      if (!queueKey) throw new Error(`Purchase allocation queue scope is missing for ${window.window_id}`);
      return { ...window, queue_key: queueKey };
    }),
    supplier_debt_reports: [],
  };
}
