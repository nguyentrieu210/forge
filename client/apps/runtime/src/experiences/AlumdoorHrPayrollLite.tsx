import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import {
  ALUMDOOR_HR_PAYROLL_METHODS,
  ALUMDOOR_OVERTIME_RATE_VND_PER_HOUR,
  employeeLiteCreateSchema,
  payProfileLiteSaveSchema,
  type EmployeeLiteCreateInput,
  type PayProfileLiteSaveFormInput,
  type PayProfileLiteSaveInput,
} from "@cloudforge/alumdoor-hr-payroll-contract";
import { useMetaForge } from "@metaforge/views/provider";
import {
  Avatar, AvatarFallback, Badge, Button, Input, Label, Select, SelectContent, SelectItem,
  SelectTrigger, SelectValue, Sheet, SheetContent, SheetHeader, SheetTitle, Skeleton,
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@metaforge/ui";
import {
  ArrowLeft, Banknote, CalendarDays, CheckCircle2, ChevronRight, CircleAlert, Clock3,
  Plus, RefreshCw, Search, Settings2, UserRoundPlus, Users,
} from "lucide-react";

export type AlumdoorHrPayrollLiteMode = "employees-lite" | "payroll-lite" | "my-slips-lite" | "hr-payroll-settings-lite";

interface EmployeeLite {
  name: string;
  employee_number?: string;
  employee_name?: string;
  mobile?: string;
  date_of_joining?: string;
  employee_status?: string;
  has_pay_profile?: boolean;
}
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
interface PayProfileLite {
  name: string;
  pay_mode?: "MONTHLY" | "DAILY";
  base_salary_vnd?: number;
  fixed_allowance_vnd?: number;
  effective_from?: string;
  status?: string;
  docstatus?: number;
}
interface LiteSettings {
  company?: string | null;
  workplace?: string | null;
  overtime_rate_vnd_per_hour?: number;
  pay_day_of_month?: number;
  owner_only_mode?: boolean;
  ready?: boolean;
  configured?: boolean;
  companies?: Array<{ value: string; label: string }>;
  workplaces?: Array<{ value: string; label: string; company?: string }>;
  need_legal_check?: boolean;
}

export function AlumdoorHrPayrollLite({ mode, onExit }: { mode: AlumdoorHrPayrollLiteMode; onExit: () => void }) {
  if (mode === "employees-lite") return <EmployeesLiteScreen onExit={onExit} />;
  if (mode === "payroll-lite") return <PayrollLiteScreen onExit={onExit} />;
  if (mode === "my-slips-lite") return <MySlipsLiteScreen onExit={onExit} />;
  return <SettingsLiteScreen onExit={onExit} />;
}

function EmployeesLiteScreen({ onExit }: { onExit: () => void }) {
  const { adapter } = useMetaForge();
  const [rows, setRows] = useState<EmployeeLite[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [salaryEmployee, setSalaryEmployee] = useState<EmployeeLite | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await adapter.callPost<EmployeeLite[]>(ALUMDOOR_HR_PAYROLL_METHODS.employeeList, {}));
      setFailure("");
    } catch (error) { setFailure(errorText(adapter, error)); }
    finally { setLoading(false); }
  }, [adapter]);
  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    const needle = normalizeSearch(query);
    if (!needle) return rows;
    return rows.filter((row) => normalizeSearch(`${row.employee_name ?? ""} ${row.employee_number ?? ""} ${row.mobile ?? ""}`).includes(needle) || (row.mobile ?? "").endsWith(needle));
  }, [query, rows]);

  return <Page>
    <PageHeader icon={<Users />} title="Nhân viên" subtitle={`${rows.filter((row) => row.employee_status !== "Nghỉ việc").length} người đang làm`} onExit={onExit} action={<Button onClick={() => setCreateOpen(true)}><Plus className="mr-2 size-4" />Thêm nhân viên</Button>} />
    <div className="flex flex-col gap-2 rounded-xl border bg-card p-3 sm:flex-row sm:items-center">
      <div className="relative min-w-0 flex-1 sm:max-w-md"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tìm tên, mã hoặc 4 số cuối SĐT" /></div>
      <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}><RefreshCw className={`mr-2 size-4 ${loading ? "animate-spin" : ""}`} />Làm mới</Button>
    </div>
    {failure ? <ErrorState message={failure} retry={load} /> : loading ? <ListSkeleton /> : !rows.length ? <EmptyState icon={<UserRoundPlus />} title="Chưa có nhân viên" description="Thêm người đầu tiên chỉ với họ tên, số điện thoại và ngày bắt đầu." action={<Button onClick={() => setCreateOpen(true)}>Thêm nhân viên</Button>} /> : !filtered.length ? <EmptyState title="Không có kết quả phù hợp" description="Thử tên, mã nhân viên hoặc bốn số cuối điện thoại." /> : <>
      <div className="hidden overflow-hidden rounded-xl border md:block"><Table><TableHeader><TableRow><TableHead className="w-16">STT</TableHead><TableHead>Nhân viên</TableHead><TableHead>Điện thoại</TableHead><TableHead>Ngày bắt đầu</TableHead><TableHead>Tình trạng lương</TableHead><TableHead className="w-44">Thao tác</TableHead></TableRow></TableHeader><TableBody>{filtered.map((row, index) => <TableRow key={row.name}><TableCell>{index + 1}</TableCell><TableCell><EmployeeIdentity row={row} /></TableCell><TableCell><a href={`tel:${row.mobile ?? ""}`} className="text-primary hover:underline">{row.mobile || "—"}</a></TableCell><TableCell>{dateVi(row.date_of_joining)}</TableCell><TableCell>{row.has_pay_profile ? <Badge variant="success">Đã thiết lập</Badge> : <Badge variant="warning">Thiếu mức lương</Badge>}</TableCell><TableCell><Button size="sm" variant={row.has_pay_profile ? "outline" : "default"} onClick={() => setSalaryEmployee(row)}>{row.has_pay_profile ? "Đổi mức lương" : "Thiết lập lương"}</Button></TableCell></TableRow>)}</TableBody></Table></div>
      <div className="grid gap-3 md:hidden">{filtered.map((row) => <article key={row.name} className="rounded-xl border bg-card p-4"><div className="flex items-start gap-3"><Avatar><AvatarFallback>{initials(row.employee_name)}</AvatarFallback></Avatar><div className="min-w-0 flex-1"><div className="truncate font-semibold">{row.employee_name}</div><div className="text-xs text-muted-foreground">{row.employee_number}</div></div>{row.has_pay_profile ? <Badge variant="success">Đã có lương</Badge> : <Badge variant="warning">Thiếu lương</Badge>}</div><div className="mt-3 grid grid-cols-2 gap-2 text-sm"><a href={`tel:${row.mobile ?? ""}`} className="text-primary">{row.mobile || "—"}</a><span className="text-right text-muted-foreground">Từ {dateVi(row.date_of_joining)}</span></div><Button className="mt-4 w-full" variant={row.has_pay_profile ? "outline" : "default"} onClick={() => setSalaryEmployee(row)}>{row.has_pay_profile ? "Đổi mức lương" : "Thiết lập lương"}<ChevronRight className="ml-2 size-4" /></Button></article>)}</div>
    </>}
    <EmployeeCreateSheet open={createOpen} onOpenChange={setCreateOpen} onCreated={async (employee) => { setCreateOpen(false); await load(); setSalaryEmployee(employee); }} />
    <PayProfileSheet employee={salaryEmployee} onOpenChange={(open) => { if (!open) setSalaryEmployee(null); }} onSaved={async () => { setSalaryEmployee(null); await load(); }} />
  </Page>;
}

function EmployeeCreateSheet({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (open: boolean) => void; onCreated: (employee: EmployeeLite) => Promise<void> }) {
  const { adapter } = useMetaForge();
  const form = useForm<EmployeeLiteCreateInput>({ resolver: zodResolver(employeeLiteCreateSchema), defaultValues: { employee_name: "", mobile: "", date_of_joining: todayIso(), idempotency_key: idempotencyKey() } });
  const [failure, setFailure] = useState("");
  useEffect(() => { if (open) form.reset({ employee_name: "", mobile: "", date_of_joining: todayIso(), idempotency_key: idempotencyKey() }); }, [form, open]);
  const submit = form.handleSubmit(async (values) => {
    try { setFailure(""); await onCreated(await adapter.callPost<EmployeeLite>(ALUMDOOR_HR_PAYROLL_METHODS.employeeCreate, values)); }
    catch (error) { setFailure(errorText(adapter, error)); }
  });
  return <Sheet open={open} onOpenChange={onOpenChange}><SheetContent side="right" className="flex w-full flex-col sm:max-w-[680px]"><SheetHeader><SheetTitle>Thêm nhân viên</SheetTitle><p className="text-sm text-muted-foreground">Chỉ cần ba thông tin. Mã nhân viên và nơi làm việc được hệ thống tự điền.</p></SheetHeader><form className="flex min-h-0 flex-1 flex-col" onSubmit={(event) => void submit(event)}><div className="min-h-0 flex-1 space-y-4 overflow-y-auto py-5"><Field label="Họ và tên" error={form.formState.errors.employee_name?.message}><Input autoFocus {...form.register("employee_name")} placeholder="Nguyễn Văn A" /></Field><Field label="Số điện thoại" error={form.formState.errors.mobile?.message}><Input type="tel" inputMode="tel" {...form.register("mobile")} placeholder="09xx xxx xxx" /></Field><Field label="Ngày bắt đầu" error={form.formState.errors.date_of_joining?.message}><Input type="date" {...form.register("date_of_joining")} /></Field>{failure && <InlineError message={failure} />}</div><div className="flex justify-end gap-2 border-t py-4"><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Hủy</Button><Button type="submit" disabled={form.formState.isSubmitting}>{form.formState.isSubmitting ? "Đang lưu…" : "Lưu & thiết lập lương"}</Button></div></form></SheetContent></Sheet>;
}

function PayProfileSheet({ employee, onOpenChange, onSaved }: { employee: EmployeeLite | null; onOpenChange: (open: boolean) => void; onSaved: () => Promise<void> }) {
  const { adapter } = useMetaForge();
  const form = useForm<PayProfileLiteSaveFormInput, unknown, PayProfileLiteSaveInput>({ resolver: zodResolver(payProfileLiteSaveSchema), defaultValues: { employee: "", pay_mode: "MONTHLY", base_salary_vnd: 0, fixed_allowance_vnd: 0, effective_from: todayIso(), idempotency_key: idempotencyKey() } });
  const [failure, setFailure] = useState("");
  useEffect(() => {
    if (!employee) return;
    let active = true;
    const defaults: PayProfileLiteSaveInput = { employee: employee.name, pay_mode: "MONTHLY", base_salary_vnd: 0, fixed_allowance_vnd: 0, effective_from: employee.date_of_joining || todayIso(), idempotency_key: idempotencyKey() };
    form.reset(defaults);
    if (employee.has_pay_profile) void adapter.callPost<PayProfileLite[]>(ALUMDOOR_HR_PAYROLL_METHODS.payProfileGet, { employee: employee.name }).then((profiles) => {
      if (!active) return;
      const current = profiles.find((profile) => profile.status === "approved" || profile.docstatus === 1) ?? profiles[0];
      if (!current) return;
      const earliestChange = current.effective_from ? nextIsoDate(current.effective_from) : todayIso();
      form.reset({
        employee: employee.name,
        pay_mode: current.pay_mode ?? "MONTHLY",
        base_salary_vnd: current.base_salary_vnd ?? 0,
        fixed_allowance_vnd: current.fixed_allowance_vnd ?? 0,
        effective_from: earliestChange > todayIso() ? earliestChange : todayIso(),
        idempotency_key: idempotencyKey(),
      });
    }).catch((error) => { if (active) setFailure(errorText(adapter, error)); });
    return () => { active = false; };
  }, [adapter, employee, form]);
  const submit = form.handleSubmit(async (values) => { try { setFailure(""); await adapter.callPost(ALUMDOOR_HR_PAYROLL_METHODS.payProfileSave, values); await onSaved(); } catch (error) { setFailure(errorText(adapter, error)); } });
  return <Sheet open={Boolean(employee)} onOpenChange={onOpenChange}><SheetContent side="right" className="flex w-full flex-col sm:max-w-[680px]"><SheetHeader><SheetTitle>{employee?.has_pay_profile ? "Thay đổi mức lương" : "Thiết lập mức lương"}</SheetTitle><p className="text-sm text-muted-foreground">{employee?.employee_name} · Tăng ca cố định {money(ALUMDOOR_OVERTIME_RATE_VND_PER_HOUR)}/giờ</p></SheetHeader><form className="flex min-h-0 flex-1 flex-col" onSubmit={(event) => void submit(event)}><div className="min-h-0 flex-1 space-y-4 overflow-y-auto py-5"><Field label="Cách trả lương" error={form.formState.errors.pay_mode?.message}><Select value={form.watch("pay_mode")} onValueChange={(value) => form.setValue("pay_mode", value as "MONTHLY" | "DAILY", { shouldValidate: true })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="MONTHLY">Lương tháng</SelectItem><SelectItem value="DAILY">Lương ngày</SelectItem></SelectContent></Select></Field><Field label="Mức lương" error={form.formState.errors.base_salary_vnd?.message}><Input type="number" min={1} step={1000} inputMode="numeric" {...form.register("base_salary_vnd")} /></Field><Field label="Hiệu lực từ" error={form.formState.errors.effective_from?.message}><Input type="date" {...form.register("effective_from")} /></Field><Field label="Phụ cấp cố định (không bắt buộc)" required={false} error={form.formState.errors.fixed_allowance_vnd?.message}><Input type="number" min={0} step={1000} inputMode="numeric" {...form.register("fixed_allowance_vnd")} /></Field><div className="rounded-lg border bg-muted/30 p-3"><div className="text-sm font-medium">Tăng ca</div><div className="mt-1 text-lg font-semibold tabular-nums">50.000 ₫/giờ</div><p className="mt-1 text-xs text-muted-foreground">Tính theo tổng phút tăng ca đã duyệt và làm tròn một lần.</p></div>{failure && <InlineError message={failure} />}</div><div className="flex justify-end gap-2 border-t py-4"><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Hủy</Button><Button type="submit" disabled={form.formState.isSubmitting}>{form.formState.isSubmitting ? "Đang lưu…" : "Lưu mức lương"}</Button></div></form></SheetContent></Sheet>;
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
  const [payDay, setPayDay] = useState(5);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState("");
  const [saved, setSaved] = useState(false);
  const apply = useCallback((value: LiteSettings) => {
    setSettings(value); setCompany(value.company ?? ""); setWorkplace(value.workplace ?? ""); setPayDay(value.pay_day_of_month ?? 5);
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
    const valid = (settings?.workplaces ?? []).some((entry) => entry.value === workplace && (!entry.company || entry.company === value));
    if (!valid) setWorkplace("");
  };
  const save = async () => {
    if (!company || !workplace) { setFailure("Chọn Công ty và Nơi làm việc."); return; }
    setSaving(true); setSaved(false); setFailure("");
    try {
      const value = await adapter.callPost<LiteSettings>(ALUMDOOR_HR_PAYROLL_METHODS.settingsSave, {
        company, workplace, pay_day_of_month: payDay, idempotency_key: idempotencyKey(),
      });
      apply(value); setSaved(true);
    } catch (error) { setFailure(errorText(adapter, error)); }
    finally { setSaving(false); }
  };
  return <Page>
    <PageHeader icon={<Settings2 />} title="Cài đặt Nhân viên & Lương" subtitle="Chọn một lần để hệ thống tự điền khi thêm nhân viên và tính lương" onExit={onExit} action={<Button onClick={() => void save()} disabled={saving || !company || !workplace}>{saving ? "Đang lưu…" : "Lưu cài đặt"}</Button>} />
    {!settings ? <ListSkeleton /> : <div className="grid gap-4 lg:grid-cols-2">
      <section className="rounded-xl border bg-card p-5"><div className="flex items-center justify-between gap-3"><h2 className="font-semibold">Tổ chức sử dụng HR Lite</h2>{settings.ready ? <Badge variant="success">Sẵn sàng</Badge> : <Badge variant="warning">Cần cấu hình</Badge>}</div><p className="mt-1 text-sm text-muted-foreground">Không xóa hay thay đổi dữ liệu công ty khác. HR Lite chỉ dùng lựa chọn dưới đây.</p><div className="mt-5 space-y-4"><Field label="Công ty"><Select value={company} onValueChange={selectCompany}><SelectTrigger><SelectValue placeholder="Chọn công ty" /></SelectTrigger><SelectContent>{(settings.companies ?? []).map((entry) => <SelectItem key={entry.value} value={entry.value}>{entry.label}</SelectItem>)}</SelectContent></Select></Field><Field label="Nơi làm việc"><Select value={workplace} onValueChange={(value) => { setWorkplace(value); setSaved(false); }} disabled={!company}><SelectTrigger><SelectValue placeholder={company ? "Chọn nơi làm việc" : "Chọn công ty trước"} /></SelectTrigger><SelectContent>{workplaces.map((entry) => <SelectItem key={entry.value} value={entry.value}>{entry.label}</SelectItem>)}</SelectContent></Select></Field><Field label="Ngày trả lương mặc định"><Input type="number" inputMode="numeric" min={1} max={28} value={payDay} onChange={(event) => { setPayDay(Math.max(1, Math.min(28, Number(event.target.value) || 1))); setSaved(false); }} /></Field><Button className="w-full sm:w-auto" onClick={() => void save()} disabled={saving || !company || !workplace}>{saving ? "Đang lưu…" : "Lưu cài đặt"}</Button>{saved && <div className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400"><CheckCircle2 className="size-4" />Đã lưu. Có thể thêm nhân viên và thiết lập lương.</div>}{failure && <InlineError message={failure} />}</div></section>
      <SettingsCard title="Tính lương"><SettingRow label="Tăng ca" value={`${money(settings.overtime_rate_vnd_per_hour)}/giờ`} /><SettingRow label="Ngày trả mặc định" value={`Ngày ${payDay} tháng sau`} /><SettingRow label="Quy trình" value={settings.owner_only_mode ? "Chủ tự tính và chốt" : "Có người chuẩn bị riêng"} /></SettingsCard>
      {settings.need_legal_check && <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100 lg:col-span-2"><div className="flex gap-3"><CircleAlert className="mt-0.5 size-5 shrink-0" /><div><div className="font-medium">Cần xác nhận bộ quy tắc pháp lý trước khi dùng production</div><p className="mt-1 text-sm opacity-80">Mức 50.000đ/giờ là chính sách doanh nghiệp. Hệ thống vẫn đối chiếu sàn áp dụng theo từng loại ngày/giờ trước khi chốt chính thức.</p></div></div></div>}
    </div>}
  </Page>;
}

function Page({ children }: { children: ReactNode }) { return <main className="min-h-full bg-background p-3 md:p-5"><div className="mx-auto flex max-w-[1600px] flex-col gap-4">{children}</div></main>; }
function PageHeader({ icon, title, subtitle, onExit, action }: { icon: ReactNode; title: string; subtitle: string; onExit: () => void; action?: ReactNode }) { return <header className="flex flex-col gap-3 rounded-xl border bg-card p-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-3"><Button variant="ghost" size="icon" onClick={onExit} aria-label="Quay lại"><ArrowLeft className="size-4" /></Button><span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary [&_svg]:size-5">{icon}</span><div><h1 className="text-xl font-semibold">{title}</h1><p className="text-sm text-muted-foreground">{subtitle}</p></div></div>{action}</header>; }
function Field({ label, error, required = true, children }: { label: string; error?: string; required?: boolean; children: ReactNode }) { return <div className="space-y-1.5"><Label>{label}{required ? <> <span className="text-destructive">*</span></> : null}</Label>{children}{error && <p className="text-sm text-destructive">{error}</p>}</div>; }
function EmployeeIdentity({ row }: { row: EmployeeLite }) { return <div className="flex items-center gap-3"><Avatar><AvatarFallback>{initials(row.employee_name)}</AvatarFallback></Avatar><div><div className="font-medium">{row.employee_name}</div><div className="text-xs text-muted-foreground">{row.employee_number}</div></div></div>; }
function Metric({ label, value }: { label: string; value: ReactNode }) { return <div className="rounded-xl border bg-card p-4"><div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div><div className="mt-2 text-lg font-semibold tabular-nums">{value}</div></div>; }
function EmptyState({ icon, title, description, action }: { icon?: ReactNode; title: string; description: string; action?: ReactNode }) { return <div className="grid min-h-64 place-items-center rounded-xl border border-dashed bg-muted/10 p-6 text-center"><div>{icon && <span className="mx-auto mb-3 grid size-12 place-items-center rounded-full bg-primary/10 text-primary [&_svg]:size-6">{icon}</span>}<h2 className="font-semibold">{title}</h2><p className="mt-1 max-w-md text-sm text-muted-foreground">{description}</p>{action && <div className="mt-4">{action}</div>}</div></div>; }
function ErrorState({ message, retry }: { message: string; retry: () => Promise<void> }) { return <EmptyState icon={<CircleAlert />} title="Chưa tải được dữ liệu" description={message} action={<Button variant="outline" onClick={() => void retry()}>Thử lại</Button>} />; }
function InlineError({ message }: { message: string }) { return <div className="flex gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"><CircleAlert className="mt-0.5 size-4 shrink-0" />{message}</div>; }
function ListSkeleton() { return <div className="space-y-3 rounded-xl border p-4">{[0, 1, 2, 3].map((value) => <Skeleton key={value} className="h-14 w-full" />)}</div>; }
function StateBadge({ value }: { value?: string }) { const state = value || "draft"; if (["paid"].includes(state)) return <Badge variant="success">Đã trả</Badge>; if (["approved", "finalized"].includes(state)) return <Badge variant="info">Đã chốt</Badge>; if (["calculated", "ready", "pending_approval"].includes(state)) return <Badge variant="warning">Sẵn sàng</Badge>; return <Badge variant="secondary">Bản nháp</Badge>; }
function SettingsCard({ title, children }: { title: string; children: ReactNode }) { return <section className="rounded-xl border bg-card p-5"><h2 className="font-semibold">{title}</h2><div className="mt-4 divide-y">{children}</div></section>; }
function SettingRow({ label, value }: { label: string; value: ReactNode }) { return <div className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0"><span className="text-sm text-muted-foreground">{label}</span><span className="text-right text-sm font-medium">{value}</span></div>; }

function errorText(adapter: { mapError: (error: unknown) => { message: string } }, error: unknown): string { const direct = (error as { message?: unknown } | undefined)?.message; return typeof direct === "string" && direct.trim() ? direct.trim() : adapter.mapError(error).message; }
function todayIso(): string { const value = new Date(); return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`; }
function nextIsoDate(value: string): string { const date = new Date(`${value}T00:00:00Z`); date.setUTCDate(date.getUTCDate() + 1); return date.toISOString().slice(0, 10); }
function idempotencyKey(): string { return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `alu-${Date.now()}-${Math.random().toString(36).slice(2)}`; }
function normalizeSearch(value: string): string { return value.normalize("NFD").replace(/[\u0300-\u036f]/gu, "").toLocaleLowerCase("vi").trim(); }
function initials(value?: string): string { return (value ?? "NV").split(/\s+/u).filter(Boolean).slice(-2).map((part) => part[0]?.toUpperCase()).join("") || "NV"; }
function dateVi(value?: string): string { if (!value) return "—"; const [year, month, day] = value.split("-"); return year && month && day ? `${day}/${month}/${year}` : value; }
function monthLabel(value?: string): string { if (!value) return "—"; const [year, month] = value.split("-"); return year && month ? `${month}/${year}` : value; }
function money(value: unknown): string { return `${Math.round(Number(value) || 0).toLocaleString("vi-VN")} ₫`; }
function duration(value: unknown): string { const minutes = Math.max(0, Math.round(Number(value) || 0)); return `${Math.floor(minutes / 60)}g${minutes % 60 ? ` ${minutes % 60}p` : ""}`; }
function workDays(value: unknown): string { return (Math.max(0, Number(value) || 0) / 10_000).toLocaleString("vi-VN", { maximumFractionDigits: 2 }); }
function salaryTotals(rows: SalarySlip[]): { net: number } { return { net: rows.reduce((sum, row) => sum + (Number(row.net_pay) || 0), 0) }; }
