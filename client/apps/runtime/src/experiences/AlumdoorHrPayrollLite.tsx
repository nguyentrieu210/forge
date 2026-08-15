import { useCallback, useEffect, useState, type ChangeEvent, type ReactNode } from "react";
import { ALUMDOOR_HR_PAYROLL_METHODS } from "@cloudforge/alumdoor-hr-payroll-contract";
import { useMetaForge } from "@metaforge/views/provider";
import {
  Badge, Button, Input, Label, Select, SelectContent, SelectItem,
  SelectTrigger, SelectValue, Skeleton,
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@metaforge/ui";
import {
  ArrowLeft, Banknote, CalendarDays, CheckCircle2, CircleAlert, Clock3,
  RefreshCw, Settings2,
} from "lucide-react";

export type AlumdoorHrPayrollLiteMode = "payroll-lite" | "my-slips-lite" | "hr-payroll-settings-lite";

interface PayrollPeriod {
  name: string;
  start_date?: string;
  end_date?: string;
  alu_state?: string;
  employee_count?: number;
  alu_regular_minutes?: number;
  alu_overtime_minutes?: number;
  total_net_pay?: number | string;
}
interface SalarySlip {
  name: string;
  employee?: string;
  employee_name?: string;
  start_date?: string;
  end_date?: string;
  alu_state?: string;
  alu_work_fraction_bp?: number;
  alu_overtime_minutes?: number;
  alu_base_pay_vnd?: number;
  alu_overtime_pay_vnd?: number;
  alu_allowance_vnd?: number;
  alu_advance_vnd?: number;
  alu_manual_deduction_vnd?: number;
  net_pay?: number | string;
}
interface LiteSettings {
  company?: string | null;
  workplace?: string | null;
  currency?: string | null;
  morning_start?: string;
  morning_end?: string;
  afternoon_start?: string;
  afternoon_end?: string;
  overtime_start?: string;
  overtime_rate_vnd_per_hour?: number;
  pay_day_of_month?: number;
  owner_only_mode?: boolean;
  ready?: boolean;
  configured?: boolean;
  companies?: Array<{ value: string; label: string; currency?: string }>;
  workplaces?: Array<{ value: string; label: string; company?: string }>;
  currencies?: Array<{ value: string; label: string }>;
  need_legal_check?: boolean;
}

export function AlumdoorHrPayrollLite({ mode, onExit }: { mode: AlumdoorHrPayrollLiteMode; onExit: () => void }) {
  if (mode === "payroll-lite") return <PayrollLiteScreen onExit={onExit} />;
  if (mode === "my-slips-lite") return <MySlipsLiteScreen onExit={onExit} />;
  return <SettingsLiteScreen onExit={onExit} />;
}

function PayrollLiteScreen({ onExit }: { onExit: () => void }) {
  const { adapter } = useMetaForge();
  const [month, setMonth] = useState(todayIso().slice(0, 7));
  const [periods, setPeriods] = useState<PayrollPeriod[]>([]);
  const [selected, setSelected] = useState("");
  const [slips, setSlips] = useState<SalarySlip[]>([]);
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = (await adapter.callPost<PayrollPeriod[]>(ALUMDOOR_HR_PAYROLL_METHODS.payrollPeriodList, {})).filter((row) => row.alu_state);
      setPeriods(rows);
      const match = rows.find((row) => row.start_date?.startsWith(month));
      setSelected((current) => current && rows.some((row) => row.name === current) ? current : match?.name ?? rows[0]?.name ?? "");
      setFailure("");
    } catch (error) { setFailure(errorText(adapter, error)); }
    finally { setLoading(false); }
  }, [adapter, month]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (!selected) { setSlips([]); return; } void adapter.callPost<SalarySlip[]>(ALUMDOOR_HR_PAYROLL_METHODS.payrollPeriodSlips, { period: selected }).then(setSlips).catch((error) => setFailure(errorText(adapter, error))); }, [adapter, selected]);
  const period = periods.find((row) => row.name === selected);
  const act = async (method: string, args: Record<string, unknown>) => { setLoading(true); try { await adapter.callPost(method, args); await load(); } catch (error) { setFailure(errorText(adapter, error)); } finally { setLoading(false); } };
  const totals = salaryTotals(slips);
  return <Page>
    <PageHeader icon={<Banknote />} title="Tính lương" subtitle="Tính thử → Chốt lương → Đánh dấu đã trả" onExit={onExit} />
    <div className="grid min-h-0 gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
      <aside className="rounded-xl border bg-card p-3"><Label htmlFor="payroll-month">Tháng lương</Label><Input id="payroll-month" className="mt-2" type="month" value={month} onChange={(event) => setMonth(event.target.value)} /><div className="mt-3 space-y-2">{periods.map((row) => <button key={row.name} type="button" onClick={() => setSelected(row.name)} className={`flex w-full items-center justify-between rounded-lg border p-3 text-left ${selected === row.name ? "border-primary bg-primary/5" : "hover:bg-muted/40"}`}><span><span className="block font-medium">{monthLabel(row.start_date)}</span><span className="text-xs text-muted-foreground">{row.employee_count ?? 0} nhân viên</span></span><StateBadge value={row.alu_state} /></button>)}</div></aside>
      <section className="min-w-0 space-y-4">
        <div className="flex flex-col gap-3 rounded-xl border bg-card p-4 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-lg font-semibold">Lương tháng {monthLabel(`${month}-01`)}</h2><p className="text-sm text-muted-foreground">Tăng ca 50.000 ₫/giờ · tự lấy công đã duyệt</p></div><PayrollPrimaryAction period={period} loading={loading} month={month} act={act} /></div>
        {failure && <InlineError message={failure} />}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4"><Metric label="Nhân viên" value={slips.length || period?.employee_count || 0} /><Metric label="Tổng ngày công" value={workDays(slips.reduce((sum, row) => sum + (row.alu_work_fraction_bp ?? 0), 0))} /><Metric label="Tăng ca" value={duration(slips.reduce((sum, row) => sum + (row.alu_overtime_minutes ?? 0), 0))} /><Metric label="Thực nhận" value={money(totals.net)} /></div>
        {loading && !period ? <ListSkeleton /> : !period ? <EmptyState icon={<CalendarDays />} title="Chưa có kỳ lương tháng này" description="Bấm Tính thử để hệ thống tự lấy nhân viên, ngày công và mức lương." action={<Button onClick={() => void act(ALUMDOOR_HR_PAYROLL_METHODS.payrollPreview, { month, idempotency_key: idempotencyKey() })}>Tính thử</Button>} /> : !slips.length ? <EmptyState title="Chưa có kết quả lương" description="Kỳ đã tạo nhưng chưa có phiếu lương. Hãy kiểm tra nhân viên đã có mức lương và ngày công." /> : <SalaryResults rows={slips} />}
      </section>
    </div>
  </Page>;
}

function PayrollPrimaryAction({ period, loading, month, act }: { period: PayrollPeriod | undefined; loading: boolean; month: string; act: (method: string, args: Record<string, unknown>) => Promise<void> }) {
  if (!period || ["draft", "invalidated"].includes(period.alu_state ?? "draft")) {
    return <Button disabled={loading} onClick={() => void act(ALUMDOOR_HR_PAYROLL_METHODS.payrollPreview, { month, idempotency_key: idempotencyKey() })}><RefreshCw className="mr-2 size-4" />Tính thử</Button>;
  }
  if (period.alu_state === "approved") return <Button disabled={loading} onClick={() => { if (window.confirm("Xác nhận đã trả lương cho kỳ này?")) void act(ALUMDOOR_HR_PAYROLL_METHODS.payrollMarkPaid, { period: period.name }); }}><Banknote className="mr-2 size-4" />Đánh dấu đã trả</Button>;
  if (period.alu_state === "paid") return <Badge variant="success"><CheckCircle2 className="mr-1 size-3" />Đã trả</Badge>;
  return <Button disabled={loading} onClick={() => { if (window.confirm("Chốt kỳ lương này? Chấm công và phiếu lương sẽ bị khóa.")) void act(ALUMDOOR_HR_PAYROLL_METHODS.payrollFinalize, { period: period.name, idempotency_key: idempotencyKey() }); }}><CheckCircle2 className="mr-2 size-4" />Chốt lương</Button>;
}

function SalaryResults({ rows }: { rows: SalarySlip[] }) {
  return <><div className="hidden overflow-hidden rounded-xl border md:block"><Table><TableHeader><TableRow><TableHead>Nhân viên</TableHead><TableHead className="text-right">Ngày công</TableHead><TableHead className="text-right">Tăng ca</TableHead><TableHead className="text-right">Cộng/Trừ</TableHead><TableHead className="text-right">Thực nhận</TableHead><TableHead>Trạng thái</TableHead></TableRow></TableHeader><TableBody>{rows.map((row) => <TableRow key={row.name}><TableCell className="font-medium">{row.employee_name || row.employee}</TableCell><TableCell className="text-right tabular-nums">{workDays(row.alu_work_fraction_bp)}</TableCell><TableCell className="text-right tabular-nums">{duration(row.alu_overtime_minutes)}</TableCell><TableCell className="text-right tabular-nums">{money((row.alu_allowance_vnd ?? 0) - (row.alu_advance_vnd ?? 0) - (row.alu_manual_deduction_vnd ?? 0))}</TableCell><TableCell className="text-right font-semibold tabular-nums">{money(row.net_pay)}</TableCell><TableCell><StateBadge value={row.alu_state} /></TableCell></TableRow>)}</TableBody></Table></div><div className="grid gap-3 md:hidden">{rows.map((row) => <article key={row.name} className="rounded-xl border bg-card p-4"><div className="flex items-center justify-between gap-3"><div className="font-semibold">{row.employee_name || row.employee}</div><StateBadge value={row.alu_state} /></div><div className="mt-3 grid grid-cols-2 gap-2 text-sm"><span>Ngày công <b>{workDays(row.alu_work_fraction_bp)}</b></span><span className="text-right">Tăng ca <b>{duration(row.alu_overtime_minutes)}</b></span></div><div className="mt-4 border-t pt-3"><div className="text-xs text-muted-foreground">Thực nhận</div><div className="text-xl font-semibold tabular-nums">{money(row.net_pay)}</div></div></article>)}</div></>;
}

function MySlipsLiteScreen({ onExit }: { onExit: () => void }) {
  const { adapter } = useMetaForge();
  const [rows, setRows] = useState<SalarySlip[]>([]); const [loading, setLoading] = useState(true); const [failure, setFailure] = useState("");
  const load = useCallback(async () => { setLoading(true); try { setRows(await adapter.callPost<SalarySlip[]>(ALUMDOOR_HR_PAYROLL_METHODS.mySlips, {})); setFailure(""); } catch (error) { setFailure(errorText(adapter, error)); } finally { setLoading(false); } }, [adapter]);
  useEffect(() => { void load(); }, [load]);
  return <Page><PageHeader icon={<Banknote />} title="Phiếu lương của tôi" subtitle="Chỉ bạn mới xem được các phiếu lương này" onExit={onExit} action={<Button variant="outline" onClick={() => void load()}><RefreshCw className="mr-2 size-4" />Làm mới</Button>} />{failure ? <ErrorState message={failure} retry={load} /> : loading ? <ListSkeleton /> : !rows.length ? <EmptyState title="Chưa có phiếu lương" description="Phiếu sẽ xuất hiện sau khi chủ doanh nghiệp chốt lương." /> : <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{rows.map((row) => <article key={row.name} className="rounded-xl border bg-card p-5"><div className="flex items-center justify-between"><div className="font-semibold">Tháng {monthLabel(row.start_date)}</div><StateBadge value={row.alu_state} /></div><div className="mt-5 text-xs text-muted-foreground">Thực nhận</div><div className="mt-1 text-2xl font-semibold tabular-nums">{money(row.net_pay)}</div><div className="mt-4 flex justify-between text-sm text-muted-foreground"><span>{workDays(row.alu_work_fraction_bp)} ngày công</span><span>{duration(row.alu_overtime_minutes)} tăng ca</span></div><a className="mt-4 inline-flex w-full items-center justify-center rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted" href={`/print/${encodeURIComponent("Salary Slip")}/${encodeURIComponent(row.name)}`} target="_blank" rel="noreferrer">Xem / In phiếu</a></article>)}</div>}</Page>;
}

function SettingsLiteScreen({ onExit }: { onExit: () => void }) {
  const { adapter } = useMetaForge();
  const [settings, setSettings] = useState<LiteSettings | null>(null);
  const [company, setCompany] = useState("");
  const [workplace, setWorkplace] = useState("");
  const [currency, setCurrency] = useState("VND");
  const [morningStart, setMorningStart] = useState("07:00");
  const [morningEnd, setMorningEnd] = useState("11:30");
  const [afternoonStart, setAfternoonStart] = useState("13:00");
  const [afternoonEnd, setAfternoonEnd] = useState("17:00");
  const [overtimeStart, setOvertimeStart] = useState("17:30");
  const [payDay, setPayDay] = useState(5);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState("");
  const [saved, setSaved] = useState(false);
  const apply = useCallback((value: LiteSettings) => {
    setSettings(value); setCompany(value.company ?? ""); setWorkplace(value.workplace ?? ""); setCurrency(value.currency ?? "VND");
    setMorningStart(value.morning_start ?? "07:00"); setMorningEnd(value.morning_end ?? "11:30");
    setAfternoonStart(value.afternoon_start ?? "13:00"); setAfternoonEnd(value.afternoon_end ?? "17:00");
    setOvertimeStart(value.overtime_start ?? "17:30"); setPayDay(value.pay_day_of_month ?? 5);
  }, []);
  const load = useCallback(async () => {
    try { setFailure(""); apply(await adapter.callPost<LiteSettings>(ALUMDOOR_HR_PAYROLL_METHODS.settingsGet, {})); }
    catch (error) { setFailure(errorText(adapter, error)); }
  }, [adapter, apply]);
  useEffect(() => { void load(); }, [load]);
  const allWorkplaces = settings?.workplaces ?? [];
  const companyWorkplaces = allWorkplaces.filter((entry) => !entry.company || entry.company === company);
  const workplaces = company && companyWorkplaces.length === 0 ? allWorkplaces : companyWorkplaces;
  const selectCompany = (value: string) => {
    setCompany(value); setSaved(false);
    const companyCurrency = settings?.companies?.find((entry) => entry.value === value)?.currency;
    if (companyCurrency && settings?.currencies?.some((entry) => entry.value === companyCurrency)) setCurrency(companyCurrency);
    const valid = (settings?.workplaces ?? []).some((entry) => entry.value === workplace && (!entry.company || entry.company === value));
    if (!valid) setWorkplace("");
  };
  const save = async () => {
    if (!company || !workplace || !currency) { setFailure("Chọn Công ty, Nơi làm việc và Tiền tệ."); return; }
    setSaving(true); setSaved(false); setFailure("");
    try {
      const value = await adapter.callPost<LiteSettings>(ALUMDOOR_HR_PAYROLL_METHODS.settingsSave, {
        company, workplace, currency, morning_start: morningStart, morning_end: morningEnd,
        afternoon_start: afternoonStart, afternoon_end: afternoonEnd, overtime_start: overtimeStart,
        pay_day_of_month: payDay, idempotency_key: idempotencyKey(),
      });
      apply(value); setSaved(true);
    } catch (error) { setFailure(errorText(adapter, error)); }
    finally { setSaving(false); }
  };
  const requiredReady = Boolean(company && workplace && currency);
  const changeTime = (setter: (value: string) => void) => (event: ChangeEvent<HTMLInputElement>) => { setter(event.target.value); setSaved(false); };
  return <Page>
    <PageHeader icon={<Settings2 />} title="Cài đặt mặc định" subtitle="Một nơi duy nhất cho công ty, giờ làm và tính lương" onExit={onExit} action={<Button onClick={() => void save()} disabled={saving || !requiredReady}>{saving ? "Đang lưu…" : "Lưu cài đặt"}</Button>} />
    {!settings ? <ListSkeleton /> : <div className="grid gap-4 lg:grid-cols-2">
      <section className="rounded-xl border bg-card p-5">
        <div className="flex items-center justify-between gap-3"><h2 className="font-semibold">Công ty</h2>{settings.ready ? <Badge variant="success">Sẵn sàng</Badge> : <Badge variant="warning">Cần cấu hình</Badge>}</div>
        <p className="mt-1 text-sm text-muted-foreground">Các màn Nhân viên, Chấm công và Lương sẽ tự dùng các giá trị này.</p>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <Field label="Công ty"><Select value={company} onValueChange={selectCompany}><SelectTrigger><SelectValue placeholder="Chọn công ty" /></SelectTrigger><SelectContent>{(settings.companies ?? []).map((entry) => <SelectItem key={entry.value} value={entry.value}>{entry.label}</SelectItem>)}</SelectContent></Select></Field>
          <Field label="Tiền tệ"><Select value={currency} onValueChange={(value) => { setCurrency(value); setSaved(false); }}><SelectTrigger><SelectValue placeholder="Chọn tiền tệ" /></SelectTrigger><SelectContent>{(settings.currencies ?? [{ value: "VND", label: "VND" }]).map((entry) => <SelectItem key={entry.value} value={entry.value}>{entry.label}</SelectItem>)}</SelectContent></Select></Field>
          <Field label="Nơi làm việc"><Select value={workplace} onValueChange={(value) => { setWorkplace(value); setSaved(false); }} disabled={!company}><SelectTrigger><SelectValue placeholder={company ? "Chọn nơi làm việc" : "Chọn công ty trước"} /></SelectTrigger><SelectContent>{workplaces.map((entry) => <SelectItem key={entry.value} value={entry.value}>{entry.label}</SelectItem>)}</SelectContent></Select></Field>
          <Field label="Ngày trả lương"><Input type="number" inputMode="numeric" min={1} max={28} value={payDay} onChange={(event) => { setPayDay(Math.max(1, Math.min(28, Number(event.target.value) || 1))); setSaved(false); }} /></Field>
        </div>
      </section>
      <section className="rounded-xl border bg-card p-5">
        <h2 className="font-semibold">Giờ làm việc</h2>
        <p className="mt-1 text-sm text-muted-foreground">Chỉ nhập giờ làm thực tế. Chính sách chấm công sẽ được hệ thống tự tạo và duyệt.</p>
        <div className="mt-5 space-y-4">
          <TimeRange label="Buổi sáng" start={morningStart} end={morningEnd} onStart={changeTime(setMorningStart)} onEnd={changeTime(setMorningEnd)} />
          <TimeRange label="Buổi chiều" start={afternoonStart} end={afternoonEnd} onStart={changeTime(setAfternoonStart)} onEnd={changeTime(setAfternoonEnd)} />
          <Field label="Tăng ca bắt đầu"><Input type="time" value={overtimeStart} onChange={changeTime(setOvertimeStart)} /></Field>
        </div>
      </section>
      <SettingsCard title="Tính lương"><SettingRow label="Tiền tệ" value={currency} /><SettingRow label="Tăng ca cố định" value={`${money(settings.overtime_rate_vnd_per_hour)}/giờ`} /><SettingRow label="Ngày trả mặc định" value={`Ngày ${payDay} tháng sau`} /><SettingRow label="Quy trình" value="Chủ tự tính và chốt" /></SettingsCard>
      <section className="rounded-xl border bg-card p-5"><h2 className="font-semibold">Tự động áp dụng</h2><div className="mt-4 space-y-3 text-sm text-muted-foreground"><p>• Nhân viên mới tự gán đúng công ty và nơi làm việc.</p><p>• Trạm QR tự gán giờ làm và vị trí hiện tại.</p><p>• Múi giờ Việt Nam, chống quét trùng và bảo mật thiết bị do hệ thống quản lý.</p></div></section>
      <div className="flex flex-col gap-3 lg:col-span-2"><Button className="w-full sm:w-auto sm:self-start" onClick={() => void save()} disabled={saving || !requiredReady}>{saving ? "Đang lưu…" : "Lưu cài đặt"}</Button>{saved && <div className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400"><CheckCircle2 className="size-4" />Đã lưu và áp dụng cho Nhân viên, Chấm công, Lương.</div>}{failure && <InlineError message={failure} />}</div>
      {settings.need_legal_check && <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100 lg:col-span-2"><div className="flex gap-3"><CircleAlert className="mt-0.5 size-5 shrink-0" /><div><div className="font-medium">Cần xác nhận quy định tăng ca trước khi dùng chính thức</div><p className="mt-1 text-sm opacity-80">Mức 50.000đ/giờ là chính sách doanh nghiệp. Hệ thống vẫn đối chiếu mức tối thiểu theo loại ngày và khung giờ trước khi chốt lương.</p></div></div></div>}
    </div>}
  </Page>;
}

function Page({ children }: { children: ReactNode }) { return <main className="min-h-full bg-background p-3 md:p-5"><div className="mx-auto flex max-w-[1600px] flex-col gap-4">{children}</div></main>; }
function PageHeader({ icon, title, subtitle, onExit, action }: { icon: ReactNode; title: string; subtitle: string; onExit: () => void; action?: ReactNode }) { return <header className="flex flex-col gap-3 rounded-xl border bg-card p-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-3"><Button variant="ghost" size="icon" onClick={onExit} aria-label="Quay lại"><ArrowLeft className="size-4" /></Button><span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary [&_svg]:size-5">{icon}</span><div><h1 className="text-xl font-semibold">{title}</h1><p className="text-sm text-muted-foreground">{subtitle}</p></div></div>{action}</header>; }
function Field({ label, error, required = true, children }: { label: string; error?: string; required?: boolean; children: ReactNode }) { return <div className="space-y-1.5"><Label>{label}{required ? <> <span className="text-destructive">*</span></> : null}</Label>{children}{error && <p className="text-sm text-destructive">{error}</p>}</div>; }
function Metric({ label, value }: { label: string; value: ReactNode }) { return <div className="rounded-xl border bg-card p-4"><div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div><div className="mt-2 text-lg font-semibold tabular-nums">{value}</div></div>; }
function EmptyState({ icon, title, description, action }: { icon?: ReactNode; title: string; description: string; action?: ReactNode }) { return <div className="grid min-h-64 place-items-center rounded-xl border border-dashed bg-muted/10 p-6 text-center"><div>{icon && <span className="mx-auto mb-3 grid size-12 place-items-center rounded-full bg-primary/10 text-primary [&_svg]:size-6">{icon}</span>}<h2 className="font-semibold">{title}</h2><p className="mt-1 max-w-md text-sm text-muted-foreground">{description}</p>{action && <div className="mt-4">{action}</div>}</div></div>; }
function ErrorState({ message, retry }: { message: string; retry: () => Promise<void> }) { return <EmptyState icon={<CircleAlert />} title="Chưa tải được dữ liệu" description={message} action={<Button variant="outline" onClick={() => void retry()}>Thử lại</Button>} />; }
function InlineError({ message }: { message: string }) { return <div className="flex gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"><CircleAlert className="mt-0.5 size-4 shrink-0" />{message}</div>; }
function ListSkeleton() { return <div className="space-y-3 rounded-xl border p-4">{[0, 1, 2, 3].map((value) => <Skeleton key={value} className="h-14 w-full" />)}</div>; }
function StateBadge({ value }: { value?: string }) { const state = value || "draft"; if (["paid"].includes(state)) return <Badge variant="success">Đã trả</Badge>; if (["approved", "finalized"].includes(state)) return <Badge variant="info">Đã chốt</Badge>; if (["calculated", "ready", "pending_approval"].includes(state)) return <Badge variant="warning">Sẵn sàng</Badge>; return <Badge variant="secondary">Bản nháp</Badge>; }
function SettingsCard({ title, children }: { title: string; children: ReactNode }) { return <section className="rounded-xl border bg-card p-5"><h2 className="font-semibold">{title}</h2><div className="mt-4 divide-y">{children}</div></section>; }
function SettingRow({ label, value }: { label: string; value: ReactNode }) { return <div className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0"><span className="text-sm text-muted-foreground">{label}</span><span className="text-right text-sm font-medium">{value}</span></div>; }
function TimeRange({ label, start, end, onStart, onEnd }: { label: string; start: string; end: string; onStart: (event: ChangeEvent<HTMLInputElement>) => void; onEnd: (event: ChangeEvent<HTMLInputElement>) => void }) { return <div><Label>{label}</Label><div className="mt-1.5 grid grid-cols-[1fr_auto_1fr] items-center gap-2"><Input aria-label={`${label} bắt đầu`} type="time" value={start} onChange={onStart} /><span className="text-sm text-muted-foreground">đến</span><Input aria-label={`${label} kết thúc`} type="time" value={end} onChange={onEnd} /></div></div>; }

function errorText(adapter: { mapError: (error: unknown) => { message: string } }, error: unknown): string { const direct = (error as { message?: unknown } | undefined)?.message; return typeof direct === "string" && direct.trim() ? direct.trim() : adapter.mapError(error).message; }
function todayIso(): string { const value = new Date(); return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`; }
function idempotencyKey(): string { return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `alu-${Date.now()}-${Math.random().toString(36).slice(2)}`; }
function monthLabel(value?: string): string { if (!value) return "—"; const [year, month] = value.split("-"); return year && month ? `${month}/${year}` : value; }
function money(value: unknown): string { return `${Math.round(Number(value) || 0).toLocaleString("vi-VN")} ₫`; }
function duration(value: unknown): string { const minutes = Math.max(0, Math.round(Number(value) || 0)); return `${Math.floor(minutes / 60)}g${minutes % 60 ? ` ${minutes % 60}p` : ""}`; }
function workDays(value: unknown): string { return (Math.max(0, Number(value) || 0) / 10_000).toLocaleString("vi-VN", { maximumFractionDigits: 2 }); }
function salaryTotals(rows: SalarySlip[]): { net: number } { return { net: rows.reduce((sum, row) => sum + (Number(row.net_pay) || 0), 0) }; }
