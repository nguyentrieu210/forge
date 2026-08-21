/**
 * Cửa ra duy nhất của màn NHẬP HÀNG FIFO.
 *
 * `src/AlumdoorPurchaseReceiptCreate.tsx` chỉ re-export từ đây, đúng khuôn
 * `src/AlumdoorPurchaseOrderCreate.tsx` → `AlumdoorPurchaseOrderCreateStable.tsx`.
 */
export {
  AlumdoorPurchaseReceiptCreate,
  type AlumdoorPurchaseReceiptCreateProps,
} from "./AlumdoorPurchaseReceiptWorkbench.js";

export { PURCHASE_RECEIPT_METHODS } from "./server-contract.js";
export { readItemUomConversions, mergeUomReadings, UOM_FIX_LOCATION } from "./uom-gap.js";
export type { UomConversionGap, UomConversionReading, UomLawfulOmission } from "./uom-gap.js";
export {
  PLATFORM_DEFAULT_WEIGHT_TOLERANCE_PCT,
  readDeliveryTolerance,
  readWeightVariance,
} from "./weight-variance.js";
export type { DeliveryToleranceReading, WeightVarianceReading } from "./weight-variance.js";
export { fifoLayers, insightFromBulk, insightFromSingle } from "./fifo-insight.js";
export type { FifoLayerRow } from "./fifo-insight.js";
