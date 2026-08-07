import { Navigate } from "react-router-dom";

const SALES_ORDER_NEW_ROUTE = `/app/${encodeURIComponent("Sales Order")}/new`;

/**
 * Alumdoor sales now enters the canonical metadata-driven Sales Order workspace.
 *
 * SalesSheetV2 remains in source temporarily as rollback/reference evidence, but it is no longer
 * the production navigation authority. Business behavior must come from canonical Sales Order /
 * Sales Order Item metadata plus named server projections, not app-specific client hard-coding.
 */
export function AlumdoorSalesModeWorkspace() {
  return <Navigate to={SALES_ORDER_NEW_ROUTE} replace />;
}
