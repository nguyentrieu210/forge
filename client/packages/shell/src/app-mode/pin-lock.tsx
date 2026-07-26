/** @jsxImportSource react */
/**
 * PIN unlock nhanh cho thiết bị dùng chung (kiosk kho, tablet để ở quầy) — khoá màn hình App-mode
 * bằng mã PIN 4 số thay vì phải đăng xuất/đăng nhập lại mỗi lần đổi ca. Chỉ khoá UI cục bộ, KHÔNG
 * thay cho đăng nhập thật (session/CSRF vẫn nguyên) — mất PIN chỉ lộ màn hình đang mở, không lộ tài
 * khoản. Hash bằng Web Crypto (SHA-256, có sẵn trình duyệt) — không lưu PIN dạng chữ thô.
 */
import { useCallback, useState } from "react";
import { Delete, Lock } from "lucide-react";
import { cn, Button } from "@metaforge/ui";

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export interface UsePinLockResult {
  /** đã cấu hình PIN chưa (chưa cấu hình = tính năng tắt, không khoá gì cả). */
  enabled: boolean;
  locked: boolean;
  setPin: (pin: string) => Promise<void>;
  clearPin: () => void;
  tryUnlock: (pin: string) => Promise<boolean>;
  lock: () => void;
}

export function usePinLock(storageKey = "mf-pin-lock"): UsePinLockResult {
  const [hash, setHash] = useState<string | null>(() => {
    try { return localStorage.getItem(storageKey); } catch { return null; }
  });
  const [locked, setLocked] = useState<boolean>(() => {
    try { return Boolean(localStorage.getItem(storageKey)); } catch { return false; }
  });

  const setPin = useCallback(async (pin: string) => {
    const h = await sha256Hex(pin);
    try { localStorage.setItem(storageKey, h); } catch { /* private mode — PIN chỉ sống trong phiên này */ }
    setHash(h);
  }, [storageKey]);

  const clearPin = useCallback(() => {
    try { localStorage.removeItem(storageKey); } catch { /* ignore */ }
    setHash(null);
    setLocked(false);
  }, [storageKey]);

  const tryUnlock = useCallback(async (pin: string) => {
    if (!hash) return true;
    const h = await sha256Hex(pin);
    if (h === hash) { setLocked(false); return true; }
    return false;
  }, [hash]);

  const lock = useCallback(() => { if (hash) setLocked(true); }, [hash]);

  return { enabled: Boolean(hash), locked, setPin, clearPin, tryUnlock, lock };
}

export interface PinPadScreenProps {
  title?: string;
  onSubmit: (pin: string) => Promise<boolean>;
  length?: number;
}

/** Bàn phím số full-screen — nhập đủ `length` số thì tự gọi onSubmit; sai thì rung nhẹ + xoá. */
export function PinPadScreen({ title = "Nhập mã PIN", onSubmit, length = 4 }: PinPadScreenProps) {
  const [digits, setDigits] = useState("");
  const [shake, setShake] = useState(false);
  const [checking, setChecking] = useState(false);

  const press = async (d: string) => {
    if (checking) return;
    const next = (digits + d).slice(0, length);
    setDigits(next);
    if (next.length === length) {
      setChecking(true);
      const ok = await onSubmit(next);
      setChecking(false);
      if (!ok) {
        setShake(true);
        setDigits("");
        setTimeout(() => setShake(false), 400);
      }
    }
  };
  const backspace = () => setDigits((d) => d.slice(0, -1));

  return (
    <div className="mf-pin-lock fixed inset-0 z-[100] grid place-items-center bg-background p-6">
      <div className="flex w-full max-w-xs flex-col items-center gap-6">
        <div className="grid size-14 place-items-center rounded-full bg-muted"><Lock className="size-6 text-muted-foreground" /></div>
        <div className="text-center">
          <div className="font-semibold">{title}</div>
        </div>
        {/* Sai PIN → chấm đỏ nháy rồi xoá (đủ phản hồi, không cần @keyframes riêng chưa có trong theme). */}
        <div className="flex gap-3">
          {Array.from({ length }).map((_, i) => (
            <span key={i} className={cn("size-3.5 rounded-full border-2 transition-colors", shake ? "border-destructive bg-destructive" : i < digits.length ? "border-primary bg-primary" : "border-muted-foreground/40")} />
          ))}
        </div>
        <div className="grid grid-cols-3 gap-3">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
            <Button key={d} type="button" variant="outline" className="size-16 rounded-full text-xl font-medium" onClick={() => void press(d)} disabled={checking}>{d}</Button>
          ))}
          <span />
          <Button type="button" variant="outline" className="size-16 rounded-full text-xl font-medium" onClick={() => void press("0")} disabled={checking}>0</Button>
          <Button type="button" variant="ghost" className="size-16 rounded-full" aria-label="Xoá" onClick={backspace} disabled={checking}><Delete /></Button>
        </div>
      </div>
    </div>
  );
}
