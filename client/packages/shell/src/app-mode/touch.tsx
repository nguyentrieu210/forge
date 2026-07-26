import type { ReactNode } from "react";
import { Minus, Plus, ScanLine, ChevronRight } from "lucide-react";
import { cn, Button, Input } from "@metaforge/ui";

/** Thẻ chạm lớn (mục danh sách) — tap toàn thẻ, dễ chạm hiện trường. Dùng Button (không native). */
export function TouchCard({ onClick, active, children, className }: {
  onClick?: () => void; active?: boolean; children: ReactNode; className?: string;
}) {
  return (
    <Button
      variant="outline"
      onClick={onClick}
      className={cn(
        "flex h-auto w-full items-center justify-start gap-3 whitespace-normal rounded-xl border bg-card p-4 text-left",
        active && "border-primary ring-2 ring-primary/30",
        className,
      )}
    >
      <span className="min-w-0 flex-1">{children}</span>
      {onClick ? <ChevronRight className="shrink-0 text-muted-foreground" /> : null}
    </Button>
  );
}

/** Nút hành động lớn dính đáy (GIAO/NHẬN) — cao 56px, chạm 1 tay. */
export function BigButton({ children, onClick, disabled, variant = "default", className }: {
  children: ReactNode; onClick?: () => void; disabled?: boolean;
  variant?: "default" | "success" | "destructive" | "outline"; className?: string;
}) {
  const base = "h-14 w-full rounded-xl text-base font-semibold";
  if (variant === "success") {
    return <Button onClick={onClick} disabled={disabled} className={cn(base, "bg-success text-white hover:bg-success/90", className)}>{children}</Button>;
  }
  const uiVariant = variant === "destructive" ? "destructive" : variant === "outline" ? "outline" : "default";
  return <Button variant={uiVariant} onClick={onClick} disabled={disabled} className={cn(base, className)}>{children}</Button>;
}

/** Bộ tăng/giảm số lượng — nút to ±, ô số ở giữa. */
export function QtyStepper({ value, onChange, min = 0, max, step = 1 }: {
  value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number;
}) {
  const clamp = (v: number) => Math.max(min, max != null ? Math.min(max, v) : v);
  return (
    <div className="flex items-center gap-1.5">
      <Button type="button" variant="outline" size="icon" className="size-11 shrink-0 rounded-lg" onClick={() => onChange(clamp(value - step))} aria-label="Giảm">
        <Minus />
      </Button>
      <Input
        inputMode="decimal"
        value={String(value)}
        onChange={(e) => { const n = Number(e.target.value.replace(",", ".")); if (!Number.isNaN(n)) onChange(clamp(n)); }}
        className="h-11 w-16 text-center text-base font-semibold"
      />
      <Button type="button" variant="outline" size="icon" className="size-11 shrink-0 rounded-lg" onClick={() => onChange(clamp(value + step))} aria-label="Tăng">
        <Plus />
      </Button>
    </div>
  );
}

/** Ô quét mã / nhập lô — icon quét + input lớn. */
export function ScanField({ value, onChange, placeholder = "Quét hoặc nhập mã…", onEnter }: {
  value: string; onChange: (v: string) => void; placeholder?: string; onEnter?: (v: string) => void;
}) {
  return (
    <div className="relative">
      <ScanLine className="pointer-events-none absolute left-3 top-1/2 z-10 size-5 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && onEnter) onEnter(value); }}
        placeholder={placeholder}
        className="h-12 pl-10 text-base"
      />
    </div>
  );
}
