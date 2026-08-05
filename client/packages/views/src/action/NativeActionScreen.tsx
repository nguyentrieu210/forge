/** @jsxImportSource react */
import type { AppAction } from "@metaforge/core";
import { ActionScreen as ExistingActionScreen, type ActionScreenProps } from "./FriendlyActionScreen.js";
import { preferFirstClassActionInputTables } from "./input-table.js";
import { ProcurementOperatingWorkspace } from "../operating/ProcurementOperatingWorkspace.js";

const PROCUREMENT_RECEIPT_METHODS = new Set([
  "alumdoor.purchase.fifo_receipt",
  "alumdoor.purchase.bulk_fifo_receipt",
]);

function procurementAction(action: AppAction): boolean {
  return PROCUREMENT_RECEIPT_METHODS.has(action.commit.method);
}

/**
 * Public ActionScreen boundary for the rolling AppAction input-table migration.
 *
 * Procurement receipt actions now use the shared operating-workspace primitive: transaction,
 * history, payment and analytics stay on one route while authoritative document/ledger writes
 * continue through the existing action/controllers. Other actions retain the proven renderer.
 */
export function ActionScreen(props: ActionScreenProps) {
  const action = preferFirstClassActionInputTables(props.action);
  if (procurementAction(action)) {
    return (
      <ProcurementOperatingWorkspace
        {...props}
        action={action}
        config={{
          contextMethod: "alumdoor.purchase.supplier_delivery_dashboard",
          title: "Điều hành mua hàng",
          description: "Mua hàng · Nhập hàng · Thanh toán · Lịch sử · Báo cáo trên một workspace, không bắt người dùng mở chuỗi form riêng.",
        }}
      />
    );
  }
  return <ExistingActionScreen {...props} action={action} />;
}

export type { ActionScreenProps } from "./ActionScreen.js";
