import { useLayoutEffect } from "react";
import { useMetaForge } from "@metaforge/views/provider";
import { installAlumdoorSalesCompanyContextBridge } from "./AlumdoorSalesCompanyContextBridge.js";
import { AlumdoorSalesSheetV2 } from "./AlumdoorSalesSheetV2.js";
import "./AlumdoorSalesSheetCompact.css";

/**
 * One operational sales surface for Alumdoor.
 *
 * Door, ray, shaft and normal goods share the same spreadsheet-style composer. Domain-specific
 * pricing/cutting rules stay behind the Alumdoor worker; this workspace only owns presentation.
 */
export function AlumdoorSalesModeWorkspace() {
  const { adapter, businessContext } = useMetaForge();
  const company = String(businessContext.company ?? "").trim();
  const currency = String(businessContext.currency ?? "").trim();

  // Layout effect intentionally runs before SalesSheetV2 passive mount effects. That lets the
  // legacy Company re-read consume the already server-resolved context currency when generic CRUD
  // returns not-found, avoiding a false global error on an otherwise empty/new sales sheet.
  useLayoutEffect(
    () => installAlumdoorSalesCompanyContextBridge(adapter, company, currency),
    [adapter, company, currency],
  );

  return <div className="alumdoor-sales-sheet-compact h-full min-w-0 w-full"><AlumdoorSalesSheetV2 /></div>;
}
