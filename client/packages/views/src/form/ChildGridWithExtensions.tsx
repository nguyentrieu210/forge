// Compatibility barrel only. There is exactly one child-table renderer: ./ChildGrid.tsx.
// Legacy purchase/weight math lives outside generic grid runtime under ../compat and remains
// exported temporarily so old callers/tests do not force business algebra back into ChildGrid.
export {
  ChildGrid,
  resolveChildGridColumns,
  defaultChildGridHiddenColumns,
} from "./ChildGrid.js";
export type { ChildGridProps } from "./ChildGrid.js";
export {
  deriveAverageWeight,
  derivePurchaseOrderBarem,
} from "../compat/purchase-weight.js";
export type { AverageWeightResult } from "../compat/purchase-weight.js";
