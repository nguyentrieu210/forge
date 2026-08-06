// Compatibility barrel only. There is exactly one child-table renderer: ./ChildGrid.tsx.
// Keeping this module temporarily avoids breaking package imports while MDI-07 migrates callers.
export {
  ChildGrid,
  resolveChildGridColumns,
  defaultChildGridHiddenColumns,
  deriveAverageWeight,
  derivePurchaseOrderBarem,
} from "./ChildGrid.js";
export type { ChildGridProps, AverageWeightResult } from "./ChildGrid.js";
