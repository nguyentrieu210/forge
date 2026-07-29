/** @jsxImportSource react */
/**
 * ChildGrid (M12) — bảng con cho field Table: render row của child DocType,
 * cột = field in_list_view của child, cell = control từ registry (inline edit), thêm/xoá row.
 * Data-driven từ child meta (KHÔNG hardcode).
 */
import { useEffect, useRef, useState } from "react";
import { Maximize2, Plus, X } from "lucide-react";
import { resolveField, type DocTypeMeta, type DocField, type Doc } from "@metaforge/core";
import { ControlRegistry, FallbackControl, type FieldServices } from "@metaforge/controls";
import {
  Button, Dialog, DialogContent, DialogHeader, DialogTitle,
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell, useT,
} from "@metaforge/ui";

export interface ChildGridProps {
  childMeta: DocTypeMeta;
  rows: Doc[];
  onChange: (rows: Doc[]) => void;
  registry: ControlRegistry;
  services?: FieldServices;
  readOnly?: boolean;
  /** doc CHA (giá trị form) — ngữ cảnh resolve depends_on/eval của field con (parent.*). */
  parentDoc?: Record<string, unknown>;
  /** role user — resolve permlevel/quyền ghi field con (P1-06 canonical). */
  roles?: string[];
  /**
   * Giá trị mồi cho DÒNG MỚI, lấy từ bối cảnh đang chọn (vd kho hiện tại).
   *
   * `blankDoc` chỉ gieo bối cảnh cho chứng từ CHA, nên dòng bảng con không nhận được gì —
   * thủ kho phải chọn lại đúng một cái kho cho từng dòng, mỗi lần. Chỉ mồi ô đang TRỐNG và
   * chỉ những field bảng con thật sự có.
   */
  rowDefaults?: Record<string, unknown>;
}

function isLayout(ft: string): boolean {
  return ["Section Break", "Column Break", "Tab Break", "Fold", "Heading", "HTML", "Button", "Table", "Table MultiSelect"].includes(ft);
}

function gridColumns(meta: DocTypeMeta): DocField[] {
  const inList = (meta.fields ?? []).filter((f) => f.in_list_view === 1 && !isLayout(f.fieldtype));
  if (inList.length > 0) return inList;
  return (meta.fields ?? []).filter((f) => !isLayout(f.fieldtype)).slice(0, 4);
}

/**
 * Cột mà KHÔNG dòng nào hiện được thì BỎ HẲN, không để lại một cột toàn dấu "—".
 *
 * Một bảng dòng thường phải phục vụ nhiều loại mua rất khác nhau: mua nhôm cần màu, chiều
 * dài cây, số kg / số bó / số cây; mua mô tơ chỉ cần cái và giá. Khai đủ cột cho cả hai rồi
 * dùng `depends_on` để ẩn theo từng ô thì phiếu mua mô tơ vẫn còn năm cái tiêu đề rỗng —
 * chiếm chỗ, và bắt người đọc tự hiểu là chúng không liên quan.
 *
 * Đánh giá theo ĐÚNG bộ máy `depends_on` sẵn có, trong ngữ cảnh dòng + chứng từ cha. Bảng
 * chưa có dòng nào thì đánh giá với một dòng rỗng, để cột phụ thuộc vào chứng từ cha vẫn
 * quyết định được ngay từ lúc chưa nhập gì.
 */
function visibleColumns(
  cols: DocField[],
  meta: DocTypeMeta,
  rows: Doc[],
  parentDoc: Record<string, unknown> | undefined,
  roles: string[] | undefined,
): DocField[] {
  const probes: Doc[] = rows.length ? rows : [{ name: "probe", doctype: meta.name } as Doc];
  return cols.filter((column) =>
    probes.some((row) => resolveField(column, meta, { doc: row, parent: parentDoc, roles, assumeWritable: true }).visible));
}

/**
 * BỀ RỘNG CỘT LÀ TUYỆT ĐỐI, và đúng MỘT cột co giãn.
 *
 * Bản trước cấp `min-width` cho từng cột rồi để bảng `w-full`. Nhưng `min-width` chỉ là
 * sàn: trình duyệt lấy phần thừa chia ĐỀU cho mọi cột, nên cột "SL" sàn 4,5rem phình ra
 * ngang cột "Thành tiền" dù nó chỉ chứa "20". Đó là lý do các cột trông không hợp lý —
 * không phải vì con số sàn sai, mà vì sàn không quyết định được gì khi còn chỗ thừa.
 *
 * Cách của mọi bảng nhập liệu dùng được (MISA, Excel): cột nào cũng có bề rộng CỐ ĐỊNH,
 * trừ MỘT cột nuốt hết phần thừa — ở đây là cột tên hàng, cột duy nhất mà chữ dài ra thì
 * cần thêm chỗ. `table-fixed` để bề rộng khai ra được tôn trọng đúng như khai.
 */
const GRID_WIDTH: Record<string, string> = {
  Check: "3.5rem", Int: "5rem", Float: "5.5rem", Percent: "5.5rem", Currency: "8rem",
  Date: "8.5rem", Time: "7rem", Datetime: "10.5rem",
  "Small Text": "12rem", Text: "12rem", "Long Text": "12rem",
};

/**
 * Cột MÃ HÀNG không bao giờ co, và không bao giờ là cột chịu thiệt.
 *
 * Nó là thứ duy nhất người đọc dùng để biết dòng này là hàng gì; mọi cột khác chỉ có nghĩa
 * khi đã biết điều đó.
 */
const IDENTITY_WIDTH = "14rem";

function gridWidth(field: DocField): string {
  const fieldtype = field.fieldtype;
  if (fieldtype === "Select") {
    // Theo LỰA CHỌN DÀI NHẤT: cột ĐVT chỉ chứa "Cây", "Kg" — cấp cho nó bề rộng của một
    // cột trạng thái là lấy mất chỗ của cột tên hàng ngay bên cạnh.
    const longest = (field.options ?? "").split("\n").reduce((max, option) => Math.max(max, option.trim().length), 0);
    return longest <= 6 ? "6rem" : longest <= 12 ? "8.5rem" : "11rem";
  }
  /**
   * Link đo theo NHÃN, không rơi về mặc định 11rem như mọi field còn lại.
   *
   * Khi ĐVT chuyển từ Select sang Link(UOM), nhánh đo-theo-lựa-chọn ở trên không còn áp
   * dụng nữa và cột đó lặng lẽ nhảy từ 6rem lên 11rem. Một cột chỉ chứa "Kg", "Bộ", "Cây"
   * chiếm gần gấp ba chỗ nó cần — và chỗ đó lấy đúng của cột mã hàng bên cạnh. Link tới một
   * danh mục ngắn (ĐVT, màu, kho) là trường hợp thường gặp hơn hẳn Link tới tên dài.
   */
  if (["Link", "Dynamic Link", "Currency", "Int", "Float", "Percent"].includes(fieldtype)) {
    // Nhãn dài hơn con số thì chính TIÊU ĐỀ mới là thứ quyết định bề rộng.
    const label = (field.label ?? field.fieldname).length;
    const base = GRID_WIDTH[fieldtype] ?? "7rem";
    return label <= 6 ? base : label <= 12 ? "8rem" : "10rem";
  }
  return GRID_WIDTH[fieldtype] ?? "11rem";
}

/** Cột ĐỊNH DANH — Link đầu tiên, tức mã hàng. Được ghim khi cuộn ngang và không co. */
function identityColumn(cols: DocField[]): string | undefined {
  return cols.find((c) => ["Link", "Dynamic Link"].includes(c.fieldtype))?.fieldname;
}

/**
 * Cột được phép CO GIÃN — đúng một, và là cột GHI CHÚ, không phải cột mã hàng.
 *
 * Không có cột co giãn thì tổng bề rộng cố định hiếm khi bằng bề ngang bảng: thiếu thì
 * thừa một khoảng trắng ở mép phải, dư thì cuộn ngang cả những cột không cần.
 *
 * Nhưng cột co giãn cũng là cột DUY NHẤT có thể bị ép về 0: với `table-fixed`, cột không
 * khai bề rộng chỉ nhận PHẦN CÒN LẠI, và phần còn lại có thể âm. Đo trên đơn mua hàng thật
 * ngày 29/7: các cột đã khai cộng lại 848px trong một khung 722px, nên cột "Mã sản phẩm" —
 * cột được chọn co giãn lúc đó — rộng đúng **0px**. Không nhìn thấy, không bấm được, tức là
 * không tạo nổi một dòng hàng nào. Cuộn ngang cũng vô ích vì cuộn tới nơi vẫn rộng 0.
 *
 * Nên chỗ chịu thiệt phải là thứ mất đi vẫn đọc được chứng từ: ghi chú. Không có cột chữ
 * nào thì không có cột co giãn — mọi cột giữ đúng bề rộng đã khai và bảng tự tràn để cuộn.
 */
function flexibleColumn(cols: DocField[], identity: string | undefined): string | undefined {
  const text = cols.filter((c) => c.fieldname !== identity
    && ["Data", "Small Text", "Text", "Long Text"].includes(c.fieldtype));
  return text[text.length - 1]?.fieldname;
}

function dynamicLinkTarget(field: DocField, row: Doc): string | undefined {
  if (field.fieldtype === "Link") return field.options;
  if (field.fieldtype !== "Dynamic Link" || !field.options) return undefined;
  const target = row[field.options];
  return typeof target === "string" && target.trim() ? target.trim() : undefined;
}

function detailFieldSpan(field: DocField): string {
  if (["Small Text", "Text", "Long Text", "Text Editor", "Code", "HTML", "Markdown Editor"].includes(field.fieldtype)) {
    return "sm:col-span-2 lg:col-span-3";
  }
  return "";
}

export function ChildGrid(props: ChildGridProps) {
  const t = useT();
  const { childMeta, rows, onChange, registry, services, readOnly, parentDoc, roles, rowDefaults } = props;
  const [detailRow, setDetailRow] = useState<number | null>(null);
  const itemLoadVersion = useRef(new Map<string, number>());
  const formulaLoadVersion = useRef(new Map<string, number>());
  const previousFormulaGroup = useRef("");
  const latestRows = useRef(rows);
  useEffect(() => {
    latestRows.current = rows;
  }, [rows]);
  const emitRows = (next: Doc[]) => {
    latestRows.current = next;
    onChange(next);
  };
  const cols = visibleColumns(gridColumns(childMeta), childMeta, rows, parentDoc, roles);
  const identity = identityColumn(cols);
  const flexible = flexibleColumn(cols, identity);
  const columnWidth = (column: DocField): string => (column.fieldname === identity ? IDENTITY_WIDTH : gridWidth(column));
  /**
   * Bảng RỘNG BẰNG TỔNG CÁC CỘT, rồi mới cuộn — chứ không ép mọi cột vào khung.
   *
   * `w-full` một mình có nghĩa "không bao giờ rộng hơn khung", nên `overflow-x-auto` bọc
   * ngoài không bao giờ có gì để cuộn: bảng tự bóp lại cho vừa, và thứ bị bóp là cột không
   * khai bề rộng. Khai `min-width` bằng đúng tổng các cột thì bảng mới thật sự tràn, thanh
   * cuộn mới xuất hiện, và mỗi cột giữ được bề rộng đã tính cho nó.
   */
  const minWidthRem = 2.5 + (readOnly ? 0 : 4.5)
    + cols.reduce((sum, column) => sum + (Number.parseFloat(columnWidth(column)) || 0), 0);
  // Ghim cột mã hàng ngay sau cột "#" (2,5rem): cuộn sang phải để nhập số cây vẫn phải biết
  // dòng này là mã nào. Ghim mỗi số thứ tự thì thứ còn nhìn thấy chỉ là "1", "2", "3".
  const stickyIdentity = (fieldname: string): string =>
    (fieldname === identity ? "sticky left-10 z-10 bg-card" : "");

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
  const COMPUTED_FROM = new Set([
    "qty", "rate", "qty_bar", "length_m", "width_mm", "height_mm", "set_count",
    "mesh_height_mm", "sales_mode", "has_butterfly_bracket", "uom", "conversion_factor",
  ]);
  const ITEM_DERIVED_FIELDS = [
    "conversion_factor", "uom", "stock_uom", "stock_qty", "inventory_mode", "measurement_profile", "min_area_sqm",
    "item_name", "description", "color", "colour", "rate", "amount",
    "formula_policy", "width_basis", "cut_width_mm", "billable_area_sqm",
    "length_m", "qty_bundle", "qty_bar", "total_length_m", "actual_kg_per_m", "so_no",
  ];
  const withComputed = (row: Doc): Doc => {
    const has = (f: string) => (childMeta.fields ?? []).some((x) => x.fieldname === f);
    let next = { ...row };
    if (next.inventory_mode === "Thành phẩm theo m2" && has("qty")) {
      const width = Number(next.width_mm);
      const height = Number(next.height_mm);
      const sets = Number(next.set_count ?? 1);
      const normalizedUom = String(next.uom ?? "").trim().toLocaleLowerCase("vi");
      const normalizedStockUom = String(next.stock_uom ?? "").trim().toLocaleLowerCase("vi");
      if (Number.isFinite(sets) && sets > 0) {
        if (["bộ", "bo", "set"].includes(normalizedUom)) {
          next.qty = sets;
        } else if (["m2", "m²", "sqm"].includes(normalizedUom)
          && Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0) {
          const actualArea = width * height / 1_000_000;
          const minimumArea = Math.max(0, Number(next.min_area_sqm) || 0);
          next.qty = Math.max(actualArea, minimumArea) * sets;
        }
        // Cửa có thể bán theo m² nhưng kho quản lý theo Bộ. Hệ số ở đây là động theo
        // kích thước từng cửa, vì vậy tuyệt đối không lấy một hệ số tĩnh trên Item.
        if (["bộ", "bo", "set"].includes(normalizedStockUom)) {
          const billableQty = Number(next.qty);
          if (Number.isFinite(billableQty) && billableQty > 0) {
            if (has("conversion_factor")) next.conversion_factor = sets / billableQty;
            if (has("stock_qty")) next.stock_qty = sets;
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
    if (next.inventory_mode === "Nhôm cây/lá" && has("qty_bar") && has("length_m")) {
      const kg = Number(next.qty);
      const bars = Number(next.qty_bar);
      const length = Number(next.length_m);
      if (Number.isFinite(bars) && bars > 0 && Number.isFinite(length) && length > 0) {
        const totalLength = bars * length;
        next = {
          ...next,
          ...(has("total_length_m") ? { total_length_m: totalLength } : {}),
          ...(has("actual_kg_per_m") && Number.isFinite(kg) && kg > 0
            ? { actual_kg_per_m: kg / totalLength }
            : {}),
        };
      }
    }
    if (has("stock_qty") && has("qty") && has("conversion_factor")) {
      const qty = Number(next.qty);
      const factor = Number(next.conversion_factor);
      if (Number.isFinite(qty) && qty > 0 && Number.isFinite(factor) && factor > 0) {
        next.stock_qty = qty * factor;
      }
    }
    if (has("amount") && has("qty") && has("rate")) {
      const qty = Number(next.qty);
      const rate = Number(next.rate);
      if (Number.isFinite(qty) && Number.isFinite(rate)) next.amount = qty * rate;
    }
    return next;
  };

  const isDoorSalesGrid = ["Quotation Item", "Sales Order Item", "Delivery Note Item", "Sales Invoice Item"]
    .includes(childMeta.name);

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
    const row = base[rowIdx];
    if (!row || row.inventory_mode !== "Thành phẩm theo m2" || !row.item_code) return;
    const width = Number(row.width_mm);
    const height = Number(row.height_mm);
    const normalizedUom = String(row.uom ?? "").trim().toLocaleLowerCase("vi");
    if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) return;
    if (!["m2", "m²", "sqm"].includes(normalizedUom)) return;
    try {
      const calculated = await services.callPost<Record<string, unknown>>("alumdoor.door.calculate", {
        item_code: row.item_code,
        customer: parentDoc?.customer,
        customer_group: parentDoc?.customer_group,
        sales_mode: row.sales_mode ?? "Trọn bộ",
        has_butterfly_bracket: row.has_butterfly_bracket ?? 0,
        width_mm: width,
        height_mm: height,
        mesh_height_mm: row.mesh_height_mm,
        set_count: row.set_count ?? 1,
        purpose: "Bán hàng",
      });
      if (formulaLoadVersion.current.get(loadKey) !== loadVersion) return;
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
      if (has("cut_width_mm")) patch.cut_width_mm = cutWidthM * 1_000;
      if (has("billable_area_sqm")) patch.billable_area_sqm = billable;
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
        if ("amount" in adjusted && Number.isFinite(rate)) adjusted.amount = billable * rate;
        return adjusted;
      });
      emitRows(merged);
    } catch {
      // Item không thuộc năm loại cửa hoặc khách chưa phân nhóm: giữ công thức chung để form
      // vẫn nhập được; validator sẽ nêu đúng lý do khi người dùng lưu/ghi sổ.
    }
  };

  const formulaCustomerGroup = String(parentDoc?.customer_group ?? "");
  useEffect(() => {
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

  const setCell = (rowIdx: number, fieldname: string, value: unknown) => {
    // Mọi thao tác trên dòng đều làm kết quả công thức đang bay trở nên cũ. Tăng version ngay,
    // kể cả field vừa sửa không tham gia phép tính, để phản hồi chậm không ghi đè dữ liệu mới.
    const formulaKey = String(rows[rowIdx]?.name ?? rowIdx);
    const formulaVersion = (formulaLoadVersion.current.get(formulaKey) ?? 0) + 1;
    formulaLoadVersion.current.set(formulaKey, formulaVersion);
    if (["uom", "color", "colour"].includes(fieldname)) {
      const loadKey = String(rows[rowIdx]?.name ?? rowIdx);
      itemLoadVersion.current.set(loadKey, (itemLoadVersion.current.get(loadKey) ?? 0) + 1);
    }
    const next = rows.map((r, i) => {
      if (i !== rowIdx) return r;
      const changingItem = fieldname === "item_code" && value !== r.item_code;
      const reset = changingItem
        ? Object.fromEntries(ITEM_DERIVED_FIELDS.filter((name) => name in r).map((name) => [name, undefined]))
        : {};
      const updated = {
        ...r,
        ...reset,
        [fieldname]: value,
        // Hệ số thuộc về CẶP Item + UOM. Đổi một trong hai mà giữ hệ số cũ là cách tạo
        // tồn sai nhưng chứng từ vẫn hợp lệ, nên xoá để server tra lại từ master.
        ...((fieldname === "item_code" || fieldname === "uom") && "conversion_factor" in r
          ? { conversion_factor: undefined }
          : {}),
      };
      return COMPUTED_FROM.has(fieldname) ? withComputed(updated) : updated;
    }) as Doc[];
    emitRows(next);
    if (COMPUTED_FROM.has(fieldname)) {
      void fillDoorFormula(rowIdx, next, formulaKey, formulaVersion);
    }
    if (fieldname === "item_code" && value) {
      const loadKey = String(next[rowIdx]?.name ?? rowIdx);
      const loadVersion = (itemLoadVersion.current.get(loadKey) ?? 0) + 1;
      itemLoadVersion.current.set(loadKey, loadVersion);
      void fillItemDefaults(rowIdx, String(value), next, loadKey, loadVersion);
    } else if (fieldname === "uom" && next[rowIdx]?.item_code) {
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
  const fillItemDefaults = async (
    rowIdx: number,
    itemCode: string,
    base: Doc[],
    loadKey: string,
    loadVersion: number,
  ) => {
    if (!services?.fetchValue && !services?.fetchDocument) return;
    const has = (f: string) => (childMeta.fields ?? []).some((x) => x.fieldname === f);
    const item = services.fetchDocument
      ? await services.fetchDocument("Item", itemCode).catch(() => undefined)
      : undefined;
    const readItemValue = async (fieldname: string): Promise<unknown> => {
      if (item) return item[fieldname];
      return services?.fetchValue?.("Item", itemCode, fieldname).catch(() => undefined);
    };
    // nguồn trên Item → các ô đích trên dòng bảng con
    const plan: Array<[string, string[]]> = [
      ["stock_uom", ["stock_uom"]],
      ["inventory_mode", ["inventory_mode"]],
      ["measurement_profile", ["measurement_profile"]],
      ["item_name", ["item_name"]],
      ["description", ["description"]],
      ["default_color", ["color", "colour"]],
      ["min_area_sqm", ["min_area_sqm"]],
      ["standard_rate", ["rate"]],
      /**
       * KHO MẶC ĐỊNH của chính mặt hàng — nan nhôm về kho nhôm, mô tơ về kho phụ kiện.
       *
       * Cụ thể hơn bối cảnh đang chọn, nên nó được phép ghi đè giá trị mà `rowDefaults` vừa
       * mồi (xem điều kiện dưới). Cái nó KHÔNG bao giờ ghi đè là kho người dùng tự chọn.
       */
      ["default_warehouse", ["warehouse"]],
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
    // Item tạo trước khi có kiểu quản lý được coi là hàng thường — tương thích ngược.
    if (has("inventory_mode") && !Object.hasOwn(patch, "inventory_mode")) patch.inventory_mode = "Hàng thường";

    /**
     * Đổi từ một mã nhôm sang hàng thường phải xoá quy cách của mã cũ. Giữ lại các số này
     * sẽ tạo một dòng motor mang 51 cây × 8,5 m trong payload dù giao diện đã giấu chúng.
     */
    if (patch.inventory_mode !== "Nhôm cây/lá") {
      for (const fieldname of ["length_m", "qty_bundle", "qty_bar", "so_no", "total_length_m", "actual_kg_per_m"]) {
        if (has(fieldname)) patch[fieldname] = undefined;
      }
    }
    // Người dùng đổi Item lần nữa trước khi các Link mặc định tải xong: kết quả cũ phải bị bỏ,
    // nếu không màu/UOM của mặt hàng trước sẽ chui vào dòng mới rồi bị server từ chối lúc lưu.
    if (itemLoadVersion.current.get(loadKey) !== loadVersion) return;
    if (Object.keys(patch).length === 0) return;
    const merged = base.map((r, i) => (i === rowIdx ? { ...r, ...patch } : r));
    // Đơn giá vừa mồi xong thì thành tiền phải theo ngay, không đợi người dùng chạm vào ô.
    const computed = merged.map((r, i) => (i === rowIdx ? withComputed(r) : r));
    emitRows(computed);
    const formulaVersion = (formulaLoadVersion.current.get(loadKey) ?? 0) + 1;
    formulaLoadVersion.current.set(loadKey, formulaVersion);
    void fillDoorFormula(rowIdx, computed, loadKey, formulaVersion);
  };
  /**
   * Dòng mới mang sẵn giá trị mặc định của field và của BỐI CẢNH đang chọn.
   *
   * Trước đây dòng mới hoàn toàn trắng, nên thủ kho phải chọn lại đúng một cái kho cho từng
   * dòng, mỗi lần lập phiếu. Mặc định của field (`default` trong metadata) cũng bị bỏ qua ở
   * bảng con dù form cha vẫn dùng — hai chỗ cùng một khái niệm mà hành xử khác nhau.
   */
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
    emitRows([...rows, seed]);
  };
  const delRow = (idx: number) => emitRows(rows.filter((_, i) => i !== idx));

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
      const value = Number(row[column.fieldname]);
      if (Number.isFinite(value)) { sum += value; seen = true; }
    }
    if (seen) totals.set(column.fieldname, sum);
  }

  return (
    <div className="mf-grid space-y-2">
      {/* CUỘN NGANG, không cắt. `overflow-hidden` trước đây giấu mất các cột phía sau mà
          không để lại dấu hiệu nào — bảng chỉ đơn giản là thiếu cột. Cột "#" GHIM lại bên
          trái khi cuộn, cách MISA làm, để không lạc dòng khi kéo sang phải. */}
      <div className="overflow-x-auto rounded-md border">
        <Table className="table-fixed" style={{ minWidth: `${minWidthRem}rem` }}>
          <colgroup>
            <col style={{ width: "2.5rem" }} />
            {cols.map((c) => (
              <col key={c.fieldname} {...(c.fieldname === flexible ? {} : { style: { width: columnWidth(c) } })} />
            ))}
            {!readOnly ? <col style={{ width: "4.5rem" }} /> : null}
          </colgroup>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="sticky left-0 z-10 w-10 bg-card text-right">#</TableHead>
              {cols.map((c) => (
                <TableHead key={c.fieldname} className={`truncate whitespace-nowrap ${stickyIdentity(c.fieldname)}`}>
                  {c.label ?? c.fieldname}
                  {c.reqd ? <span className="mf-required ml-0.5 text-destructive">*</span> : null}
                </TableHead>
              ))}
              {!readOnly ? <TableHead className="w-10" /> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, ri) => (
              <TableRow key={String(row.name ?? ri)} className="hover:bg-transparent">
                <TableCell className="sticky left-0 z-10 bg-card text-right text-xs text-muted-foreground">{ri + 1}</TableCell>
                {cols.map((c) => {
                  const Control = registry.resolve(c.fieldtype) ?? FallbackControl;
                  // P1-06 canonical: trạng thái field con theo depends_on/read_only_depends_on/docstatus,
                  // eval trong ngữ cảnh row (doc) + doc cha (parent). assumeWritable: quyền ghi bảng con
                  // KẾ THỪA từ cha (DocType con permissions rỗng) — grid đã gate bằng readOnly field cha
                  // (H1). Vẫn tôn trọng read_only/read_only_depends_on/docstatus + masked_fields server.
                  const rf = resolveField(c, childMeta, { doc: row, parent: parentDoc, roles, assumeWritable: true });
                  if (!rf.visible) {
                    return <TableCell key={c.fieldname} className={`align-top text-center text-xs text-muted-foreground ${stickyIdentity(c.fieldname)}`}>—</TableCell>;
                  }
                  return (
                    <TableCell key={c.fieldname} className={`align-top ${stickyIdentity(c.fieldname)}`}>
                      <Control
                        field={c}
                        value={row[c.fieldname]}
                        onChange={(v: unknown) => setCell(ri, c.fieldname, v)}
                        readOnly={readOnly || rf.readOnly}
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
                  <TableCell className="whitespace-nowrap">
                    <Button type="button" variant="ghost" size="icon-sm" className="text-muted-foreground" onClick={() => setDetailRow(ri)} aria-label="Chi tiết dòng" title="Chi tiết dòng">
                      <Maximize2 />
                    </Button>
                    <Button type="button" variant="ghost" size="icon-sm" className="text-muted-foreground hover:text-destructive" onClick={() => delRow(ri)} aria-label={t("grid.remove_row")}>
                      <X />
                    </Button>
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
            {rows.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell className="h-16 text-center text-muted-foreground" colSpan={cols.length + 2}>
                  {t("grid.empty")}
                </TableCell>
              </TableRow>
            ) : null}
            {rows.length > 0 && totals.size > 0 ? (
              <TableRow className="border-t-2 bg-muted/40 font-medium hover:bg-muted/40">
                <TableCell className="sticky left-0 z-10 bg-muted/40 text-right text-xs text-muted-foreground">Σ</TableCell>
                {cols.map((c) => (
                  <TableCell key={c.fieldname} className="whitespace-nowrap text-right tabular-nums">
                    {totals.has(c.fieldname)
                      ? (services?.fmt?.number
                          ? services.fmt.number(totals.get(c.fieldname)!)
                          : totals.get(c.fieldname)!.toLocaleString("vi-VN"))
                      : null}
                  </TableCell>
                ))}
                {!readOnly ? <TableCell /> : null}
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>
      {!readOnly ? (
        <Button type="button" variant="outline" size="sm" onClick={addRow}>
          <Plus /> {t("grid.add_row")}
        </Button>
      ) : null}

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
          {detailRow != null && rows[detailRow] ? (
            <div className="grid grid-cols-1 gap-x-3 gap-y-3 px-5 pb-5 sm:grid-cols-2 lg:grid-cols-3">
              {(childMeta.fields ?? []).filter((f) => !isLayout(f.fieldtype)).map((f) => {
                const row = rows[detailRow]!;
                const rf = resolveField(f, childMeta, { doc: row, parent: parentDoc, roles, assumeWritable: true });
                if (!rf.visible) return null;
                const Control = registry.resolve(f.fieldtype) ?? FallbackControl;
                return (
                  <div key={f.fieldname} className={`grid min-w-0 gap-1.5 ${detailFieldSpan(f)}`}>
                    <label className="text-sm font-medium" htmlFor={`detail-${f.fieldname}`}>
                      {f.label ?? f.fieldname}
                      {f.reqd ? <span className="mf-required ml-0.5 text-destructive">*</span> : null}
                    </label>
                    <Control
                      field={f}
                      value={row[f.fieldname]}
                      onChange={(v: unknown) => setCell(detailRow, f.fieldname, v)}
                      readOnly={readOnly || rf.readOnly}
                      masked={rf.masked}
                      services={services}
                      docname={String(row.name ?? "")}
                      linkTarget={dynamicLinkTarget(f, row)}
                      parentDoctype={childMeta.name}
                      docValues={row}
                      roles={roles}
                    />
                  </div>
                );
              })}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
