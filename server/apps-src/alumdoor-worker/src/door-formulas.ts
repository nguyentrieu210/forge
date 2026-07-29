/**
 * Công thức hình học và thương mại của một bộ cửa.
 *
 * File này chỉ làm số học. Nó không đọc tenant, không biết HTTP và không tự đoán loại cửa.
 * Chính sách được truyền vào từ danh mục `Cutting Policy`; nhờ vậy một con số sửa trong
 * danh mục được cả báo giá, sản xuất và dự toán mua dùng chung.
 */

export const DOOR_TYPES = [
  "Cửa Đức",
  "Cửa Úc",
  "Cửa Lưới",
  "Cửa Đài Loan",
  "Cửa Siêu Trường",
] as const;

export type DoorType = typeof DOOR_TYPES[number];
export type CustomerGroup = "Đại lý" | "Lẻ";
export type SalesMode = "Tách món" | "Trọn bộ";
export type WidthBasis = "Phủ bì nhựa" | "Phủ bì ray" | "Rộng cắt lá";
export type HeightBasis = "Cao phủ bì" | "Cao lưới";
export type PurchaseFormula = "Kg thực tế" | "Barem kg/m2";
export type DoorFormulaPurpose = "sales" | "production" | "purchase" | "all";

/** Một dòng trong danh mục Chính sách công thức cửa. */
export interface DoorFormulaPolicy {
  policy_name: string;
  door_type: DoorType;
  /** Bỏ trống = áp cho mọi nhóm Item thuộc loại cửa này. */
  item_group?: string;

  dealer_width_basis: Exclude<WidthBasis, "Rộng cắt lá">;
  retail_width_basis: Exclude<WidthBasis, "Rộng cắt lá">;
  dealer_cut_deduction_m: number;
  retail_cut_deduction_m: number;
  /** Có giá trị thì thay số trừ thường khi dòng chọn "Có bản bướm". */
  butterfly_cut_deduction_m?: number;

  dealer_split_sales_basis: WidthBasis;
  dealer_full_sales_basis: WidthBasis;
  retail_sales_basis: WidthBasis;
  /** Riêng Cửa Đài Loan kéo tay; bỏ trống nếu không có ngoại lệ. */
  manual_pull_sales_basis?: WidthBasis;

  purchase_formula: PurchaseFormula;
  purchase_height_basis?: HeightBasis;
  purchase_width_basis?: WidthBasis;
  priority?: number;
  disabled?: unknown;
  note?: string;
}

export interface DoorFormulaInput {
  door_type: DoorType;
  item_group?: string;
  customer_group: CustomerGroup;
  sales_mode?: SalesMode;
  has_butterfly_bracket?: boolean;
  is_manual_pull?: boolean;
  /** Bề rộng người bán nhập, theo cơ sở đo mà chính sách chọn; đơn vị mét. */
  measured_width_m: number;
  cover_height_m?: number;
  mesh_height_m?: number;
  set_count?: number;
  min_area_sqm?: number;
  kg_per_m2?: number;
  actual_purchase_kg?: number;
  purchase_rate?: number;
  purpose?: DoorFormulaPurpose;
}

export interface DoorFormulaResult {
  policy_name: string;
  door_type: DoorType;
  customer_group: CustomerGroup;
  sales_mode: SalesMode;
  width_basis: Exclude<WidthBasis, "Rộng cắt lá">;
  measured_width_m: number;
  cut_deduction_m: number;
  cut_width_m: number;
  sales_width_basis?: WidthBasis;
  sales_width_m?: number;
  sales_height_basis?: "Cao phủ bì";
  sales_height_m?: number;
  area_per_set_sqm?: number;
  billable_area_sqm?: number;
  purchase_formula?: PurchaseFormula;
  purchase_height_basis?: HeightBasis;
  purchase_height_m?: number;
  purchase_width_basis?: WidthBasis;
  purchase_width_m?: number;
  purchase_kg_per_set?: number;
  purchase_kg?: number;
  purchase_amount?: number;
  set_count: number;
  explanation: string;
}

const ITEM_GROUP_DOOR_TYPE: Record<string, DoorType> = {
  "cửa cn đức": "Cửa Đức",
  "cửa tấm liền úc": "Cửa Úc",
  "cửa lưới": "Cửa Lưới",
  "cửa đài loan": "Cửa Đài Loan",
  "cửa đài loan inox": "Cửa Đài Loan",
  "cửa kéo đài loan": "Cửa Đài Loan",
  "cửa siêu trường": "Cửa Siêu Trường",
};

function normalized(value: unknown): string {
  return String(value ?? "").trim().toLocaleLowerCase("vi");
}

export function isDoorType(value: unknown): value is DoorType {
  return DOOR_TYPES.includes(String(value ?? "") as DoorType);
}

function isWidthBasis(value: unknown): value is WidthBasis {
  return ["Phủ bì nhựa", "Phủ bì ray", "Rộng cắt lá"].includes(String(value ?? ""));
}

function isMeasuredWidthBasis(value: unknown): value is Exclude<WidthBasis, "Rộng cắt lá"> {
  return value === "Phủ bì nhựa" || value === "Phủ bì ray";
}

function isHeightBasis(value: unknown): value is HeightBasis {
  return value === "Cao phủ bì" || value === "Cao lưới";
}

function isPurchaseFormula(value: unknown): value is PurchaseFormula {
  return value === "Kg thực tế" || value === "Barem kg/m2";
}

/** Đổi bản ghi động của tenant thành chính sách có kiểu; sai cấu hình thì dừng có tên field. */
export function parseDoorPolicy(input: Record<string, unknown>): DoorFormulaPolicy {
  const name = String(input.policy_name ?? input.name ?? "").trim();
  if (!name) throw new Error("Chính sách công thức thiếu tên.");
  if (!isDoorType(input.door_type)) throw new Error(`${name}: Loại cửa không hợp lệ.`);
  if (!isMeasuredWidthBasis(input.dealer_width_basis)) throw new Error(`${name}: thiếu Cơ sở rộng đại lý.`);
  if (!isMeasuredWidthBasis(input.retail_width_basis)) throw new Error(`${name}: thiếu Cơ sở rộng khách lẻ.`);
  if (!isWidthBasis(input.dealer_split_sales_basis)) throw new Error(`${name}: thiếu Cơ sở bán đại lý tách món.`);
  if (!isWidthBasis(input.dealer_full_sales_basis)) throw new Error(`${name}: thiếu Cơ sở bán đại lý trọn bộ.`);
  if (!isWidthBasis(input.retail_sales_basis)) throw new Error(`${name}: thiếu Cơ sở bán khách lẻ.`);
  const manualPullBasis = input.manual_pull_sales_basis;
  if (manualPullBasis && !isWidthBasis(manualPullBasis)) {
    throw new Error(`${name}: Cơ sở bán cửa kéo tay không hợp lệ.`);
  }
  if (!isPurchaseFormula(input.purchase_formula)) throw new Error(`${name}: Công thức mua không hợp lệ.`);
  const purchaseHeightBasis = input.purchase_height_basis;
  if (purchaseHeightBasis && !isHeightBasis(purchaseHeightBasis)) {
    throw new Error(`${name}: Cơ sở chiều cao mua không hợp lệ.`);
  }
  const purchaseWidthBasis = input.purchase_width_basis;
  if (purchaseWidthBasis && !isWidthBasis(purchaseWidthBasis)) {
    throw new Error(`${name}: Cơ sở chiều rộng mua không hợp lệ.`);
  }
  const dealerDeduction = finiteNonNegative(input.dealer_cut_deduction_m, `${name}: số trừ đại lý`);
  const retailDeduction = finiteNonNegative(input.retail_cut_deduction_m, `${name}: số trừ khách lẻ`);
  const butterfly = input.butterfly_cut_deduction_m == null || input.butterfly_cut_deduction_m === ""
    ? undefined
    : finiteNonNegative(input.butterfly_cut_deduction_m, `${name}: số trừ bản bướm`);
  return {
    policy_name: name,
    door_type: input.door_type,
    ...(input.item_group ? { item_group: String(input.item_group) } : {}),
    dealer_width_basis: input.dealer_width_basis,
    retail_width_basis: input.retail_width_basis,
    dealer_cut_deduction_m: dealerDeduction,
    retail_cut_deduction_m: retailDeduction,
    ...(butterfly == null ? {} : { butterfly_cut_deduction_m: butterfly }),
    dealer_split_sales_basis: input.dealer_split_sales_basis,
    dealer_full_sales_basis: input.dealer_full_sales_basis,
    retail_sales_basis: input.retail_sales_basis,
    ...(isWidthBasis(manualPullBasis) ? { manual_pull_sales_basis: manualPullBasis } : {}),
    purchase_formula: input.purchase_formula,
    ...(isHeightBasis(purchaseHeightBasis) ? { purchase_height_basis: purchaseHeightBasis } : {}),
    ...(isWidthBasis(purchaseWidthBasis) ? { purchase_width_basis: purchaseWidthBasis } : {}),
    ...(input.priority == null || input.priority === "" ? {} : { priority: Number(input.priority) || 0 }),
    ...(input.disabled == null ? {} : { disabled: input.disabled }),
    ...(input.note ? { note: String(input.note) } : {}),
  };
}

/** Item mới khai thẳng loại cửa; dữ liệu cũ được ánh xạ từ nhóm hàng đã chốt. */
export function inferDoorType(explicit: unknown, itemGroup: unknown): DoorType | null {
  if (isDoorType(explicit)) return explicit;
  return ITEM_GROUP_DOOR_TYPE[normalized(itemGroup)] ?? null;
}

export function isManualPullGroup(itemGroup: unknown): boolean {
  return normalized(itemGroup) === "cửa kéo đài loan";
}

function enabled(value: unknown): boolean {
  return value !== true && value !== 1 && value !== "1";
}

function finitePositive(value: unknown, label: string): number {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) throw new Error(`${label} phải lớn hơn 0.`);
  return number;
}

function finiteNonNegative(value: unknown, label: string): number {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw new Error(`${label} không được âm.`);
  return number;
}

function round(value: number, digits = 6): number {
  const scale = 10 ** digits;
  return Math.round((value + Number.EPSILON) * scale) / scale;
}

/**
 * Chọn đúng MỘT chính sách. Nhóm Item cụ thể thắng luật chung; priority chỉ phân xử trong
 * cùng mức cụ thể. Hai luật ngang nhau bị từ chối — đoán một luật ở đây là cắt hỏng nhôm.
 */
export function selectDoorPolicy(
  policies: DoorFormulaPolicy[],
  doorType: DoorType,
  itemGroup = "",
): DoorFormulaPolicy {
  const candidates = policies
    .filter((policy) => enabled(policy.disabled) && policy.door_type === doorType)
    .filter((policy) => !policy.item_group || policy.item_group === itemGroup)
    .map((policy) => ({
      policy,
      specificity: policy.item_group ? 1 : 0,
      priority: Number(policy.priority ?? 0) || 0,
    }))
    .sort((left, right) => (right.specificity - left.specificity) || (right.priority - left.priority));

  if (!candidates.length) throw new Error(`Chưa có Chính sách công thức cho ${doorType}${itemGroup ? ` / ${itemGroup}` : ""}.`);
  const first = candidates[0]!;
  const tied = candidates.filter((entry) => entry.specificity === first.specificity && entry.priority === first.priority);
  if (tied.length > 1) {
    throw new Error(`Có nhiều Chính sách công thức cùng khớp ${doorType}: ${tied.map((entry) => entry.policy.policy_name).join(", ")}.`);
  }
  return first.policy;
}

function widthForBasis(basis: WidthBasis, measured: number, measuredBasis: WidthBasis, cut: number): number {
  if (basis === "Rộng cắt lá") return cut;
  if (basis !== measuredBasis) {
    throw new Error(`Chính sách yêu cầu ${basis} nhưng dòng đang khai theo ${measuredBasis}; không được tự suy ra khoảng cách hai loại phủ bì.`);
  }
  return measured;
}

/** Tính đúng một lần rồi dùng kết quả cho bán, sản xuất và dự toán mua. */
export function calculateDoorFormula(policy: DoorFormulaPolicy, input: DoorFormulaInput): DoorFormulaResult {
  if (policy.door_type !== input.door_type) {
    throw new Error(`Chính sách ${policy.policy_name} thuộc ${policy.door_type}, không áp được cho ${input.door_type}.`);
  }
  const measured = finitePositive(input.measured_width_m, "Bề rộng khai");
  const sets = finitePositive(input.set_count ?? 1, "Số bộ");
  const mode = input.sales_mode ?? "Trọn bộ";
  const purpose = input.purpose ?? "all";
  const widthBasis = input.customer_group === "Đại lý" ? policy.dealer_width_basis : policy.retail_width_basis;
  const ordinaryDeduction = input.customer_group === "Đại lý"
    ? policy.dealer_cut_deduction_m
    : policy.retail_cut_deduction_m;
  const deduction = input.has_butterfly_bracket && policy.butterfly_cut_deduction_m != null
    ? finiteNonNegative(policy.butterfly_cut_deduction_m, "Số trừ khi có bản bướm")
    : finiteNonNegative(ordinaryDeduction, "Số trừ khi cắt lá");
  const cut = measured - deduction;
  if (!(cut > 0)) throw new Error(`Rộng cắt lá không dương: ${measured} − ${deduction}.`);

  const result: DoorFormulaResult = {
    policy_name: policy.policy_name,
    door_type: input.door_type,
    customer_group: input.customer_group,
    sales_mode: mode,
    width_basis: widthBasis,
    measured_width_m: round(measured),
    cut_deduction_m: round(deduction),
    cut_width_m: round(cut),
    set_count: round(sets),
    explanation: `Rộng cắt lá = ${widthBasis} ${round(measured)} − ${round(deduction)} = ${round(cut)} m.`,
  };

  if (purpose === "sales" || purpose === "all") {
    const coverHeight = finitePositive(input.cover_height_m, "Cao phủ bì");
    const salesBasis = input.customer_group === "Lẻ"
      ? policy.retail_sales_basis
      : input.is_manual_pull && policy.manual_pull_sales_basis
        ? policy.manual_pull_sales_basis
        : mode === "Tách món"
          ? policy.dealer_split_sales_basis
          : policy.dealer_full_sales_basis;
    const salesWidth = widthForBasis(salesBasis, measured, widthBasis, cut);
    const rawArea = coverHeight * salesWidth;
    const minimum = finiteNonNegative(input.min_area_sqm ?? 0, "Diện tích tối thiểu");
    const billable = Math.max(rawArea, minimum) * sets;
    Object.assign(result, {
      sales_width_basis: salesBasis,
      sales_width_m: round(salesWidth),
      sales_height_basis: "Cao phủ bì" as const,
      sales_height_m: round(coverHeight),
      area_per_set_sqm: round(rawArea),
      billable_area_sqm: round(billable),
      explanation: `${result.explanation} Bán: ${round(coverHeight)} × ${round(salesWidth)} × ${round(sets)} = ${round(billable)} m2 (${salesBasis}).`,
    });
  }

  if (purpose === "purchase" || purpose === "all") {
    result.purchase_formula = policy.purchase_formula;
    if (policy.purchase_formula === "Kg thực tế") {
      if (input.actual_purchase_kg != null && input.actual_purchase_kg !== 0) {
        const kg = finitePositive(input.actual_purchase_kg, "Kg thực tế");
        result.purchase_kg = round(kg);
        if (input.purchase_rate != null) result.purchase_amount = round(kg * finiteNonNegative(input.purchase_rate, "Đơn giá mua"));
        result.explanation += ` Mua: ${round(kg)} kg thực tế${result.purchase_amount == null ? "" : ` × ${round(Number(input.purchase_rate))} = ${result.purchase_amount}`}.`;
      } else {
        result.explanation += " Mua: cân Kg thực tế × đơn giá; không suy từ kích thước.";
      }
    } else {
      const heightBasis = policy.purchase_height_basis;
      const purchaseWidthBasis = policy.purchase_width_basis;
      if (!heightBasis || !purchaseWidthBasis) throw new Error(`${policy.policy_name}: công thức barem thiếu cơ sở cao/rộng mua.`);
      const purchaseHeight = heightBasis === "Cao lưới"
        ? finitePositive(input.mesh_height_m, "Cao lưới")
        : finitePositive(input.cover_height_m, "Cao phủ bì");
      const purchaseWidth = widthForBasis(purchaseWidthBasis, measured, widthBasis, cut);
      const barem = finitePositive(input.kg_per_m2, "Barem kg/m2");
      const kgPerSet = barem * purchaseHeight * purchaseWidth;
      const kg = kgPerSet * sets;
      Object.assign(result, {
        purchase_height_basis: heightBasis,
        purchase_height_m: round(purchaseHeight),
        purchase_width_basis: purchaseWidthBasis,
        purchase_width_m: round(purchaseWidth),
        purchase_kg_per_set: round(kgPerSet),
        purchase_kg: round(kg),
        ...(input.purchase_rate == null
          ? {}
          : { purchase_amount: round(kg * finiteNonNegative(input.purchase_rate, "Đơn giá mua")) }),
        explanation: `${result.explanation} Mua: ${round(barem)} kg/m2 × ${round(purchaseHeight)} × ${round(purchaseWidth)} × ${round(sets)} = ${round(kg)} kg.`,
      });
    }
  }

  return result;
}
