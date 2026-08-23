import { previewChildRow as previewLegacyChildRow } from "./ui-child-preview-legacy.js";
import { previewPurchaseChildRow } from "./purchase-child-preview.js";
import type { SalesPlatformCall } from "./sales-item-context.js";
import type { ProductionPlatformCall } from "./sales-production.js";

type Json = Record<string, unknown>;
type PlatformCall = SalesPlatformCall & ProductionPlatformCall;

const PURCHASE_DOCTYPES = new Set([
  "Supplier Quotation Item",
  "Purchase Order Item",
  "Purchase Receipt Item",
  "Purchase Invoice Item",
]);

function text(value: unknown): string {
  return String(value ?? "").normalize("NFC").trim();
}

/**
 * Server-owned child-row preview router.
 *
 * Purchase rows use the catalog-driven Item → Measurement Profile → Material Specification
 * contract. Every non-purchase row keeps the previously shipped implementation byte-for-byte
 * in `ui-child-preview-legacy.ts`, so this refactor cannot silently rewrite Sales behavior.
 */
export async function previewChildRow(call: PlatformCall, args: Json): Promise<Response> {
  const childDoctype = text(args.child_doctype);
  if (PURCHASE_DOCTYPES.has(childDoctype)) return previewPurchaseChildRow(call, args);
  return previewLegacyChildRow(call, args);
}
