/**
 * BỘ CỘT THÔNG SỐ — NGUỒN DUY NHẤT.
 *
 * Màn nhập và bản in phải trả lời GIỐNG HỆT nhau câu "đơn này hiện cột nào": phủ bì ray hay
 * phủ bì nhựa, có cột Cao lưới / Rộng cắt lá hay không. Trước đây bản in tự dựng bảng riêng và
 * chép tay luật này — chép là trôi dạt, và đã trôi thật: bản in từng bung CẢ HAI cột phủ bì cho
 * một bộ cửa chỉ đo một chiều.
 *
 * Vì vậy phần trình bày thì hai bên viết riêng (bản in không đụng gì tới lớp giao diện của màn
 * nhập), nhưng luật CHỌN CỘT thì nằm đúng ở đây, một chỗ.
 */
import { fieldVisible, isAreaDoor, quantity, salesWidthInputField, text, type SalesLine } from "./model.js";

export type DynamicFieldName =
  | "width_pb_ray_m"
  | "width_pb_nhua_m"
  | "width_m"
  | "height_m"
  | "mesh_height_m"
  | "cut_width_m"
  | "leaf_variant"
  | "ray_type"
  | "has_butterfly_bracket"
  | "motor_model"
  | "length_m"
  | "qty_bar"
  | "leaf_count"
  | "single_layer_leaf_count"
  | "double_layer_leaf_count"
  | "estimated_weight_kg";

export const DYNAMIC_FIELD_ORDER: DynamicFieldName[] = [
  "width_pb_ray_m",
  "width_pb_nhua_m",
  "width_m",
  "height_m",
  "mesh_height_m",
  "cut_width_m",
  "ray_type",
  "has_butterfly_bracket",
  "leaf_variant",
  "motor_model",
  "length_m",
  "qty_bar",
  "leaf_count",
  "single_layer_leaf_count",
  "double_layer_leaf_count",
  "estimated_weight_kg",
];

export const DYNAMIC_FALLBACK_LABELS: Record<DynamicFieldName, string> = {
  width_pb_ray_m: "Rộng PB ray",
  width_pb_nhua_m: "Rộng PB nhựa",
  width_m: "Rộng",
  height_m: "Cao PB",
  mesh_height_m: "Cao lưới",
  cut_width_m: "Rộng cắt lá",
  leaf_variant: "Kiểu lá",
  ray_type: "Loại ray",
  has_butterfly_bracket: "Bản bướm",
  motor_model: "Mô tơ",
  length_m: "Dài / cây",
  qty_bar: "Số cây/lá",
  leaf_count: "Số lá",
  single_layer_leaf_count: "Lá một lớp",
  double_layer_leaf_count: "Lá hai lớp",
  estimated_weight_kg: "KL dự kiến",
};

export const DYNAMIC_HEADER_UNITS: Partial<Record<DynamicFieldName, string>> = {
  width_pb_ray_m: "m",
  width_pb_nhua_m: "m",
  width_m: "m",
  height_m: "m",
  mesh_height_m: "m",
  cut_width_m: "m",
  length_m: "m",
  estimated_weight_kg: "kg",
};

export function dynamicDisplayValue(fieldname: DynamicFieldName, value: unknown): string {
  if (value == null || value === "") return "";
  if (fieldname === "has_butterfly_bracket") return Number(value) ? "Có" : "Không";
  if ([
    // Hai cột phủ bì cũng là số đo mét — thiếu chúng ở đây thì in thô "2.97" thay vì "2,97",
    // lạc lõng giữa các cột còn lại. Lộ ra khi dòng cấu kiện bắt đầu mang kích thước cắt.
    "width_pb_ray_m", "width_pb_nhua_m",
    "width_m", "height_m", "mesh_height_m", "cut_width_m", "length_m", "qty_bar",
    "leaf_count", "single_layer_leaf_count", "double_layer_leaf_count", "estimated_weight_kg",
  ].includes(fieldname)) return quantity(value);
  return text(value);
}

export interface DynamicColumnOptions {
  customerGroup?: string | undefined;
  showLeafCountColumn?: boolean | undefined;
}

/** Một dòng có dùng tới ô thông số này không. */
export function dynamicFieldVisible(line: SalesLine, fieldname: DynamicFieldName, options: DynamicColumnOptions): boolean {
  /*
   * "Có bắn bướm" KHÔNG lên cột — đây là quyết định TRÌNH BÀY, không phải luật nghiệp vụ:
   * màn nhập đã vẽ nó thành ô tick trong khối mô tả (chốt chủ xưởng 21/08/2026 — "bắn bướm là
   * tick như … tick có ray ko ray của cửa đức"). Một khái niệm chỉ được có ĐÚNG MỘT ô điều
   * khiển. Server hiện cũng đang ẩn nó ở mọi mặt hàng, nên đây là lớp chặn thứ hai chứ không
   * phải chỗ hai bên cãi nhau.
   */
  if (fieldname === "has_butterfly_bracket") return false;
  // "Tổng số lá" tắt ở màn tạo đơn — số vẫn được tính và vẫn nằm trong payload lưu,
  // và vẫn đọc được ở khối "Vì sao ra con số này".
  if (fieldname === "leaf_count" && !options.showLeafCountColumn) return false;
  if (isAreaDoor(line)) {
    if (fieldname === "width_pb_ray_m" || fieldname === "width_pb_nhua_m") {
      // Nhóm giá ở header đổi trước khi preview dòng mới trả về. Trong khoảng chờ đó,
      // `_overrides` vẫn là ảnh chụp của nhóm cũ và có thể đang `hidden: 1` đúng ô vừa được
      // chọn — làm cột rộng biến mất vài giây. Luật chọn PB ray/nhựa là thuần xác định và
      // giống hệt server, nên dùng kết quả hiện tại làm trọng tài.
      return salesWidthInputField(line, options.customerGroup) === fieldname;
    }
    if (fieldname === "width_m" && salesWidthInputField(line, options.customerGroup)) return false;
  }
  return fieldVisible(line, fieldname);
}

/** Bộ cột thông số của cả đơn: cột chỉ mọc khi có ít nhất một dòng thật sự dùng tới. */
export function resolveDynamicColumns(activeLines: SalesLine[], options: DynamicColumnOptions): DynamicFieldName[] {
  return DYNAMIC_FIELD_ORDER.filter((fieldname) => activeLines.some((line) => dynamicFieldVisible(line, fieldname, options)));
}
