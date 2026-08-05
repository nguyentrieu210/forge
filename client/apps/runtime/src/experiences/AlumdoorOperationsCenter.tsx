import { useCallback, useMemo, useState, type ReactNode } from "react";
import { Check, ChevronDown, ChevronUp, Loader2, PackageCheck, Pencil, ShoppingCart, TriangleAlert } from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { Doc } from "@metaforge/core";
import { useMetaForge } from "@metaforge/views/provider";
import { Button, Input, Label, toast } from "@metaforge/ui";

type Step = 1 | 2 | 3 | 4 | 5;
type StepState = "LOCKED" | "ACTIVE" | "COMPLETE" | "STALE" | "ERROR";
type LinkOption = { value: string; description?: string };

type FormulaResult = Record<string, unknown> & {
  policy_name?: string;
  formula_version?: string;
  width_basis?: string;
  measured_width_m?: number;
  cover_width_m?: number;
  cut_width_m?: number;
  cover_height_m?: number;
  billable_area_sqm?: number;
  leaf_count?: number;
  total_leaf_count?: number;
  leaf_error?: string | null;
  ray_type?: string | null;
  formula_explanation?: string;
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
  available_qty?: number | null;
  managed_stock?: boolean;
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

interface CustomerState {
  customer: string;
  customerGroup: string;
  phone: string;
  installAddress: string;
  deliveryDate: string;
  priceList: string;
}

interface DoorState {
  itemCode: string;
  color: string;
  warehouse: string;
  salesMode: "Trọn bộ" | "Tách món";
  rayType: "U75" | "U100" | "Ray sắt U70" | "Không dùng ray";
  widthBasis: "Rộng lọt lòng" | "Rộng phủ bì";
  heightBasis: "Cao lọt lòng" | "Cao phủ bì";
  widthM: string;
  heightM: string;
  setCount: string;
  hasButterflyBracket: boolean;
  leafVariant: string;
  motorModel: string;
  accessories: string;
}

const today = () => {
  const date = new Date();
  return new Date(date.valueOf() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
};

const fmt = (value: unknown, digits = 3) => {
  const number = Number(value);
  return Number.isFinite(number) ? number.toLocaleString("vi-VN", { maximumFractionDigits: digits }) : "—";
};
const money = (value: unknown) => new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(Number(value) || 0);
const positive = (value: string) => Number.isFinite(Number(value)) && Number(value) > 0;

function LinkPicker({ label, doctype, value, onChange, onSelect, required, placeholder }: {
  label: string;
  doctype: string;
  value: string;
  onChange: (value: string) => void;
  onSelect?: (value: string) => void;
  required?: boolean;
  placeholder?: string;
}) {
  const { adapter } = useMetaForge();
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<LinkOption[]>([]);
  const [busy, setBusy] = useState(false);

  const search = useCallback(async (text: string) => {
    setBusy(true);
    try {
      const rows = await adapter.searchLink(doctype, text, { pageLength: 12 });
      setOptions(rows.map((row) => ({ value: row.value, description: row.description })));
      setOpen(true);
    } catch {
      setOptions([]);
    } finally {
      setBusy(false);
    }
  }, [adapter, doctype]);

  return <div className="relative space-y-1.5">
    <Label>{label}{required ? " *" : ""}</Label>
    <div className="relative">
      <Input
        value={value}
        placeholder={placeholder ?? `Tìm ${label.toLocaleLowerCase("vi")}`}
        onFocus={() => void search(value)}
        onChange={(event) => { const next = event.target.value; onChange(next); void search(next); }}
        onBlur={() => window.setTimeout(() => setOpen(false), 160)}
        autoComplete="off"
      />
      {busy ? <Loader2 className="absolute right-3 top-2.5 size-4 animate-spin text-muted-foreground" /> : null}
    </div>
    {open && options.length ? <div className="absolute z-30 mt-1 max-h-64 w-full overflow-auto rounded-lg border bg-popover p-1 shadow-xl">
      {options.map((option) => <button
        key={option.value}
        type="button"
        className="block w-full rounded-md px-3 py-2 text-left text-sm hover:bg-muted"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => { onChange(option.value); onSelect?.(option.value); setOpen(false); }}
      >
        <span className="font-medium">{option.value}</span>
        {option.description ? <span className="ml-2 text-xs text-muted-foreground">{option.description}</span> : null}
      </button>)}
    </div> : null}
  </div>;
}

function WizardSection({ number, title, state, active, summary, onOpen, children }: {
  number: Step;
  title: string;
  state: StepState;
  active: boolean;
  summary?: string;
  onOpen: () => void;
  children: ReactNode;
}) {
  const done = state === "COMPLETE";
  return <section className={`overflow-hidden rounded-xl border bg-card ${active ? "ring-1 ring-primary/20" : ""}`} data-sales-wizard-step={number} data-step-state={state}>
    <button type="button" className="flex w-full items-center gap-3 px-4 py-3 text-left sm:px-5" onClick={onOpen} disabled={state === "LOCKED"}>
      <span className={`grid size-7 shrink-0 place-items-center rounded-full text-xs font-bold ${done ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" : active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
        {done ? <Check className="size-4" /> : number}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{title}</span>
        {!active && summary ? <span className="mt-0.5 block truncate text-xs text-muted-foreground">{summary}</span> : null}
        {state === "STALE" ? <span className="mt-0.5 block text-xs font-medium text-amber-600">Cần tính lại vì dữ liệu trước đã thay đổi</span> : null}
      </span>
      {done && !active ? <span className="flex items-center gap-1 text-xs text-primary"><Pencil className="size-3.5" /> Sửa</span> : null}
      {active ? <ChevronUp className="size-4 text-muted-foreground" /> : <ChevronDown className="size-4 text-muted-foreground" />}
    </button>
    {active ? <div className="border-t px-4 py-4 sm:px-5">{children}</div> : null}
  </section>;
}

export function AlumdoorOperationsCenter() {
  const { adapter } = useMetaForge();
  const navigate = useNavigate();
  const [active, setActive] = useState<Step>(1);
  const [doneThrough, setDoneThrough] = useState(0);
  const [staleFrom, setStaleFrom] = useState<Step | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [createdOrder, setCreatedOrder] = useState<Doc | null>(null);
  const [customer, setCustomer] = useState<CustomerState>({ customer: "", customerGroup: "", phone: "", installAddress: "", deliveryDate: today(), priceList: "" });
  const [door, setDoor] = useState<DoorState>({
    itemCode: "", color: "", warehouse: "", salesMode: "Trọn bộ", rayType: "U75",
    widthBasis: "Rộng lọt lòng", heightBasis: "Cao lọt lòng", widthM: "", heightM: "", setCount: "1",
    hasButterflyBracket: false, leafVariant: "", motorModel: "", accessories: "",
  });
  const [formula, setFormula] = useState<FormulaResult | null>(null);
  const [price, setPrice] = useState<PriceResult | null>(null);
  const [stock, setStock] = useState<StockProposal | null>(null);

  const stateOf = (step: Step): StepState => {
    if (active === step) return error && step === active ? "ERROR" : "ACTIVE";
    if (staleFrom && step >= staleFrom && step <= doneThrough) return "STALE";
    if (step <= doneThrough) return "COMPLETE";
    return step === doneThrough + 1 ? "ACTIVE" : "LOCKED";
  };

  const invalidate = useCallback((from: Step) => {
    setCreatedOrder(null);
    setError("");
    if (from <= 2) { setFormula(null); setPrice(null); setStock(null); }
    else if (from === 3) { setPrice(null); setStock(null); }
    else if (from === 4) setStock(null);
    if (doneThrough >= from) setStaleFrom((current) => current == null ? from : Math.min(current, from) as Step);
  }, [doneThrough]);

  const complete = (step: Step) => {
    setError("");
    setDoneThrough((current) => Math.max(current, step));
    if (staleFrom && staleFrom <= step) setStaleFrom(step < 5 ? (step + 1) as Step : null);
    if (step < 5) setActive((step + 1) as Step);
  };

  const changeCustomerQuery = (value: string) => {
    setCustomer((current) => ({ ...current, customer: value, customerGroup: "", phone: "", installAddress: "" }));
    invalidate(1);
  };

  const selectCustomer = async (name: string) => {
    if (!name.trim()) return;
    setBusy("customer");
    try {
      const { doc } = await adapter.getDoc("Customer", name.trim());
      const group = String(doc.price_group ?? doc.customer_group ?? "").trim();
      setCustomer((current) => ({
        ...current,
        customer: name.trim(),
        customerGroup: group,
        phone: String(doc.phone ?? doc.mobile_no ?? ""),
        installAddress: String(doc.install_address ?? doc.address ?? ""),
      }));
      setError("");
    } catch (caught) {
      setError(adapter.mapError(caught).message);
    } finally {
      setBusy("");
    }
  };

  const checkCustomer = () => {
    if (!customer.customer.trim()) return setError("Cần chọn khách hàng."), false;
    if (!["Đại lý", "Lẻ"].includes(customer.customerGroup)) return setError("Hồ sơ khách chưa có Nhóm giá Đại lý/Lẻ."), false;
    if (!customer.priceList.trim()) return setError("Cần chọn Bảng giá. Đơn Alumdoor không cho phép bỏ trống bảng giá."), false;
    if (!customer.deliveryDate) return setError("Cần ngày giao dự kiến."), false;
    return true;
  };

  const calculateConfiguration = async () => {
    if (!door.itemCode.trim() || !positive(door.widthM) || !positive(door.heightM) || !Number.isInteger(Number(door.setCount)) || Number(door.setCount) <= 0) {
      setError("Cần mặt hàng, rộng, cao và số bộ hợp lệ."); return;
    }
    setBusy("formula"); setError("");
    try {
      const result = await adapter.callPost<FormulaResult>("alumdoor.sales.production_line_context", {
        item_code: door.itemCode.trim(), customer_group: customer.customerGroup, sales_mode: door.salesMode,
        ray_type: door.rayType, width_input_basis: door.widthBasis, height_input_basis: door.heightBasis,
        width_m: Number(door.widthM), height_m: Number(door.heightM), set_count: Number(door.setCount),
        has_butterfly_bracket: door.hasButterflyBracket, leaf_variant: door.leafVariant || undefined,
        color: door.color || undefined, delivery_date: customer.deliveryDate,
      });
      if (result.leaf_error) throw new Error(result.leaf_error);
      setFormula(result); setPrice(null); setStock(null); complete(2);
    } catch (caught) { setError(adapter.mapError(caught).message); }
    finally { setBusy(""); }
  };

  const calculatePrice = async () => {
    if (!formula) { setError("Cần tính cấu hình trước."); return; }
    if (!customer.priceList.trim()) { setError("Cần chọn Bảng giá trước khi tính giá."); return; }
    setBusy("price"); setError("");
    try {
      const result = await adapter.callPost<PriceResult>("alumdoor.sales.item_context", {
        item_code: door.itemCode.trim(), uom: "m2", price_list: customer.priceList,
        currency: "VND", warehouse: door.warehouse || undefined,
      });
      if (result.price_missing || result.rate == null) throw new Error(result.price_error || "Chưa có đơn giá bán.");
      setPrice(result); complete(3);
    } catch (caught) { setError(adapter.mapError(caught).message); }
    finally { setBusy(""); }
  };

  const checkStock = async () => {
    if (!formula || !door.warehouse) { setError("Cần chọn kho và tính cấu hình trước."); return; }
    const stockProfile = String(formula.stock_profile_item ?? "").trim();
    if (!stockProfile) { setError(formula.stock_profile_error || "BOM chưa xác định được mã nhôm nguyên liệu để kiểm tra lô."); return; }
    const sheets = Number(formula.total_leaf_count);
    const cutWidth = Number(formula.cut_width_m);
    if (!Number.isInteger(sheets) || sheets <= 0 || !Number.isFinite(cutWidth) || cutWidth <= 0) {
      setError("Tổng nhu cầu lá chưa phải số nguyên hoặc rộng cắt chưa hợp lệ; không được tự làm tròn khi kiểm tra tồn."); return;
    }
    setBusy("stock"); setError("");
    try {
      const result = await adapter.callPost<StockProposal>("alumdoor.cut.propose", {
        item_code: stockProfile, warehouse: door.warehouse, color: door.color || undefined,
        colour: door.color || undefined, cut_width_m: cutWidth, sheets,
      });
      setStock(result); complete(4);
    } catch (caught) {
      setStock(null); setError(adapter.mapError(caught).message);
    } finally { setBusy(""); }
  };

  const total = useMemo(() => Number(formula?.billable_area_sqm ?? 0) * Number(price?.rate ?? 0), [formula, price]);

  const submitOrder = async (draftOnly: boolean) => {
    if (!formula || !price || !stock || !checkCustomer()) { setError("Cần hoàn tất đủ cấu hình, giá và kiểm tra kho trước khi tạo đơn."); return; }
    setBusy(draftOnly ? "draft" : "submit"); setError("");
    try {
      const width = Number(formula.cover_width_m ?? formula.measured_width_m ?? door.widthM);
      const height = Number(formula.cover_height_m ?? door.heightM);
      const qty = Number(formula.billable_area_sqm);
      const rate = Number(price.rate);
      const line = {
        row_id: "WIZARD-1",
        item_code: door.itemCode.trim(),
        color: door.color || undefined,
        width_m: width,
        height_m: height,
        set_count: Number(door.setCount),
        sales_mode: door.salesMode,
        has_butterfly_bracket: door.hasButterflyBracket ? 1 : 0,
        formula_policy: formula.policy_name,
        formula_version: formula.formula_version,
        width_basis: formula.width_basis,
        cut_width_m: formula.cut_width_m,
        billable_area_sqm: qty,
        uom: price.selected_uom || "m2",
        qty,
        rate,
        motor_model: door.motorModel || undefined,
        accessories: door.accessories || undefined,
        warehouse: door.warehouse || undefined,
      };
      const created = await adapter.createDoc("Sales Order", {
        customer: customer.customer,
        company: "ALUMDOOR",
        currency: "VND",
        transaction_date: today(),
        delivery_date: customer.deliveryDate,
        selling_price_list: customer.priceList,
        customer_group: customer.customerGroup,
        install_address: customer.installAddress || undefined,
        items: [line],
      });
      const finalDoc = draftOnly ? created : await adapter.submit(created);
      setCreatedOrder(finalDoc); complete(5);
      toast.success(draftOnly ? `Đã lưu nháp ${finalDoc.name}.` : `Đã xác nhận đơn ${finalDoc.name}.`);
    } catch (caught) { setError(adapter.mapError(caught).message); }
    finally { setBusy(""); }
  };

  const customerSummary = customer.customer ? `${customer.customer} · ${customer.customerGroup || "chưa có nhóm"} · giao ${customer.deliveryDate || "—"}` : "Chưa chọn khách";
  const configSummary = formula ? `${door.itemCode} · ${fmt(formula.cover_width_m ?? formula.measured_width_m)} × ${fmt(formula.cover_height_m)} m · ${fmt(formula.leaf_count, 1)} lá/bộ${Number(door.setCount) > 1 ? ` · tổng ${fmt(formula.total_leaf_count, 1)} lá` : ""}` : "Chưa tính cấu hình";
  const priceSummary = price && formula ? `${fmt(formula.billable_area_sqm)} m² · ${money(price.rate)}/m² · ${money(total)}` : "Chưa tính giá";
  const stockSummary = stock ? `${formula?.stock_profile_item ?? "Nhôm"} · đủ ${fmt(formula?.total_leaf_count, 1)} lá · ${(stock.picks ?? []).length} lô` : "Chưa kiểm tra lô nhôm";
  const confirmSummary = createdOrder ? `${createdOrder.name} · ${Number(createdOrder.docstatus ?? 0) === 1 ? "Đã xác nhận" : "Nháp"}` : `Tổng ${money(total)}`;

  return <div className="h-full overflow-auto bg-muted/20 p-3 sm:p-5">
    <div className="mx-auto w-full max-w-5xl space-y-3">
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2"><ShoppingCart className="size-5 text-primary" /><h1 className="text-xl font-semibold">Bán hàng</h1></div>
          <p className="mt-1 text-sm text-muted-foreground">Nhập theo cách khách nói; hệ thống tự tính kỹ thuật, giá và khả năng đáp ứng trước khi xác nhận đơn.</p>
        </div>
        <Button variant="outline" onClick={() => navigate(`/app/${encodeURIComponent("Sales Order")}`)}>Danh sách đơn hàng</Button>
      </header>

      <WizardSection number={1} title="Khách hàng" state={stateOf(1)} active={active === 1} summary={customerSummary} onOpen={() => setActive(1)}>
        <div className="grid gap-4 md:grid-cols-2">
          <LinkPicker label="Khách hàng" doctype="Customer" value={customer.customer} onChange={changeCustomerQuery} onSelect={(value) => void selectCustomer(value)} required />
          <div className="space-y-1.5"><Label>Nhóm giá</Label><Input value={customer.customerGroup} readOnly placeholder="Lấy từ hồ sơ khách" /></div>
          <div className="space-y-1.5"><Label>Số điện thoại</Label><Input value={customer.phone} onChange={(e) => setCustomer((s) => ({ ...s, phone: e.target.value }))} /></div>
          <div className="space-y-1.5"><Label>Ngày giao dự kiến *</Label><Input type="date" value={customer.deliveryDate} onChange={(e) => { setCustomer((s) => ({ ...s, deliveryDate: e.target.value })); invalidate(1); }} /></div>
          <LinkPicker label="Bảng giá" doctype="Price List" value={customer.priceList} onChange={(value) => { setCustomer((s) => ({ ...s, priceList: value })); invalidate(3); }} required placeholder="Chọn bảng giá bán" />
          <div className="space-y-1.5 md:col-span-2"><Label>Địa chỉ giao / lắp</Label><Input value={customer.installAddress} onChange={(e) => setCustomer((s) => ({ ...s, installAddress: e.target.value }))} /></div>
        </div>
        <div className="mt-4 flex justify-end"><Button onClick={() => { if (checkCustomer()) complete(1); }}>Tiếp tục</Button></div>
      </WizardSection>

      <WizardSection number={2} title="Cấu hình cửa" state={stateOf(2)} active={active === 2} summary={configSummary} onOpen={() => { if (doneThrough >= 1) setActive(2); }}>
        <div className="grid gap-4 md:grid-cols-3">
          <LinkPicker label="Mặt hàng cửa" doctype="Item" value={door.itemCode} onChange={(value) => { setDoor((s) => ({ ...s, itemCode: value })); invalidate(2); }} required />
          <LinkPicker label="Màu" doctype="Item Color" value={door.color} onChange={(value) => { setDoor((s) => ({ ...s, color: value })); invalidate(2); }} />
          <LinkPicker label="Kho kiểm tra" doctype="Warehouse" value={door.warehouse} onChange={(value) => { setDoor((s) => ({ ...s, warehouse: value })); invalidate(4); }} required />
          <div className="space-y-1.5"><Label>Loại ray *</Label><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={door.rayType} onChange={(e) => { setDoor((s) => ({ ...s, rayType: e.target.value as DoorState["rayType"] })); invalidate(2); }}>{["U75","U100","Ray sắt U70","Không dùng ray"].map((v) => <option key={v}>{v}</option>)}</select></div>
          <div className="space-y-1.5"><Label>Cách bán</Label><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={door.salesMode} onChange={(e) => { setDoor((s) => ({ ...s, salesMode: e.target.value as DoorState["salesMode"] })); invalidate(2); }}><option>Trọn bộ</option><option>Tách món</option></select></div>
          <div className="space-y-1.5"><Label>Số bộ *</Label><Input type="number" min="1" step="1" value={door.setCount} onChange={(e) => { setDoor((s) => ({ ...s, setCount: e.target.value })); invalidate(2); }} /></div>
          <div className="space-y-1.5"><Label>Kiểu đo rộng</Label><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={door.widthBasis} onChange={(e) => { setDoor((s) => ({ ...s, widthBasis: e.target.value as DoorState["widthBasis"] })); invalidate(2); }}><option>Rộng lọt lòng</option><option>Rộng phủ bì</option></select></div>
          <div className="space-y-1.5"><Label>{door.widthBasis} (m) *</Label><Input type="number" step="0.001" value={door.widthM} onChange={(e) => { setDoor((s) => ({ ...s, widthM: e.target.value })); invalidate(2); }} placeholder="4.000" /></div>
          <div className="space-y-1.5"><Label>Kiểu đo cao</Label><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={door.heightBasis} onChange={(e) => { setDoor((s) => ({ ...s, heightBasis: e.target.value as DoorState["heightBasis"] })); invalidate(2); }}><option>Cao lọt lòng</option><option>Cao phủ bì</option></select></div>
          <div className="space-y-1.5"><Label>{door.heightBasis} (m) *</Label><Input type="number" step="0.001" value={door.heightM} onChange={(e) => { setDoor((s) => ({ ...s, heightM: e.target.value })); invalidate(2); }} placeholder="2.300" /></div>
          <div className="space-y-1.5"><Label>Biến thể chia lá / motor</Label><Input value={door.leafVariant} onChange={(e) => { setDoor((s) => ({ ...s, leafVariant: e.target.value })); invalidate(2); }} placeholder="Chỉ nhập khi công thức yêu cầu" /></div>
          <LinkPicker label="Mô tơ kèm theo" doctype="Item" value={door.motorModel} onChange={(value) => setDoor((s) => ({ ...s, motorModel: value }))} />
          <div className="space-y-1.5 md:col-span-2"><Label>Phụ kiện</Label><Input value={door.accessories} onChange={(e) => setDoor((s) => ({ ...s, accessories: e.target.value }))} /></div>
          <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm"><input type="checkbox" checked={door.hasButterflyBracket} onChange={(e) => { setDoor((s) => ({ ...s, hasButterflyBracket: e.target.checked })); invalidate(2); }} /> Có bản bướm</label>
        </div>
        {formula ? <>
          <div className="mt-4 grid gap-2 rounded-lg border bg-muted/20 p-3 sm:grid-cols-4">
            <div><span className="text-xs text-muted-foreground">Rộng phủ bì</span><strong className="block">{fmt(formula.cover_width_m ?? formula.measured_width_m)} m</strong></div>
            <div><span className="text-xs text-muted-foreground">Cao phủ bì</span><strong className="block">{fmt(formula.cover_height_m)} m</strong></div>
            <div><span className="text-xs text-muted-foreground">Rộng cắt lá</span><strong className="block">{fmt(formula.cut_width_m)} m</strong></div>
            <div><span className="text-xs text-muted-foreground">Số lá / bộ</span><strong className="block">{fmt(formula.leaf_count, 1)}</strong>{Number(door.setCount) > 1 ? <span className="text-xs text-muted-foreground">Tổng {fmt(formula.total_leaf_count, 1)} lá / {door.setCount} bộ</span> : null}</div>
          </div>
          {formula.stock_profile_error ? <div className="mt-2 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-700 dark:text-amber-300"><TriangleAlert className="mt-0.5 size-4 shrink-0" />{formula.stock_profile_error}</div> : formula.stock_profile_item ? <p className="mt-2 text-xs text-muted-foreground">BOM {formula.bom_no ?? "—"} → nhôm kiểm tra lô: <strong>{formula.stock_profile_item}</strong></p> : null}
        </> : null}
        <div className="mt-4 flex justify-end"><Button onClick={() => void calculateConfiguration()} disabled={busy === "formula"}>{busy === "formula" ? <Loader2 className="size-4 animate-spin" /> : null} Tính & tiếp tục</Button></div>
      </WizardSection>

      <WizardSection number={3} title="Giá bán" state={stateOf(3)} active={active === 3} summary={priceSummary} onOpen={() => { if (doneThrough >= 2) setActive(3); }}>
        {formula ? <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border p-3"><span className="text-xs text-muted-foreground">Diện tích tính giá</span><strong className="mt-1 block text-lg">{fmt(formula.billable_area_sqm)} m²</strong></div>
          <div className="rounded-lg border p-3"><span className="text-xs text-muted-foreground">Đơn giá server</span><strong className="mt-1 block text-lg">{price?.rate != null ? `${money(price.rate)}/m²` : "Chưa tra"}</strong></div>
          <div className="rounded-lg border p-3"><span className="text-xs text-muted-foreground">Thành tiền dự kiến</span><strong className="mt-1 block text-lg text-primary">{price ? money(total) : "—"}</strong></div>
        </div> : <p className="text-sm text-muted-foreground">Chưa có cấu hình.</p>}
        {price?.availability_status ? <p className="mt-3 text-sm text-muted-foreground">{price.availability_status}</p> : null}
        <p className="mt-2 text-xs text-muted-foreground">Đây là preview. Khi lưu/xác nhận, Sales Order controller tra lại Item Price/Pricing Rule và ghi đè giá phía client.</p>
        <div className="mt-4 flex justify-end"><Button onClick={() => void calculatePrice()} disabled={busy === "price"}>{busy === "price" ? <Loader2 className="size-4 animate-spin" /> : null} Kiểm tra giá & tiếp tục</Button></div>
      </WizardSection>

      <WizardSection number={4} title="Khả năng đáp ứng kho" state={stateOf(4)} active={active === 4} summary={stockSummary} onOpen={() => { if (doneThrough >= 3) setActive(4); }}>
        {stock ? <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4">
          <div className="flex items-center gap-2 font-semibold text-emerald-700 dark:text-emerald-300"><PackageCheck className="size-5" /> Đủ lô nhôm theo khổ cần cắt</div>
          <p className="mt-1 text-sm text-muted-foreground">Mã nhôm {formula?.stock_profile_item} · cần {fmt(formula?.total_leaf_count, 1)} lá cho {door.setCount} bộ · khổ tối thiểu {fmt(formula?.cut_width_m)} m · {(stock.picks ?? []).length} lô được đề xuất.</p>
          {(stock.picks ?? []).length ? <div className="mt-3 grid gap-2 sm:grid-cols-2">{(stock.picks ?? []).slice(0, 6).map((pick, index) => <div key={index} className="rounded border bg-background px-3 py-2 text-xs"><strong>{String(pick.batch_no ?? pick.name ?? pick.lot ?? `Lô ${index + 1}`)}</strong><div className="mt-1 text-muted-foreground">{Object.entries(pick).slice(0, 4).map(([k,v]) => `${k}: ${String(v)}`).join(" · ")}</div></div>)}</div> : null}
        </div> : formula?.stock_profile_error ? <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-amber-700 dark:text-amber-300">{formula.stock_profile_error}</div> : <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Hệ thống lấy mã nhôm từ BOM hiệu lực rồi hỏi engine chọn lô theo mã · màu · kho · rộng cắt · tổng số lá. Không dùng tồn tổng hoặc mã thành phẩm để kết luận.</div>}
        <div className="mt-4 flex justify-end"><Button onClick={() => void checkStock()} disabled={busy === "stock"}>{busy === "stock" ? <Loader2 className="size-4 animate-spin" /> : null} Kiểm tra lô & tiếp tục</Button></div>
      </WizardSection>

      <WizardSection number={5} title="Xác nhận đơn" state={stateOf(5)} active={active === 5} summary={confirmSummary} onOpen={() => { if (doneThrough >= 4) setActive(5); }}>
        {createdOrder ? <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4"><div className="flex items-center gap-2 font-semibold"><Check className="size-5 text-emerald-600" /> {createdOrder.name}</div><p className="mt-1 text-sm text-muted-foreground">{Number(createdOrder.docstatus ?? 0) === 1 ? "Đơn đã được xác nhận." : "Đơn đang ở trạng thái nháp."}</p><Button className="mt-3" variant="outline" onClick={() => navigate(`/app/${encodeURIComponent("Sales Order")}/${encodeURIComponent(String(createdOrder.name))}`)}>Mở đơn hàng</Button></div> : <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-lg border p-4"><span className="text-xs text-muted-foreground">Khách hàng</span><strong className="block">{customer.customer}</strong><div className="mt-2 text-sm text-muted-foreground">{customer.installAddress || "Chưa nhập địa chỉ"}<br />Giao dự kiến: {customer.deliveryDate}</div></div>
          <div className="rounded-lg border p-4"><span className="text-xs text-muted-foreground">Đơn hàng</span><strong className="block">{door.itemCode} · {door.setCount} bộ</strong><div className="mt-2 text-sm text-muted-foreground">{fmt(formula?.billable_area_sqm)} m² · {fmt(formula?.leaf_count, 1)} lá/bộ · tổng {fmt(formula?.total_leaf_count, 1)} lá<br />Kho: đủ · Tổng dự kiến: {money(total)}</div></div>
        </div>}
        {!createdOrder ? <div className="mt-4 flex flex-wrap justify-end gap-2"><Button variant="outline" onClick={() => void submitOrder(true)} disabled={Boolean(busy)}>{busy === "draft" ? <Loader2 className="size-4 animate-spin" /> : null} Lưu nháp</Button><Button onClick={() => void submitOrder(false)} disabled={Boolean(busy)}>{busy === "submit" ? <Loader2 className="size-4 animate-spin" /> : null} Xác nhận đơn</Button></div> : null}
      </WizardSection>

      {error ? <div className="sticky bottom-3 z-20 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive shadow-lg"><TriangleAlert className="mt-0.5 size-4 shrink-0" /><span>{error}</span></div> : null}
      <div className="pb-8 text-center text-xs text-muted-foreground">Công thức, giá và chọn lô được tính ở server; wizard chỉ điều phối và hiển thị kết quả.</div>
    </div>
  </div>;
}
