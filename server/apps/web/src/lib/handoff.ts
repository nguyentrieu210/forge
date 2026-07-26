// Cross-screen handoff seeds. A seed is produced by a "Create X from this…"
// button (or by opening a doc from the recent-docs list) and consumed once by
// the target screen. `token` makes each seed unique so a screen applies it
// exactly once even if the same mapping is triggered twice.

export type View = "sales-order" | "delivery-note" | "sales-invoice" | "payment-entry" | "documents" | "reports" | "desk";

export interface DeliveryPrefill {
  company: string;
  customer: string;
  currency: string;
  against_sales_order: string;
  items: { item_code: string; qty: string; rate: string; warehouse: string }[];
}

export interface InvoicePrefill {
  company: string;
  customer: string;
  currency: string;
  against_sales_order: string;
  items: { item_code: string; qty: string; rate: string }[];
}

export interface PaymentPrefill {
  company: string;
  currency: string;
  party: string;
  paid_from: string;
  amount: string;
  references: { reference_name: string; allocated_amount: string }[];
}

export type Seed =
  | { kind: "open"; token: number; doctype: string; name: string }
  | { kind: "new-delivery"; token: number; prefill: DeliveryPrefill }
  | { kind: "new-invoice"; token: number; prefill: InvoicePrefill }
  | { kind: "new-payment"; token: number; prefill: PaymentPrefill };

let counter = 0;
/** Monotonic token unique per handoff within a session. */
export function seedToken(): number {
  counter += 1;
  return Date.now() * 1000 + (counter % 1000);
}

const DOCTYPE_VIEW: Record<string, View> = {
  "Sales Order": "sales-order",
  "Delivery Note": "delivery-note",
  "Sales Invoice": "sales-invoice",
  "Payment Entry": "payment-entry",
};

export function viewForSeed(seed: Seed): View {
  switch (seed.kind) {
    case "open":
      return DOCTYPE_VIEW[seed.doctype] ?? "documents";
    case "new-delivery":
      return "delivery-note";
    case "new-invoice":
      return "sales-invoice";
    case "new-payment":
      return "payment-entry";
  }
}
