import { useLayoutEffect } from "react";
import { useMetaForge } from "@metaforge/views/provider";
import { installAlumdoorSalesAutofillBridge } from "./AlumdoorSalesAutofillBridge.js";
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

  // Install legacy compatibility bridges before SalesSheetV2 passive effects run. Cleanup is
  // deliberately LIFO because both bridges wrap adapter methods.
  useLayoutEffect(() => {
    const restoreCompany = installAlumdoorSalesCompanyContextBridge(adapter, company, currency);
    const restoreAutofill = installAlumdoorSalesAutofillBridge(adapter);
    return () => {
      restoreAutofill();
      restoreCompany();
    };
  }, [adapter, company, currency]);

  return <div className="alumdoor-sales-sheet-compact h-full min-w-0 w-full"><AlumdoorSalesSheetV2 /></div>;
}
