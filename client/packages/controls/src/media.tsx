/** @jsxImportSource react */
/**
 * Media controls — Attach / Attach Image / Image / Signature / Barcode / Geolocation.
 * UI qua @metaforge/ui (FileButton bọc input file, Button/Input). Canvas signature + navigator.geolocation
 * là API trình duyệt (không phải "browser-default form control"). Nâng cấp map/scanner = Pha sau.
 */
import { type ChangeEvent, useEffect, useRef, useState } from "react";
import { ExternalLink, MapPin, Trash2, X } from "lucide-react";
import { sanitizeUrl, sanitizeImageUrl, withAppBase } from "@metaforge/core";

/** BASE của app (Vite thay lúc build) — xem chú thích ở withAppBase. */
const APP_BASE: string = (import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? "/";
import { cn, Button, Input, FileButton, useT } from "@metaforge/ui";
import type { FieldControlProps } from "./index.js";

const MASK = "••••••";
function Masked() {
  return <span className="mf-masked text-sm text-muted-foreground">{MASK}</span>;
}

/** Attach / Attach Image — upload file qua services.uploadFile, lưu file_url. */
export function AttachControl(p: FieldControlProps) {
  const t = useT();
  // ⚠️ MỌI hook phải nằm TRƯỚC bất kỳ câu return sớm nào. Trước đây `useState` đứng sau
  // `if (p.masked) return` — số hook thay đổi giữa các lần render ngay khi field đổi trạng thái
  // masked, và React ném lỗi #310 (màn hình trắng). Lỗi này KHÔNG bị typecheck bắt.
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (p.masked) return <Masked />;
  const url = (p.value as string) ?? "";
  const isImage = p.field.fieldtype === "Attach Image";

  const onFiles = async (files: FileList | null) => {
    const file = files?.[0];
    const upload = p.services?.uploadFile;
    if (!file || !upload) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await upload(file, {
        isPrivate: 0,
        // PHẢI gửi doctype: Frappe đính file vào (doctype, docname). Thiếu nó thì file hoặc bị từ
        // chối, hoặc lưu lạc không gắn vào bản ghi nào — ảnh "up xong" mà không bao giờ hiện lại.
        doctype: p.parentDoctype,
        // Bản ghi CHƯA LƯU chưa tồn tại trên server nên không đính vào đâu được. Gửi "new" thì
        // Frappe báo lỗi khó hiểu; bỏ trống thì file lưu độc lập rồi gắn vào doc lúc lưu.
        docname: p.docname && p.docname !== "new" ? p.docname : undefined,
        fieldname: p.field.fieldname,
      });
      if (!res?.file_url) throw new Error(t("control.attach_failed"));
      p.onChange(res.file_url);
    } catch (e) {
      // TUYỆT ĐỐI không nuốt lỗi ở đây. Bản trước chỉ có try/finally: upload hỏng thì nút hết
      // quay, không báo gì, và người dùng đứng bấm lại mãi mà không hiểu vì sao ảnh không lên.
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  // Gate 5: file_url là DỮ LIỆU → chặn scheme nguy hiểm (javascript:/data:…) khi render href/src.
  const safeHref = sanitizeUrl(withAppBase(url, APP_BASE));
  const safeImg = sanitizeImageUrl(withAppBase(url, APP_BASE));

  return (
    <div className="mf-attach flex flex-wrap items-center gap-2">
      {url ? (
        isImage ? (
          safeImg ? <img className="max-h-24 rounded-md border object-cover" src={safeImg} alt={p.field.label ?? ""} /> : <span className="text-sm text-destructive">{t("control.attach_bad_image_url")}</span>
        ) : safeHref ? (
          <a className="truncate text-sm text-primary hover:underline" href={safeHref} target="_blank" rel="noreferrer">
            {url.split("/").pop()}
          </a>
        ) : (
          <span className="text-sm text-destructive">{t("control.attach_bad_url")}</span>
        )
      ) : (
        <span className="text-sm text-muted-foreground">{t("control.attach_empty")}</span>
      )}
      {!p.readOnly ? (
        <>
          <FileButton accept={isImage ? "image/*" : undefined} disabled={busy} onFiles={onFiles}>
            {busy ? t("control.attach_uploading") : url ? t("control.attach_replace") : t("control.attach_choose")}
          </FileButton>
          {url ? (
            <Button type="button" variant="ghost" size="icon-sm" onClick={() => p.onChange(null)} aria-label={t("control.attach_remove")}>
              <X />
            </Button>
          ) : null}
        </>
      ) : null}
      {err ? <span className="w-full text-xs text-destructive" role="alert">{err}</span> : null}
    </div>
  );
}

/** Image — CHỈ hiển thị (read-only). */
export function ImageControl(p: FieldControlProps) {
  const t = useT();
  if (p.masked) return <Masked />;
  const src = sanitizeImageUrl(withAppBase((p.linkTarget as string) || (p.value as string) || "", APP_BASE));
  if (!src) return <span className="text-sm text-muted-foreground">{t("control.image_empty")}</span>;
  return <img className="max-h-40 rounded-md border object-contain" src={src} alt={p.field.label ?? ""} />;
}

/** Signature — canvas pad, lưu data URL (PNG). */
export function SignatureControl(p: FieldControlProps) {
  const t = useT();
  // Hook TRƯỚC mọi return sớm — xem chú thích ở AttachControl (React #310).
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const value = (p.value as string) ?? "";

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, c.width, c.height);
    if (value) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0, c.width, c.height);
      img.src = value;
    }
  }, [value]);

  if (p.masked) return <Masked />;

  if (p.readOnly) {
    return value ? (
      <img className="max-h-20 rounded-md border" src={value} alt={t("control.signature_alt")} />
    ) : (
      <span className="text-sm text-muted-foreground">{t("control.signature_empty")}</span>
    );
  }

  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const start = (e: React.PointerEvent<HTMLCanvasElement>) => {
    drawing.current = true;
    const ctx = canvasRef.current!.getContext("2d")!;
    const { x, y } = pos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  };
  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const ctx = canvasRef.current!.getContext("2d")!;
    const { x, y } = pos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  };
  const end = () => {
    if (!drawing.current) return;
    drawing.current = false;
    p.onChange(canvasRef.current!.toDataURL("image/png"));
  };

  return (
    <div className="mf-signature space-y-2">
      <canvas
        ref={canvasRef}
        width={300}
        height={100}
        className="touch-none rounded-md border bg-background"
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerLeave={end}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => {
          const c = canvasRef.current!;
          c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
          p.onChange(null);
        }}
      >
        <Trash2 /> {t("control.signature_clear")}
      </Button>
    </div>
  );
}

/** Barcode — lưu chuỗi mã (Input). Quét camera = nâng cấp sau. */
export function BarcodeControl(p: FieldControlProps) {
  const t = useT();
  if (p.masked) return <Masked />;
  return (
    <Input
      id={p.id}
      className="mf-control mf-barcode font-mono"
      type="text"
      value={(p.value as string) ?? ""}
      readOnly={p.readOnly}
      placeholder={t("control.barcode_placeholder")}
      onChange={(e: ChangeEvent<HTMLInputElement>) => p.onChange(e.target.value)}
    />
  );
}

interface GeoPoint {
  type: "FeatureCollection";
  features: Array<{ type: "Feature"; properties: Record<string, unknown>; geometry: { type: "Point"; coordinates: [number, number] } }>;
}

/** Geolocation — lưu GeoJSON. "Lấy vị trí hiện tại" (navigator) + hiện toạ độ. Map = sau. */
export function GeolocationControl(p: FieldControlProps) {
  const t = useT();
  // Hook TRƯỚC mọi return sớm — xem chú thích ở AttachControl (React #310).
  const [err, setErr] = useState("");
  if (p.masked) return <Masked />;
  let coords: [number, number] | null = null;
  try {
    const g = (typeof p.value === "string" ? JSON.parse(p.value) : p.value) as GeoPoint | null;
    const c = g?.features?.[0]?.geometry?.coordinates;
    if (c) coords = c;
  } catch {
    coords = null;
  }

  const locate = () => {
    if (!navigator.geolocation) {
      setErr(t("control.geo_unsupported"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const feature: GeoPoint = {
          type: "FeatureCollection",
          features: [{ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [pos.coords.longitude, pos.coords.latitude] } }],
        };
        p.onChange(JSON.stringify(feature));
      },
      (e) => setErr(e.message),
    );
  };

  return (
    <div className="mf-geo flex flex-wrap items-center gap-2">
      <span className={cn("text-sm tabular-nums", coords ? "text-foreground" : "text-muted-foreground")}>
        {coords ? `${coords[1].toFixed(5)}, ${coords[0].toFixed(5)}` : t("control.geo_empty")}
      </span>
      {!p.readOnly ? (
        <Button type="button" variant="outline" size="sm" onClick={locate}>
          <MapPin /> {t("control.geo_locate")}
        </Button>
      ) : null}
      {/* Chưa có map picker nhúng (cần thêm thư viện bản đồ, việc lớn hơn — để riêng) — mở bản đồ
          ngoài xem nhanh toạ độ đã có, không cần thư viện mới, không rủi ro kiến trúc. */}
      {coords ? (
        <a
          href={`https://www.openstreetmap.org/?mlat=${coords[1]}&mlon=${coords[0]}#map=17/${coords[1]}/${coords[0]}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
        >
          <ExternalLink className="size-3.5" /> {t("control.geo_open_map")}
        </a>
      ) : null}
      {err ? <span className="text-xs text-destructive">{err}</span> : null}
    </div>
  );
}
