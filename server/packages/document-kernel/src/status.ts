/**
 * Server-authoritative Order-to-Cash status labels.
 *
 * The status label is DERIVED from actual fulfilment / billing / payment state —
 * never from client input — and is re-applied on every read (see the stores'
 * hydrateDerived) so it reflects reality instead of freezing at submit time.
 * The transitions mirror the ERPNext behaviour captured by the Gate 2E oracle
 * (docs/spec/source-exact/oracle/runtime/o2c-matrix-capture.json).
 */
export interface O2CStatusMetrics {
  /** Sales Order: percent of ordered qty delivered (0..100+). */
  deliveredPercentage?: number;
  /** Sales Order: percent of ordered qty billed (0..100+). */
  billedPercentage?: number;
  /** Purchase Order: percent received (0..100+). */
  receivedPercentage?: number;
  /** Sales/Purchase Invoice: outstanding amount, in minor units. */
  outstandingMinor?: number;
  /** Sales Invoice: invoice grand total, in minor units. */
  grandTotalMinor?: number;
}

/**
 * Derive the workflow status label for an O2C document from its docstatus and
 * server-computed metrics. Pure and side-effect free.
 *
 * docstatus: 0 = draft, 1 = submitted, 2 = cancelled.
 */
export function deriveO2CStatus(doctype: string, docstatus: number, metrics: O2CStatusMetrics = {}): string {
  if (docstatus === 2) return "Cancelled";
  if (docstatus !== 1) return "Draft";

  switch (doctype) {
    case "Sales Order": {
      const delivered = metrics.deliveredPercentage ?? 0;
      const billed = metrics.billedPercentage ?? 0;
      if (delivered >= 100 && billed >= 100) return "Completed";
      if (delivered >= 100) return "To Bill";
      if (billed >= 100) return "To Deliver";
      return "To Deliver and Bill";
    }
    case "Delivery Note":
      return "To Bill";
    case "Purchase Order": {
      const received = metrics.receivedPercentage ?? 0;
      const billed = metrics.billedPercentage ?? 0;
      if (received >= 100 && billed >= 100) return "Completed";
      if (received >= 100) return "To Bill";
      if (billed >= 100) return "To Receive";
      return "To Receive and Bill";
    }
    case "Sales Invoice":
    case "Purchase Invoice": {
      const outstanding = metrics.outstandingMinor ?? 0;
      const grand = metrics.grandTotalMinor ?? 0;
      if (outstanding <= 0) return "Paid";
      if (outstanding < grand) return "Partly Paid";
      return "Unpaid";
    }
    default:
      // Payment Entry (and any doctype without a fulfilment-derived status).
      return "Submitted";
  }
}
