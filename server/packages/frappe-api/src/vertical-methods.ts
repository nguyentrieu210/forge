import type { JsonObject } from "../../contracts/src/index.js";
import type { FrappeArgs } from "./args.js";
import type { FrappeRouterContext } from "./router.js";
import { ALUMDOOR_METHODS } from "./alumdoor-methods.js";

/**
 * Bảng đăng ký method của các vertical.
 *
 * Router dùng chung không được biết tên khách hàng nào. Trước đây sáu method
 * `metaforge.api.*_alumdoor_*` nằm thẳng trong switch của `router.ts`, nên lõi nền tảng
 * mang theo cả chấm công và bảng lương của một xưởng nhôm cụ thể. Nay lõi chỉ tra bảng
 * này; thêm một vertical là thêm một dòng ở đây, không phải sửa router.
 */
export type VerticalMethod = (args: FrappeArgs, context: FrappeRouterContext) => Promise<JsonObject>;

export const VERTICAL_METHODS: Record<string, VerticalMethod> = {
  ...ALUMDOOR_METHODS,
};
