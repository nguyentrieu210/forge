/** @jsxImportSource react */
import { SupplierDeliveryWorkspace } from "./SupplierDeliveryWorkspace.js";
import { ActionScreen as BaseActionScreen, type ActionScreenProps } from "./ActionScreen.js";

const RECEIPT_ACTION = "nhap-nhom-fifo";

export function ActionScreen(props: ActionScreenProps) {
  if (props.action.name !== RECEIPT_ACTION) return <BaseActionScreen {...props} />;
  return <SupplierDeliveryWorkspace {...props} />;
}

export type { ActionScreenProps } from "./ActionScreen.js";
