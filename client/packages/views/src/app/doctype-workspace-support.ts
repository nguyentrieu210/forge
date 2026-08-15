import { useMetaForge } from "../container/provider.js";
import type { UrlStateBridge } from "../list/useListState.js";

export { resolveBulkRenderPolicy } from "@metaforge/core";
export { buildPrintPath } from "../print/printRoute.js";
export type { UrlStateBridge };

type ManufacturingStockPurpose = "Material Transfer" | "Manufacture";

export interface AlumdoorWorkspaceModeInput {
  doctype: string;
  isNew: boolean;
  decoded?: string;
  bridge: UrlStateBridge;
}

export function useAlumdoorWorkspaceMode(input: AlumdoorWorkspaceModeInput) {
  const { formProfiles } = useMetaForge();
  const { doctype, isNew, decoded, bridge } = input;
  const isAlumdoorProfile = Boolean(formProfiles?.["Item Group"]?.keep?.includes("default_measurement_profile"));
  const useAlumdoorSalesForm = doctype === "Sales Order" && isAlumdoorProfile;
  const useAlumdoorSalesCreate = isNew && useAlumdoorSalesForm;
  const useAlumdoorSalesDetail = Boolean(decoded) && useAlumdoorSalesForm;
  const useAlumdoorProductionRequestDetail = Boolean(decoded) && doctype === "Production Request" && isAlumdoorProfile;
  const useAlumdoorWorkOrderDetail = Boolean(decoded) && doctype === "Work Order" && isAlumdoorProfile;
  const manufacturingWorkOrder = bridge.get("f_work_order")?.trim() ?? "";
  const requestedStockPurpose = bridge.get("f_purpose");
  const manufacturingPurpose: ManufacturingStockPurpose | undefined = requestedStockPurpose === "Material Transfer" || requestedStockPurpose === "Manufacture"
    ? requestedStockPurpose
    : undefined;
  const useAlumdoorManufacturingStockEntryContext = !isNew && !decoded && doctype === "Stock Entry"
    && isAlumdoorProfile && Boolean(manufacturingWorkOrder && manufacturingPurpose);

  return {
    isAlumdoorProfile,
    useAlumdoorSalesForm,
    useAlumdoorSalesCreate,
    useAlumdoorSalesDetail,
    useAlumdoorProductionRequestDetail,
    useAlumdoorWorkOrderDetail,
    manufacturingWorkOrder,
    manufacturingPurpose,
    useAlumdoorManufacturingStockEntryContext,
  };
}
