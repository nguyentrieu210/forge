import { formatMoney } from "@metaforge/core";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Banknote, CalendarDays, CheckCircle2, Clock3, Loader2, MapPin, Printer, RefreshCw, ReceiptText,
  Save, Send, TriangleAlert, UserPlus, WalletCards,
} from "lucide-react";
import { useMetaForge } from "@metaforge/views/provider";
import { Button } from "@metaforge/ui";
import qrcode from "qrcode-generator";

export type AlumdoorAttendanceMode = "kiosk" | "today" | "month" | "exceptions" | "employees-lite" | "payroll-run" | "payroll-my-slips" | "hr-settings";

interface AttendanceSegment {
  segment_code?: string;
  actual_in?: string;
  actual_out?: string;
  state?: string;
}
interface AttendanceDay {
  name: string;
  employee?: string;
  work_date?: string;
  state?: string;
  locked_by_payroll?: string;
  regular_minutes?: number;
  overtime_minutes?: number;
  payable_work_fraction_bp?: number;
  segments?: AttendanceSegment[];
}
interface CorrectionRequest {
  name: string;
  employee?: string;
  from_date?: string;
  alu_segment_code?: string;
  alu_requested_in?: string;
  alu_requested_out?: string;
  reason?: string;
  alu_reviewed_at?: string;
}
interface PayrollPeriod {
  name: string;
  company?: string;
  branch?: string;
  start_date?: string;
  end_date?: string;
  alu_state?: string;
  alu_standard_work_days_bp?: number;
  employee_count?: number;
  alu_regular_minutes?: number;
  alu_overtime_minutes?: number;
  alu_base_pay_vnd?: number;
  alu_overtime_pay_vnd?: number;
  alu_allowance_vnd?: number;
  alu_advance_vnd?: number;
  alu_deduction_vnd?: number;
  total_net_pay?: string | number;
}
interface SalarySlip {
  name: string;
  employee?: string;
  start_date?: string;
  end_date?: string;
  alu_state?: string;
  alu_work_fraction_bp?: number;
  alu_regular_minutes?: number;
  alu_overtime_minutes?: number;
  alu_base_pay_vnd?: number;
  alu_overtime_pay_vnd?: number;
  alu_allowance_vnd?: number;
  alu_advance_vnd?: number;
  alu_manual_deduction_vnd?: number;
  net_pay?: string | number;
}
interface LiteChoice { value: string; label: string; company?: string; currency?: string }
interface LiteSettings {
  company: string; workplace: string; currency: string; ready: boolean; configured: boolean;
  morning_start: string; morning_end: string; afternoon_start: string; afternoon_end: string;
  overtime_start: string; pay_day_of_month: number; owner_only_mode: boolean;
  overtime_rate_vnd_per_hour: number; companies: LiteChoice[]; workplaces: LiteChoice[]; currencies: LiteChoice[];
}
interface StationQr { station: string; station_name: string; token: string; token_version: string | number }
interface EmployeeLiteResult { name: string; employee_name: string; mobile: string }
interface EmployeeChoice { name: string; employee_name?: string }

const inputClass = "h-9 rounded-md border border-input bg-background px-3 text-sm outline-none transition focus:border-primary focus:ring-1 focus:ring-primary/25";
const tableCell = "whitespace-nowrap border-b px-3 py-2.5 text-sm";
const headerCell = "sticky top-0 z-10 whitespace-nowrap border-b bg-muted/95 px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground backdrop-blur";

function errorText(adapter: { mapError: (error: unknown) => { message: string } }, error: unknown): string {
  const direct = (error as { message?: unknown } | undefined)?.message;
  if (typeof direct === "string" && direct.trim()) return direct.trim();
  return adapter.mapError(error).message;
}
function todayIso(): string { return new Date().toISOString().slice(0, 10); }
function monthIso(): string { return todayIso().slice(0, 7); }
function monthBounds(month: string): { from: string; to: string } {
  const [year, number] = month.split("-").map(Number);
  const last = new Date(Date.UTC(year, number, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, "0")}` };
}
function minutes(value: unknown): string {
  const total = Number.isFinite(Number(value)) ? Math.max(0, Math.round(Number(value))) : 0;
  return `${Math.floor(total / 60)}g ${String(total % 60).padStart(2, "0")}p`;
}
function workDays(bp: unknown): string { return (Math.max(0, Number(bp) || 0) / 10_000).toLocaleString("vi-VN", { maximumFractionDigits: 2 }); }
function money(value: unknown): string { return formatMoney(Math.round(Number(value) || 0), { style: "dong" }); }
function segmentName(code: string | undefined): string {
  if (code === "SHIFT1") return "Ca 1";
  if (code === "SHIFT2") return "Ca 2";
  if (code === "SHIFT3") return "Ca 3";
  return code || "—";
}
function clock(value: string | undefined): string {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", hour12: false });
}
function segmentValue(day: AttendanceDay, code: string): string {
  const segment = day.segments?.find((row) => row.segment_code === code);
  if (!segment) return "—";
  if (segment.actual_in && segment.actual_out) return `${clock(segment.actual_in)}–${clock(segment.actual_out)}`;
  if (segment.actual_in) return `${clock(segment.actual_in)}–Thiếu ra`;
  if (segment.actual_out) return `Thiếu vào–${clock(segment.actual_out)}`;
  return "—";
}
function stateLabel(value: string | undefined): string {
  return ({
    open: "Đang mở", complete: "Đủ công", exception: "Ngoại lệ", approved: "Đã duyệt",
    locked: "Đã khóa", draft: "Nháp", calculated: "Đã tính", pending_approval: "Chờ duyệt",
    paid: "Đã trả", cancelled: "Đã hủy", invalidated: "Cần tính lại",
  } as Record<string, string>)[value ?? ""] ?? value ?? "—";
}
function StateBadge({ value }: { value?: string }) {
  const danger = value === "exception" || value === "invalidated";
  const success = value === "approved" || value === "locked" || value === "paid" || value === "complete";
  return <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${danger ? "border-destructive/30 bg-destructive/5 text-destructive" : success ? "border-primary/25 bg-primary/5 text-primary" : "bg-muted/50 text-muted-foreground"}`}>{stateLabel(value)}</span>;
}
function Empty({ children }: { children: ReactNode }) { return <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">{children}</div>; }
function Failure({ message }: { message: string }) { return <div className="flex items-start gap-2 rounded-xl border border-destructive/25 bg-destructive/5 p-4 text-sm text-destructive"><TriangleAlert className="mt-0.5 size-4 shrink-0" />{message}</div>; }
function PageTitle({ title, subtitle, onExit }: { title: string; subtitle: string; onExit: () => void }) {
  return <div className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-xl font-semibold tracking-tight">{title}</h1><p className="mt-1 text-sm text-muted-foreground">{subtitle}</p></div><Button variant="ghost" size="sm" onClick={onExit}>← Tổng quan</Button></div>;
}

export function AlumdoorAttendanceOperations({ mode, onExit }: { mode: AlumdoorAttendanceMode; onExit: () => void }) {
  if (mode === "kiosk") return <KioskScreen onExit={onExit} />;
  if (mode === "today") return <TodayScreen onExit={onExit} />;
  if (mode === "month") return <MonthScreen onExit={onExit} />;
  if (mode === "exceptions") return <ExceptionScreen onExit={onExit} />;
  if (mode === "employees-lite") return <EmployeesLiteScreen onExit={onExit} />;
  if (mode === "payroll-run") return <PayrollScreen onExit={onExit} />;
  if (mode === "hr-settings") return <HrSettingsScreen onExit={onExit} />;
  return <MySlipsScreen onExit={onExit} />;
}

function idempotency(prefix: string): string {
  const random = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}:${random}`;
}

function StaticQr({ value, label }: { value: string; label: string }) {
  const matrix = useMemo(() => {
    if (!value) return null;
    const qr = qrcode(0, "M");
    qr.addData(value); qr.make();
    const size = qr.getModuleCount();
    let path = "";
    for (let row = 0; row < size; row += 1) for (let column = 0; column < size; column += 1) {
      if (qr.isDark(row, column)) path += `M${column} ${row}h1v1h-1z`;
    }
    return { size, path };
  }, [value]);
  if (!matrix) return null;
  return <svg className="size-64 max-w-full border-8 border-white bg-white shadow-sm" viewBox={`0 0 ${matrix.size} ${matrix.size}`} shapeRendering="crispEdges" role="img" aria-label={label}><rect width={matrix.size} height={matrix.size} fill="white" /><path d={matrix.path} fill="black" /></svg>;
}

function KioskScreen({ onExit }: { onExit: () => void }) {
  const { adapter } = useMetaForge();
  const [station, setStation] = useState(() => typeof localStorage === "undefined" ? "" : localStorage.getItem("alumdoor-attendance-print-station") ?? "");
  const [stationName, setStationName] = useState("");
  const [latitude, setLatitude] = useState(""); const [longitude, setLongitude] = useState(""); const [radius, setRadius] = useState("50");
  const [qr, setQr] = useState<StationQr | null>(null); const [failure, setFailure] = useState(""); const [loading, setLoading] = useState(false);
  const [createKey, setCreateKey] = useState(() => idempotency("station"));
  const loadQr = useCallback(async (code: string) => {
    if (!code) return;
    setLoading(true);
    try { setQr(await adapter.callPost<StationQr>("alumdoor.attendance.station_qr", { station: code })); setFailure(""); }
    catch (error) { setFailure(errorText(adapter, error)); }
    finally { setLoading(false); }
  }, [adapter]);
  useEffect(() => { if (station) void loadQr(station); }, [loadQr, station]);
  const locate = () => {
    if (!navigator.geolocation) { setFailure("Thiết bị này không hỗ trợ lấy vị trí."); return; }
    navigator.geolocation.getCurrentPosition(
      (position) => { setLatitude(position.coords.latitude.toFixed(6)); setLongitude(position.coords.longitude.toFixed(6)); setFailure(""); },
      () => setFailure("Không lấy được vị trí. Hãy cho phép GPS rồi thử lại."),
      { enableHighAccuracy: true, timeout: 15_000 },
    );
  };
  const create = async () => {
    setLoading(true);
    try {
      const created = await adapter.callPost<{ name: string }>("alumdoor.attendance.station_create_lite", {
        station_name: stationName.trim(), latitude: Number(latitude), longitude: Number(longitude),
        allowed_radius_m: Number(radius), idempotency_key: createKey,
      });
      setStation(created.name); localStorage.setItem("alumdoor-attendance-print-station", created.name);
      setCreateKey(idempotency("station")); setFailure("");
    } catch (error) { setFailure(errorText(adapter, error)); }
    finally { setLoading(false); }
  };
  const rotate = async () => {
    if (!qr || !window.confirm("QR cũ sẽ ngừng dùng ngay. Tạo lại QR trạm?")) return;
    setLoading(true);
    try { setQr(await adapter.callPost<StationQr>("alumdoor.attendance.rotate_station_qr", { station: qr.station })); setFailure(""); }
    catch (error) { setFailure(errorText(adapter, error)); }
    finally { setLoading(false); }
  };
  return <Shell><PageTitle title="In mã QR cố định của trạm" subtitle="QR giữ nguyên cho đến khi quản lý chủ động tạo lại để thu hồi bản in cũ." onExit={onExit} />
    {failure && <Failure message={failure} />}
    {!station ? <section className="rounded-xl border bg-card p-4"><h2 className="font-medium">Thiết lập trạm chấm công</h2><p className="mt-1 text-sm text-muted-foreground">Cấu hình giờ làm phải được lưu trước. Vị trí và bán kính được server kiểm tra mỗi lần quét.</p><div className="mt-4 grid gap-3 md:grid-cols-2"><input className={inputClass} value={stationName} onChange={(event) => setStationName(event.target.value)} placeholder="Tên trạm, ví dụ Cổng xưởng" /><div className="flex gap-2"><input className={`${inputClass} min-w-0 flex-1`} inputMode="decimal" value={latitude} onChange={(event) => setLatitude(event.target.value)} placeholder="Vĩ độ" /><input className={`${inputClass} min-w-0 flex-1`} inputMode="decimal" value={longitude} onChange={(event) => setLongitude(event.target.value)} placeholder="Kinh độ" /></div><input className={inputClass} type="number" min="10" max="500" value={radius} onChange={(event) => setRadius(event.target.value)} placeholder="Bán kính (m)" /><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={locate}><MapPin className="mr-2 size-4" />Dùng vị trí hiện tại</Button><Button onClick={() => void create()} disabled={loading || stationName.trim().length < 2 || !latitude || !longitude}><Save className="mr-2 size-4" />Tạo trạm</Button></div></div></section>
      : loading && !qr ? <Empty><Loader2 className="mx-auto mb-2 size-5 animate-spin" />Đang lấy QR trạm…</Empty>
        : qr && <section className="mx-auto flex w-full max-w-xl flex-col items-center gap-4 rounded-xl border bg-white p-6 text-center text-slate-950 print:border-0 print:shadow-none"><div><h2 className="text-xl font-semibold">{qr.station_name}</h2><p className="mt-1 text-sm text-slate-600">Mã trạm: {qr.station}</p></div><StaticQr value={qr.token} label={`QR trạm ${qr.station_name}`} /><p className="text-sm text-slate-600">Phiên bản token: {qr.token_version}</p><div className="flex flex-wrap justify-center gap-2 print:hidden"><Button onClick={() => window.print()}><Printer className="mr-2 size-4" />In QR</Button><Button variant="outline" onClick={() => void rotate()} disabled={loading}>Tạo lại QR</Button><Button variant="ghost" onClick={() => { localStorage.removeItem("alumdoor-attendance-print-station"); setStation(""); setQr(null); }}>Đổi trạm</Button></div></section>}
  </Shell>;
}

function EmployeesLiteScreen({ onExit }: { onExit: () => void }) {
  const { adapter } = useMetaForge();
  const [fullName, setFullName] = useState(""); const [mobile, setMobile] = useState(""); const [joining, setJoining] = useState(todayIso());
  const [employeeKey, setEmployeeKey] = useState(() => idempotency("employee")); const [created, setCreated] = useState<EmployeeLiteResult | null>(null);
  const [employees, setEmployees] = useState<EmployeeChoice[]>([]); const [employee, setEmployee] = useState("");
  const [payMode, setPayMode] = useState("MONTHLY"); const [salary, setSalary] = useState(""); const [allowance, setAllowance] = useState("0"); const [effective, setEffective] = useState(todayIso());
  const [profileKey, setProfileKey] = useState(() => idempotency("pay-profile")); const [failure, setFailure] = useState(""); const [success, setSuccess] = useState(""); const [busy, setBusy] = useState(false);
  const loadEmployees = useCallback(async () => {
    try {
      const rows = await adapter.callPost<EmployeeChoice[]>("frappe.client.get_list", { doctype: "Employee", fields: ["name", "employee_name"], limit_page_length: 500, order_by: "employee_name asc" });
      setEmployees(rows);
    } catch { /* A newly provisioned tenant may not yet have readable employees. */ }
  }, [adapter]);
  useEffect(() => { void loadEmployees(); }, [loadEmployees]);
  const createEmployee = async () => {
    setBusy(true);
    try {
      const result = await adapter.callPost<EmployeeLiteResult>("alumdoor.hr.employee_lite_create", { employee_name: fullName, mobile, date_of_joining: joining, idempotency_key: employeeKey });
      setCreated(result); setEmployee(result.name); setFullName(""); setMobile(""); setEmployeeKey(idempotency("employee")); setSuccess(`Đã tạo ${result.employee_name} (${result.name}).`); setFailure(""); await loadEmployees();
    } catch (error) { setFailure(errorText(adapter, error)); setSuccess(""); }
    finally { setBusy(false); }
  };
  const saveProfile = async () => {
    setBusy(true);
    try {
      await adapter.callPost("alumdoor.hr.pay_profile_lite_save", { employee, pay_mode: payMode, base_salary_vnd: Number(salary), fixed_allowance_vnd: Number(allowance), effective_from: effective, idempotency_key: profileKey });
      setProfileKey(idempotency("pay-profile")); setSuccess(`Đã duyệt hồ sơ lương mới cho ${employee}.`); setFailure("");
    } catch (error) { setFailure(errorText(adapter, error)); setSuccess(""); }
    finally { setBusy(false); }
  };
  return <Shell><PageTitle title="Nhân viên & mức lương" subtitle="Tạo nhân viên tối giản và lưu hồ sơ lương có ngày hiệu lực; hồ sơ cũ được đóng tự động." onExit={onExit} />
    {failure && <Failure message={failure} />}{success && <div className="rounded-xl border border-primary/25 bg-primary/5 p-4 text-sm text-primary">{success}</div>}
    <div className="grid gap-4 lg:grid-cols-2"><section className="rounded-xl border bg-card p-4"><h2 className="flex items-center gap-2 font-medium"><UserPlus className="size-4" />Thêm nhân viên</h2><div className="mt-4 grid gap-3"><input className={inputClass} value={fullName} onChange={(event) => setFullName(event.target.value)} placeholder="Họ và tên" /><input className={inputClass} inputMode="tel" value={mobile} onChange={(event) => setMobile(event.target.value)} placeholder="Số điện thoại" /><label className="text-xs text-muted-foreground">Ngày vào làm<input className={`${inputClass} mt-1 w-full`} type="date" value={joining} onChange={(event) => setJoining(event.target.value)} /></label><Button onClick={() => void createEmployee()} disabled={busy || !fullName.trim() || !mobile.trim()}><UserPlus className="mr-2 size-4" />Tạo nhân viên</Button>{created && <p className="text-xs text-muted-foreground">Mã vừa tạo: <strong>{created.name}</strong></p>}</div></section>
      <section className="rounded-xl border bg-card p-4"><h2 className="flex items-center gap-2 font-medium"><WalletCards className="size-4" />Mức lương hiệu lực</h2><div className="mt-4 grid gap-3"><input className={inputClass} list="employee-lite-options" value={employee} onChange={(event) => setEmployee(event.target.value)} placeholder="Mã nhân viên" /><datalist id="employee-lite-options">{employees.map((row) => <option key={row.name} value={row.name}>{row.employee_name ?? row.name}</option>)}</datalist><select className={inputClass} value={payMode} onChange={(event) => setPayMode(event.target.value)}><option value="MONTHLY">Lương tháng</option><option value="DAILY">Lương ngày</option></select><input className={inputClass} type="number" min="0" step="1000" value={salary} onChange={(event) => setSalary(event.target.value)} placeholder="Lương cơ bản (VND)" /><input className={inputClass} type="number" min="0" step="1000" value={allowance} onChange={(event) => setAllowance(event.target.value)} placeholder="Phụ cấp cố định (VND)" /><label className="text-xs text-muted-foreground">Hiệu lực từ<input className={`${inputClass} mt-1 w-full`} type="date" value={effective} onChange={(event) => setEffective(event.target.value)} /></label><Button onClick={() => void saveProfile()} disabled={busy || !employee || salary === ""}><Save className="mr-2 size-4" />Lưu và duyệt mức lương</Button></div></section></div>
  </Shell>;
}

function HrSettingsScreen({ onExit }: { onExit: () => void }) {
  const { adapter } = useMetaForge();
  const [settings, setSettings] = useState<LiteSettings | null>(null); const [failure, setFailure] = useState(""); const [success, setSuccess] = useState(""); const [busy, setBusy] = useState(false);
  const [saveKey, setSaveKey] = useState(() => idempotency("hr-settings"));
  /**
   * Ô Công ty / Nơi làm việc / Tiền tệ phải mang GIÁ TRỊ THẬT ngay khi mở màn.
   *
   * Server trả về cấu hình chưa lưu lần nào thì `company` là chuỗi rỗng. `<select>` được
   * controlled bằng đúng chuỗi rỗng đó, nên trình duyệt hiển thị option đầu tiên trong khi state
   * vẫn trống — người dùng thấy "ALUMDOOR" trên màn, bấm Lưu, và server nhận `company: ""` rồi
   * trả 422. Chạm vào ô rồi đổi qua đổi lại mới chạy `onChange` và lưu được: đúng triệu chứng
   * đo ngày 23/08/2026, và nó chặn luôn việc tạo trạm chấm công vì màn trạm đòi có cấu hình.
   *
   * Điền sẵn lựa chọn đầu tiên là nói đúng thứ người dùng đang NHÌN THẤY.
   */
  const load = useCallback(async () => {
    setBusy(true);
    try {
      const doc = await adapter.callPost<LiteSettings>("alumdoor.hr.payroll_lite_settings_get", {});
      const dau = <T,>(rows: ReadonlyArray<{ value: T }> | undefined) => rows?.[0]?.value;
      const company = doc.company || dau(doc.companies) || "";
      setSettings({
        ...doc,
        company,
        workplace: doc.workplace || dau(doc.workplaces?.filter((row) => !row.company || row.company === company)) || "",
        currency: doc.currency || dau(doc.currencies) || "",
      });
      setFailure("");
    } catch (error) { setFailure(errorText(adapter, error)); } finally { setBusy(false); }
  }, [adapter]);
  useEffect(() => { void load(); }, [load]);
  const patch = <K extends keyof LiteSettings>(field: K, value: LiteSettings[K]) => setSettings((current) => current ? { ...current, [field]: value } : current);
  const save = async () => {
    if (!settings) return;
    setBusy(true);
    try {
      const next = await adapter.callPost<LiteSettings>("alumdoor.hr.payroll_lite_settings_save", { company: settings.company, workplace: settings.workplace, currency: settings.currency, morning_start: settings.morning_start, morning_end: settings.morning_end, afternoon_start: settings.afternoon_start, afternoon_end: settings.afternoon_end, overtime_start: settings.overtime_start, pay_day_of_month: settings.pay_day_of_month, idempotency_key: saveKey });
      setSettings(next); setSaveKey(idempotency("hr-settings")); setSuccess("Đã lưu cấu hình giờ làm và kỳ lương."); setFailure("");
    } catch (error) { setFailure(errorText(adapter, error)); setSuccess(""); }
    finally { setBusy(false); }
  };
  return <Shell><PageTitle title="Cài đặt nhân sự & tiền lương" subtitle="Nguồn duy nhất cho công ty, nơi làm việc, giờ thường và giờ bắt đầu tăng ca." onExit={onExit} />
    {failure && <Failure message={failure} />}{success && <div className="rounded-xl border border-primary/25 bg-primary/5 p-4 text-sm text-primary">{success}</div>}
    {!settings ? <Empty>{busy ? <><Loader2 className="mx-auto mb-2 size-5 animate-spin" />Đang đọc cấu hình…</> : <Button variant="outline" onClick={() => void load()}>Thử lại</Button>}</Empty> : <section className="rounded-xl border bg-card p-4"><div className="grid gap-4 md:grid-cols-3"><label className="text-xs text-muted-foreground">Công ty<select className={`${inputClass} mt-1 w-full`} value={settings.company} onChange={(event) => patch("company", event.target.value)}>{settings.companies.map((row) => <option key={row.value} value={row.value}>{row.label}</option>)}</select></label><label className="text-xs text-muted-foreground">Nơi làm việc<select className={`${inputClass} mt-1 w-full`} value={settings.workplace} onChange={(event) => patch("workplace", event.target.value)}>{settings.workplaces.filter((row) => !row.company || row.company === settings.company).map((row) => <option key={row.value} value={row.value}>{row.label}</option>)}</select></label><label className="text-xs text-muted-foreground">Tiền tệ<select className={`${inputClass} mt-1 w-full`} value={settings.currency} onChange={(event) => patch("currency", event.target.value)}>{settings.currencies.map((row) => <option key={row.value} value={row.value}>{row.label}</option>)}</select></label></div><div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">{([['morning_start','Sáng bắt đầu'],['morning_end','Sáng kết thúc'],['afternoon_start','Chiều bắt đầu'],['afternoon_end','Chiều kết thúc'],['overtime_start','Tăng ca từ']] as const).map(([field, label]) => <label key={field} className="text-xs text-muted-foreground">{label}<input className={`${inputClass} mt-1 w-full`} type="time" value={settings[field]} onChange={(event) => patch(field, event.target.value)} /></label>)}</div><div className="mt-4 grid gap-4 md:grid-cols-3"><label className="text-xs text-muted-foreground">Ngày trả lương<input className={`${inputClass} mt-1 w-full`} type="number" min="1" max="28" value={settings.pay_day_of_month} onChange={(event) => patch("pay_day_of_month", Number(event.target.value))} /></label><div className="rounded-lg border bg-muted/30 p-3 text-sm"><span className="text-muted-foreground">Tăng ca cố định</span><div className="mt-1 font-semibold">{money(settings.overtime_rate_vnd_per_hour)} / giờ</div></div><div className="flex items-end"><Button className="w-full" onClick={() => void save()} disabled={busy || !settings.ready}><Save className="mr-2 size-4" />Lưu cấu hình</Button></div></div>{!settings.ready && <p className="mt-3 text-sm text-destructive">Thiếu danh mục Công ty hoặc Nơi làm việc. Cần bổ sung danh mục trước khi lưu.</p>}</section>}
  </Shell>;
}

function TodayScreen({ onExit }: { onExit: () => void }) {
  const { adapter } = useMetaForge();
  const [date, setDate] = useState(todayIso());
  const [rows, setRows] = useState<AttendanceDay[]>([]);
  const [loading, setLoading] = useState(false);
  const [failure, setFailure] = useState("");
  const [segment, setSegment] = useState("SHIFT1");
  const [requestedIn, setRequestedIn] = useState("");
  const [requestedOut, setRequestedOut] = useState("");
  const [reason, setReason] = useState("");
  const [sending, setSending] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    try { setRows(await adapter.callPost<AttendanceDay[]>("alumdoor.attendance.today", { date })); setFailure(""); }
    catch (error) { setFailure(errorText(adapter, error)); }
    finally { setLoading(false); }
  }, [adapter, date]);
  useEffect(() => { void load(); }, [load]);
  const day = rows[0];
  const submit = async () => {
    if (!reason.trim() || (!requestedIn && !requestedOut)) return;
    setSending(true);
    try {
      await adapter.callPost("alumdoor.attendance.submit_correction", {
        work_date: date,
        segment_code: segment,
        ...(requestedIn ? { requested_in: new Date(requestedIn).toISOString() } : {}),
        ...(requestedOut ? { requested_out: new Date(requestedOut).toISOString() } : {}),
        reason: reason.trim(),
      });
      setReason(""); setRequestedIn(""); setRequestedOut("");
      await load();
    } catch (error) { setFailure(errorText(adapter, error)); }
    finally { setSending(false); }
  };
  return <Shell><PageTitle title="Công hôm nay" subtitle="Ba ca, giờ thường và tăng ca lấy trực tiếp từ log QR server." onExit={onExit} />
    <Toolbar><label className="text-xs text-muted-foreground">Ngày <input className={`${inputClass} ml-2`} type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label><Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}><RefreshCw className={`mr-2 size-4 ${loading ? "animate-spin" : ""}`} />Làm mới</Button></Toolbar>
    {failure && <Failure message={failure} />}
    {loading && !day ? <Empty><Loader2 className="mx-auto mb-2 size-5 animate-spin" />Đang đọc dữ liệu công…</Empty> : !day ? <Empty>Chưa có dữ liệu công ngày này.</Empty> : <>
      <div className="grid gap-3 md:grid-cols-4"><Metric label="Ngày công" value={workDays(day.payable_work_fraction_bp)} /><Metric label="Giờ thường" value={minutes(day.regular_minutes)} /><Metric label="Tăng ca" value={minutes(day.overtime_minutes)} /><Metric label="Trạng thái" value={<StateBadge value={day.state} />} /></div>
      <div className="overflow-auto rounded-xl border"><table className="w-full border-collapse"><thead><tr><th className={headerCell}>Ca</th><th className={headerCell}>Giờ vào</th><th className={headerCell}>Giờ ra</th><th className={headerCell}>Trạng thái</th></tr></thead><tbody>{["SHIFT1", "SHIFT2", "SHIFT3"].map((code) => { const item = day.segments?.find((row) => row.segment_code === code); return <tr key={code}><td className={tableCell}>{segmentName(code)}</td><td className={tableCell}>{clock(item?.actual_in)}</td><td className={tableCell}>{clock(item?.actual_out)}</td><td className={tableCell}><StateBadge value={item?.state} /></td></tr>; })}</tbody></table></div>
      {day.state !== "locked" && <section className="rounded-xl border p-4"><h2 className="font-medium">Gửi yêu cầu sửa công</h2><p className="mt-1 text-xs text-muted-foreground">Không sửa trực tiếp bảng công. Yêu cầu phải được quản lý duyệt trước khi áp dụng.</p><div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-5"><select className={inputClass} value={segment} onChange={(event) => setSegment(event.target.value)}><option value="SHIFT1">Ca 1</option><option value="SHIFT2">Ca 2</option><option value="SHIFT3">Ca 3</option></select><input className={inputClass} type="datetime-local" value={requestedIn} onChange={(event) => setRequestedIn(event.target.value)} aria-label="Giờ vào đề nghị" /><input className={inputClass} type="datetime-local" value={requestedOut} onChange={(event) => setRequestedOut(event.target.value)} aria-label="Giờ ra đề nghị" /><input className={inputClass} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Lý do sửa công" /><Button onClick={() => void submit()} disabled={sending || !reason.trim() || (!requestedIn && !requestedOut)}><Send className="mr-2 size-4" />Gửi yêu cầu</Button></div></section>}
    </>}
  </Shell>;
}

function MonthScreen({ onExit }: { onExit: () => void }) {
  const { adapter } = useMetaForge();
  const [month, setMonth] = useState(monthIso());
  const [employee, setEmployee] = useState("");
  const [rows, setRows] = useState<AttendanceDay[]>([]);
  const [loading, setLoading] = useState(false);
  const [failure, setFailure] = useState("");
  const load = useCallback(async () => { setLoading(true); try { setRows(await adapter.callPost<AttendanceDay[]>("alumdoor.attendance.month", { month, ...(employee.trim() ? { employee: employee.trim() } : {}) })); setFailure(""); } catch (error) { setFailure(errorText(adapter, error)); } finally { setLoading(false); } }, [adapter, employee, month]);
  useEffect(() => { void load(); }, [load]);
  const totals = useMemo(() => rows.reduce((sum, row) => ({ regular: sum.regular + (Number(row.regular_minutes) || 0), overtime: sum.overtime + (Number(row.overtime_minutes) || 0), days: sum.days + (Number(row.payable_work_fraction_bp) || 0) }), { regular: 0, overtime: 0, days: 0 }), [rows]);
  return <Shell><PageTitle title="Bảng công" subtitle="Bảng vận hành theo ngày; dữ liệu locked đã thuộc một kỳ lương và không sửa trực tiếp." onExit={onExit} />
    <Toolbar><input className={inputClass} type="month" value={month} onChange={(event) => setMonth(event.target.value)} /><input className={`${inputClass} min-w-48`} value={employee} onChange={(event) => setEmployee(event.target.value)} placeholder="Mã nhân viên (tùy chọn)" /><Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}><RefreshCw className={`mr-2 size-4 ${loading ? "animate-spin" : ""}`} />Làm mới</Button></Toolbar>
    {failure && <Failure message={failure} />}
    <div className="grid gap-3 md:grid-cols-3"><Metric label="Ngày công" value={workDays(totals.days)} /><Metric label="Giờ thường" value={minutes(totals.regular)} /><Metric label="Tăng ca" value={minutes(totals.overtime)} /></div>
    {!rows.length && !loading ? <Empty>Chưa có dữ liệu công trong tháng.</Empty> : <div className="max-h-[64vh] overflow-auto rounded-xl border"><table className="w-full border-collapse"><thead><tr>{["Nhân viên", "Ngày", "Ca 1", "Ca 2", "Ca 3", "Giờ thường", "OT", "Ngày công", "Trạng thái"].map((label) => <th key={label} className={headerCell}>{label}</th>)}</tr></thead><tbody>{rows.map((row) => <tr key={row.name} className={row.state === "exception" ? "bg-amber-500/5" : ""}><td className={tableCell}>{row.employee ?? "—"}</td><td className={tableCell}>{row.work_date ?? "—"}</td><td className={tableCell}>{segmentValue(row, "SHIFT1")}</td><td className={tableCell}>{segmentValue(row, "SHIFT2")}</td><td className={tableCell}>{segmentValue(row, "SHIFT3")}</td><td className={`${tableCell} text-right tabular-nums`}>{minutes(row.regular_minutes)}</td><td className={`${tableCell} text-right tabular-nums`}>{minutes(row.overtime_minutes)}</td><td className={`${tableCell} text-right tabular-nums`}>{workDays(row.payable_work_fraction_bp)}</td><td className={tableCell}><StateBadge value={row.state} /></td></tr>)}</tbody></table></div>}
  </Shell>;
}

function ExceptionScreen({ onExit }: { onExit: () => void }) {
  const { adapter } = useMetaForge();
  const bounds = monthBounds(monthIso());
  const [rows, setRows] = useState<AttendanceDay[]>([]);
  const [requests, setRequests] = useState<CorrectionRequest[]>([]);
  const [failure, setFailure] = useState("");
  const [loading, setLoading] = useState(false);
  const load = useCallback(async () => { setLoading(true); try { const [days, pending] = await Promise.all([adapter.callPost<AttendanceDay[]>("alumdoor.attendance.exceptions", bounds), adapter.callPost<CorrectionRequest[]>("alumdoor.attendance.correction_requests", {})]); setRows(days); setRequests(pending); setFailure(""); } catch (error) { setFailure(errorText(adapter, error)); } finally { setLoading(false); } }, [adapter, bounds.from, bounds.to]);
  useEffect(() => { void load(); }, [load]);
  const review = async (request: string, action: "approve" | "reject") => { try { await adapter.callPost("alumdoor.attendance.review_correction", { request, action }); await load(); } catch (error) { setFailure(errorText(adapter, error)); } };
  return <Shell><PageTitle title="Ngoại lệ chấm công" subtitle="Thiếu IN/OUT và phiếu sửa công chờ duyệt. Duyệt xong mới thay đổi nguồn tính lương." onExit={onExit} />
    <Toolbar><Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}><RefreshCw className={`mr-2 size-4 ${loading ? "animate-spin" : ""}`} />Làm mới</Button></Toolbar>{failure && <Failure message={failure} />}
    <section><h2 className="mb-3 font-medium">Yêu cầu sửa công chờ xử lý</h2>{!requests.length ? <Empty>Không có phiếu sửa công chờ duyệt.</Empty> : <div className="overflow-auto rounded-xl border"><table className="w-full"><thead><tr>{["Phiếu", "Nhân viên", "Ngày", "Ca", "Giờ vào đề nghị", "Giờ ra đề nghị", "Lý do", "Thao tác"].map((label) => <th key={label} className={headerCell}>{label}</th>)}</tr></thead><tbody>{requests.map((row) => <tr key={row.name}><td className={tableCell}>{row.name}</td><td className={tableCell}>{row.employee ?? "—"}</td><td className={tableCell}>{row.from_date ?? "—"}</td><td className={tableCell}>{segmentName(row.alu_segment_code)}</td><td className={tableCell}>{clock(row.alu_requested_in)}</td><td className={tableCell}>{clock(row.alu_requested_out)}</td><td className={`${tableCell} max-w-64 truncate`}>{row.reason ?? "—"}</td><td className={tableCell}><div className="flex gap-2"><Button size="sm" onClick={() => void review(row.name, "approve")}><CheckCircle2 className="mr-1 size-4" />Duyệt</Button><Button variant="outline" size="sm" onClick={() => void review(row.name, "reject")}>Từ chối</Button></div></td></tr>)}</tbody></table></div>}</section>
    <section><h2 className="mb-3 font-medium">Ngày công đang có ngoại lệ</h2>{!rows.length ? <Empty>Không có ngày công ngoại lệ trong tháng hiện tại.</Empty> : <div className="overflow-auto rounded-xl border"><table className="w-full"><thead><tr>{["Nhân viên", "Ngày", "Ca 1", "Ca 2", "Ca 3", "Trạng thái"].map((label) => <th key={label} className={headerCell}>{label}</th>)}</tr></thead><tbody>{rows.map((row) => <tr key={row.name}><td className={tableCell}>{row.employee ?? "—"}</td><td className={tableCell}>{row.work_date ?? "—"}</td><td className={tableCell}>{segmentValue(row, "SHIFT1")}</td><td className={tableCell}>{segmentValue(row, "SHIFT2")}</td><td className={tableCell}>{segmentValue(row, "SHIFT3")}</td><td className={tableCell}><StateBadge value={row.state} /></td></tr>)}</tbody></table></div>}</section>
  </Shell>;
}

function PayrollScreen({ onExit }: { onExit: () => void }) {
  const { adapter } = useMetaForge();
  const now = monthBounds(monthIso());
  const [company, setCompany] = useState(""); const [branch, setBranch] = useState("");
  const [from, setFrom] = useState(now.from); const [to, setTo] = useState(now.to); const [standardDays, setStandardDays] = useState("26");
  const [periods, setPeriods] = useState<PayrollPeriod[]>([]); const [selected, setSelected] = useState(""); const [slips, setSlips] = useState<SalarySlip[]>([]);
  const [loading, setLoading] = useState(false); const [failure, setFailure] = useState("");
  const load = useCallback(async () => { setLoading(true); try { const result = await adapter.callPost<PayrollPeriod[]>("alumdoor.payroll.period_list", { ...(company.trim() ? { company: company.trim() } : {}), ...(branch.trim() ? { branch: branch.trim() } : {}) }); setPeriods(result); if (selected && !result.some((row) => row.name === selected)) setSelected(""); setFailure(""); } catch (error) { setFailure(errorText(adapter, error)); } finally { setLoading(false); } }, [adapter, branch, company, selected]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (!selected) { setSlips([]); return; } void adapter.callPost<SalarySlip[]>("alumdoor.payroll.period_slips", { period: selected }).then(setSlips).catch((error) => setFailure(errorText(adapter, error))); }, [adapter, selected]);
  const create = async () => { try { if (!company.trim()) throw new Error("Chọn công ty trước khi tạo kỳ lương."); await adapter.callPost("alumdoor.payroll.create_period", { company: company.trim(), ...(branch.trim() ? { branch: branch.trim() } : {}), start_date: from, end_date: to, standard_work_days_bp: String(Math.round((Number(standardDays) || 0) * 10_000)) }); await load(); } catch (error) { setFailure(errorText(adapter, error)); } };
  const act = async (method: string, period: string) => { setLoading(true); try { await adapter.callPost(method, { period }); await load(); if (selected === period) setSlips(await adapter.callPost<SalarySlip[]>("alumdoor.payroll.period_slips", { period })); } catch (error) { setFailure(errorText(adapter, error)); } finally { setLoading(false); } };
  const selectedPeriod = periods.find((row) => row.name === selected);
  return <Shell><PageTitle title="Tính lương" subtitle="Kiểm tra công → tính draft → gửi duyệt → duyệt nguyên tử → xác nhận đã trả." onExit={onExit} />
    <section className="rounded-xl border p-4"><h2 className="font-medium">Tạo kỳ lương</h2><div className="mt-3 grid gap-3 md:grid-cols-3 lg:grid-cols-6"><input className={inputClass} value={company} onChange={(event) => setCompany(event.target.value)} placeholder="Công ty" /><input className={inputClass} value={branch} onChange={(event) => setBranch(event.target.value)} placeholder="Chi nhánh" /><input className={inputClass} type="date" value={from} onChange={(event) => setFrom(event.target.value)} /><input className={inputClass} type="date" value={to} onChange={(event) => setTo(event.target.value)} /><input className={inputClass} type="number" step="0.5" min="0.5" value={standardDays} onChange={(event) => setStandardDays(event.target.value)} placeholder="Công chuẩn" /><Button onClick={() => void create()}><CalendarDays className="mr-2 size-4" />Tạo kỳ</Button></div></section>
    {failure && <Failure message={failure} />}
    <div className="overflow-auto rounded-xl border"><table className="w-full"><thead><tr>{["Kỳ", "Từ ngày", "Đến ngày", "NV", "Giờ thường", "OT", "Thực trả", "Trạng thái", "Thao tác"].map((label) => <th key={label} className={headerCell}>{label}</th>)}</tr></thead><tbody>{periods.map((row) => <tr key={row.name} className={selected === row.name ? "bg-muted/40" : ""}><td className={tableCell}><button className="font-medium text-primary hover:underline" onClick={() => setSelected(row.name)}>{row.name}</button></td><td className={tableCell}>{row.start_date}</td><td className={tableCell}>{row.end_date}</td><td className={`${tableCell} text-right`}>{row.employee_count ?? 0}</td><td className={`${tableCell} text-right`}>{minutes(row.alu_regular_minutes)}</td><td className={`${tableCell} text-right`}>{minutes(row.alu_overtime_minutes)}</td><td className={`${tableCell} text-right font-medium`}>{money(row.total_net_pay)}</td><td className={tableCell}><StateBadge value={row.alu_state} /></td><td className={tableCell}><PayrollActions row={row} busy={loading} act={act} /></td></tr>)}</tbody></table></div>
    {selectedPeriod && <section><div className="mb-3 flex items-center justify-between"><h2 className="font-medium">Phiếu lương · {selectedPeriod.name}</h2><span className="text-sm text-muted-foreground">{slips.length} nhân viên</span></div>{!slips.length ? <Empty>Chọn “Tính lương” để sinh phiếu lương nháp.</Empty> : <SalaryTable rows={slips} />}</section>}
  </Shell>;
}

function PayrollActions({ row, busy, act }: { row: PayrollPeriod; busy: boolean; act: (method: string, period: string) => Promise<void> }) {
  if (["draft", "calculated", "invalidated"].includes(row.alu_state ?? "draft")) return <div className="flex gap-2"><Button size="sm" disabled={busy} onClick={() => void act("alumdoor.payroll.calculate_period", row.name)}>Tính lương</Button>{row.alu_state === "calculated" && <Button variant="outline" size="sm" disabled={busy} onClick={() => void act("alumdoor.payroll.submit_period", row.name)}><Send className="mr-1 size-4" />Gửi duyệt</Button>}</div>;
  if (row.alu_state === "pending_approval") return <Button size="sm" disabled={busy} onClick={() => void act("alumdoor.payroll.approve_period", row.name)}><CheckCircle2 className="mr-1 size-4" />Duyệt kỳ</Button>;
  if (row.alu_state === "approved") return <Button size="sm" disabled={busy} onClick={() => void act("alumdoor.payroll.mark_paid", row.name)}><Banknote className="mr-1 size-4" />Đã trả</Button>;
  return <span className="text-xs text-muted-foreground">Đã khóa</span>;
}

function MySlipsScreen({ onExit }: { onExit: () => void }) {
  const { adapter } = useMetaForge();
  const [rows, setRows] = useState<SalarySlip[]>([]); const [loading, setLoading] = useState(false); const [failure, setFailure] = useState("");
  const load = useCallback(async () => { setLoading(true); try { setRows(await adapter.callPost<SalarySlip[]>("alumdoor.payroll.my_slips", {})); setFailure(""); } catch (error) { setFailure(errorText(adapter, error)); } finally { setLoading(false); } }, [adapter]);
  useEffect(() => { void load(); }, [load]);
  return <Shell><PageTitle title="Phiếu lương của tôi" subtitle="Chỉ hiển thị phiếu lương gắn với Employee của tài khoản hiện tại." onExit={onExit} /><Toolbar><Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}><RefreshCw className={`mr-2 size-4 ${loading ? "animate-spin" : ""}`} />Làm mới</Button></Toolbar>{failure && <Failure message={failure} />}{!rows.length && !loading ? <Empty>Chưa có phiếu lương.</Empty> : <SalaryTable rows={rows} employeeHidden />}</Shell>;
}

function SalaryTable({ rows, employeeHidden = false }: { rows: SalarySlip[]; employeeHidden?: boolean }) {
  return <div className="overflow-auto rounded-xl border"><table className="w-full"><thead><tr>{[...(!employeeHidden ? ["Nhân viên"] : []), "Kỳ", "Ngày công", "Giờ thường", "OT", "Lương thường", "Tiền OT", "Phụ cấp", "Tạm ứng", "Khấu trừ", "Thực nhận", "Trạng thái", "Phiếu"].map((label) => <th key={label} className={headerCell}>{label}</th>)}</tr></thead><tbody>{rows.map((row) => <tr key={row.name}>{!employeeHidden && <td className={tableCell}>{row.employee ?? "—"}</td>}<td className={tableCell}>{row.start_date} → {row.end_date}</td><td className={`${tableCell} text-right`}>{workDays(row.alu_work_fraction_bp)}</td><td className={`${tableCell} text-right`}>{minutes(row.alu_regular_minutes)}</td><td className={`${tableCell} text-right`}>{minutes(row.alu_overtime_minutes)}</td><td className={`${tableCell} text-right`}>{money(row.alu_base_pay_vnd)}</td><td className={`${tableCell} text-right`}>{money(row.alu_overtime_pay_vnd)}</td><td className={`${tableCell} text-right`}>{money(row.alu_allowance_vnd)}</td><td className={`${tableCell} text-right`}>{money(row.alu_advance_vnd)}</td><td className={`${tableCell} text-right`}>{money(row.alu_manual_deduction_vnd)}</td><td className={`${tableCell} text-right font-semibold`}>{money(row.net_pay)}</td><td className={tableCell}><StateBadge value={row.alu_state} /></td><td className={tableCell}><a className="inline-flex items-center text-primary hover:underline" href={`/print/${encodeURIComponent("Salary Slip")}/${encodeURIComponent(row.name)}`} target="_blank" rel="noreferrer"><ReceiptText className="mr-1 size-4" />Xem/In</a></td></tr>)}</tbody></table></div>;
}

function Shell({ children }: { children: ReactNode }) { return <main className="min-h-[100dvh] bg-background p-3 md:p-5"><div className="mx-auto flex max-w-[1600px] flex-col gap-4">{children}</div></main>; }
function Toolbar({ children }: { children: ReactNode }) { return <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-3">{children}</div>; }
function Metric({ label, value }: { label: string; value: ReactNode }) { return <div className="rounded-xl border bg-card p-4"><div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div><div className="mt-2 text-lg font-semibold tabular-nums">{value}</div></div>; }
