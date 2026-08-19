import type { JsonObject } from "../../contracts/src/index.js";
import { ALUMDOOR_LINK_DISPLAY } from "./alumdoor-display.js";

/**
 * Luật hiển thị link của một vertical: đọc thêm field gì, ghép nhãn ra sao.
 *
 * Không có bảng này thì mỗi doctype cần nhãn ghép lại thêm một nhánh `if` vào router dùng
 * chung — đúng con đường đã biến `router.ts` thành 4530 dòng có tên khách hàng nằm trong.
 */
export interface LinkDisplayRule {
  /** Field cần lấy thêm ngoài `name` để dựng được nhãn. */
  fields: readonly string[];
  label(record: JsonObject): string;
}

export const LINK_DISPLAY_RULES: Record<string, LinkDisplayRule> = {
  ...ALUMDOOR_LINK_DISPLAY,
};
