/** @jsxImportSource react */
/**
 * Quét mã vạch / QR bằng CAMERA điện thoại.
 *
 * Dùng BarcodeDetector có sẵn trong trình duyệt (Chrome/Edge Android, Chrome desktop) thay vì kéo
 * một thư viện giải mã vài trăm KB về. Lý do: app này đã phải nhẹ để chạy trên sóng yếu giữa kho,
 * và thư viện giải mã là thứ nặng nhất người ta hay nhét thêm vào.
 *
 * Trình duyệt KHÔNG hỗ trợ (Safari/iOS tới nay vẫn chưa bật BarcodeDetector) thì nói thẳng và chỉ
 * đường dùng máy quét cầm tay — KHÔNG im lặng hiện camera không bao giờ nhận mã, vì như thế người
 * dùng sẽ đứng soi mã cả phút rồi tưởng hàng chưa được khai.
 *
 * Bắt buộc HTTPS: getUserMedia bị trình duyệt chặn trên HTTP (trừ localhost). Đây là một lý do
 * nữa để bật TLS — xem mf-enable-tls trên máy chủ.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, X, TriangleAlert } from "lucide-react";
import { Button, Dialog, DialogContent, DialogHeader, DialogTitle, cn } from "@metaforge/ui";

type DetectorCtor = new (opts?: { formats?: string[] }) => {
  detect: (src: CanvasImageSource) => Promise<Array<{ rawValue: string }>>;
};

function getDetectorCtor(): DetectorCtor | undefined {
  return (globalThis as unknown as { BarcodeDetector?: DetectorCtor }).BarcodeDetector;
}

export function cameraScanSupported(): boolean {
  return Boolean(getDetectorCtor()) && Boolean(navigator.mediaDevices?.getUserMedia);
}

/** Lý do KHÔNG quét được bằng camera — để hiện đúng thông điệp thay vì "lỗi không rõ". */
export function cameraScanBlockedReason(): string | undefined {
  if (!globalThis.isSecureContext) return "insecure";
  if (!navigator.mediaDevices?.getUserMedia) return "nocam";
  if (!getDetectorCtor()) return "nodetector";
  return undefined;
}

export function CameraScanButton({ onScan, className }: { onScan: (code: string) => void; className?: string }) {
  const [open, setOpen] = useState(false);
  const reason = cameraScanBlockedReason();

  return (
    <>
      <Button
        type="button"
        variant="outline"
        className={cn("shrink-0", className)}
        onClick={() => setOpen(true)}
        aria-label="Quét bằng camera"
        title={reason ? "Máy/trình duyệt này không quét camera được" : "Quét bằng camera"}
      >
        <Camera className="size-4" />
      </Button>
      <ScannerDialog open={open} onOpenChange={setOpen} onScan={(c) => { onScan(c); setOpen(false); }} reason={reason} />
    </>
  );
}

function ScannerDialog({ open, onOpenChange, onScan, reason }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onScan: (code: string) => void;
  reason?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [err, setErr] = useState<string | undefined>();
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const doneRef = useRef(false);

  const stop = useCallback(() => {
    if (rafRef.current != null) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    if (!open || reason) return;
    doneRef.current = false;
    let cancelled = false;

    (async () => {
      try {
        // facingMode "environment" = camera sau. Không có cờ này thì điện thoại mở camera trước,
        // người dùng phải tự lật — giữa kho, một tay cầm hàng, đó là thao tác thừa gây bực.
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        const v = videoRef.current;
        if (!v) return;
        v.srcObject = stream;
        await v.play();

        const Ctor = getDetectorCtor()!;
        const detector = new Ctor({
          formats: ["qr_code", "code_128", "ean_13", "ean_8", "code_39", "codabar", "itf"],
        });

        const tick = async () => {
          if (cancelled || doneRef.current) return;
          try {
            if (v.readyState >= 2) {
              const hits = await detector.detect(v);
              const code = hits[0]?.rawValue?.trim();
              if (code) {
                doneRef.current = true;
                // Rung nhẹ báo đã bắt được — trong kho ồn, tín hiệu bằng mắt dễ bị bỏ lỡ.
                navigator.vibrate?.(60);
                onScan(code);
                return;
              }
            }
          } catch {
            /* khung hình lỗi lẻ tẻ là bình thường, cứ quét khung sau */
          }
          rafRef.current = requestAnimationFrame(() => void tick());
        };
        rafRef.current = requestAnimationFrame(() => void tick());
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      }
    })();

    return () => { cancelled = true; stop(); };
  }, [open, reason, onScan, stop]);

  useEffect(() => { if (!open) stop(); }, [open, stop]);

  const message = reason === "insecure"
    ? "Camera chỉ dùng được trên kết nối HTTPS. Trang này đang chạy HTTP nên trình duyệt chặn."
    : reason === "nodetector"
      ? "Trình duyệt này chưa hỗ trợ đọc mã bằng camera (Safari/iOS chưa có). Dùng Chrome trên Android, hoặc dùng máy quét cầm tay."
      : reason === "nocam"
        ? "Không tìm thấy camera trên thiết bị này."
        : err;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(94vw,28rem)] max-w-none p-0">
        <DialogHeader className="border-b px-4 py-3">
          <DialogTitle>Quét mã bằng camera</DialogTitle>
        </DialogHeader>
        <div className="p-4">
          {message ? (
            <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-[13px]">
              <TriangleAlert className="mt-0.5 size-4 shrink-0 text-destructive" />
              <span>{message}</span>
            </div>
          ) : (
            <div className="relative overflow-hidden rounded-md bg-black">
              {/* playsInline: thiếu nó thì iOS bung video ra toàn màn hình, che mất app. */}
              <video ref={videoRef} className="h-[15rem] w-full object-cover" muted playsInline />
              {/* Khung ngắm: nói cho người dùng biết đưa mã vào đâu. Không có nó thì người ta
                  quét cả màn hình và không hiểu vì sao lúc được lúc không. */}
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="h-24 w-56 rounded-md border-2 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
              </div>
            </div>
          )}
          <div className="mt-3 flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">
              {message ? "" : "Đưa mã vạch hoặc QR vào giữa khung."}
            </span>
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              <X className="mr-1 size-3.5" /> Đóng
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
