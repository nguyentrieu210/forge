/** @jsxImportSource react */
import { AlertTriangle, Inbox, Loader2, RefreshCw } from "lucide-react";
import { Button, cn } from "@metaforge/ui";

export function RuntimeLoadingState({ label = "Đang tải…", className }: { label?: string; className?: string }) {
  return (
    <div className={cn("grid min-h-32 place-items-center px-4 text-sm text-muted-foreground", className)} role="status" aria-live="polite">
      <span className="inline-flex items-center gap-2"><Loader2 className="size-4 animate-spin" aria-hidden="true" />{label}</span>
    </div>
  );
}

export function RuntimeErrorState({
  message,
  retryLabel = "Thử lại",
  onRetry,
  className,
}: {
  message: string;
  retryLabel?: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div className={cn("m-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm", className)} role="alert">
      <div className="flex items-start gap-2 text-destructive"><AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" /><span>{message}</span></div>
      {onRetry ? <Button type="button" variant="outline" size="sm" className="mt-3" onClick={onRetry}><RefreshCw className="size-4" />{retryLabel}</Button> : null}
    </div>
  );
}

export function RuntimeEmptyState({
  title = "Chưa có dữ liệu",
  description,
  action,
  className,
}: {
  title?: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("grid min-h-36 place-items-center rounded-lg border border-dashed bg-card/60 px-6 py-8 text-center", className)}>
      <div className="max-w-md">
        <Inbox className="mx-auto size-8 text-muted-foreground" aria-hidden="true" />
        <h3 className="mt-3 text-sm font-semibold">{title}</h3>
        {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
        {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
      </div>
    </div>
  );
}
