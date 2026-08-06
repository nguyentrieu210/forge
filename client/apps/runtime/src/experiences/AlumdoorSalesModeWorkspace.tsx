import { AlumdoorSalesSheet } from "./AlumdoorSalesSheet.js";

/**
 * One operational sales surface for Alumdoor.
 *
 * Door, ray, shaft and normal goods share the same spreadsheet-style composer. Domain-specific
 * pricing/cutting rules stay behind the Alumdoor worker; this workspace only owns presentation.
 */
export function AlumdoorSalesModeWorkspace() {
  return <AlumdoorSalesSheet />;
}
