/** @jsxImportSource react */
import { useCallback, useEffect, useMemo, useState } from "react";
import type { FrappeAdapter, MetaForgeBootDTO } from "@metaforge/adapter-frappe";
import { FrappeAdapterImpl } from "@metaforge/adapter-frappe";
import {
  ArrowLeft, Building2, CalendarRange, Check, CircleAlert, CircleCheck, Loader2,
  PackageCheck, RefreshCw, Ruler, Settings2, Warehouse,
} from "lucide-react";
import { AuthBoundary, I18nProvider, LoginForm } from "@metaforge/shell";
import {
  Badge, Button, Checkbox, Input, Label, Select, SelectContent, SelectItem, SelectTrigger,
  SelectValue, Separator, Toaster, toast,
} from "@metaforge/ui";

const adapter = new FrappeAdapterImpl({});
const DEFAULT_UOMS = ["Cái", "Chiếc", "Bộ", "Cây", "Mét", "m²", "Kg", "Tấn", "Thùng", "Hộp", "Lít"];
const DEFAULT_WAREHOUSES = ["Kho nguyên vật liệu", "Kho thành phẩm", "Kho hàng lỗi"];

const BASIC_ACCOUNTS = [
  { account_name: "Tài sản", account_number: "1", root_type: "Asset", is_group: 1 },
  { account_name: "Nợ phải trả", account_number: "2", root_type: "Liability", is_group: 1 },
  { account_name: "Vốn chủ sở hữu", account_number: "3", root_type: "Equity", is_group: 1 },
  { account_name: "Doanh thu", account_number: "5", root_type: "Income", is_group: 1 },
  { account_name: "Chi phí", account_number: "6", root_type: "Expense", is_group: 1 },
  { account_name: "111 - Tiền mặt", account_number: "111", root_type: "Asset", account_type: "Cash", parent_account: "Tài sản", is_group: 0 },
  { account_name: "112 - Tiền gửi ngân hàng", account_number: "112", root_type: "Asset", account_type: "Bank", parent_account: "Tài sản", is_group: 0 },
  { account_name: "131 - Phải thu khách hàng", account_number: "131", root_type: "Asset", account_type: "Receivable", parent_account: "Tài sản", is_group: 0 },
  { account_name: "152 - Nguyên vật liệu", account_number: "152", root_type: "Asset", parent_account: "Tài sản", is_group: 0 },
  { account_name: "155 - Thành phẩm", account_number: "155", root_type: "Asset", parent_account: "Tài sản", is_group: 0 },
  { account_name: "331 - Phải trả nhà cung cấp", account_number: "331", root_type: "Liability", account_type: "Payable", parent_account: "Nợ phải trả", is_group: 0 },
  { account_name: "511 - Doanh thu bán hàng", account_number: "511", root_type: "Income", parent_account: "Doanh thu", is_group: 0 },
  { account_name: "632 - Giá vốn hàng bán", account_number: "632", root_type: "Expense", parent_account: "Chi phí", is_group: 0 },
  { account_name: "642 - Chi phí quản lý", account_number: "642", root_type: "Expense", parent_account: "Chi phí", is_group: 0 },
] as const;

interface SetupStatus {
  companies: string[];
  fiscalYears: string[];
  uoms: string[];
  warehouses: string[];
  accounts: string[];
  ready: boolean;
}

interface ApplyResult { created: string[]; existing: string[]; failed: string[]; }

type StepKey = "company" | "fiscal" | "uom" | "warehouse" | "accounts" | "review";

const STEPS: Array<{ key: StepKey; label: string }> = [
  { key: "company", label: "Công ty" },
  { key: "fiscal", label: "Năm tài chính" },
  { key: "uom", label: "Đơn vị tính" },
  { key: "warehouse", label: "Kho" },
  { key: "accounts", label: "Tài khoản" },
  { key: "review", label: "Xác nhận" },
];

function names(rows: Array<Record<string, unknown>>, fallbackField?: string): string[] {
  return rows.map((row) => String(row.name ?? (fallbackField ? row[fallbackField] : "") ?? "")).filter(Boolean);
}

async function loadStatus(api: FrappeAdapter): Promise<SetupStatus> {
  const [companies, fiscalYears, uoms, warehouses, accounts] = await Promise.all([
    api.getList("Company", { fields: ["name", "company_name"], pageLength: 200 }),
    api.getList("Fiscal Year", { fields: ["name", "year"], pageLength: 200 }),
    api.getList("UOM", { fields: ["name", "uom_name"], pageLength: 500 }),
    api.getList("Warehouse", { fields: ["name", "warehouse_name"], pageLength: 500 }),
    api.getList("Account", { fields: ["name", "account_name"], pageLength: 500 }),
  ]);
  const status = {
    companies: names(companies as Array<Record<string, unknown>>, "company_name"),
    fiscalYears: names(fiscalYears as Array<Record<string, unknown>>, "year"),
    uoms: names(uoms as Array<Record<string, unknown>>, "uom_name"),
    warehouses: names(warehouses as Array<Record<string, unknown>>, "warehouse_name"),
    accounts: names(accounts as Array<Record<string, unknown>>, "account_name"),
    ready: false,
  };
  status.ready = status.companies.length > 0 && status.fiscalYears.length > 0 && status.uoms.length > 0 && status.warehouses.length > 0 && status.accounts.length > 0;
  return status;
}

async function createMetadataSafe(api: FrappeAdapter, doctype: string, raw: Record<string, unknown>) {
  const meta = await api.getMeta(doctype);
  const allowed = new Set((meta.fields ?? []).map((field) => field.fieldname));
  const payload = Object.fromEntries(Object.entries(raw).filter(([key, value]) => allowed.has(key) && value !== undefined && value !== ""));
  return api.createDoc(doctype, payload);
}

async function exists(api: FrappeAdapter, doctype: string, field: string, value: string): Promise<boolean> {
  const rows = await api.getList(doctype, { fields: ["name", field], filters: { [field]: value }, pageLength: 1 });
  return rows.length > 0;
}

async function ensureRecord(api: FrappeAdapter, result: ApplyResult, doctype: string, field: string, value: string, payload: Record<string, unknown>) {
  const key = `${doctype}: ${value}`;
  try {
    if (await exists(api, doctype, field, value)) { result.existing.push(key); return; }
    await createMetadataSafe(api, doctype, payload);
    result.created.push(key);
  } catch (error) {
    result.failed.push(`${key} — ${api.mapError(error).message}`);
  }
}

function SetupCenter({ api, boot }: { api: FrappeAdapter; boot: MetaForgeBootDTO }) {
  const canSetup = boot.user === "Administrator" || boot.roles.includes("Administrator") || boot.roles.includes("System Manager");
  const currentYear = String(new Date().getFullYear());
  const [step, setStep] = useState<StepKey>("company");
  const [status, setStatus] = useState<SetupStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [result, setResult] = useState<ApplyResult | null>(null);
  const [companyName, setCompanyName] = useState("");
  const [country, setCountry] = useState("Vietnam");
  const [taxId, setTaxId] = useState("");
  const [currency, setCurrency] = useState("VND");
  const [fiscalYear, setFiscalYear] = useState(currentYear);
  const [fiscalStart, setFiscalStart] = useState(`${currentYear}-01-01`);
  const [fiscalEnd, setFiscalEnd] = useState(`${currentYear}-12-31`);
  const [selectedUoms, setSelectedUoms] = useState(new Set(DEFAULT_UOMS));
  const [warehouseText, setWarehouseText] = useState(DEFAULT_WAREHOUSES.join("\n"));
  const [seedAccounts, setSeedAccounts] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try { setStatus(await loadStatus(api)); }
    catch (error) { toast.error(api.mapError(error).message); }
    finally { setLoading(false); }
  }, [api]);
  useEffect(() => { void refresh(); }, [refresh]);

  useEffect(() => {
    if (!companyName && status?.companies[0]) setCompanyName(status.companies[0]);
  }, [companyName, status]);

  const warehouses = useMemo(() => warehouseText.split("\n").map((value) => value.trim()).filter(Boolean), [warehouseText]);
  const selectedUomList = useMemo(() => DEFAULT_UOMS.filter((uom) => selectedUoms.has(uom)), [selectedUoms]);
  const stepIndex = STEPS.findIndex((candidate) => candidate.key === step);
  const preview = useMemo(() => ({
    company: companyName || "—",
    fiscalYear: fiscalYear || "—",
    uoms: selectedUomList.length,
    warehouses: warehouses.length,
    accounts: seedAccounts ? BASIC_ACCOUNTS.length : 0,
  }), [companyName, fiscalYear, selectedUomList.length, warehouses.length, seedAccounts]);

  const apply = async () => {
    if (!companyName.trim()) { toast.error("Tên công ty là bắt buộc"); setStep("company"); return; }
    if (!fiscalYear.trim() || !fiscalStart || !fiscalEnd) { toast.error("Năm tài chính chưa đủ thông tin"); setStep("fiscal"); return; }
    if (!selectedUomList.length) { toast.error("Cần ít nhất một đơn vị tính"); setStep("uom"); return; }
    if (!warehouses.length) { toast.error("Cần ít nhất một kho"); setStep("warehouse"); return; }
    setApplying(true);
    const next: ApplyResult = { created: [], existing: [], failed: [] };
    try {
      await ensureRecord(api, next, "Currency", "currency_name", currency, { currency_name: currency, symbol: currency === "VND" ? "₫" : currency, currency_scale: currency === "VND" ? 0 : 2 });
      await ensureRecord(api, next, "Fiscal Year", "year", fiscalYear, { year: fiscalYear, year_start_date: fiscalStart, year_end_date: fiscalEnd, disabled: 0 });
      await ensureRecord(api, next, "Company", "company_name", companyName.trim(), { company_name: companyName.trim(), default_currency: currency, country, tax_id: taxId, disabled: 0 });
      for (const uom of selectedUomList) {
        await ensureRecord(api, next, "UOM", "uom_name", uom, { uom_name: uom, must_be_whole_number: ["Cái", "Chiếc", "Bộ", "Cây", "Thùng", "Hộp"].includes(uom) ? 1 : 0 });
      }
      for (const warehouseName of warehouses) {
        await ensureRecord(api, next, "Warehouse", "warehouse_name", warehouseName, { warehouse_name: warehouseName, company: companyName.trim(), is_group: 0, disabled: 0 });
      }
      if (seedAccounts) {
        for (const account of BASIC_ACCOUNTS) {
          await ensureRecord(api, next, "Account", "account_name", account.account_name, { ...account, company: companyName.trim(), disabled: 0 });
        }
      }
      setResult(next);
      await refresh();
      if (next.failed.length) toast.warning(`Hoàn tất một phần: ${next.failed.length} mục cần xử lý`);
      else toast.success(`Thiết lập xong: tạo mới ${next.created.length} mục`);
    } finally { setApplying(false); }
  };

  if (!canSetup) {
    return <div className="grid min-h-screen place-items-center bg-muted/20 p-6"><div className="max-w-lg rounded-xl border bg-card p-6 text-center"><CircleAlert className="mx-auto size-8 text-destructive" /><h1 className="mt-3 text-xl font-semibold">Không có quyền thiết lập doanh nghiệp</h1><p className="mt-2 text-sm text-muted-foreground">Màn này chỉ dành cho Administrator hoặc System Manager. API vẫn kiểm quyền trên từng DocType.</p><Button className="mt-5" variant="outline" onClick={() => window.location.assign("/")}><ArrowLeft className="mr-2 size-4" />Quay lại ứng dụng</Button></div></div>;
  }

  return <div className="min-h-screen bg-muted/20 text-foreground">
    <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3 md:px-6">
        <Button variant="ghost" size="sm" onClick={() => window.location.assign("/")}><ArrowLeft className="mr-2 size-4" />Ứng dụng</Button>
        <Separator orientation="vertical" className="h-6" />
        <Settings2 className="size-5 text-primary" />
        <div><div className="font-semibold">Thiết lập doanh nghiệp</div><div className="text-xs text-muted-foreground">Company, năm tài chính, ĐVT, kho và tài khoản chuẩn</div></div>
        <div className="ml-auto flex items-center gap-2">
          {status?.ready ? <Badge variant="secondary"><CircleCheck className="mr-1 size-3.5" />Sẵn sàng</Badge> : <Badge variant="outline">Chưa hoàn tất</Badge>}
          <Button variant="ghost" size="icon" disabled={loading} onClick={() => void refresh()} aria-label="Làm mới"><RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} /></Button>
        </div>
      </div>
    </header>

    <main className="mx-auto grid max-w-7xl gap-5 p-4 md:grid-cols-[15rem_minmax(0,1fr)] md:p-6">
      <aside className="h-fit rounded-xl border bg-card p-2 md:sticky md:top-20">
        {STEPS.map((item, index) => {
          const active = item.key === step;
          return <button key={item.key} type="button" onClick={() => setStep(item.key)} className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm ${active ? "bg-primary/10 font-semibold text-primary" : "hover:bg-muted"}`}><span className={`grid size-6 place-items-center rounded-full border text-xs ${index < stepIndex ? "border-primary bg-primary text-primary-foreground" : ""}`}>{index < stepIndex ? <Check className="size-3.5" /> : index + 1}</span>{item.label}</button>;
        })}
        <Separator className="my-2" />
        <div className="space-y-1 px-3 py-2 text-xs text-muted-foreground">
          <div>{status?.companies.length ?? 0} công ty</div><div>{status?.fiscalYears.length ?? 0} năm tài chính</div><div>{status?.uoms.length ?? 0} ĐVT</div><div>{status?.warehouses.length ?? 0} kho</div><div>{status?.accounts.length ?? 0} tài khoản</div>
        </div>
      </aside>

      <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <div className="border-b px-5 py-4"><h1 className="text-xl font-semibold">{STEPS[stepIndex]?.label}</h1><p className="mt-1 text-sm text-muted-foreground">Dữ liệu được tạo vào DocType chuẩn của Forge; chạy lại sẽ bỏ qua bản ghi đã có.</p></div>
        <div className="min-h-[30rem] p-5 md:p-6">
          {step === "company" ? <div className="grid max-w-3xl gap-4 md:grid-cols-2">
            <Field label="Tên công ty" required><Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="CÔNG TY TNHH ..." /></Field>
            <Field label="Tiền tệ"><Select value={currency} onValueChange={setCurrency}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="VND">VND — Việt Nam đồng</SelectItem><SelectItem value="USD">USD — US Dollar</SelectItem></SelectContent></Select></Field>
            <Field label="Quốc gia"><Input value={country} onChange={(e) => setCountry(e.target.value)} /></Field>
            <Field label="Mã số thuế"><Input value={taxId} onChange={(e) => setTaxId(e.target.value)} placeholder="Không bắt buộc" /></Field>
          </div> : null}

          {step === "fiscal" ? <div className="grid max-w-3xl gap-4 md:grid-cols-3">
            <Field label="Năm tài chính" required><Input value={fiscalYear} onChange={(e) => setFiscalYear(e.target.value)} /></Field>
            <Field label="Từ ngày" required><Input type="date" value={fiscalStart} onChange={(e) => setFiscalStart(e.target.value)} /></Field>
            <Field label="Đến ngày" required><Input type="date" value={fiscalEnd} onChange={(e) => setFiscalEnd(e.target.value)} /></Field>
          </div> : null}

          {step === "uom" ? <div className="max-w-3xl"><p className="mb-4 text-sm text-muted-foreground">Chọn bộ ĐVT khởi tạo. Sau setup vẫn sửa/thêm bằng danh mục UOM chuẩn.</p><div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">{DEFAULT_UOMS.map((uom) => <label key={uom} className="flex cursor-pointer items-center gap-3 rounded-lg border p-3"><Checkbox checked={selectedUoms.has(uom)} onCheckedChange={(checked) => setSelectedUoms((previous) => { const next = new Set(previous); checked ? next.add(uom) : next.delete(uom); return next; })} /><span className="text-sm">{uom}</span></label>)}</div></div> : null}

          {step === "warehouse" ? <div className="max-w-3xl"><Field label="Mỗi dòng là một kho"><textarea className="min-h-52 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" value={warehouseText} onChange={(e) => setWarehouseText(e.target.value)} /></Field><p className="mt-2 text-xs text-muted-foreground">Mỗi kho được gắn với công ty ở bước 1. Có thể dựng cây kho chi tiết sau.</p></div> : null}

          {step === "accounts" ? <div className="max-w-4xl space-y-4"><label className="flex items-start gap-3 rounded-lg border p-4"><Checkbox checked={seedAccounts} onCheckedChange={(checked) => setSeedAccounts(Boolean(checked))} /><span><span className="block text-sm font-medium">Tạo hệ thống tài khoản cơ bản</span><span className="mt-1 block text-xs text-muted-foreground">Bộ khởi tạo tối thiểu để có Tiền mặt, Ngân hàng, Phải thu, Phải trả, Kho, Doanh thu và Chi phí. Đây không phải tuyên bố tuân thủ TT99/TT200/TT133; chart pháp định phải được cấu hình/kiểm tra riêng.</span></span></label>{seedAccounts ? <div className="grid gap-2 md:grid-cols-2">{BASIC_ACCOUNTS.map((account) => <div key={account.account_name} className="rounded-md border px-3 py-2 text-sm"><span className="font-medium">{account.account_name}</span><span className="ml-2 text-xs text-muted-foreground">{account.root_type}</span></div>)}</div> : <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Bỏ qua tạo tài khoản; hệ thống sẽ vẫn báo chưa sẵn sàng nếu tenant chưa có Account.</div>}</div> : null}

          {step === "review" ? <div className="max-w-4xl space-y-5"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Summary icon={<Building2 className="size-4" />} label="Công ty" value={preview.company} />
            <Summary icon={<CalendarRange className="size-4" />} label="Năm tài chính" value={preview.fiscalYear} />
            <Summary icon={<Ruler className="size-4" />} label="ĐVT" value={String(preview.uoms)} />
            <Summary icon={<Warehouse className="size-4" />} label="Kho" value={String(preview.warehouses)} />
            <Summary icon={<PackageCheck className="size-4" />} label="Tài khoản" value={String(preview.accounts)} />
          </div><div className="rounded-lg border bg-muted/20 p-4 text-sm"><div className="font-medium">Cách ghi dữ liệu</div><p className="mt-1 text-muted-foreground">Wizard chỉ điều phối các lệnh create chuẩn qua FrappeAdapter/Document Kernel. Không có bảng setup shadow. Nếu một bước lỗi, các bước đã tạo vẫn là canonical data và lần chạy lại tự bỏ qua chúng.</p></div>{result ? <ResultBox result={result} /> : null}<Button size="lg" disabled={applying} onClick={() => void apply()}>{applying ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Settings2 className="mr-2 size-4" />}Tạo / hoàn tất thiết lập</Button></div> : null}
        </div>
        <div className="flex items-center justify-between border-t px-5 py-4">
          <Button variant="outline" disabled={stepIndex === 0 || applying} onClick={() => setStep(STEPS[Math.max(0, stepIndex - 1)]!.key)}>Quay lại</Button>
          {step !== "review" ? <Button disabled={applying} onClick={() => setStep(STEPS[Math.min(STEPS.length - 1, stepIndex + 1)]!.key)}>Tiếp tục</Button> : <span />}
        </div>
      </section>
    </main>
  </div>;
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label>{label}{required ? <span className="ml-1 text-destructive">*</span> : null}</Label>{children}</div>;
}
function Summary({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return <div className="rounded-lg border p-3"><div className="flex items-center gap-2 text-xs text-muted-foreground">{icon}{label}</div><div className="mt-2 truncate text-sm font-semibold" title={value}>{value}</div></div>;
}
function ResultBox({ result }: { result: ApplyResult }) {
  return <div className={`rounded-lg border p-4 text-sm ${result.failed.length ? "border-amber-500/40 bg-amber-500/5" : "border-emerald-500/40 bg-emerald-500/5"}`}><div className="font-medium">Kết quả lần chạy gần nhất</div><div className="mt-2 grid gap-1 text-xs text-muted-foreground sm:grid-cols-3"><span>Tạo mới: {result.created.length}</span><span>Đã có: {result.existing.length}</span><span>Lỗi: {result.failed.length}</span></div>{result.failed.length ? <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-amber-800 dark:text-amber-300">{result.failed.map((item) => <li key={item}>{item}</li>)}</ul> : null}</div>;
}

export function ERPSetupStandalone() {
  return <I18nProvider><AuthBoundary adapter={adapter} renderLoading={() => <div className="grid min-h-screen place-items-center"><Loader2 className="size-6 animate-spin" /></div>} renderError={(message) => <div className="grid min-h-screen place-items-center p-6 text-destructive">{message}</div>} renderGuest={(retry) => <LoginForm adapter={adapter} onSuccess={retry} title="Đăng nhập để thiết lập doanh nghiệp" />}>{(boot) => <SetupCenter api={adapter} boot={boot} />}</AuthBoundary><Toaster /></I18nProvider>;
}
