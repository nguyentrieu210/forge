import type { JsonObject } from "../../contracts/src/index.js";
import type { FrappeArgs } from "./args.js";
import type { FrappeRouterContext } from "./router.js";
import { ALUMDOOR_METHODS, type AlumdoorRouterHooks } from "./alumdoor-methods.js";
import { previewSalesCommercialLine } from "./alumdoor-commercial.js";

/**
 * Bảng đăng ký method của các vertical.
 *
 * Router dùng chung không được biết tên khách hàng nào. Trước đây sáu method
 * `metaforge.api.*_alumdoor_*` nằm thẳng trong switch của `router.ts`, nên lõi nền tảng
 * mang theo cả chấm công và bảng lương của một xưởng nhôm cụ thể. Nay lõi chỉ tra bảng
 * này; thêm một vertical là thêm một dòng ở đây, không phải sửa router.
 */
export type VerticalMethod = (args: FrappeArgs, context: FrappeRouterContext) => Promise<JsonObject>;

/** Hook mà tenant Worker cắm vào cho các vertical. Lõi kế thừa cái này, không kế thừa tên khách. */
export interface VerticalRouterHooks extends AlumdoorRouterHooks {}

export const VERTICAL_METHODS: Record<string, VerticalMethod> = {
  ...ALUMDOOR_METHODS,
  "metaforge.api.preview_sales_commercial_line": previewSalesCommercialLine,
};
