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
import { useNavigate } from "react-router-dom";
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

type FormulaResult = Json & {
  policy_name?: string;
  formula_version?: string;
  door_type?: string;
  width_basis?: string;
  sales_width_basis?: string;
  sales_width_m?: number;
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
  qty: string;
  rate: number | null;
  uom: string;
  currency: string;
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

type ColumnDef = {
  key: ColumnKey;
  label: string;
  width: number;
  numeric?: boolean;
};

const COLUMNS: ColumnDef[] = [
  { key: "itemCode", label: "SẢN PHẨM", width: 17 },
  { key: "color", label: "MÀU SẮC", width: 10 },
  { key: "thickness", label: "ĐỘ DÀY", width: 8 },
  { key: "height", label: "CHIỀU CAO", width: 8, numeric: true },
  { key: "width", label: "CHIỀU RỘNG", width: 9, numeric: true },
  { key: "area", label: "DIỆN TÍCH", width: 8, numeric: true },
  { key: "qty", label: "SL", width: 5, numeric: true },
  { key: "rate", label: "ĐƠN GIÁ", width: 9, numeric: true },
  { key: "discount", label: "CK %", width: 6, numeric: true },
  { key: "uom", label: "ĐVT", width: 6 },
  { key: "amount", label: "THÀNH TIỀN", width: 11, numeric: true },
];

const STANDARD_PRICE_LIST = "Giá niêm yết";
const LAYOUT_KEY = "alumdoor-sales-sheet-columns-v1";

const today = () => {
  const value = new Date();
  return new Date(value.valueOf() - value.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
};

const reservationExpiry = (deliveryDate: string) => {
  const date = new Date(`${deliveryDate}T23:59:59.999`);
  if (!Number.isFinite(date.valueOf())) throw new Error("Ngày giao không hợp lệ để giữ chỗ tồn kho.");
  return date.toISOString();
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
    qty: "1",
    rate: null,
    uom: "",
    currency: "",
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

function isGermanDoor(doorType: string, itemGroup: string): boolean {
  return normalize(doorType).includes("đức") || normalize(itemGroup).includes("đức");
}

function discountRate(line: SaleLine): number {
  if (!line.discountPct.trim()) return 0;
  const parsed = decimal(line.discountPct);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 100 ? parsed : 0;
}

function areaPerSet(line: SaleLine): number | null {
  return line.mode === "AREA" && line.formula?.area_per_set_sqm != null ? Number(line.formula.area_per_set_sqm) : null;
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

function lineDiscountAmount(line: SaleLine): number {
  return grossAmount(line) * discountRate(line) / 100;
}

function netAmount(line: SaleLine): number {
  return grossAmount(line) - lineDiscountAmount(line);
}

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
  const field: DocField = {
    fieldname,
    label: fieldname,
    fieldtype: "Link",
    options: doctype,
    ...(required ? { reqd: 1 as const } : {}),
  };
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
  return <div className="grid min-w-0 gap-1.5">
    <Label>{label}{required ? <span className="text-destructive">*</span> : null}</Label>
    <SheetLink doctype={doctype} value={value} onChange={onChange} required={required} readOnly={readOnly} fieldname={`sales_sheet_${doctype.replaceAll(" ", "_").toLocaleLowerCase("vi")}`} />
  </div>;
}

export function AlumdoorSalesSheet() {
  const { adapter, businessContext } = useMetaForge();
  const navigate = useNavigate();
  const gridRef = useRef<HTMLDivElement | null>(null);
  const previewGeneration = useRef(0);
  const contextCompany = String(businessContext.company ?? "").trim();
  const contextWarehouse = String(businessContext.warehouse ?? "").trim();

  const [company, setCompany] = useState(contextCompany);
  const [warehouse, setWarehouse] = useState(contextWarehouse);
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
  const [hiddenColumns, setHiddenColumns] = useState<ColumnKey[]>(() => {
    try { return JSON.parse(localStorage.getItem(LAYOUT_KEY) ?? "[]") as ColumnKey[]; } catch { return []; }
  });
  const [picked, setPicked] = useState({ line: 0, column: 0 });
  const [saving, setSaving] = useState<"" | "draft" | "submit">("");
  const [createdOrder, setCreatedOrder] = useState<Doc | null>(null);
  const [globalError, setGlobalError] = useState("");
  const submitted = Boolean(createdOrder && Number(createdOrder.docstatus ?? 0) === 1);

  const visibleColumns = useMemo(() => COLUMNS.filter((column) => !hiddenColumns.includes(column.key)), [hiddenColumns]);

  useEffect(() => { if (contextCompany) setCompany(contextCompany); }, [contextCompany]);
  useEffect(() => { if (contextWarehouse) setWarehouse(contextWarehouse); }, [contextWarehouse]);

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
      fields: ["thickness_mm", "disabled"],
      filters: [["disabled", "=", 0]],
      pageLength: 1000,
    }).then((rows) => {
      if (!active) return;
      const values = [...new Set(rows
        .map((row) => Number(row.thickness_mm))
        .filter((value) => Number.isFinite(value) && value > 0)
        .map((value) => String(value).replace(".", ",")))]
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
        const preferred = String(doc.default_price_list ?? "").trim();
        const candidates = [...new Set([preferred, STANDARD_PRICE_LIST].filter(Boolean))];
        let resolved = "";
        for (const candidate of candidates) {
          try {
            const { doc: list } = await adapter.getDoc("Price List", candidate);
            if (!checked(list.disabled)) { resolved = candidate; break; }
          } catch { /* continue */ }
        }
        if (!resolved) {
          const activeLists = await adapter.getList("Price List", {
            fields: ["name", "disabled"],
            filters: [["disabled", "=", 0]],
            orderBy: "name asc",
            pageLength: 50,
          });
          if (activeLists.length === 1) resolved = String(activeLists[0]?.name ?? "").trim();
        }
        if (!active) return;
        setCustomer((current) => ({
          ...current,
          group: String(doc.price_group ?? doc.customer_group ?? "").trim(),
          phone: String(doc.phone ?? doc.mobile_no ?? "").trim(),
          address: String(doc.install_address ?? doc.address ?? "").trim(),
        }));
        setPriceList(resolved);
        setPriceListError(resolved ? "" : "Chưa tìm thấy bảng giá bán đang hoạt động cho khách hàng.");
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

  const refreshPrice = async (index: number, itemCode: string) => {
    if (!itemCode || !priceList || !currency) return;
    try {
      const context = await adapter.callPost<ItemContext>("alumdoor.sales.item_context", {
        item_code: itemCode,
        price_list: priceList,
        currency,
        ...(warehouse ? { warehouse } : {}),
      });
      patchLine(index, {
        rate: context.price_missing || context.rate == null ? null : Number(context.rate),
        uom: String(context.selected_uom ?? "").trim(),
        currency: String(context.currency ?? currency).trim() || currency,
        managedStock: context.managed_stock !== false,
        stockQty: context.available_qty == null ? null : Number(context.available_qty),
        error: context.price_missing || context.rate == null ? String(context.price_error ?? "Chưa có đơn giá bán.") : "",
      });
    } catch (error) {
      patchLine(index, { rate: null, uom: "", error: adapter.mapError(error).message });
    }
  };

  const chooseItem = async (index: number, itemCode: string) => {
    if (!itemCode) {
      patchLine(index, { ...newLine(), id: lines[index]?.id ?? newLine().id });
      return;
    }
    patchLine(index, { itemCode, busy: true, error: "", formula: null, rate: null, stockShort: null, stockMessage: "" });
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
        } catch { /* metadata enhancement only */ }
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
        } catch { /* metadata enhancement only */ }
      }
      const itemGroup = String(doc.item_group ?? "").trim();
      const doorType = String(doc.door_type ?? "").trim();
      const current = lines[index];
      const shouldDefaultDiscount = isGermanDoor(doorType, itemGroup) && !current?.discountTouched;
      patchLine(index, {
        itemCode,
        itemName: String(doc.item_name ?? itemCode).trim() || itemCode,
        itemGroup,
        doorType,
        mode,
        requireColor,
        color: String(doc.default_color ?? current?.color ?? "").trim(),
        thickness: thickness || current?.thickness || "",
        fixedThickness,
        height: mode === "WIDTH" || mode === "QUANTITY" ? "" : current?.height ?? "",
        width: mode === "HEIGHT" || mode === "QUANTITY" ? "" : current?.width ?? "",
        discountPct: shouldDefaultDiscount ? "15" : current?.discountPct ?? "",
        formula: null,
        busy: false,
        error: "",
      });
      await refreshPrice(index, itemCode);
    } catch (error) {
      patchLine(index, { busy: false, error: adapter.mapError(error).message });
    }
  };

  useEffect(() => {
    if (!priceList || !currency) return;
    lines.forEach((line, index) => { if (line.itemCode) void refreshPrice(index, line.itemCode); });
    // Price refresh intentionally depends on pricing context, not on line output.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [priceList, currency, warehouse]);

  const calculationFingerprint = useMemo(() => JSON.stringify({
    customerGroup: customer.group,
    deliveryDate,
    warehouse,
    lines: lines.map((line) => ({
      itemCode: line.itemCode,
      mode: line.mode,
      color: line.color,
      height: line.height,
      width: line.width,
      qty: line.qty,
    })),
  }), [customer.group, deliveryDate, lines, warehouse]);

  useEffect(() => {
    const generation = ++previewGeneration.current;
    const timer = window.setTimeout(() => {
      void Promise.all(lines.map(async (line, index) => {
        if (line.mode !== "AREA" || !line.itemCode || !positive(line.height) || !positive(line.width) || !integerPositive(line.qty) || !["Đại lý", "Lẻ"].includes(customer.group)) {
          if (line.mode === "AREA") patchLine(index, { formula: null, stockShort: null, stockMessage: "" });
          return;
        }
        patchLine(index, { busy: true, error: "" });
        try {
          const formula = await adapter.callPost<FormulaResult>("alumdoor.sales.production_line_context", {
            item_code: line.itemCode,
            customer_group: customer.group,
            sales_mode: "Trọn bộ",
            width_input_basis: "Rộng phủ bì",
            height_input_basis: "Cao phủ bì",
            width_m: decimal(line.width),
            height_m: decimal(line.height),
            set_count: decimal(line.qty),
            ...(line.color ? { color: line.color } : {}),
            delivery_date: deliveryDate,
          });
          let stockShort: number | null = null;
          let stockMessage = "";
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
          const current = lines[index];
          patchLine(index, {
            formula,
            doorType: String(formula.door_type ?? current?.doorType ?? ""),
            discountPct: isGermanDoor(String(formula.door_type ?? ""), current?.itemGroup ?? "") && !current?.discountTouched ? "15" : current?.discountPct ?? "",
            stockShort,
            stockMessage,
            busy: false,
            error: String(formula.leaf_error ?? formula.stock_profile_error ?? ""),
          });
        } catch (error) {
          if (generation !== previewGeneration.current) return;
          patchLine(index, { formula: null, busy: false, stockShort: null, stockMessage: "", error: adapter.mapError(error).message });
        }
      }));
    }, 350);
    return () => window.clearTimeout(timer);
    // calculationFingerprint is the canonical user/context input snapshot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calculationFingerprint, adapter]);

  const total = useMemo(() => lines.reduce((sum, line) => sum + netAmount(line), 0), [lines]);

  const blockers = useMemo(() => {
    const out: string[] = [];
    if (!company) out.push("Cần chọn Công ty.");
    if (!customer.name) out.push("Cần chọn Khách hàng.");
    if (!priceList) out.push(priceListError || "Chưa xác định bảng giá bán.");
    if (!currency) out.push("Chưa xác định tiền tệ bán.");
    if (!warehouse) out.push("Cần chọn Kho bán.");
    if (!transactionDate) out.push("Cần ngày đặt hàng.");
    if (!deliveryDate) out.push("Cần ngày giao hàng.");
    if (deliveryDate && transactionDate && deliveryDate < transactionDate) out.push("Ngày giao phải bằng hoặc sau ngày đặt hàng.");
    const activeLines = lines.filter((line) => line.itemCode);
    if (!activeLines.length) out.push("Cần ít nhất một mặt hàng.");
    for (const [index, line] of lines.entries()) {
      if (!line.itemCode) continue;
      if (!integerPositive(line.qty)) out.push(`Dòng ${index + 1}: SL phải là số nguyên dương.`);
      if (line.requireColor && !line.color) out.push(`Dòng ${index + 1}: cần chọn Màu sắc.`);
      if (line.mode === "HEIGHT" && !positive(line.height)) out.push(`Dòng ${index + 1}: cần Chiều cao.`);
      if (line.mode === "WIDTH" && !positive(line.width)) out.push(`Dòng ${index + 1}: cần Chiều rộng.`);
      if (line.mode === "AREA" && (!positive(line.height) || !positive(line.width))) out.push(`Dòng ${index + 1}: cần Chiều cao và Chiều rộng.`);
      if (line.mode === "AREA" && !line.formula?.billable_area_sqm) out.push(`Dòng ${index + 1}: chưa tính xong diện tích cửa.`);
      if (line.rate == null) out.push(`Dòng ${index + 1}: chưa có đơn giá bán.`);
      if (!line.uom) out.push(`Dòng ${index + 1}: chưa xác định ĐVT bán.`);
      if (line.discountPct.trim()) {
        const discount = decimal(line.discountPct);
        if (!Number.isFinite(discount) || discount < 0 || discount > 100) out.push(`Dòng ${index + 1}: CK phải từ 0 đến 100%.`);
      }
      if (line.error) out.push(`Dòng ${index + 1}: ${line.error}`);
      if (line.mode === "AREA" && Number(line.stockShort ?? 0) > 0) out.push(`Dòng ${index + 1}: ${line.stockMessage || `thiếu ${line.stockShort} lá nhôm`}.`);
      if (line.mode !== "AREA" && line.managedStock && line.stockQty != null && billableQty(line) > line.stockQty) {
        out.push(`Dòng ${index + 1}: tồn kho ${number(line.stockQty)} ${line.uom}, không đủ ${number(billableQty(line))} ${line.uom}.`);
      }
    }
    return out;
  }, [company, currency, customer.name, deliveryDate, lines, priceList, priceListError, transactionDate, warehouse]);

  const buildItems = () => lines.filter((line) => line.itemCode).map((line, index) => {
    const discount = discountRate(line);
    const listRate = Number(line.rate ?? 0);
    const netRate = listRate * (1 - discount / 100);
    const common: Record<string, unknown> = {
      row_id: `SALES-SHEET-${index + 1}`,
      item_code: line.itemCode,
      uom: line.uom,
      qty: billableQty(line),
      rate: netRate,
      warehouse,
      set_count: decimal(line.qty),
      ...(line.color ? { color: line.color } : {}),
      ...(positive(line.height) ? { height_m: decimal(line.height) } : {}),
      ...(positive(line.width) ? { width_m: decimal(line.width) } : {}),
      note: `Giá niêm yết ${money(listRate)}${discount ? ` · Chiết khấu ${number(discount, 2)}%` : ""}${line.thickness ? ` · Độ dày ${line.thickness} mm` : ""}`,
    };
    if (line.mode === "AREA" && line.formula) {
      Object.assign(common, {
        door_type: line.formula.door_type,
        formula_policy: line.formula.policy_name,
        formula_version: line.formula.formula_version,
        width_basis: line.formula.width_basis,
        cut_width_m: line.formula.cut_width_m,
        billable_area_sqm: line.formula.billable_area_sqm,
      });
    }
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
        selling_price_list: priceList,
        ...(customer.group ? { customer_group: customer.group } : {}),
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

      const expiresAt = reservationExpiry(deliveryDate);
      for (const line of lines.filter((entry) => entry.itemCode && entry.mode === "AREA" && entry.formula?.stock_profile_item)) {
        const result = await adapter.callPost<{ reservation?: string }>("alumdoor.reserve.create", {
          item_code: String(line.formula?.stock_profile_item),
          warehouse,
          ...(line.color ? { color: line.color } : {}),
          min_length_m: Number(line.formula?.cut_width_m),
          qty_reserved: Number(line.formula?.total_leaf_count),
          source_doctype: "Sales Order",
          source_name: saved.name,
          expires_at: expiresAt,
        });
        const reservation = String(result.reservation ?? "").trim();
        if (!reservation) throw new Error("Giữ chỗ tồn kho thành công nhưng không trả mã phiếu.");
        reservations.push(reservation);
      }

      const finalDoc = await adapter.submit(saved);
      setCreatedOrder(finalDoc);
      toast.success(`Đã xác nhận đơn ${finalDoc.name}.`);
    } catch (error) {
      for (const reservation of reservations.reverse()) {
        try {
          await adapter.callPost("alumdoor.reserve.release", {
            reservation,
            released_reason: "Hoàn tác tự động vì xác nhận Sales Order không hoàn tất.",
          });
        } catch { /* recovery remains visible through server audit */ }
      }
      setGlobalError(adapter.mapError(error).message);
    } finally {
      setSaving("");
    }
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
    setLines((current) => [...current, ...current
      .filter((line) => selected.includes(line.id))
      .map((line) => ({ ...line, id: `sale-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` }))]);
    setSelected([]);
  };

  const saveHiddenColumns = (next: ColumnKey[]) => {
    setHiddenColumns(next);
    try { localStorage.setItem(LAYOUT_KEY, JSON.stringify(next)); } catch { /* presentation only */ }
  };

  const openMaster = (doctype: "Customer" | "Supplier") => {
    const path = `/form/${encodeURIComponent(doctype)}/new`;
    window.open(path, "_blank", "noopener,noreferrer");
  };

  const startNew = () => {
    setCreatedOrder(null);
    setCustomer({ name: "", group: "", phone: "", address: "" });
    setPriceList("");
    setPriceListError("");
    setTransactionDate(today());
    setDeliveryDate(today());
    setNote("");
    setLines([newLine()]);
    setSelected([]);
    setGlobalError("");
  };

  const printHtml = () => {
    if (!createdOrder?.name) { setGlobalError("Cần lưu hoặc xác nhận đơn trước khi in."); return; }
    const bodyRows = lines.filter((line) => line.itemCode).map((line, index) => {
      const widthNote = line.mode === "AREA" ? String(line.formula?.sales_width_basis ?? line.formula?.width_basis ?? "") : "";
      const product = `<tr><td class="c">${index + 1}</td><td>${escapeHtml(line.itemName || line.itemCode)}</td><td>${escapeHtml(line.color)}</td><td class="c">${escapeHtml(line.thickness)}</td><td class="r">${escapeHtml(line.height)}</td><td class="r">${escapeHtml(line.width)}${widthNote ? `<div class="sub">${escapeHtml(widthNote)}</div>` : ""}</td><td class="r">${areaPerSet(line) == null ? "" : number(areaPerSet(line), 3)}</td><td class="r">${escapeHtml(line.qty)}</td><td class="r">${money(line.rate)}</td><td></td><td class="c">${escapeHtml(line.uom)}</td><td class="r b">${money(grossAmount(line))}</td></tr>`;
      const discount = line.discountPct.trim()
        ? `<tr class="discount"><td></td><td class="b">Chiết khấu</td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td class="r b">${number(discountRate(line), 2)}%</td><td></td><td class="r b">-${money(lineDiscountAmount(line))}</td></tr>`
        : `<tr class="discount"><td></td><td>Chiết khấu</td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>`;
      return product + discount;
    }).join("");
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(String(createdOrder.name))}</title><style>
      @page{size:A4 landscape;margin:10mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#171717;font-size:11px;margin:0}h1{font-size:20px;margin:0 0 10px}.top{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px}.meta{width:100%;border-collapse:collapse;margin-bottom:10px}.meta td{border:1px solid #d7d7d7;padding:6px}.sheet{width:100%;border-collapse:collapse;table-layout:fixed}.sheet th,.sheet td{border:1px solid #bdbdbd;padding:5px;vertical-align:middle}.sheet th{background:#f5f5f5;font-size:9px;white-space:nowrap}.sheet .discount td{height:24px;background:#fcfcfc}.r{text-align:right}.c{text-align:center}.b{font-weight:700}.sub{font-size:8px;color:#666;margin-top:2px}.totals{margin-left:auto;margin-top:10px;width:310px;border-collapse:collapse}.totals td{border:1px solid #d7d7d7;padding:6px}.grand td{font-weight:700;font-size:13px}.muted{color:#666}.note{margin-top:10px;white-space:pre-wrap}@media print{button{display:none}}
      </style></head><body><div class="top"><div><h1>ĐƠN BÁN HÀNG</h1><div class="muted">${escapeHtml(String(createdOrder.name))}</div></div><div><b>${Number(createdOrder.docstatus ?? 0) === 1 ? "ĐÃ XÁC NHẬN" : "BẢN NHÁP"}</b></div></div>
      <table class="meta"><tr><td><b>Khách hàng:</b> ${escapeHtml(customer.name)}</td><td><b>Loại khách:</b> ${escapeHtml(customer.group)}</td><td><b>Ngày đặt:</b> ${escapeHtml(transactionDate)}</td><td><b>Ngày giao:</b> ${escapeHtml(deliveryDate)}</td></tr></table>
      <table class="sheet"><thead><tr><th>STT</th><th>SẢN PHẨM</th><th>MÀU SẮC</th><th>ĐỘ DÀY</th><th>CHIỀU CAO</th><th>CHIỀU RỘNG</th><th>DIỆN TÍCH</th><th>SL</th><th>ĐƠN GIÁ</th><th>CK %</th><th>ĐVT</th><th>THÀNH TIỀN</th></tr></thead><tbody>${bodyRows}</tbody></table>
      <table class="totals"><tr><td>Tổng tiền hàng</td><td class="r">${money(total)}</td></tr><tr><td>Giao nhận</td><td></td></tr><tr><td>Thuế</td><td></td></tr><tr><td>Đã thu</td><td></td></tr><tr class="grand"><td>CÒN PHẢI THU</td><td class="r">${money(total)}</td></tr></table>
      ${note.trim() ? `<div class="note"><b>Ghi chú:</b> ${escapeHtml(note)}</div>` : ""}
      <script>window.addEventListener('load',()=>setTimeout(()=>window.print(),150));<\/script></body></html>`;
    const popup = window.open("", "_blank");
    if (!popup) { setGlobalError("Trình duyệt đang chặn cửa sổ in."); return; }
    popup.document.open();
    popup.document.write(html);
    popup.document.close();
  };

  const exportExcel = () => {
    const rows: string[][] = [["STT", "SẢN PHẨM", "MÀU SẮC", "ĐỘ DÀY", "CHIỀU CAO", "CHIỀU RỘNG", "DIỆN TÍCH", "SL", "ĐƠN GIÁ", "CK %", "ĐVT", "THÀNH TIỀN"]];
    lines.filter((line) => line.itemCode).forEach((line, index) => {
      rows.push([
        String(index + 1), line.itemName || line.itemCode, line.color, line.thickness, line.height, line.width,
        areaPerSet(line) == null ? "" : String(areaPerSet(line)), line.qty, String(line.rate ?? ""), "", line.uom, String(grossAmount(line)),
      ]);
      rows.push(["", "Chiết khấu", "", "", "", "", "", "", "", line.discountPct, "", line.discountPct.trim() ? String(-lineDiscountAmount(line)) : ""]);
    });
    const csv = `\uFEFF${rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\r\n")}`;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${createdOrder?.name || "sales-order"}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
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
      event.preventDefault();
      focusCell(nextLine, nextColumn);
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
    setLines(mutable);
    itemChanges.forEach(({ index, code }) => void chooseItem(index, code));
  };

  const requiredCell = (line: SaleLine, key: ColumnKey) => {
    if (key === "itemCode" || key === "qty") return true;
    if (key === "color") return line.requireColor;
    if (key === "height") return line.mode === "HEIGHT" || line.mode === "AREA";
    if (key === "width") return line.mode === "WIDTH" || line.mode === "AREA";
    return false;
  };

  const renderCell = (line: SaleLine, lineIndex: number, column: ColumnDef) => {
    const required = requiredCell(line, column.key);
    const base = `min-h-8 w-full border-0 bg-transparent px-1.5 py-1 text-xs outline-none focus:ring-0 ${required ? "font-semibold" : ""}`;
    if (column.key === "itemCode") return <SheetLink doctype="Item" value={line.itemCode} onChange={(value) => void chooseItem(lineIndex, value)} readOnly={submitted} required fieldname={`sales_item_${lineIndex}`} />;
    if (column.key === "color") return line.itemCode && (line.requireColor || line.color) ? <SheetLink doctype="Item Color" value={line.color} onChange={(color) => patchLine(lineIndex, { color, formula: null })} readOnly={submitted} required={line.requireColor} fieldname={`sales_color_${lineIndex}`} /> : null;
    if (column.key === "thickness") {
      if (!line.itemCode || (line.mode !== "WIDTH" && !line.thickness)) return null;
      return <select className={base} value={line.thickness} disabled={submitted || line.fixedThickness} onChange={(event) => patchLine(lineIndex, { thickness: event.target.value })}>
        <option value=""></option>
        {line.thickness && !thicknessOptions.includes(line.thickness) ? <option value={line.thickness}>{line.thickness} ly</option> : null}
        {thicknessOptions.map((value) => <option key={value} value={value}>{value} ly</option>)}
      </select>;
    }
    if (column.key === "height") return line.itemCode && (line.mode === "HEIGHT" || line.mode === "AREA") ? <input className={base} inputMode="decimal" value={line.height} disabled={submitted} onChange={(event) => patchLine(lineIndex, { height: event.target.value, formula: null })} /> : null;
    if (column.key === "width") return line.itemCode && (line.mode === "WIDTH" || line.mode === "AREA") ? <div className="px-1.5 py-0.5"><input className={`${base} px-0`} inputMode="decimal" value={line.width} disabled={submitted} onChange={(event) => patchLine(lineIndex, { width: event.target.value, formula: null })} />{line.mode === "AREA" && line.formula?.sales_width_basis ? <div className="text-[9px] leading-none text-muted-foreground">{String(line.formula.sales_width_basis)}</div> : null}</div> : null;
    if (column.key === "area") return areaPerSet(line) == null ? null : <div className="px-1.5 text-right text-xs tabular-nums">{number(areaPerSet(line), 3)}</div>;
    if (column.key === "qty") return line.itemCode ? <input className={`${base} text-right`} inputMode="numeric" value={line.qty} disabled={submitted} onChange={(event) => patchLine(lineIndex, { qty: event.target.value, formula: null })} /> : null;
    if (column.key === "rate") return line.itemCode && line.rate != null ? <div className="px-1.5 text-right text-xs tabular-nums">{money(line.rate)}</div> : null;
    if (column.key === "discount") return null;
    if (column.key === "uom") return line.uom ? <div className="px-1.5 text-center text-xs">{line.uom}</div> : null;
    if (column.key === "amount") return line.itemCode && line.rate != null && billableQty(line) > 0 ? <div className="px-1.5 text-right text-xs font-semibold tabular-nums">{money(grossAmount(line))}</div> : null;
    return null;
  };

  const renderDiscountCell = (line: SaleLine, lineIndex: number, column: ColumnDef) => {
    if (column.key === "itemCode") return <span className="px-1.5 text-xs font-medium text-muted-foreground">Chiết khấu</span>;
    if (column.key === "discount") return <input className="min-h-8 w-full border-0 bg-transparent px-1.5 text-right text-xs font-semibold outline-none focus:ring-0" inputMode="decimal" value={line.discountPct} disabled={submitted} onChange={(event) => patchLine(lineIndex, { discountPct: event.target.value.replace("%", ""), discountTouched: true })} />;
    if (column.key === "amount") return line.discountPct.trim() && line.rate != null && billableQty(line) > 0 ? <div className="px-1.5 text-right text-xs font-semibold tabular-nums">-{money(lineDiscountAmount(line))}</div> : null;
    return null;
  };

  const renderGrid = (full: boolean) => <div ref={gridRef} className={`${full ? "h-full" : "max-h-[60vh]"} overflow-auto border border-border bg-background`} onKeyDown={onKeyDown} onPaste={onPaste}>
    <table className="w-max min-w-full border-collapse text-xs">
      <thead className="sticky top-0 z-30 bg-muted/95">
        <tr>
          {!submitted ? <th className="sticky left-0 z-40 w-9 min-w-9 border border-border bg-muted p-1"><Checkbox checked={lines.length > 0 && selected.length === lines.length} onCheckedChange={() => setSelected(selected.length === lines.length ? [] : lines.map((line) => line.id))} /></th> : null}
          <th className={`${submitted ? "sticky left-0" : "sticky left-9"} z-40 w-10 min-w-10 border border-border bg-muted px-1 text-center text-[10px] font-bold`}>STT</th>
          {visibleColumns.map((column) => <th key={column.key} className="border border-border px-2 py-2 text-center text-[10px] font-bold whitespace-nowrap" style={{ width: `${column.width}rem`, minWidth: `${column.width}rem` }}>{column.label}</th>)}
          {!submitted ? <th className="w-14 min-w-14 border border-border bg-muted"></th> : null}
        </tr>
      </thead>
      <tbody>
        {lines.map((line, lineIndex) => <FragmentRows key={line.id} line={line} lineIndex={lineIndex} submitted={submitted} selected={selected.includes(line.id)} visibleColumns={visibleColumns} onSelect={() => setSelected((current) => current.includes(line.id) ? current.filter((id) => id !== line.id) : [...current, line.id])} renderCell={renderCell} renderDiscountCell={renderDiscountCell} setPicked={setPicked} onDetail={() => setDetailIndex(lineIndex)} onDelete={() => deleteIndexes([lineIndex])} />)}
      </tbody>
    </table>
  </div>;

  return <div className="h-full w-full overflow-auto bg-background p-3 md:p-4">
    <div className="mx-auto w-full max-w-[1800px] space-y-3">
      <div className="flex flex-wrap items-center gap-2 border-b pb-2">
        <div>
          <h1 className="text-lg font-semibold">Bán hàng</h1>
          <p className="text-xs text-muted-foreground">Sales Sheet · nhập trực tiếp như bảng tính</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {createdOrder?.name ? <Button type="button" size="sm" variant="outline" onClick={() => navigate(`/form/Sales Order/${encodeURIComponent(String(createdOrder.name))}`)}>{String(createdOrder.name)}</Button> : null}
          {submitted ? <span className="inline-flex items-center gap-1 text-xs font-medium"><CheckCircle2 className="h-4 w-4" /> Đã xác nhận</span> : <span className="text-xs text-muted-foreground">Đơn nháp mới</span>}
        </div>
      </div>

      <section className="grid gap-3 border p-3 md:grid-cols-4">
        {!contextCompany ? <HeaderLink label="Công ty" doctype="Company" value={company} onChange={setCompany} required readOnly={submitted} /> : null}
        <div className="md:col-span-2">
          <HeaderLink label="Khách hàng" doctype="Customer" value={customer.name} onChange={(name) => { setCustomer({ name, group: "", phone: "", address: "" }); setPriceList(""); }} required readOnly={submitted} />
        </div>
        <div className="flex items-end gap-2">
          <Button type="button" variant="outline" size="sm" disabled={submitted} onClick={() => openMaster("Customer")}>+ Khách hàng</Button>
          <Button type="button" variant="outline" size="sm" disabled={submitted} onClick={() => openMaster("Supplier")}>+ NCC</Button>
        </div>
        <div className="grid gap-1.5"><Label>Loại khách</Label><Input value={customer.group} readOnly /></div>
        <div className="grid gap-1.5"><Label>Ngày đặt hàng *</Label><Input type="date" value={transactionDate} disabled={submitted} onChange={(event) => setTransactionDate(event.target.value)} /></div>
        <div className="grid gap-1.5"><Label>Ngày giao hàng *</Label><Input type="date" min={transactionDate} value={deliveryDate} disabled={submitted} onChange={(event) => setDeliveryDate(event.target.value)} /></div>
        {contextWarehouse ? <div className="grid gap-1.5"><Label>Kho bán</Label><Input value={warehouse} readOnly /></div> : <HeaderLink label="Kho bán" doctype="Warehouse" value={warehouse} onChange={setWarehouse} required readOnly={submitted} />}
        <div className="grid gap-1.5 md:col-span-4"><Label>Ghi chú</Label><Input value={note} disabled={submitted} onChange={(event) => setNote(event.target.value)} /></div>
        {customer.name ? <div className="md:col-span-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {customer.phone ? <span>{customer.phone}</span> : null}
          {priceList ? <span>Bảng giá: <strong className="font-medium text-foreground">{priceList}</strong></span> : <span className="text-amber-700">{priceListError || "Đang xác định bảng giá…"}</span>}
          {currency ? <span>{currency}</span> : null}
        </div> : null}
      </section>

      <div className="flex flex-wrap items-center gap-2">
        {!submitted ? <Button type="button" variant="outline" size="sm" onClick={() => addLines(1)}><Plus /> Dòng</Button> : null}
        {!submitted ? <Button type="button" variant="outline" size="sm" onClick={() => addLines(10)}>+10 dòng</Button> : null}
        {!submitted && selected.length ? <Button type="button" variant="outline" size="sm" onClick={duplicateSelected}><Copy /> Nhân bản {selected.length}</Button> : null}
        {!submitted && selected.length ? <Button type="button" variant="ghost" size="sm" className="text-destructive" onClick={() => deleteIndexes(lines.map((line, index) => selected.includes(line.id) ? index : -1).filter((index) => index >= 0))}><Trash2 /> Xóa {selected.length}</Button> : null}
        {!submitted && lastDeleted?.length ? <Button type="button" variant="ghost" size="sm" onClick={undoDelete}><Undo2 /> Hoàn tác</Button> : null}
        <Button type="button" variant="ghost" size="sm" onClick={() => setColumnDialog(true)}><Columns3 /> Cột</Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setExpanded(true)}><Maximize2 /> Bảng lớn</Button>
        <span className="ml-auto text-xs text-muted-foreground">{lines.length} mặt hàng · mỗi mặt hàng 2 hàng</span>
      </div>

      {renderGrid(false)}

      <section className="ml-auto w-full max-w-md border">
        <div className="grid grid-cols-2 border-b"><div className="p-2 text-sm">Tổng tiền hàng</div><div className="p-2 text-right text-sm font-medium tabular-nums">{money(total)}</div></div>
        <div className="grid grid-cols-2 border-b"><div className="p-2 text-sm">Giao nhận</div><div className="p-2"></div></div>
        <div className="grid grid-cols-2 border-b"><div className="p-2 text-sm">Thuế</div><div className="p-2"></div></div>
        <div className="grid grid-cols-2 border-b"><div className="p-2 text-sm">Đã thu</div><div className="p-2"></div></div>
        <div className="grid grid-cols-2"><div className="p-2 text-sm font-bold">CÒN PHẢI THU</div><div className="p-2 text-right text-sm font-bold tabular-nums">{money(total)}</div></div>
      </section>

      {globalError ? <div className="flex items-start gap-2 border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"><TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />{globalError}</div> : null}

      <div className="flex flex-wrap justify-end gap-2 border-t pt-3">
        {!submitted ? <Button type="button" variant="outline" disabled={Boolean(saving)} onClick={() => void saveOrder(true)}>{saving === "draft" ? "Đang lưu…" : "Lưu nháp"}</Button> : null}
        {!submitted ? <Button type="button" disabled={Boolean(saving)} onClick={() => void saveOrder(false)}>{saving === "submit" ? "Đang xác nhận…" : "Xác nhận đơn"}</Button> : null}
        {createdOrder?.name ? <Button type="button" variant="outline" onClick={printHtml}><Printer /> In / PDF</Button> : null}
        {createdOrder?.name ? <Button type="button" variant="outline" onClick={exportExcel}><FileSpreadsheet /> Excel</Button> : null}
        {submitted ? <Button type="button" onClick={startNew}>Tạo đơn mới</Button> : null}
      </div>
    </div>

    <Dialog open={columnDialog} onOpenChange={setColumnDialog}>
      <DialogContent className="w-[min(92vw,620px)] max-w-none">
        <DialogHeader><DialogTitle>Cột Sales Sheet</DialogTitle><DialogDescription>Mặc định hiển thị đầy đủ. Tùy chỉnh này chỉ lưu trên thiết bị hiện tại.</DialogDescription></DialogHeader>
        <div className="grid gap-2 sm:grid-cols-2">
          {COLUMNS.map((column) => <label key={column.key} className="flex items-center gap-2 border p-2 text-sm"><Checkbox checked={!hiddenColumns.includes(column.key)} onCheckedChange={(checkedValue) => saveHiddenColumns(checkedValue ? hiddenColumns.filter((key) => key !== column.key) : [...new Set([...hiddenColumns, column.key])])} />{column.label}</label>)}
        </div>
        <div className="flex justify-end"><Button type="button" variant="outline" onClick={() => saveHiddenColumns([])}><RotateCcw /> Hiện tất cả</Button></div>
      </DialogContent>
    </Dialog>

    <Dialog open={expanded} onOpenChange={setExpanded}>
      <DialogContent className="flex h-[94vh] w-[97vw] max-w-none flex-col overflow-hidden p-3">
        <DialogHeader className="shrink-0"><div className="flex items-center"><div><DialogTitle>Sales Sheet · Bảng lớn</DialogTitle><DialogDescription>{lines.length} mặt hàng · nhập trực tiếp bằng bàn phím hoặc paste từ Excel</DialogDescription></div><Button type="button" variant="ghost" size="icon-sm" className="ml-auto" onClick={() => setExpanded(false)}><X /></Button></div></DialogHeader>
        <div className="min-h-0 flex-1">{renderGrid(true)}</div>
      </DialogContent>
    </Dialog>

    <Dialog open={detailIndex != null} onOpenChange={(open) => { if (!open) setDetailIndex(null); }}>
      <DialogContent className="max-h-[90vh] w-[min(94vw,900px)] max-w-none overflow-auto">
        <DialogHeader><DialogTitle>Chi tiết mặt hàng {detailIndex == null ? "" : detailIndex + 1}</DialogTitle><DialogDescription>Cùng dữ liệu với Sales Sheet; thay đổi ở đây phản ánh ngay lên bảng.</DialogDescription></DialogHeader>
        {detailIndex != null && lines[detailIndex] ? <LineDetail line={lines[detailIndex]!} index={detailIndex} submitted={submitted} thicknessOptions={thicknessOptions} patchLine={patchLine} chooseItem={chooseItem} /> : null}
      </DialogContent>
    </Dialog>
  </div>;
}

function FragmentRows({ line, lineIndex, submitted, selected, visibleColumns, onSelect, renderCell, renderDiscountCell, setPicked, onDetail, onDelete }: {
  line: SaleLine;
  lineIndex: number;
  submitted: boolean;
  selected: boolean;
  visibleColumns: ColumnDef[];
  onSelect: () => void;
  renderCell: (line: SaleLine, lineIndex: number, column: ColumnDef) => React.ReactNode;
  renderDiscountCell: (line: SaleLine, lineIndex: number, column: ColumnDef) => React.ReactNode;
  setPicked: (value: { line: number; column: number }) => void;
  onDetail: () => void;
  onDelete: () => void;
}) {
  return <>
    <tr className={selected ? "bg-primary/[0.03]" : ""}>
      {!submitted ? <td rowSpan={2} className="sticky left-0 z-20 border border-border bg-background p-1 text-center align-middle"><Checkbox checked={selected} onCheckedChange={onSelect} /></td> : null}
      <td rowSpan={2} className={`${submitted ? "sticky left-0" : "sticky left-9"} z-20 border border-border bg-background px-1 text-center align-middle text-[10px] text-muted-foreground`}>{lineIndex + 1}</td>
      {visibleColumns.map((column, columnIndex) => <td key={column.key} data-cell={`${lineIndex}:${columnIndex}`} className={`${column.numeric ? "text-right" : ""} h-9 border border-border bg-background p-0 align-middle`} style={{ width: `${column.width}rem`, minWidth: `${column.width}rem` } as CSSProperties} onFocusCapture={() => setPicked({ line: lineIndex, column: columnIndex })} onClick={() => setPicked({ line: lineIndex, column: columnIndex })}>{renderCell(line, lineIndex, column)}</td>)}
      {!submitted ? <td rowSpan={2} className="border border-border bg-background p-1 align-middle"><div className="flex"><Button type="button" variant="ghost" size="icon-sm" onClick={onDetail}><Maximize2 /></Button><Button type="button" variant="ghost" size="icon-sm" className="text-muted-foreground hover:text-destructive" onClick={onDelete}><Trash2 /></Button></div></td> : null}
    </tr>
    <tr className="bg-muted/[0.12]">
      {visibleColumns.map((column) => <td key={column.key} className={`${column.numeric ? "text-right" : ""} h-8 border border-border p-0 align-middle`}>{renderDiscountCell(line, lineIndex, column)}</td>)}
    </tr>
  </>;
}

function LineDetail({ line, index, submitted, thicknessOptions, patchLine, chooseItem }: {
  line: SaleLine;
  index: number;
  submitted: boolean;
  thicknessOptions: string[];
  patchLine: (index: number, patch: Partial<SaleLine>) => void;
  chooseItem: (index: number, value: string) => Promise<void>;
}) {
  return <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
    <div className="grid gap-1.5"><Label>Sản phẩm *</Label><SheetLink doctype="Item" value={line.itemCode} onChange={(value) => void chooseItem(index, value)} readOnly={submitted} required fieldname={`detail_item_${index}`} /></div>
    <div className="grid gap-1.5"><Label>Màu sắc{line.requireColor ? " *" : ""}</Label>{line.itemCode && (line.requireColor || line.color) ? <SheetLink doctype="Item Color" value={line.color} onChange={(color) => patchLine(index, { color, formula: null })} readOnly={submitted} required={line.requireColor} fieldname={`detail_color_${index}`} /> : <Input value="" readOnly />}</div>
    <div className="grid gap-1.5"><Label>Độ dày</Label><select className="h-9 rounded-md border bg-background px-2 text-sm" value={line.thickness} disabled={submitted || line.fixedThickness || !line.itemCode} onChange={(event) => patchLine(index, { thickness: event.target.value })}><option value=""></option>{line.thickness && !thicknessOptions.includes(line.thickness) ? <option value={line.thickness}>{line.thickness} ly</option> : null}{thicknessOptions.map((value) => <option key={value} value={value}>{value} ly</option>)}</select></div>
    <div className="grid gap-1.5"><Label>Chiều cao</Label><Input value={line.height} disabled={submitted || !(line.mode === "HEIGHT" || line.mode === "AREA")} onChange={(event) => patchLine(index, { height: event.target.value, formula: null })} /></div>
    <div className="grid gap-1.5"><Label>Chiều rộng</Label><Input value={line.width} disabled={submitted || !(line.mode === "WIDTH" || line.mode === "AREA")} onChange={(event) => patchLine(index, { width: event.target.value, formula: null })} /></div>
    <div className="grid gap-1.5"><Label>Diện tích</Label><Input value={areaPerSet(line) == null ? "" : number(areaPerSet(line), 3)} readOnly /></div>
    <div className="grid gap-1.5"><Label>SL *</Label><Input value={line.qty} disabled={submitted} onChange={(event) => patchLine(index, { qty: event.target.value, formula: null })} /></div>
    <div className="grid gap-1.5"><Label>Đơn giá</Label><Input value={line.rate == null ? "" : money(line.rate)} readOnly /></div>
    <div className="grid gap-1.5"><Label>ĐVT</Label><Input value={line.uom} readOnly /></div>
    <div className="grid gap-1.5"><Label>Chiết khấu %</Label><Input value={line.discountPct} disabled={submitted} onChange={(event) => patchLine(index, { discountPct: event.target.value.replace("%", ""), discountTouched: true })} /></div>
    <div className="grid gap-1.5"><Label>Tiền hàng</Label><Input value={line.rate == null ? "" : money(grossAmount(line))} readOnly /></div>
    <div className="grid gap-1.5"><Label>Tiền chiết khấu</Label><Input value={line.discountPct.trim() ? `-${money(lineDiscountAmount(line))}` : ""} readOnly /></div>
    {line.error ? <div className="sm:col-span-2 xl:col-span-3 border border-destructive/30 bg-destructive/5 p-2 text-sm text-destructive">{line.error}</div> : null}
  </div>;
}
