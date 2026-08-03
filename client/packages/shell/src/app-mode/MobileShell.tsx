import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { cn, Button } from "@metaforge/ui";

export interface MobileShellProps {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  /** slot phải header (vd nút làm mới / avatar). */
  right?: ReactNode;
  /** thanh hành động dính đáy (nút to GIAO/NHẬN…). */
  bottomBar?: ReactNode;
  children: ReactNode;
}

/**
 * MobileShell — khung App-mode touch-first. Phone = full width; tablet = canh giữa rộng hơn.
 * Header dính trên (back + tiêu đề), nội dung cuộn, thanh hành động dính đáy (safe-area).
 * Theme/brand-aware qua token @metaforge/ui.
 */
export function MobileShell({ title, subtitle, onBack, right, bottomBar, children }: MobileShellProps) {
  return (
    <div className="flex h-[100dvh] w-full min-w-0 max-w-full flex-col overflow-hidden bg-muted/30 text-foreground">
      <header className="sticky top-0 z-20 flex w-full min-w-0 max-w-full items-center gap-2 border-b bg-card/95 px-3 py-2.5 backdrop-blur supports-[backdrop-filter]:bg-card/80">
        {onBack ? (
          <Button variant="ghost" size="icon" className="size-10 shrink-0" onClick={onBack} aria-label="Quay lại">
            <ArrowLeft className="size-5" />
          </Button>
        ) : null}
        <div className="min-w-0 flex-1">
          <div className="truncate text-base font-semibold leading-tight">{title}</div>
          {subtitle ? <div className="truncate text-xs text-muted-foreground">{subtitle}</div> : null}
        </div>
        {right}
      </header>

      <main className={cn(
        "mx-auto min-h-0 w-full min-w-0 max-w-xl flex-1 overflow-x-hidden overflow-y-auto overscroll-contain p-3 md:max-w-3xl md:p-5",
        bottomBar && "pb-[calc(5.75rem+env(safe-area-inset-bottom))] md:pb-[calc(6.25rem+env(safe-area-inset-bottom))]",
      )}>{children}</main>

      {bottomBar ? (
        <footer className={cn(
          "fixed inset-x-0 bottom-0 z-30 w-full min-w-0 max-w-full overflow-x-hidden border-t bg-card/95 p-3 shadow-[0_-8px_24px_-20px_rgb(0_0_0/0.45)] backdrop-blur supports-[backdrop-filter]:bg-card/80",
          "pb-[max(0.75rem,env(safe-area-inset-bottom))]",
        )}>
          <div className="mx-auto w-full max-w-xl md:max-w-3xl">{bottomBar}</div>
        </footer>
      ) : null}
    </div>
  );
}
