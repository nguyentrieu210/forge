import { StrictMode, useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Camera, CheckCircle2, Loader2, LocateFixed, RefreshCw, ScanLine, TriangleAlert, WifiOff } from "lucide-react";
import { FrappeAdapterImpl } from "@metaforge/adapter-frappe";
import { I18nProvider } from "@metaforge/shell";
import { Button, Input, Toaster } from "@metaforge/ui";
import "./styles.css";

const adapter = new FrappeAdapterImpl({});
const DEVICE_KEY = "alumdoor-attendance-device-v1";
const INSTALLATION_KEY = "alumdoor-attendance-installation-v1";

interface DeviceCredential { device_id: string; credential: string }
interface RawLocation { latitude: number; longitude: number; accuracy: number }
interface AttendanceScanResult {
  registration_required?: boolean;
  device_registered?: boolean;
  device_registration?: DeviceCredential;
  replayed?: boolean;
  checkin?: { name: string; log_type?: string };
  day?: { segment_code?: string; regular_minutes?: number; overtime_minutes?: number };
  employee?: { name: string; employee_name?: string };
  station?: { name: string; station_name?: string };
  location?: { distance_m?: number; allowed_radius_m?: number; accuracy_m?: number };
  server_timestamp?: string;
}

type Decoder = typeof import("jsqr").default;
type Phase = "idle" | "camera" | "scanning" | "location" | "submitting" | "registration" | "success" | "error";

function readDevice(): DeviceCredential | undefined {
  try {
    const parsed = JSON.parse(localStorage.getItem(DEVICE_KEY) ?? "null") as Partial<DeviceCredential> | null;
    return parsed && typeof parsed.device_id === "string" && typeof parsed.credential === "string"
      ? { device_id: parsed.device_id, credential: parsed.credential }
      : undefined;
  } catch { return undefined; }
}

function storeDevice(value: DeviceCredential) {
  try { localStorage.setItem(DEVICE_KEY, JSON.stringify(value)); }
  catch { /* Private mode may block storage; next scan will ask to register again. */ }
}

function clearDevice() { try { localStorage.removeItem(DEVICE_KEY); localStorage.removeItem(INSTALLATION_KEY); } catch { /* no-op */ } }

function installationId(): string {
  try {
    const existing = localStorage.getItem(INSTALLATION_KEY)?.trim();
    if (existing) return existing;
    const created = crypto.randomUUID();
    localStorage.setItem(INSTALLATION_KEY, created);
    return created;
  } catch { return crypto.randomUUID(); }
}

function requestId(): string {
  return crypto.randomUUID?.() ?? `${Date.now()}-${crypto.getRandomValues(new Uint32Array(4)).join("-")}`;
}

function tokenFromQr(payload: string): string {
  const value = payload.trim();
  if (!value) throw new Error("Mã QR không có dữ liệu.");
  try {
    const url = new URL(value, window.location.origin);
    const token = url.searchParams.get("token")?.trim();
    if (token) return token;
  } catch { /* Static QR may contain the token directly. */ }
  return value;
}

function messageFromError(error: unknown): string {
  const candidate = error as { response?: { data?: unknown }; message?: unknown } | undefined;
  const payload = candidate?.response?.data;
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    const body = payload as Record<string, unknown>;
    const message = body.message ?? (body.error && typeof body.error === "object" ? (body.error as Record<string, unknown>).message : undefined);
    if (typeof message === "string" && message.trim()) return message.trim();
  }
  if (typeof candidate?.message === "string" && candidate.message.trim()) return candidate.message.trim();
  return adapter.mapError(error).message;
}

function currentLocation(): Promise<RawLocation> {
  if (!window.isSecureContext || !navigator.geolocation) return Promise.reject(new Error("Chấm công cần HTTPS và quyền truy cập vị trí."));
  return new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(
    (position) => resolve({ latitude: position.coords.latitude, longitude: position.coords.longitude, accuracy: position.coords.accuracy }),
    (error) => {
      if (error.code === error.PERMISSION_DENIED) reject(new Error("Chấm công cần quyền truy cập vị trí. Hãy cho phép quyền vị trí trong trình duyệt rồi thử lại."));
      else if (error.code === error.TIMEOUT) reject(new Error("Chưa xác định được vị trí. Hãy bật GPS, di chuyển tới khu vực thoáng hơn và thử lại."));
      else reject(new Error("Không lấy được vị trí hiện tại. Hãy bật GPS và thử lại."));
    },
    { enableHighAccuracy: true, timeout: 20_000, maximumAge: 0 },
  ));
}

function Scanner() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream>();
  const frameRef = useRef<number>();
  const decoderRef = useRef<Decoder>();
  const scanningRef = useRef(false);
  const busyRef = useRef(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [online, setOnline] = useState(() => navigator.onLine);
  const [failure, setFailure] = useState("");
  const [result, setResult] = useState<AttendanceScanResult>();
  const [employeeCode, setEmployeeCode] = useState("");
  const [pending, setPending] = useState<{ token: string; location: RawLocation; request_id: string }>();

  const stopLoop = useCallback(() => {
    scanningRef.current = false;
    if (frameRef.current !== undefined) cancelAnimationFrame(frameRef.current);
    frameRef.current = undefined;
  }, []);
  const stopCamera = useCallback(() => {
    stopLoop();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = undefined;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, [stopLoop]);

  useEffect(() => {
    const onlineHandler = () => setOnline(true);
    const offlineHandler = () => setOnline(false);
    window.addEventListener("online", onlineHandler);
    window.addEventListener("offline", offlineHandler);
    return () => { window.removeEventListener("online", onlineHandler); window.removeEventListener("offline", offlineHandler); stopCamera(); };
  }, [stopCamera]);

  const submitAttendance = useCallback(async (token: string, location: RawLocation, id: string, code?: string) => {
    const device = readDevice();
    const response = await adapter.callPost<AttendanceScanResult>("alumdoor.attendance.scan", {
      token,
      location,
      request_id: id,
      ...(device ? { device_id: device.device_id, device_credential: device.credential } : { device_id: installationId() }),
      ...(code ? { employee_code: code, device_label: navigator.platform || "Điện thoại chấm công" } : {}),
    });
    if (response.registration_required) {
      setPending({ token, location, request_id: id });
      setPhase("registration");
      return;
    }
    if (response.device_registration) storeDevice(response.device_registration);
    setResult(response);
    setPhase("success");
    navigator.vibrate?.([70, 40, 120]);
  }, []);

  const beginAttendance = useCallback(async (raw: string) => {
    if (busyRef.current || !navigator.onLine) return;
    busyRef.current = true;
    stopCamera();
    setFailure(""); setResult(undefined); setEmployeeCode("");
    try {
      const token = tokenFromQr(raw);
      setPhase("location");
      const location = await currentLocation();
      setPhase("submitting");
      await submitAttendance(token, location, requestId());
    } catch (error) {
      const message = messageFromError(error);
      if (/thu hồi|chưa được đăng ký/i.test(message)) clearDevice();
      setFailure(message);
      setPhase("error");
    } finally { busyRef.current = false; }
  }, [stopCamera, submitAttendance]);

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("token")?.trim();
    if (token) void beginAttendance(token);
  }, [beginAttendance]);

  const scanFrame = useCallback((at: number) => {
    if (!scanningRef.current) return;
    const video = videoRef.current; const canvas = canvasRef.current;
    if (video && canvas && decoderRef.current && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      const scale = Math.min(1, 720 / Math.max(1, video.videoWidth));
      canvas.width = Math.max(1, Math.round(video.videoWidth * scale)); canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (context) {
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        const image = context.getImageData(0, 0, canvas.width, canvas.height);
        const code = decoderRef.current(image.data, image.width, image.height, { inversionAttempts: "dontInvert" });
        if (code?.data) { void beginAttendance(code.data); return; }
      }
    }
    frameRef.current = requestAnimationFrame(scanFrame);
    void at;
  }, [beginAttendance]);

  useEffect(() => {
    if (phase !== "scanning" || !streamRef.current?.active) return;
    scanningRef.current = true; frameRef.current = requestAnimationFrame(scanFrame);
    return stopLoop;
  }, [phase, scanFrame, stopLoop]);

  const openCamera = async () => {
    if (!online) return;
    setFailure(""); setPhase("camera");
    try {
      decoderRef.current ??= (await import("jsqr")).default;
      const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: "environment" } } });
      stopCamera(); streamRef.current = stream;
      if (!videoRef.current) throw new Error();
      videoRef.current.srcObject = stream; await videoRef.current.play(); setPhase("scanning");
    } catch {
      stopCamera(); setFailure("Không mở được camera sau. Hãy cho phép quyền Camera rồi thử lại."); setPhase("error");
    }
  };

  const register = async () => {
    if (!pending || !employeeCode.trim() || busyRef.current) return;
    busyRef.current = true; setFailure(""); setPhase("submitting");
    try { await submitAttendance(pending.token, pending.location, pending.request_id, employeeCode.trim()); }
    catch (error) { setFailure(messageFromError(error)); setPhase("registration"); }
    finally { busyRef.current = false; }
  };

  const reset = () => { stopCamera(); setPending(undefined); setResult(undefined); setFailure(""); setEmployeeCode(""); busyRef.current = false; setPhase("idle"); };
  const logLabel = result?.checkin?.log_type === "OUT" ? "Ra ca" : "Vào ca";
  const successTime = result?.server_timestamp ? new Date(result.server_timestamp).toLocaleTimeString("vi-VN") : new Date().toLocaleTimeString("vi-VN");

  return <main className="min-h-[100dvh] bg-slate-950 text-white">
    {!online ? <div className="flex items-center justify-center gap-2 bg-amber-500 px-3 py-2 text-sm font-semibold text-black"><WifiOff className="size-4" />Đang mất mạng</div> : null}
    <header className="attendance-safe-top flex items-center gap-3 border-b border-white/10 px-4 pb-3">
      <span className="grid size-11 place-items-center rounded-2xl bg-primary"><ScanLine className="size-6" /></span>
      <div><h1 className="font-bold">Alumdoor Chấm công</h1><p className="text-xs text-white/55">QR trạm cố định · xác minh GPS</p></div>
    </header>
    <section className="relative min-h-[calc(100dvh-72px)] overflow-hidden">
      <video ref={videoRef} className={`absolute inset-0 size-full object-cover ${streamRef.current ? "block" : "hidden"}`} playsInline muted />
      <canvas ref={canvasRef} className="hidden" />

      {phase === "idle" || phase === "error" ? <div className="absolute inset-0 grid place-items-center p-6 text-center">
        <div className="w-full max-w-sm"><Camera className="mx-auto size-16 text-white/80" /><h2 className="mt-5 text-2xl font-bold">Quét QR tại trạm</h2><p className="mt-2 text-sm leading-6 text-white/60">Chỉ dùng camera trực tiếp. Vị trí chỉ được lấy đúng lúc chấm công.</p>
        {failure ? <div className="mt-5 flex gap-2 rounded-2xl bg-red-500/15 p-4 text-left text-sm text-red-100"><TriangleAlert className="size-5 shrink-0" />{failure}</div> : null}
        <Button className="mt-6 h-14 w-full rounded-2xl text-base font-bold" onClick={() => void openCamera()} disabled={!online}><Camera className="mr-2 size-5" />Mở camera</Button></div>
      </div> : null}

      {phase === "scanning" ? <div className="pointer-events-none absolute inset-0"><div className="absolute inset-x-[10%] top-[12%] aspect-square rounded-[2rem] border-2 border-white shadow-[0_0_0_9999px_rgba(2,6,23,.55)]" /><p className="absolute inset-x-0 bottom-10 text-center text-sm font-semibold">Đưa mã QR vào giữa khung</p></div> : null}
      {phase === "camera" || phase === "location" || phase === "submitting" ? <div className="absolute inset-0 grid place-items-center bg-slate-950/90"><div className="text-center"><Loader2 className="mx-auto size-10 animate-spin" /><p className="mt-4 font-semibold">{phase === "location" ? "Đang xác định vị trí…" : phase === "submitting" ? "Đang chấm công…" : "Đang mở camera…"}</p>{phase === "location" ? <LocateFixed className="mx-auto mt-3 size-5 text-white/45" /> : null}</div></div> : null}

      {phase === "registration" && pending ? <div className="absolute inset-0 grid place-items-center bg-slate-950 p-6"><div className="w-full max-w-sm"><h2 className="text-2xl font-bold">Đăng ký thiết bị lần đầu</h2><p className="mt-2 text-sm leading-6 text-white/60">Vị trí đã hợp lệ. Nhập mã nhân viên một lần; những lần sau thiết bị này sẽ tự nhận diện.</p><label className="mt-6 block text-sm font-semibold" htmlFor="employee-code">Mã nhân viên</label><Input id="employee-code" className="mt-2 h-14 bg-white text-lg text-slate-950" value={employeeCode} onChange={(event) => setEmployeeCode(event.target.value)} placeholder="NV001" autoCapitalize="characters" autoFocus /><Button className="mt-4 h-14 w-full rounded-2xl font-bold" onClick={() => void register()} disabled={!employeeCode.trim()}>Đăng ký thiết bị & Chấm công</Button><Button className="mt-2 w-full" variant="ghost" onClick={reset}>Hủy</Button>{failure ? <p className="mt-3 text-sm text-red-300">{failure}</p> : null}</div></div> : null}

      {phase === "success" && result ? <div className="absolute inset-0 grid place-items-center bg-emerald-600 p-6"><div className="w-full max-w-sm text-center"><CheckCircle2 className="mx-auto size-20" /><p className="mt-5 font-bold uppercase tracking-widest">Chấm công thành công</p><h2 className="mt-3 text-3xl font-extrabold">{result.employee?.employee_name ?? result.employee?.name}</h2><p className="mt-2 text-2xl">{logLabel} · {successTime}</p><div className="mt-6 rounded-2xl bg-black/10 p-4 text-left"><p className="text-xs text-white/70">Trạm</p><p className="font-bold">{result.station?.station_name ?? result.station?.name}</p>{result.location?.distance_m !== undefined ? <p className="mt-2 text-sm text-white/75">Cách tâm trạm {Math.round(result.location.distance_m)} m</p> : null}{result.replayed ? <p className="mt-2 text-sm">Lần quét trùng đã được gộp an toàn.</p> : null}</div><Button className="mt-7 h-14 w-full rounded-2xl bg-white font-bold text-slate-900 hover:bg-white/90" onClick={reset}><RefreshCw className="mr-2 size-5" />Hoàn tất</Button></div></div> : null}
    </section>
  </main>;
}

function App() {
  useEffect(() => {
    // The local Desk server mounts this source through Vite middleware. Do not
    // install a development service worker: it would cache transformed modules
    // and make HMR look stale. The production PWA build keeps the same scope.
    if (import.meta.env.BASE_URL === "/" || !("serviceWorker" in navigator)) return;
    const register = () => void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}attendance-sw.js`, { scope: import.meta.env.BASE_URL });
    window.addEventListener("load", register); return () => window.removeEventListener("load", register);
  }, []);
  return <I18nProvider><Scanner /><Toaster /></I18nProvider>;
}

createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);
