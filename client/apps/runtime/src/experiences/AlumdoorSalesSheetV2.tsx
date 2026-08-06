import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { FileSpreadsheet, Plus, Printer, Trash2, TriangleAlert } from "lucide-react";
import type { Doc, DocField } from "@metaforge/core";
import { useMetaForge } from "@metaforge/views/provider";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  toast,
} from "@metaforge/ui";

type Json = Record<string, unknown>;
type CalculationMode = "QUANTITY" | "HEIGHT" | "WIDTH" | "AREA";
type CustomerGroup = "Đại lý" | "Bán lẻ" | "Nhà thầu" | "";

type FormulaResult = Json & {
  policy_name?: string;
  formula_version?: string;
  door_type?: string;
  input_width_basis?: string;
  input_height_basis?: string;
  width_basis?: string;
  sales_width_basis?: string;
  default_discount_pct?: number;
  area_per_set_sqm?: number;
  billable_area_sqm?: number;
  cut_width_m?: number;
  cover_height_m?: number;
  mesh_height_m?: number;
  total_leaf_count?: number;
  ray_type?: string | null;
  ray_options?: string[];
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
  group: CustomerGroup;
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
  rayType: string;
  rayOptions: string[];
  color: string;
  requireColor: boolean;
  thickness: string;
  fixedThickness: boolean;
  height: string;
  heightBasis: string;
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

type ColumnKey =
  | "item" | "color" | "ray" | "thickness"
  | "rayLength" | "shaftLength"
  | "heightClear" | "heightCover" | "heightMesh"
  | "widthClear" | "widthRay" | "widthPlastic" | "widthCut"
  | "area" | "leafCount" | "qty" | "rate" | "discount" | "uom" | "amount";

type ColumnDef = { key: ColumnKey; label: string; unit?: string; width: string };

const COLUMNS: ColumnDef[] = [
  { key: "item", label: "SẢN PHẨM", width: "13rem" },
  { key: "color", label: "MÀU", width: "6rem" },
  { key: "ray", label: "LOẠI RAY", width: "6rem" },
  { key: "thickness", label: "DÀY", unit: "mm", width: "5rem" },
  { key: "rayLength", label: "DÀI RAY", unit: "m", width: "6.5rem" },
  { key: "shaftLength", label: "DÀI TRỤC", unit: "m", width: "6.5rem" },
  { key: "heightClear", label: "CAO LỌT LÒNG", unit: "m", width: "8rem" },
  { key: "heightCover", label: "CAO PB", unit: "m", width: "6.5rem" },
  { key: "heightMesh", label: "CAO LƯỚI", unit: "m", width: "7rem" },
  { key: "widthClear", label: "RỘNG LỌT LÒNG", unit: "m", width: "8.5rem" },
  { key: "widthRay", label: "RỘNG PB RAY", unit: "m", width: "8rem" },
  { key: "widthPlastic", label: "RỘNG PB NHỰA", unit: "m", width: "8.5rem" },
  { key: "widthCut", label: "RỘNG CẮT LÁ", unit: "m", width: "8rem" },
  { key: "area", label: "DT", unit: "m²", width: "5.5rem" },
  { key: "leafCount", label: "SỐ LÁ", width: "5rem" },
  { key: "qty", label: "SL", width: "4rem" },
  { key: "rate", label: "Đ.GIÁ", width: "7rem" },
  { key: "discount", label: "CK %", width: "4.5rem" },
  { key: "uom", label: "ĐVT", width: "5rem" },
  { key: "amount", label: "THÀNH TIỀN", width: "8rem" },
];

const CORE_COLUMNS = new Set<ColumnKey>(["item", "qty", "rate", "discount", "uom", "amount"]);
const today = () => {
  const date = new Date();
  return new Date(date.valueOf() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
};
const printRoute = (name: unknown) => `/print/${encodeURIComponent("Sales Order")}/${encodeURIComponent(String(name))}`;
const normalize = (value: unknown) => String(value ?? "").normalize("NFC").trim().toLocaleLowerCase("vi");
const checked = (value: unknown) => value === true || value === 1 || value === "1" || ["true", "yes", "có", "co"].includes(normalize(value));
const decimal = (value: unknown) => Number(String(value ?? "").trim().replace(",", "."));
const positive = (value: unknown) => Number.isFinite(decimal(value)) && decimal(value) > 0;
const integerPositive = (value: unknown) => Number.isInteger(decimal(value)) && decimal(value) > 0;
const money = (value: unknown) => Number.isFinite(Number(value)) ? Number(value).toLocaleString("vi-VN", { maximumFractionDigits: 0 }) : "";
const number = (value: unknown, digits = 3) => Number.isFinite(Number(value)) ? Number(value).toLocaleString("vi-VN", { maximumFractionDigits: digits }) : "";
const sameBasis = (value: unknown, basis: string) => normalize(value) === normalize(basis);

function canonicalCustomerGroup(value: unknown): CustomerGroup {
  const normalized = normalize(value);
  if (!normalized) return "";
  if (normalized.includes("đại lý") || normalized.includes("dai ly") || normalized.includes("dealer")) return "Đại lý";
  if (normalized.includes("nhà thầu") || normalized.includes("nha thau") || normalized.includes("contractor") || normalized.includes("công trình") || normalized.includes("cong trinh")) return "Nhà thầu";
  if (normalized === "lẻ" || normalized.includes("khách lẻ") || normalized.includes("khach le") || normalized.includes("bán lẻ") || normalized.includes("ban le") || normalized.includes("retail")) return "Bán lẻ";
  return "";
}

function formulaCustomerGroup(value: CustomerGroup): "Đại lý" | "Lẻ" | "" {
  if (value === "Đại lý") return "Đại lý";
  if (value === "Bán lẻ" || value === "Nhà thầu") return "Lẻ";
  return "";
}

function priceListMatchesGroup(name: unknown, group: CustomerGroup): boolean {
  const value = normalize(name);
  if (group === "Đại lý") return value.includes("đại lý") || value.includes("dai ly") || value.includes("dealer");
  if (group === "Bán lẻ") return value.includes("bán lẻ") || value.includes("ban le") || value.includes("khách lẻ") || value.includes("khach le") || value.includes("retail");
  if (group === "Nhà thầu") return value.includes("nhà thầu") || value.includes("nha thau") || value.includes("contractor") || value.includes("công trình") || value.includes("cong trinh");
  return false;
}

function newLine(): SaleLine {
  return {
    id: `sale-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    itemCode: "", itemName: "", itemGroup: "", doorType: "", mode: "QUANTITY",
    rayType: "", rayOptions: [], color: "", requireColor: false,
    thickness: "", fixedThickness: false, height: "", heightBasis: "", width: "", widthBasis: "",
    qty: "1", rate: null, uom: "", allowedUoms: [], currency: "", warehouse: "",
    discountPct: "", discountTouched: false, formula: null,
    managedStock: true, stockQty: null, stockShort: null, stockMessage: "", busy: false, error: "",
  };
}

function calculationMode(item: Json): CalculationMode {
  const code = String(item.item_code ?? item.name ?? "").trim().toLocaleUpperCase("vi");
  const group = normalize(item.item_group);
  const inventory = normalize(item.inventory_mode);
  const salesUom = normalize(item.default_sales_uom ?? item.stock_uom).replaceAll(" ", "");
  if (inventory === "hàng thường") return "QUANTITY";
  if (code.startsWith("RAY-") || group.includes("ray")) return "HEIGHT";
  if (code.startsWith("TRUC-") || group.includes("trục") || group.includes("truc")) return "WIDTH";
  if (code.startsWith("CUA-") || inventory === "thành phẩm theo m2" || String(item.door_type ?? "").trim() || ["m2", "m²", "m^2", "métvuông", "metvuong"].includes(salesUom)) return "AREA";
  return "QUANTITY";
}

function discountRate(line: SaleLine): number {
  if (!line.discountPct.trim()) return 0;
  const value = decimal(line.discountPct);
  return Number.isFinite(value) && value >= 0 && value <= 100 ? value : 0;
}

function areaPerSet(line: SaleLine): number | null {
  if (line.mode !== "AREA") return null;
  const authoritative = Number(line.formula?.area_per_set_sqm);
  if (Number.isFinite(authoritative) && authoritative > 0) return authoritative;
  const height = decimal(line.height);
  const width = decimal(line.width);
  return positive(height) && positive(width) ? height * width : null;
}

function billableQty(line: SaleLine, preview = true): number {
  const sets = decimal(line.qty);
  if (!Number.isFinite(sets) || sets <= 0) return 0;
  if (line.mode === "AREA") {
    const authoritative = Number(line.formula?.billable_area_sqm);
    if (Number.isFinite(authoritative) && authoritative > 0) return authoritative;
    const area = preview ? areaPerSet(line) : null;
    return area == null ? 0 : area * sets;
  }
  if (line.mode === "HEIGHT") return positive(line.height) ? decimal(line.height) * sets : 0;
  if (line.mode === "WIDTH") return positive(line.width) ? decimal(line.width) * sets : 0;
  return sets;
}

function grossAmount(line: SaleLine): number { return billableQty(line) * Number(line.rate ?? 0); }
function discountAmount(line: SaleLine): number { return grossAmount(line) * discountRate(line) / 100; }
function netAmount(line: SaleLine): number { return grossAmount(line) - discountAmount(line); }

function columnApplies(line: SaleLine, key: ColumnKey): boolean {
  if (!line.itemCode) return false;
  if (key === "color") return line.requireColor;
  if (key === "ray") return line.mode === "AREA" && Boolean(line.rayType || line.rayOptions.length);
  if (key === "thickness") return line.mode === "WIDTH";
  if (key === "rayLength") return line.mode === "HEIGHT";
  if (key === "shaftLength") return line.mode === "WIDTH";
  if (key === "heightClear") return line.mode === "AREA" && sameBasis(line.heightBasis, "Cao lọt lòng");
  if (key === "heightCover") return line.mode === "AREA";
  if (key === "heightMesh") return line.mode === "AREA" && (sameBasis(line.heightBasis, "Cao lưới") || Number(line.formula?.mesh_height_m) > 0);
  if (key === "widthClear") return line.mode === "AREA" && sameBasis(line.widthBasis, "Rộng lọt lòng");
  if (key === "widthRay") return line.mode === "AREA" && sameBasis(line.widthBasis, "Phủ bì ray");
  if (key === "widthPlastic") return line.mode === "AREA" && sameBasis(line.widthBasis, "Phủ bì nhựa");
  if (key === "widthCut" || key === "area" || key === "leafCount") return line.mode === "AREA";
  return false;
}

function SheetLink({ doctype, value, onChange, readOnly, required, fieldname }: {
  doctype: string; value: string; onChange: (value: string) => void; readOnly?: boolean; required?: boolean; fieldname: string;
}) {
  const { registry, services } = useMetaForge();
  const Control = registry.resolve("Link");
  const field: DocField = { fieldname, label: fieldname, fieldtype: "Link", options: doctype, ...(required ? { reqd: 1 as const } : {}) };
  return Control
    ? <Control field={field} value={value} onChange={(next: unknown) => onChange(String(next ?? ""))} readOnly={readOnly} required={required} services={services} linkTarget={doctype} docValues={{}} compact />
    : <Input value={value} readOnly />;
}

function HeaderLink({ label, doctype, value, onChange, required, readOnly }: {
  label: string; doctype: string; value: string; onChange: (value: string) => void; required?: boolean; readOnly?: boolean;
}) {
  return <div className="grid min-w-0 gap-1">
    <Label className="text-[11px] font-semibold">{label}{required ? <span className="text-red-600"> *</span> : null}</Label>
    <div className={required && !value ? "ring-1 ring-inset ring-red-500" : ""}>
      <SheetLink doctype={doctype} value={value} onChange={onChange} required={required} readOnly={readOnly} fieldname={`sales_${normalize(doctype).replaceAll(" ", "_")}`} />
    </div>
  </div>;
}

export function AlumdoorSalesSheetV2() {
  const { adapter, businessContext } = useMetaForge();
  const generation = useRef(0);
  const contextCompany = String(businessContext.company ?? "").trim();
  const contextWarehouse = String(businessContext.warehouse ?? "").trim();

  const [company, setCompany] = useState(contextCompany);
  const [currency, setCurrency] = useState("");
  const [customer, setCustomer] = useState<CustomerState>({ name: "", group: "", phone: "", address: "" });
  const [priceList, setPriceList] = useState("");
  const [priceListError, setPriceListError] = useState("");
  const [transactionDate, setTransactionDate] = useState(today());
  const [deliveryDate, setDeliveryDate] = useState(today());
  const [note, setNote] = useState("");
  const [vatPct, setVatPct] = useState("");
  const [lines, setLines] = useState<SaleLine[]>([newLine()]);
  const [thicknessOptions, setThicknessOptions] = useState<string[]>([]);
  const [saving, setSaving] = useState<"" | "draft" | "submit">("");
  const [createdOrder, setCreatedOrder] = useState<Doc | null>(null);
  const [quickCreate, setQuickCreate] = useState(false);
  const [globalError, setGlobalError] = useState("");
  const submitted = Boolean(createdOrder && Number(createdOrder.docstatus ?? 0) === 1);
  const canonicalGroup = canonicalCustomerGroup(customer.group);
  const formulaGroup = formulaCustomerGroup(canonicalGroup);

  const visibleColumns = useMemo(() => COLUMNS.filter((column) => CORE_COLUMNS.has(column.key) || lines.some((line) => columnApplies(line, column.key))), [lines]);

  const patchLine = (index: number, patch: Partial<SaleLine>) => setLines((current) => current.map((line, lineIndex) => lineIndex === index ? { ...line, ...patch } : line));

  const refreshContext = async (index: number, itemCode: string, requestedUom = "") => {
    if (!itemCode) return;
    if (!priceList) {
      patchLine(index, { rate: null, error: canonicalGroup ? `Chưa cấu hình Bảng giá ${canonicalGroup}.` : "Cần chọn Loại khách để xác định bảng giá." });
      return;
    }
    try {
      const context = await adapter.callPost<ItemContext>("alumdoor.sales.item_context", {
        item_code: itemCode,
        customer: customer.name,
        customer_group: canonicalGroup,
        company,
        currency,
        price_list: priceList,
        transaction_date: transactionDate,
        ...(requestedUom ? { uom: requestedUom } : {}),
        ...(contextWarehouse ? { warehouse: contextWarehouse } : {}),
      });
      const rate = context.rate == null ? null : Number(context.rate);
      const error = context.price_missing || rate == null
        ? `Chưa có giá ${canonicalGroup || priceList} cho mặt hàng ${itemCode}.`
        : String(context.stock_read_error ?? "");
      patchLine(index, {
        itemGroup: String(context.item_group ?? ""),
        uom: String(context.selected_uom ?? requestedUom ?? ""),
        allowedUoms: [...new Set((context.allowed_uoms ?? []).map((value) => String(value ?? "").trim()).filter(Boolean))],
        warehouse: String(context.warehouse ?? contextWarehouse ?? ""),
        managedStock: context.managed_stock !== false,
        stockQty: context.available_qty == null ? null : Number(context.available_qty),
        rate: Number.isFinite(rate) ? rate : null,
        currency: String(context.currency ?? currency),
        error,
      });
    } catch (cause) {
      patchLine(index, { rate: null, error: adapter.mapError(cause).message });
    }
  };

  const refreshMeasurementBasis = async (index: number, itemCode: string, requestedRay = "") => {
    if (!itemCode || !formulaGroup) return;
    try {
      const context = await adapter.callPost<FormulaResult>("alumdoor.sales.production_line_context", {
        item_code: itemCode,
        customer_group: formulaGroup,
        sales_mode: "Trọn bộ",
        basis_only: true,
        ...(requestedRay ? { ray_type: requestedRay } : {}),
      });
      const nextWidth = String(context.input_width_basis ?? context.width_basis ?? "").trim();
      const nextHeight = String(context.input_height_basis ?? "").trim();
      const rayOptions = [...new Set((context.ray_options ?? []).map((value) => String(value ?? "").trim()).filter(Boolean))];
      const resolvedRay = requestedRay || String(context.ray_type ?? "").trim() || (rayOptions.length === 1 ? rayOptions[0]! : "");
      setLines((current) => current.map((line, lineIndex) => {
        if (lineIndex !== index || line.itemCode !== itemCode) return line;
        const widthChanged = Boolean(line.widthBasis && nextWidth && !sameBasis(line.widthBasis, nextWidth));
        const heightChanged = Boolean(line.heightBasis && nextHeight && !sameBasis(line.heightBasis, nextHeight));
        const rawDefault = Number(context.default_discount_pct ?? 0);
        const defaultDiscount = Number.isFinite(rawDefault) && rawDefault > 0 ? String(rawDefault) : "";
        return {
          ...line,
          doorType: String(context.door_type ?? line.doorType),
          rayType: resolvedRay,
          rayOptions,
          widthBasis: nextWidth,
          heightBasis: nextHeight,
          width: widthChanged ? "" : line.width,
          height: heightChanged ? "" : line.height,
          discountPct: line.discountTouched ? line.discountPct : defaultDiscount,
          formula: null,
          stockShort: null,
          stockMessage: "",
        };
      }));
    } catch (cause) {
      patchLine(index, { error: adapter.mapError(cause).message });
    }
  };

  const chooseItem = async (index: number, value: string) => {
    const itemCode = value.trim();
    if (!itemCode) { patchLine(index, newLine()); return; }
    patchLine(index, {
      itemCode, itemName: "", itemGroup: "", doorType: "", mode: "QUANTITY", rayType: "", rayOptions: [],
      color: "", requireColor: false, thickness: "", fixedThickness: false, height: "", heightBasis: "", width: "", widthBasis: "",
      rate: null, uom: "", allowedUoms: [], formula: null, stockQty: null, stockShort: null, stockMessage: "", error: "", busy: true,
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
          requireColor = mode !== "QUANTITY" && checked(profile.require_color);
          const fixed = Number(profile.default_thickness_mm ?? profile.thickness_mm);
          if (Number.isFinite(fixed) && fixed > 0) { thickness = String(fixed).replace(".", ","); fixedThickness = true; }
        } catch { /* profile is advisory for the sheet; worker remains authoritative */ }
      }
      patchLine(index, {
        itemName: String(doc.item_name ?? doc.name ?? itemCode),
        itemGroup: String(doc.item_group ?? ""),
        doorType: String(doc.door_type ?? ""),
        mode, requireColor, thickness, fixedThickness, busy: false,
      });
      if (mode === "AREA") await refreshMeasurementBasis(index, itemCode);
      await refreshContext(index, itemCode);
    } catch (cause) {
      patchLine(index, { busy: false, error: adapter.mapError(cause).message });
    }
  };

  const changeUom = async (index: number, uom: string) => {
    const line = lines[index];
    if (!line?.itemCode) return;
    patchLine(index, { uom, rate: null, stockQty: null, error: "" });
    await refreshContext(index, line.itemCode, uom);
  };

  const changeRay = async (index: number, rayType: string) => {
    const line = lines[index];
    if (!line?.itemCode) return;
    patchLine(index, { rayType, formula: null, stockShort: null, stockMessage: "", error: "" });
    await refreshMeasurementBasis(index, line.itemCode, rayType);
  };

  useEffect(() => { if (contextCompany) setCompany(contextCompany); }, [contextCompany]);

  useEffect(() => {
    if (!company) { setCurrency(""); return; }
    let active = true;
    void adapter.getDoc("Company", company).then(({ doc }) => {
      if (active) setCurrency(String(doc.default_currency ?? doc.currency ?? "").trim());
    }).catch((cause) => { if (active) setGlobalError(adapter.mapError(cause).message); });
    return () => { active = false; };
  }, [adapter, company]);

  useEffect(() => {
    let active = true;
    void adapter.getList("Material Specification", {
      fields: ["thickness_mm", "disabled"], filters: [["disabled", "=", 0]], pageLength: 1000,
    }).then((rows) => {
      if (!active) return;
      setThicknessOptions([...new Set(rows.map((row) => Number(row.thickness_mm)).filter((value) => Number.isFinite(value) && value > 0).map((value) => String(value).replace(".", ",")))].sort((left, right) => decimal(left) - decimal(right)));
    }).catch(() => { if (active) setThicknessOptions([]); });
    return () => { active = false; };
  }, [adapter]);

  useEffect(() => {
    const name = customer.name.trim();
    if (!name) return;
    let active = true;
    void adapter.getDoc("Customer", name).then(({ doc }) => {
      if (!active) return;
      setCustomer((current) => ({
        ...current,
        group: canonicalCustomerGroup(doc.price_group ?? doc.customer_group),
        phone: String(doc.phone ?? doc.mobile_no ?? "").trim(),
        address: String(doc.install_address ?? doc.address ?? "").trim(),
      }));
    }).catch((cause) => { if (active) setGlobalError(adapter.mapError(cause).message); });
    return () => { active = false; };
  }, [adapter, customer.name]);

  useEffect(() => {
    if (!customer.name || !canonicalGroup) { setPriceList(""); setPriceListError(""); return; }
    let active = true;
    void (async () => {
      const rows = await adapter.getList("Price List", {
        fields: ["name", "price_list_name", "disabled"], filters: [["disabled", "=", 0]], orderBy: "name asc", pageLength: 200,
      }).catch(() => [] as Doc[]);
      const names = rows.map((row) => String(row.name ?? row.price_list_name ?? "").trim()).filter(Boolean);
      const matching = names.filter((name) => priceListMatchesGroup(name, canonicalGroup));
      let preferred = "";
      try {
        const { doc } = await adapter.getDoc("Customer", customer.name);
        preferred = String(doc.default_price_list ?? doc.selling_price_list ?? doc.price_list ?? "").trim();
      } catch { /* customer hydration reports separately */ }
      const resolved = preferred && priceListMatchesGroup(preferred, canonicalGroup) && names.includes(preferred) ? preferred : matching[0] ?? "";
      if (!active) return;
      setPriceList(resolved);
      setPriceListError(resolved ? "" : `Chưa cấu hình Bảng giá ${canonicalGroup}.`);
    })();
    return () => { active = false; };
  }, [adapter, canonicalGroup, customer.name]);

  useEffect(() => {
    if (!formulaGroup) return;
    lines.forEach((line, index) => { if (line.itemCode && line.mode === "AREA") void refreshMeasurementBasis(index, line.itemCode, line.rayType); });
    // basis is domain-owned; recalculate whenever the commercial customer type changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formulaGroup]);

  useEffect(() => {
    if (!priceList) return;
    lines.forEach((line, index) => { if (line.itemCode) void refreshContext(index, line.itemCode, line.uom); });
    // price-list changes invalidate every displayed rate.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [priceList, currency]);

  const formulaFingerprint = useMemo(() => JSON.stringify({
    group: formulaGroup, deliveryDate,
    lines: lines.map((line) => ({ itemCode: line.itemCode, mode: line.mode, ray: line.rayType, color: line.color, h: line.height, hb: line.heightBasis, w: line.width, wb: line.widthBasis, qty: line.qty })),
  }), [deliveryDate, formulaGroup, lines]);

  useEffect(() => {
    const currentGeneration = ++generation.current;
    const timer = window.setTimeout(() => {
      void Promise.all(lines.map(async (line, index) => {
        if (line.mode !== "AREA" || !line.itemCode || !formulaGroup || !positive(line.height) || !positive(line.width) || !integerPositive(line.qty)) return;
        patchLine(index, { busy: true });
        try {
          const formula = await adapter.callPost<FormulaResult>("alumdoor.sales.production_line_context", {
            item_code: line.itemCode,
            customer_group: formulaGroup,
            sales_mode: "Trọn bộ",
            ...(line.rayType ? { ray_type: line.rayType } : {}),
            ...(line.widthBasis ? { width_input_basis: line.widthBasis } : {}),
            ...(line.heightBasis ? { height_input_basis: line.heightBasis } : {}),
            width_m: decimal(line.width), height_m: decimal(line.height), set_count: decimal(line.qty),
            ...(line.color ? { color: line.color } : {}), delivery_date: deliveryDate,
          });
          if (generation.current !== currentGeneration) return;
          const rawDefault = Number(formula.default_discount_pct ?? 0);
          patchLine(index, {
            formula,
            doorType: String(formula.door_type ?? line.doorType),
            rayType: line.rayType || String(formula.ray_type ?? ""),
            rayOptions: [...new Set((formula.ray_options ?? line.rayOptions).map((value) => String(value ?? "").trim()).filter(Boolean))],
            discountPct: line.discountTouched ? line.discountPct : (Number.isFinite(rawDefault) && rawDefault > 0 ? String(rawDefault) : line.discountPct),
            busy: false,
            error: String(formula.leaf_error ?? formula.stock_profile_error ?? ""),
          });
        } catch (cause) {
          if (generation.current === currentGeneration) patchLine(index, { formula: null, busy: false, error: adapter.mapError(cause).message });
        }
      }));
    }, 240);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adapter, formulaFingerprint]);

  const grossTotal = lines.reduce((sum, line) => sum + grossAmount(line), 0);
  const totalDiscount = lines.reduce((sum, line) => sum + discountAmount(line), 0);
  const taxableTotal = Math.max(0, grossTotal - totalDiscount);
  const vatRate = vatPct.trim() ? decimal(vatPct) : 0;
  const totalVat = Number.isFinite(vatRate) && vatRate > 0 ? taxableTotal * vatRate / 100 : 0;
  const total = taxableTotal + totalVat;

  const blockers = useMemo(() => {
    const out: string[] = [];
    if (!company) out.push("Cần Công ty.");
    if (!customer.name) out.push("Cần Khách hàng.");
    if (!canonicalGroup) out.push("Cần Loại khách Đại lý/Bán lẻ/Nhà thầu.");
    if (!currency) out.push("Chưa xác định tiền tệ bán.");
    if (customer.name && canonicalGroup && !priceList) out.push(priceListError || `Chưa cấu hình Bảng giá ${canonicalGroup}.`);
    if (!transactionDate) out.push("Cần Ngày đặt.");
    if (!deliveryDate) out.push("Cần Ngày giao.");
    if (deliveryDate && transactionDate && deliveryDate < transactionDate) out.push("Ngày giao không được trước ngày đặt.");
    if (!lines.some((line) => line.itemCode)) out.push("Cần ít nhất một mặt hàng.");
    lines.forEach((line, index) => {
      if (!line.itemCode) return;
      const prefix = `Dòng ${index + 1}`;
      if (!integerPositive(line.qty)) out.push(`${prefix}: SL phải là số nguyên dương.`);
      if (line.rate == null) out.push(`${prefix}: chưa có đơn giá trong ${priceList || "bảng giá"}.`);
      if (line.discountPct.trim() && (decimal(line.discountPct) < 0 || decimal(line.discountPct) > 100 || !Number.isFinite(decimal(line.discountPct)))) out.push(`${prefix}: CK phải từ 0 đến 100%.`);
      if (line.requireColor && !line.color) out.push(`${prefix}: cần Màu.`);
      if (line.mode === "HEIGHT" && !positive(line.height)) out.push(`${prefix}: cần Dài ray.`);
      if (line.mode === "WIDTH" && !positive(line.width)) out.push(`${prefix}: cần Dài trục.`);
      if (line.mode === "WIDTH" && !line.fixedThickness && !line.thickness) out.push(`${prefix}: cần Độ dày.`);
      if (line.mode === "AREA" && !positive(line.height)) out.push(`${prefix}: cần ${line.heightBasis || "chiều cao"}.`);
      if (line.mode === "AREA" && !positive(line.width)) out.push(`${prefix}: cần ${line.widthBasis || "chiều rộng"}.`);
      if (line.mode === "AREA" && line.rayOptions.length > 1 && !line.rayType) out.push(`${prefix}: cần Loại ray.`);
      if (line.mode === "AREA" && positive(line.height) && positive(line.width) && !line.formula) out.push(`${prefix}: chưa tính xong công thức cửa.`);
      if (line.stockShort != null && line.stockShort > 0) out.push(`${prefix}: thiếu tồn ${number(line.stockShort)}.`);
      if (line.error) out.push(`${prefix}: ${line.error}`);
    });
    if (vatPct.trim() && (!Number.isFinite(vatRate) || vatRate < 0 || vatRate > 100)) out.push("VAT phải từ 0 đến 100%.");
    return [...new Set(out)];
  }, [canonicalGroup, company, currency, customer.name, deliveryDate, lines, priceList, priceListError, transactionDate, vatPct, vatRate]);

  const buildItems = () => lines.filter((line) => line.itemCode).map((line, index) => {
    const discount = discountRate(line);
    const netRate = Number(line.rate ?? 0) * (1 - discount / 100);
    return {
      row_id: `ROW-${index + 1}`,
      item_code: line.itemCode,
      item_name: line.itemName,
      qty: billableQty(line, false),
      rate: netRate,
      uom: line.uom,
      ...(line.warehouse ? { warehouse: line.warehouse } : {}),
      ...(discount > 0 ? { discount_percentage: discount } : {}),
      ...(line.color ? { color: line.color } : {}),
      ...(line.thickness ? { thickness_mm: decimal(line.thickness) } : {}),
      ...((line.mode === "HEIGHT" || line.mode === "AREA") && positive(line.height) ? { height_m: decimal(line.height) } : {}),
      ...((line.mode === "WIDTH" || line.mode === "AREA") && positive(line.width) ? { width_m: decimal(line.width) } : {}),
      ...(line.mode === "AREA" && line.widthBasis ? { width_basis: line.widthBasis } : {}),
      ...(line.mode === "AREA" && line.heightBasis ? { height_basis: line.heightBasis } : {}),
      ...(line.mode === "AREA" && line.rayType ? { ray_type: line.rayType } : {}),
      ...(line.mode === "AREA" && line.doorType ? { door_type: line.doorType } : {}),
      ...(line.mode === "AREA" && line.formula?.policy_name ? { formula_policy: line.formula.policy_name } : {}),
      ...(line.mode === "AREA" && line.formula?.formula_version ? { formula_version: line.formula.formula_version } : {}),
      ...(line.mode === "AREA" && Number(line.formula?.cut_width_m) > 0 ? { cut_width_m: Number(line.formula?.cut_width_m) } : {}),
      ...(line.mode === "AREA" && Number(line.formula?.billable_area_sqm) > 0 ? { billable_area_sqm: Number(line.formula?.billable_area_sqm) } : {}),
      ...(line.mode === "AREA" && Number(line.formula?.total_leaf_count) > 0 ? { total_leaf_count: Number(line.formula?.total_leaf_count) } : {}),
    };
  });

  const buildTaxes = (): Record<string, unknown>[] => Number.isFinite(vatRate) && vatRate > 0
    ? [{ charge_type: "On Net Total", description: `VAT ${number(vatRate, 2)}%`, rate: vatRate, included_in_print_rate: 0 }]
    : [];

  const orderPayload = () => ({
    company, customer: customer.name, customer_group: canonicalGroup, currency,
    selling_price_list: priceList, transaction_date: transactionDate, delivery_date: deliveryDate,
    note, address: customer.address, items: buildItems(), taxes: buildTaxes(),
  });

  const persistDraft = async (): Promise<Doc> => {
    const payload = orderPayload();
    const doc = createdOrder?.name
      ? await adapter.updateDoc("Sales Order", String(createdOrder.name), payload)
      : await adapter.createDoc("Sales Order", payload);
    setCreatedOrder(doc);
    return doc;
  };

  const saveOrder = async (draft: boolean) => {
    setGlobalError("");
    if (blockers.length) { setGlobalError(blockers.join(" · ")); return; }
    setSaving(draft ? "draft" : "submit");
    const reservations: string[] = [];
    try {
      const draftDoc = await persistDraft();
      if (draft) { toast.success(`Đã lưu ${draftDoc.name}.`); return; }
      for (const line of lines) {
        if (line.mode !== "AREA" || !line.itemCode || !line.warehouse || !line.formula?.stock_profile_item || Number(line.formula.total_leaf_count ?? 0) <= 0) continue;
        const reserved = await adapter.callPost<Json>("alumdoor.cut.reserve", {
          item_code: String(line.formula.stock_profile_item),
          warehouse: line.warehouse,
          required_length_m: decimal(line.height),
          quantity: Number(line.formula.total_leaf_count),
          color: line.color,
          sales_order: String(draftDoc.name),
        });
        const name = String(reserved.reservation ?? reserved.name ?? "").trim();
        if (name) reservations.push(name);
      }
      const submittedDoc = await adapter.submit("Sales Order", String(draftDoc.name));
      setCreatedOrder(submittedDoc);
      toast.success(`Đã xác nhận ${submittedDoc.name}.`);
    } catch (cause) {
      for (const reservation of reservations.reverse()) {
        try { await adapter.callPost("alumdoor.cut.release", { reservation }); } catch { /* best effort compensation */ }
      }
      setGlobalError(adapter.mapError(cause).message);
    } finally { setSaving(""); }
  };

  const startNew = () => {
    setCreatedOrder(null);
    setCustomer({ name: "", group: "", phone: "", address: "" });
    setPriceList(""); setPriceListError(""); setTransactionDate(today()); setDeliveryDate(today()); setNote(""); setVatPct("");
    setLines([newLine()]); setGlobalError("");
  };

  const exportCsv = () => {
    const headers = ["STT", ...visibleColumns.map((column) => `${column.label}${column.unit ? ` (${column.unit})` : ""}`)];
    const values = (line: SaleLine, key: ColumnKey): string => {
      if (key === "item") return line.itemName || line.itemCode;
      if (key === "color") return line.color;
      if (key === "ray") return line.rayType;
      if (key === "thickness") return line.thickness;
      if (key === "rayLength") return line.mode === "HEIGHT" ? line.height : "";
      if (key === "shaftLength") return line.mode === "WIDTH" ? line.width : "";
      if (key === "heightClear") return sameBasis(line.heightBasis, "Cao lọt lòng") ? line.height : "";
      if (key === "heightCover") return sameBasis(line.heightBasis, "Cao phủ bì") ? line.height : String(line.formula?.cover_height_m ?? "");
      if (key === "heightMesh") return sameBasis(line.heightBasis, "Cao lưới") ? line.height : String(line.formula?.mesh_height_m ?? "");
      if (key === "widthClear") return sameBasis(line.widthBasis, "Rộng lọt lòng") ? line.width : "";
      if (key === "widthRay") return sameBasis(line.widthBasis, "Phủ bì ray") ? line.width : "";
      if (key === "widthPlastic") return sameBasis(line.widthBasis, "Phủ bì nhựa") ? line.width : "";
      if (key === "widthCut") return String(line.formula?.cut_width_m ?? "");
      if (key === "area") return areaPerSet(line) == null ? "" : String(areaPerSet(line));
      if (key === "leafCount") return String(line.formula?.total_leaf_count ?? "");
      if (key === "qty") return line.qty;
      if (key === "rate") return line.rate == null ? "" : String(line.rate);
      if (key === "discount") return line.discountPct;
      if (key === "uom") return line.uom;
      if (key === "amount") return String(netAmount(line));
      return "";
    };
    const rows = [headers, ...lines.filter((line) => line.itemCode).map((line, index) => [String(index + 1), ...visibleColumns.map((column) => values(line, column.key))])];
    const csv = `\uFEFF${rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\r\n")}`;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = `${createdOrder?.name || "sales-order"}.csv`; document.body.appendChild(anchor); anchor.click(); anchor.remove(); URL.revokeObjectURL(url);
  };

  const requiredFor = (line: SaleLine, key: ColumnKey) => {
    if (key === "item" || key === "qty") return true;
    if (key === "color") return line.requireColor;
    if (key === "thickness") return line.mode === "WIDTH" && !line.fixedThickness;
    if (key === "rayLength") return line.mode === "HEIGHT";
    if (key === "shaftLength") return line.mode === "WIDTH";
    if (key === "heightClear") return line.mode === "AREA" && sameBasis(line.heightBasis, "Cao lọt lòng");
    if (key === "heightCover") return line.mode === "AREA" && sameBasis(line.heightBasis, "Cao phủ bì");
    if (key === "heightMesh") return line.mode === "AREA" && sameBasis(line.heightBasis, "Cao lưới");
    if (key === "widthClear") return line.mode === "AREA" && sameBasis(line.widthBasis, "Rộng lọt lòng");
    if (key === "widthRay") return line.mode === "AREA" && sameBasis(line.widthBasis, "Phủ bì ray");
    if (key === "widthPlastic") return line.mode === "AREA" && sameBasis(line.widthBasis, "Phủ bì nhựa");
    return false;
  };

  const missingFor = (line: SaleLine, key: ColumnKey) => {
    if (!requiredFor(line, key)) return false;
    if (key === "item") return !line.itemCode;
    if (key === "qty") return !integerPositive(line.qty);
    if (key === "color") return !line.color;
    if (key === "thickness") return !line.thickness;
    if (["rayLength", "heightClear", "heightCover", "heightMesh"].includes(key)) return !positive(line.height);
    if (["shaftLength", "widthClear", "widthRay", "widthPlastic"].includes(key)) return !positive(line.width);
    return false;
  };

  const numericInput = (value: string, onChange: (value: string) => void, disabled = false) => <Input className="h-8 rounded-none border-0 bg-transparent px-1 text-center text-xs" inputMode="decimal" value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} />;

  const renderCell = (line: SaleLine, index: number, column: ColumnDef) => {
    const key = column.key;
    if (key === "item") return <div className="min-w-0"><SheetLink doctype="Item" value={line.itemCode} onChange={(value) => void chooseItem(index, value)} readOnly={submitted} required fieldname={`sales_item_${index}`} />{line.busy ? <div className="text-[9px] text-slate-400">Đang tính…</div> : null}{line.error ? <div className="max-w-[13rem] truncate px-1 text-[9px] text-red-600" title={line.error}>{line.error}</div> : null}</div>;
    if (key === "color") return line.requireColor ? <SheetLink doctype="Item Color" value={line.color} onChange={(color) => patchLine(index, { color, formula: null })} readOnly={submitted} required fieldname={`sales_color_${index}`} /> : null;
    if (key === "ray") {
      const options = [...new Set([line.rayType, ...line.rayOptions].filter(Boolean))];
      return options.length ? <select className="h-8 w-full border-0 bg-transparent px-1 text-center text-xs" value={line.rayType} disabled={submitted} onChange={(event) => void changeRay(index, event.target.value)}><option value=""></option>{options.map((value) => <option key={value} value={value}>{value}</option>)}</select> : null;
    }
    if (key === "thickness") {
      if (line.fixedThickness) return <div className="px-1 text-center text-xs font-semibold">{line.thickness}</div>;
      return <select className="h-8 w-full border-0 bg-transparent px-1 text-center text-xs" value={line.thickness} disabled={submitted} onChange={(event) => patchLine(index, { thickness: event.target.value })}><option value=""></option>{thicknessOptions.map((value) => <option key={value} value={value}>{value}</option>)}</select>;
    }
    if (key === "rayLength") return line.mode === "HEIGHT" ? numericInput(line.height, (value) => patchLine(index, { height: value, formula: null }), submitted) : null;
    if (key === "shaftLength") return line.mode === "WIDTH" ? numericInput(line.width, (value) => patchLine(index, { width: value, formula: null }), submitted) : null;
    if (key === "heightClear") return sameBasis(line.heightBasis, "Cao lọt lòng") ? numericInput(line.height, (value) => patchLine(index, { height: value, formula: null }), submitted) : null;
    if (key === "heightCover") {
      if (sameBasis(line.heightBasis, "Cao phủ bì")) return numericInput(line.height, (value) => patchLine(index, { height: value, formula: null }), submitted);
      const value = Number(line.formula?.cover_height_m);
      return Number.isFinite(value) && value > 0 ? <div className="px-1 text-center text-xs font-semibold tabular-nums text-slate-600">{number(value)}</div> : null;
    }
    if (key === "heightMesh") return sameBasis(line.heightBasis, "Cao lưới") ? numericInput(line.height, (value) => patchLine(index, { height: value, formula: null }), submitted) : (Number(line.formula?.mesh_height_m) > 0 ? <div className="text-center text-xs">{number(line.formula?.mesh_height_m)}</div> : null);
    if (key === "widthClear") return sameBasis(line.widthBasis, "Rộng lọt lòng") ? numericInput(line.width, (value) => patchLine(index, { width: value, formula: null }), submitted) : null;
    if (key === "widthRay") return sameBasis(line.widthBasis, "Phủ bì ray") ? numericInput(line.width, (value) => patchLine(index, { width: value, formula: null }), submitted) : null;
    if (key === "widthPlastic") return sameBasis(line.widthBasis, "Phủ bì nhựa") ? numericInput(line.width, (value) => patchLine(index, { width: value, formula: null }), submitted) : null;
    if (key === "widthCut") return Number(line.formula?.cut_width_m) > 0 ? <div className="px-1 text-center text-xs font-semibold tabular-nums text-slate-600">{number(line.formula?.cut_width_m)}</div> : null;
    if (key === "area") return areaPerSet(line) == null ? null : <div className="px-1 text-center text-xs font-semibold tabular-nums">{number(areaPerSet(line))}</div>;
    if (key === "leafCount") return Number(line.formula?.total_leaf_count) > 0 ? <div className="px-1 text-center text-xs font-semibold tabular-nums">{number(line.formula?.total_leaf_count, 2)}</div> : null;
    if (key === "qty") return numericInput(line.qty, (value) => patchLine(index, { qty: value, formula: null }), submitted);
    if (key === "rate") return <div className="px-1 text-right text-xs font-semibold tabular-nums">{line.rate == null ? "" : money(line.rate)}</div>;
    if (key === "discount") return numericInput(line.discountPct, (value) => patchLine(index, { discountPct: value.replace("%", ""), discountTouched: true }), submitted);
    if (key === "uom") {
      const options = [...new Set([line.uom, ...line.allowedUoms].filter(Boolean))];
      return <select className="h-8 w-full border-0 bg-transparent px-1 text-center text-xs font-semibold text-sky-800" value={line.uom} disabled={submitted || !options.length} onChange={(event) => void changeUom(index, event.target.value)}>{options.map((uom) => <option key={uom} value={uom}>{uom}</option>)}</select>;
    }
    if (key === "amount") return <div className="px-1 text-right text-xs font-bold tabular-nums">{line.rate == null ? "" : money(netAmount(line))}</div>;
    return null;
  };

  return <div className="h-full w-full overflow-auto bg-white p-2 md:p-3">
    <div className="mx-auto w-full max-w-[1900px] space-y-2">
      <section className="grid gap-2 border border-slate-300 bg-white p-2 lg:grid-cols-[minmax(0,1.3fr)_minmax(420px,0.7fr)]">
        <div className="grid min-w-0 gap-2">
          <div className="grid min-w-0 gap-1.5 sm:grid-cols-[minmax(0,1fr)_auto]">
            <HeaderLink label="Khách hàng" doctype="Customer" value={customer.name} onChange={(name) => { setCustomer({ name, group: "", phone: "", address: "" }); setPriceList(""); }} required readOnly={submitted} />
            <Button type="button" variant="outline" size="sm" className="h-8 self-end rounded-none" disabled={submitted} onClick={() => setQuickCreate(true)}>+ Tạo mới</Button>
          </div>
          <div className="grid gap-2 sm:grid-cols-[160px_180px_minmax(0,1fr)]">
            <div className="grid gap-1"><Label className="text-[11px] font-semibold">Điện thoại</Label><Input className="h-8 rounded-none" value={customer.phone} readOnly /></div>
            <div className="grid gap-1"><Label className="text-[11px] font-semibold">Loại khách *</Label><select className={`h-8 rounded-none border bg-white px-2 text-sm font-semibold ${customer.name && !canonicalGroup ? "border-red-500" : "border-slate-300"}`} value={canonicalGroup} disabled={submitted || !customer.name} onChange={(event) => setCustomer((current) => ({ ...current, group: event.target.value as CustomerGroup }))}><option value="">Chọn loại khách</option><option value="Bán lẻ">Bán lẻ</option><option value="Đại lý">Đại lý</option><option value="Nhà thầu">Nhà thầu</option></select></div>
            <div className="grid gap-1"><Label className="text-[11px] font-semibold">Địa chỉ nhận</Label><Input className="h-8 rounded-none" value={customer.address} disabled={submitted} onChange={(event) => setCustomer((current) => ({ ...current, address: event.target.value }))} /></div>
          </div>
        </div>
        <div className="grid content-start gap-2 lg:border-l lg:border-slate-200 lg:pl-3">
          {!contextCompany ? <HeaderLink label="Công ty" doctype="Company" value={company} onChange={setCompany} required readOnly={submitted} /> : null}
          <div className="grid gap-1"><Label className="text-[11px] font-semibold">Bảng giá</Label><Input className={`h-8 rounded-none font-semibold ${customer.name && !priceList ? "border-amber-400" : ""}`} value={priceList} readOnly placeholder={priceListError || "Tự xác định theo loại khách"} /></div>
          <div className="grid grid-cols-2 gap-2"><div className="grid gap-1"><Label className="text-[11px] font-semibold">Ngày đặt *</Label><Input className="h-8 rounded-none" type="date" value={transactionDate} disabled={submitted} onChange={(event) => setTransactionDate(event.target.value)} /></div><div className="grid gap-1"><Label className="text-[11px] font-semibold">Ngày giao *</Label><Input className="h-8 rounded-none" type="date" min={transactionDate} value={deliveryDate} disabled={submitted} onChange={(event) => setDeliveryDate(event.target.value)} /></div></div>
          <div className="grid gap-1"><Label className="text-[11px] font-semibold">Ghi chú</Label><Input className="h-8 rounded-none" value={note} disabled={submitted} onChange={(event) => setNote(event.target.value)} /></div>
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-1.5">
        {!submitted ? <Button type="button" variant="outline" size="sm" onClick={() => setLines((current) => [...current, newLine()])}><Plus className="h-4 w-4" /> Dòng</Button> : null}
        {!submitted ? <Button type="button" variant="outline" size="sm" onClick={() => setLines((current) => [...current, ...Array.from({ length: 10 }, () => newLine())])}>+10 dòng</Button> : null}
        <span className="ml-auto text-[11px] text-slate-500">Cột kỹ thuật tự ẩn/hiện theo mặt hàng · ô vàng là dữ liệu phải nhập · ô xám là hệ thống tính</span>
      </div>

      <div className="max-h-[64vh] overflow-auto border border-slate-400 bg-white">
        <table className="w-max min-w-full border-collapse text-xs">
          <thead className="sticky top-0 z-20 bg-orange-500 text-white"><tr><th className="sticky left-0 z-30 w-10 border border-orange-600 bg-orange-500">STT</th>{visibleColumns.map((column) => <th key={column.key} className="border border-orange-600 px-1 py-1 text-center text-[10px] font-bold" style={{ width: column.width, minWidth: column.width }}><span className="block leading-tight">{column.label}</span>{column.unit ? <span className="block text-[9px]">({column.unit})</span> : null}</th>)}{!submitted ? <th className="w-10 border border-orange-600 bg-orange-500"></th> : null}</tr></thead>
          <tbody>{lines.map((line, index) => <Fragment key={line.id}><tr><td className="sticky left-0 z-10 border border-slate-300 bg-white text-center text-[10px] text-slate-500">{index + 1}</td>{visibleColumns.map((column) => { const required = requiredFor(line, column.key); const missing = missingFor(line, column.key); return <td key={column.key} className={`h-9 border p-0 align-middle ${missing ? "border-red-500 bg-red-50" : required ? "border-amber-400 bg-amber-50/80" : "border-slate-300 bg-white"}`} style={{ width: column.width, minWidth: column.width }}>{renderCell(line, index, column)}</td>; })}{!submitted ? <td className="border border-slate-300 p-0 text-center"><Button type="button" variant="ghost" size="icon-sm" onClick={() => setLines((current) => current.filter((_, lineIndex) => lineIndex !== index))}><Trash2 className="h-4 w-4" /></Button></td> : null}</tr>{line.stockMessage ? <tr><td></td><td colSpan={visibleColumns.length} className="border-x border-b border-slate-200 px-2 py-1 text-[10px] text-slate-500">{line.stockMessage}</td>{!submitted ? <td></td> : null}</tr> : null}</Fragment>)}</tbody>
        </table>
      </div>

      <section className="ml-auto w-full max-w-md border border-slate-300 bg-white">
        <div className="border-b border-slate-300 px-2 py-1.5 text-xs font-bold uppercase tracking-wide text-slate-600">Tổng tiền</div>
        <div className="grid grid-cols-2 border-b border-slate-300"><div className="p-2 text-sm">Tạm tính</div><div className="p-2 text-right text-sm font-medium tabular-nums">{money(grossTotal)}</div></div>
        <div className="grid grid-cols-2 border-b border-slate-300"><div className="p-2 text-sm">Chiết khấu</div><div className="p-2 text-right text-sm font-medium tabular-nums text-emerald-700">-{money(totalDiscount)}</div></div>
        <div className="grid grid-cols-2 border-b border-slate-300"><div className="p-2 text-sm font-medium">Sau chiết khấu</div><div className="p-2 text-right text-sm font-medium tabular-nums">{money(taxableTotal)}</div></div>
        <div className="grid grid-cols-2 border-b border-slate-300"><div className="p-2 text-sm">VAT (%)</div><div className="p-1.5"><Input className="h-8 rounded-none text-right" inputMode="decimal" placeholder="0" value={vatPct} disabled={submitted} onChange={(event) => setVatPct(event.target.value.replace("%", ""))} /></div></div>
        <div className="grid grid-cols-2 border-b border-slate-300"><div className="p-2 text-sm">Tiền VAT</div><div className="p-2 text-right text-sm tabular-nums">{money(totalVat)}</div></div>
        <div className="grid grid-cols-2"><div className="p-2 text-sm font-bold">TỔNG THANH TOÁN</div><div className="p-2 text-right text-sm font-bold tabular-nums">{money(total)}</div></div>
      </section>

      {globalError ? <div className="flex items-start gap-2 border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700"><TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />{globalError}</div> : null}

      <div className="flex flex-wrap justify-end gap-2 border-t border-slate-300 pt-2">
        {!submitted ? <Button type="button" variant="outline" disabled={Boolean(saving)} onClick={() => void saveOrder(true)}>{saving === "draft" ? "Đang lưu…" : "Lưu nháp"}</Button> : null}
        {!submitted ? <Button type="button" variant="outline" disabled={Boolean(saving) || !createdOrder?.name} onClick={() => createdOrder?.name && window.open(printRoute(createdOrder.name), "_blank")}><Printer className="h-4 w-4" /> Xem bản in</Button> : null}
        {!submitted ? <Button type="button" disabled={Boolean(saving)} onClick={() => void saveOrder(false)}>{saving === "submit" ? "Đang xác nhận…" : "Xác nhận đơn"}</Button> : null}
        {createdOrder?.name ? <Button type="button" variant="outline" onClick={exportCsv}><FileSpreadsheet className="h-4 w-4" /> Excel</Button> : null}
        {submitted && createdOrder?.name ? <Button type="button" variant="outline" onClick={() => window.open(printRoute(createdOrder.name), "_blank")}><Printer className="h-4 w-4" /> In / PDF</Button> : null}
        {submitted ? <Button type="button" onClick={startNew}>Tạo đơn mới</Button> : null}
      </div>
    </div>

    <CustomerQuickCreate open={quickCreate} onClose={() => setQuickCreate(false)} onCreated={(doc) => { setQuickCreate(false); const name = String(doc.name ?? doc.customer_name ?? "").trim(); if (name) setCustomer({ name, group: canonicalCustomerGroup(doc.price_group ?? doc.customer_group), phone: String(doc.phone ?? ""), address: "" }); }} />
  </div>;
}

function CustomerQuickCreate({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (doc: Doc) => void }) {
  const { adapter } = useMetaForge();
  const [name, setName] = useState("");
  const [group, setGroup] = useState<CustomerGroup>("Bán lẻ");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { if (open) { setName(""); setGroup("Bán lẻ"); setPhone(""); setEmail(""); setError(""); } }, [open]);
  const save = async () => {
    if (!name.trim()) { setError("Cần tên khách hàng."); return; }
    if (!group) { setError("Cần loại khách."); return; }
    setBusy(true); setError("");
    try {
      const doc = await adapter.createDoc("Customer", { customer_name: name.trim(), price_group: group, phone: phone.trim(), email: email.trim() });
      toast.success(`Đã tạo khách hàng ${doc.name}.`);
      onCreated(doc);
    } catch (cause) { setError(adapter.mapError(cause).message); }
    finally { setBusy(false); }
  };
  return <Dialog open={open} onOpenChange={(next) => { if (!next && !busy) onClose(); }}><DialogContent className="w-[min(94vw,560px)] max-w-none"><DialogHeader><DialogTitle>Tạo khách hàng</DialogTitle><DialogDescription>Tạo nhanh ngay trong đơn bán hàng.</DialogDescription></DialogHeader><div className="grid gap-3"><div className="grid gap-1"><Label>Tên khách hàng *</Label><Input autoFocus value={name} onChange={(event) => setName(event.target.value)} /></div><div className="grid gap-1"><Label>Loại khách *</Label><select className="h-9 border bg-white px-2 text-sm" value={group} onChange={(event) => setGroup(event.target.value as CustomerGroup)}><option value="Bán lẻ">Bán lẻ</option><option value="Đại lý">Đại lý</option><option value="Nhà thầu">Nhà thầu</option></select></div><div className="grid gap-2 sm:grid-cols-2"><div className="grid gap-1"><Label>Điện thoại</Label><Input value={phone} onChange={(event) => setPhone(event.target.value)} /></div><div className="grid gap-1"><Label>Email</Label><Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} /></div></div>{error ? <div className="border border-red-300 bg-red-50 p-2 text-sm text-red-700">{error}</div> : null}<div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={busy} onClick={onClose}>Hủy</Button><Button type="button" disabled={busy} onClick={() => void save()}>{busy ? "Đang lưu…" : "Lưu"}</Button></div></div></DialogContent></Dialog>;
}
