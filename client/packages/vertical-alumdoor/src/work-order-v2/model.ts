/**
 * Mô hình dữ liệu cho workbench Phiếu sản xuất (Work Order).
 *
 * Nguyên tắc của tệp này — giống hệt `../sales-order-v2/model.ts`:
 *
 *  1. **Không tính lại thẩm quyền của server.** Định mức, tồn kho, tiến độ và chuyển trạng thái
 *     đều do server dựng. Ở đây chỉ có phép GHÉP hai bảng đã có khoá chung và phép ĐỊNH DẠNG.
 *  2. **Mọi trường đều optional.** Payload server còn đang nới; một trường vắng mặt phải hiện ra
 *     là "không biết", KHÔNG được biến thành số 0 trông như dữ liệu thật.
 *  3. **Không đoán mã hàng.** Cấu phần BOM ghi mã nào thì hiện đúng mã đó; giải được sang Item
 *     thật hay không là một sự kiện phải NÓI RA, không phải lý do để bỏ dòng đi.
 *
 * Helper chung (`text`, `money`, `quantity`, …) dùng lại nguyên bản của làn bán hàng — chỉ đọc,
 * không sửa file đó.
 */
import {
  money,
  normalized,
  numberValue,
  optionList,
  positiveNumber,
  quantity,
  text,
  today,
  type Json,
} from "../sales-order-v2/model.js";

export { money, normalized, numberValue, optionList, positiveNumber, quantity, text, today };
export type { Json };

/* ────────────────────────────────────────────────────────────────────────────
 * 1. Hợp đồng đọc từ `metaforge.manufacturing.get_work_order_lifecycle`
 * Chữ ký thật: server/apps/tenant-worker/src/manufacturing-costing-api.ts (LIFECYCLE_PATH)
 *            + server/packages/clouderp-erpnext/src/manufacturing-work-order-lifecycle.ts
 * ──────────────────────────────────────────────────────────────────────────── */

/** Một dòng vật tư theo BOM snapshot của lệnh, kèm tiến độ cấp/tiêu hao đã ghi sổ. */
export interface WorkOrderMaterialProgressRow extends Json {
  bom_row_id?: string;
  item_code?: string;
  source_warehouse?: string;
  required_qty?: string;
  required_qty_micros?: number;
  issued_qty?: string;
  issued_qty_micros?: number;
  consumed_qty?: string;
  consumed_qty_micros?: number;
  remaining_to_issue?: string;
  remaining_to_issue_micros?: number;
  remaining_to_consume?: string;
  remaining_to_consume_micros?: number;
}

export interface WorkOrderLifecycleActions extends Json {
  can_issue_materials?: boolean;
  can_manufacture?: boolean;
  can_cancel_work_order?: boolean;
}

export interface WorkOrderLifecycle extends Json {
  schema_version?: number;
  evidence_scope?: string;
  work_order?: string;
  docstatus?: 0 | 1 | 2;
  canonical_status?: string;
  stage?: string;
  release_authority?: string;
  production_item?: string;
  target_qty?: string;
  target_qty_micros?: number;
  produced_qty?: string;
  produced_qty_micros?: number;
  remaining_qty?: string;
  remaining_qty_micros?: number;
  material_rows?: WorkOrderMaterialProgressRow[];
  actions?: WorkOrderLifecycleActions;
  warnings?: string[];
  production_request?: string;
  production_request_line_key?: string;
  production_plan?: string;
  production_plan_row_id?: string;
  sales_order?: string;
  sales_order_row_id?: string;
}

export interface WorkOrderCaps {
  read?: boolean;
  write?: boolean;
  create?: boolean;
  delete?: boolean;
  submit?: boolean;
  cancel?: boolean;
  amend?: boolean;
}

/* ────────────────────────────────────────────────────────────────────────────
 * 2. Ảnh chụp định mức nằm TRÊN chính lệnh sản xuất
 * `Work Order.required_items` do controller nền tảng dựng lúc lưu:
 * server/packages/clouderp-erpnext/src/controllers.ts (WorkOrder.normalize)
 *   row_id = row.row_id || `ROW-{index+1}` theo ĐÚNG thứ tự `Bill of Materials.items`
 * ──────────────────────────────────────────────────────────────────────────── */

export interface WorkOrderRequiredItem extends Json {
  row_id?: string;
  item_code?: string;
  source_warehouse?: string;
  required_qty?: string | number;
  required_qty_micros?: number;
}

/** Một dòng của `Bill of Materials.items` (child `BOM Item`). */
export interface BomComponentSource extends Json {
  row_id?: string;
  item_code?: string;
  qty?: number | string;
  uom?: string;
  qty_basis?: string;
  source_warehouse?: string;
  color?: string;
  note?: string;
  source_note?: string;
}

/** Các fact của Item mà bảng cấu phần cần để hiện "quy cách" và ĐVT tồn. */
export interface ItemFacts extends Json {
  name?: string;
  item_name?: string;
  item_group?: string;
  stock_uom?: string;
  material_specification?: string;
  measurement_profile?: string;
  disabled?: unknown;
}

/* ────────────────────────────────────────────────────────────────────────────
 * 3. Hợp đồng đọc từ `alumdoor.sales.preview_bom_requirements`
 * Chữ ký thật: server/apps-src/alumdoor-worker/src/sales-production-core.ts:1185
 * ──────────────────────────────────────────────────────────────────────────── */

export interface BomRequirementComponent extends Json {
  component_key?: string;
  item_code?: string;
  color?: string;
  uom?: string;
  stock_uom?: string;
  qty?: number | null;
  stock_qty?: number | null;
  production_qty?: number | null;
  quantity_error?: string;
  uom_warning?: string;
  sales_uom_missing?: boolean;
  sales_uom_message?: string;
  note?: string;
  source_rule?: string;
  /*
   * LỚP CẤU KIỆN VẬT LÝ — "mấy cây, mấy lá, mỗi cái cắt bao nhiêu".
   *
   * Server ĐÃ trả đủ nhóm trường này từ 24/08/2026: đường `alumdoor.sales.preview_bom_requirements`
   * đi qua lớp bọc `sales-production.ts:190` (`enrichSalesBomPreviewWithRules`) chứ không phải bản
   * lõi, nên mỗi cấu phần đã kèm số cấu kiện do Quy tắc BOM tính. Client thì chưa khai nên TypeScript
   * không nhìn thấy — cả nhóm bị vứt đi im lặng, y hệt loại hỏng mà
   * docs/audits/ALUMDOOR-BAN-HANG-DANH-MUC-GAP-20260821.md §2 gọi tên: luật chạy đủ ở server, kết
   * quả không tới người dùng.
   *
   * Đây là authority của cột SL/ĐVT trên bảng BOM. `qty`/`uom` ở trên là projection tương thích
   * ngược mang nghĩa TIÊU HAO KHO (Kg · Mét · m²); đọc chúng vào cột SL chính là chỗ khiến hai cây
   * ray hiện thành "5,8 Mét" thay vì "2 Cây".
   *
   * Khai giống hệt `../sales-order-v2/model.ts` (`BomPreviewComponent`, ~dòng 319-335) để hai làn
   * bán và sản xuất đọc cùng một hợp đồng, không trôi dạt mỗi nơi một kiểu.
   */
  component_count?: number | null;
  component_count_uom?: string;
  cut_length_each_m?: number;
  /** Tên cột số đo đang giữ kích thước cắt (`height_m`, `width_pb_ray_m`…). Server quyết định. */
  cut_axis?: string;
  leaf_count?: number;
  /** Lý do KHÔNG tính được số cấu kiện. Có nó thì phải hiện, tuyệt đối không lùi về 1. */
  component_count_error?: string;
  /** LỚP TIÊU HAO KHO — mét/m²/kg cho xuất kho, dự trù và giá thành. */
  stock_consumption_qty?: number;
  stock_consumption_uom?: string;
  /** Dòng chưa map được Quy tắc BOM (`bom-rule-sales-preview.ts:458`) — số dưới là snapshot cũ. */
  bom_rule_missing?: boolean;
  /** Cảnh báo THIẾU CẤU HÌNH quy tắc, khác hẳn `note` (ghi chú kỹ thuật nội bộ). */
  bom_rule_warning?: string;
}

export interface BomActualRequirementLike extends Json {
  component_key?: string;
  allowed_item_codes?: string[];
  provided_item_codes?: string[];
  provided_rows?: number;
  missing?: boolean;
}

export interface BomRequirementPreview extends Json {
  item_code?: string;
  bom_applicable?: boolean;
  reason?: string;
  pending_fields?: string[];
  bom_no?: string;
  bom_template?: string;
  bom_template_code?: string;
  static_bom?: boolean;
  stock_uom?: string;
  output_qty?: number;
  components?: BomRequirementComponent[];
  actual_requirements?: BomActualRequirementLike[];
  missing_actual_component_keys?: string[];
  actual_complete?: boolean;
}

/* ────────────────────────────────────────────────────────────────────────────
 * 4. Hợp đồng đọc từ nhóm `alumdoor.cut.*`
 * Chữ ký thật: server/apps-src/alumdoor-worker/src/index.ts:553 (propose) / :599 (draft)
 * ──────────────────────────────────────────────────────────────────────────── */

export interface CutPick extends Json {
  batch_no?: string;
  length_m?: number;
  color?: string;
  condition?: string;
  warehouse?: string;
  is_offcut?: boolean;
  available?: number;
  take?: number;
  offcut_per_sheet_m?: number;
}

export interface CutProposal extends Json {
  item_code?: string;
  warehouse?: string;
  cut_width_m?: number;
  sheets?: number;
  lots_considered?: number;
  picks?: CutPick[];
  short?: number;
  message?: string;
}

export interface CutDraftResult extends Json {
  cut_order?: string;
  draft?: boolean;
  bundles?: string[];
  offcut_batches?: string[];
  message?: string;
}

/** Dòng `Cut Order` đã lập cho lệnh này — nguồn số liệu hao hụt sau khi cắt. */
export interface CutOrderSummary extends Json {
  name?: string;
  cut_on?: string;
  cutting_policy?: string;
  cut_state?: string;
  docstatus?: number;
  work_order?: string;
  so_reference?: string;
  target_color?: string;
}

export interface CutOrderItemFacts extends Json {
  item_code?: string;
  source_batch_no?: string;
  source_warehouse?: string;
  source_length_m?: number;
  cut_width_m?: number;
  sheets_cut?: number;
  cuts_count?: number;
  kerf_total_m?: number;
  offcut_length_m?: number;
  scrap_m?: number;
  kg_consumed?: number;
  kg_weighed?: number;
}

/* ────────────────────────────────────────────────────────────────────────────
 * 5. Hợp đồng đọc từ `alumdoor.capacity.preview`
 * Chữ ký thật: server/apps-src/alumdoor-worker/src/index.ts:2154 → planCapacity()
 *              server/apps-src/alumdoor-worker/src/operations-core.ts:157
 * ──────────────────────────────────────────────────────────────────────────── */

export type CapacityBasis = "m2" | "set" | "operation" | "batch";

export interface CapacityDemandInput extends Json {
  key: string;
  door_type: string;
  operation: string;
  basis: CapacityBasis;
  quantity: number;
  minutes_per_unit: number;
  color?: string;
  batch_capacity?: number;
}

export interface CapacityResourceInput extends Json {
  persons: number;
  shifts?: number;
  shift_hours?: number;
  efficiency?: number;
  overtime_hours?: number;
  start_date?: string;
}

export interface CapacityPlan extends Json {
  required_minutes?: number;
  regular_capacity_minutes?: number;
  overtime_capacity_minutes?: number;
  overload_minutes?: number;
  late_warning?: boolean;
  days_required?: number;
  suggested_end_date?: string;
}

/** Bản ghi `Production Standard` — định mức thời gian, nguồn duy nhất của phép lập tải. */
export interface ProductionStandardFacts extends Json {
  name?: string;
  department?: string;
  door_type?: string;
  operation?: string;
  minutes_per_set?: number;
  minutes_per_unit?: number;
  capacity_basis?: string;
  batch_capacity?: number;
  persons?: number;
  shift_hours?: number;
  efficiency?: number;
  default_overtime_hours?: number;
  workstation?: string;
  disabled?: unknown;
}

/**
 * Cơ sở định mức mà `Production Standard` khai. Bỏ trống thì KHÔNG đoán: trả `undefined` để màn
 * bắt người dùng chọn, vì chọn sai trục (m² thay vì bộ) là ra một con số tải sai hoàn toàn.
 */
export function capacityBasisOf(value: unknown): CapacityBasis | undefined {
  const key = text(value);
  return key === "m2" || key === "set" || key === "operation" || key === "batch" ? key : undefined;
}

/* ────────────────────────────────────────────────────────────────────────────
 * 6. Ảnh chụp công thức nằm trên lệnh (`Work Order.formula_snapshot`)
 * Được sinh ở sales-production-core.ts:881 và mang theo `sales_mode`,
 * `bom_actual_components`, `billable_area_sqm`, `leaf` — những fact mà bảng field
 * của Work Order không có ô riêng để chứa.
 * ──────────────────────────────────────────────────────────────────────────── */

export interface WorkOrderFormulaSnapshotLeaf extends Json {
  leaf_count?: number | null;
  single_layer_leaf_count?: number | null;
  double_layer_leaf_count?: number | null;
  leaf_variant?: string | null;
  leaf_formula?: string | null;
  explanation?: string;
}

export interface WorkOrderActualComponent extends Json {
  component_key?: string;
  item_code?: string;
  qty?: number;
  source_row?: number;
  note?: string;
}

export interface WorkOrderFormulaSnapshot extends Json {
  schema_version?: number;
  sales_order?: string;
  sales_order_row_id?: string;
  request_line_key?: string;
  item_code?: string;
  item_group?: string;
  door_type?: string;
  customer_group?: string;
  sales_mode?: string;
  width_m?: number;
  height_m?: number;
  mesh_height_m?: number | null;
  set_no?: number;
  formula_policy?: string;
  formula_version?: string;
  width_basis?: string;
  cut_width_m?: number;
  billable_area_sqm?: number;
  leaf?: WorkOrderFormulaSnapshotLeaf;
  estimated_weight_kg?: number | null;
  estimated_minutes?: number;
  /**
   * Cảnh báo vượt công suất từ `Production Standard` (S5,
   * `docs/audits/ALUMDOOR-SAN-XUAT-KE-TOAN-DANH-MUC-GAP-20260821.md`) — server dựng lúc lập lệnh,
   * ghi vào đây từ 21/08/2026 để Workbench đọc lại được thay vì bị vứt sau khi tạo lệnh.
   */
  schedule_warning?: string | null;
  bom_actual_components?: WorkOrderActualComponent[];
  ray_type?: string | null;
  geometry_applied_rules?: string[];
}

export interface ParsedFormulaSnapshot {
  snapshot: WorkOrderFormulaSnapshot | null;
  /** Có bản chụp nhưng đọc không ra — phải nói, không được im lặng coi như không có. */
  parseError: string;
}

export function parseFormulaSnapshot(raw: unknown): ParsedFormulaSnapshot {
  const source = text(raw);
  if (!source) return { snapshot: null, parseError: "" };
  try {
    const parsed: unknown = JSON.parse(source);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { snapshot: null, parseError: "Ảnh chụp công thức trên lệnh không phải một đối tượng JSON." };
    }
    return { snapshot: parsed as WorkOrderFormulaSnapshot, parseError: "" };
  } catch (error) {
    return {
      snapshot: null,
      parseError: `Không đọc được ảnh chụp công thức trên lệnh: ${error instanceof Error ? error.message : "JSON hỏng"}.`,
    };
  }
}

/* ────────────────────────────────────────────────────────────────────────────
 * 7. Dòng cấu phần đã ghép — thứ bảng trên màn thực sự vẽ
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * Vì sao mã cấu phần lại KHÔNG có Item nào.
 *
 * `AGENTS.md` mục "Chỗ đang đỏ": 207/230 mã cấu phần của bảng ĐM không khớp Item nào, trong đó
 * 88 mã phải người quyết. Màn này KHÔNG được đoán hộ. Nó chỉ được phép nói ra bốn trạng thái
 * dưới đây và để nguyên mã gốc cho người đọc.
 */
export type ComponentResolution =
  /** Mã giải được sang một Item đang dùng. */
  | "RESOLVED"
  /** Mã giải được nhưng Item đã Ngừng kinh doanh — vẫn cấp được hàng cũ, nhưng phải biết. */
  | "DISABLED_ITEM"
  /** Mã KHÔNG khớp Item nào trong danh mục. Ghi sổ lệnh sẽ bị nền tảng từ chối. */
  | "NO_ITEM"
  /** Chưa đọc xong danh mục — chưa kết luận được, và cũng không được vờ như đã kết luận. */
  | "UNKNOWN";

export interface WorkOrderComponentRow {
  key: string;
  order: number;
  /** Khoá ghép với `required_items[].row_id` và `material_rows[].bom_row_id`. */
  row_id: string;
  /** Mã ghi trên định mức — hiện NGUYÊN VĂN, kể cả khi không giải được. */
  item_code: string;
  resolution: ComponentResolution;
  item: ItemFacts | undefined;
  /** SL khai trên dòng BOM (cho `Bill of Materials.quantity` thành phẩm), chỉ để đối chiếu. */
  bom_qty: number | undefined;
  bom_uom: string;
  qty_basis: string;
  color: string;
  color_from: "" | "row" | "bom";
  source_warehouse: string;
  note: string;
  /** SL cần cho ĐÚNG lệnh này — do controller nền tảng nhân sẵn, client không tự nhân. */
  required_qty: number | undefined;
  issued_qty: number | undefined;
  consumed_qty: number | undefined;
  remaining_to_issue: number | undefined;
  remaining_to_consume: number | undefined;
  /** Tồn đọc từ report `Stock Balance`; `undefined` = chưa đọc được, KHÁC với 0. */
  stock_qty: number | undefined;
  /** Dòng chỉ có ở một phía: định mức đã đổi sau khi lệnh được lập. */
  only_in: "" | "BOM" | "WORK_ORDER";
}

export function stockKey(itemCode: unknown, warehouse: unknown): string {
  return `${text(itemCode)}@@${text(warehouse)}`;
}

/** Đúng luật đặt row_id của controller nền tảng: `row.row_id || ROW-{index+1}`. */
export function bomRowId(row: { row_id?: unknown }, index: number): string {
  return text(row.row_id) || `ROW-${index + 1}`;
}

function resolutionOf(itemCode: string, items: Map<string, ItemFacts>, catalogRead: boolean): ComponentResolution {
  if (!catalogRead || !itemCode) return "UNKNOWN";
  const found = items.get(itemCode);
  if (!found) return "NO_ITEM";
  const disabled = found.disabled === true || found.disabled === 1 || text(found.disabled) === "1";
  return disabled ? "DISABLED_ITEM" : "RESOLVED";
}

export interface BuildComponentRowsInput {
  /** `Bill of Materials.items` của `Work Order.bom_no`. Rỗng khi không đọc được BOM. */
  bomComponents: BomComponentSource[];
  /** `Bill of Materials.color` — màu áp cho cả định mức. */
  bomColor: string;
  /** `Work Order.required_items` — SL cần đã nhân theo SL lệnh. */
  requiredItems: WorkOrderRequiredItem[];
  /** `lifecycle.material_rows` — chỉ có khi lệnh đã ghi sổ. */
  progressRows: WorkOrderMaterialProgressRow[];
  /** Danh mục Item đã đọc được, key = mã hàng. */
  items: Map<string, ItemFacts>;
  /** Đã đọc xong danh mục chưa. Chưa thì không được kết luận "không khớp Item nào". */
  catalogRead: boolean;
  /** Tồn theo `stockKey(item_code, warehouse)`. */
  stock: Map<string, number>;
  /** Kho vật tư mặc định của lệnh, dùng khi dòng BOM không khai kho riêng. */
  defaultWarehouse: string;
}

/**
 * Ghép ba nguồn về một bảng: định mức gốc (BOM) · SL cần của lệnh (`required_items`) ·
 * tiến độ đã ghi sổ (`material_rows`). Khoá ghép là `row_id`, đúng luật controller nền tảng.
 *
 * KHÔNG dòng nào bị bỏ đi. Dòng chỉ có ở một phía được đánh dấu `only_in` để người đọc biết
 * định mức đã đổi sau khi lệnh được lập.
 */
export function buildComponentRows(input: BuildComponentRowsInput): WorkOrderComponentRow[] {
  const requiredByRow = new Map<string, WorkOrderRequiredItem>();
  input.requiredItems.forEach((row, index) => {
    requiredByRow.set(bomRowId(row, index), row);
  });
  const progressByRow = new Map<string, WorkOrderMaterialProgressRow>();
  for (const row of input.progressRows) {
    const key = text(row.bom_row_id);
    if (key) progressByRow.set(key, row);
  }

  const rows: WorkOrderComponentRow[] = [];
  const seen = new Set<string>();

  input.bomComponents.forEach((component, index) => {
    const rowId = bomRowId(component, index);
    seen.add(rowId);
    const required = requiredByRow.get(rowId);
    const progress = progressByRow.get(rowId);
    const itemCode = text(component.item_code) || text(required?.item_code);
    const warehouse = text(component.source_warehouse)
      || text(required?.source_warehouse)
      || text(progress?.source_warehouse)
      || input.defaultWarehouse;
    const rowColor = text(component.color);
    rows.push({
      key: `bom-${rowId}-${index}`,
      order: index + 1,
      row_id: rowId,
      item_code: itemCode,
      resolution: resolutionOf(itemCode, input.items, input.catalogRead),
      item: input.items.get(itemCode),
      bom_qty: numberValue(component.qty),
      bom_uom: text(component.uom),
      qty_basis: text(component.qty_basis),
      color: rowColor || input.bomColor,
      color_from: rowColor ? "row" : input.bomColor ? "bom" : "",
      source_warehouse: warehouse,
      note: text(component.note) || text(component.source_note),
      required_qty: numberValue(required?.required_qty) ?? numberValue(progress?.required_qty),
      issued_qty: numberValue(progress?.issued_qty),
      consumed_qty: numberValue(progress?.consumed_qty),
      remaining_to_issue: numberValue(progress?.remaining_to_issue),
      remaining_to_consume: numberValue(progress?.remaining_to_consume),
      stock_qty: input.stock.get(stockKey(itemCode, warehouse)),
      only_in: required ? "" : "BOM",
    });
  });

  // Dòng có trên ảnh chụp của LỆNH nhưng không còn trong BOM hiện tại: định mức đã bị sửa sau
  // khi lệnh được lập. Vẫn phải hiện — đó là thứ thợ sẽ thực sự đi lĩnh.
  input.requiredItems.forEach((required, index) => {
    const rowId = bomRowId(required, index);
    if (seen.has(rowId)) return;
    const progress = progressByRow.get(rowId);
    const itemCode = text(required.item_code);
    const warehouse = text(required.source_warehouse) || text(progress?.source_warehouse) || input.defaultWarehouse;
    rows.push({
      key: `wo-${rowId}-${index}`,
      order: rows.length + 1,
      row_id: rowId,
      item_code: itemCode,
      resolution: resolutionOf(itemCode, input.items, input.catalogRead),
      item: input.items.get(itemCode),
      bom_qty: undefined,
      bom_uom: "",
      qty_basis: "",
      color: input.bomColor,
      color_from: input.bomColor ? "bom" : "",
      source_warehouse: warehouse,
      note: "",
      required_qty: numberValue(required.required_qty) ?? numberValue(progress?.required_qty),
      issued_qty: numberValue(progress?.issued_qty),
      consumed_qty: numberValue(progress?.consumed_qty),
      remaining_to_issue: numberValue(progress?.remaining_to_issue),
      remaining_to_consume: numberValue(progress?.remaining_to_consume),
      stock_qty: input.stock.get(stockKey(itemCode, warehouse)),
      only_in: "WORK_ORDER",
    });
  });

  return rows;
}

/**
 * Còn THIẾU bao nhiêu so với tồn.
 *
 * Đây là hiệu số của HAI con số server (số còn phải cấp và tồn của report `Stock Balance`), không
 * phải một phép cộng sổ kho. Thiếu bất kỳ vế nào thì trả `undefined` để màn hiện "—", tuyệt đối
 * không rơi về 0.
 */
export function componentShortage(row: WorkOrderComponentRow): number | undefined {
  const need = row.remaining_to_issue ?? row.required_qty;
  if (need === undefined || row.stock_qty === undefined) return undefined;
  const gap = need - row.stock_qty;
  return gap > 0 ? gap : 0;
}

export function unresolvedComponents(rows: WorkOrderComponentRow[]): WorkOrderComponentRow[] {
  return rows.filter((row) => row.resolution === "NO_ITEM");
}

/* ────────────────────────────────────────────────────────────────────────────
 * 8. Nhãn tiếng Việt cho các trạng thái server trả về
 * ──────────────────────────────────────────────────────────────────────────── */

const STAGE_LABELS: Record<string, string> = {
  DRAFT: "Nháp",
  RELEASED: "Đã phát hành",
  MATERIAL_ISSUED: "Đã cấp vật tư",
  MANUFACTURING: "Đang sản xuất",
  PARTIAL_FINISHED_GOODS: "Nhập thành phẩm một phần",
  FINISHED_GOODS_COMPLETE: "Hoàn thành",
  CANCELLED: "Đã huỷ",
};

export function stageLabel(stage: unknown): string {
  const key = text(stage);
  return STAGE_LABELS[key] ?? key;
}

const AUTHORITY_LABELS: Record<string, string> = {
  PRODUCTION_REQUEST: "Yêu cầu sản xuất",
  PRODUCTION_PLAN: "Kế hoạch sản xuất",
  LEGACY_SALES_ORDER: "Đơn bán (đời cũ)",
  STANDALONE: "Lệnh độc lập",
};

export function releaseAuthorityLabel(value: unknown): string {
  const key = text(value);
  return AUTHORITY_LABELS[key] ?? key;
}

const WARNING_LABELS: Record<string, string> = {
  PRODUCED_QTY_EXCEEDS_WORK_ORDER_TARGET: "Đã nhập thành phẩm VƯỢT số lượng của lệnh.",
  LEGACY_WORK_ORDER_NO_REQUIRED_MATERIAL_SNAPSHOT:
    "Lệnh đã ghi sổ nhưng KHÔNG có ảnh chụp định mức trên chứng từ — không có số “cần bao nhiêu” để đối chiếu, và cũng không được suy ra hộ.",
  MIXED_PRODUCTION_REQUEST_AND_PRODUCTION_PLAN_AUTHORITY:
    "Lệnh gắn cùng lúc cả Yêu cầu sản xuất lẫn Kế hoạch sản xuất — hai nguồn phát hành mâu thuẫn.",
};

export function lifecycleWarningLabel(code: unknown): string {
  const key = text(code);
  return WARNING_LABELS[key] ?? key;
}

export function lineageLabel(lifecycle: WorkOrderLifecycle | null): string {
  if (!lifecycle) return "—";
  if (text(lifecycle.production_request)) {
    return `${text(lifecycle.production_request)}${text(lifecycle.production_request_line_key) ? ` · ${text(lifecycle.production_request_line_key)}` : ""}`;
  }
  if (text(lifecycle.production_plan)) {
    return `${text(lifecycle.production_plan)}${text(lifecycle.production_plan_row_id) ? ` · ${text(lifecycle.production_plan_row_id)}` : ""}`;
  }
  if (text(lifecycle.sales_order)) {
    return `${text(lifecycle.sales_order)}${text(lifecycle.sales_order_row_id) ? ` · ${text(lifecycle.sales_order_row_id)}` : ""}`;
  }
  return "Lệnh độc lập";
}

/* ────────────────────────────────────────────────────────────────────────────
 * 9. Đường điều hướng — giữ đúng hợp đồng bridge của `workspace-extension.tsx`
 * ──────────────────────────────────────────────────────────────────────────── */

export function documentPath(doctype: string, name: string): string {
  return `/app/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`;
}

export function listPathWithFilter(doctype: string, key: string, value: string): string {
  return `/app/${encodeURIComponent(doctype)}?${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
}

/**
 * Màn phiếu kho sản xuất được `workspace-extension.tsx` mở qua ĐÚNG hai tham số bridge
 * `f_work_order` + `f_purpose`. Giữ nguyên khuôn này để hợp đồng điều hướng không đổi.
 */
export function manufacturingStockEntryPath(
  workOrder: string,
  purpose: "Material Transfer" | "Manufacture",
): string {
  return `/app/${encodeURIComponent("Stock Entry")}?f_work_order=${encodeURIComponent(workOrder)}&f_purpose=${encodeURIComponent(purpose)}`;
}

export function percentOf(part: unknown, whole: unknown): number {
  const partValue = numberValue(part) ?? 0;
  const wholeValue = numberValue(whole) ?? 0;
  if (wholeValue <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((partValue * 100) / wholeValue)));
}

/** Số phút → “2 g 30 ph” cho người đọc xưởng. */
export function minutesLabel(value: unknown): string {
  const minutes = numberValue(value);
  if (minutes === undefined) return "—";
  const rounded = Math.round(minutes);
  const hours = Math.floor(rounded / 60);
  const rest = rounded % 60;
  if (!hours) return `${rest} ph`;
  return rest ? `${hours} g ${rest} ph` : `${hours} g`;
}

/** Số có thì định dạng, không có thì “—”. Không bao giờ trả 0 thay cho “chưa biết”. */
export function optionalQuantity(value: number | undefined): string {
  return value === undefined ? "—" : quantity(value);
}

/* ────────────────────────────────────────────────────────────────────────────
 * 8. Hợp đồng đọc từ `metaforge.manufacturing.get_work_order_cost_evidence` +
 *    `metaforge.manufacturing.get_work_order_genealogy` (S4 gộp — hai finding P1 cùng gốc:
 *    docs/audits/ALUMDOOR-SAN-XUAT-KE-TOAN-DANH-MUC-GAP-20260821.md §S4 và
 *    docs/audits/ALUMDOOR-SAN-XUAT-SAU-VONG2-20260821.md §S4).
 *    Chữ ký thật: server/apps/tenant-worker/src/manufacturing-costing-api.ts (COST_PATH)
 *               + server/packages/clouderp-erpnext/src/manufacturing-costing-read.ts
 *               + server/apps/tenant-worker/src/manufacturing-genealogy-api.ts
 *               + server/packages/clouderp-erpnext/src/manufacturing-genealogy.ts
 * ──────────────────────────────────────────────────────────────────────────── */

/** `ManufacturingCostEvidence` — đọc-chỉ, KHÔNG có bút toán nào phát sinh từ việc gọi route này. */
export interface WorkOrderCostEvidence extends Json {
  schema_version?: number;
  evidence_scope?: string;
  posting_status?: string;
  work_order?: string;
  company?: string;
  production_item?: string;
  bom_no?: string;
  bom_revision?: number;
  currency?: string;
  currency_scale?: number;
  target_qty?: string;
  produced_qty?: string;
  completion_pct?: string;
  standard_material_cost_minor?: number;
  standard_operating_cost_minor?: number;
  standard_total_cost_minor?: number;
  actual_consumption_value_minor?: number;
  actual_recovery_value_minor?: number;
  actual_net_material_cost_minor?: number;
  actual_finished_good_value_minor?: number;
  actual_accounted_output_value_minor?: number;
  implied_operating_cost_minor?: number;
  material_variance_minor?: number;
  operation_variance_minor?: number;
  total_variance_minor?: number;
  actual_operation_cost_source?: string;
  warnings?: string[];
  genealogy_warnings?: string[];
}

export type GenealogyMovementRole =
  | "Material Transfer Out" | "WIP Transfer In" | "Consumption" | "Finished Good" | "Scrap" | "Offcut" | "Recovery";

export interface WorkOrderGenealogyMovement extends Json {
  stock_entry?: string;
  purpose?: string;
  posting_at?: string;
  role?: GenealogyMovementRole;
  direction?: "Outward" | "Inward";
  item_code?: string;
  warehouse?: string;
  qty?: string;
  stock_value_difference_minor?: number;
  batch_no?: string;
  serial_no?: string;
}

export interface WorkOrderGenealogy extends Json {
  schema_version?: number;
  work_order?: string;
  company?: string;
  production_item?: string;
  bom_no?: string;
  target_qty?: string;
  effective_stock_entry_count?: number;
  cancelled_stock_entries?: string[];
  material_transfers?: WorkOrderGenealogyMovement[];
  consumptions?: WorkOrderGenealogyMovement[];
  finished_goods?: WorkOrderGenealogyMovement[];
  recoveries?: WorkOrderGenealogyMovement[];
  warnings?: string[];
}

/** `_minor` (số nguyên theo `currency_scale`) → chuỗi tiền đã định dạng. Thiếu scale thì KHÔNG đoán, trả “—”. */
export function moneyMinor(valueMinor: number | undefined, scale: number | undefined): string {
  if (valueMinor === undefined || scale === undefined || !Number.isFinite(scale)) return "—";
  return money(valueMinor / (10 ** scale));
}
