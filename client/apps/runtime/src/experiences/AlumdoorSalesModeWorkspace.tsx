import { AlumdoorSalesSheetV3 } from "./AlumdoorSalesSheetV3.js";

/**
 * One operational sales surface for Alumdoor.
 *
 * Door, ray, shaft and normal goods share the same spreadsheet-style composer. Pricing,
 * measurement and cutting stay server-authoritative; the sheet only collects business inputs
 * and renders the resolved result.
 */
export function AlumdoorSalesModeWorkspace() {
  return <AlumdoorSalesSheetV3 />;
}
