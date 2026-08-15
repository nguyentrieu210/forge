import { lazy } from "react";
import { useMetaForge } from "../../../container/provider.js";
import type { UrlStateBridge } from "../../../list/useListState.js";

export const AlumdoorSalesOrderCreate = lazy(() => import("./AlumdoorSalesOrderCreate.js").then((module) => ({ default: module.AlumdoorSalesOrderCreate })));
export const AlumdoorProductionRequestDetail = lazy(() => import("./AlumdoorProductionRequestDetail.js").then((module) => ({ default: module.AlumdoorProductionRequestDetail })));
export const AlumdoorWorkOrderDetail = lazy(() => import("./AlumdoorWorkOrderDetail.js").then((module) => ({ default: module.AlumdoorWorkOrderDetail })));
export const AlumdoorManufacturingStockEntryCreate = lazy(() => import("./AlumdoorManufacturingStockEntryCreate.js").then((module) => ({ default: module.AlumdoorManufacturingStockEntryCreate })));

type ManufacturingStockPurpose = "Material Transfer" | "Manufacture";

interface AlumdoorWorkspaceModeInput {
  doctype: string;
  isNew: boolean;
  decoded?: string;
  bridge: UrlStateBridge;
}

export function useAlumdoorWorkspaceMode(input: AlumdoorWorkspaceModeInput) {
  const { formProfiles } = useMetaForge();
  const { doctype, isNew, decoded, bridge } = input;
  /**
   * AlumDoor được runtime đánh dấu bằng form profile riêng cho Item Group. Chỉ profile của
   * vertical này giữ `default_measurement_profile`; nhờ vậy generic workspace không chiếm
   * màn nghiệp vụ của app khác. Màn chuyên biệt vẫn lazy-load, nên app khác không tải code cửa.
   */
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
