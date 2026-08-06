import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  CheckCircle2,
  Columns3,
  Copy,
  FileSpreadsheet,
  Maximize2,
  Plus,
  Printer,
  RotateCcw,
  Trash2,
  TriangleAlert,
  Undo2,
  X,
} from "lucide-react";
import type { Doc, DocField } from "@metaforge/core";
import { useMetaForge } from "@metaforge/views/provider";
import {
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  toast,
} from "@metaforge/ui";

type CalculationMode = "QUANTITY" | "HEIGHT" | "WIDTH" | "AREA";
type Json = Record<string, unknown>;
type MasterKind = "Customer" | "Supplier";

type FormulaResult = Json & {
  policy_name?: string;
  formula_version?: string;
  door_type?: string;
  width_basis?: string;
  sales_width_basis?: string;
  area_per_set_sqm?: number;
  billable_area_sqm?: number;
  cut_width_m?: number;
  total_leaf_count?: number;
  stock_profile_item?: string | null;
  stock_profile_error?: string | null;
  leaf_error?: string | null;
};

type ItemContext = {
  item_group?: string;
  selected_uom?: string;
  allowed_uoms?: string[];
  warehouse?: string | null;
  managed_stock?: boolean;
  available_qty?: number | null;
  rate?: number | null;
  currency?: string;
  price_missing?: boolean;
  price_error?: string | null;
  stock_read_error?: string | null;
};

type CustomerState = {
  name: string;
  group: string;
  phone: string;
  address: string;
};

type SaleLine = {
  id: string;
  itemCode: string;
  itemName: string;
  itemGroup: string;
  doorType: string;
  mode: CalculationMode;
  color: string;
  requireColor: boolean;
  thickness: string;
  fixedThickness: boolean;
  height: string;
  width: string;
  widthBasis: string;
  qty: string;
  rate: number | null;
  uom: string;
  allowedUoms: string[];
  currency: string;
  warehouse: string;
  discountPct: string;
  discountTouched: boolean;
  formula: FormulaResult | null;
  managedStock: boolean;
  stockQty: number | null;
  stockShort: number | null;
  stockMessage: string;
  busy: boolean;
  error: string;
};

type ColumnKey = "itemCode" | "color" | "thickness" | "height" | "width" | "area" | "qty" | "rate" | "discount" | "uom" | "amount";
type ColumnDef = { key: ColumnKey; label: string; width: number; numeric?: boolean; unit?: string };

const COLUMNS: ColumnDef[] = [
  { key: "itemCode", label: "SẢN PHẨM", width: 13 },
  { key: "color", label: "MÀU", width: 6.5 },
  { key: "thickness", label: "DÀY", width: 5, unit: "mm" },
  { key: "height", label: "CAO", width: 5, numeric: true, unit: "m" },
  { key: "width", label: "RỘNG", width: 5.5, numeric: true, unit: "m" },
  { key: "area", label: "DT", width: 5, numeric: true, unit: "m²" },
  { key: "qty", label: "SL", width: 3.8, numeric: true },
  { key: "rate", label: "Đ.GIÁ", width: 6.5, numeric: true },
  { key: "discount", label: "CK %", width: 4.5, numeric: true },
  { key: "uom", label: "ĐVT", width: 4.5 },
  { key: "amount", label: "TT", width: 7.5, numeric: true },
];

const STANDARD_PRICE_LIST = "Giá niêm yết";
const LAYOUT_KEY = "alumdoor-sales-sheet-columns-v2";
const ORDER_KEY = `${LAYOUT_KEY}-order`;
const WIDTH_KEY = `${LAYOUT_KEY}-widths`;
const DEFAULT_ORDER = COLUMNS.map((column) => column.key);

const today = () => {
  const value = new Date();
  return new Date(value.valueOf() - value.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
};

const checked = (value: unknown) => value === true || value === 1 || value === "1" || ["true", "yes", "có", "co"].includes(String(value ?? "").trim().toLocaleLowerCase("vi"));
const decimal = (value: unknown) => Number(String(value ?? "").trim().replace(",", "."));
const positive = (value: unknown) => Number.isFinite(decimal(value)) && decimal(value) > 0;
const integerPositive = (value: unknown) => Number.isInteger(decimal(value)) && decimal(value) > 0;
const normalize = (value: unknown) => String(value ?? "").normalize("NFC").trim().toLocaleLowerCase("vi");
const money = (value: unknown) => Number.isFinite(Number(value)) ? Number(value).toLocaleString("vi-VN", { maximumFractionDigits: 0 }) : "";
const number = (value: unknown, digits = 3) => Number.isFinite(Number(value)) ? Number(value).toLocaleString("vi-VN", { maximumFractionDigits: digits }) : "";
const escapeHtml = (value: unknown) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");
const clampWidth = (value: number, min = 3.5, max = 28) => Math.max(min, Math.min(max, Math.round(value * 2) / 2));

function loadOrder(): ColumnKey[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(ORDER_KEY) ?? "[]") as ColumnKey[];
    const valid = parsed.filter((key) => DEFAULT_ORDER.includes(key));
    return [...valid, ...DEFAULT_ORDER.filter((key) => !valid.includes(key))];
  } catch { return DEFAULT_ORDER; }
}

function loadWidths(): Partial<Record<ColumnKey, number>> {
  try {
    const parsed = JSON.parse(localStorage.getItem(WIDTH_KEY) ?? "{}") as Partial<Record<ColumnKey, number>>;
    return Object.fromEntries(Object.entries(parsed).filter(([, width]) => Number.isFinite(Number(width)))) as Partial<Record<ColumnKey, number>>;
  } catch { return {}; }
}

function canonicalCustomerGroup(value: unknown): string {
  const raw = String(value ?? "").trim();
  const normalized = normalize(raw);
  if (!normalized) return "";
  if (normalized.includes("đại lý") || normalized.includes("dai ly") || normalized.includes("dealer")) return "Đại lý";
  if (normalized === "lẻ" || normalized.includes("khách lẻ") || normalized.includes("khach le") || normalized.includes("bán lẻ") || normalized.includes("ban le") || normalized.includes("retail") || normalized.includes("công trình") || normalized.includes("cong trinh") || normalized.includes("nhà thầu") || normalized.includes("nha thau")) return "Lẻ";
  return raw;
}

function widthBasisTitle(value: unknown): string {
  const basis = String(value ?? "").trim();
  const normalized = normalize(basis);
  if (normalized === "phủ bì nhựa") return "RỘNG PB NHỰA";
  if (normalized === "phủ bì ray") return "RỘNG PB RAY";
  if (normalized === "rộng cắt lá") return "RỘNG CẮT LÁ";
  return basis ? `RỘNG ${basis.toLocaleUpperCase("vi")}` : "RỘNG";
}

function newLine(): SaleLine {
  return {
    id: `sale-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    itemCode: "",
    itemName: "",
    itemGroup: "",
    doorType: "",
    mode: "QUANTITY",
    color: "",
    requireColor: false,
    thickness: "",
    fixedThickness: false,
    height: "",
    width: "",
    widthBasis: "",
    qty: "",
    rate: null,
    uom: "",
    allowedUoms: [],
    currency: "",
    warehouse: "",
    discountPct: "",
    discountTouched: false,
    formula: null,
    managedStock: true,
    stockQty: null,
    stockShort: null,
    stockMessage: "",
    busy: false,
    error: "",
  };
}

function calculationMode(item: Json): CalculationMode {
  const code = String(item.item_code ?? item.name ?? "").trim().toLocaleUpperCase("vi");
  const group = normalize(item.item_group);
  const inventory = String(item.inventory_mode ?? "").trim();
  if (inventory === "Thành phẩm theo m2" || String(item.door_type ?? "").trim() || group.startsWith("cửa")) return "AREA";
  if (code.startsWith("RAY-") || group.includes("ray")) return "HEIGHT";
  if (code.startsWith("TRUC-") || group.includes("trục")) return "WIDTH";
  return "QUANTITY";
}

function discountRate(line: SaleLine): number {
  if (!line.discountPct.trim()) return 0;
  const parsed = decimal(line.discountPct);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 100 ? parsed : 0;
}

function areaPerSet(line: SaleLine): number | null {
  if (line.mode !== "AREA") return null;
  const authoritative = line.formula?.area_per_set_sqm;
  if (authoritative != null && Number.isFinite(Number(authoritative))) return Number(authoritative);
  const height = decimal(line.height);
  const width = decimal(line.width);
  return Number.isFinite(height) && height > 0 && Number.isFinite(width) && width > 0 ? height * width : null;
}

function billableQty(line: SaleLine): number {
  const sets = decimal(line.qty);
  if (!Number.isFinite(sets) || sets <= 0) return 0;
  if (line.mode === "AREA") return Number(line.formula?.billable_area_sqm ?? 0);
  if (line.mode === "HEIGHT") return decimal(line.height) * sets;
  if (line.mode === "WIDTH") return decimal(line.width) * sets;
  return sets;
}

function grossAmount(line: SaleLine): number {
  return billableQty(line) * Number(line.rate ?? 0);
}
function lineDiscountAmount(line: SaleLine): number { return grossAmount(line) * discountRate(line) / 100; }
function netAmount(line: SaleLine): number { return grossAmount(line) - lineDiscountAmount(line); }

function SheetLink({ doctype, value, onChange, readOnly, required, fieldname }: {
  doctype: string;
  value: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
  required?: boolean;
  fieldname: string;
}) {
  const { registry, services } = useMetaForge();
  const Control = registry.resolve("Link");
  const field: DocField = { fieldname, label: fieldname, fieldtype: "Link", options: doctype, ...(required ? { reqd: 1 as const } : {}) };
  return Control
    ? <Control field={field} value={value} onChange={(next: unknown) => onChange(String(next ?? ""))} readOnly={readOnly} required={required} services={services} linkTarget={doctype} docValues={{}} compact />
    : <Input value={value} readOnly />;
}

function HeaderLink({ label, doctype, value, onChange, required, readOnly }: {
  label: string;
  doctype: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  readOnly?: boolean;
}) {
  return <div className="grid min-w-0 gap-1">
    <Label className="text-[11px] font-semibold">{label}{required ? <span className="text-red-600"> *</span> : null}</Label>
    <div className={required && !value ? "ring-1 ring-inset ring-red-500" : ""}>
      <SheetLink doctype={doctype} value={value} onChange={onChange} required={required} readOnly={readOnly} fieldname={`sales_sheet_${doctype.replaceAll(" ", "_").toLocaleLowerCase("vi")}`} />
    </div>
  </div>;
}

export function AlumdoorSalesSheetV2() {
  const { adapter, businessContext } = useMetaForge();
  const gridRef = useRef<HTMLDivElement | null>(null);
  const previewGeneration = useRef(0);
  const contextCompany = String(businessContext.company ?? "").trim();
  const contextWarehouse = String(businessContext.warehouse ?? "").trim();

  const [company, setCompany] = useState(contextCompany);
  const [currency, setCurrency] = useState("");
  const [priceList, setPriceList] = useState("");
  const [priceListError, setPriceListError] = useState("");
  const [customer, setCustomer] = useState<CustomerState>({ name: "", group: "", phone: "", address: "" });
  const [transactionDate, setTransactionDate] = useState(today());
  const [deliveryDate, setDeliveryDate] = useState(today());
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<SaleLine[]>([newLine()]);
  const [thicknessOptions, setThicknessOptions] = useState<string[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [lastDeleted, setLastDeleted] = useState<Array<{ line: SaleLine; index: number }> | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [detailIndex, setDetailIndex] = useState<number | null>(null);
  const [columnDialog, setColumnDialog] = useState(false);
  const [quickMaster, setQuickMaster] = useState<MasterKind | null>(null);
  const [hiddenColumns, setHiddenColumns] = useState<ColumnKey[]>(() => {
    try { return JSON.parse(localStorage.getItem(LAYOUT_KEY) ?? "[]") as ColumnKey[]; } catch { return []; }
  });
  const [columnOrder, setColumnOrder] = useState<ColumnKey[]>(loadOrder);
  const [columnWidths, setColumnWidths] = useState<Partial<Record<ColumnKey, number>>>(loadWidths);
  const [draggingColumn, setDraggingColumn] = useState<ColumnKey | null>(null);
  const [picked, setPicked] = useState({ line: 0, column: 0 });
  const [saving, setSaving] = useState<"" | "draft" | "submit">("");
  const [createdOrder, setCreatedOrder] = useState<Doc | null>(null);
  const [globalError, setGlobalError] = useState("");
  const submitted = Boolean(createdOrder && Number(createdOrder.docstatus ?? 0) === 1);

  const orderedColumns = useMemo(() => columnOrder.map((key) => COLUMNS.find((column) => column.key === key)).filter((column): column is ColumnDef => Boolean(column)), [columnOrder]);
  const visibleColumns = useMemo(() => orderedColumns.filter((column) => !hiddenColumns.includes(column.key)), [hiddenColumns, orderedColumns]);
  const canonicalGroup = canonicalCustomerGroup(customer.group);
  const activeWidthBases = useMemo(() => [...new Set(lines.filter((line) => line.itemCode && line.mode === "AREA").map((line) => line.widthBasis).filter(Boolean))], [lines]);
  const widthColumnLabel = activeWidthBases.length === 1 ? widthBasisTitle(activeWidthBases[0]) : "RỘNG";
  const columnLabel = (column: ColumnDef) => column.key === "width" ? widthColumnLabel : column.label;
  const columnWidth = (column: ColumnDef) => columnWidths[column.key] ?? column.width;

  useEffect(() => { try { localStorage.setItem(ORDER_KEY, JSON.stringify(columnOrder)); } catch { /* presentation only */ } }, [columnOrder]);
  useEffect(() => { try { localStorage.setItem(WIDTH_KEY, JSON.stringify(columnWidths)); } catch { /* presentation only */ } }, [columnWidths]);
  useEffect(() => { if (contextCompany) setCompany(contextCompany); }, [contextCompany]);

  useEffect(() => {
    if (!company) { setCurrency(""); return; }
    let active = true;
    void adapter.getDoc("Company", company).then(({ doc }) => {
      if (active) setCurrency(String(doc.default_currency ?? doc.currency ?? "").trim());
    }).catch((error) => {
      if (active) { setCurrency(""); setGlobalError(adapter.mapError(error).message); }
    });
    return () => { active = false; };
  }, [adapter, company]);

  useEffect(() => {
    let active = true;
    void adapter.getList("Material Specification", {
      fields: ["thickness_mm", "disabled"], filters: [["disabled", "=", 0]], pageLength: 1000,
    }).then((rows) => {
      if (!active) return;
      const values = [...new Set(rows.map((row) => Number(row.thickness_mm)).filter((value) => Number.isFinite(value) && value > 0).map((value) => String(value).replace(".", ",")))]
        .sort((left, right) => decimal(left) - decimal(right));
      setThicknessOptions(values);
    }).catch(() => { if (active) setThicknessOptions([]); });
    return () => { active = false; };
  }, [adapter]);

  useEffect(() => {
    const name = customer.name.trim();
    if (!name) {
      setCustomer({ name: "", group: "", phone: "", address: "" });
      setPriceList("");
      setPriceListError("");
      return;
    }
    let active = true;
    void (async () => {
      try {
        const { doc } = await adapter.getDoc("Customer", name);
        const group = canonicalCustomerGroup(doc.price_group ?? doc.customer_group ?? "");
        const preferred = String(doc.default_price_list ?? doc.selling_price_list ?? doc.price_list ?? "").trim();
        const candidates = [...new Set([preferred, STANDARD_PRICE_LIST].filter(Boolean))];
        const activeLists = await adapter.getList("Price List", {
          fields: ["name", "price_list_name", "disabled"], filters: [["disabled", "=", 0]], orderBy: "name asc", pageLength: 100,
        }).catch(() => [] as Doc[]);
        const names = activeLists.map((row) => String(row.name ?? row.price_list_name ?? "").trim()).filter(Boolean);
        if (group === "Đại lý") candidates.push(...names.filter((entry) => normalize(entry).includes("đại lý") || normalize(entry).includes("dai ly") || normalize(entry).includes("dealer")));
        if (group === "Lẻ") candidates.push(...names.filter((entry) => normalize(entry).includes("lẻ") || normalize(entry).includes("ban le") || normalize(entry).includes("retail")));
        if (names.length === 1) candidates.push(names[0]!);
        let resolved = "";
        for (const candidate of [...new Set(candidates.filter(Boolean))]) {
          try {
            const { doc: list } = await adapter.getDoc("Price List", candidate);
            if (!checked(list.disabled)) { resolved = candidate; break; }
          } catch { /* compatibility bridge may supply active projection */ }
        }
        if (!active) return;
        setCustomer((current) => ({
          ...current,
          group,
          phone: String(doc.phone ?? doc.mobile_no ?? "").trim(),
          address: String(doc.install_address ?? doc.address ?? "").trim(),
        }));
        setPriceList(resolved);
        setPriceListError(resolved ? "" : "Chưa xác định được bảng giá bán; hệ thống sẽ thử giá chuẩn của mặt hàng.");
      } catch (error) {
        if (!active) return;
        setPriceList("");
        setPriceListError("");
        setGlobalError(adapter.mapError(error).message);
      }
    })();
    return () => { active = false; };
  }, [adapter, customer.name]);

  const patchLine = (index: number, patch: Partial<SaleLine>) => {
    setLines((current) => current.map((line, lineIndex) => lineIndex === index ? { ...line, ...patch } : line));
  };

  const refreshMeasurementBasis = async (index: number, itemCode: string) => {
    if (!itemCode || !["Đại lý", "Lẻ"].includes(canonicalGroup)) return;
    try {
      const context = await adapter.callPost<FormulaResult>("alumdoor.sales.production_line_context", {
        item_code: itemCode,
        customer_group: canonicalGroup,
        sales_mode: "Trọn bộ",
        basis_only: true,
      });
      const nextBasis = String(context.width_basis ?? "").trim();
      if (!nextBasis) return;
      setLines((current) => current.map((entry, lineIndex) => {
        if (lineIndex !== index || entry.itemCode !== itemCode) return entry;
        const basisChanged = Boolean(entry.widthBasis && entry.widthBasis !== nextBasis);
        return {
          ...entry,
          widthBasis: nextBasis,
          ...(basisChanged ? { width: "", formula: null, stockShort: null, stockMessage: "" } : {}),
        };
      }));
    } catch (error) {
      patchLine(index, { error: adapter.mapError(error).message });
    }
  };

  const refreshContext = async (index: number, itemCode: string, requestedUom = "") => {
    if (!itemCode) return;
    try {
      const context = await adapter.callPost<ItemContext>("alumdoor.sales.item_context", {
        item_code: itemCode,
        ...(requestedUom ? { uom: requestedUom } : {}),
        ...(priceList ? { price_list: priceList } : {}),
        ...(currency ? { currency } : {}),
        ...(contextWarehouse ? { warehouse: contextWarehouse } : {}),
      });
      const allowedUoms = [...new Set((context.allowed_uoms ?? []).map((value) => String(value ?? "").trim()).filter(Boolean))];
      const selectedUom = String(context.selected_uom ?? requestedUom ?? "").trim();
      if (selectedUom && !allowedUoms.includes(selectedUom)) allowedUoms.unshift(selectedUom);
      patchLine(index, {
        rate: context.price_missing || context.rate == null ? null : Number(context.rate),
        uom: selectedUom,
        allowedUoms,
        currency: String(context.currency ?? currency).trim() || currency,
        warehouse: String(context.warehouse ?? contextWarehouse ?? "").trim(),
        managedStock: context.managed_stock !== false,
        stockQty: context.available_qty == null ? null : Number(context.available_qty),
        error: context.price_missing || context.rate == null ? String(context.price_error ?? "Chưa có đơn giá bán theo ĐVT đã chọn.") : String(context.stock_read_error ?? ""),
      });
    } catch (error) {
      patchLine(index, { rate: null, error: adapter.mapError(error).message });
    }
  };

  const changeUom = async (index: number, uom: string) => {
    const line = lines[index];
    if (!line?.itemCode) return;
    patchLine(index, { uom, rate: null, stockQty: null, error: "" });
    await refreshContext(index, line.itemCode, uom);
  };

  const chooseItem = async (index: number, itemCode: string) => {
    if (!itemCode) {
      patchLine(index, { ...newLine(), id: lines[index]?.id ?? newLine().id });
      return;
    }
    const previous = lines[index];
    patchLine(index, {
      itemCode, itemName: "", itemGroup: "", doorType: "", mode: "QUANTITY",
      color: "", requireColor: false, thickness: "", fixedThickness: false,
      height: "", width: "", widthBasis: "", qty: previous?.qty || "1", rate: null, uom: "", allowedUoms: [], currency: "", warehouse: "",
      formula: null, stockQty: null, stockShort: null, stockMessage: "", busy: true, error: "",
      discountPct: previous?.discountTouched ? previous.discountPct : "",
    });
    try {
      const { doc } = await adapter.getDoc("Item", itemCode);
      const mode = calculationMode(doc as Json);
      let requireColor = false;
      let thickness = "";
      let fixedThickness = false;
      const profileName = String(doc.measurement_profile ?? "").trim();
      if (profileName) {
        try {
          const { doc: profile } = await adapter.getDoc("Measurement Profile", profileName);
          requireColor = checked(profile.require_color);
        } catch { /* presentation enhancement only */ }
      }
      const specification = String(doc.material_specification ?? "").trim();
      if (specification) {
        try {
          const { doc: spec } = await adapter.getDoc("Material Specification", specification);
          const value = Number(spec.thickness_mm);
          if (Number.isFinite(value) && value > 0) {
            thickness = String(value).replace(".", ",");
            fixedThickness = true;
          }
        } catch { /* presentation enhancement only */ }
      }
      patchLine(index, {
        itemCode,
        itemName: String(doc.item_name ?? itemCode).trim() || itemCode,
        itemGroup: String(doc.item_group ?? "").trim(),
        doorType: String(doc.door_type ?? "").trim(),
        mode,
        requireColor,
        color: requireColor ? String(doc.default_color ?? "").trim() : "",
        thickness,
        fixedThickness,
        height: "",
        width: "",
        widthBasis: "",
        qty: previous?.qty || "1",
        discountPct: previous?.discountTouched ? previous.discountPct : "",
        formula: null,
        busy: false,
        error: "",
      });
      await Promise.all([
        refreshContext(index, itemCode),
        mode === "AREA" ? refreshMeasurementBasis(index, itemCode) : Promise.resolve(),
      ]);
    } catch (error) {
      patchLine(index, { busy: false, error: adapter.mapError(error).message });
    }
  };

  useEffect(() => {
    lines.forEach((line, index) => { if (line.itemCode) void refreshContext(index, line.itemCode, line.uom); });
    // pricing/context refresh is driven only by authority inputs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [priceList, currency, contextWarehouse]);

  useEffect(() => {
    if (!["Đại lý", "Lẻ"].includes(canonicalGroup)) return;
    lines.forEach((line, index) => { if (line.itemCode && line.mode === "AREA") void refreshMeasurementBasis(index, line.itemCode); });
    // basis refresh is driven by canonical customer group; basis changes invalidate entered width.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canonicalGroup]);

  const calculationFingerprint = useMemo(() => JSON.stringify({
    customerGroup: canonicalGroup,
    deliveryDate,
    lines: lines.map((line) => ({ itemCode: line.itemCode, mode: line.mode, color: line.color, height: line.height, width: line.width, widthBasis: line.widthBasis, qty: line.qty, warehouse: line.warehouse })),
  }), [canonicalGroup, deliveryDate, lines]);

  useEffect(() => {
    const generation = ++previewGeneration.current;
    const timer = window.setTimeout(() => {
      void Promise.all(lines.map(async (line, index) => {
        if (line.mode !== "AREA" || !line.itemCode || !positive(line.height) || !positive(line.width) || !integerPositive(line.qty) || !["Đại lý", "Lẻ"].includes(canonicalGroup)) {
          if (line.mode === "AREA") patchLine(index, { formula: null, stockShort: null, stockMessage: "" });
          return;
        }
        patchLine(index, { busy: true });
        try {
          const formula = await adapter.callPost<FormulaResult>("alumdoor.sales.production_line_context", {
            item_code: line.itemCode,
            customer_group: canonicalGroup,
            sales_mode: "Trọn bộ",
            ...(line.widthBasis ? { width_input_basis: line.widthBasis } : {}),
            height_input_basis: "Cao phủ bì",
            width_m: decimal(line.width),
            height_m: decimal(line.height),
            set_count: decimal(line.qty),
            ...(line.color ? { color: line.color } : {}),
            delivery_date: deliveryDate,
          });
          let stockShort: number | null = null;
          let stockMessage = "";
          const warehouse = line.warehouse || contextWarehouse;
          if (warehouse && formula.stock_profile_item && !formula.leaf_error && !formula.stock_profile_error) {
            const cutWidth = Number(formula.cut_width_m);
            const sheets = Number(formula.total_leaf_count);
            if (Number.isFinite(cutWidth) && cutWidth > 0 && Number.isFinite(sheets) && sheets > 0) {
              const stock = await adapter.callPost<{ short?: number; message?: string }>("alumdoor.cut.propose", {
                item_code: formula.stock_profile_item,
                warehouse,
                ...(line.color ? { color: line.color, colour: line.color } : {}),
                cut_width_m: cutWidth,
                sheets,
              });
              stockShort = Number(stock.short ?? 0);
              stockMessage = String(stock.message ?? "");
            }
          }
          if (generation !== previewGeneration.current) return;
          setLines((current) => current.map((entry, lineIndex) => lineIndex === index ? {
            ...entry,
            formula,
            widthBasis: String(formula.width_basis ?? entry.widthBasis ?? "").trim(),
            doorType: String(formula.door_type ?? entry.doorType ?? ""),
            stockShort,
            stockMessage,
            busy: false,
            error: String(formula.leaf_error ?? formula.stock_profile_error ?? entry.error ?? ""),
          } : entry));
        } catch (error) {
          if (generation !== previewGeneration.current) return;
          patchLine(index, { formula: null, busy: false, stockShort: null, stockMessage: "", error: adapter.mapError(error).message });
        }
      }));
    }, 300);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calculationFingerprint, adapter]);

  const grossTotal = useMemo(() => lines.reduce((sum, line) => sum + grossAmount(line), 0), [lines]);
  const totalDiscount = useMemo(() => lines.reduce((sum, line) => sum + lineDiscountAmount(line), 0), [lines]);
  const totalVat = 0;
  const totalSurcharge = 0;
  const total = grossTotal - totalDiscount + totalVat + totalSurcharge;

  const blockers = useMemo(() => {
    const out: string[] = [];
    if (!company) out.push("Cần Công ty mặc định trong thiết lập hệ thống.");
    if (!customer.name) out.push("Cần chọn Khách hàng.");
    if (!currency) out.push("Chưa xác định tiền tệ bán.");
    if (!transactionDate) out.push("Cần ngày đặt hàng.");
    if (!deliveryDate) out.push("Cần ngày giao hàng.");
    if (deliveryDate && transactionDate && deliveryDate < transactionDate) out.push("Ngày giao phải bằng hoặc sau ngày đặt hàng.");
    if (!lines.some((line) => line.itemCode)) out.push("Cần ít nhất một mặt hàng.");
    for (const [index, line] of lines.entries()) {
      if (!line.itemCode) continue;
      if (!integerPositive(line.qty)) out.push(`Dòng ${index + 1}: cần SL.`);
      if (line.requireColor && !line.color) out.push(`Dòng ${index + 1}: cần Màu sắc.`);
      if (line.mode === "HEIGHT" && !positive(line.height)) out.push(`Dòng ${index + 1}: cần Chiều cao.`);
      if (line.mode === "WIDTH" && !positive(line.width)) out.push(`Dòng ${index + 1}: cần Chiều rộng.`);
      if (line.mode === "AREA" && !line.widthBasis) out.push(`Dòng ${index + 1}: chưa xác định loại chiều rộng từ chính sách.`);
      if (line.mode === "AREA" && (!positive(line.height) || !positive(line.width))) out.push(`Dòng ${index + 1}: cần Chiều cao và ${widthBasisTitle(line.widthBasis)}.`);
      if (line.mode === "AREA" && !line.formula?.billable_area_sqm) out.push(`Dòng ${index + 1}: chưa tính xong diện tích cửa.`);
      if (line.rate == null) out.push(`Dòng ${index + 1}: chưa có đơn giá bán cho ${line.uom || "ĐVT đã chọn"}.`);
      if (!line.uom) out.push(`Dòng ${index + 1}: chưa xác định ĐVT bán.`);
      if (line.discountPct.trim()) {
        const discount = decimal(line.discountPct);
        if (!Number.isFinite(discount) || discount < 0 || discount > 100) out.push(`Dòng ${index + 1}: CK phải từ 0 đến 100%.`);
      }
      if (line.error) out.push(`Dòng ${index + 1}: ${line.error}`);
      if (line.mode === "AREA" && Number(line.stockShort ?? 0) > 0) out.push(`Dòng ${index + 1}: ${line.stockMessage || `thiếu ${line.stockShort} lá nhôm`}.`);
      if (line.mode !== "AREA" && line.managedStock && line.stockQty != null && billableQty(line) > line.stockQty) out.push(`Dòng ${index + 1}: tồn kho không đủ.`);
    }
    return out;
  }, [company, currency, customer.name, deliveryDate, lines, transactionDate]);

  const buildItems = () => lines.filter((line) => line.itemCode).map((line, index) => {
    const discount = discountRate(line);
    const listRate = Number(line.rate ?? 0);
    const common: Record<string, unknown> = {
      row_id: `SALES-SHEET-${index + 1}`,
      item_code: line.itemCode,
      uom: line.uom,
      qty: billableQty(line),
      rate: listRate * (1 - discount / 100),
      ...(line.warehouse ? { warehouse: line.warehouse } : {}),
      set_count: decimal(line.qty),
      ...(line.color ? { color: line.color } : {}),
      ...(positive(line.height) ? { height_m: decimal(line.height) } : {}),
      ...(positive(line.width) ? { width_m: decimal(line.width) } : {}),
      ...(line.widthBasis ? { width_basis: line.widthBasis } : {}),
      note: `Giá ${line.uom || ""} ${money(listRate)}${discount ? ` · Chiết khấu ${number(discount, 2)}%` : ""}${line.thickness ? ` · Độ dày ${line.thickness} mm` : ""}`,
    };
    if (line.mode === "AREA" && line.formula) Object.assign(common, {
      door_type: line.formula.door_type,
      formula_policy: line.formula.policy_name,
      formula_version: line.formula.formula_version,
      width_basis: line.formula.width_basis,
      cut_width_m: line.formula.cut_width_m,
      billable_area_sqm: line.formula.billable_area_sqm,
    });
    return common;
  });

  const saveOrder = async (draftOnly: boolean) => {
    setGlobalError("");
    if (blockers.length) { setGlobalError(blockers[0]!); return; }
    if (submitted) { setGlobalError(`Đơn ${createdOrder?.name} đã xác nhận. Hãy tạo đơn mới.`); return; }
    setSaving(draftOnly ? "draft" : "submit");
    const reservations: string[] = [];
    try {
      const existingDraft = createdOrder && Number(createdOrder.docstatus ?? 0) === 0 ? createdOrder : null;
      const payload: Partial<Doc> = {
        customer: customer.name,
        company,
        currency,
        transaction_date: transactionDate,
        delivery_date: deliveryDate,
        ...(priceList ? { selling_price_list: priceList } : {}),
        ...(canonicalGroup ? { customer_group: canonicalGroup } : {}),
        ...(customer.address ? { install_address: customer.address } : {}),
        ...(note.trim() ? { remarks: note.trim() } : {}),
        additional_discount_percentage: 0,
        items: buildItems(),
      };
      const saved = existingDraft
        ? await adapter.updateDoc("Sales Order", String(existingDraft.name), payload, String(existingDraft.modified ?? ""))
        : await adapter.createDoc("Sales Order", payload);
      setCreatedOrder(saved);
      if (draftOnly) {
        toast.success(existingDraft ? `Đã cập nhật nháp ${saved.name}.` : `Đã lưu nháp ${saved.name}.`);
        return;
      }
      for (const line of lines.filter((entry) => entry.itemCode && entry.mode === "AREA" && entry.formula?.stock_profile_item && entry.warehouse)) {
        const result = await adapter.callPost<{ reservation?: string }>("alumdoor.reserve.create", {
          item_code: String(line.formula?.stock_profile_item),
          warehouse: line.warehouse,
          ...(line.color ? { color: line.color } : {}),
          min_length_m: Number(line.formula?.cut_width_m),
          qty_reserved: Number(line.formula?.total_leaf_count),
          source_doctype: "Sales Order",
          source_name: saved.name,
          expires_at: new Date(`${deliveryDate}T23:59:59.999`).toISOString(),
        });
        const reservation = String(result.reservation ?? "").trim();
        if (reservation) reservations.push(reservation);
      }
      const finalDoc = await adapter.submit(saved);
      setCreatedOrder(finalDoc);
      toast.success(`Đã xác nhận đơn ${finalDoc.name}.`);
    } catch (error) {
      for (const reservation of reservations.reverse()) {
        try { await adapter.callPost("alumdoor.reserve.release", { reservation, released_reason: "Hoàn tác tự động vì xác nhận Sales Order không hoàn tất." }); } catch { /* server audit remains authoritative */ }
      }
      setGlobalError(adapter.mapError(error).message);
    } finally { setSaving(""); }
  };

  const addLines = (count: number) => setLines((current) => [...current, ...Array.from({ length: count }, () => newLine())]);
  const deleteIndexes = (indexes: number[]) => {
    const unique = [...new Set(indexes)].filter((index) => index >= 0 && index < lines.length).sort((a, b) => a - b);
    if (!unique.length) return;
    setLastDeleted(unique.map((index) => ({ line: lines[index]!, index })));
    const removing = new Set(unique);
    setLines((current) => current.filter((_, index) => !removing.has(index)));
    setSelected([]);
    setDetailIndex(null);
  };
  const undoDelete = () => {
    if (!lastDeleted?.length) return;
    setLines((current) => {
      const next = [...current];
      for (const entry of [...lastDeleted].sort((a, b) => a.index - b.index)) next.splice(Math.min(entry.index, next.length), 0, entry.line);
      return next;
    });
    setLastDeleted(null);
  };
  const duplicateSelected = () => {
    if (!selected.length) return;
    setLines((current) => [...current, ...current.filter((line) => selected.includes(line.id)).map((line) => ({ ...line, id: `sale-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` }))]);
    setSelected([]);
  };
  const saveHiddenColumns = (next: ColumnKey[]) => {
    setHiddenColumns(next);
    try { localStorage.setItem(LAYOUT_KEY, JSON.stringify(next)); } catch { /* presentation only */ }
  };
  const moveColumn = (source: ColumnKey, target: ColumnKey) => {
    if (source === target) return;
    setColumnOrder((current) => {
      const next = current.filter((key) => key !== source);
      const targetIndex = next.indexOf(target);
      next.splice(targetIndex < 0 ? next.length : targetIndex, 0, source);
      return next;
    });
  };
  const moveColumnBy = (key: ColumnKey, delta: number) => {
    setColumnOrder((current) => {
      const index = current.indexOf(key);
      const target = Math.max(0, Math.min(current.length - 1, index + delta));
      if (index < 0 || target === index) return current;
      const next = [...current];
      next.splice(index, 1);
      next.splice(target, 0, key);
      return next;
    });
  };
  const autoFitWidth = (column: ColumnDef) => {
    const header = `${columnLabel(column)}${column.unit ? ` (${column.unit})` : ""}`;
    const values = lines.flatMap((line) => {
      if (column.key === "itemCode") return [line.itemName || line.itemCode];
      if (column.key === "color") return [line.color];
      if (column.key === "thickness") return [line.thickness];
      if (column.key === "height") return [line.height];
      if (column.key === "width") return [line.width, line.widthBasis];
      if (column.key === "area") return [areaPerSet(line) == null ? "" : number(areaPerSet(line), 3)];
      if (column.key === "qty") return [line.qty];
      if (column.key === "rate") return [line.rate == null ? "" : money(line.rate)];
      if (column.key === "discount") return [line.discountPct ? `${line.discountPct}%` : ""];
      if (column.key === "uom") return [line.uom, ...line.allowedUoms];
      return [line.rate == null ? "" : money(grossAmount(line))];
    }).filter(Boolean);
    const maxChars = Math.max(header.length, ...values.map((value) => String(value).length));
    const min = column.key === "itemCode" ? 8 : 3.5;
    const max = column.key === "itemCode" ? 24 : 14;
    return clampWidth(maxChars * 0.56 + 1.8, min, max);
  };
  const autoFitAll = () => setColumnWidths(Object.fromEntries(COLUMNS.map((column) => [column.key, autoFitWidth(column)])) as Partial<Record<ColumnKey, number>>);
  const resetColumnLayout = () => {
    setColumnOrder(DEFAULT_ORDER);
    setColumnWidths({});
    saveHiddenColumns([]);
  };
  const beginResize = (event: React.PointerEvent<HTMLDivElement>, column: ColumnDef) => {
    event.preventDefault(); event.stopPropagation();
    const startX = event.clientX;
    const startWidth = columnWidth(column);
    const move = (pointer: PointerEvent) => {
      const width = clampWidth(startWidth + (pointer.clientX - startX) / 16, column.key === "itemCode" ? 8 : 3.5, column.key === "itemCode" ? 28 : 18);
      setColumnWidths((current) => ({ ...current, [column.key]: width }));
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  const startNew = () => {
    setCreatedOrder(null);
    setCustomer({ name: "", group: "", phone: "", address: "" });
    setPriceList(""); setPriceListError(""); setTransactionDate(today()); setDeliveryDate(today()); setNote("");
    setLines([newLine()]); setSelected([]); setGlobalError("");
  };

  const printHtml = () => {
    if (!createdOrder?.name) { setGlobalError("Cần lưu hoặc xác nhận đơn trước khi in."); return; }
    const bodyRows = lines.filter((line) => line.itemCode).map((line, index) => {
      const widthNote = line.mode === "AREA" ? String(line.widthBasis || line.formula?.sales_width_basis || line.formula?.width_basis || "") : "";
      const product = `<tr><td class="c">${index + 1}</td><td>${escapeHtml(line.itemName || line.itemCode)}</td><td>${escapeHtml(line.color)}</td><td class="c">${escapeHtml(line.thickness)}</td><td class="r">${escapeHtml(line.height)}</td><td class="r">${escapeHtml(line.width)}${widthNote ? `<div class="sub">${escapeHtml(widthNote)}</div>` : ""}</td><td class="r">${areaPerSet(line) == null ? "" : number(areaPerSet(line), 3)}</td><td class="r">${escapeHtml(line.qty)}</td><td class="r">${money(line.rate)}</td><td class="r">${escapeHtml(line.discountPct)}</td><td class="c">${escapeHtml(line.uom)}</td><td class="r b">${money(netAmount(line))}</td></tr>`;
      return product;
    }).join("");
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(String(createdOrder.name))}</title><style>@page{size:A4 landscape;margin:10mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#171717;font-size:11px;margin:0}h1{font-size:20px;margin:0 0 10px}.top{display:flex;justify-content:space-between;margin-bottom:10px}.meta,.sheet,.totals{border-collapse:collapse}.meta{width:100%;margin-bottom:10px}.meta td,.sheet th,.sheet td,.totals td{border:1px solid #bdbdbd;padding:5px}.sheet{width:100%;table-layout:fixed}.sheet th{background:#f97316;color:white;font-size:9px;white-space:nowrap}.r{text-align:right}.c{text-align:center}.b{font-weight:700}.sub{font-size:8px;color:#666}.totals{margin-left:auto;margin-top:10px;width:310px}.grand td{font-weight:700;font-size:13px}.note{margin-top:10px;white-space:pre-wrap}</style></head><body><div class="top"><div><h1>ĐƠN BÁN HÀNG</h1><div>${escapeHtml(String(createdOrder.name))}</div></div><b>${submitted ? "ĐÃ XÁC NHẬN" : "BẢN NHÁP"}</b></div><table class="meta"><tr><td><b>Khách hàng:</b> ${escapeHtml(customer.name)}</td><td><b>Bảng giá:</b> ${escapeHtml(priceList)}</td><td><b>Ngày đặt:</b> ${escapeHtml(transactionDate)}</td><td><b>Ngày giao:</b> ${escapeHtml(deliveryDate)}</td></tr><tr><td colspan="2"><b>Địa chỉ nhận:</b> ${escapeHtml(customer.address)}</td><td colspan="2"><b>Điện thoại:</b> ${escapeHtml(customer.phone)}</td></tr></table><table class="sheet"><thead><tr><th>STT</th><th>SẢN PHẨM</th><th>MÀU</th><th>DÀY</th><th>CAO</th><th>${escapeHtml(widthColumnLabel)}</th><th>DT</th><th>SL</th><th>Đ.GIÁ</th><th>CK %</th><th>ĐVT</th><th>TT</th></tr></thead><tbody>${bodyRows}</tbody></table><table class="totals"><tr><td>Tổng cộng</td><td class="r">${money(grossTotal)}</td></tr><tr><td>Tổng chiết khấu</td><td class="r">-${money(totalDiscount)}</td></tr><tr><td>Tổng VAT</td><td class="r">${money(totalVat)}</td></tr><tr><td>Tổng phụ thu</td><td class="r">${money(totalSurcharge)}</td></tr><tr class="grand"><td>THÀNH TIỀN</td><td class="r">${money(total)}</td></tr></table>${note.trim() ? `<div class="note"><b>Ghi chú:</b> ${escapeHtml(note)}</div>` : ""}<script>window.addEventListener('load',()=>setTimeout(()=>window.print(),150));<\/script></body></html>`;
    const popup = window.open("", "_blank");
    if (!popup) { setGlobalError("Trình duyệt đang chặn cửa sổ in."); return; }
    popup.document.open(); popup.document.write(html); popup.document.close();
  };

  const exportExcel = () => {
    const rows: string[][] = [["STT", "SẢN PHẨM", "MÀU", "DÀY (mm)", "CAO (m)", `${widthColumnLabel} (m)`, "DT (m²)", "SL", "Đ.GIÁ", "CK %", "ĐVT", "TT"]];
    lines.filter((line) => line.itemCode).forEach((line, index) => rows.push([String(index + 1), line.itemName || line.itemCode, line.color, line.thickness, line.height, line.width, areaPerSet(line) == null ? "" : String(areaPerSet(line)), line.qty, String(line.rate ?? ""), line.discountPct, line.uom, String(netAmount(line))]));
    const csv = `\uFEFF${rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\r\n")}`;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = `${createdOrder?.name || "sales-order"}.csv`; document.body.appendChild(anchor); anchor.click(); anchor.remove(); URL.revokeObjectURL(url);
  };

  const focusCell = (line: number, column: number) => {
    const holder = gridRef.current?.querySelector<HTMLElement>(`[data-cell="${line}:${column}"]`);
    const target = holder?.querySelector<HTMLElement>("input,button,select,textarea,[tabindex]") ?? holder;
    target?.focus();
    if (target instanceof HTMLInputElement) target.select();
  };
  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (submitted) return;
    const holder = (event.target as HTMLElement).closest<HTMLElement>("[data-cell]");
    if (!holder || holder.querySelector('[aria-expanded="true"]')) return;
    const [line, column] = holder.dataset.cell!.split(":").map(Number) as [number, number];
    const go = (dr: number, dc: number) => {
      const nextLine = Math.max(0, Math.min(lines.length - 1, line + dr));
      const nextColumn = Math.max(0, Math.min(visibleColumns.length - 1, column + dc));
      if (nextLine === line && nextColumn === column) return;
      event.preventDefault(); focusCell(nextLine, nextColumn);
    };
    if (event.key === "ArrowDown" || (event.key === "Enter" && !event.shiftKey)) go(1, 0);
    else if (event.key === "ArrowUp" || (event.key === "Enter" && event.shiftKey)) go(-1, 0);
    else if (event.key === "Tab" && !event.shiftKey && column < visibleColumns.length - 1) go(0, 1);
    else if (event.key === "Tab" && event.shiftKey && column > 0) go(0, -1);
  };
  const onPaste = (event: React.ClipboardEvent<HTMLDivElement>) => {
    if (submitted) return;
    const raw = event.clipboardData.getData("text/plain");
    if (!/[\t\n]/.test(raw)) return;
    event.preventDefault();
    const matrix = raw.replace(/\r/g, "").replace(/\n$/, "").split("\n").map((row) => row.split("\t"));
    const mutable = [...lines];
    const itemChanges: Array<{ index: number; code: string }> = [];
    matrix.forEach((cells, rowOffset) => {
      const index = picked.line + rowOffset;
      if (!mutable[index]) mutable[index] = newLine();
      const line = { ...mutable[index]! };
      cells.forEach((rawCell, columnOffset) => {
        const column = visibleColumns[picked.column + columnOffset];
        if (!column) return;
        const value = rawCell.trim();
        if (!value) return;
        if (column.key === "itemCode") { line.itemCode = value; itemChanges.push({ index, code: value }); }
        else if (column.key === "color") line.color = value;
        else if (column.key === "thickness") line.thickness = value.replace(/\s*(mm|ly)$/i, "").trim();
        else if (column.key === "height") line.height = value;
        else if (column.key === "width") line.width = value;
        else if (column.key === "qty") line.qty = value;
        else if (column.key === "discount") { line.discountPct = value.replace("%", "").trim(); line.discountTouched = true; }
      });
      mutable[index] = line;
    });
    setLines(mutable); itemChanges.forEach(({ index, code }) => void chooseItem(index, code));
  };

  const requiredCell = (line: SaleLine, key: ColumnKey) => {
    if (key === "itemCode") return true;
    if (!line.itemCode) return false;
    if (key === "qty") return true;
    if (key === "color") return line.requireColor;
    if (key === "thickness") return line.mode === "WIDTH" && !line.fixedThickness;
    if (key === "height") return line.mode === "HEIGHT" || line.mode === "AREA";
    if (key === "width") return line.mode === "WIDTH" || line.mode === "AREA";
    return false;
  };
  const missingRequired = (line: SaleLine, key: ColumnKey) => {
    if (!requiredCell(line, key)) return false;
    if (key === "itemCode") return !line.itemCode;
    if (key === "qty") return !integerPositive(line.qty);
    if (key === "color") return !line.color;
    if (key === "thickness") return !line.thickness;
    if (key === "height") return !positive(line.height);
    if (key === "width") return !positive(line.width);
    return false;
  };

  const renderCell = (line: SaleLine, lineIndex: number, column: ColumnDef) => {
    const required = requiredCell(line, column.key);
    const base = `min-h-8 w-full border-0 bg-transparent px-1.5 py-1 text-center text-xs outline-none focus:ring-0 ${required ? "font-bold text-slate-950" : ""}`;
    if (column.key === "itemCode") return <SheetLink doctype="Item" value={line.itemCode} onChange={(value) => void chooseItem(lineIndex, value)} readOnly={submitted} required fieldname={`sales_item_${lineIndex}`} />;
    if (column.key === "color") return line.itemCode && line.requireColor ? <SheetLink doctype="Item Color" value={line.color} onChange={(color) => patchLine(lineIndex, { color, formula: null })} readOnly={submitted} required fieldname={`sales_color_${lineIndex}`} /> : null;
    if (column.key === "thickness") {
      if (!line.itemCode || (line.mode !== "WIDTH" && !line.thickness)) return null;
      if (line.fixedThickness) return <div className="px-1.5 text-center text-xs font-semibold">{line.thickness}</div>;
      return <select className={base} value={line.thickness} disabled={submitted} onChange={(event) => patchLine(lineIndex, { thickness: event.target.value })}><option value=""></option>{thicknessOptions.map((value) => <option key={value} value={value}>{value}</option>)}</select>;
    }
    if (column.key === "height") return line.itemCode && (line.mode === "HEIGHT" || line.mode === "AREA") ? <input className={base} inputMode="decimal" value={line.height} disabled={submitted} onChange={(event) => patchLine(lineIndex, { height: event.target.value, formula: null })} /> : null;
    if (column.key === "width") return line.itemCode && (line.mode === "WIDTH" || line.mode === "AREA") ? <div className="px-1.5 py-0.5"><input className={`${base} px-0`} inputMode="decimal" value={line.width} disabled={submitted} onChange={(event) => patchLine(lineIndex, { width: event.target.value, formula: null })} />{line.mode === "AREA" && line.widthBasis ? <div className="text-center text-[9px] font-semibold leading-none text-slate-500">{line.widthBasis}</div> : null}</div> : null;
    if (column.key === "area") return areaPerSet(line) == null ? null : <div className="px-1.5 text-center text-xs font-semibold tabular-nums">{number(areaPerSet(line), 3)}</div>;
    if (column.key === "qty") return line.itemCode ? <input className={base} inputMode="numeric" value={line.qty} disabled={submitted} onChange={(event) => patchLine(lineIndex, { qty: event.target.value, formula: null })} /> : null;
    if (column.key === "rate") return line.itemCode && line.rate != null ? <div className="px-1.5 text-center text-xs font-semibold tabular-nums">{money(line.rate)}</div> : null;
    if (column.key === "discount") return null;
    if (column.key === "uom") {
      if (!line.itemCode) return null;
      const options = [...new Set([line.uom, ...line.allowedUoms].filter(Boolean))];
      return <select className={`${base} cursor-pointer font-semibold text-sky-800`} value={line.uom} disabled={submitted || options.length === 0} onChange={(event) => void changeUom(lineIndex, event.target.value)}>{options.map((uom) => <option key={uom} value={uom}>{uom}</option>)}</select>;
    }
    if (column.key === "amount") return line.itemCode && line.rate != null && billableQty(line) > 0 ? <div className="px-1.5 text-center text-xs font-semibold tabular-nums">{money(grossAmount(line))}</div> : null;
    return null;
  };
  const renderDiscountCell = (line: SaleLine, lineIndex: number, column: ColumnDef) => {
    if (column.key === "itemCode") return <span className="px-1.5 text-xs font-semibold text-emerald-700">Chiết khấu</span>;
    if (column.key === "discount") return <input className="min-h-8 w-full border-0 bg-emerald-50 px-1.5 text-center text-xs font-bold text-emerald-900 outline-none focus:bg-emerald-100" inputMode="decimal" placeholder="0" value={line.discountPct} disabled={submitted} onChange={(event) => patchLine(lineIndex, { discountPct: event.target.value.replace("%", ""), discountTouched: true })} />;
    if (column.key === "amount") return line.discountPct.trim() && line.rate != null && billableQty(line) > 0 ? <div className="px-1.5 text-center text-xs font-semibold tabular-nums text-emerald-800">-{money(lineDiscountAmount(line))}</div> : null;
    return null;
  };

  const renderGrid = (full: boolean) => <div ref={gridRef} className={`${full ? "h-full" : "max-h-[62vh]"} overflow-auto border border-slate-400 bg-white`} onKeyDown={onKeyDown} onPaste={onPaste}>
    <table className="w-max min-w-full border-collapse text-xs">
      <thead className="sticky top-0 z-30 bg-orange-500 text-white">
        <tr>
          {!submitted ? <th className="sticky left-0 z-40 w-9 min-w-9 border border-orange-600 bg-orange-500 p-1"><Checkbox checked={lines.length > 0 && selected.length === lines.length} onCheckedChange={() => setSelected(selected.length === lines.length ? [] : lines.map((line) => line.id))} /></th> : null}
          <th className={`${submitted ? "sticky left-0" : "sticky left-9"} z-40 w-10 min-w-10 border border-orange-600 bg-orange-500 px-1 text-center text-[10px] font-bold`}>STT</th>
          {visibleColumns.map((column) => <th
            key={column.key}
            draggable
            onDragStart={() => setDraggingColumn(column.key)}
            onDragEnd={() => setDraggingColumn(null)}
            onDragOver={(event) => event.preventDefault()}
            onDrop={() => { if (draggingColumn) moveColumn(draggingColumn, column.key); setDraggingColumn(null); }}
            className={`relative border border-orange-600 px-1 py-1 text-center text-[10px] font-bold whitespace-normal ${draggingColumn === column.key ? "bg-orange-600" : "bg-orange-500"}`}
            style={{ width: `${columnWidth(column)}rem`, minWidth: `${columnWidth(column)}rem` }}
            title="Kéo tiêu đề để đổi vị trí · kéo mép phải để đổi độ rộng · nhấp đúp mép phải để tự khít cột"
          ><span className="block cursor-grab leading-tight">{columnLabel(column)}</span>{column.unit ? <span className="block text-[9px] font-extrabold leading-tight text-orange-50">({column.unit})</span> : null}<div className="absolute inset-y-0 right-0 z-10 w-1.5 cursor-col-resize touch-none hover:bg-orange-200/70" onPointerDown={(event) => beginResize(event, column)} onDoubleClick={(event) => { event.stopPropagation(); setColumnWidths((current) => ({ ...current, [column.key]: autoFitWidth(column) })); }} /></th>)}
          {!submitted ? <th className="w-14 min-w-14 border border-orange-600 bg-orange-500"></th> : null}
        </tr>
      </thead>
      <tbody>
        {lines.map((line, lineIndex) => <FragmentRowsV2 key={line.id} line={line} lineIndex={lineIndex} submitted={submitted} selected={selected.includes(line.id)} visibleColumns={visibleColumns} columnWidth={columnWidth} onSelect={() => setSelected((current) => current.includes(line.id) ? current.filter((id) => id !== line.id) : [...current, line.id])} renderCell={renderCell} renderDiscountCell={renderDiscountCell} requiredCell={requiredCell} missingRequired={missingRequired} setPicked={setPicked} onDetail={() => setDetailIndex(lineIndex)} onDelete={() => deleteIndexes([lineIndex])} />)}
      </tbody>
    </table>
  </div>;

  return <div className="h-full w-full overflow-auto bg-white p-2 md:p-3">
    <div className="mx-auto w-full max-w-[1900px] space-y-2">
      <section className="grid gap-3 border border-slate-300 bg-white p-2 lg:grid-cols-[minmax(0,1fr)_minmax(310px,360px)]">
        <div className="grid min-w-0 content-start gap-2">
          <div className="text-[11px] font-bold uppercase tracking-wide text-slate-600">Thông tin khách hàng</div>
          <div className="grid min-w-0 gap-1.5 sm:grid-cols-[minmax(0,1fr)_auto]">
            <HeaderLink label="Khách hàng" doctype="Customer" value={customer.name} onChange={(name) => { setCustomer({ name, group: "", phone: "", address: "" }); setPriceList(""); }} required readOnly={submitted} />
            <Button type="button" variant="outline" size="sm" className="h-8 self-end rounded-none px-3" disabled={submitted} onClick={() => setQuickMaster("Customer")}>+ Tạo mới</Button>
          </div>
          <div className="grid gap-2 sm:grid-cols-[180px_minmax(0,1fr)]">
            <div className="grid gap-1"><Label className="text-[11px] font-semibold">Điện thoại</Label><Input className="h-8 rounded-none" value={customer.phone} readOnly /></div>
            <div className="grid gap-1"><Label className="text-[11px] font-semibold">Địa chỉ nhận</Label><Input className="h-8 rounded-none" value={customer.address} disabled={submitted} onChange={(event) => setCustomer((current) => ({ ...current, address: event.target.value }))} /></div>
          </div>
        </div>

        <div className="grid content-start gap-2 lg:border-l lg:border-slate-200 lg:pl-3">
          <div className="text-[11px] font-bold uppercase tracking-wide text-slate-600">Thông tin đơn hàng</div>
          {!contextCompany ? <HeaderLink label="Công ty" doctype="Company" value={company} onChange={setCompany} required readOnly={submitted} /> : null}
          <div className="grid gap-1"><Label className="text-[11px] font-semibold">Loại bảng giá</Label><Input className={`h-8 rounded-none ${customer.name && !priceList ? "border-amber-400" : ""}`} value={priceList} readOnly placeholder={priceListError || "Tự xác định theo khách hàng"} /></div>
          <div className="grid grid-cols-2 gap-2">
            <div className="grid gap-1"><Label className="text-[11px] font-semibold">Ngày đặt <span className="text-red-600">*</span></Label><Input className={`h-8 min-w-0 rounded-none px-2 ${!transactionDate ? "border-red-500" : ""}`} type="date" value={transactionDate} disabled={submitted} onChange={(event) => setTransactionDate(event.target.value)} /></div>
            <div className="grid gap-1"><Label className="text-[11px] font-semibold">Ngày giao <span className="text-red-600">*</span></Label><Input className={`h-8 min-w-0 rounded-none px-2 ${!deliveryDate ? "border-red-500" : ""}`} type="date" min={transactionDate} value={deliveryDate} disabled={submitted} onChange={(event) => setDeliveryDate(event.target.value)} /></div>
          </div>
          <div className="grid gap-1"><Label className="text-[11px] font-semibold">Ghi chú</Label><Input className="h-8 rounded-none" value={note} disabled={submitted} onChange={(event) => setNote(event.target.value)} /></div>
          <div className="flex min-h-5 flex-wrap gap-x-3 gap-y-1 text-[10px] text-slate-500">
            {canonicalGroup ? <span>Nhóm công thức: {canonicalGroup}</span> : null}
            {currency ? <span>{currency}</span> : null}
            {createdOrder?.name ? <span className="font-semibold text-slate-800">{String(createdOrder.name)}</span> : null}
            {submitted ? <span className="inline-flex items-center gap-1 font-semibold text-emerald-700"><CheckCircle2 className="h-3 w-3" /> Đã xác nhận</span> : null}
          </div>
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-1.5">
        {!submitted ? <Button type="button" variant="outline" size="sm" onClick={() => addLines(1)}><Plus /> Dòng</Button> : null}
        {!submitted ? <Button type="button" variant="outline" size="sm" onClick={() => addLines(10)}>+10 dòng</Button> : null}
        {!submitted && selected.length ? <Button type="button" variant="outline" size="sm" onClick={duplicateSelected}><Copy /> Nhân bản {selected.length}</Button> : null}
        {!submitted && selected.length ? <Button type="button" variant="ghost" size="sm" className="text-red-600" onClick={() => deleteIndexes(lines.map((line, index) => selected.includes(line.id) ? index : -1).filter((index) => index >= 0))}><Trash2 /> Xóa {selected.length}</Button> : null}
        {!submitted && lastDeleted?.length ? <Button type="button" variant="ghost" size="sm" onClick={undoDelete}><Undo2 /> Hoàn tác</Button> : null}
        <Button type="button" variant="ghost" size="sm" onClick={() => setColumnDialog(true)}><Columns3 /> Cột</Button>
        <Button type="button" variant="ghost" size="sm" onClick={autoFitAll}>Tự khít cột</Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setExpanded(true)}><Maximize2 /> Bảng lớn</Button>
        <span className="ml-auto text-[11px] text-slate-500">Vàng = bắt buộc nhập · đỏ = còn thiếu · xanh = được nhập tùy chọn · ĐVT đổi được và tự tra lại giá</span>
      </div>

      {renderGrid(false)}

      <section className="ml-auto w-full max-w-md border border-slate-300 bg-white">
        <div className="border-b border-slate-300 px-2 py-1.5 text-xs font-bold uppercase tracking-wide text-slate-600">Tổng tiền</div>
        <div className="grid grid-cols-2 border-b border-slate-300"><div className="p-2 text-sm">Tổng cộng</div><div className="p-2 text-right text-sm font-medium tabular-nums">{money(grossTotal)}</div></div>
        <div className="grid grid-cols-2 border-b border-slate-300"><div className="p-2 text-sm">Tổng chiết khấu</div><div className="p-2 text-right text-sm font-medium tabular-nums text-emerald-700">-{money(totalDiscount)}</div></div>
        <div className="grid grid-cols-2 border-b border-slate-300"><div className="p-2 text-sm">Tổng VAT</div><div className="p-2 text-right text-sm tabular-nums">{money(totalVat)}</div></div>
        <div className="grid grid-cols-2 border-b border-slate-300"><div className="p-2 text-sm">Tổng phụ thu</div><div className="p-2 text-right text-sm tabular-nums">{money(totalSurcharge)}</div></div>
        <div className="grid grid-cols-2"><div className="p-2 text-sm font-bold">THÀNH TIỀN</div><div className="p-2 text-right text-sm font-bold tabular-nums">{money(total)}</div></div>
      </section>

      {globalError ? <div className="flex items-start gap-2 border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700"><TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />{globalError}</div> : null}

      <div className="flex flex-wrap justify-end gap-2 border-t border-slate-300 pt-2">
        {!submitted ? <Button type="button" variant="outline" disabled={Boolean(saving)} onClick={() => void saveOrder(true)}>{saving === "draft" ? "Đang lưu…" : "Lưu nháp"}</Button> : null}
        {!submitted ? <Button type="button" disabled={Boolean(saving)} onClick={() => void saveOrder(false)}>{saving === "submit" ? "Đang xác nhận…" : "Xác nhận đơn"}</Button> : null}
        {createdOrder?.name ? <Button type="button" variant="outline" onClick={printHtml}><Printer /> In / PDF</Button> : null}
        {createdOrder?.name ? <Button type="button" variant="outline" onClick={exportExcel}><FileSpreadsheet /> Excel</Button> : null}
        {submitted ? <Button type="button" onClick={startNew}>Tạo đơn mới</Button> : null}
      </div>
    </div>

    <MasterQuickCreate open={quickMaster != null} kind={quickMaster ?? "Customer"} onClose={() => setQuickMaster(null)} onCreated={(kind, doc) => { setQuickMaster(null); if (kind === "Customer") { const name = String(doc.name ?? doc.customer_name ?? "").trim(); if (name) setCustomer({ name, group: "", phone: "", address: "" }); } }} />

    <Dialog open={columnDialog} onOpenChange={setColumnDialog}>
      <DialogContent className="w-[min(92vw,720px)] max-w-none"><DialogHeader><DialogTitle>Cột bảng bán hàng</DialogTitle><DialogDescription>Bật/tắt cột; dùng ← → để đổi vị trí. Ngoài bảng có thể kéo trực tiếp tiêu đề, kéo mép để đổi rộng hoặc nhấp đúp mép để tự khít.</DialogDescription></DialogHeader><div className="grid gap-2 sm:grid-cols-2">{orderedColumns.map((column) => <div key={column.key} className="flex items-center gap-2 border p-2 text-sm"><Checkbox checked={!hiddenColumns.includes(column.key)} onCheckedChange={(checkedValue) => saveHiddenColumns(checkedValue ? hiddenColumns.filter((key) => key !== column.key) : [...new Set([...hiddenColumns, column.key])])} /><span className="min-w-0 flex-1">{columnLabel(column)}{column.unit ? ` (${column.unit})` : ""}</span><Button type="button" variant="ghost" size="icon-sm" onClick={() => moveColumnBy(column.key, -1)}>←</Button><Button type="button" variant="ghost" size="icon-sm" onClick={() => moveColumnBy(column.key, 1)}>→</Button></div>)}</div><div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={autoFitAll}>Tự khít toàn bộ</Button><Button type="button" variant="outline" onClick={resetColumnLayout}><RotateCcw /> Mặc định</Button></div></DialogContent>
    </Dialog>

    <Dialog open={expanded} onOpenChange={setExpanded}>
      <DialogContent className="flex h-[94vh] w-[97vw] max-w-none flex-col overflow-hidden p-3"><DialogHeader className="shrink-0"><div className="flex items-center"><div><DialogTitle>Bảng bán hàng mở rộng</DialogTitle><DialogDescription>{lines.length} mặt hàng · dùng chung vị trí, độ rộng, ĐVT và cách nhập với bảng chính</DialogDescription></div><Button type="button" variant="ghost" size="icon-sm" className="ml-auto" onClick={() => setExpanded(false)}><X /></Button></div></DialogHeader><div className="min-h-0 flex-1">{renderGrid(true)}</div></DialogContent>
    </Dialog>

    <Dialog open={detailIndex != null} onOpenChange={(open) => { if (!open) setDetailIndex(null); }}>
      <DialogContent className="max-h-[90vh] w-[min(94vw,900px)] max-w-none overflow-auto"><DialogHeader><DialogTitle>Chi tiết mặt hàng {detailIndex == null ? "" : detailIndex + 1}</DialogTitle><DialogDescription>Cùng dữ liệu với bảng; thay đổi phản ánh ngay.</DialogDescription></DialogHeader>{detailIndex != null && lines[detailIndex] ? <LineDetailV2 line={lines[detailIndex]!} index={detailIndex} submitted={submitted} thicknessOptions={thicknessOptions} patchLine={patchLine} chooseItem={chooseItem} changeUom={changeUom} /> : null}</DialogContent>
    </Dialog>
  </div>;
}

function FragmentRowsV2({ line, lineIndex, submitted, selected, visibleColumns, columnWidth, onSelect, renderCell, renderDiscountCell, requiredCell, missingRequired, setPicked, onDetail, onDelete }: {
  line: SaleLine; lineIndex: number; submitted: boolean; selected: boolean; visibleColumns: ColumnDef[]; columnWidth: (column: ColumnDef) => number; onSelect: () => void;
  renderCell: (line: SaleLine, lineIndex: number, column: ColumnDef) => React.ReactNode;
  renderDiscountCell: (line: SaleLine, lineIndex: number, column: ColumnDef) => React.ReactNode;
  requiredCell: (line: SaleLine, key: ColumnKey) => boolean;
  missingRequired: (line: SaleLine, key: ColumnKey) => boolean;
  setPicked: (value: { line: number; column: number }) => void; onDetail: () => void; onDelete: () => void;
}) {
  return <>
    <tr>
      {!submitted ? <td rowSpan={2} className="sticky left-0 z-20 border border-slate-300 bg-white p-1 text-center align-middle"><Checkbox checked={selected} onCheckedChange={onSelect} /></td> : null}
      <td rowSpan={2} className={`${submitted ? "sticky left-0" : "sticky left-9"} z-20 border border-slate-300 bg-white px-1 text-center align-middle text-[10px] text-slate-500`}>{lineIndex + 1}</td>
      {visibleColumns.map((column, columnIndex) => {
        const required = requiredCell(line, column.key);
        const missing = missingRequired(line, column.key);
        return <td key={column.key} data-cell={`${lineIndex}:${columnIndex}`} className={`h-9 border p-0 text-center align-middle ${missing ? "border-red-500 bg-red-50 ring-1 ring-inset ring-red-500" : required ? "border-amber-400 bg-amber-50/80" : "border-slate-300 bg-white"}`} style={{ width: `${columnWidth(column)}rem`, minWidth: `${columnWidth(column)}rem` } as CSSProperties} onFocusCapture={() => setPicked({ line: lineIndex, column: columnIndex })} onClick={() => setPicked({ line: lineIndex, column: columnIndex })}>{renderCell(line, lineIndex, column)}</td>;
      })}
      {!submitted ? <td rowSpan={2} className="border border-slate-300 bg-white p-1 align-middle"><div className="flex"><Button type="button" variant="ghost" size="icon-sm" onClick={onDetail}><Maximize2 /></Button><Button type="button" variant="ghost" size="icon-sm" className="text-slate-500 hover:text-red-600" onClick={onDelete}><Trash2 /></Button></div></td> : null}
    </tr>
    <tr>{visibleColumns.map((column) => <td key={column.key} className={`h-8 border p-0 text-center align-middle ${column.key === "discount" ? "border-emerald-300 bg-emerald-50" : "border-slate-300 bg-white"}`}>{renderDiscountCell(line, lineIndex, column)}</td>)}</tr>
  </>;
}

function LineDetailV2({ line, index, submitted, thicknessOptions, patchLine, chooseItem, changeUom }: {
  line: SaleLine; index: number; submitted: boolean; thicknessOptions: string[]; patchLine: (index: number, patch: Partial<SaleLine>) => void; chooseItem: (index: number, value: string) => Promise<void>; changeUom: (index: number, value: string) => Promise<void>;
}) {
  const uoms = [...new Set([line.uom, ...line.allowedUoms].filter(Boolean))];
  return <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
    <div className="grid gap-1.5"><Label>Sản phẩm *</Label><SheetLink doctype="Item" value={line.itemCode} onChange={(value) => void chooseItem(index, value)} readOnly={submitted} required fieldname={`detail_item_${index}`} /></div>
    <div className="grid gap-1.5"><Label>Màu sắc{line.requireColor ? " *" : ""}</Label>{line.itemCode && line.requireColor ? <SheetLink doctype="Item Color" value={line.color} onChange={(color) => patchLine(index, { color, formula: null })} readOnly={submitted} required fieldname={`detail_color_${index}`} /> : <Input value="" readOnly />}</div>
    <div className="grid gap-1.5"><Label>Độ dày</Label><select className="h-9 border bg-white px-2 text-sm" value={line.thickness} disabled={submitted || line.fixedThickness || line.mode !== "WIDTH"} onChange={(event) => patchLine(index, { thickness: event.target.value })}><option value=""></option>{line.thickness && !thicknessOptions.includes(line.thickness) ? <option value={line.thickness}>{line.thickness} mm</option> : null}{thicknessOptions.map((value) => <option key={value} value={value}>{value} mm</option>)}</select></div>
    <div className="grid gap-1.5"><Label>Cao (m)</Label><Input value={line.height} disabled={submitted || !(line.mode === "HEIGHT" || line.mode === "AREA")} onChange={(event) => patchLine(index, { height: event.target.value, formula: null })} /></div>
    <div className="grid gap-1.5"><Label>{widthBasisTitle(line.widthBasis)} (m)</Label><Input value={line.width} disabled={submitted || !(line.mode === "WIDTH" || line.mode === "AREA")} onChange={(event) => patchLine(index, { width: event.target.value, formula: null })} /></div>
    <div className="grid gap-1.5"><Label>DT (m²)</Label><Input value={areaPerSet(line) == null ? "" : number(areaPerSet(line), 3)} readOnly /></div>
    <div className="grid gap-1.5"><Label>SL *</Label><Input value={line.qty} disabled={submitted} onChange={(event) => patchLine(index, { qty: event.target.value, formula: null })} /></div>
    <div className="grid gap-1.5"><Label>Đơn giá</Label><Input value={line.rate == null ? "" : money(line.rate)} readOnly /></div>
    <div className="grid gap-1.5"><Label>ĐVT</Label><select className="h-9 border bg-white px-2 text-sm font-semibold text-sky-800" value={line.uom} disabled={submitted || !uoms.length} onChange={(event) => void changeUom(index, event.target.value)}>{uoms.map((uom) => <option key={uom} value={uom}>{uom}</option>)}</select></div>
    <div className="grid gap-1.5"><Label className="text-emerald-700">Chiết khấu %</Label><Input className="border-emerald-300 bg-emerald-50 font-semibold text-emerald-900" value={line.discountPct} disabled={submitted} onChange={(event) => patchLine(index, { discountPct: event.target.value.replace("%", ""), discountTouched: true })} /></div>
    {line.error ? <div className="sm:col-span-2 xl:col-span-3 border border-red-300 bg-red-50 p-2 text-sm text-red-700">{line.error}</div> : null}
  </div>;
}

function MasterQuickCreate({ open, kind, onClose, onCreated }: { open: boolean; kind: MasterKind; onClose: () => void; onCreated: (kind: MasterKind, doc: Doc) => void }) {
  const { adapter } = useMetaForge();
  const [name, setName] = useState("");
  const [group, setGroup] = useState(kind === "Customer" ? "Lẻ" : "");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setName(""); setGroup(kind === "Customer" ? "Lẻ" : ""); setPhone(""); setEmail(""); setError("");
  }, [kind, open]);

  const save = async () => {
    if (!name.trim()) { setError(`Cần ${kind === "Customer" ? "tên khách hàng" : "tên nhà cung cấp"}.`); return; }
    setBusy(true); setError("");
    try {
      const payload: Partial<Doc> = kind === "Customer"
        ? { customer_name: name.trim(), price_group: group || "Lẻ", phone: phone.trim(), email: email.trim() }
        : { supplier_name: name.trim(), ...(group ? { supplier_group: group } : {}), phone: phone.trim(), email: email.trim() };
      const doc = await adapter.createDoc(kind, payload);
      toast.success(`Đã tạo ${kind === "Customer" ? "khách hàng" : "NCC"} ${doc.name}.`);
      onCreated(kind, doc);
    } catch (cause) { setError(adapter.mapError(cause).message); }
    finally { setBusy(false); }
  };

  return <Dialog open={open} onOpenChange={(next) => { if (!next && !busy) onClose(); }}>
    <DialogContent className="w-[min(94vw,560px)] max-w-none">
      <DialogHeader><DialogTitle>{kind === "Customer" ? "Tạo khách hàng" : "Tạo nhà cung cấp"}</DialogTitle><DialogDescription>Tạo nhanh ngay trong đơn bán hàng, không mở tab mới.</DialogDescription></DialogHeader>
      <div className="grid gap-3">
        <div className="grid gap-1"><Label>{kind === "Customer" ? "Tên khách hàng" : "Tên NCC"} *</Label><Input autoFocus value={name} onChange={(event) => setName(event.target.value)} /></div>
        {kind === "Customer" ? <div className="grid gap-1"><Label>Loại khách *</Label><select className="h-9 border bg-white px-2 text-sm" value={group} onChange={(event) => setGroup(event.target.value)}><option value="Lẻ">Khách lẻ</option><option value="Đại lý">Đại lý</option></select></div> : <div className="grid gap-1"><Label>Nhóm NCC</Label><Input value={group} onChange={(event) => setGroup(event.target.value)} /></div>}
        <div className="grid gap-1 sm:grid-cols-2"><div className="grid gap-1"><Label>Điện thoại</Label><Input value={phone} onChange={(event) => setPhone(event.target.value)} /></div><div className="grid gap-1"><Label>Email</Label><Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} /></div></div>
        {error ? <div className="border border-red-300 bg-red-50 p-2 text-sm text-red-700">{error}</div> : null}
        <div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={busy} onClick={onClose}>Hủy</Button><Button type="button" disabled={busy} onClick={() => void save()}>{busy ? "Đang lưu…" : "Lưu"}</Button></div>
      </div>
    </DialogContent>
  </Dialog>;
}
