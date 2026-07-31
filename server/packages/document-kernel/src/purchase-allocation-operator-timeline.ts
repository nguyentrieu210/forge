import {
  D1PurchaseAllocationTimelineService as D1PurchaseAllocationBaseTimelineService,
  type PurchaseAllocationTimeline,
  type PurchaseAllocationTimelineDoctype,
  type PurchaseAllocationTimelineWindow,
} from "./purchase-allocation-timeline.js";

export interface PurchaseAllocationOperatorWindow extends PurchaseAllocationTimelineWindow {
  queue_key: string;
}

export interface PurchaseAllocationOperatorTimeline extends Omit<PurchaseAllocationTimeline, "windows"> {
  windows: PurchaseAllocationOperatorWindow[];
}

interface WindowScopeRow {
  window_id: string;
  queue_key: string;
}

/**
 * Operator read model. It keeps the existing append-only timeline projection and
 * adds the queue identity required to submit settlement control documents through
 * DocumentKernel. No permission or lifecycle decision is made here.
 */
export class D1PurchaseAllocationOperatorTimelineService {
  private readonly base: D1PurchaseAllocationBaseTimelineService;
  private readonly reader: D1Database | D1DatabaseSession;

  constructor(db: D1Database) {
    this.base = new D1PurchaseAllocationBaseTimelineService(db);
    this.reader = db.withSession?.("first-primary") ?? db;
  }

  async getTimeline(
    tenantId: string,
    doctype: PurchaseAllocationTimelineDoctype,
    name: string,
  ): Promise<PurchaseAllocationOperatorTimeline | null> {
    const timeline = await this.base.getTimeline(tenantId, doctype, name);
    if (!timeline || timeline.windows.length === 0) return timeline as PurchaseAllocationOperatorTimeline | null;

    const placeholders = timeline.windows.map((_, index) => `?${index + 2}`).join(",");
    const result = await this.reader.prepare(
      `SELECT window_id,queue_key
       FROM purchase_settlement_windows
       WHERE tenant_id=?1 AND window_id IN (${placeholders})`,
    ).bind(tenantId, ...timeline.windows.map((window) => window.window_id)).all<WindowScopeRow>();

    return attachPurchaseAllocationQueueKeys(timeline, result.results ?? []);
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
  };
}
