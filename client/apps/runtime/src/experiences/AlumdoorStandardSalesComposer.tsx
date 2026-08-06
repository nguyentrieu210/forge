import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, Loader2, Printer, Search, Trash2, TriangleAlert } from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { Doc, DocField, LinkResult } from "@metaforge/core";
import { useMetaForge } from "@metaforge/views/provider";
import { Button, Input, Label, toast } from "@metaforge/ui";

type Json = Record<string, unknown>;

type CustomerState = {
  name: string;
  group: string;
  phone: string;
  address: string;
  priceList: string;
};

type DoorPolicyRow = {
  item_group?: unknown;
  door_type?: unknown;
  disabled?: unknown;
};

type ItemCandidate = {
  code: string;
  label: string;
  group: string;
};

type ItemContext = {
  item_code?: string;
  item_group?: string;
  door_type?: string | null;
  selected_uom?: string;
  managed_stock?: boolean;
  available_qty?: number | null;
  rate?: number | null;
  currency?: string;
  price_missing?: boolean;
  price_error?: string | null;
  stock_read_error?: string | null;
};

type SaleLine = {
  id: string;
  itemCode: string;
  label: string;
  itemGroup: string;
  uom: string;
  qty: string;
  rate: number | null;
  currency: string;
  managedStock: boolean;
  stockQty: number | null;
  priceError: string;
  stockError: string;
  busy: boolean;
};

const today = () => {
  const value = new Date();
  return new Date(value.valueOf() - value.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
};

const checked = (value: unknown) => value === true || value === 1 || value === "1" || String(value ?? "").trim().toLocaleLowerCase("vi") === "true";
const positive = (value: unknown) => Number.isFinite(Number(value)) && Number(value) > 0;
const percentValid = (value: string) => Number.isFinite(Number(value)) && Number(value) >= 0 && Number(value) <= 100;
const money = (value: unknown, currency = "VND") => new Intl.NumberFormat("vi-VN", {
  style: "currency",
  currency: currency || "VND",
  maximumFractionDigits: 0,
}).format(Number(value) || 0);
const number = (value: unknown, digits = 3) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed.toLocaleString("vi-VN", { maximumFractionDigits: digits }) : "—";
};

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
    fieldname: `standard_sales_${doctype.replaceAll(" ", "_").toLocaleLowerCase("vi")}`,
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

function stockLabel(line: SaleLine) {
  if (!line.managedStock) return "Không QL";
  if (line.stockError) return "Lỗi đọc tồn";
  return line.stockQty == null ? "—" : number(line.stockQty);
}

export function AlumdoorStandardSalesComposer() {
  const { adapter, businessContext } = useMetaForge();
  const navigate = useNavigate();
  const contextCompany = String(businessContext.company ?? "").trim();
  const contextWarehouse = String(businessContext.warehouse ?? "").trim();
  const [company, setCompany] = useState(contextCompany);
  const [warehouse, setWarehouse] = useState(contextWarehouse);
  const [currency, setCurrency] = useState("");
  const [deliveryDate, setDeliveryDate] = useState(today());
  const [customer, setCustomer] = useState<CustomerState>({ name: "", group: "", phone: "", address: "", priceList: "" });
  const [doorItemGroups, setDoorItemGroups] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<ItemCandidate[]>([]);
  const [searchBusy, setSearchBusy] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [lines, setLines] = useState<SaleLine[]>([]);
  const [discountPct, setDiscountPct] = useState("0");
  const [taxPct, setTaxPct] = useState("0");
  const [taxAccount, setTaxAccount] = useState("");
  const [taxAccountError, setTaxAccountError] = useState("");
  const [saving, setSaving] = useState<"" | "draft" | "submit">("");
  const [printing, setPrinting] = useState(false);
  const [globalError, setGlobalError] = useState("");
  const [createdOrder, setCreatedOrder] = useState<Doc | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const refreshGeneration = useRef(0);

  const submitted = Boolean(createdOrder && Number(createdOrder.docstatus ?? 0) === 1);

  useEffect(() => { if (contextCompany) setCompany(contextCompany); }, [contextCompany]);
  useEffect(() => { if (contextWarehouse) setWarehouse(contextWarehouse); }, [contextWarehouse]);

  useEffect(() => {
    if (!company) { setCurrency(""); return; }
    let active = true;
    void adapter.getDoc("Company", company).then(({ doc }) => {
      if (active) setCurrency(String(doc.default_currency ?? "").trim());
    }).catch((error) => {
      if (active) setGlobalError(adapter.mapError(error).message);
    });
    return () => { active = false; };
  }, [adapter, company]);

  useEffect(() => {
    let active = true;
    void adapter.getList("Cutting Policy", {
      fields: ["item_group", "door_type", "disabled"],
      filters: [["disabled", "=", 0]],
      pageLength: 500,
    }).then((rows) => {
      if (!active) return;
      setDoorItemGroups(new Set(rows
        .filter((row) => !checked(row.disabled))
        .map((row) => String(row.item_group ?? "").trim())
        .filter(Boolean)));
    }).catch(() => {
      if (active) setDoorItemGroups(new Set());
    });
    return () => { active = false; };
  }, [adapter]);

  useEffect(() => {
    const name = customer.name.trim();
    if (!name) {
      setCustomer({ name: "", group: "", phone: "", address: "", priceList: "" });
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
        priceList: String(doc.default_price_list ?? "").trim(),
      }));
      setGlobalError("");
    }).catch((error) => {
      if (active) setGlobalError(adapter.mapError(error).message);
    });
    return () => { active = false; };
  }, [adapter, customer.name]);

  useEffect(() => {
    if (!company) { setTaxAccount(""); setTaxAccountError(""); return; }
    let active = true;
    void adapter.getList("Account", {
      fields: ["name", "account_type", "root_type", "company", "is_group"],
      filters: [
        ["company", "=", company],
        ["account_type", "=", "Tax"],
        ["root_type", "=", "Liability"],
        ["is_group", "=", 0],
      ],
      orderBy: "name asc",
      pageLength: 20,
    }).then((rows) => {
      if (!active) return;
      if (rows.length === 1) {
        setTaxAccount(String(rows[0]?.name ?? "").trim());
        setTaxAccountError("");
      } else {
        setTaxAccount("");
        setTaxAccountError(rows.length === 0
          ? "Chưa cấu hình tài khoản thuế đầu ra (Account loại Tax / Liability) cho Công ty."
          : "Có nhiều tài khoản Tax / Liability; cần cấu hình còn một tài khoản thuế đầu ra duy nhất cho luồng bán nhanh.");
      }
    }).catch((error) => {
      if (!active) return;
      setTaxAccount("");
      setTaxAccountError(`Không đọc được cấu hình tài khoản thuế: ${adapter.mapError(error).message}`);
    });
    return () => { active = false; };
  }, [adapter, company]);

  useEffect(() => {
    const text = query.trim();
    if (!text || !customer.name || submitted) {
      setSuggestions([]);
      setSearchBusy(false);
      setSearchError("");
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setSearchBusy(true);
      setSearchError("");
      void adapter.searchLink("Item", text, {
        filters: [["Item", "disabled", "=", 0], ["Item", "is_sales_item", "=", 1]],
        referenceDoctype: "Sales Order",
        pageLength: 20,
        signal: controller.signal,
      }).then(async (results: LinkResult[]) => {
        const hydrated = await Promise.all(results.map(async (result) => {
          try {
            const { doc } = await adapter.getDoc("Item", result.value);
            const doorType = String(doc.door_type ?? "").trim();
            const itemGroup = String(doc.item_group ?? "").trim();
            const isDoorConfiguratorItem = Boolean(doorType) || (itemGroup ? doorItemGroups.has(itemGroup) : false);
            if (isDoorConfiguratorItem || checked(doc.disabled) || doc.is_sales_item === 0 || doc.is_sales_item === false) return null;
            return {
              code: result.value,
              label: String(doc.item_name ?? result.label ?? result.description ?? result.value).trim() || result.value,
              group: itemGroup,
            } satisfies ItemCandidate;
          } catch {
            return null;
          }
        }));
        if (controller.signal.aborted) return;
        const visible = hydrated.filter((entry): entry is ItemCandidate => Boolean(entry));
        setSuggestions(visible);
        setSearchError(visible.length ? "" : "Không có hàng hóa / phụ kiện phù hợp. Mặt hàng cửa phải bán ở chế độ Cửa nhôm theo kích thước.");
      }).catch((error) => {
        if (!controller.signal.aborted) {
          setSuggestions([]);
          setSearchError(adapter.mapError(error).message);
        }
      }).finally(() => {
        if (!controller.signal.aborted) setSearchBusy(false);
      });
    }, 250);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [adapter, customer.name, doorItemGroups, query, submitted]);

  const lineKey = useMemo(() => lines.map((line) => `${line.id}:${line.itemCode}`).join("|"), [lines]);

  useEffect(() => {
    if (!lineKey || !customer.priceList || !currency) return;
    const generation = ++refreshGeneration.current;
    const snapshot = lines.map((line) => ({ id: line.id, itemCode: line.itemCode }));
    setLines((current) => current.map((line) => ({ ...line, busy: true, priceError: "", stockError: "" })));
    void Promise.all(snapshot.map(async (line) => {
      try {
        const context = await adapter.callPost<ItemContext>("alumdoor.sales.item_context", {
          item_code: line.itemCode,
          price_list: customer.priceList,
          currency,
          ...(warehouse ? { warehouse } : {}),
        });
        return { id: line.id, context, error: "" };
      } catch (error) {
        return { id: line.id, context: null, error: adapter.mapError(error).message };
      }
    })).then((results) => {
      if (generation !== refreshGeneration.current) return;
      const byId = new Map(results.map((entry) => [entry.id, entry]));
      setLines((current) => current.map((line) => {
        const result = byId.get(line.id);
        if (!result) return line;
        if (!result.context) return { ...line, busy: false, rate: null, stockQty: null, priceError: result.error };
        const context = result.context;
        return {
          ...line,
          itemGroup: String(context.item_group ?? line.itemGroup),
          uom: String(context.selected_uom ?? "").trim(),
          rate: context.price_missing || context.rate == null ? null : Number(context.rate),
          currency: String(context.currency ?? currency).trim() || currency,
          managedStock: context.managed_stock !== false,
          stockQty: context.available_qty == null ? null : Number(context.available_qty),
          priceError: context.price_missing || context.rate == null ? String(context.price_error ?? "Chưa có đơn giá bán.") : "",
          stockError: String(context.stock_read_error ?? ""),
          busy: false,
        };
      }));
    });
    // lineKey deliberately tracks row identity/item only; quantity edits must not re-read price/stock.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adapter, customer.priceList, currency, lineKey, warehouse]);

  const gross = useMemo(() => lines.reduce((sum, line) => sum + (Number(line.qty) || 0) * Number(line.rate ?? 0), 0), [lines]);
  const discountRate = percentValid(discountPct) ? Number(discountPct) : 0;
  const taxRate = percentValid(taxPct) ? Number(taxPct) : 0;
  const discountAmount = gross * discountRate / 100;
  const afterDiscount = Math.max(0, gross - discountAmount);
  const taxAmount = afterDiscount * taxRate / 100;
  const grandTotal = afterDiscount + taxAmount;

  const addCandidate = (candidate: ItemCandidate) => {
    if (!customer.name) { setGlobalError("Cần chọn Khách hàng trước khi thêm hàng."); return; }
    if (!customer.priceList) { setGlobalError("Khách hàng chưa có Bảng giá mặc định; hãy cấu hình trong hồ sơ Khách hàng trước khi bán."); return; }
    setGlobalError("");
    setLines((current) => {
      const existing = current.findIndex((line) => line.itemCode === candidate.code);
      if (existing >= 0) return current.map((line, index) => index === existing ? { ...line, qty: String((Number(line.qty) || 0) + 1) } : line);
      return [...current, {
        id: `standard-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        itemCode: candidate.code,
        label: candidate.label,
        itemGroup: candidate.group,
        uom: "",
        qty: "1",
        rate: null,
        currency,
        managedStock: true,
        stockQty: null,
        priceError: "",
        stockError: "",
        busy: true,
      }];
    });
    setQuery("");
    setSuggestions([]);
    window.setTimeout(() => searchInputRef.current?.focus(), 0);
  };

  const draftBlockers = useMemo(() => {
    const out: string[] = [];
    if (!company) out.push("Cần chọn Công ty.");
    if (!currency) out.push("Công ty chưa có tiền tệ mặc định.");
    if (!customer.name) out.push("Cần chọn Khách hàng.");
    if (customer.name && !customer.priceList) out.push("Khách hàng chưa có Bảng giá mặc định.");
    if (!warehouse) out.push("Cần chọn Kho bán.");
    if (!deliveryDate) out.push("Cần ngày giao dự kiến.");
    if (deliveryDate && deliveryDate < today()) out.push("Ngày giao không được ở quá khứ.");
    if (!lines.length) out.push("Cần ít nhất một mặt hàng.");
    if (!percentValid(discountPct)) out.push("Chiết khấu phải từ 0 đến 100%.");
    if (!percentValid(taxPct)) out.push("Thuế phải từ 0 đến 100%.");
    if (taxRate > 0 && !taxAccount) out.push(taxAccountError || "Chưa xác định được tài khoản thuế đầu ra.");
    for (const [index, line] of lines.entries()) {
      if (!positive(line.qty)) out.push(`Dòng ${index + 1}: số lượng phải lớn hơn 0.`);
      if (line.busy) out.push(`Dòng ${index + 1}: đang đọc giá / tồn kho.`);
      if (line.priceError || line.rate == null) out.push(`Dòng ${index + 1}: ${line.priceError || "chưa có đơn giá"}`);
      if (!line.uom) out.push(`Dòng ${index + 1}: chưa xác định ĐVT bán.`);
    }
    return out;
  }, [company, currency, customer.name, customer.priceList, deliveryDate, discountPct, lines, taxAccount, taxAccountError, taxPct, taxRate, warehouse]);

  const submitBlockers = useMemo(() => {
    const out = [...draftBlockers];
    for (const [index, line] of lines.entries()) {
      if (line.managedStock && line.stockError) out.push(`Dòng ${index + 1}: ${line.stockError}`);
      if (line.managedStock && line.stockQty == null) out.push(`Dòng ${index + 1}: chưa đọc được tồn kho.`);
      if (line.managedStock && line.stockQty != null && Number(line.qty) > line.stockQty) {
        out.push(`Dòng ${index + 1}: tồn kho ${number(line.stockQty)} ${line.uom}, không đủ bán ${number(line.qty)} ${line.uom}.`);
      }
    }
    return out;
  }, [draftBlockers, lines]);

  const buildOrder = (existingDraft: Doc | null): Partial<Doc> => ({
    customer: customer.name,
    company,
    currency,
    transaction_date: String(existingDraft?.transaction_date ?? today()),
    delivery_date: deliveryDate,
    selling_price_list: customer.priceList,
    ...(customer.group ? { customer_group: customer.group } : {}),
    ...(customer.address ? { install_address: customer.address } : {}),
    additional_discount_percentage: discountRate,
    items: lines.map((line, index) => ({
      row_id: `STANDARD-${index + 1}`,
      item_code: line.itemCode,
      uom: line.uom,
      qty: Number(line.qty),
      rate: Number(line.rate ?? 0),
      warehouse,
    })),
    taxes: taxRate > 0 ? [{
      row_id: "VAT-1",
      account: taxAccount,
      rate: taxRate,
      charge_type: "On Net Total",
      add_deduct_tax: "Add",
      included_in_print_rate: false,
    }] : [],
  });

  const saveOrder = async (draftOnly: boolean) => {
    setGlobalError("");
    const blockers = draftOnly ? draftBlockers : submitBlockers;
    if (blockers.length) { setGlobalError(blockers[0]!); return; }
    if (submitted) { setGlobalError(`Đơn ${createdOrder?.name} đã xác nhận. Hãy tạo đơn mới.`); return; }
    setSaving(draftOnly ? "draft" : "submit");
    try {
      const existingDraft = createdOrder && Number(createdOrder.docstatus ?? 0) === 0 ? createdOrder : null;
      const payload = buildOrder(existingDraft);
      const saved = existingDraft
        ? await adapter.updateDoc("Sales Order", String(existingDraft.name), payload, String(existingDraft.modified ?? ""))
        : await adapter.createDoc("Sales Order", payload);
      setCreatedOrder(saved);
      if (draftOnly) {
        toast.success(existingDraft ? `Đã cập nhật nháp ${saved.name}.` : `Đã lưu nháp ${saved.name}.`);
        return;
      }
      const finalDoc = await adapter.submit(saved);
      setCreatedOrder(finalDoc);
      toast.success(`Đã xác nhận đơn ${finalDoc.name}.`);
    } catch (error) {
      setGlobalError(adapter.mapError(error).message);
    } finally {
      setSaving("");
    }
  };

  const printPdf = async () => {
    if (!createdOrder?.name) return;
    setPrinting(true);
    setGlobalError("");
    try {
      const blob = await adapter.downloadPdf("Sales Order", String(createdOrder.name));
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${createdOrder.name}.pdf`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      setGlobalError(adapter.mapError(error).message);
    } finally {
      setPrinting(false);
    }
  };

  const startNew = () => {
    setCreatedOrder(null);
    setCustomer({ name: "", group: "", phone: "", address: "", priceList: "" });
    setLines([]);
    setDiscountPct("0");
    setTaxPct("0");
    setDeliveryDate(today());
    setQuery("");
    setSuggestions([]);
    setGlobalError("");
    window.setTimeout(() => searchInputRef.current?.focus(), 0);
  };

  return <div className="h-full w-full overflow-auto bg-muted/20 p-3 md:p-4 xl:p-5">
    <div className="w-full space-y-3">
      <section className="grid gap-3 rounded-xl border bg-card p-3 md:grid-cols-2 xl:grid-cols-4">
        {!contextCompany ? <CanonicalLink label="Công ty" doctype="Company" value={company} onChange={setCompany} required readOnly={submitted} /> : null}
        <div className={contextCompany ? "md:col-span-1 xl:col-span-2" : ""}>
          <CanonicalLink label="Khách hàng" doctype="Customer" value={customer.name} onChange={(name) => setCustomer({ name, group: "", phone: "", address: "", priceList: "" })} required readOnly={submitted} />
          {customer.name ? <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {customer.group ? <span className="rounded-full border bg-muted/30 px-2 py-0.5 font-medium text-foreground">{customer.group}</span> : <span className="text-amber-700 dark:text-amber-300">Chưa phân loại khách</span>}
            {customer.phone ? <span>{customer.phone}</span> : null}
            {customer.priceList ? <span>Giá: {customer.priceList}</span> : <span className="text-destructive">Chưa có bảng giá</span>}
          </div> : null}
        </div>
        {contextWarehouse ? <div className="grid gap-1.5"><Label>Kho bán</Label><Input value={warehouse} readOnly /></div> : <CanonicalLink label="Kho bán" doctype="Warehouse" value={warehouse} onChange={setWarehouse} required readOnly={submitted} />}
        <div className="grid gap-1.5"><Label>Ngày giao *</Label><Input type="date" min={today()} value={deliveryDate} disabled={submitted} onChange={(event) => setDeliveryDate(event.target.value)} /></div>
      </section>

      <div className="grid min-w-0 gap-3 xl:grid-cols-[minmax(0,1fr)_330px]">
        <section className="min-w-0 overflow-hidden rounded-xl border bg-card">
          <div className="border-b p-3">
            <Label htmlFor="standard-item-search">Thêm hàng hóa / phụ kiện</Label>
            <div className="relative mt-1.5">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="standard-item-search"
                ref={searchInputRef}
                className="pl-9 pr-10"
                value={query}
                disabled={submitted || !customer.name}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={customer.name ? "Tìm mã hoặc tên hàng…" : "Chọn khách hàng trước khi thêm hàng"}
                autoComplete="off"
              />
              {searchBusy ? <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" /> : null}
              {query.trim() && !submitted ? <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-40 overflow-hidden rounded-lg border bg-popover shadow-lg">
                {suggestions.map((candidate) => <button
                  key={candidate.code}
                  type="button"
                  className="flex w-full items-start justify-between gap-3 border-b px-3 py-2.5 text-left last:border-b-0 hover:bg-muted/50"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => addCandidate(candidate)}
                >
                  <span className="min-w-0"><span className="block truncate text-sm font-medium">{candidate.label}</span><span className="block truncate text-xs text-muted-foreground">{candidate.code}{candidate.group ? ` · ${candidate.group}` : ""}</span></span>
                  <span className="shrink-0 text-xs font-medium text-primary">Thêm</span>
                </button>)}
                {!searchBusy && searchError ? <div className="px-3 py-3 text-sm text-muted-foreground">{searchError}</div> : null}
                {searchBusy && !suggestions.length ? <div className="px-3 py-3 text-sm text-muted-foreground">Đang tìm hàng…</div> : null}
              </div> : null}
            </div>
          </div>

          {!lines.length ? <div className="grid min-h-64 place-items-center p-6 text-center text-sm text-muted-foreground">
            Chưa có mặt hàng. Chọn khách rồi tìm hàng ở ô phía trên; chọn xong hệ thống tự thêm dòng và tự lấy ĐVT, giá, tồn kho.
          </div> : <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead className="bg-muted/35 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Hàng hóa</th>
                  <th className="px-3 py-2 font-medium">ĐVT</th>
                  <th className="px-3 py-2 text-right font-medium">Tồn kho</th>
                  <th className="w-28 px-3 py-2 text-right font-medium">SL</th>
                  <th className="px-3 py-2 text-right font-medium">Đơn giá</th>
                  <th className="px-3 py-2 text-right font-medium">Thành tiền</th>
                  <th className="w-12 px-2 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {lines.map((line, index) => {
                  const qty = Number(line.qty) || 0;
                  const amount = qty * Number(line.rate ?? 0);
                  const short = line.managedStock && line.stockQty != null && qty > line.stockQty;
                  return <tr key={line.id} className="align-top hover:bg-muted/15">
                    <td className="px-3 py-3">
                      <div className="font-medium">{line.label || line.itemCode}</div>
                      <div className="mt-0.5 text-xs text-muted-foreground">{line.itemCode}{line.itemGroup ? ` · ${line.itemGroup}` : ""}</div>
                      {line.priceError ? <div className="mt-1 text-xs text-destructive">{line.priceError}</div> : null}
                      {line.stockError ? <div className="mt-1 text-xs text-amber-700 dark:text-amber-300">{line.stockError}</div> : null}
                    </td>
                    <td className="px-3 py-3">{line.busy && !line.uom ? <Loader2 className="size-4 animate-spin text-muted-foreground" /> : line.uom || "—"}</td>
                    <td className={`px-3 py-3 text-right font-medium tabular-nums ${short ? "text-destructive" : ""}`}>
                      {line.busy && line.stockQty == null ? <span className="text-muted-foreground">…</span> : stockLabel(line)}
                      {short ? <div className="text-[11px] font-normal">Thiếu {number(qty - Number(line.stockQty ?? 0))}</div> : null}
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        className="h-9 text-right tabular-nums"
                        type="number"
                        min="0.000001"
                        step="any"
                        value={line.qty}
                        disabled={submitted}
                        onChange={(event) => setLines((current) => current.map((entry, i) => i === index ? { ...entry, qty: event.target.value } : entry))}
                      />
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">{line.busy && line.rate == null ? "…" : line.rate == null ? "—" : money(line.rate, line.currency || currency)}</td>
                    <td className="px-3 py-3 text-right font-semibold tabular-nums">{money(amount, line.currency || currency)}</td>
                    <td className="px-2 py-2 text-right"><Button type="button" variant="ghost" size="icon-sm" disabled={submitted} className="text-muted-foreground hover:text-destructive" aria-label={`Xóa ${line.itemCode}`} onClick={() => setLines((current) => current.filter((_, i) => i !== index))}><Trash2 /></Button></td>
                  </tr>;
                })}
              </tbody>
            </table>
          </div>}
        </section>

        <aside className="self-start rounded-xl border bg-card p-3 xl:sticky xl:top-3">
          <div className="text-sm font-semibold">Tóm tắt đơn</div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="grid gap-1.5"><Label>Chiết khấu (%)</Label><Input type="number" min="0" max="100" step="any" value={discountPct} disabled={submitted} onChange={(event) => setDiscountPct(event.target.value)} /></div>
            <div className="grid gap-1.5"><Label>Thuế (%)</Label><Input type="number" min="0" max="100" step="any" value={taxPct} disabled={submitted} onChange={(event) => setTaxPct(event.target.value)} /></div>
          </div>
          {taxRate > 0 && taxAccountError ? <div className="mt-2 flex gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-2 text-xs text-amber-700 dark:text-amber-300"><TriangleAlert className="mt-0.5 size-3.5 shrink-0" />{taxAccountError}</div> : null}

          <div className="mt-4 space-y-2 text-sm">
            <div className="flex items-center justify-between gap-3"><span className="text-muted-foreground">Tiền hàng</span><strong className="tabular-nums">{money(gross, currency || "VND")}</strong></div>
            <div className="flex items-center justify-between gap-3"><span className="text-muted-foreground">Chiết khấu {discountRate ? `${number(discountRate)}%` : ""}</span><span className="tabular-nums">-{money(discountAmount, currency || "VND")}</span></div>
            <div className="flex items-center justify-between gap-3"><span className="text-muted-foreground">Sau chiết khấu</span><span className="tabular-nums">{money(afterDiscount, currency || "VND")}</span></div>
            <div className="flex items-center justify-between gap-3"><span className="text-muted-foreground">Thuế {taxRate ? `${number(taxRate)}%` : ""}</span><span className="tabular-nums">{money(taxAmount, currency || "VND")}</span></div>
            <div className="border-t pt-2"><div className="flex items-end justify-between gap-3"><span className="font-semibold">Tổng thanh toán</span><span className="text-xl font-bold tabular-nums">{money(grandTotal, currency || "VND")}</span></div></div>
          </div>

          <div className="mt-4 rounded-lg border bg-muted/15 p-2.5 text-xs">
            {submitBlockers.length ? <div className="flex gap-2 text-amber-700 dark:text-amber-300"><TriangleAlert className="mt-0.5 size-4 shrink-0" /><span>{submitBlockers[0]}</span></div> : <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300"><CheckCircle2 className="size-4" />Đủ điều kiện xác nhận đơn.</div>}
          </div>

          <div className="mt-3 grid gap-2">
            {!submitted ? <>
              <Button type="button" variant="outline" disabled={Boolean(saving) || draftBlockers.length > 0} onClick={() => void saveOrder(true)}>{saving === "draft" ? <Loader2 className="size-4 animate-spin" /> : null}{createdOrder && Number(createdOrder.docstatus ?? 0) === 0 ? "Cập nhật nháp" : "Lưu nháp"}</Button>
              <Button type="button" disabled={Boolean(saving) || submitBlockers.length > 0} onClick={() => void saveOrder(false)}>{saving === "submit" ? <Loader2 className="size-4 animate-spin" /> : null}Xác nhận đơn</Button>
            </> : <>
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm text-emerald-800 dark:text-emerald-200"><strong>{createdOrder?.name}</strong><div className="mt-0.5 text-xs">Đã xác nhận · {money(createdOrder?.grand_total ?? grandTotal, String(createdOrder?.currency ?? currency || "VND"))}</div></div>
              <Button type="button" variant="outline" disabled={printing} onClick={() => void printPdf()}>{printing ? <Loader2 className="size-4 animate-spin" /> : <Printer />}In PDF</Button>
              <Button type="button" variant="outline" onClick={() => navigate(`/app/${encodeURIComponent("Sales Order")}/${encodeURIComponent(String(createdOrder?.name ?? ""))}`)}>Mở đơn</Button>
              <Button type="button" onClick={startNew}>Tạo đơn mới</Button>
            </>}
          </div>

          {createdOrder && !submitted ? <div className="mt-2 text-center text-[11px] text-muted-foreground">Đang làm việc trên nháp {createdOrder.name}; lưu lại sẽ cập nhật đúng nháp này.</div> : null}
        </aside>
      </div>

      {globalError ? <div className="rounded-lg border border-destructive/35 bg-destructive/5 px-3 py-2 text-sm text-destructive">{globalError}</div> : null}
    </div>
  </div>;
}
