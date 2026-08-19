import type { AppAction, AppActionField } from "@metaforge/core";

/** Cửa Đức dùng hai mốc rộng khác nhau theo nhóm khách. */
export function actionFieldLabel(
  action: Pick<AppAction, "name">,
  field: Pick<AppActionField, "fieldname" | "label">,
  _values: Record<string, unknown>,
): string {
  if (action.name !== "tinh-cong-thuc-cua") return field.label;
  if (field.fieldname === "width_pb_ray_m") return "Rộng PB ray (m)";
  if (field.fieldname === "width_pb_nhua_m") return "Rộng PB nhựa (m)";
  return field.label;
}

export function isActionFieldVisible(
  action: Pick<AppAction, "name">,
  field: Pick<AppActionField, "fieldname">,
  values: Record<string, unknown>,
): boolean {
  if (action.name !== "tinh-cong-thuc-cua") return true;
  const customerGroup = String(values.customer_group ?? "").trim();
  if (field.fieldname === "width_m") return customerGroup !== "Lẻ" && customerGroup !== "Đại lý";
  if (field.fieldname === "width_pb_ray_m") return customerGroup === "Lẻ";
  if (field.fieldname === "width_pb_nhua_m") return customerGroup === "Đại lý";
  return true;
}

/** Chuẩn hoá field PB đang dùng về width_m mà API công thức hiện hữu đọc. */
export function actionRequestValues(
  action: Pick<AppAction, "name">,
  values: Record<string, unknown>,
): Record<string, unknown> {
  if (action.name !== "tinh-cong-thuc-cua") return values;
  const customerGroup = String(values.customer_group ?? "").trim();
  const width = customerGroup === "Đại lý" ? values.width_pb_nhua_m : values.width_pb_ray_m;
  return { ...values, width_m: width };
}

export interface DoorSalesSummary {
  area: number;
  rate?: number;
  amount?: number;
}

/** Giữ diện tích đã tính và cho phép nhân tiền ngay khi người dùng nhập đơn giá. */
export function doorSalesSummary(
  actionName: string,
  result: unknown,
  sellingRate: unknown,
): DoorSalesSummary | undefined {
  if (actionName !== "tinh-cong-thuc-cua" || !result || typeof result !== "object") return undefined;
  const area = Number((result as Record<string, unknown>).billable_area_sqm);
  if (!Number.isFinite(area) || area <= 0) return undefined;
  if (sellingRate == null || sellingRate === "") return { area };
  const rate = Number(sellingRate);
  if (!Number.isFinite(rate) || rate < 0) return { area };
  return { area, rate, amount: area * rate };
}
