/** @jsxImportSource react */
/**
 * ChildGrid (M12) — bảng con cho field Table: render row của child DocType,
 * cột = field in_list_view của child, cell = control từ registry (inline edit), thêm/xoá row.
 * Data-driven từ child meta (KHÔNG hardcode).
 */
import { Fragment, useEffect, useRef, useState, type CSSProperties } from "react";
import { aiHeaders } from "../assistant/AssistantBubble.js";
import { ArrowDown, ArrowDownToLine, ArrowUp, Columns3, Copy, Maximize2, Pin, PinOff, Plus, RotateCcw, ScanLine, Trash2, Undo2, X } from "lucide-react";
import { resolveField, type DocTypeMeta, type DocField, type Doc } from "@metaforge/core";
import {
  BIG_WIDTH, EMPTY_LAYOUT, IDENTITY_WIDTH, type ChildGridProps, type GridLayout, childGridColumnLabel, defaultChildGridHiddenColumns, deriveAverageWeight, derivePurchaseOrderBarem, detailFieldSpan, dynamicLinkTarget, flexibleColumn, gridWidth, identityColumn, isLayout, parsePasted, resolveChildGridColumns, visibleColumns,
} from "./child-grid-columns.js";
// Giữ nguyên bề mặt export của ChildGrid: những tên này vốn được export từ đây.
export {
  defaultChildGridHiddenColumns, deriveAverageWeight, derivePurchaseOrderBarem, resolveChildGridColumns,
  type AverageWeightResult, type ChildGridProps,
} from "./child-grid-columns.js";
import { ControlRegistry, FallbackControl, type FieldServices } from "@metaforge/controls";
import {
  Button, Checkbox, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, FileButton, Input,
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell, useT,
} from "@metaforge/ui";
import { defaultSalesDiscountPercent, deriveLinearSalesBasis, isOrdinaryQuantitySalesItem, isWidthQuantitySalesItem, type LinearSalesBasis } from "./sales-line-policy.js";
export { defaultSalesDiscountPercent, deriveLinearSalesBasis, isOrdinaryQuantitySalesItem, isWidthQuantitySalesItem, type LinearSalesBasis } from "./sales-line-policy.js";
import {
  AREA_UOMS,
  COMPUTED_FROM,
  DOOR_FORMULA_INPUTS,
  DOOR_FORMULA_OUTPUTS,
  ITEM_DERIVED_FIELDS,
  SALES_ORDER_HIDDEN_FIELDS,
  SET_UOMS,
  childGridPolicyLabel,
  compactPolicyFields,
  deriveItemColorPolicy,
  deriveSalesQuantity,
  isAreaDoorSalesItem,
  isPurchaseGrid,
  isSalesOrderGrid,
  isSalesTransactionGrid,
  normalizedUom,
  resolveChildGridFieldPolicy,
  resolvePolicyColumns,
  salesSetCount,
  salesQuantityForRow as resolveSalesQuantityForRow,
  salesVisibilityOverride,
  type SalesQuantityPreview,
} from "./child-grid-policy.js";
export { deriveItemColorPolicy, deriveSalesQuantity, type SalesQuantityPolicy, type SalesQuantityPreview } from "./child-grid-policy.js";

export function ChildGrid(props: ChildGridProps) {
  const t = useT();
  const { childMeta, rows, onChange, registry, services, readOnly, parentDoc, roles, rowDefaults } = props;
  const [detailRow, setDetailRow] = useState<number | null>(null);
  const [allowedColorsByItem, setAllowedColorsByItem] = useState<Record<string, string[]>>({});
  const [colorPolicyByItem, setColorPolicyByItem] = useState<Record<string, { required: boolean; visible: boolean }>>({});
  const [allowedUomsByItem, setAllowedUomsByItem] = useState<Record<string, string[]>>({});
  /**
   * BẢNG LỚN — bảng con chiếm trọn màn hình để nhập, rồi quay lại chứng từ.
   *
   * Bảng gọn trong form chỉ đủ chỗ cho vài cột, nên với phiếu nhập nhôm (mã, màu, kg, khổ,
   * số cây, ĐVT, giá, kho) người nhập phải cuộn ngang liên tục và mất dấu dòng đang gõ.
   * Mở rộng bảng gọn ra thì lại đẩy các ô đầu phiếu xuống dưới màn hình.
   *
   * Nó vẫn là bảng con của chứng từ cha — cùng một mảng `rows`, cùng `onChange`. Không có
   * bước "lưu" riêng: đóng lại là thấy nguyên các dòng vừa nhập trong phiếu.
   */
  const [expanded, setExpanded] = useState(false);
  const [pickedRow, setPickedRow] = useState<number | null>(null);
  const [pickedColumn, setPickedColumn] = useState(0);
  const [selectedRows, setSelectedRows] = useState<string[]>([]);
  const [lastDeleted, setLastDeleted] = useState<Array<{ row: Doc; index: number }> | null>(null);
  const [columnSettingsOpen, setColumnSettingsOpen] = useState(false);
  const itemLoadVersion = useRef(new Map<string, number>());
  const automaticItemLoads = useRef(new Set<string>());
  // Bản ghi con đã lưu chỉ cần hydrate policy/link metadata lúc mở form. Không được tự ghi
  // patch trở lại form, nếu không RHF coi việc MỞ chứng từ là một lần sửa và bật nút Lưu.
  const persistedItemHydration = useRef(new Set<string>());
  const canonicalCols = resolveChildGridColumns(childMeta, rows, parentDoc, roles);
  const colorPolicies = rows
    .map((row) => colorPolicyByItem[String(row.item_code ?? "").trim()])
    .filter((policy): policy is { required: boolean; visible: boolean } => Boolean(policy));
  const policyAwareCanonicalCols: DocField[] = colorPolicies.length
    ? canonicalCols.map((field) => (field.fieldname === "color" || field.fieldname === "colour")
      ? {
          ...field,
          hidden: colorPolicies.some((policy) => policy.visible) ? 0 as const : 1 as const,
          depends_on: undefined,
        }
       : field)
    : canonicalCols;
  const hasSalesOption = rows.some((row) => String(row.sales_option ?? "").trim().length > 0);
  const applicableCanonicalCols = childMeta.name === "Sales Order Item" && !hasSalesOption
    ? policyAwareCanonicalCols.filter((field) => field.fieldname !== "sales_option")
    : policyAwareCanonicalCols;
  /**
   * Bảng bán gọn chỉ giữ hợp cột đang áp dụng cho ít nhất một dòng.
   *
   * Metadata `depends_on` mới là nguồn quyết định: chọn cửa thì rộng/cao/số bộ hiện; chọn
   * ray/trục thì dài/số cây hiện; phụ kiện không phải mang theo một dãy cột dấu “—”. Bảng
   * lớn vẫn giữ toàn bộ policy fields để nhập/dán nhiều dòng hỗn hợp.
   */
  const applicableSalesCols = !expanded && isSalesOrderGrid(childMeta)
     ? visibleColumns(applicableCanonicalCols, childMeta, rows, parentDoc, roles)
     : applicableCanonicalCols;
   /** Hai chế độ dùng chung dữ liệu, nhưng có mặc định và tùy chỉnh cột riêng. */
  const baseCols = applicableSalesCols.length ? applicableSalesCols : applicableCanonicalCols;
  const defaultHidden = defaultChildGridHiddenColumns(childMeta, baseCols, expanded);
  const defaultLayout = (): GridLayout => ({
    w: {},
    order: [],
    hidden: [...defaultHidden],
    pinned: [],
    labels: {},
  });

  /**
   * BỀ RỘNG VÀ THỨ TỰ CỘT do người dùng đặt, và NHỚ LẠI ở lần mở sau.
   *
   * Bề rộng mặc định ở đây chỉ là phỏng đoán từ kiểu field: nó không biết xưởng này ghi chú
   * dài hay ngắn, mã hàng của họ mấy ký tự, hay người nhập quen đọc cột nào trước. Chỉnh
   * được mà mở lại mất hết thì cũng như không chỉnh — nên lưu theo TỪNG doctype con và TỪNG
   * chế độ. Form mặc định gọn; bảng lớn mặc định đầy đủ, không để việc ẩn cột ở form làm mất
   * cột nghiệp vụ trong bảng lớn.
   *
   * Hỏng localStorage (chế độ riêng tư, hết quota) chỉ mất phần tuỳ chỉnh, bảng vẫn dựng
   * bằng mặc định — không được phép làm chết cả bảng vì một tiện ích.
   */
  // big-v3 resets the previous default order so the customer-approved purchase sequence is applied
  // even on browsers that already persisted the old big-table layout.
  // v5 bỏ kích thước kéo tay cũ: chúng được lưu trước khi bảng đơn có dòng chiết khấu,
  // khiến cột Số lượng/Chiết khấu phình ra dù schema mới đã có bề rộng chuẩn.
  const layoutKey = `mf-grid-layout:${childMeta.name}:${expanded ? "big-v5" : "compact-v5"}`;
  const [layout, setLayout] = useState<GridLayout>(() => ({ ...EMPTY_LAYOUT, w: {}, order: [], hidden: [], pinned: [], labels: {} }));
  const loadedKey = useRef("");
  if (loadedKey.current !== layoutKey) {
    loadedKey.current = layoutKey;
    try {
      const saved = localStorage.getItem(layoutKey);
      const parsed = saved ? JSON.parse(saved) as Partial<GridLayout> : {};
      const defaults = defaultLayout();
      layout.w = parsed.w ?? defaults.w;
      layout.order = parsed.order ?? defaults.order;
      layout.hidden = parsed.hidden ?? defaults.hidden;
      layout.pinned = parsed.pinned ?? defaults.pinned;
      layout.labels = parsed.labels ?? defaults.labels;
    } catch { /* không có thì dùng mặc định */ }
  }
  const saveLayout = (next: GridLayout) => {
    setLayout(next);
    try { localStorage.setItem(layoutKey, JSON.stringify(next)); } catch { /* hết quota — vẫn dùng được trong phiên */ }
  };
  const resetLayout = () => saveLayout(defaultLayout());
  const hiddenIsDefault = layout.hidden.length === defaultHidden.length
    && defaultHidden.every((fieldname) => layout.hidden.includes(fieldname));
  const hasCustomLayout = Boolean(
    layout.order.length
    || Object.keys(layout.w).length
    || layout.pinned.length
    || Object.keys(layout.labels).length
    || !hiddenIsDefault,
  );

  // Cột người dùng đã xếp lên trước; cột chưa từng xếp giữ nguyên thứ tự gốc ở phía sau, nên
  // một cột MỚI thêm vào doctype vẫn xuất hiện thay vì biến mất vì không có trong thứ tự cũ.
  const baseIdentity = identityColumn(baseCols);
  const orderedCols = layout.order.length
    ? [
        ...layout.order.map((name) => baseCols.find((c) => c.fieldname === name)).filter((c): c is DocField => Boolean(c)),
        ...baseCols.filter((c) => !layout.order.includes(c.fieldname)),
      ]
    : baseCols;
  const cols = orderedCols.filter((column) => column.fieldname === baseIdentity
    || (!layout.hidden.includes(column.fieldname)
      && !(childMeta.name === "Sales Order Item" && SALES_ORDER_HIDDEN_FIELDS.has(column.fieldname))));
  const formulaLoadVersion = useRef(new Map<string, number>());
  const previousFormulaGroup = useRef("");
  const previousSellingContext = useRef("");
  const formulaGroupReady = useRef(false);
  const sellingContextReady = useRef(false);
  const latestRows = useRef(rows);
  useEffect(() => {
    latestRows.current = rows;
  }, [rows]);
  const emitRows = (next: Doc[]) => {
    latestRows.current = next;
    onChange(next);
  };
  const identity = identityColumn(cols);
  const flexible = flexibleColumn(cols, identity);
  const columnWidth = (column: DocField): string => {
    const custom = layout.w[column.fieldname];
    if (custom) return `${custom}rem`;               // người dùng đã kéo — luôn thắng mặc định
    return expanded
      ? (BIG_WIDTH[column.fieldname] ?? "")          // rỗng ⇒ cột co giãn, chia phần còn lại
      : column.fieldname === identity ? IDENTITY_WIDTH : gridWidth(column);
  };
  /**
   * Bảng RỘNG BẰNG TỔNG CÁC CỘT, rồi mới cuộn — chứ không ép mọi cột vào khung.
   *
   * `w-full` một mình có nghĩa "không bao giờ rộng hơn khung", nên `overflow-x-auto` bọc
   * ngoài không bao giờ có gì để cuộn: bảng tự bóp lại cho vừa, và thứ bị bóp là cột không
   * khai bề rộng. Khai `min-width` bằng đúng tổng các cột thì bảng mới thật sự tràn, thanh
   * cuộn mới xuất hiện, và mỗi cột giữ được bề rộng đã tính cho nó.
   */
  const minWidthRem = 2.5 + (readOnly ? 0 : 7)
    + cols.reduce((sum, column) => sum + (Number.parseFloat(columnWidth(column)) || 0), 0);
  const pinnedOffsets = new Map<string, number>();
  let pinnedLeft = readOnly ? 2.5 : 5;
  for (const column of cols) {
    if (column.fieldname !== identity && !layout.pinned.includes(column.fieldname)) continue;
    pinnedOffsets.set(column.fieldname, pinnedLeft);
    pinnedLeft += Number.parseFloat(columnWidth(column) || gridWidth(column)) || 8;
  }
  const stickyColumn = (fieldname: string, header = false) => {
    const left = pinnedOffsets.get(fieldname);
    return {
      className: left === undefined ? "" : `sticky ${header ? "z-30" : "z-10"} bg-card shadow-[inset_-1px_0_0_var(--border)]`,
      style: left === undefined ? undefined : { left: `${left}rem` },
    };
  };

  /**
   * Các field dòng TỰ TÍNH được, tính ngay khi gõ.
   *
   * Server vẫn là nơi quyết định con số cuối cùng (`calculateSalesTotals` tính lại toàn bộ
   * khi lưu, theo đơn vị nhỏ nhất). Nhưng nếu ô "Thành tiền" trống suốt lúc nhập thì người
   * bán không soát được gì cho tới khi bấm lưu — mà một dòng sai đơn giá chỉ lộ ra ở tổng
   * đơn, lúc đã muộn. Nên tính ở client để NHÌN, và vẫn để server tính lại để TIN.
   *
   * Quy ước theo tên field, cùng lối với `fillItemDefaults` ngay dưới: dòng nào có đủ
   * `qty` và `rate` và có ô `amount` thì `amount = qty × rate`. Không có đủ ba thì không
   * làm gì — không đoán, không ghi đè field người dùng tự nhập.
   */
  const childFieldnames = new Set((childMeta.fields ?? []).map((field) => field.fieldname));
  const salesQuantityForRow = (row: Doc): SalesQuantityPreview => resolveSalesQuantityForRow(row, childFieldnames);
  /** Business presentation rules live outside the generic renderer. */
  const fieldForRow = (field: DocField, row: Doc): DocField => resolveChildGridFieldPolicy(field, row, {
    childMeta,
    parentDoc,
    childFieldnames,
    allowedUomsByItem,
    allowedColorsByItem,
    colorPolicyByItem,
  });
  const withComputed = (row: Doc): Doc => {
    const has = (f: string) => (childMeta.fields ?? []).some((x) => x.fieldname === f);
    let next = { ...row };
    if (has("theoretical_kg") && next.inventory_mode === "Nhôm cây/lá") {
      const baremKg = derivePurchaseOrderBarem(next);
      if (baremKg !== undefined) {
        next.theoretical_kg = baremKg;
        if (has("qty")) next.qty = baremKg;
      } else {
        next.theoretical_kg = undefined;
        if (has("qty")) next.qty = undefined;
      }
    }
    if (isSalesTransactionGrid(childMeta) && has("qty")) {
      const preview = salesQuantityForRow(next);
      if (preview.derived) {
        const quantity = preview.quantity == null
          ? undefined
          : Number(preview.quantity.toFixed(6));
        // Door quantity is resolved asynchronously from the authoritative
        // cutting policy. Keep the last confirmed value while that request is
        // pending; otherwise editing width/height briefly clears the field and
        // a failed/stale request makes the calculated quantity disappear.
        if (quantity !== undefined) {
          next.qty = quantity;
        } else {
          const width = Number(next.width_m);
          const height = Number(next.height_m);
          const hasDimensions = Number.isFinite(width) && width > 0
            && Number.isFinite(height) && height > 0;
          if (!hasDimensions) next.qty = undefined;
        }

        // Cửa có thể tính tiền theo m² nhưng tồn theo Bộ. Hệ số của từng dòng phụ thuộc
        // diện tích đã chốt, nên đây là snapshot động; ray/trục vẫn dùng hệ số Item bình thường.
        if (next.inventory_mode === "Thành phẩm theo m2"
          && AREA_UOMS.has(normalizedUom(next.uom))
          && SET_UOMS.has(normalizedUom(next.stock_uom))) {
          const sets = salesSetCount(next);
          if (quantity) {
            if (sets && has("conversion_factor")) next.conversion_factor = sets / quantity;
            if (sets && has("stock_qty")) next.stock_qty = sets;
          } else if (has("stock_qty")) {
            next.stock_qty = undefined;
          }
        }
      }
    }
    /**
     * Nhôm giữ HAI sự thật nhưng không trộn chúng:
     *
     *   - `qty` là kg thực cân — đơn vị tồn và đơn vị tính tiền;
     *   - `qty_bar × length_m` là hình dáng vật lý để biết có cắt được hay không.
     *
     * Vì vậy KHÔNG lấy cây ÷ kg làm hệ số kho. Hai con số dẫn xuất dưới đây chỉ mô tả lô;
     * Stock Ledger vẫn nhận nguyên số kg với hệ số 1.
     */
    /**
     * Chỉ tính khi đã xác định được TỔNG KG thật: `qty` nếu ĐVT là Kg, nếu không phải dùng ô
     * `actual_weight_kg`. Nhờ đó số lượng Bộ/Cái không bao giờ bị lấy nhầm làm trọng lượng.
     */
    if (has("actual_kg_per_m") || has("actual_kg_per_sqm") || has("total_length_m")) {
      const derived = deriveAverageWeight(next);
      next = {
        ...next,
        ...(has("total_length_m") ? { total_length_m: derived.totalLengthM } : {}),
        ...(has("actual_kg_per_m")
          ? { actual_kg_per_m: derived.basis === "kg/m²" ? undefined : derived.averageWeight }
          : {}),
        ...(has("actual_kg_per_sqm")
          ? { actual_kg_per_sqm: derived.basis === "kg/m²" ? derived.averageWeight : undefined }
          : {}),
      };
    }
    if (has("stock_qty") && has("qty") && has("conversion_factor")) {
      const qty = Number(next.qty);
      const factor = Number(next.conversion_factor);
      if (Number.isFinite(qty) && qty > 0 && Number.isFinite(factor) && factor > 0) {
        next.stock_qty = qty * factor;
      } else next.stock_qty = undefined;
    }
    if (has("amount") && has("qty") && has("rate")) {
      const qty = Number(next.qty);
      const rate = Number(next.rate);
      if (Number.isFinite(qty) && qty > 0 && Number.isFinite(rate) && rate >= 0) {
        const standardAmount = Math.round(qty * rate);
        next.standard_amount = standardAmount;
        // Client may show gross immediately, but never derives policy money. Server response owns
        // discount_amount, adjustment_amount and net_amount.
        next.amount = standardAmount;
        if (next.net_amount == null) next.net_amount = standardAmount;
      }
      else next.amount = undefined;
    }
    return next;
  };

  const isDoorSalesGrid = isSalesTransactionGrid(childMeta);
  // Đơn bán Alumdoor nhập trực tiếp trên form để giữ luồng báo giá gọn; không mở
  // sang bảng lớn tách riêng. Các bảng nghiệp vụ khác vẫn giữ công cụ này.
  const allowLargeGrid = !isSalesOrderGrid(childMeta);

  /**
   * Tính ở Worker rồi chụp kết quả vào dòng. Client chỉ làm nhiệm vụ tự điền; cùng payload
   * sẽ được Worker tính lại khi lưu nên sửa DOM hay gọi API thẳng cũng không ghi được m2 sai.
   */
  const fillDoorFormula = async (
    rowIdx: number,
    base: Doc[],
    loadKey: string,
    loadVersion: number,
  ) => {
    if (!isDoorSalesGrid || !services?.callPost) return;
    let row = base[rowIdx];
    if (row && !row.inventory_mode && services.fetchDocument) {
      const itemMaster = await services.fetchDocument("Item", String(row.item_code ?? "")).catch(() => undefined);
      if (itemMaster?.inventory_mode) row = { ...row, inventory_mode: itemMaster.inventory_mode };
    }
    if (!row || row.inventory_mode !== "Thành phẩm theo m2" || !row.item_code) return;
    const width = Number(row.width_m);
    const height = Number(row.height_m);
    const normalizedUom = String(row.uom ?? "").trim().toLocaleLowerCase("vi");
    if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) return;
    if (!["m2", "m²", "sqm"].includes(normalizedUom)) return;
    try {
      const calculated = await services.callPost<Record<string, unknown>>("alumdoor.sales.production_line_context", {
        item_code: row.item_code,
        customer: parentDoc?.customer,
        customer_group: parentDoc?.customer_group,
        sales_mode: row.sales_mode ?? "Trọn bộ",
        has_butterfly_bracket: row.has_butterfly_bracket ?? 0,
        width_m: width,
        height_m: height,
        mesh_height_m: row.mesh_height_m,
        set_count: row.set_count ?? 1,
        leaf_variant: row.leaf_variant,
        leaf_divisor_m: row.leaf_divisor_m,
        single_layer_leaf_count: row.single_layer_leaf_count,
        purpose: "Bán hàng",
      });
      if (formulaLoadVersion.current.get(loadKey) !== loadVersion) return;
      if (calculated && typeof calculated === "object"
        && calculated.billable_area_sqm == null
        && typeof calculated.message === "string") {
        throw new Error(calculated.message);
      }
      const billable = Number(calculated.billable_area_sqm);
      const cutWidthM = Number(calculated.cut_width_m);
      if (!Number.isFinite(billable) || billable <= 0 || !Number.isFinite(cutWidthM) || cutWidthM <= 0) return;
      const has = (fieldname: string) => (childMeta.fields ?? []).some((field) => field.fieldname === fieldname);
      const currentRows = latestRows.current;
      const currentRowIdx = currentRows.findIndex((entry, index) => String(entry.name ?? index) === loadKey);
      if (currentRowIdx < 0) return;
      const currentRow = currentRows[currentRowIdx]!;
      const sets = Number(currentRow.set_count ?? 1);
      const patch: Record<string, unknown> = { qty: billable };
      if (has("formula_policy")) patch.formula_policy = calculated.policy_name;
      if (has("width_basis")) patch.width_basis = calculated.width_basis;
      if (has("cut_width_m")) patch.cut_width_m = cutWidthM;
      if (has("billable_area_sqm")) patch.billable_area_sqm = billable;
      for (const fieldname of [
        "door_type", "leaf_height_deduction_m", "leaf_divisor_m", "leaf_rounding", "leaf_count",
        "single_layer_leaf_count", "double_layer_leaf_count", "estimated_weight_kg", "estimated_minutes",
        "formula_version", "formula_explanation",
      ]) {
        if (has(fieldname) && calculated[fieldname] !== undefined && calculated[fieldname] !== null) patch[fieldname] = calculated[fieldname];
      }
      if (["bộ", "bo", "set"].includes(String(currentRow.stock_uom ?? "").trim().toLocaleLowerCase("vi"))
        && Number.isFinite(sets) && sets > 0) {
        if (has("conversion_factor")) patch.conversion_factor = sets / billable;
        if (has("stock_qty")) patch.stock_qty = sets;
      }
      const merged = currentRows.map((entry, index) => {
        if (index !== currentRowIdx) return entry;
        // `withComputed` vẫn phục vụ mọi app bằng công thức m2 chung. Áp snapshot của Worker
        // SAU nó để luật cửa thắng đúng tại app Alumdoor, rồi tính tiền từ qty đã chốt.
        const adjusted = { ...withComputed({ ...entry, ...patch }), ...patch } as Doc;
        const rate = Number(adjusted.rate);
        if ("amount" in adjusted && Number.isFinite(rate)) {
          const standardAmount = Math.round(billable * rate);
          adjusted.standard_amount = standardAmount;
          adjusted.amount = standardAmount;
          if (adjusted.net_amount == null) adjusted.net_amount = standardAmount;
        }
        return adjusted;
      });
      emitRows(merged);
    } catch (error) {
      // Không được giữ một m² tạm theo rộng × cao khi policy cửa chưa tính được. Con số đó
      // trông hợp lý nhưng có thể sai PB ray/PB nhựa; xoá kết quả để người dùng không báo giá
      // nhầm, còn validator vẫn nêu cùng lý do khi lưu/ghi sổ.
      if (formulaLoadVersion.current.get(loadKey) !== loadVersion) return;
      const currentRows = latestRows.current;
      const currentRowIdx = currentRows.findIndex((entry, index) => String(entry.name ?? index) === loadKey);
      if (currentRowIdx < 0) return;
      const message = error instanceof Error ? error.message : "Không tính được công thức cửa.";
      const resolvedMessage = (() => {
        if (error instanceof Error && error.message) return error.message;
        if (error && typeof error === "object") {
          const value = error as Record<string, unknown>;
          const response = value.response && typeof value.response === "object"
            ? value.response as Record<string, unknown>
            : undefined;
          const data = response?.data && typeof response.data === "object"
            ? response.data as Record<string, unknown>
            : undefined;
          const detail = value.message ?? data?.message ?? response?.message;
          if (detail) return String(detail);
        }
        return message;
      })();
      emitRows(currentRows.map((entry, index) => index === currentRowIdx ? {
        ...entry,
        // Một request cũ có thể lỗi sau khi request mới đã tính xong. Không được xoá
        // Số lượng/Thành tiền đã chụp chỉ vì lỗi trễ đó.
        // If the policy service is temporarily unavailable, keep a visible
        // area quantity instead of blanking the line. The server still
        // revalidates the policy snapshot when the order is saved.
        qty: entry.qty ?? (() => {
          const width = Number(entry.width_m);
          const height = Number(entry.height_m);
          const sets = Number(entry.set_count ?? 1);
          const fallback = width > 0 && height > 0 && sets > 0 ? width * height * sets : undefined;
          return fallback == null ? undefined : Number(fallback.toFixed(6));
        })(),
        amount: entry.amount ?? (() => {
          const width = Number(entry.width_m);
          const height = Number(entry.height_m);
          const sets = Number(entry.set_count ?? 1);
          const qty = width > 0 && height > 0 && sets > 0 ? width * height * sets : undefined;
          const rate = Number(entry.rate);
          return qty != null && Number.isFinite(rate) ? Math.round(qty * rate) : undefined;
        })(),
        billable_area_sqm: entry.billable_area_sqm,
        formula_policy: entry.formula_policy,
        formula_version: entry.formula_version,
        formula_explanation: `${resolvedMessage} Tạm tính theo rộng x cao trong lúc chờ chính sách.`,
        width_basis: entry.width_basis,
        cut_width_m: entry.cut_width_m,
      } : entry));
    }
  };

  const formulaCustomerGroup = String(parentDoc?.customer_group ?? "");
  useEffect(() => {
    // Lần render đầu chỉ chụp baseline từ document đã tải. Reprice/reformula chỉ chạy khi
    // người dùng thật sự đổi context sau đó, không chạy chỉ vì form vừa được mở.
    if (!formulaGroupReady.current) {
      formulaGroupReady.current = true;
      previousFormulaGroup.current = formulaCustomerGroup;
      return;
    }
    if (!formulaCustomerGroup || formulaCustomerGroup === previousFormulaGroup.current) return;
    previousFormulaGroup.current = formulaCustomerGroup;
    rows.forEach((row, rowIdx) => {
      const loadKey = String(row.name ?? rowIdx);
      const version = (formulaLoadVersion.current.get(loadKey) ?? 0) + 1;
      formulaLoadVersion.current.set(loadKey, version);
      void fillDoorFormula(rowIdx, rows, loadKey, version);
    });
    // Chỉ chạy lại khi nhóm khách đổi. Thêm `rows` sẽ tự tạo vòng lặp vì kết quả tính cũng
    // cập nhật rows; các thay đổi dòng đã được `setCell` xử lý riêng ngay bên dưới.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formulaCustomerGroup]);

  const sellingContextKey = [parentDoc?.selling_price_list, parentDoc?.currency].map((value) => String(value ?? "")).join("\u0000");
  useEffect(() => {
    if (!sellingContextReady.current) {
      sellingContextReady.current = true;
      previousSellingContext.current = sellingContextKey;
      return;
    }
    if (!isDoorSalesGrid || !sellingContextKey || sellingContextKey === previousSellingContext.current) return;
    previousSellingContext.current = sellingContextKey;
    rows.forEach((row, rowIdx) => {
      const itemCode = String(row.item_code ?? "").trim();
      if (!itemCode) return;
      const loadKey = String(row.name ?? rowIdx);
      const loadVersion = (itemLoadVersion.current.get(loadKey) ?? 0) + 1;
      itemLoadVersion.current.set(loadKey, loadVersion);
      void fillItemDefaults(rowIdx, itemCode, rows, loadKey, loadVersion);
    });
    // Item rows are refreshed by setCell; this effect is only for a header price-list/currency change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sellingContextKey]);

  const setCell = (rowIdx: number, fieldname: string, value: unknown) => {
    // Luôn ghép trên snapshot mới nhất. Hai ô số có thể phát onChange trước khi React render lại;
    // dùng prop `rows` cũ ở lần sửa sau sẽ làm mất giá trị người dùng vừa nhập ở lần trước.
    const currentRows = latestRows.current;
    // Mọi thao tác trên dòng đều làm kết quả công thức đang bay trở nên cũ. Tăng version ngay,
    // kể cả field vừa sửa không tham gia phép tính, để phản hồi chậm không ghi đè dữ liệu mới.
    const formulaKey = String(currentRows[rowIdx]?.name ?? rowIdx);
    const formulaVersion = (formulaLoadVersion.current.get(formulaKey) ?? 0) + 1;
    formulaLoadVersion.current.set(formulaKey, formulaVersion);
    if (["uom", "color", "colour"].includes(fieldname)) {
      const loadKey = String(currentRows[rowIdx]?.name ?? rowIdx);
      itemLoadVersion.current.set(loadKey, (itemLoadVersion.current.get(loadKey) ?? 0) + 1);
    }
    const next = currentRows.map((r, i) => {
      if (i !== rowIdx) return r;
      const changingItem = fieldname === "item_code" && value !== r.item_code;
      const selectedAreaDoor = changingItem && isAreaDoorSalesItem({ item_code: value });
      const reset = changingItem
        ? Object.fromEntries(ITEM_DERIVED_FIELDS.filter((name) => name in r).map((name) => [name, undefined]))
        : {};
      const resetDoorFormula = !changingItem
        && r.inventory_mode === "Thành phẩm theo m2"
        && DOOR_FORMULA_INPUTS.has(fieldname)
        ? Object.fromEntries(DOOR_FORMULA_OUTPUTS.filter((name) => name in r).map((name) => [name, undefined]))
        : {};
      const rateApproval = childMeta.name === "Sales Order Item" && fieldname === "rate"
        ? (() => {
            const entered = Number(value);
            const baseline = Number(r.standard_rate);
            if (!Number.isFinite(entered) || !Number.isFinite(baseline)) return false;
            return Math.abs(entered - baseline) > Math.max(0.000001, Math.abs(baseline) * 0.000001);
          })()
        : r.rate_requires_approval;
      const updated = {
        ...r,
        ...reset,
        ...resetDoorFormula,
        [fieldname]: value,
        // Không đợi lượt đọc Item nền mới cho người bán nhập kích thước cửa.
        // Lượt đọc đó vẫn ghi đè bằng snapshot master sau khi trả về.
        ...(selectedAreaDoor ? {
          inventory_mode: "Thành phẩm theo m2",
          uom: "m2",
          set_count: 1,
          sales_mode: "Trọn bộ",
        } : {}),
        ...(fieldname === "rate" ? { rate_requires_approval: rateApproval } : {}),
        // Hệ số thuộc về CẶP Item + UOM. Đổi một trong hai mà giữ hệ số cũ là cách tạo
        // tồn sai nhưng chứng từ vẫn hợp lệ, nên xoá để server tra lại từ master.
        ...((fieldname === "item_code" || fieldname === "uom") && "conversion_factor" in r
          ? { conversion_factor: undefined }
          : {}),
      };
      return COMPUTED_FROM.has(fieldname) ? withComputed(updated) : updated;
    }) as Doc[];
    emitRows(next);
    if (COMPUTED_FROM.has(fieldname) || (fieldname === "item_code" && isAreaDoorSalesItem(next[rowIdx] ?? {}))) {
      void fillDoorFormula(rowIdx, next, formulaKey, formulaVersion);
    }
    if (fieldname === "item_code" && value) {
      const loadKey = String(next[rowIdx]?.name ?? rowIdx);
      const loadVersion = (itemLoadVersion.current.get(loadKey) ?? 0) + 1;
      itemLoadVersion.current.set(loadKey, loadVersion);
      void fillItemDefaults(rowIdx, String(value), next, loadKey, loadVersion);
    } else if ((fieldname === "uom" || fieldname === "warehouse") && next[rowIdx]?.item_code) {
      const loadKey = String(next[rowIdx]?.name ?? rowIdx);
      const loadVersion = (itemLoadVersion.current.get(loadKey) ?? 0) + 1;
      itemLoadVersion.current.set(loadKey, loadVersion);
      void fillItemDefaults(rowIdx, String(next[rowIdx]!.item_code), next, loadKey, loadVersion);
    }
  };

  /**
   * Chọn mặt hàng xong thì tự điền ĐƠN VỊ TÍNH, tên và mô tả từ chính bản ghi Item.
   *
   * Trên ERPNext Desk việc này do client script gọi `get_item_details` làm; ta không chạy client
   * script của Frappe nên phải tự làm, nếu không thủ kho chọn hàng xong vẫn phải tự gõ đơn vị cho
   * TỪNG dòng — và gõ sai đơn vị thì số tồn sai theo (10 thùng ghi thành 10 cái).
   *
   * Nguyên tắc: CHỈ điền vào ô đang TRỐNG. Người dùng đã tự sửa đơn vị (mua theo thùng nhưng nhập
   * kho theo cái) thì không được đạp lên lựa chọn của họ.
   */
  /**
   * TÍNH phần cần điền cho một dòng, KHÔNG ghi.
   *
   * Tách khỏi phần ghi vì dán từ Excel cần điền NHIỀU dòng cùng lúc. Bản trước mỗi lần điền
   * tự gọi `onChange` với bản chụp `rows` của riêng nó; bắn 40 lời gọi song song thì cái về
   * sau cùng đè lên tất cả — dán 40 dòng chỉ có một dòng được điền, và đúng dòng nào thì tuỳ
   * mạng nhanh chậm.
   */
  const computeItemPatch = async (
    rowIdx: number,
    itemCode: string,
    base: Doc[],
  ): Promise<Record<string, unknown>> => {
    if (!services?.fetchValue && !services?.fetchDocument) return {};
    const has = (f: string) => (childMeta.fields ?? []).some((x) => x.fieldname === f);
    const item = services.fetchDocument
      ? await services.fetchDocument("Item", itemCode).catch(() => undefined)
      : undefined;
    const readItemValue = async (fieldname: string): Promise<unknown> => {
      // Form profile có thể lược bớt field khỏi document đã tải. Khi field đó trống, vẫn phải hỏi
      // riêng master value; nếu không ĐVT mua/tồn có dữ liệu nhưng bảng con chỉ hiện dấu "—".
      const documentValue = item?.[fieldname];
      if (documentValue !== undefined && documentValue !== null && documentValue !== "") return documentValue;
      return services?.fetchValue?.("Item", itemCode, fieldname).catch(() => undefined);
    };
    // nguồn trên Item → các ô đích trên dòng bảng con
    const plan: Array<[string, string[]]> = [
      ["stock_uom", ["stock_uom"]],
      ["sales_qty_basis", ["sales_qty_basis"]],
      ["inventory_mode", ["inventory_mode"]],
      ["measurement_profile", ["measurement_profile"]],
      ["material_specification", ["material_specification"]],
      ["item_name", ["item_name"]],
      ["description", ["description"]],
      ["default_color", ["color", "colour"]],
      ["min_area_sqm", ["min_area_sqm"]],
      ["door_type", ["door_type"]],
      ["purchase_kg_per_m2", ["purchase_kg_per_m2"]],
      ["leaf_divisor_m", ["leaf_divisor_m"]],
      ["standard_rate", ["rate"]],
    ];
    const patch: Record<string, unknown> = {};
    await Promise.all(plan.map(async ([src, dests]) => {
      const targets = dests.filter((d) => {
        if (!has(d)) return false;
        const current = base[rowIdx]?.[d];
        if (!current) return true;
        // Giá trị do bối cảnh mồi vào thì mặc định của MẶT HÀNG được quyền thay.
        return rowDefaults?.[d] !== undefined && current === rowDefaults[d];
      });
      if (targets.length === 0) return;
      const v = await readItemValue(src);
      if (v === undefined || v === null || v === "") return;
      for (const d of targets) patch[d] = v;
    }));
    let allowedColors: string[] = [];
    if (services?.callPost) {
      try {
        const colorContext = await services.callPost<Record<string, unknown>>("alumdoor.catalog.allowed_colors", {
          item_code: itemCode,
          usage_scope: isPurchaseGrid(childMeta)
            ? "purchase"
            : isSalesTransactionGrid(childMeta) ? "sales" : "internal",
        });
        allowedColors = Array.isArray(colorContext.allowed_colors)
          ? colorContext.allowed_colors.map((value) => String(value ?? "").trim()).filter(Boolean)
          : [];
      } catch {
        allowedColors = [];
      }
    }
    setAllowedColorsByItem((current) => (
      current[itemCode]?.join("\u0000") === allowedColors.join("\u0000")
        ? current
        : { ...current, [itemCode]: allowedColors }
    ));
    const inventoryMode = String(
      patch.inventory_mode ?? item?.inventory_mode ?? base[rowIdx]?.inventory_mode ?? "",
    ).normalize("NFC").trim();
    const profileName = String(
      patch.measurement_profile ?? item?.measurement_profile ?? base[rowIdx]?.measurement_profile ?? "",
    ).trim();
    const measurementProfile = profileName && services.fetchDocument
      ? await services.fetchDocument("Measurement Profile", profileName).catch(() => undefined)
      : undefined;
    const isTrucSalesItem = deriveLinearSalesBasis({
      ...base[rowIdx],
      item_code: itemCode,
      item_name: patch.item_name ?? item?.item_name,
    }) === "TRUC";
    const colorPolicy = isTrucSalesItem
      ? { required: false, visible: false }
      : deriveItemColorPolicy(
      inventoryMode,
      measurementProfile?.require_color,
      allowedColors.length,
    );
    setColorPolicyByItem((current) => {
      const previous = current[itemCode];
      return previous?.required === colorPolicy.required && previous.visible === colorPolicy.visible
        ? current
        : { ...current, [itemCode]: colorPolicy };
    });
    const currentColor = String(base[rowIdx]?.color ?? base[rowIdx]?.colour ?? "").trim();
    if (isTrucSalesItem || (currentColor && !allowedColors.includes(currentColor))) {
      if (has("color")) patch.color = undefined;
      if (has("colour")) patch.colour = undefined;
    }
    if (has("theoretical_kg_per_m")) {
      const specification = String(patch.material_specification ?? item?.material_specification ?? "").trim();
      if (specification && services.fetchDocument) {
        const spec = await services.fetchDocument("Material Specification", specification).catch(() => undefined);
        const kgPerM = Number(spec?.theoretical_kg_per_m);
        if (Number.isFinite(kgPerM) && kgPerM > 0) patch.theoretical_kg_per_m = kgPerM;
      }
    }

    /**
     * ĐVT giao dịch có ưu tiên theo NGỮ CẢNH, không đồng nhất với ĐVT tồn:
     *
     *   - mua: default_purchase_uom;
     *   - bán/giao: default_sales_uom;
     *   - chứng từ khác: stock_uom.
     *
     * Thiếu mặc định riêng mới lùi về ĐVT tồn. Không tự nhét hệ số 1: nếu mua theo Cây mà
     * tồn theo Mét, server phải lấy đúng bảng quy đổi trên Item.
     */
    if (has("uom") && !base[rowIdx]?.uom) {
      const lower = childMeta.name.toLowerCase();
      const source = lower.includes("purchase") || lower.includes("supplier")
        ? "default_purchase_uom"
        : lower.includes("sales") || lower.includes("quotation") || lower.includes("delivery")
          ? "default_sales_uom"
          : "stock_uom";
      const preferred = await readItemValue(source);
      const fallback = source === "stock_uom"
        ? preferred
        : preferred || await readItemValue("stock_uom");
      if (fallback !== undefined && fallback !== null && fallback !== "") patch.uom = fallback;
    }
    const transactionUom = String(patch.uom ?? base[rowIdx]?.uom ?? "").trim();
    const stockUom = String(patch.stock_uom ?? item?.stock_uom ?? "").trim();
    if (has("conversion_factor") && transactionUom && stockUom) {
      if (transactionUom === stockUom) patch.conversion_factor = 1;
      else {
        const conversions = Array.isArray(item?.uom_conversions) ? item.uom_conversions : [];
        const match = conversions.find((row) => Boolean(row) && typeof row === "object"
          && String((row as Record<string, unknown>).uom ?? "").trim() === transactionUom) as Record<string, unknown> | undefined;
        const factor = Number(match?.conversion_factor);
        if (Number.isFinite(factor) && factor > 0) patch.conversion_factor = factor;
      }
    }

    if (isDoorSalesGrid && services?.callPost) {
      try {
        const salesContext = await services.callPost<Record<string, unknown>>("alumdoor.sales.item_context", {
          item_code: itemCode,
          uom: patch.uom ?? base[rowIdx]?.uom,
          warehouse: patch.warehouse ?? base[rowIdx]?.warehouse,
          price_list: parentDoc?.selling_price_list,
          currency: parentDoc?.currency,
          qty: base[rowIdx]?.qty,
          sales_option: base[rowIdx]?.sales_option,
        });
        const allowedUoms = Array.isArray(salesContext.allowed_uoms)
          ? salesContext.allowed_uoms.map((value) => String(value ?? "").trim()).filter(Boolean)
          : [];
        setAllowedUomsByItem((current) => (
          current[itemCode]?.join("\u0000") === allowedUoms.join("\u0000")
            ? current
            : { ...current, [itemCode]: allowedUoms }
        ));
        // `sales.item_context` is the authoritative compact snapshot for a sales
        // line.  It is also the fallback when the generic Item form endpoint is
        // unavailable, so a newly selected item never stays as a blank line.
        for (const fieldname of ["inventory_mode", "measurement_profile", "stock_uom", "min_area_sqm", "default_color"]) {
          if (has(fieldname) && salesContext[fieldname] !== undefined && salesContext[fieldname] !== null) {
            patch[fieldname] = salesContext[fieldname];
          }
        }
        const selectedUom = String(salesContext.selected_uom ?? "").trim();
        if (has("uom") && selectedUom) patch.uom = selectedUom;
        const factor = Number(salesContext.conversion_factor);
        if (has("conversion_factor") && Number.isFinite(factor) && factor > 0) patch.conversion_factor = factor;
        if (has("available_qty")) patch.available_qty = salesContext.available_qty;
        if (has("available_stock_qty")) patch.available_stock_qty = salesContext.available_stock_qty;
        if (has("available_stock_uom")) patch.available_stock_uom = salesContext.stock_uom;
        if (has("availability_status")) patch.availability_status = salesContext.availability_status;
        for (const fieldname of ["door_type", "purchase_kg_per_m2", "leaf_divisor_m"]) {
          if (has(fieldname) && salesContext[fieldname] !== undefined && salesContext[fieldname] !== null) patch[fieldname] = salesContext[fieldname];
        }
        // Monetary discount/adjustment is resolved only by the canonical server Pricing Rule engine.
        if (parentDoc?.selling_price_list && has("rate")) {
          const baseline = salesContext.price_missing ? undefined : salesContext.rate;
          const entered = Number(base[rowIdx]?.rate);
          const previousBaseline = Number(base[rowIdx]?.standard_rate);
          const manuallyChanged = Number.isFinite(entered) && Number.isFinite(previousBaseline)
            && Math.abs(entered - previousBaseline) > Math.max(0.000001, Math.abs(previousBaseline) * 0.000001);
          patch.standard_rate = baseline;
          patch.rate_requires_approval = manuallyChanged;
          if (!manuallyChanged) patch.rate = baseline;
        }
      } catch {
        if (has("available_qty")) patch.available_qty = undefined;
        if (has("available_stock_qty")) patch.available_stock_qty = undefined;
        if (has("available_stock_uom")) patch.available_stock_uom = undefined;
        if (parentDoc?.selling_price_list && has("rate")) {
          patch.standard_rate = undefined;
          patch.rate = undefined;
          patch.rate_requires_approval = false;
        }
        if (has("availability_status")) patch.availability_status = "Không đọc được tồn / giá";
      }
    }
    // Item cũ có thể chưa khai inventory_mode trên master. Nếu dòng chứng từ đã có
    // snapshot hợp lệ thì giữ snapshot đó; chỉ fallback Hàng thường khi CẢ master lẫn dòng đều trống.
    if (has("inventory_mode") && !Object.hasOwn(patch, "inventory_mode") && !base[rowIdx]?.inventory_mode) {
      patch.inventory_mode = "Hàng thường";
    }
    const effectiveInventoryMode = String(patch.inventory_mode ?? base[rowIdx]?.inventory_mode ?? "");

    /**
     * Đổi từ một mã nhôm sang hàng thường phải xoá quy cách của mã cũ. Giữ lại các số này
     * sẽ tạo một dòng motor mang 51 cây × 8,5 m trong payload dù giao diện đã giấu chúng.
     */
    if (effectiveInventoryMode !== "Nhôm cây/lá") {
      for (const fieldname of [
        "length_m", "qty_bundle", "qty_bar", "so_no", "total_length_m", "actual_kg_per_m",
        "material_specification", "theoretical_kg_per_m", "theoretical_kg", "is_stamped",
      ]) {
        if (has(fieldname)) patch[fieldname] = undefined;
      }
    }
    if (effectiveInventoryMode !== "Tấm/Kính" && effectiveInventoryMode !== "Thành phẩm theo m2") {
      if (has("actual_kg_per_sqm")) patch.actual_kg_per_sqm = undefined;
    }
    return patch;
  };

  const fillItemDefaults = async (
    rowIdx: number,
    itemCode: string,
    base: Doc[],
    loadKey: string,
    loadVersion: number,
  ) => {
    const patch = await computeItemPatch(rowIdx, itemCode, base);
    // Người dùng đổi Item lần nữa trước khi các Link mặc định tải xong: kết quả cũ phải bị bỏ,
    // nếu không màu/UOM của mặt hàng trước sẽ chui vào dòng mới rồi bị server từ chối lúc lưu.
    if (itemLoadVersion.current.get(loadKey) !== loadVersion) return;
    if (Object.keys(patch).length === 0) return;
    const currentRows = latestRows.current;
    const currentRowIdx = currentRows.findIndex((entry, index) => String(entry.name ?? index) === loadKey);
    if (currentRowIdx < 0 || String(currentRows[currentRowIdx]?.item_code ?? "") !== itemCode) return;
    const currentRow = currentRows[currentRowIdx]!;
    // Master Item tải bất đồng bộ. Trong lúc chờ, người dùng có thể đã nhập SL/Đơn giá; chỉ tự điền
    // vào ô còn trống, còn các field phân loại thuộc chính Item luôn phải đồng bộ theo mã vừa chọn.
    const authoritativeItemFields = new Set([
      "stock_uom", "inventory_mode", "sales_qty_basis", "measurement_profile", "material_specification",
      "item_name", "description", "min_area_sqm", "theoretical_kg_per_m",
      "available_qty", "available_stock_qty", "available_stock_uom", "availability_status",
    ]);
    if (parentDoc?.selling_price_list) {
      authoritativeItemFields.add("standard_rate");
      authoritativeItemFields.add("rate_requires_approval");
      authoritativeItemFields.add("conversion_factor");
    }
    const safePatch = Object.fromEntries(Object.entries(patch).filter(([fieldname]) => {
      if (authoritativeItemFields.has(fieldname)) return true;
      const current = currentRow[fieldname];
      return current === undefined || current === null || current === ""
        || (rowDefaults?.[fieldname] !== undefined && current === rowDefaults[fieldname]);
    }));
    const merged = currentRows.map((r, i) => (i === currentRowIdx ? { ...r, ...safePatch } : r));
    // Đơn giá vừa mồi xong thì thành tiền phải theo ngay, không đợi người dùng chạm vào ô.
    const computed = merged.map((r, i) => (i === currentRowIdx ? withComputed(r) : r));
    emitRows(computed);
    const formulaVersion = (formulaLoadVersion.current.get(loadKey) ?? 0) + 1;
    formulaLoadVersion.current.set(loadKey, formulaVersion);
    void fillDoorFormula(currentRowIdx, computed, loadKey, formulaVersion);
  };

  /** Điền cho NHIỀU dòng rồi ghi MỘT lần — đường dán từ Excel đi lối này. */
  const fillItemDefaultsMany = async (indices: number[], base: Doc[]) => {
    const patches = await Promise.all(indices.map(async (at) =>
      [at, await computeItemPatch(at, String(base[at]?.item_code ?? ""), base)] as const));
    const byRow = new Map(patches.filter(([, p]) => Object.keys(p).length > 0));
    if (byRow.size === 0) return;
    const merged = base.map((r, i) => (byRow.has(i) ? withComputed({ ...r, ...byRow.get(i)! }) : r));
    emitRows(merged);
    for (const rowIdx of byRow.keys()) {
      const loadKey = String(merged[rowIdx]?.name ?? rowIdx);
      const version = (formulaLoadVersion.current.get(loadKey) ?? 0) + 1;
      formulaLoadVersion.current.set(loadKey, version);
      void fillDoorFormula(rowIdx, merged, loadKey, version);
    }
  };
  /**
   * Dòng mới mang sẵn giá trị mặc định của field và của BỐI CẢNH đang chọn.
   *
   * Trước đây dòng mới hoàn toàn trắng, nên thủ kho phải chọn lại đúng một cái kho cho từng
   * dòng, mỗi lần lập phiếu. Mặc định của field (`default` trong metadata) cũng bị bỏ qua ở
   * bảng con dù form cha vẫn dùng — hai chỗ cùng một khái niệm mà hành xử khác nhau.
   */
  /**
   * Link picker có thể trả mã hàng trước khi lượt lấy master đầu tiên hoàn tất. Nếu lượt đó bị
   * thay thế bởi một cập nhật cùng dòng, các cột quy cách đã mở nhưng định mức vẫn trống. Tự bù
   * lại theo trạng thái dòng: chỉ chạy khi đã có mã hàng mà chưa có kg/m và chặn request trùng.
   */
  useEffect(() => {
    const hasBaremField = (childMeta.fields ?? []).some((field) => field.fieldname === "theoretical_kg_per_m");
    const hasColorField = (childMeta.fields ?? []).some((field) => field.fieldname === "color" || field.fieldname === "colour");
    if (!hasBaremField && !hasColorField) return;
    rows.forEach((row, rowIdx) => {
      const itemCode = String(row.item_code ?? "").trim();
      const kgPerM = Number(row.theoretical_kg_per_m);
      const needsBarem = hasBaremField && !(Number.isFinite(kgPerM) && kgPerM > 0);
      const needsColorPolicy = hasColorField
        && !Object.prototype.hasOwnProperty.call(allowedColorsByItem, itemCode);
      if (!itemCode || (!needsBarem && !needsColorPolicy)) return;
      const loadKey = String(row.name ?? rowIdx);
      const requestKey = `${loadKey}:${itemCode}`;
      const persisted = typeof row.name === "string" && row.name.length > 0 && !row.name.startsWith("new-");
      if (persisted) {
        // Existing rows are server truth. Hydrate allowed-color/UOM policy for the picker, but
        // deliberately discard the returned patch so opening a document never mutates it.
        if (persistedItemHydration.current.has(requestKey)) return;
        persistedItemHydration.current.add(requestKey);
        void computeItemPatch(rowIdx, itemCode, rows).catch(() => undefined);
        return;
      }
      if (automaticItemLoads.current.has(requestKey)) return;
      automaticItemLoads.current.add(requestKey);
      const loadVersion = (itemLoadVersion.current.get(loadKey) ?? 0) + 1;
      itemLoadVersion.current.set(loadKey, loadVersion);
      void fillItemDefaults(rowIdx, itemCode, rows, loadKey, loadVersion)
        .finally(() => automaticItemLoads.current.delete(requestKey));
    });
    // `rows` là nguồn sự thật; service và metadata ổn định trong vòng đời bảng.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, allowedColorsByItem]);

  const nextSalesPackageComponentKey = (values: Doc[]) => {
    if (childMeta.name !== "Sales Package Item") return undefined;
    const used = new Set(values.map((row) => String(row.component_key ?? "").trim()).filter(Boolean));
    let sequence = 1;
    while (used.has(`MON-${String(sequence).padStart(3, "0")}`)) sequence += 1;
    return `MON-${String(sequence).padStart(3, "0")}`;
  };

  const addRow = () => {
    const seed: Doc = { name: `new-${Date.now()}`, doctype: childMeta.name } as Doc;
    for (const field of childMeta.fields ?? []) {
      if (isLayout(field.fieldtype)) continue;
      if (field.default != null && field.default !== "") seed[field.fieldname] = field.default;
    }
    for (const [fieldname, value] of Object.entries(rowDefaults ?? {})) {
      if (value == null || value === "") continue;
      if (!(childMeta.fields ?? []).some((f) => f.fieldname === fieldname)) continue;
      if (seed[fieldname] == null || seed[fieldname] === "") seed[fieldname] = value;
    }
    const componentKey = nextSalesPackageComponentKey(rows);
    if (componentKey) seed.component_key = componentKey;
    emitRows([...rows, seed]);
  };
  const deleteRows = (indices: number[]) => {
    const targets = new Set(indices.filter((index) => index >= 0 && index < rows.length));
    if (!targets.size) return;
    setLastDeleted(rows.flatMap((row, index) => targets.has(index) ? [{ row, index }] : []));
    emitRows(rows.filter((_, index) => !targets.has(index)));
    setSelectedRows([]);
    setPickedRow((current) => current == null ? null : Math.min(current, Math.max(0, rows.length - targets.size - 1)));
  };
  const delRow = (idx: number) => deleteRows([idx]);
  const undoDelete = () => {
    if (!lastDeleted?.length) return;
    const next = [...rows];
    for (const deleted of [...lastDeleted].sort((a, b) => a.index - b.index)) {
      next.splice(Math.min(deleted.index, next.length), 0, deleted.row);
    }
    emitRows(next);
    setLastDeleted(null);
  };
  const rowKey = (row: Doc, index: number) => String(row.name ?? index);
  const selectedSet = new Set(selectedRows);
  const toggleSelected = (row: Doc, index: number) => {
    const key = rowKey(row, index);
    setSelectedRows((current) => current.includes(key) ? current.filter((value) => value !== key) : [...current, key]);
  };
  const moveRows = (offset: -1 | 1) => {
    const selectedIndices = rows
      .map((row, index) => selectedSet.has(rowKey(row, index)) || (selectedRows.length === 0 && pickedRow === index) ? index : -1)
      .filter((index) => index >= 0);
    if (!selectedIndices.length) return;
    const moving = new Set(selectedIndices);
    const next = [...rows];
    const ordered = offset < 0 ? selectedIndices : [...selectedIndices].reverse();
    for (const index of ordered) {
      const target = index + offset;
      if (target < 0 || target >= next.length || moving.has(target)) continue;
      [next[index], next[target]] = [next[target]!, next[index]!];
      moving.delete(index);
      moving.add(target);
    }
    emitRows(next);
    if (pickedRow != null) setPickedRow(Math.min(next.length - 1, Math.max(0, pickedRow + offset)));
  };

  /**
   * Dòng TỔNG dưới chân bảng — cách MISA hiển thị chi tiết chứng từ.
   *
   * Tổng của cột tiền phải nhìn thấy NGAY dưới bảng, không phải đợi lưu rồi mới hiện ở ô
   * tổng của chứng từ. Người lập phiếu soát bằng cách so con số này với tờ hoá đơn trên
   * tay; bắt họ lưu trước rồi mới biết là bắt sửa sau khi đã ghi.
   *
   * Chỉ cộng cột SỐ, và chỉ khi có ít nhất một dòng — một hàng "Tổng: 0" dưới bảng rỗng là
   * nhiễu. Server vẫn tính lại toàn bộ khi lưu; đây là con số để NHÌN.
   */
  const numericColumns = cols.filter((c) => ["Currency", "Float", "Int", "Percent"].includes(c.fieldtype));
  const totals = new Map<string, number>();
  for (const column of numericColumns) {
    let sum = 0;
    let seen = false;
    for (const row of rows) {
      // Dòng hàng vẫn hiển thị Thành tiền chuẩn; riêng dòng tổng phải là số thực
      // khách cần thanh toán, tức trừ khoản chiết khấu đã hiện ở dòng phụ.
      const value = column.fieldname === "amount" && isSalesOrderGrid(childMeta)
        ? Number(row.amount) - Math.max(0, Number(row.discount_amount) || 0)
        : Number(row[column.fieldname]);
      if (Number.isFinite(value)) { sum += value; seen = true; }
    }
    if (seen) totals.set(column.fieldname, sum);
  }

  /** Nhân bản dòng — phiếu nhôm hay có 3–4 dòng chỉ khác nhau mỗi khổ và số cây. */
  const cloneRow = (idx: number) => {
    const source = rows[idx];
    if (!source) return;
    // Tên MỚI, không chép: hai dòng cùng `name` thì server coi là một, và dòng sau ghi đè dòng trước.
    const copy: Doc = { ...source, name: `new-${Date.now()}` };
    const componentKey = nextSalesPackageComponentKey(rows);
    if (componentKey) copy.component_key = componentKey;
    emitRows([...rows.slice(0, idx + 1), copy, ...rows.slice(idx + 1)]);
  };
  /**
   * Điền xuống — chỉ vào ô ĐANG TRỐNG của các dòng dưới.
   *
   * Cố ý không đè lên ô đã có giá trị: "điền xuống" mà ghi đè thì một lần bấm nhầm xoá sạch
   * số liệu đã gõ của cả bảng, và không có bước hoàn tác nào ở đây.
   */
  const fillDown = (idx: number) => {
    const source = rows[idx];
    if (!source) return;
    const carry = (childMeta.fields ?? [])
      .filter((f) => !isLayout(f.fieldtype) && f.fieldname !== "name")
      .map((f) => f.fieldname);
    emitRows(rows.map((row, i) => {
      if (i <= idx) return row;
      const next = { ...row };
      for (const f of carry) {
        const value = source[f];
        if (value == null || value === "") continue;
        if (next[f] == null || next[f] === "") next[f] = value;
      }
      return withComputed(next);
    }));
  };

  /** Thêm nhiều dòng một lúc — dán 40 dòng từ Excel mà bấm "thêm dòng" 40 lần thì thà gõ tay. */
  const addRows = (count: number) => {
    const seeds: Doc[] = [];
    for (let i = 0; i < count; i += 1) {
      const seed: Doc = { name: `new-${Date.now()}-${i}`, doctype: childMeta.name } as Doc;
      for (const field of childMeta.fields ?? []) {
        if (isLayout(field.fieldtype)) continue;
        if (field.default != null && field.default !== "") seed[field.fieldname] = field.default;
      }
      for (const [fieldname, value] of Object.entries(rowDefaults ?? {})) {
        if (value == null || value === "") continue;
        if (!(childMeta.fields ?? []).some((f) => f.fieldname === fieldname)) continue;
        if (seed[fieldname] == null || seed[fieldname] === "") seed[fieldname] = value;
      }
      const componentKey = nextSalesPackageComponentKey([...rows, ...seeds]);
      if (componentKey) seed.component_key = componentKey;
      seeds.push(seed);
    }
    emitRows([...rows, ...seeds]);
  };

  /**
   * DÁN TỪ EXCEL — cách xưởng thực sự nhập một phiếu 40 dòng.
   *
   * Phiếu giao của nhà cung cấp về dưới dạng file Excel; gõ lại từng ô là vừa chậm vừa sai.
   * Trình duyệt đưa vùng chọn của Excel sang clipboard dưới dạng TSV, nên chỉ cần tách theo
   * tab và xuống dòng rồi xếp vào ĐÚNG THỨ TỰ CỘT đang hiện.
   *
   * Dán GHI ĐÈ từ dòng đang chọn xuống, và tự nối thêm dòng nếu clipboard dài hơn bảng —
   * dán 40 dòng vào bảng trống mà phải bấm thêm dòng trước thì cũng như không có tính năng.
   * Ô trống trong Excel KHÔNG xoá giá trị đang có (xem `parsePasted`).
   */
  const onPasteGrid = (event: React.ClipboardEvent<HTMLDivElement>) => {
    if (readOnly) return;
    const text = event.clipboardData.getData("text/plain");
    if (!text || !/[\t\n]/.test(text)) return;   // một ô đơn lẻ: để trình duyệt dán như thường
    event.preventDefault();
    const matrix = text.replace(/\r/g, "").replace(/\n$/, "").split("\n").map((line) => line.split("\t"));
    const start = pickedRow ?? 0;
    const startColumn = Math.min(pickedColumn, Math.max(0, cols.length - 1));
    const next = [...rows];
    const needFill: number[] = [];
    matrix.forEach((cells, i) => {
      const at = start + i;
      if (!next[at]) {
        const seed: Doc = { name: `new-${Date.now()}-${at}`, doctype: childMeta.name } as Doc;
        for (const [fieldname, value] of Object.entries(rowDefaults ?? {})) {
          if (value != null && value !== "" && (childMeta.fields ?? []).some((f) => f.fieldname === fieldname)) seed[fieldname] = value;
        }
        next[at] = seed;
      }
      const row = { ...next[at]! };
      const before = row.item_code;
      cells.forEach((cell, c) => {
        const column = cols[startColumn + c];
        if (!column) return;
        const value = parsePasted(column, cell);
        if (value !== undefined) row[column.fieldname] = value;
      });
      if (row.item_code && row.item_code !== before) needFill.push(at);
      next[at] = withComputed(row);
    });
    emitRows(next);
    /**
     * Dán mã hàng phải kéo theo tên hàng, ĐVT, giá — y như chọn bằng ô Link.
     *
     * Bản đầu chỉ ghi thẳng giá trị vào dòng, nên dán xong cột "Tên hàng" và "ĐVT" đứng im:
     * chúng là ô MÁY điền, không gõ vào được, và cái điền chúng (`fillItemDefaults`) chỉ chạy
     * trong `setCell`. Kết quả là dán vào thì được một bảng mã hàng trơ trọi — đúng thứ mà
     * dán từ Excel sinh ra để khỏi phải làm.
     */
    if (needFill.length) void fillItemDefaultsMany(needFill, next);
  };

  /**
   * DI CHUYỂN BẰNG PHÍM như Excel: ↑ ↓ ← →, Enter xuống dòng, Tab sang phải.
   *
   * Không dựng lại một lưới ô riêng — mỗi ô ở đây là một control thật (Link có tìm kiếm,
   * Select có danh sách), thứ mà một lưới text thuần không thay được. Chỉ chuyển TIÊU ĐIỂM
   * giữa các ô, bằng cách hỏi DOM ô kế tiếp qua `data-cell`.
   *
   * Bỏ qua khi ô đang mở danh sách (`aria-expanded`): lúc đó mũi tên thuộc về danh sách đó,
   * cướp nó đi thì không chọn nổi mặt hàng bằng bàn phím nữa.
   */
  const gridRef = useRef<HTMLDivElement>(null);
  const focusCell = (r: number, c: number) => {
    const cell = gridRef.current?.querySelector<HTMLElement>(`[data-cell="${r}:${c}"]`);
    const target = cell?.querySelector<HTMLElement>("input,button,textarea,select,[tabindex]") ?? cell;
    target?.focus();
    if (target instanceof HTMLInputElement) target.select();
  };
  const onGridKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (readOnly) return;
    const holder = (event.target as HTMLElement).closest<HTMLElement>("[data-cell]");
    if (!holder) return;
    if (holder.querySelector('[aria-expanded="true"]')) return;
    const [r, c] = holder.dataset.cell!.split(":").map(Number) as [number, number];
    const go = (dr: number, dc: number) => {
      const nr = Math.min(Math.max(r + dr, 0), rows.length - 1);
      const nc = Math.min(Math.max(c + dc, 0), cols.length - 1);
      if (nr === r && nc === c) return;
      event.preventDefault();
      focusCell(nr, nc);
    };
    if (event.key === "ArrowDown" || (event.key === "Enter" && !event.shiftKey)) go(1, 0);
    else if (event.key === "ArrowUp" || (event.key === "Enter" && event.shiftKey)) go(-1, 0);
    else if (event.key === "Tab" && !event.shiftKey) {
      if (c < cols.length - 1) go(0, 1);
      else if (r < rows.length - 1) { event.preventDefault(); focusCell(r + 1, 0); }
    } else if (event.key === "Tab" && event.shiftKey) {
      if (c > 0) go(0, -1);
      else if (r > 0) { event.preventDefault(); focusCell(r - 1, cols.length - 1); }
    }
    else if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      // Trong ô chữ, ← → phải là di chuyển con trỏ TRONG chữ, không phải nhảy ô.
      const input = event.target as HTMLInputElement;
      const atEdge = !("selectionStart" in input) || (event.key === "ArrowRight"
        ? input.selectionStart === String(input.value ?? "").length
        : input.selectionStart === 0);
      if (atEdge) go(0, event.key === "ArrowRight" ? 1 : -1);
    }
  };

  /** Ctrl+C chép cả bảng ra dạng Excel dán được — đối chiếu với file của nhà cung cấp. */
  const onCopyGrid = (event: React.ClipboardEvent<HTMLDivElement>) => {
    const selection = window.getSelection()?.toString();
    if (selection) return;   // đang bôi đen chữ trong một ô: để trình duyệt chép như thường
    event.preventDefault();
    const line = (values: unknown[]) => values.map((v) => String(v ?? "")).join("\t");
    const body = rows.map((row) => line(cols.map((c) => row[c.fieldname])));
    event.clipboardData.setData("text/plain", [line(cols.map((c) => layout.labels[c.fieldname] || c.label || c.fieldname)), ...body].join("\n"));
  };

  /**
   * ĐỌC PHIẾU GIAO BẰNG ẢNH — chụp tờ giấy của nhà cung cấp, máy dựng sẵn các dòng hàng.
   *
   * Kết quả là ĐỀ XUẤT, không phải dữ liệu đã ghi: các dòng hiện lên bảng để người nhập soát
   * rồi mới bấm lưu. Dòng nào máy không quy được về mã trong danh mục thì để TRỐNG ô mã và
   * ghi nguyên văn đã đọc vào ghi chú — thà để trống cho người ta thấy, còn hơn đoán một mã
   * gần giống rồi nhập sai kho mà không ai biết.
   */
  const [reading, setReading] = useState(false);
  const [readError, setReadError] = useState<string | null>(null);
  const onPickReceiptImage = async (file: File) => {
    setReading(true);
    setReadError(null);
    try {
      const image = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error("Không đọc được tệp ảnh"));
        reader.readAsDataURL(file);
      });
      const response = await fetch("/api/method/metaforge.ai.read_receipt", {
        method: "POST", credentials: "include",
        headers: aiHeaders(),
        body: JSON.stringify({ image }),
      });
      const result = await response.json() as {
        message?: string;
        lines?: Array<Record<string, unknown>>;
        unmatched?: number;
      };
      if (!response.ok) { setReadError(result.message ?? `Lỗi ${response.status}`); return; }
      const read = result.lines ?? [];
      if (!read.length) { setReadError("Không thấy dòng hàng nào trên ảnh."); return; }

      const has = (f: string) => (childMeta.fields ?? []).some((x) => x.fieldname === f);
      const made: Doc[] = read.map((line, i) => {
        const row: Doc = { name: `new-${Date.now()}-${i}`, doctype: childMeta.name } as Doc;
        for (const [fieldname, value] of Object.entries(rowDefaults ?? {})) {
          if (value != null && value !== "" && has(fieldname)) row[fieldname] = value;
        }
        const put = (field: string, value: unknown) => {
          if (value == null || value === "" || !has(field)) return;
          row[field] = value;
        };
        put("item_code", line.item_code);
        put("color", line.color); put("colour", line.color);
        put("qty", line.qty); put("uom", line.uom);
        put("length_m", line.length_m); put("qty_bar", line.qty_bar);
        put("rate", line.rate);
        if (!line.item_code && line.raw_text) put("note", `AI đọc: ${String(line.raw_text)} — CHƯA khớp mã`);
        return row;
      });
      const next = [...rows, ...made];
      emitRows(next);
      const fill = made.map((row, i) => (row.item_code ? rows.length + i : -1)).filter((i) => i >= 0);
      if (fill.length) void fillItemDefaultsMany(fill, next);
      if (result.unmatched) setReadError(`Đã thêm ${made.length} dòng. ${result.unmatched} dòng chưa khớp được mã — xem ghi chú của dòng.`);
    } catch (error) {
      setReadError(error instanceof Error ? error.message : "Đọc phiếu thất bại");
    } finally {
      setReading(false);
    }
  };

  /**
   * KÉO GIÃN cột: bám theo con trỏ, chốt lại khi thả.
   *
   * Dùng pointer capture nên chuột đi ra ngoài ô tiêu đề vẫn kéo tiếp — không có nó thì thao
   * tác đứt quãng ngay khi con trỏ vượt mép cột, đúng lúc đang muốn nới rộng. Chặn dưới 3rem:
   * một cột 0px là cột không bấm được, và không có cách nào kéo nó trở lại.
   */
  const startResize = (fieldname: string, event: React.PointerEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const handle = event.currentTarget;
    const header = handle.closest("th");
    const rem = Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    const startX = event.clientX;
    const startRem = (header?.getBoundingClientRect().width ?? 8 * rem) / rem;
    handle.setPointerCapture(event.pointerId);
    let latest = startRem;
    const move = (e: PointerEvent) => {
      latest = Math.max(3, startRem + (e.clientX - startX) / rem);
      setLayout((prev) => ({ ...prev, w: { ...prev.w, [fieldname]: latest } }));
    };
    const done = () => {
      handle.releasePointerCapture(event.pointerId);
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", done);
      saveLayout({ ...layout, w: { ...layout.w, [fieldname]: latest } });
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", done);
  };

  /** ĐỔI CHỖ cột: thả cột đang kéo vào VỊ TRÍ của cột đích, các cột còn lại dồn theo. */
  const dragged = useRef<string | null>(null);
  const dropColumn = (target: string) => {
    const source = dragged.current;
    dragged.current = null;
    if (!source || source === target) return;
    const current = cols.map((c) => c.fieldname);
    const without = current.filter((n) => n !== source);
    const at = without.indexOf(target);
    if (at < 0) return;
    saveLayout({ ...layout, order: [...without.slice(0, at), source, ...without.slice(at)] });
  };

  const table = (
    <>
      {/* CUỘN NGANG, không cắt. `overflow-hidden` trước đây giấu mất các cột phía sau mà
          không để lại dấu hiệu nào — bảng chỉ đơn giản là thiếu cột. Cột "#" GHIM lại bên
          trái khi cuộn, cách MISA làm, để không lạc dòng khi kéo sang phải. */}
      {/* `border-input` (viền MẠNH) chứ không phải `border` mặc định (`--border` #e1e5ea trên
          card trắng chỉ ~1.27:1 — trên màn hình thật gần như biến mất). Khung bọc cả bảng con
          là ranh giới quan trọng nhất của nó, xứng đáng cùng bậc viền với ô nhập. */}
      <div className={`${expanded ? "overflow-x-auto" : "max-h-[min(52vh,32rem)] overflow-auto"} rounded-md border border-input [scrollbar-width:thin]`}>
        {/* Bảng lớn CHIA phần trong khung (`w-full`, không ép min-width) nên 12 cột vừa trọn
            màn hình; bảng gọn vẫn tràn để cuộn vì khung của nó hẹp hơn tổng các cột. */}
        <Table className="mf-child-grid-table w-full table-fixed text-[13px]" style={expanded ? undefined : { minWidth: `${minWidthRem}rem` }}>
          <colgroup>
            {!readOnly ? <col style={{ width: 40, minWidth: 40, maxWidth: 40 }} /> : null}
            <col style={{ width: 48, minWidth: 48, maxWidth: 48 }} />
            {/*
              MỌI cột đều khai bề rộng — kể cả cột ghi chú.
              Để trống một cột nghĩa là "cột này nhận phần CÒN LẠI", và phần còn lại không có
              giới hạn nào: trên màn hình rộng, ghi chú phình ra chiếm nửa bảng trong khi mã
              hàng và số lượng chen chúc. Cũng chính chỗ trống đó từng cho ra cột rộng 0px khi
              phần còn lại âm. Khai hết thì `table-fixed` giãn đều theo tỉ lệ — cân đối ở mọi
              bề ngang, và không còn cột nào có thể biến mất.
            */}
            {cols.map((c) => (
              <col
                key={c.fieldname}
                className="[width:var(--mf-col-width)]"
                style={{ "--mf-col-width": columnWidth(c) || (c.fieldname === flexible ? "10rem" : gridWidth(c)) } as CSSProperties}
              />
            ))}
            {!readOnly ? <col className="w-[4.5rem]" /> : null}
          </colgroup>
          <TableHeader>
            <TableRow className="h-9 hover:bg-transparent">
              {!readOnly ? (
                <TableHead className="sticky left-0 top-0 z-50 w-10 min-w-10 max-w-10 bg-card px-0 text-center" style={{ width: 40 }}>
                  <Checkbox
                    checked={rows.length > 0 && selectedRows.length === rows.length}
                    onCheckedChange={() => setSelectedRows(selectedRows.length === rows.length ? [] : rows.map(rowKey))}
                    aria-label="Chọn tất cả dòng"
                  />
                </TableHead>
              ) : null}
              <TableHead className={`sticky top-0 z-50 w-12 min-w-12 max-w-12 bg-card px-0 text-center ${readOnly ? "left-0" : "left-10"}`} style={{ width: 48 }}>#</TableHead>
              {cols.map((c) => {
                const sticky = stickyColumn(c.fieldname, true);
                const numeric = ["Int", "Float", "Currency", "Percent"].includes(c.fieldtype);
                const dynamicallyRequired = rows.length > 0
                  ? rows.some((row) => resolveField(
                      fieldForRow(c.list_only ? { ...c, list_only: 0 } : c, row),
                      childMeta,
                      { doc: row, parent: parentDoc, roles, assumeWritable: true },
                    ).required)
                  : Boolean(c.reqd);
                let headerLabel = layout.labels[c.fieldname] || childGridColumnLabel(childMeta, c);
                if (!layout.labels[c.fieldname] && isSalesTransactionGrid(childMeta) && rows.length > 0) {
                  const rowLabels = [...new Set(rows
                    .map((row) => fieldForRow(c, row).label)
                    .filter((label): label is string => Boolean(label)))];
                  if (rowLabels.length === 1) headerLabel = rowLabels[0]!;
                  // Giữ header nghiệp vụ ổn định; nhãn nội bộ của từng mặt hàng
                  // không được làm đổi tên cột trên đơn bán hàng.
                  if (childMeta.name === "Sales Order Item") {
                    if (c.fieldname === "set_count") headerLabel = "Số lượng";
                    if (c.fieldname === "qty") headerLabel = "Khối lượng";
                  }
                  // Bảng có thể vừa có cửa vừa có ray/phụ kiện. Khi đó nhãn chung
                  // "Rộng (m)" của vật tư không được làm mất PB ray/PB nhựa của cửa.
                  if (c.fieldname === "width_m") {
                    const doorWidthLabel = rowLabels.find((label) => label.startsWith("Rộng PB ray") || label.startsWith("Rộng PB nhựa"));
                    if (doorWidthLabel) headerLabel = doorWidthLabel;
                  }
                }
                return (
                <TableHead
                  key={c.fieldname}
                  className={`group sticky top-0 z-40 whitespace-pre-line bg-card px-1 py-1 text-center text-[12px] leading-tight ${sticky.className}`}
                  style={sticky.style}
                  draggable={!readOnly}
                  onDragStart={() => { dragged.current = c.fieldname; }}
                  onDragOver={(event) => { if (dragged.current) event.preventDefault(); }}
                  onDrop={() => dropColumn(c.fieldname)}
                  title={readOnly ? undefined : "Kéo tiêu đề để đổi chỗ cột · kéo mép phải để giãn"}
                >
                  {headerLabel}
                  {dynamicallyRequired ? <span className="mf-required ml-0.5 text-destructive">*</span> : null}
                  {!readOnly ? (
                    /* Tay kéo nằm ĐÈ lên mép phải của ô tiêu đề, rộng 6px để bấm trúng được
                       bằng chuột mà không cần ngắm. Mờ đi cho tới khi rê vào cột. */
                    <span
                      role="presentation"
                      onPointerDown={(event) => startResize(c.fieldname, event)}
                      onDragStart={(event) => event.preventDefault()}
                      // Header dùng `chromeFill`/`chromeText` (`--foreground` trên nền pha
                      // primary+card) — tay kéo theo `--foreground` để luôn tương phản với chữ
                      // tiêu đề, bất kể `chromeFill` đang sáng hay tối ở bảng màu nào.
                      className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize opacity-0 transition group-hover:opacity-100 hover:bg-foreground/30"
                    />
                  ) : null}
                </TableHead>
              );})}
              {!readOnly ? <TableHead className="sticky top-0 z-40 w-10 bg-card" /> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, ri) => {
              const discountColumn = isSalesOrderGrid(childMeta)
                ? cols.find((column) => column.fieldname === "discount_percentage")
                : undefined;
              const discountColumnIndex = discountColumn ? cols.indexOf(discountColumn) : -1;
              const discountAmountColumn = isSalesOrderGrid(childMeta)
                ? cols.find((column) => column.fieldname === "amount")
                : undefined;
              const DiscountControl = discountColumn ? registry.resolve(discountColumn.fieldtype) ?? FallbackControl : null;
              const DiscountAmountControl = discountAmountColumn ? registry.resolve(discountAmountColumn.fieldtype) ?? FallbackControl : null;
              // The dedicated discount row obeys the same row-scoped metadata contract as ordinary cells.
              const discountField = discountColumn
                ? fieldForRow(discountColumn.list_only ? { ...discountColumn, list_only: 0 } : discountColumn, row)
                : undefined;
              const resolvedDiscount = discountField
                ? resolveField(discountField, childMeta, { doc: row, parent: parentDoc, roles, assumeWritable: true })
                : undefined;
              const rateNeedsApproval = childMeta.name === "Sales Order Item" && row.rate_requires_approval === true;
              const discountNeedsApproval = childMeta.name === "Sales Order Item"
                && Boolean(row.item_code)
                && Number(row.discount_percentage ?? 0) !== defaultSalesDiscountPercent(row);
              return (
              <Fragment key={String(row.name ?? ri)}>
              <TableRow
                className={(expanded && pickedRow === ri) || selectedSet.has(rowKey(row, ri)) ? "bg-primary/10 hover:bg-primary/10" : "hover:bg-transparent"}
                {...(expanded ? { onFocusCapture: () => setPickedRow(ri), onClick: () => setPickedRow(ri) } : {})}
              >
                {!readOnly ? (
                    <TableCell className="sticky left-0 z-20 w-10 min-w-10 max-w-10 bg-card px-0 py-1 text-center" style={{ width: 40 }} onClick={(event) => event.stopPropagation()}>
                    <Checkbox checked={selectedSet.has(rowKey(row, ri))} onCheckedChange={() => toggleSelected(row, ri)} aria-label={`Chọn dòng ${ri + 1}`} />
                  </TableCell>
                ) : null}
                <TableCell className={`sticky z-20 w-12 min-w-12 max-w-12 bg-card px-0 py-1 text-center text-xs text-muted-foreground ${readOnly ? "left-0" : "left-10"}`} style={{ width: 48 }}>{ri + 1}</TableCell>
                {cols.map((c) => {
                  const sticky = stickyColumn(c.fieldname);
                  const Control = registry.resolve(c.fieldtype) ?? FallbackControl;
                  // Chiết khấu có dòng riêng bên dưới từng mặt hàng để không làm chật dòng nhập chính.
                  if (c.fieldname === "discount_percentage" && discountColumn) {
                    return <TableCell key={c.fieldname} className={`!bg-muted/30 ${sticky.className}`} style={sticky.style} />;
                  }
                  // `list_only` means "show in a table", not "hide from a table". The shared form
                  // resolver hides it for standalone form fields, so clear the flag inside ChildGrid.
                  const gridField = fieldForRow(c.list_only ? { ...c, list_only: 0 } : c, row);
                  // P1-06 canonical: trạng thái field con theo depends_on/read_only_depends_on/docstatus,
                  // eval trong ngữ cảnh row (doc) + doc cha (parent). assumeWritable: quyền ghi bảng con
                  // KẾ THỪA từ cha (DocType con permissions rỗng) — grid đã gate bằng readOnly field cha
                  // (H1). Vẫn tôn trọng read_only/read_only_depends_on/docstatus + masked_fields server.
                  const rf = resolveField(gridField, childMeta, { doc: row, parent: parentDoc, roles, assumeWritable: true });
                  // Sales Order starts from Item Price (price list + item + UOM), then permits
                  // an explicit override. The server records the difference for approval.
                  const manualSalesPriceField = childMeta.name === "Sales Order Item"
                    && Boolean(parentDoc?.selling_price_list)
                    && c.fieldname === "rate";
                  const cellReadOnly = Boolean(readOnly || (rf.readOnly && !manualSalesPriceField) || (expanded && !rf.visible));
                  const cellHint = !rf.visible
                    ? "Không áp dụng cho mặt hàng này"
                    : (rf.readOnly && !manualSalesPriceField)
                      ? "Hệ thống tự tính hoặc tự điền"
                      : "Có thể nhập";
                  /**
                   * Bảng lớn LUÔN vẽ đủ ô, kể cả field đang bị `depends_on` ẩn.
                   *
                   * `depends_on` của các field quy cách đọc `inventory_mode` — thứ chỉ có SAU khi
                   * đã chọn mã hàng. Nên trên một dòng còn trống, gần như mọi cột hiện dấu "—":
                   * bảng trông như bị khoá cứng. Các ô đó vẫn tồn tại để giữ đúng cấu trúc khi dán bảng,
                   * nhưng bị khoá và tô xám cho tới khi mặt hàng đã chọn làm chúng có hiệu lực.
                   * Ở bảng gọn thì "—" đúng (đã biết hàng gì rồi thì cột không liên quan chỉ gây
                   * nhiễu); ở trang tính thì cột phải có sẵn để còn dán cả khối vào.
                   */
                  const numeric = ["Int", "Float", "Currency", "Percent"].includes(c.fieldtype);
                  if (!rf.visible && !expanded) {
                    return <TableCell key={c.fieldname} className={`align-top !bg-muted/80 text-center text-xs text-muted-foreground ${sticky.className}`} style={sticky.style}>—</TableCell>;
                  }
                  return (
                    <TableCell
                      key={c.fieldname}
                      data-cell={`${ri}:${cols.indexOf(c)}`}
                      data-editable={cellReadOnly ? "false" : "true"}
                      className={`align-top px-1 py-1 text-center transition-colors [&_input]:!h-8 [&_input]:text-center [&_button]:!h-8 [&_.mf-control]:!min-h-8 [&_.mf-control]:justify-center ${
                        (c.fieldname === "rate" && rateNeedsApproval) || (c.fieldname === "discount_percentage" && discountNeedsApproval)
                          ? "animate-pulse !bg-red-700 text-white ring-2 ring-inset ring-red-950 [&_*]:!text-white [&_.mf-control]:!border-red-950 [&_.mf-control]:!bg-red-700"
                          : cellReadOnly
                            ? "!bg-muted/80 text-muted-foreground [&_.mf-control]:border-muted-foreground/20 [&_.mf-control]:bg-muted/40"
                            : "!bg-primary/[0.07] ring-1 ring-inset ring-primary/25 focus-within:!bg-primary/[0.12] focus-within:ring-2 focus-within:ring-primary/60 [&_.mf-control]:border-primary/40 [&_.mf-control]:bg-background"
                      } ${sticky.className}`}
                      style={sticky.style}
                      title={cellHint}
                      onFocusCapture={() => { setPickedRow(ri); setPickedColumn(cols.indexOf(c)); }}
                      onClick={() => { setPickedRow(ri); setPickedColumn(cols.indexOf(c)); }}
                    >
                      <Control
                        field={gridField}
                        value={row[c.fieldname]}
                        onChange={(v: unknown) => setCell(ri, c.fieldname, v)}
                        readOnly={cellReadOnly}
                        masked={rf.masked}
                        services={services}
                        docname={String(row.name ?? "")}
                        linkTarget={dynamicLinkTarget(c, row)}
                        parentDoctype={childMeta.name}
                        docValues={row}
                        roles={roles}
                        compact
                      />
                    </TableCell>
                  );
                })}
                {!readOnly ? (
                  <TableCell className="whitespace-nowrap text-center">
                    <Button type="button" variant="ghost" size="icon-sm" className="text-muted-foreground" onClick={() => setDetailRow(ri)} aria-label="Chi tiết dòng" title="Chi tiết dòng">
                      <Maximize2 />
                    </Button>
                    <Button type="button" variant="ghost" size="icon-sm" className="text-muted-foreground hover:text-destructive" onClick={() => delRow(ri)} aria-label={t("grid.remove_row")}>
                      <X />
                    </Button>
                  </TableCell>
                ) : null}
              </TableRow>
              {discountColumn && discountAmountColumn && DiscountControl && DiscountAmountControl && resolvedDiscount?.visible ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell
                    colSpan={(readOnly ? 1 : 2) + discountColumnIndex}
                    className="h-7 border-t-0 bg-muted/20"
                  />
                  <TableCell className={`border-t-0 px-1 py-0.5 text-center [&_input]:!h-8 [&_input]:!text-center [&_button]:!h-8 [&_.mf-control]:!min-h-8 [&_.mf-control]:!justify-center ${discountNeedsApproval ? "animate-pulse !bg-red-700 text-white ring-2 ring-inset ring-red-950 [&_*]:!text-white [&_.mf-control]:!border-red-950 [&_.mf-control]:!bg-red-700" : "bg-muted/20"}`} style={stickyColumn(discountColumn.fieldname).style}>
                    <DiscountControl
                      field={discountField!}
                      value={row.discount_percentage ?? 0}
                      onChange={(value: unknown) => setCell(ri, "discount_percentage", value)}
                      readOnly={readOnly || Boolean(resolvedDiscount?.readOnly)}
                      masked={resolvedDiscount?.masked}
                      services={services}
                      docname={String(row.name ?? "")}
                      parentDoctype={childMeta.name}
                      docValues={row}
                      roles={roles}
                      compact
                    />
                  </TableCell>
                  <TableCell className="border-t-0 bg-muted/20 px-1 py-0.5 text-center [&_input]:!h-8 [&_input]:!text-center [&_button]:!h-8 [&_.mf-control]:!min-h-8 [&_.mf-control]:!justify-center" style={stickyColumn(discountAmountColumn.fieldname).style}>
                    <DiscountAmountControl
                      field={fieldForRow(discountAmountColumn.list_only ? { ...discountAmountColumn, list_only: 0 } : discountAmountColumn, row)}
                      // Lưu khoản chiết khấu là số dương để phép tính tổng rõ ràng;
                      // hiển thị số âm ở dòng phụ để người bán nhận ra đây là tiền được trừ.
                      value={-(Math.max(0, Number(row.discount_amount) || 0))}
                      onChange={() => { /* Giá trị tự tính từ tỷ lệ chiết khấu. */ }}
                      readOnly
                      services={services}
                      docname={String(row.name ?? "")}
                      parentDoctype={childMeta.name}
                      docValues={row}
                      roles={roles}
                      compact
                    />
                  </TableCell>
                  <TableCell colSpan={cols.length - discountColumnIndex - 2 + (readOnly ? 0 : 1)} className="border-t-0 bg-muted/20" />
                </TableRow>
              ) : null}
              </Fragment>
              );
            })}
            {rows.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell className="h-16 text-center text-muted-foreground" colSpan={cols.length + (readOnly ? 1 : 3)}>
                  {t("grid.empty")}
                </TableCell>
              </TableRow>
            ) : null}
            {rows.length > 0 && totals.size > 0 ? (
              <TableRow className="border-t-2 bg-muted/40 py-1 font-medium hover:bg-muted/40">
                {!readOnly ? <TableCell className="sticky left-0 z-20 bg-muted/40" /> : null}
                <TableCell className={`sticky z-20 bg-muted/40 text-center text-xs text-muted-foreground ${readOnly ? "left-0" : "left-10"}`}>Σ</TableCell>
                {cols.map((c) => {
                  const sticky = stickyColumn(c.fieldname);
                  return (
                  <TableCell key={c.fieldname} className={`whitespace-nowrap text-center tabular-nums ${sticky.className}`} style={sticky.style}>
                    {totals.has(c.fieldname)
                      ? (services?.fmt?.number
                          ? services.fmt.number(totals.get(c.fieldname)!)
                          : totals.get(c.fieldname)!.toLocaleString("vi-VN"))
                      : null}
                  </TableCell>
                );})}
                {!readOnly ? <TableCell /> : null}
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>
    </>
  );

  /** Bảng field của MỘT dòng — dùng cho cả hộp chi tiết và panel bên phải của bảng lớn. */
  const rowFields = (idx: number, columns: string) => {
    const row = rows[idx];
    if (!row) return null;
    return (
      <div className={`grid min-w-0 gap-x-3 gap-y-3 ${columns}`}>
        {(childMeta.fields ?? []).filter((f) => !isLayout(f.fieldtype)).map((f) => {
          const rowField = fieldForRow(f, row);
          const rf = resolveField(rowField, childMeta, { doc: row, parent: parentDoc, roles, assumeWritable: true });
          if (!rf.visible) return null;
          const Control = registry.resolve(f.fieldtype) ?? FallbackControl;
          const serverPriced = childMeta.name === "Sales Order Item"
            && Boolean(parentDoc?.selling_price_list)
            && f.fieldname === "rate";
          return (
            <div key={f.fieldname} className={`grid min-w-0 gap-1.5 ${columns.includes("grid-cols-1") ? "" : detailFieldSpan(f)}`}>
              <label className="text-sm font-medium" htmlFor={`detail-${f.fieldname}`}>
                {rowField.label ?? f.fieldname}
                {rf.required ? <span className="mf-required ml-0.5 text-destructive">*</span> : null}
              </label>
              <Control
                field={rowField}
                value={row[f.fieldname]}
                onChange={(v: unknown) => setCell(idx, f.fieldname, v)}
                readOnly={readOnly || rf.readOnly || serverPriced}
                masked={rf.masked}
                services={services}
                docname={String(row.name ?? "")}
                linkTarget={dynamicLinkTarget(rowField, row)}
                parentDoctype={childMeta.name}
                docValues={row}
                roles={roles}
              />
            </div>
          );
        })}
      </div>
    );
  };

  const toolbar = !readOnly ? (
    <div className="flex flex-wrap items-center gap-2">
      <Button type="button" variant="outline" size="sm" onClick={addRow}>
        <Plus /> {t("grid.add_row")}
      </Button>
      <Button type="button" variant="outline" size="sm" onClick={() => setColumnSettingsOpen(true)}>
        <Columns3 /> Cột
      </Button>
      <Button type="button" variant="ghost" size="sm" disabled={pickedRow == null && selectedRows.length === 0} onClick={() => moveRows(-1)} aria-label="Đưa dòng lên">
        <ArrowUp /> Lên
      </Button>
      <Button type="button" variant="ghost" size="sm" disabled={pickedRow == null && selectedRows.length === 0} onClick={() => moveRows(1)} aria-label="Đưa dòng xuống">
        <ArrowDown /> Xuống
      </Button>
      {selectedRows.length ? (
        <Button type="button" variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => deleteRows(rows.map((row, index) => selectedSet.has(rowKey(row, index)) ? index : -1).filter((index) => index >= 0))}>
          <Trash2 /> Xóa {selectedRows.length} dòng
        </Button>
      ) : null}
      {lastDeleted?.length ? (
        <Button type="button" variant="ghost" size="sm" onClick={undoDelete}>
          <Undo2 /> Hoàn tác xóa
        </Button>
      ) : null}
      {expanded ? (
        <>
          <Button type="button" variant="outline" size="sm" onClick={() => addRows(10)}>
            <Plus /> Thêm 10 dòng
          </Button>
          <Button type="button" variant="outline" size="sm" disabled={pickedRow == null} onClick={() => pickedRow != null && cloneRow(pickedRow)}>
            <Copy /> Nhân bản dòng
          </Button>
          <Button type="button" variant="outline" size="sm" disabled={pickedRow == null} onClick={() => pickedRow != null && fillDown(pickedRow)} title="Chép giá trị của dòng đang chọn xuống các ô còn TRỐNG ở dưới">
            <ArrowDownToLine /> Điền xuống
          </Button>
          <FileButton
            accept="image/*"
            capture="environment"
            disabled={reading}
            onFiles={(files) => {
              const file = files?.[0];
              if (file) void onPickReceiptImage(file);
            }}
          >
            <ScanLine className="size-4" />
            {reading ? "Đang đọc ảnh…" : "Đọc phiếu bằng ảnh"}
          </FileButton>
          <span className="text-xs text-muted-foreground">Chép vùng trong Excel rồi Ctrl+V ngay trên bảng</span>
        </>
      ) : allowLargeGrid ? (
        <Button type="button" variant="outline" size="sm" onClick={() => { setExpanded(true); setPickedRow(rows.length ? 0 : null); }}>
          <Maximize2 /> Mở bảng lớn
        </Button>
      ) : null}
      <span className="inline-flex items-center gap-3 rounded-md border bg-card px-2.5 py-1.5 text-xs font-medium" aria-label="Chú thích trạng thái ô">
        <span className="inline-flex items-center gap-1.5 text-foreground">
          <span className="size-3.5 rounded-sm border border-primary/50 bg-primary/10 ring-1 ring-primary/20" /> Ô nhập liệu
        </span>
        <span className="inline-flex items-center gap-1.5 text-muted-foreground">
          <span className="size-3.5 rounded-sm border border-muted-foreground/20 bg-muted" /> Tự tính / không áp dụng
        </span>
      </span>
      {/* Kéo nhầm một cột về 3rem rồi mở lại vẫn thấy nó bé tí là một cái bẫy không lối ra —
          tuỳ chỉnh nào lưu lại được cũng phải có đường hoàn tác. */}
      {hasCustomLayout ? (
        <Button type="button" variant="ghost" size="sm" onClick={resetLayout}>
          <RotateCcw /> Cột về mặc định
        </Button>
      ) : null}
      <span className="ml-auto text-xs text-muted-foreground">{rows.length} dòng</span>
    </div>
  ) : null;

  const columnDialog = (
    <Dialog open={columnSettingsOpen} onOpenChange={setColumnSettingsOpen}>
      <DialogContent className="max-h-[82vh] w-[min(94vw,680px)] max-w-none overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Tùy chỉnh cột</DialogTitle>
          <DialogDescription>Ẩn, đổi tên và ghim các cột cần nhìn khi cuộn ngang. Cột nhận diện luôn được giữ lại.</DialogDescription>
        </DialogHeader>
        <div className="space-y-1">
          {baseCols.map((column) => {
            const isIdentity = column.fieldname === baseIdentity;
            const hidden = layout.hidden.includes(column.fieldname);
            const pinned = isIdentity || layout.pinned.includes(column.fieldname);
            return (
              <div key={column.fieldname} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 rounded-md border px-3 py-2">
                <Checkbox
                  checked={!hidden}
                  disabled={isIdentity}
                  onCheckedChange={() => saveLayout({
                    ...layout,
                    hidden: hidden
                      ? layout.hidden.filter((field) => field !== column.fieldname)
                      : [...layout.hidden, column.fieldname],
                    pinned: hidden ? layout.pinned : layout.pinned.filter((field) => field !== column.fieldname),
                  })}
                  aria-label={`Hiển thị cột ${column.label ?? column.fieldname}`}
                />
                <Input
                  className="h-8"
                  value={layout.labels[column.fieldname] ?? childGridColumnLabel(childMeta, column)}
                  onChange={(event) => saveLayout({
                    ...layout,
                    labels: { ...layout.labels, [column.fieldname]: event.target.value },
                  })}
                  aria-label={`Tên hiển thị cột ${childGridColumnLabel(childMeta, column)}`}
                />
                <Button
                  type="button"
                  variant={pinned ? "secondary" : "ghost"}
                  size="icon-sm"
                  disabled={hidden || isIdentity}
                  onClick={() => saveLayout({
                    ...layout,
                    pinned: pinned
                      ? layout.pinned.filter((field) => field !== column.fieldname)
                      : [...layout.pinned, column.fieldname],
                  })}
                  aria-label={`${pinned ? "Bỏ ghim" : "Ghim"} cột ${column.label ?? column.fieldname}`}
                >
                  {pinned ? <PinOff /> : <Pin />}
                </Button>
              </div>
            );
          })}
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={resetLayout}>
            <RotateCcw /> Mặc định
          </Button>
          <Button type="button" onClick={() => setColumnSettingsOpen(false)}>Xong</Button>
        </div>
      </DialogContent>
    </Dialog>
  );

  const discountPolicyWarnings = childMeta.name === "Sales Order Item"
    ? rows.flatMap((row, index) => {
        const expected = defaultSalesDiscountPercent(row);
        const actual = Number(row.discount_percentage ?? 0);
        return row.item_code && Number.isFinite(actual) && actual !== expected
          ? [`Dòng ${index + 1} (${String(row.item_code)}): ${actual}% thay vì ${expected}%`]
          : [];
      })
    : [];
  const priceApprovalWarnings = childMeta.name === "Sales Order Item"
    ? rows.flatMap((row, index) => row.item_code && row.rate_requires_approval === true
      ? [`Dòng ${index + 1} (${String(row.item_code)}): đơn giá nhập khác bảng giá áp dụng`]
      : [])
    : [];
  const priceApprovalNotice = priceApprovalWarnings.length ? (
    <div className="animate-pulse rounded-md border-2 border-red-950 bg-red-700 px-3 py-2 text-sm font-medium text-white shadow-sm ring-2 ring-red-950" role="alert">
      <span className="font-semibold">Đơn giá cần duyệt trước khi bán:</span> {priceApprovalWarnings.join(" · ")}
    </div>
  ) : null;
  const discountPolicyNotice = discountPolicyWarnings.length ? (
    <div className="animate-pulse rounded-md border-2 border-red-950 bg-red-700 px-3 py-2 text-sm font-medium text-white shadow-sm ring-2 ring-red-950" role="alert">
      <span className="font-semibold">Chiết khấu cần duyệt:</span> {discountPolicyWarnings.join(" · ")}
    </div>
  ) : null;
  const approvalNotice = <>{priceApprovalNotice}{discountPolicyNotice}</>;

  if (expanded) {
    return (
      <div className="mf-grid space-y-2">
        {approvalNotice}
        <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
          Đang nhập ở bảng lớn — {rows.length} dòng.
        </div>
        <Dialog open onOpenChange={(open) => { if (!open) setExpanded(false); }}>
          <DialogContent className="flex h-[94vh] w-[97vw] max-w-none flex-col gap-0 overflow-hidden p-0">
            <DialogHeader className="shrink-0">
              <DialogTitle className="flex items-center gap-3 border-b px-4 py-3">
                <span>{childMeta.label ?? childMeta.name}</span>
                <Button type="button" size="sm" className="ml-auto" onClick={() => setExpanded(false)}>
                  Lưu và quay lại
                </Button>
              </DialogTitle>
            </DialogHeader>
            <div className="shrink-0 border-b px-4 py-2">{toolbar}</div>
            {readError ? (
              <div className="shrink-0 border-b bg-warning/10 px-4 py-2 text-sm text-warning-text" role="status">
                {readError}
                <Button type="button" variant="link" className="ml-2 h-auto p-0" onClick={() => setReadError(null)}>bỏ qua</Button>
              </div>
            ) : null}
            {/* Bảng chiếm trọn bề ngang. Field không có cột ở đây vẫn tới được qua nút chi tiết
                dòng (⛶) của bảng gọn — không mất field nào, chỉ là không nhét hết vào một lưới. */}
            {/*
              `min-w-0` là thứ giữ bảng NẰM TRONG hộp thoại.
              Mặc định một con flex rộng tối thiểu bằng nội dung của nó, nên bảng rộng hơn màn
              hình sẽ đẩy phình cả hộp thoại — thanh công cụ và nút "Lưu và quay lại" trôi ra
              ngoài mép phải, đúng thứ nhìn thấy trên ảnh chụp. Có `min-w-0` thì phần tràn
              thuộc về thanh cuộn của riêng vùng bảng.
            */}
            <div
              ref={gridRef}
              className="mf-grid-excel min-h-0 min-w-0 flex-1 overflow-auto p-3"
              onPaste={onPasteGrid}
              onCopy={onCopyGrid}
              onKeyDown={onGridKeyDown}
            >
              {table}
            </div>
          </DialogContent>
        </Dialog>
        {columnDialog}
      </div>
    );
  }

  return (
    <div className="mf-grid space-y-2">
      {approvalNotice}
      {table}
      {toolbar}
      {columnDialog}

      {/*
        CHI TIẾT DÒNG — mọi field của dòng, kể cả field không làm cột.
        Đây là thứ khiến việc rút gọn cột trở nên AN TOÀN: bảng chỉ giữ vài cột người ta
        nhìn mỗi ngày, còn field ít dùng (hệ số quy đổi, ghi chú dòng, kho riêng của dòng)
        vẫn tới được — thay vì biến mất khỏi giao diện cùng với cột của nó. Bỏ một cột mà
        không có chỗ này là xoá field khỏi tầm với của người dùng.
      */}
      <Dialog open={detailRow != null} onOpenChange={(open) => { if (!open) setDetailRow(null); }}>
        <DialogContent className="max-h-[88vh] w-[min(96vw,860px)] max-w-none overflow-y-auto p-0">
          <DialogHeader>
            <DialogTitle className="border-b px-5 py-4">
              {childMeta.label ?? childMeta.name}
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                Dòng {detailRow != null ? detailRow + 1 : ""}
                {detailRow != null && childMeta.title_field && rows[detailRow]?.[childMeta.title_field]
                  ? ` · ${String(rows[detailRow]?.[childMeta.title_field])}`
                  : ""}
              </span>
            </DialogTitle>
          </DialogHeader>
          {detailRow != null && rows[detailRow]
            ? <div className="px-5 pb-5">{rowFields(detailRow, "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3")}</div>
            : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
