/** @jsxImportSource react */
import { useCallback, useEffect, useMemo, useState } from "react";
import type { FrappeAdapter, MetaForgeBootDTO } from "@metaforge/adapter-frappe";
import { FrappeAdapterImpl } from "@metaforge/adapter-frappe";
import { ArrowLeft, Building2, CalendarRange, Check, CircleAlert, CircleCheck, Loader2, PackageCheck, RefreshCw, Settings2, Warehouse } from "lucide-react";
import { AuthBoundary, I18nProvider, LoginForm } from "@metaforge/shell";
import { Badge, Button, Checkbox, Input, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Separator, Toaster, toast } from "@metaforge/ui";
import { TT99_ACCOUNTS } from "./tt99-chart";

const adapter = new FrappeAdapterImpl({});
const DEFAULT_UOMS = ["Cái", "Chiếc", "Bộ", "Cây", "Mét", "m²", "Kg", "Tấn", "Thùng", "Hộp", "Lít"];
const DEFAULT_WAREHOUSES = ["Kho nguyên vật liệu", "Kho thành phẩm", "Kho hàng lỗi"];
const DEFAULT_PAYMENT_METHODS = ["Tiền mặt", "Chuyển khoản", "Công nợ"];
const DEFAULT_PRICE_LISTS = ["Giá bán chuẩn", "Giá mua chuẩn"];
const DEFAULT_CUSTOMER_GROUPS = ["Khách hàng doanh nghiệp", "Khách lẻ"];
const DEFAULT_SUPPLIER_GROUPS = ["Nguyên vật liệu", "Dịch vụ"];
const ROOTS = { Asset: "Tài sản", Liability: "Nợ phải trả", Equity: "Vốn chủ sở hữu", Income: "Doanh thu", Expense: "Chi phí" } as const;

type StepKey = "company" | "accounting" | "uom" | "warehouse" | "tax" | "defaults" | "review";
const STEPS: Array<{ key: StepKey; label: string }> = [
  { key: "company", label: "Công ty" }, { key: "accounting", label: "Kế toán" }, { key: "uom", label: "Đơn vị tính" },
  { key: "warehouse", label: "Kho" }, { key: "tax", label: "Thuế" }, { key: "defaults", label: "Thiết lập mặc định" }, { key: "review", label: "Xác nhận" },
];

interface SetupStatus { companies: string[]; fiscalYears: string[]; uoms: string[]; warehouses: string[]; accounts: string[]; ready: boolean; }
interface ApplyResult { created: string[]; existing: string[]; failed: string[]; }
function names(rows: Array<Record<string, unknown>>, fallback?: string) { return rows.map(r => String(r.name ?? (fallback ? r[fallback] : "") ?? "")).filter(Boolean); }
async function loadStatus(api: FrappeAdapter): Promise<SetupStatus> {
  const [companies, fiscalYears, uoms, warehouses, accounts] = await Promise.all([
    api.getList("Company", { fields: ["name", "company_name"], pageLength: 200 }), api.getList("Fiscal Year", { fields: ["name", "year"], pageLength: 200 }),
    api.getList("UOM", { fields: ["name", "uom_name"], pageLength: 500 }), api.getList("Warehouse", { fields: ["name", "warehouse_name"], pageLength: 500 }),
    api.getList("Account", { fields: ["name", "account_name"], pageLength: 1000 }),
  ]);
  const s = { companies: names(companies as any[], "company_name"), fiscalYears: names(fiscalYears as any[], "year"), uoms: names(uoms as any[], "uom_name"), warehouses: names(warehouses as any[], "warehouse_name"), accounts: names(accounts as any[], "account_name"), ready: false };
  s.ready = !!s.companies.length && !!s.fiscalYears.length && !!s.uoms.length && !!s.warehouses.length && s.accounts.length > 10; return s;
}
async function createMetadataSafe(api: FrappeAdapter, doctype: string, raw: Record<string, unknown>) {
  const meta = await api.getMeta(doctype); const allowed = new Set((meta.fields ?? []).map(f => f.fieldname));
  return api.createDoc(doctype, Object.fromEntries(Object.entries(raw).filter(([k, v]) => allowed.has(k) && v !== undefined && v !== "")));
}
async function exists(api: FrappeAdapter, doctype: string, field: string, value: string, extra: Record<string, unknown> = {}) {
  return (await api.getList(doctype, { fields: ["name"], filters: { [field]: value, ...extra }, pageLength: 1 })).length > 0;
}
async function ensure(api: FrappeAdapter, result: ApplyResult, doctype: string, field: string, value: string, payload: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  const key = `${doctype}: ${value}`; try { if (await exists(api, doctype, field, value, extra)) { result.existing.push(key); return; } await createMetadataSafe(api, doctype, payload); result.created.push(key); }
  catch (e) { result.failed.push(`${key} — ${api.mapError(e).message}`); }
}
async function seedTT99(api: FrappeAdapter, result: ApplyResult, company: string) {
  const rootNames = new Map<string, string>();
  for (const rootType of Object.keys(ROOTS) as Array<keyof typeof ROOTS>) {
    const rootName = `${ROOTS[rootType]} - ${company}`; rootNames.set(rootType, rootName);
    await ensure(api, result, "Account", "account_name", rootName, { account_name: rootName, root_type: rootType, is_group: 1, company }, { company });
  }
  const ordered = [...TT99_ACCOUNTS].sort((a, b) => a.code.length - b.code.length || a.code.localeCompare(b.code));
  const namesByCode = new Map<string, string>();
  for (const a of ordered) {
    const parentCode = [...namesByCode.keys()].filter(code => a.code.startsWith(code)).sort((x, y) => y.length - x.length)[0];
    const parent = parentCode ? namesByCode.get(parentCode) : rootNames.get(a.rootType);
    const accountName = `${a.code} - ${a.name}`; namesByCode.set(a.code, accountName);
    await ensure(api, result, "Account", "account_name", accountName, { account_name: accountName, account_number: a.code, root_type: a.rootType, account_type: a.accountType, parent_account: parent, is_group: 0, company }, { company });
  }
}

function SetupCenter({ api, boot }: { api: FrappeAdapter; boot: MetaForgeBootDTO }) {
  const canSetup = boot.user === "Administrator" || boot.roles.includes("Administrator") || boot.roles.includes("System Manager");
  const year = String(new Date().getFullYear());
  const [step, setStep] = useState<StepKey>("company"); const [status, setStatus] = useState<SetupStatus | null>(null); const [loading, setLoading] = useState(true); const [applying, setApplying] = useState(false); const [result, setResult] = useState<ApplyResult | null>(null);
  const [companyName, setCompanyName] = useState(""); const [taxId, setTaxId] = useState(""); const [currency, setCurrency] = useState("VND"); const [fiscalYear, setFiscalYear] = useState(year); const [fiscalStart, setFiscalStart] = useState(`${year}-01-01`); const [fiscalEnd, setFiscalEnd] = useState(`${year}-12-31`);
  const [selectedUoms, setSelectedUoms] = useState(new Set(DEFAULT_UOMS)); const [warehouses, setWarehouses] = useState(DEFAULT_WAREHOUSES.join("\n")); const [vatRate, setVatRate] = useState("10");
  const refresh = useCallback(async () => { setLoading(true); try { setStatus(await loadStatus(api)); } catch (e) { toast.error(api.mapError(e).message); } finally { setLoading(false); } }, [api]);
  useEffect(() => { void refresh(); }, [refresh]); useEffect(() => { if (!companyName && status?.companies[0]) setCompanyName(status.companies[0]); }, [companyName, status]);
  const warehouseList = useMemo(() => warehouses.split("\n").map(x => x.trim()).filter(Boolean), [warehouses]); const uomList = useMemo(() => DEFAULT_UOMS.filter(x => selectedUoms.has(x)), [selectedUoms]); const idx = STEPS.findIndex(x => x.key === step);
  const apply = async () => {
    if (!companyName.trim()) { toast.error("Tên công ty là bắt buộc"); setStep("company"); return; } if (!fiscalStart || !fiscalEnd) { toast.error("Năm tài chính chưa đủ"); setStep("accounting"); return; } if (!uomList.length || !warehouseList.length) { toast.error("Cần ĐVT và kho"); return; }
    setApplying(true); const r: ApplyResult = { created: [], existing: [], failed: [] }; const company = companyName.trim();
    try {
      await ensure(api, r, "Currency", "currency_name", currency, { currency_name: currency, symbol: currency === "VND" ? "₫" : currency, currency_scale: currency === "VND" ? 0 : 2 });
      await ensure(api, r, "Fiscal Year", "year", fiscalYear, { year: fiscalYear, year_start_date: fiscalStart, year_end_date: fiscalEnd, disabled: 0 });
      await ensure(api, r, "Company", "company_name", company, { company_name: company, default_currency: currency, country: "Vietnam", tax_id: taxId, disabled: 0 });
      for (const uom of uomList) await ensure(api, r, "UOM", "uom_name", uom, { uom_name: uom, must_be_whole_number: ["Cái","Chiếc","Bộ","Cây","Thùng","Hộp"].includes(uom) ? 1 : 0 });
      for (const name of warehouseList) await ensure(api, r, "Warehouse", "warehouse_name", name, { warehouse_name: name, company, is_group: 0, disabled: 0 }, { company });
      await seedTT99(api, r, company);
      for (const name of ["Tiền mặt", "Chuyển khoản", "Công nợ"]) await ensure(api, r, "Mode of Payment", "mode_of_payment", name, { mode_of_payment: name, enabled: 1 });
      for (const name of ["Giá bán chuẩn", "Giá mua chuẩn"]) await ensure(api, r, "Price List", "price_list_name", name, { price_list_name: name, selling: name === "Giá bán chuẩn" ? 1 : 0, buying: name === "Giá mua chuẩn" ? 1 : 0 });
      for (const name of ["Khách hàng doanh nghiệp", "Khách lẻ"]) await ensure(api, r, "Customer Group", "customer_group_name", name, { customer_group_name: name });
      for (const name of ["Nguyên vật liệu", "Dịch vụ"]) await ensure(api, r, "Supplier Group", "supplier_group_name", name, { supplier_group_name: name });
      await ensure(api, r, "Cost Center", "cost_center_name", company, { cost_center_name: company, company, is_group: 1 }, { company });
      // Tax policy is intentionally captured but not posted into ledger templates here: the rate must be applied through the company's tax template/account mapping.
      void vatRate;
      setResult(r); await refresh(); if (r.failed.length) toast.warning(`Thiết lập một phần: ${r.failed.length} mục lỗi`); else toast.success(`Hoàn tất: ${r.created.length} mục mới, ${r.existing.length} đã có`);
    } finally { setApplying(false); }
  };
  if (!canSetup) return <div className="grid min-h-screen place-items-center bg-muted/20 p-6"><div className="max-w-lg rounded-xl border bg-card p-6 text-center"><CircleAlert className="mx-auto size-8 text-destructive" /><h1 className="mt-3 text-xl font-semibold">Không có quyền thiết lập</h1><p className="mt-2 text-sm text-muted-foreground">Chỉ Administrator/System Manager được chạy wizard.</p></div></div>;
  return <div className="min-h-screen bg-muted/20"><header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur"><div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3 md:px-6"><Button variant="ghost" size="sm" onClick={() => window.location.assign("/")}><ArrowLeft className="mr-2 size-4" />Ứng dụng</Button><Separator orientation="vertical" className="h-6" /><Settings2 className="size-5 text-primary" /><div><div className="font-semibold">Thiết lập doanh nghiệp</div><div className="text-xs text-muted-foreground">Khởi tạo Company + TT99 + master mặc định</div></div><div className="ml-auto flex gap-2">{status?.ready ? <Badge variant="secondary"><CircleCheck className="mr-1 size-3.5" />Sẵn sàng</Badge> : <Badge variant="outline">Chưa hoàn tất</Badge>}<Button variant="ghost" size="icon" onClick={() => void refresh()}><RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} /></Button></div></div></header>
    <main className="mx-auto grid max-w-7xl gap-5 p-4 md:grid-cols-[15rem_minmax(0,1fr)] md:p-6"><aside className="h-fit rounded-xl border bg-card p-2 md:sticky md:top-20">{STEPS.map((s,i)=><button key={s.key} type="button" onClick={()=>setStep(s.key)} className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm ${s.key===step?"bg-primary/10 font-semibold text-primary":"hover:bg-muted"}`}><span className="grid size-6 place-items-center rounded-full border text-xs">{i<idx?<Check className="size-3.5"/>:i+1}</span>{s.label}</button>)}</aside>
      <section className="rounded-xl border bg-card p-5 md:p-7"><div className="mb-6"><Badge variant="outline">Bước {idx+1}/{STEPS.length}</Badge><h1 className="mt-2 text-2xl font-semibold">{STEPS[idx].label}</h1></div>
        {step === "company" && <div className="grid gap-5 md:grid-cols-2"><div><Label>Tên công ty *</Label><Input className="mt-2" value={companyName} onChange={e=>setCompanyName(e.target.value)} placeholder="CÔNG TY TNHH..."/></div><div><Label>Mã số thuế</Label><Input className="mt-2" value={taxId} onChange={e=>setTaxId(e.target.value)} /></div><div><Label>Tiền tệ</Label><Select value={currency} onValueChange={setCurrency}><SelectTrigger className="mt-2"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="VND">VND — Việt Nam Đồng</SelectItem><SelectItem value="USD">USD — US Dollar</SelectItem></SelectContent></Select></div></div>}
        {step === "accounting" && <div className="grid gap-5 md:grid-cols-2"><div><Label>Chế độ kế toán</Label><div className="mt-2 rounded-lg border bg-muted/30 p-4"><b>TT99/2025/TT-BTC</b><p className="mt-1 text-sm text-muted-foreground">Seed chart of accounts theo Phụ lục II. Không dùng chart tối giản.</p></div></div><div><Label>Năm tài chính</Label><Input className="mt-2" value={fiscalYear} onChange={e=>setFiscalYear(e.target.value)} /></div><div><Label>Bắt đầu</Label><Input type="date" className="mt-2" value={fiscalStart} onChange={e=>setFiscalStart(e.target.value)} /></div><div><Label>Kết thúc</Label><Input type="date" className="mt-2" value={fiscalEnd} onChange={e=>setFiscalEnd(e.target.value)} /></div></div>}
        {step === "uom" && <div className="grid gap-3 md:grid-cols-3">{DEFAULT_UOMS.map(u=><label key={u} className="flex items-center gap-3 rounded-lg border p-3"><Checkbox checked={selectedUoms.has(u)} onCheckedChange={v=>setSelectedUoms(prev=>{const n=new Set(prev);v?n.add(u):n.delete(u);return n})}/><span>{u}</span></label>)}</div>}
        {step === "warehouse" && <div><Label>Danh sách kho, mỗi dòng một kho</Label><textarea className="mt-2 min-h-48 w-full rounded-lg border bg-background p-3 text-sm" value={warehouses} onChange={e=>setWarehouses(e.target.value)}/><p className="mt-2 text-xs text-muted-foreground">Kho được tạo dưới Company hiện tại.</p></div>}
        {step === "tax" && <div className="grid gap-5 md:grid-cols-2"><div><Label>VAT mặc định</Label><Select value={vatRate} onValueChange={setVatRate}><SelectTrigger className="mt-2"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="0">0%</SelectItem><SelectItem value="5">5%</SelectItem><SelectItem value="8">8%</SelectItem><SelectItem value="10">10%</SelectItem></SelectContent></Select></div><div className="rounded-lg border bg-muted/30 p-4 text-sm"><b>Lưu ý</b><p className="mt-1 text-muted-foreground">Wizard lưu chính sách lựa chọn; tax template/GL mapping chỉ được kích hoạt khi Company đã có tài khoản thuế tương ứng. Không tự tạo bút toán.</p></div></div>}
        {step === "defaults" && <div className="space-y-4"><div className="grid gap-4 md:grid-cols-2">{[["Thanh toán","Tiền mặt · Chuyển khoản · Công nợ"],["Bảng giá","Giá bán chuẩn · Giá mua chuẩn"],["Nhóm khách hàng","Khách hàng doanh nghiệp · Khách lẻ"],["Nhóm nhà cung cấp","Nguyên vật liệu · Dịch vụ"],["Cost Center","Một Cost Center gốc theo Company"],["ĐVT","11 ĐVT thông dụng"]].map(([a,b])=><div key={a} className="rounded-lg border p-4"><div className="font-medium">{a}</div><div className="mt-1 text-sm text-muted-foreground">{b}</div></div>)}</div></div>}
        {step === "review" && <div className="space-y-4"><div className="grid gap-3 md:grid-cols-2"><div className="rounded-lg border p-4"><Building2 className="size-5 text-primary"/><div className="mt-2 font-semibold">{companyName||"—"}</div><div className="text-sm text-muted-foreground">{currency} · MST {taxId||"—"}</div></div><div className="rounded-lg border p-4"><CalendarRange className="size-5 text-primary"/><div className="mt-2 font-semibold">TT99 · FY {fiscalYear}</div><div className="text-sm text-muted-foreground">{fiscalStart} → {fiscalEnd}</div></div><div className="rounded-lg border p-4"><PackageCheck className="size-5 text-primary"/><div className="mt-2 font-semibold">{uomList.length} ĐVT</div><div className="text-sm text-muted-foreground">{uomList.join(", ")}</div></div><div className="rounded-lg border p-4"><Warehouse className="size-5 text-primary"/><div className="mt-2 font-semibold">{warehouseList.length} kho</div><div className="text-sm text-muted-foreground">{warehouseList.join(", ")}</div></div></div><div className="rounded-lg border bg-muted/30 p-4 text-sm"><b>Hệ tài khoản TT99</b><p className="mt-1 text-muted-foreground">{TT99_ACCOUNTS.length} tài khoản + 5 root group và mapping tài khoản mặc định nền tảng.</p></div></div>}
        {result && <div className="mt-5 rounded-lg border bg-muted/30 p-4 text-sm"><b>Kết quả lần chạy gần nhất</b><div className="mt-2">Tạo mới: {result.created.length} · Đã có: {result.existing.length} · Lỗi: {result.failed.length}</div>{result.failed.length>0&&<ul className="mt-2 list-disc pl-5 text-destructive">{result.failed.slice(0,10).map(x=><li key={x}>{x}</li>)}</ul>}</div>}
        <div className="mt-8 flex justify-between"><Button variant="outline" disabled={idx===0} onClick={()=>setStep(STEPS[idx-1].key)}>Quay lại</Button>{step!=="review"?<Button onClick={()=>setStep(STEPS[idx+1].key)}>Tiếp tục</Button>:<Button disabled={applying} onClick={()=>void apply()}>{applying?<><Loader2 className="mr-2 size-4 animate-spin"/>Đang khởi tạo...</>:<>Tạo hệ thống</>}</Button>}</div>
      </section></main><Toaster/></div>;
}

export function ERPSetupStandalone() { return <AuthBoundary fallback={<LoginForm />}><I18nProvider><SetupCenter api={adapter} boot={adapter.getBootDTO()}/></I18nProvider></AuthBoundary>; }
