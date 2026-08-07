import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { CheckCircle2, FileSpreadsheet, Plus, Printer, Trash2, TriangleAlert } from "lucide-react";
import type { Doc, DocField } from "@metaforge/core";
import { useMetaForge } from "@metaforge/views/provider";
import { Button, Input, Label, toast } from "@metaforge/ui";

type Json = Record<string, unknown>;
type CalculationMode = "QUANTITY" | "HEIGHT" | "WIDTH" | "AREA";
type ColumnKey = "item" | "color" | "thickness" | "height" | "width" | "area" | "qty" | "rate" | "discount" | "uom" | "amount";

type FormulaResult = Json & {
  policy_name?: string;
  formula_version?: string;
  door_type?: string;
  width_basis?: string;
  area_per_set_sqm?: number;
  billable_area_sqm?: number;
  cut_width_m?: number;
  total_leaf_count?: number;
  stock_profile_item?: string | null;
  stock_profile_error?: string | null;
  leaf_error?: string | null;
};

type ItemContext = {
  item_code?: string;
  item_name?: string;
  item_group?: string;
  door_type?: string | null;
  calculation_mode?: CalculationMode;
  calculation_error?: string | null;
  require_color?: boolean;
  default_color?: string | null;
  thickness_mm?: number | null;
  fixed_thickness?: boolean;
  customer_group?: string | null;
  price_list?: string | null;
  selected_uom?: string;
  warehouse?: string | null;
  managed_stock?: boolean;
  available_qty?: number | null;
  rate?: number | null;
  currency?: string;
  item_price?: string | null;
  pricing_rule?: string | null;
  discount_percentage?: number | null;
  billable_qty?: number | null;
  gross_amount?: number | null;
  discount_amount?: number | null;
  net_amount?: number | null;
  price_missing?: boolean;
  price_error?: string | null;
  stock_read_error?: string | null;
};

type CustomerState = { name: string; group: string; phone: string; address: string };

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
  height: string;
  width: string;
  qty: string;
  rate: number | null;
  uom: string;
  currency: string;
  warehouse: string;
  discountPct: string;
  pricingRule: string;
  itemPrice: string;
  billableQty: number | null;
  grossAmount: number | null;
  discountAmount: number | null;
  netAmount: number | null;
  formula: FormulaResult | null;
  managedStock: boolean;
  stockQty: number | null;
  stockShort: number | null;
  stockMessage: string;
  busy: boolean;
  error: string;
};

type ColumnDef = { key: ColumnKey; label: string; width: number; numeric?: boolean };

const COLUMNS: ColumnDef[] = [
  { key: "item", label: "SẢN PHẨM", width: 18 },
  { key: "color", label: "MÀU SẮC", width: 10 },
  { key: "thickness", label: "ĐỘ DÀY", width: 8 },
  { key: "height", label: "CHIỀU CAO", width: 8, numeric: true },
  { key: "width", label: "CHIỀU RỘNG", width: 9, numeric: true },
  { key: "area", label: "DIỆN TÍCH", width: 8, numeric: true },
  { key: "qty", label: "SL", width: 5, numeric: true },
  { key: "rate", label: "ĐƠN GIÁ", width: 10, numeric: true },
  { key: "discount", label: "CK %", width: 6, numeric: true },
  { key: "uom", label: "ĐVT", width: 6 },
  { key: "amount", label: "THÀNH TIỀN", width: 12, numeric: true },
];

const today = () => {
  const value = new Date();
  return new Date(value.valueOf() - value.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
};
const decimal = (value: unknown) => Number(String(value ?? "").trim().replace(",", "."));
const positive = (value: unknown) => Number.isFinite(decimal(value)) && decimal(value) > 0;
const integerPositive = (value: unknown) => Number.isInteger(decimal(value)) && decimal(value) > 0;
const money = (value: unknown) => Number.isFinite(Number(value)) ? Number(value).toLocaleString("vi-VN", { maximumFractionDigits: 0 }) : "";
const number = (value: unknown, digits = 3) => Number.isFinite(Number(value)) ? Number(value).toLocaleString("vi-VN", { maximumFractionDigits: digits }) : "";
const normalize = (value: unknown) => String(value ?? "").normalize("NFC").trim().toLocaleLowerCase("vi");

function canonicalGroup(value: unknown): string {
  const raw = String(value ?? "").trim();
  const key = normalize(raw);
  if (!key) return "";
  if (key.includes("đại lý") || key.includes("dai ly") || key.includes("dealer")) return "Đại lý";
  if (key === "lẻ" || key.includes("khách lẻ") || key.includes("khach le") || key.includes("bán lẻ") || key.includes("ban le") || key.includes("retail") || key.includes("công trình") || key.includes("cong trinh") || key.includes("nhà thầu") || key.includes("nha thau")) return "Lẻ";
  return raw;
}

function newLine(): SaleLine {
  return {
    id: `sale-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    itemCode: "", itemName: "", itemGroup: "", doorType: "", mode: "QUANTITY",
    color: "", requireColor: false, thickness: "", height: "", width: "", qty: "",
    rate: null, uom: "", currency: "", warehouse: "", discountPct: "", pricingRule: "", itemPrice: "",
    billableQty: null, grossAmount: null, discountAmount: null, netAmount: null, formula: null,
    managedStock: true, stockQty: null, stockShort: null, stockMessage: "", busy: false, error: "",
  };
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
      <SheetLink doctype={doctype} value={value} onChange={onChange} required={required} readOnly={readOnly} fieldname={`alumdoor_${doctype.replaceAll(" ", "_").toLowerCase()}`} />
    </div>
  </div>;
}

export function AlumdoorSalesSheetV3() {
  const { adapter, services, businessContext } = useMetaForge();
  const previewGeneration = useRef(0);
  const companyFromContext = String(businessContext.company ?? "").trim();
  const warehouseFromContext = String(businessContext.warehouse ?? "").trim();

  const [company, setCompany] = useState(companyFromContext);
  const [currency, setCurrency] = useState("");
  const [priceList, setPriceList] = useState("");
  const [customer, setCustomer] = useState<CustomerState>({ name: "", group: "", phone: "", address: "" });
  const [transactionDate, setTransactionDate] = useState(today());
  const [deliveryDate, setDeliveryDate] = useState(today());
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<SaleLine[]>([newLine()]);
  const [saving, setSaving] = useState<"" | "draft" | "submit">("");
  const [createdOrder, setCreatedOrder] = useState<Doc | null>(null);
  const [globalError, setGlobalError] = useState("");
  const submitted = Boolean(createdOrder && Number(createdOrder.docstatus ?? 0) === 1);
  const customerGroup = canonicalGroup(customer.group);

  useEffect(() => { if (companyFromContext) setCompany(companyFromContext); }, [companyFromContext]);

  useEffect(() => {
    if (!company) { setCurrency(""); return; }
    let active = true;
    void adapter.getDoc("Company", company).then(({ doc }) => {
      if (active) setCurrency(String(doc.default_currency ?? doc.currency ?? "").trim());
    }).catch((error) => { if (active) setGlobalError(adapter.mapError(error).message); });
    return () => { active = false; };
  }, [adapter, company]);

  useEffect(() => {
    const name = customer.name.trim();
    if (!name) {
      setCustomer({ name: "", group: "", phone: "", address: "" });
      setPriceList("");
      return;
    }
    let active = true;
    void adapter.getDoc("Customer", name).then(({ doc }) => {
      if (!active) return;
      setCustomer({
        name,
        group: canonicalGroup(doc.price_group ?? doc.customer_group ?? ""),
        phone: String(doc.phone ?? doc.mobile_no ?? doc.mobile ?? "").trim(),
        address: String(doc.address ?? doc.primary_address ?? doc.customer_primary_address ?? "").trim(),
      });
      const preferred = String(doc.default_price_list ?? doc.selling_price_list ?? doc.price_list ?? "").trim();
      setPriceList(preferred);
    }).catch((error) => { if (active) setGlobalError(adapter.mapError(error).message); });
    return () => { active = false; };
  }, [adapter, customer.name]);

  const patchLine = (index: number, patch: Partial<SaleLine>) => {
    setLines((current) => current.map((line, lineIndex) => lineIndex === index ? { ...line, ...patch } : line));
  };

  const chooseItem = (index: number, itemCode: string) => {
    if (!itemCode) {
      setLines((current) => current.map((line, lineIndex) => lineIndex === index ? { ...newLine(), id: line.id } : line));
      return;
    }
    const old = lines[index];
    patchLine(index, {
      itemCode, itemName: "", itemGroup: "", doorType: "", mode: "QUANTITY",
      color: "", requireColor: false, thickness: "", height: "", width: "", qty: old?.qty || "1",
      rate: null, uom: "", currency: "", warehouse: warehouseFromContext, discountPct: "", pricingRule: "", itemPrice: "",
      billableQty: null, grossAmount: null, discountAmount: null, netAmount: null, formula: null,
      stockQty: null, stockShort: null, stockMessage: "", busy: true, error: "",
    });
  };

  const fingerprint = useMemo(() => JSON.stringify({
    company, currency, customer: customer.name, customerGroup, priceList, transactionDate, deliveryDate, warehouseFromContext,
    lines: lines.map((line) => ({ item: line.itemCode, color: line.color, height: line.height, width: line.width, qty: line.qty, discount: line.discountPct })),
  }), [company, currency, customer.name, customerGroup, priceList, transactionDate, deliveryDate, warehouseFromContext, lines]);

  useEffect(() => {
    const generation = ++previewGeneration.current;
    const timer = window.setTimeout(() => {
      void Promise.all(lines.map(async (line, index) => {
        if (!line.itemCode || !currency || !company) return;
        patchLine(index, { busy: true, error: "" });
        try {
          let formula: FormulaResult | null = line.formula;
          const modeHint = line.mode;
          if ((modeHint === "AREA" || String(line.itemGroup).toLowerCase().startsWith("cửa"))
            && positive(line.height) && positive(line.width) && integerPositive(line.qty) && ["Đại lý", "Lẻ"].includes(customerGroup)) {
            formula = await adapter.callPost<FormulaResult>("alumdoor.sales.production_line_context", {
              item_code: line.itemCode,
              customer_group: customerGroup,
              sales_mode: "Trọn bộ",
              width_input_basis: "Rộng phủ bì",
              height_input_basis: "Cao phủ bì",
              width_m: decimal(line.width),
              height_m: decimal(line.height),
              set_count: decimal(line.qty),
              ...(line.color ? { color: line.color } : {}),
              delivery_date: deliveryDate,
            });
          }

          const context = await adapter.callPost<ItemContext>("alumdoor.sales.item_context", {
            item_code: line.itemCode,
            customer: customer.name,
            ...(customerGroup ? { customer_group: customerGroup } : {}),
            company,
            currency,
            ...(priceList ? { price_list: priceList } : {}),
            ...(warehouseFromContext ? { warehouse: warehouseFromContext } : {}),
            transaction_date: transactionDate,
            quantity: positive(line.qty) ? decimal(line.qty) : undefined,
            height_m: positive(line.height) ? decimal(line.height) : undefined,
            width_m: positive(line.width) ? decimal(line.width) : undefined,
            billable_area_sqm: formula?.billable_area_sqm,
            discount_percentage: line.discountPct.trim() ? decimal(line.discountPct) : undefined,
          });
          if (generation !== previewGeneration.current) return;

          const mode = context.calculation_mode ?? line.mode;
          const resolvedDiscount = Number(context.discount_percentage);
          let stockShort: number | null = null;
          let stockMessage = "";
          if (mode === "AREA" && formula?.stock_profile_item && !formula.leaf_error && !formula.stock_profile_error && warehouseFromContext) {
            const cutWidth = Number(formula.cut_width_m);
            const sheets = Number(formula.total_leaf_count);
            if (Number.isFinite(cutWidth) && cutWidth > 0 && Number.isFinite(sheets) && sheets > 0) {
              const stock = await adapter.callPost<{ short?: number; message?: string }>("alumdoor.cut.propose", {
                item_code: formula.stock_profile_item,
                warehouse: warehouseFromContext,
                ...(line.color ? { color: line.color, colour: line.color } : {}),
                cut_width_m: cutWidth,
                sheets,
              });
              stockShort = Number(stock.short ?? 0);
              stockMessage = String(stock.message ?? "");
            }
          }

          const contextError = String(context.calculation_error ?? context.price_error ?? formula?.leaf_error ?? formula?.stock_profile_error ?? "").trim();
          setLines((current) => current.map((entry, lineIndex) => lineIndex === index ? {
            ...entry,
            itemName: String(context.item_name ?? entry.itemCode).trim() || entry.itemCode,
            itemGroup: String(context.item_group ?? "").trim(),
            doorType: String(context.door_type ?? formula?.door_type ?? "").trim(),
            mode,
            requireColor: context.require_color === true,
            color: context.require_color === true ? (entry.color || String(context.default_color ?? "").trim()) : "",
            thickness: context.thickness_mm == null ? "" : String(context.thickness_mm).replace(".", ","),
            rate: context.rate == null || context.price_missing ? null : Number(context.rate),
            uom: String(context.selected_uom ?? "").trim(),
            currency: String(context.currency ?? currency).trim() || currency,
            warehouse: String(context.warehouse ?? warehouseFromContext).trim(),
            discountPct: Number.isFinite(resolvedDiscount) && resolvedDiscount > 0 ? String(resolvedDiscount).replace(".", ",") : "",
            pricingRule: String(context.pricing_rule ?? "").trim(),
            itemPrice: String(context.item_price ?? "").trim(),
            billableQty: context.billable_qty == null ? null : Number(context.billable_qty),
            grossAmount: context.gross_amount == null ? null : Number(context.gross_amount),
            discountAmount: context.discount_amount == null ? null : Number(context.discount_amount),
            netAmount: context.net_amount == null ? null : Number(context.net_amount),
            formula,
            managedStock: context.managed_stock !== false,
            stockQty: context.available_qty == null ? null : Number(context.available_qty),
            stockShort,
            stockMessage,
            busy: false,
            error: contextError,
          } : entry));
          const resolvedPriceList = String(context.price_list ?? "").trim();
          if (!priceList && resolvedPriceList) setPriceList(resolvedPriceList);
        } catch (error) {
          if (generation !== previewGeneration.current) return;
          patchLine(index, { busy: false, rate: null, billableQty: null, grossAmount: null, discountAmount: null, netAmount: null, error: adapter.mapError(error).message });
        }
      }));
    }, 260);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fingerprint, adapter]);

  const total = useMemo(() => lines.reduce((sum, line) => sum + Number(line.netAmount ?? 0), 0), [lines]);

  const blockers = useMemo(() => {
    const out: string[] = [];
    if (!company) out.push("Cần Công ty.");
    if (!customer.name) out.push("Cần chọn Khách hàng.");
    if (!currency) out.push("Chưa xác định tiền tệ bán.");
    if (!priceList) out.push("Chưa xác định bảng giá bán.");
    if (!transactionDate) out.push("Cần ngày đặt hàng.");
    if (!deliveryDate) out.push("Cần ngày giao hàng.");
    if (deliveryDate && transactionDate && deliveryDate < transactionDate) out.push("Ngày giao phải bằng hoặc sau ngày đặt hàng.");
    if (!lines.some((line) => line.itemCode)) out.push("Cần ít nhất một mặt hàng.");
    lines.forEach((line, index) => {
      if (!line.itemCode) return;
      if (!integerPositive(line.qty)) out.push(`Dòng ${index + 1}: cần SL nguyên dương.`);
      if (line.requireColor && !line.color) out.push(`Dòng ${index + 1}: cần Màu sắc.`);
      if (line.mode === "HEIGHT" && !positive(line.height)) out.push(`Dòng ${index + 1}: cần Chiều cao.`);
      if (line.mode === "WIDTH" && !positive(line.width)) out.push(`Dòng ${index + 1}: cần Chiều rộng.`);
      if (line.mode === "AREA" && (!positive(line.height) || !positive(line.width))) out.push(`Dòng ${index + 1}: cần Chiều cao và Chiều rộng.`);
      if (line.billableQty == null || line.billableQty <= 0) out.push(`Dòng ${index + 1}: hệ thống chưa tính xong số lượng tính tiền.`);
      if (line.rate == null) out.push(`Dòng ${index + 1}: chưa có đơn giá bán.`);
      if (!line.uom) out.push(`Dòng ${index + 1}: chưa có ĐVT bán.`);
      if (line.error) out.push(`Dòng ${index + 1}: ${line.error}`);
      if (line.mode === "AREA" && Number(line.stockShort ?? 0) > 0) out.push(`Dòng ${index + 1}: ${line.stockMessage || `thiếu ${line.stockShort} lá nhôm`}.`);
      if (line.mode !== "AREA" && line.managedStock && line.stockQty != null && line.billableQty != null && line.billableQty > line.stockQty) out.push(`Dòng ${index + 1}: tồn kho không đủ.`);
    });
    return out;
  }, [company, currency, customer.name, deliveryDate, lines, priceList, transactionDate]);

  const buildItems = () => lines.filter((line) => line.itemCode).map((line, index) => ({
    row_id: `SALES-SHEET-${index + 1}`,
    item_code: line.itemCode,
    uom: line.uom,
    qty: line.billableQty,
    rate: line.rate,
    ...(line.warehouse ? { warehouse: line.warehouse } : {}),
    set_count: decimal(line.qty),
    ...(line.color ? { color: line.color } : {}),
    ...(positive(line.height) ? { height_m: decimal(line.height) } : {}),
    ...(positive(line.width) ? { width_m: decimal(line.width) } : {}),
    ...(line.thickness ? { thickness_mm: decimal(line.thickness) } : {}),
    ...(!line.pricingRule && line.discountPct.trim() ? { discount_percentage: decimal(line.discountPct) } : {}),
    ...(line.mode === "AREA" && line.formula ? {
      door_type: line.formula.door_type,
      formula_policy: line.formula.policy_name,
      formula_version: line.formula.formula_version,
      width_basis: line.formula.width_basis,
      cut_width_m: line.formula.cut_width_m,
      billable_area_sqm: line.formula.billable_area_sqm,
    } : {}),
  }));

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
        ...(customerGroup ? { customer_group: customerGroup } : {}),
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
        try { await adapter.callPost("alumdoor.reserve.release", { reservation, released_reason: "Hoàn tác tự động vì xác nhận Sales Order không hoàn tất." }); } catch { /* audit server giữ quyền */ }
      }
      setGlobalError(adapter.mapError(error).message);
    } finally {
      setSaving("");
    }
  };

  const quickCreate = async (doctype: "Customer" | "Supplier") => {
    if (!services.quickCreate || submitted) return;
    const name = await services.quickCreate(doctype);
    if (doctype === "Customer" && name) setCustomer({ name, group: "", phone: "", address: "" });
  };

  const startNew = () => {
    setCreatedOrder(null); setCustomer({ name: "", group: "", phone: "", address: "" }); setPriceList("");
    setTransactionDate(today()); setDeliveryDate(today()); setNote(""); setLines([newLine()]); setGlobalError("");
  };

  const exportExcel = () => {
    const rows: string[][] = [["STT", "SẢN PHẨM", "MÀU SẮC", "ĐỘ DÀY", "CHIỀU CAO", "CHIỀU RỘNG", "DIỆN TÍCH", "SL", "ĐƠN GIÁ", "CK %", "ĐVT", "THÀNH TIỀN"]];
    lines.filter((line) => line.itemCode).forEach((line, index) => {
      rows.push([String(index + 1), line.itemName || line.itemCode, line.color, line.thickness, line.height, line.width, line.formula?.area_per_set_sqm == null ? "" : String(line.formula.area_per_set_sqm), line.qty, String(line.rate ?? ""), "", line.uom, String(line.grossAmount ?? "")]);
      rows.push(["", "Chiết khấu", "", "", "", "", "", "", "", line.discountPct, "", line.discountAmount && line.discountAmount > 0 ? String(-line.discountAmount) : ""]);
    });
    const csv = `\uFEFF${rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\r\n")}`;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = `${createdOrder?.name || "sales-order"}.csv`; document.body.appendChild(anchor); anchor.click(); anchor.remove(); URL.revokeObjectURL(url);
  };

  const required = (line: SaleLine, key: ColumnKey) => {
    if (key === "item" || key === "qty") return true;
    if (!line.itemCode) return false;
    if (key === "color") return line.requireColor;
    if (key === "height") return line.mode === "HEIGHT" || line.mode === "AREA";
    if (key === "width") return line.mode === "WIDTH" || line.mode === "AREA";
    return false;
  };

  const missing = (line: SaleLine, key: ColumnKey) => {
    if (!required(line, key)) return false;
    if (key === "item") return !line.itemCode;
    if (key === "qty") return !integerPositive(line.qty);
    if (key === "color") return !line.color;
    if (key === "height") return !positive(line.height);
    if (key === "width") return !positive(line.width);
    return false;
  };

  const renderProductCell = (line: SaleLine, index: number, column: ColumnDef) => {
    const edit = `h-8 w-full rounded-none border-0 bg-transparent px-1.5 py-1 text-xs outline-none focus:ring-1 focus:ring-inset focus:ring-slate-400 ${required(line, column.key) ? "font-semibold" : ""}`;
    if (column.key === "item") return <SheetLink doctype="Item" value={line.itemCode} onChange={(value) => chooseItem(index, value)} readOnly={submitted} required fieldname={`sale_item_${index}`} />;
    if (column.key === "color") return line.itemCode && line.requireColor ? <SheetLink doctype="Item Color" value={line.color} onChange={(color) => patchLine(index, { color })} readOnly={submitted} required fieldname={`sale_color_${index}`} /> : null;
    if (column.key === "thickness") return line.thickness ? <div className="px-1.5 text-right text-xs font-medium">{line.thickness} ly</div> : null;
    if (column.key === "height") return line.itemCode && (line.mode === "HEIGHT" || line.mode === "AREA") ? <Input className={edit} inputMode="decimal" value={line.height} disabled={submitted} onChange={(event) => patchLine(index, { height: event.target.value })} /> : null;
    if (column.key === "width") return line.itemCode && (line.mode === "WIDTH" || line.mode === "AREA") ? <Input className={edit} inputMode="decimal" value={line.width} disabled={submitted} onChange={(event) => patchLine(index, { width: event.target.value })} /> : null;
    if (column.key === "area") return line.formula?.area_per_set_sqm == null ? null : <div className="px-1.5 text-right text-xs tabular-nums">{number(line.formula.area_per_set_sqm, 3)}</div>;
    if (column.key === "qty") return line.itemCode ? <Input className={edit} inputMode="numeric" value={line.qty} disabled={submitted} onChange={(event) => patchLine(index, { qty: event.target.value })} /> : null;
    if (column.key === "rate") return line.rate == null ? null : <div className="px-1.5 text-right text-xs tabular-nums">{money(line.rate)}</div>;
    if (column.key === "discount") return null;
    if (column.key === "uom") return line.uom ? <div className="px-1.5 text-center text-xs">{line.uom}</div> : null;
    if (column.key === "amount") return line.grossAmount == null ? null : <div className="px-1.5 text-right text-xs font-semibold tabular-nums">{money(line.grossAmount)}</div>;
    return null;
  };

  const renderDiscountCell = (line: SaleLine, index: number, column: ColumnDef) => {
    if (column.key === "item") return <div className="px-1.5 text-xs font-semibold">Chiết khấu dòng</div>;
    if (column.key === "discount") return submitted || line.pricingRule
      ? (line.discountPct ? <div className="px-1.5 text-right text-xs font-semibold tabular-nums">{line.discountPct}%</div> : null)
      : <Input className="h-8 w-full rounded-none border-0 bg-transparent px-1.5 py-1 text-right text-xs outline-none focus:ring-1 focus:ring-inset focus:ring-slate-400" inputMode="decimal" value={line.discountPct} onChange={(event) => patchLine(index, { discountPct: event.target.value.replace("%", "") })} />;
    if (column.key === "amount") return line.discountAmount && line.discountAmount > 0 ? <div className="px-1.5 text-right text-xs font-semibold tabular-nums">-{money(line.discountAmount)}</div> : null;
    return null;
  };

  return <div className="h-full w-full overflow-auto bg-white p-2 md:p-3">
    <div className="mx-auto w-full max-w-[1900px] space-y-2">
      <section className="grid border-l border-t border-slate-300 bg-white md:grid-cols-4">
        {!companyFromContext ? <div className="border-b border-r border-slate-300 p-2"><HeaderLink label="Công ty" doctype="Company" value={company} onChange={setCompany} required readOnly={submitted} /></div> : null}
        <div className="border-b border-r border-slate-300 p-2 md:col-span-2"><HeaderLink label="Khách hàng" doctype="Customer" value={customer.name} onChange={(name) => { setCustomer({ name, group: "", phone: "", address: "" }); setPriceList(""); }} required readOnly={submitted} /></div>
        <div className="flex items-end gap-1 border-b border-r border-slate-300 p-2">
          <Button type="button" variant="outline" size="sm" disabled={submitted || !services.quickCreate} onClick={() => void quickCreate("Customer")}>+ Khách hàng</Button>
          <Button type="button" variant="outline" size="sm" disabled={submitted || !services.quickCreate} onClick={() => void quickCreate("Supplier")}>+ NCC</Button>
        </div>
        <div className="grid gap-1 border-b border-r border-slate-300 p-2"><Label className="text-[11px] font-semibold">Loại khách</Label><Input className="h-8 rounded-none" value={customerGroup} readOnly /></div>
        <div className="grid gap-1 border-b border-r border-slate-300 p-2"><Label className="text-[11px] font-semibold">Ngày đặt hàng *</Label><Input className={`h-8 rounded-none ${!transactionDate ? "border-red-500" : ""}`} type="date" value={transactionDate} disabled={submitted} onChange={(event) => setTransactionDate(event.target.value)} /></div>
        <div className="grid gap-1 border-b border-r border-slate-300 p-2"><Label className="text-[11px] font-semibold">Ngày giao hàng *</Label><Input className={`h-8 rounded-none ${!deliveryDate ? "border-red-500" : ""}`} type="date" min={transactionDate} value={deliveryDate} disabled={submitted} onChange={(event) => setDeliveryDate(event.target.value)} /></div>
        <div className="grid gap-1 border-b border-r border-slate-300 p-2"><Label className="text-[11px] font-semibold">Ghi chú</Label><Input className="h-8 rounded-none" value={note} disabled={submitted} onChange={(event) => setNote(event.target.value)} /></div>
        {customer.name ? <div className="border-b border-r border-slate-300 p-2 text-[11px] text-slate-600 md:col-span-4">{[customer.phone, customer.address, priceList ? `Bảng giá: ${priceList}` : "", currency, createdOrder?.name ? String(createdOrder.name) : ""].filter(Boolean).join(" · ")}{submitted ? <span className="ml-3 inline-flex items-center gap-1 font-semibold text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" />Đã xác nhận</span> : null}</div> : null}
      </section>

      <div className="flex items-center gap-2">
        {!submitted ? <Button type="button" variant="outline" size="sm" onClick={() => setLines((current) => [...current, newLine()])}><Plus /> Thêm dòng</Button> : null}
        {!submitted ? <Button type="button" variant="outline" size="sm" onClick={() => setLines((current) => [...current, ...Array.from({ length: 10 }, () => newLine())])}>+10 dòng</Button> : null}
        <span className="ml-auto text-[11px] text-slate-500">Cột tự đổi theo mặt hàng: Hàng thường · Ray · Trục · Cửa Đức · Cửa lưới</span>
      </div>

      <div className="w-full overflow-x-auto border border-slate-300 bg-white">
        <table className="w-max min-w-full border-collapse text-xs">
          <thead><tr><th className="sticky left-0 z-20 w-10 min-w-10 border border-orange-500 bg-orange-600 px-1 py-2 text-center font-semibold text-white">STT</th>{COLUMNS.map((column) => <th key={column.key} className="border border-orange-500 bg-orange-600 px-1 py-2 text-center font-semibold text-white" style={{ width: `${column.width}rem`, minWidth: `${column.width}rem` } as CSSProperties}>{column.label}</th>)}{!submitted ? <th className="w-10 min-w-10 border border-orange-500 bg-orange-600"></th> : null}</tr></thead>
          <tbody>{lines.map((line, lineIndex) => <FragmentRows key={line.id} line={line} lineIndex={lineIndex} submitted={submitted} missing={missing} renderProductCell={renderProductCell} renderDiscountCell={renderDiscountCell} onDelete={() => setLines((current) => current.length === 1 ? [{ ...newLine(), id: current[0]!.id }] : current.filter((_, index) => index !== lineIndex))} />)}</tbody>
        </table>
      </div>

      <section className="ml-auto w-full max-w-md border-l border-t border-slate-300 bg-white">
        <div className="grid grid-cols-2"><div className="border-b border-r border-slate-300 p-2 text-sm">Tổng tiền hàng</div><div className="border-b border-r border-slate-300 p-2 text-right text-sm font-medium tabular-nums">{total ? money(total) : ""}</div></div>
        <div className="grid grid-cols-2"><div className="border-b border-r border-slate-300 p-2 text-sm font-bold">TỔNG CỘNG</div><div className="border-b border-r border-slate-300 p-2 text-right text-base font-bold text-orange-600 tabular-nums">{total ? money(total) : ""}</div></div>
      </section>

      {globalError ? <div className="flex items-start gap-2 border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700"><TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />{globalError}</div> : null}

      <div className="flex flex-wrap justify-end gap-2 border-t border-slate-300 pt-2">
        {!submitted ? <Button type="button" variant="outline" disabled={Boolean(saving)} onClick={() => void saveOrder(true)}>{saving === "draft" ? "Đang lưu…" : "Lưu nháp"}</Button> : null}
        {!submitted ? <Button type="button" disabled={Boolean(saving)} onClick={() => void saveOrder(false)}>{saving === "submit" ? "Đang xác nhận…" : "Lưu & Xác nhận"}</Button> : null}
        {createdOrder?.name ? <Button type="button" variant="outline" onClick={() => window.open(`/print/${encodeURIComponent("Sales Order")}/${encodeURIComponent(String(createdOrder.name))}`, "_blank")}><Printer /> In / PDF</Button> : null}
        {createdOrder?.name ? <Button type="button" variant="outline" onClick={exportExcel}><FileSpreadsheet /> Excel</Button> : null}
        {submitted ? <Button type="button" onClick={startNew}>Tạo đơn mới</Button> : null}
      </div>
    </div>
  </div>;
}

function FragmentRows({ line, lineIndex, submitted, missing, renderProductCell, renderDiscountCell, onDelete }: {
  line: SaleLine; lineIndex: number; submitted: boolean;
  missing: (line: SaleLine, key: ColumnKey) => boolean;
  renderProductCell: (line: SaleLine, index: number, column: ColumnDef) => React.ReactNode;
  renderDiscountCell: (line: SaleLine, index: number, column: ColumnDef) => React.ReactNode;
  onDelete: () => void;
}) {
  return <>
    <tr>
      <td rowSpan={2} className="sticky left-0 z-10 border border-slate-300 bg-white px-1 text-center align-middle text-[10px] text-slate-500">{lineIndex + 1}</td>
      {COLUMNS.map((column) => <td key={column.key} className={`h-9 border bg-white p-0 align-middle ${column.numeric ? "text-right" : ""} ${missing(line, column.key) ? "border-red-500 ring-1 ring-inset ring-red-500" : "border-slate-300"}`} style={{ width: `${column.width}rem`, minWidth: `${column.width}rem` } as CSSProperties}>{renderProductCell(line, lineIndex, column)}</td>)}
      {!submitted ? <td rowSpan={2} className="border border-slate-300 bg-white p-0 text-center align-middle"><Button type="button" variant="ghost" size="icon-sm" className="text-slate-500 hover:text-red-600" onClick={onDelete}><Trash2 /></Button></td> : null}
    </tr>
    <tr className="bg-orange-50/60">{COLUMNS.map((column) => <td key={column.key} className={`h-8 border border-slate-300 bg-orange-50/60 p-0 align-middle ${column.numeric ? "text-right" : ""}`}>{renderDiscountCell(line, lineIndex, column)}</td>)}</tr>
    {line.error ? <tr><td></td><td colSpan={COLUMNS.length + (submitted ? 0 : 1)} className="border border-slate-300 bg-white px-2 py-1 text-[11px] text-red-700">{line.error}</td></tr> : null}
  </>;
}
