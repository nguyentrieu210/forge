import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, PackageCheck, Plus, ShoppingCart, Trash2, TriangleAlert } from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { Doc, DocField } from "@metaforge/core";
import { useMetaForge } from "@metaforge/views/provider";
import { Button, Input, Label, toast } from "@metaforge/ui";

type Json = Record<string, unknown>;

type FormulaResult = Json & {
  policy_name?: string;
  formula_version?: string;
  item_group?: string;
  door_type?: string;
  ray_type?: string | null;
  leaf_variant?: string | null;
  width_basis?: string;
  measured_width_m?: number;
  cover_width_m?: number;
  cut_width_m?: number;
  cover_height_m?: number;
  billable_area_sqm?: number;
  leaf_count?: number;
  total_leaf_count?: number;
  single_layer_leaf_count?: number | null;
  double_layer_leaf_count?: number | null;
  leaf_height_deduction_m?: number | null;
  leaf_divisor_m?: number | null;
  leaf_rounding?: string;
  estimated_weight_kg?: number | null;
  formula_explanation?: string;
  leaf_error?: string | null;
  bom_no?: string | null;
  stock_profile_item?: string | null;
  stock_profile_error?: string | null;
};

type PriceResult = {
  selected_uom?: string;
  rate?: number | null;
  currency?: string;
  price_missing?: boolean;
  price_error?: string | null;
  availability_status?: string;
};

type StockProposal = {
  item_code?: string;
  warehouse?: string;
  cut_width_m?: number;
  sheets?: number;
  picks?: Array<Record<string, unknown>>;
  short?: number;
  message?: string;
};

type ReservationResult = {
  reservation?: string;
  state?: string;
  message?: string;
};

type PolicyChoice = {
  policy_name?: string;
  door_type?: string;
  item_group?: string;
  ray_type?: string;
  disabled?: unknown;
};

interface CustomerState {
  name: string;
  group: string;
  phone: string;
  address: string;
  priceList: string;
}

interface DoorLine {
  id: string;
  itemCode: string;
  color: string;
  widthM: string;
  heightM: string;
  setCount: string;
  widthBasis: "Rộng lọt lòng" | "Rộng phủ bì";
  heightBasis: "Cao lọt lòng" | "Cao phủ bì";
  salesMode: "Trọn bộ" | "Tách món";
  rayType: string;
  hasButterflyBracket: boolean;
  leafVariant: string;
  leafVariantOptions: string[];
  motorModel: string;
  accessories: string;
  formula: FormulaResult | null;
  price: PriceResult | null;
  stock: StockProposal | null;
  busy: boolean;
  error: string;
}

const today = () => {
  const date = new Date();
  return new Date(date.valueOf() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
};

const reservationExpiry = (deliveryDate: string) => {
  const endOfDeliveryDay = new Date(`${deliveryDate}T23:59:59.999`);
  if (!Number.isFinite(endOfDeliveryDay.valueOf())) throw new Error("Ngày giao không hợp lệ để giữ chỗ tồn kho.");
  return endOfDeliveryDay.toISOString();
};

const newLine = (): DoorLine => ({
  id: `door-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  itemCode: "",
  color: "",
  widthM: "",
  heightM: "",
  setCount: "1",
  widthBasis: "Rộng lọt lòng",
  heightBasis: "Cao lọt lòng",
  salesMode: "Trọn bộ",
  rayType: "",
  hasButterflyBracket: false,
  leafVariant: "",
  leafVariantOptions: [],
  motorModel: "",
  accessories: "",
  formula: null,
  price: null,
  stock: null,
  busy: false,
  error: "",
});

const positive = (value: string) => Number.isFinite(Number(value)) && Number(value) > 0;
const fmt = (value: unknown, digits = 3) => {
  const number = Number(value);
  return Number.isFinite(number) ? number.toLocaleString("vi-VN", { maximumFractionDigits: digits }) : "—";
};
const money = (value: unknown, currency = "VND") => new Intl.NumberFormat("vi-VN", {
  style: "currency",
  currency: currency || "VND",
  maximumFractionDigits: 0,
}).format(Number(value) || 0);
const checked = (value: unknown) => value === true || value === 1 || value === "1" || String(value ?? "").toLocaleLowerCase("vi") === "true";

function CanonicalLink({ label, doctype, value, onChange, required, readOnly }: {
  label: string;
  doctype: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  readOnly?: boolean;
}) {
  const { registry, services } = useMetaForge();
  const field: DocField = {
    fieldname: `operational_${doctype.replaceAll(" ", "_").toLocaleLowerCase("vi")}`,
    label,
    fieldtype: "Link",
    options: doctype,
    ...(required ? { reqd: 1 as const } : {}),
  };
  const Control = registry.resolve("Link");
  return <div className="grid min-w-0 gap-1.5">
    <Label>{label}{required ? <span className="text-destructive">*</span> : null}</Label>
    {Control
      ? <Control field={field} value={value} onChange={(next: unknown) => onChange(String(next ?? ""))} readOnly={readOnly} services={services} linkTarget={doctype} docValues={{}} compact />
      : <Input value={value} readOnly />}
  </div>;
}

function CompactNumber({ label, value, onChange, required, suffix }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  suffix?: string;
}) {
  return <div className="grid min-w-0 gap-1.5">
    <Label>{label}{required ? <span className="text-destructive">*</span> : null}</Label>
    <div className="relative">
      <Input className={suffix ? "pr-10" : ""} value={value} inputMode="decimal" onChange={(event) => onChange(event.target.value)} />
      {suffix ? <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">{suffix}</span> : null}
    </div>
  </div>;
}

function Stat({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return <div className={`rounded-lg border px-3 py-2 ${danger ? "border-destructive/35 bg-destructive/5" : "bg-background"}`}>
    <div className="text-[11px] text-muted-foreground">{label}</div>
    <div className={`mt-0.5 font-semibold tabular-nums ${danger ? "text-destructive" : ""}`}>{value}</div>
  </div>;
}

export function AlumdoorOperationsCenter() {
  const { adapter, businessContext } = useMetaForge();
  const navigate = useNavigate();
  const contextCompany = String(businessContext.company ?? "").trim();
  const contextWarehouse = String(businessContext.warehouse ?? "").trim();
  const [company, setCompany] = useState(contextCompany);
  const [currency, setCurrency] = useState("");
  const [warehouse, setWarehouse] = useState(contextWarehouse);
  const [deliveryDate, setDeliveryDate] = useState(today());
  const [customer, setCustomer] = useState<CustomerState>({ name: "", group: "", phone: "", address: "", priceList: "" });
  const [lines, setLines] = useState<DoorLine[]>([newLine()]);
  const [policyChoices, setPolicyChoices] = useState<PolicyChoice[]>([]);
  const [saving, setSaving] = useState<"" | "draft" | "submit">("");
  const [globalError, setGlobalError] = useState("");
  const [createdOrder, setCreatedOrder] = useState<Doc | null>(null);
  const [reservationRecovery, setReservationRecovery] = useState<string[]>([]);
  const previewGeneration = useRef(0);

  useEffect(() => { if (contextCompany) setCompany(contextCompany); }, [contextCompany]);
  useEffect(() => { if (contextWarehouse) setWarehouse(contextWarehouse); }, [contextWarehouse]);

  useEffect(() => {
    let active = true;
    void adapter.getList("Cutting Policy", {
      fields: ["policy_name", "door_type", "item_group", "ray_type", "disabled"],
      orderBy: "policy_name asc",
      pageLength: 500,
    }).then((rows) => {
      if (active) setPolicyChoices(rows as PolicyChoice[]);
    }).catch((error) => {
      if (active) setGlobalError(`Không đọc được lựa chọn Cutting Policy: ${adapter.mapError(error).message}`);
    });
    return () => { active = false; };
  }, [adapter]);

  useEffect(() => {
    if (!company) { setCurrency(""); return; }
    let active = true;
    void adapter.getDoc("Company", company).then(({ doc }) => {
      if (active) setCurrency(String(doc.default_currency ?? ""));
    }).catch((error) => {
      if (active) { setCurrency(""); setGlobalError(adapter.mapError(error).message); }
    });
    return () => { active = false; };
  }, [adapter, company]);

  useEffect(() => {
    const name = customer.name.trim();
    if (!name) {
      setCustomer((current) => ({ ...current, group: "", phone: "", address: "", priceList: "" }));
      return;
    }
    let active = true;
    void adapter.getDoc("Customer", name).then(({ doc }) => {
      if (!active) return;
      setCustomer((current) => ({
        ...current,
        group: String(doc.price_group ?? doc.customer_group ?? "").trim(),
        phone: String(doc.phone ?? doc.mobile_no ?? "").trim(),
        address: String(doc.install_address ?? doc.address ?? "").trim(),
        priceList: String(doc.default_price_list ?? current.priceList ?? "").trim(),
      }));
      setGlobalError("");
    }).catch((error) => { if (active) setGlobalError(adapter.mapError(error).message); });
    return () => { active = false; };
  }, [adapter, customer.name]);

  const inputFingerprint = useMemo(() => JSON.stringify({
    company, currency, warehouse, deliveryDate, customer: customer.name, customerGroup: customer.group, priceList: customer.priceList,
    lines: lines.map((line) => ({
      id: line.id, itemCode: line.itemCode, color: line.color, widthM: line.widthM, heightM: line.heightM,
      setCount: line.setCount, widthBasis: line.widthBasis, heightBasis: line.heightBasis, salesMode: line.salesMode,
      rayType: line.rayType, hasButterflyBracket: line.hasButterflyBracket, leafVariant: line.leafVariant,
    })),
  }), [company, currency, warehouse, deliveryDate, customer.name, customer.group, customer.priceList, lines]);

  useEffect(() => { setCreatedOrder(null); }, [inputFingerprint]);

  useEffect(() => {
    const generation = ++previewGeneration.current;
    const timer = window.setTimeout(() => {
      const canPrice = Boolean(company && currency && customer.group && customer.priceList);
      setLines((current) => current.map((line) => ({ ...line, busy: Boolean(line.itemCode && positive(line.widthM) && positive(line.heightM)), error: "" })));
      void Promise.all(lines.map(async (line, index) => {
        if (!line.itemCode.trim() || !positive(line.widthM) || !positive(line.heightM) || !Number.isInteger(Number(line.setCount)) || Number(line.setCount) <= 0) {
          if (generation === previewGeneration.current) setLines((current) => current.map((entry, i) => i === index ? { ...entry, formula: null, price: null, stock: null, leafVariantOptions: [], busy: false, error: "" } : entry));
          return;
        }
        try {
          const formula = await adapter.callPost<FormulaResult>("alumdoor.sales.production_line_context", {
            item_code: line.itemCode.trim(),
            customer_group: customer.group,
            sales_mode: line.salesMode,
            ...(line.rayType ? { ray_type: line.rayType } : {}),
            width_input_basis: line.widthBasis,
            height_input_basis: line.heightBasis,
            width_m: Number(line.widthM),
            height_m: Number(line.heightM),
            set_count: Number(line.setCount),
            has_butterfly_bracket: line.hasButterflyBracket,
            ...(line.leafVariant ? { leaf_variant: line.leafVariant } : {}),
            ...(line.color ? { color: line.color } : {}),
            delivery_date: deliveryDate,
          });

          let leafVariantOptions: string[] = [];
          if (formula.policy_name) {
            const policy = await adapter.getDoc("Cutting Policy", formula.policy_name);
            const variants = Array.isArray(policy.doc.leaf_variants) ? policy.doc.leaf_variants as Json[] : [];
            leafVariantOptions = [...new Set(variants.map((row) => String(row.variant_label ?? "").trim()).filter(Boolean))];
          }

          let price: PriceResult | null = null;
          if (canPrice) {
            price = await adapter.callPost<PriceResult>("alumdoor.sales.item_context", {
              item_code: line.itemCode.trim(),
              price_list: customer.priceList,
              currency,
              ...(warehouse ? { warehouse } : {}),
            });
            if (price.price_missing || price.rate == null) throw new Error(price.price_error || "Chưa có đơn giá bán.");
          }

          let stock: StockProposal | null = null;
          if (!formula.leaf_error && warehouse && formula.stock_profile_item) {
            const sheets = Number(formula.total_leaf_count);
            const cutWidth = Number(formula.cut_width_m);
            if (!Number.isInteger(sheets) || sheets <= 0 || !Number.isFinite(cutWidth) || cutWidth <= 0) {
              throw new Error("Nhu cầu lá hoặc rộng cắt chưa hợp lệ để kiểm tra tồn.");
            }
            stock = await adapter.callPost<StockProposal>("alumdoor.cut.propose", {
              item_code: formula.stock_profile_item,
              warehouse,
              ...(line.color ? { color: line.color, colour: line.color } : {}),
              cut_width_m: cutWidth,
              sheets,
            });
          }

          if (generation !== previewGeneration.current) return;
          const lineError = formula.leaf_error
            || (stock && Number(stock.short ?? 0) > 0 ? (stock.message || `Thiếu ${stock.short} lá.`) : "")
            || "";
          setLines((current) => current.map((entry, i) => i === index ? { ...entry, formula, price, stock, leafVariantOptions, busy: false, error: lineError } : entry));
        } catch (error) {
          if (generation !== previewGeneration.current) return;
          setLines((current) => current.map((entry, i) => i === index ? { ...entry, formula: null, price: null, stock: null, leafVariantOptions: [], busy: false, error: adapter.mapError(error).message } : entry));
        }
      }));
    }, 450);
    return () => window.clearTimeout(timer);
  // inputFingerprint deliberately represents only user/context inputs; preview output does not retrigger itself.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputFingerprint, adapter]);

  const updateLine = (index: number, patch: Partial<DoorLine>) => {
    setCreatedOrder(null);
    setLines((current) => current.map((line, i) => i === index ? { ...line, ...patch, formula: patch.formula ?? null, price: patch.price ?? null, stock: patch.stock ?? null, error: "" } : line));
  };

  const rayOptionsFor = (line: DoorLine) => {
    const doorType = String(line.formula?.door_type ?? "").trim();
    const itemGroup = String(line.formula?.item_group ?? "").trim();
    if (!doorType) return [];
    return [...new Set(policyChoices
      .filter((policy) => !checked(policy.disabled))
      .filter((policy) => String(policy.door_type ?? "").trim() === doorType)
      .filter((policy) => !String(policy.item_group ?? "").trim() || String(policy.item_group ?? "").trim() === itemGroup)
      .map((policy) => String(policy.ray_type ?? "").trim())
      .filter(Boolean))];
  };

  const readyLines = lines.filter((line) => line.formula && !line.formula.leaf_error && line.price && (!warehouse || line.stock));
  const blockers = lines.flatMap((line, index) => {
    const out: string[] = [];
    if (!line.itemCode.trim()) out.push(`Bộ ${index + 1}: chưa chọn mặt hàng`);
    if (!positive(line.widthM) || !positive(line.heightM)) out.push(`Bộ ${index + 1}: thiếu rộng/cao`);
    if (line.error) out.push(`Bộ ${index + 1}: ${line.error}`);
    if (line.formula?.stock_profile_error) out.push(`Bộ ${index + 1}: ${line.formula.stock_profile_error}`);
    if (warehouse && line.stock && Number(line.stock.short ?? 0) > 0) out.push(`Bộ ${index + 1}: thiếu ${line.stock.short} lá`);
    if (!line.price?.rate && line.itemCode) out.push(`Bộ ${index + 1}: chưa có giá`);
    return out;
  });
  const estimatedTotal = lines.reduce((sum, line) => sum + Number(line.formula?.billable_area_sqm ?? 0) * Number(line.price?.rate ?? 0), 0);
  const submittedOrder = Boolean(createdOrder && Number(createdOrder.docstatus ?? 0) === 1);

  const submitOrder = async (draftOnly: boolean) => {
    setGlobalError("");
    if (reservationRecovery.length) return setGlobalError(`Còn ${reservationRecovery.length} phiếu giữ chỗ chưa nhả được. Cần xử lý các phiếu này trước khi thử xác nhận lại.`), undefined;
    if (createdOrder && Number(createdOrder.docstatus ?? 0) === 1) return setGlobalError(`Đơn ${createdOrder.name} đã xác nhận. Thay đổi cấu hình nếu muốn lập một đơn mới.`), undefined;
    if (!company) return setGlobalError("Cần chọn Công ty."), undefined;
    if (!currency) return setGlobalError(`Công ty ${company} chưa có tiền tệ mặc định.`), undefined;
    if (!customer.name) return setGlobalError("Cần chọn Khách hàng."), undefined;
    if (!["Đại lý", "Lẻ"].includes(customer.group)) return setGlobalError("Khách hàng chưa có Nhóm giá Đại lý/Lẻ."), undefined;
    if (!customer.priceList) return setGlobalError("Khách hàng chưa có Bảng giá mặc định; hãy chọn Bảng giá."), undefined;
    if (!deliveryDate) return setGlobalError("Cần ngày giao dự kiến."), undefined;
    if (deliveryDate < today()) return setGlobalError("Ngày giao không được ở quá khứ."), undefined;
    if (!warehouse) return setGlobalError("Cần chọn Kho để kiểm tra khả năng đáp ứng."), undefined;
    if (blockers.length || readyLines.length !== lines.length) return setGlobalError(blockers[0] || "Các dòng chưa tính xong giá/kho."), undefined;

    setSaving(draftOnly ? "draft" : "submit");
    let created: Doc | null = null;
    const reservations: string[] = [];
    try {
      for (const [index, line] of lines.entries()) {
        const formula = line.formula!;
        const profile = String(formula.stock_profile_item ?? "").trim();
        if (!profile) throw new Error(`Bộ ${index + 1}: ${formula.stock_profile_error || "BOM chưa xác định được nhôm nguyên liệu."}`);
        const check = await adapter.callPost<StockProposal>("alumdoor.cut.propose", {
          item_code: profile,
          warehouse,
          ...(line.color ? { color: line.color, colour: line.color } : {}),
          cut_width_m: Number(formula.cut_width_m),
          sheets: Number(formula.total_leaf_count),
        });
        if (Number(check.short ?? 0) > 0) throw new Error(`Bộ ${index + 1}: ${check.message || `thiếu ${check.short} lá`}`);
      }

      const items = lines.map((line, index) => {
        const formula = line.formula!;
        const price = line.price!;
        const qty = Number(formula.billable_area_sqm);
        return {
          row_id: `COMPOSER-${index + 1}`,
          item_code: line.itemCode.trim(),
          ...(line.color ? { color: line.color } : {}),
          width_m: Number(formula.cover_width_m ?? formula.measured_width_m ?? line.widthM),
          height_m: Number(formula.cover_height_m ?? line.heightM),
          set_count: Number(line.setCount),
          sales_mode: line.salesMode,
          has_butterfly_bracket: line.hasButterflyBracket ? 1 : 0,
          ...(formula.door_type ? { door_type: formula.door_type } : {}),
          ...(formula.leaf_variant ? { leaf_variant: formula.leaf_variant } : {}),
          formula_policy: formula.policy_name,
          formula_version: formula.formula_version,
          width_basis: formula.width_basis,
          cut_width_m: formula.cut_width_m,
          billable_area_sqm: qty,
          leaf_count: formula.leaf_count,
          ...(formula.single_layer_leaf_count == null ? {} : { single_layer_leaf_count: formula.single_layer_leaf_count }),
          ...(formula.double_layer_leaf_count == null ? {} : { double_layer_leaf_count: formula.double_layer_leaf_count }),
          ...(formula.leaf_height_deduction_m == null ? {} : { leaf_height_deduction_m: formula.leaf_height_deduction_m }),
          ...(formula.leaf_divisor_m == null ? {} : { leaf_divisor_m: formula.leaf_divisor_m }),
          ...(formula.leaf_rounding ? { leaf_rounding: formula.leaf_rounding } : {}),
          ...(formula.estimated_weight_kg == null ? {} : { estimated_weight_kg: formula.estimated_weight_kg }),
          ...(formula.formula_explanation ? { formula_explanation: formula.formula_explanation } : {}),
          uom: price.selected_uom,
          qty,
          rate: Number(price.rate),
          ...(line.motorModel ? { motor_model: line.motorModel } : {}),
          ...(line.accessories ? { accessories: line.accessories } : {}),
          warehouse,
        };
      });

      const existingDraft = createdOrder && Number(createdOrder.docstatus ?? 0) === 0 ? createdOrder : null;
      created = existingDraft ?? await adapter.createDoc("Sales Order", {
        customer: customer.name,
        company,
        currency,
        transaction_date: today(),
        delivery_date: deliveryDate,
        selling_price_list: customer.priceList,
        customer_group: customer.group,
        install_address: customer.address || undefined,
        items,
      });

      if (draftOnly) {
        setCreatedOrder(created);
        toast.success(`Đã lưu nháp ${created.name}.`);
        return;
      }

      const expiresAt = reservationExpiry(deliveryDate);
      for (const [index, line] of lines.entries()) {
        const formula = line.formula!;
        const result = await adapter.callPost<ReservationResult>("alumdoor.reserve.create", {
          item_code: String(formula.stock_profile_item),
          warehouse,
          ...(line.color ? { color: line.color } : {}),
          min_length_m: Number(formula.cut_width_m),
          qty_reserved: Number(formula.total_leaf_count),
          source_doctype: "Sales Order",
          source_name: created.name,
          expires_at: expiresAt,
        });
        const reservation = String(result.reservation ?? "").trim();
        if (!reservation) throw new Error(`Bộ ${index + 1}: giữ chỗ thành công nhưng không trả về mã phiếu.`);
        reservations.push(reservation);
      }

      const finalDoc = await adapter.submit(created);
      setCreatedOrder(finalDoc);
      setReservationRecovery([]);
      toast.success(`Đã xác nhận đơn ${finalDoc.name} và giữ ${reservations.length} nhu cầu nhôm.`);
    } catch (error) {
      const failedReleases: string[] = [];
      for (const reservation of reservations.reverse()) {
        try {
          await adapter.callPost("alumdoor.reserve.release", {
            reservation,
            released_reason: "Hoàn tác tự động vì xác nhận Sales Order không hoàn tất.",
          });
        } catch {
          failedReleases.push(reservation);
        }
      }
      setReservationRecovery(failedReleases);
      if (created && Number(created.docstatus ?? 0) === 0) setCreatedOrder(created);
      const mapped = adapter.mapError(error).message;
      setGlobalError(`${mapped}${created ? ` Đơn nháp ${created.name} vẫn được giữ để kiểm tra.` : ""}${failedReleases.length ? ` Không nhả tự động được: ${failedReleases.join(", ")}. Không thử xác nhận lại trước khi xử lý các giữ chỗ này.` : ""}`);
    } finally {
      setSaving("");
    }
  };

  return <div className="h-full w-full max-w-none overflow-auto bg-muted/20 p-3 md:p-4 xl:p-5">
    <div className="w-full max-w-none space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2"><ShoppingCart className="size-5 text-primary" /><h1 className="text-xl font-semibold">Bán hàng</h1></div>
          <p className="mt-1 text-sm text-muted-foreground">Nhập nhu cầu khách; kỹ thuật, giá và khả năng đáp ứng tự cập nhật. Một đơn có thể có nhiều bộ cửa.</p>
        </div>
        <Button variant="outline" onClick={() => navigate(`/app/${encodeURIComponent("Sales Order")}`)}>Danh sách đơn hàng</Button>
      </header>

      <section className="grid gap-3 rounded-xl border bg-card p-3 md:grid-cols-2 xl:grid-cols-6">
        {contextCompany ? <div className="grid gap-1.5"><Label>Công ty</Label><Input value={company} readOnly /></div> : <CanonicalLink label="Công ty" doctype="Company" value={company} onChange={setCompany} required />}
        <CanonicalLink label="Khách hàng" doctype="Customer" value={customer.name} onChange={(name) => setCustomer({ name, group: "", phone: "", address: "", priceList: "" })} required />
        <div className="grid gap-1.5"><Label>Nhóm giá</Label><Input value={customer.group} readOnly placeholder="Tự lấy từ khách" /></div>
        <CanonicalLink label="Bảng giá" doctype="Price List" value={customer.priceList} onChange={(priceList) => setCustomer((current) => ({ ...current, priceList }))} required />
        {contextWarehouse ? <div className="grid gap-1.5"><Label>Kho ATP</Label><Input value={warehouse} readOnly /></div> : <CanonicalLink label="Kho ATP" doctype="Warehouse" value={warehouse} onChange={setWarehouse} required />}
        <div className="grid gap-1.5"><Label>Ngày giao *</Label><Input type="date" min={today()} value={deliveryDate} onChange={(event) => setDeliveryDate(event.target.value)} /></div>
        <div className="grid gap-1.5 md:col-span-2 xl:col-span-3"><Label>Điện thoại</Label><Input value={customer.phone} readOnly placeholder="Tự lấy từ khách" /></div>
        <div className="grid gap-1.5 md:col-span-2 xl:col-span-3"><Label>Địa chỉ giao / lắp</Label><Input value={customer.address} onChange={(event) => setCustomer((current) => ({ ...current, address: event.target.value }))} placeholder="Tự lấy từ khách; sửa cho riêng đơn này nếu cần" /></div>
      </section>

      <div className="space-y-3">
        {lines.map((line, index) => {
          const estimated = Number(line.formula?.billable_area_sqm ?? 0) * Number(line.price?.rate ?? 0);
          const short = Number(line.stock?.short ?? 0);
          const rayOptions = rayOptionsFor(line);
          return <section key={line.id} className="overflow-hidden rounded-xl border bg-card">
            <div className="flex items-center gap-2 border-b bg-muted/25 px-3 py-2">
              <strong className="text-sm">Bộ cửa {index + 1}</strong>
              {line.busy ? <span className="flex items-center gap-1 text-xs text-muted-foreground"><Loader2 className="size-3.5 animate-spin" /> đang tính…</span> : line.formula && line.price && !line.error ? <span className="text-xs text-emerald-700 dark:text-emerald-300">đã cập nhật</span> : null}
              {lines.length > 1 ? <Button type="button" variant="ghost" size="icon-sm" className="ml-auto text-muted-foreground hover:text-destructive" onClick={() => setLines((current) => current.filter((_, i) => i !== index))}><Trash2 /></Button> : null}
            </div>

            <div className="grid min-w-0 xl:grid-cols-[minmax(430px,1.15fr)_minmax(300px,.85fr)_minmax(300px,.8fr)]">
              <div className="grid content-start gap-3 border-b p-3 xl:border-b-0 xl:border-r">
                <div className="grid gap-3 md:grid-cols-2">
                  <CanonicalLink label="Mặt hàng cửa" doctype="Item" value={line.itemCode} onChange={(itemCode) => updateLine(index, { itemCode, rayType: "", leafVariant: "", leafVariantOptions: [] })} required />
                  <CanonicalLink label="Màu" doctype="Item Color" value={line.color} onChange={(color) => updateLine(index, { color })} />
                </div>
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  <CompactNumber label="Rộng khách báo" value={line.widthM} onChange={(widthM) => updateLine(index, { widthM })} required suffix="m" />
                  <div className="grid gap-1.5"><Label>Cách đo rộng</Label><select className="h-10 rounded-md border bg-background px-2 text-sm" value={line.widthBasis} onChange={(event) => updateLine(index, { widthBasis: event.target.value as DoorLine["widthBasis"] })}><option>Rộng lọt lòng</option><option>Rộng phủ bì</option></select></div>
                  <CompactNumber label="Cao khách báo" value={line.heightM} onChange={(heightM) => updateLine(index, { heightM })} required suffix="m" />
                  <div className="grid gap-1.5"><Label>Cách đo cao</Label><select className="h-10 rounded-md border bg-background px-2 text-sm" value={line.heightBasis} onChange={(event) => updateLine(index, { heightBasis: event.target.value as DoorLine["heightBasis"] })}><option>Cao lọt lòng</option><option>Cao phủ bì</option></select></div>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <CompactNumber label="Số bộ" value={line.setCount} onChange={(setCount) => updateLine(index, { setCount })} required />
                  <div className="grid gap-1.5"><Label>Cách bán</Label><select className="h-10 rounded-md border bg-background px-2 text-sm" value={line.salesMode} onChange={(event) => updateLine(index, { salesMode: event.target.value as DoorLine["salesMode"] })}><option>Trọn bộ</option><option>Tách món</option></select></div>
                  <label className="mt-6 flex h-10 items-center gap-2 rounded-md border px-3 text-sm"><input type="checkbox" checked={line.hasButterflyBracket} onChange={(event) => updateLine(index, { hasButterflyBracket: event.target.checked })} /> Có bản bướm</label>
                </div>
                <details className="rounded-lg border bg-muted/15 p-3">
                  <summary className="cursor-pointer text-sm font-medium">Tùy chọn nâng cao</summary>
                  <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {rayOptions.length ? <div className="grid gap-1.5"><Label>Loại ray</Label><select className="h-10 rounded-md border bg-background px-2 text-sm" value={line.rayType} onChange={(event) => updateLine(index, { rayType: event.target.value, leafVariant: "" })}><option value="">Tự chọn theo policy</option>{rayOptions.map((option) => <option key={option} value={option}>{option}</option>)}</select>{!line.rayType && line.formula?.ray_type ? <span className="text-[11px] text-muted-foreground">Đang áp: {line.formula.ray_type}</span> : null}</div> : null}
                    {line.leafVariantOptions.length ? <div className="grid gap-1.5"><Label>Biến thể chia lá</Label><select className="h-10 rounded-md border bg-background px-2 text-sm" value={line.leafVariant} onChange={(event) => updateLine(index, { leafVariant: event.target.value })}><option value="">Chọn theo loại motor</option>{line.leafVariantOptions.map((option) => <option key={option} value={option}>{option}</option>)}</select></div> : null}
                    <CanonicalLink label="Mô tơ" doctype="Item" value={line.motorModel} onChange={(motorModel) => updateLine(index, { motorModel })} />
                    <div className="grid gap-1.5 md:col-span-2 xl:col-span-3"><Label>Phụ kiện / ghi chú cấu hình</Label><Input value={line.accessories} onChange={(event) => updateLine(index, { accessories: event.target.value })} /></div>
                  </div>
                </details>
              </div>

              <div className="grid content-start gap-3 border-b p-3 xl:border-b-0 xl:border-r">
                <div><div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Kết quả kỹ thuật</div><div className="mt-1 text-xs text-muted-foreground">Tự tính theo Cutting Policy/BOM đang hiệu lực.</div></div>
                {line.formula ? <>
                  <div className="grid grid-cols-2 gap-2">
                    <Stat label="Rộng phủ bì" value={`${fmt(line.formula.cover_width_m ?? line.formula.measured_width_m)} m`} />
                    <Stat label="Cao phủ bì" value={`${fmt(line.formula.cover_height_m)} m`} />
                    <Stat label="Rộng cắt" value={`${fmt(line.formula.cut_width_m)} m`} />
                    <Stat label="Diện tích bán" value={`${fmt(line.formula.billable_area_sqm)} m²`} />
                    <Stat label="Lá / bộ" value={fmt(line.formula.leaf_count, 1)} />
                    <Stat label="Tổng lá" value={fmt(line.formula.total_leaf_count, 1)} />
                  </div>
                  <div className="rounded-lg border bg-muted/20 p-3 text-xs">
                    <div>Policy: <strong>{line.formula.policy_name ?? "—"}</strong></div>
                    <div className="mt-1">BOM: <strong>{line.formula.bom_no ?? "—"}</strong></div>
                    <div className="mt-1">Nhôm ATP: <strong>{line.formula.stock_profile_item ?? "—"}</strong></div>
                  </div>
                  {line.formula.stock_profile_error ? <div className="flex gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-700 dark:text-amber-300"><TriangleAlert className="mt-0.5 size-4 shrink-0" />{line.formula.stock_profile_error}</div> : null}
                </> : <div className="grid min-h-40 place-items-center rounded-lg border border-dashed text-center text-sm text-muted-foreground">Chọn mặt hàng và nhập rộng/cao để hệ thống tự tính.</div>}
              </div>

              <div className="grid content-start gap-3 p-3">
                <div><div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Giá & khả năng đáp ứng</div><div className="mt-1 text-xs text-muted-foreground">Giá lấy từ server; tồn kiểm theo BOM → nhôm vật lý → lô cắt.</div></div>
                {line.price ? <div className="grid grid-cols-2 gap-2">
                  <Stat label="Đơn giá server" value={`${money(line.price.rate, line.price.currency || currency)} / ${line.price.selected_uom || "ĐVT"}`} />
                  <Stat label="Giá trị dự kiến" value={money(estimated, line.price.currency || currency)} />
                </div> : <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Chọn khách/bảng giá để tra giá tự động.</div>}

                {warehouse ? line.stock ? <div className={`rounded-lg border p-3 ${short > 0 ? "border-destructive/35 bg-destructive/5" : "border-emerald-500/30 bg-emerald-500/5"}`}>
                  <div className={`flex items-center gap-2 font-semibold ${short > 0 ? "text-destructive" : "text-emerald-700 dark:text-emerald-300"}`}>
                    {short > 0 ? <TriangleAlert className="size-5" /> : <PackageCheck className="size-5" />}
                    {short > 0 ? `Thiếu ${fmt(short, 0)} lá` : "Đủ lô nhôm để đáp ứng"}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">{line.stock.message || `${(line.stock.picks ?? []).length} lô được đề xuất.`}</div>
                </div> : <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">{line.formula?.leaf_error ? "Chọn đủ biến thể kỹ thuật để tính ATP." : "Đang chờ kết quả ATP…"}</div> : <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-700 dark:text-amber-300">Chọn Kho ATP để kiểm tra khả năng đáp ứng.</div>}

                {line.error ? <div className="flex gap-2 rounded-lg border border-destructive/35 bg-destructive/5 p-3 text-sm text-destructive"><TriangleAlert className="mt-0.5 size-4 shrink-0" />{line.error}</div> : null}
              </div>
            </div>
          </section>;
        })}
      </div>

      <Button type="button" variant="outline" onClick={() => setLines((current) => [...current, newLine()])}><Plus /> Thêm bộ cửa</Button>

      <div className="sticky bottom-2 z-20 flex flex-wrap items-center gap-3 rounded-xl border bg-card/95 p-3 shadow-lg backdrop-blur">
        <div className="min-w-0 flex-1">
          <div className="text-xs text-muted-foreground">{lines.length} cấu hình · {submittedOrder ? `đơn ${createdOrder?.name} đã xác nhận` : reservationRecovery.length ? `${reservationRecovery.length} giữ chỗ cần xử lý` : blockers.length ? `${blockers.length} điểm chưa sẵn sàng` : "sẵn sàng xác nhận"}</div>
          <div className="text-lg font-bold tabular-nums">Dự kiến {money(estimatedTotal, currency || "VND")}</div>
          <div className="text-[11px] text-muted-foreground">Xác nhận đơn sẽ tạo giữ chỗ canonical theo đúng nhôm/BOM; tồn thực chỉ thay đổi khi cắt/xuất.</div>
        </div>
        <Button type="button" variant="outline" disabled={Boolean(saving) || submittedOrder || reservationRecovery.length > 0} onClick={() => void submitOrder(true)}>{saving === "draft" ? <Loader2 className="size-4 animate-spin" /> : null} Lưu nháp</Button>
        <Button type="button" disabled={Boolean(saving) || blockers.length > 0 || submittedOrder || reservationRecovery.length > 0} onClick={() => void submitOrder(false)}>{saving === "submit" ? <Loader2 className="size-4 animate-spin" /> : null} {submittedOrder ? "Đã xác nhận" : "Xác nhận & giữ chỗ"}</Button>
      </div>

      {reservationRecovery.length ? <div className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-500/35 bg-amber-500/5 px-3 py-2 text-sm text-amber-700 dark:text-amber-300"><TriangleAlert className="size-4 shrink-0" /><span className="flex-1">Có giữ chỗ chưa nhả được: {reservationRecovery.join(", ")}. Không xác nhận lại đơn cho tới khi xử lý.</span><Button size="sm" variant="outline" onClick={() => navigate(`/app/${encodeURIComponent("Stock Reservation")}`)}>Mở giữ chỗ</Button></div> : null}
      {globalError ? <div className="rounded-lg border border-destructive/35 bg-destructive/5 px-3 py-2 text-sm text-destructive">{globalError}</div> : null}
      {createdOrder ? <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm"><strong>{createdOrder.name}</strong> · {Number(createdOrder.docstatus ?? 0) === 1 ? "Đã xác nhận" : "Nháp"}</div> : null}
    </div>
  </div>;
}
