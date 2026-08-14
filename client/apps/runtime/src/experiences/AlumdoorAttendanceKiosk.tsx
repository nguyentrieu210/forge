import { useEffect, useMemo, useState } from "react";
import { Download, Loader2, LocateFixed, MapPin, Plus, Printer, RefreshCw, ShieldCheck } from "lucide-react";
import qrcode from "qrcode-generator";
import { ALUMDOOR_HR_PAYROLL_METHODS } from "@cloudforge/alumdoor-hr-payroll-contract";
import { LinkCombobox } from "@metaforge/controls";
import { adapterServices } from "@metaforge/views";
import { useMetaForge } from "@metaforge/views/provider";
import { Button, Input, Label } from "@metaforge/ui";

interface StationQr { station: string; station_name?: string; token: string; token_version: string }
interface StationLite { name: string; station_code?: string; station_name?: string }
const STORAGE_KEY = "alumdoor-attendance-print-station";

function errorMessage(adapter: { mapError: (error: unknown) => { message: string } }, error: unknown): string {
  const payload = (error as { response?: { data?: unknown }; message?: unknown } | undefined)?.response?.data;
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    const message = (payload as Record<string, unknown>).message;
    if (typeof message === "string" && message.trim()) return message.trim();
  }
  const direct = (error as { message?: unknown } | undefined)?.message;
  return typeof direct === "string" && direct.trim() ? direct.trim() : adapter.mapError(error).message;
}

function savedStation() { try { return localStorage.getItem(STORAGE_KEY) ?? ""; } catch { return ""; } }
function saveStation(value: string) { try { localStorage.setItem(STORAGE_KEY, value); } catch { /* no-op */ } }

function qrSvg(value: string): string {
  const code = qrcode(0, "M");
  code.addData(value); code.make();
  return code.createSvgTag({ cellSize: 7, margin: 4, scalable: true });
}

export function AlumdoorAttendanceKiosk() {
  const { adapter } = useMetaForge();
  const links = useMemo(() => adapterServices(adapter), [adapter]);
  const [station, setStation] = useState(savedStation);
  const [qr, setQr] = useState<StationQr>();
  const [loading, setLoading] = useState(false);
  const [failure, setFailure] = useState("");
  const [setupOpen, setSetupOpen] = useState(!savedStation());
  const [stationName, setStationName] = useState("Trạm chính");
  const [radius, setRadius] = useState(50);
  const [creating, setCreating] = useState(false);

  const load = async (method = "alumdoor.attendance.station_qr") => {
    if (!station) return;
    setLoading(true); setFailure("");
    try { setQr(await adapter.callPost<StationQr>(method, { station })); }
    catch (error) { setFailure(errorMessage(adapter, error)); }
    finally { setLoading(false); }
  };

  useEffect(() => { if (station) void load(); else setQr(undefined); }, [station]);
  const scanUrl = qr ? `${window.location.origin}/mobile/attendance/?token=${encodeURIComponent(qr.token)}` : "";
  const svg = scanUrl ? qrSvg(scanUrl) : "";

  const rotate = async () => {
    if (!window.confirm("Mã QR cũ sẽ ngừng hoạt động ngay. Bạn có muốn tạo mã mới?")) return;
    await load("alumdoor.attendance.rotate_station_qr");
  };

  const createStation = async () => {
    if (!stationName.trim()) { setFailure("Nhập tên trạm chấm công."); return; }
    if (!navigator.geolocation) { setFailure("Thiết bị này không hỗ trợ lấy vị trí."); return; }
    setCreating(true); setFailure("");
    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true, timeout: 15_000, maximumAge: 0,
      }));
      const created = await adapter.callPost<StationLite>(ALUMDOOR_HR_PAYROLL_METHODS.stationCreate, {
        station_name: stationName.trim(), latitude: position.coords.latitude, longitude: position.coords.longitude,
        allowed_radius_m: radius, idempotency_key: idempotencyKey(),
      });
      const next = created.station_code ?? created.name;
      setStation(next); saveStation(next); setSetupOpen(false);
    } catch (error) {
      const locationError = error as GeolocationPositionError;
      setFailure(locationError?.code === 1 ? "Bạn chưa cho phép lấy vị trí. Hãy cấp quyền vị trí rồi thử lại." : errorMessage(adapter, error));
    } finally { setCreating(false); }
  };

  const download = () => {
    if (!svg || !qr) return;
    const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob); const anchor = document.createElement("a");
    anchor.href = url; anchor.download = `qr-cham-cong-${qr.station}.svg`; anchor.click(); URL.revokeObjectURL(url);
  };

  return <div className="mx-auto max-w-5xl p-4 sm:p-6">
    <div className="print:hidden">
      <h1 className="text-2xl font-bold">Thiết lập trạm chấm công</h1>
      <p className="mt-1 text-sm text-muted-foreground">Tạo trạm tại vị trí hiện tại, sau đó hệ thống tự hiện mã QR để in.</p>
      {station && !setupOpen ? <div className="mt-5 flex max-w-2xl flex-col gap-3 sm:flex-row sm:items-end"><div className="min-w-0 flex-1"><LinkCombobox id="attendance-station" value={station} target="AlumDoor QR Station" label="Trạm đang xem" search={links.searchLink!} resolveDisplay={links.resolveDisplay} onChange={(value) => { const next = value ?? ""; setStation(next); saveStation(next); }} /></div><Button variant="outline" onClick={() => setSetupOpen(true)}><Plus className="mr-2 size-4" />Thêm trạm</Button></div> : null}
      {setupOpen ? <div className="mt-5 max-w-2xl rounded-2xl border bg-card p-4 sm:p-5"><div className="flex items-start justify-between gap-3"><div><h2 className="font-semibold">Tạo trạm mới</h2><p className="mt-1 text-sm text-muted-foreground">Công ty, nơi làm việc và giờ làm được lấy từ Cài đặt mặc định.</p></div>{station ? <Button variant="ghost" size="sm" onClick={() => setSetupOpen(false)}>Đóng</Button> : null}</div><div className="mt-4 grid gap-4 sm:grid-cols-[1fr_180px]"><div className="space-y-1.5"><Label htmlFor="station-name">Tên trạm</Label><Input id="station-name" value={stationName} onChange={(event) => setStationName(event.target.value)} placeholder="Ví dụ: Cửa xưởng" /></div><div className="space-y-1.5"><Label htmlFor="station-radius">Bán kính (m)</Label><Input id="station-radius" type="number" min={10} max={500} value={radius} onChange={(event) => setRadius(Math.max(10, Math.min(500, Number(event.target.value) || 50)))} /></div></div><Button className="mt-4 w-full sm:w-auto" onClick={() => void createStation()} disabled={creating}>{creating ? <><Loader2 className="mr-2 size-4 animate-spin" />Đang lấy vị trí…</> : <><LocateFixed className="mr-2 size-4" />Lấy vị trí & tạo trạm</>}</Button></div> : null}
      {failure ? <div className="mt-4 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">{failure}</div> : null}
    </div>

    {loading ? <div className="grid min-h-72 place-items-center"><Loader2 className="size-8 animate-spin" /></div> : null}
    {!loading && qr ? <div className="mt-6 rounded-2xl border bg-white p-5 text-slate-950 shadow-sm sm:p-8">
      <div className="mx-auto max-w-xl text-center">
        <p className="text-sm font-bold uppercase tracking-[.2em]">Alumdoor</p>
        <h2 className="mt-3 text-3xl font-black">TRẠM CHẤM CÔNG</h2>
        <div className="mx-auto mt-6 max-w-[360px]" aria-label={`QR trạm ${qr.station_name ?? qr.station}`} dangerouslySetInnerHTML={{ __html: svg }} />
        <p className="mt-5 text-xl font-bold">{qr.station_name ?? qr.station}</p>
        <p className="text-sm text-slate-500">Mã trạm: {qr.station}</p>
        <p className="mt-5 text-base">Quét QR bằng điện thoại để chấm công</p>
        <div className="mt-5 flex items-center justify-center gap-2 text-sm text-slate-500"><MapPin className="size-4" />Cần ở trong vùng GPS của trạm <ShieldCheck className="ml-2 size-4" />Thiết bị phải được đăng ký</div>
      </div>
      <div className="mt-7 flex flex-wrap justify-center gap-3 print:hidden"><Button onClick={() => window.print()}><Printer className="mr-2 size-4" />In QR</Button><Button variant="outline" onClick={download}><Download className="mr-2 size-4" />Tải SVG</Button><Button variant="destructive" onClick={() => void rotate()}><RefreshCw className="mr-2 size-4" />Tạo lại QR</Button></div>
      <p className="mt-4 text-center text-xs text-slate-400 print:hidden">Phiên bản token: {qr.token_version}. Tạo lại QR sẽ vô hiệu hóa toàn bộ bản in cũ nhưng không ảnh hưởng lịch sử công.</p>
    </div> : null}
    {!station && !loading && !setupOpen ? <div className="mt-8 rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground print:hidden">Chưa có trạm chấm công.</div> : null}
  </div>;
}

function idempotencyKey(): string { return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `station-${Date.now()}-${Math.random().toString(36).slice(2)}`; }
