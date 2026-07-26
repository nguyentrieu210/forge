import type { ReactNode } from "react";
import { Badge, Button, Label } from "../ui";
import type { Banner } from "../lib/useDocLifecycle";
import type { MutationAction } from "../lib/cloudforge";

export const DOCSTATUS: Record<number, { label: string; variant: "secondary" | "success" | "destructive" }> = {
  0: { label: "Draft", variant: "secondary" },
  1: { label: "Submitted", variant: "success" },
  2: { label: "Cancelled", variant: "destructive" },
};

export function DocStatusBadge({ docstatus }: { docstatus: number | null }) {
  if (docstatus === null) return null;
  const meta = DOCSTATUS[docstatus];
  if (!meta) return null;
  return <Badge variant={meta.variant}>{meta.label}</Badge>;
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function BannerView({
  banner,
  pending,
  onRetry,
}: {
  banner: Banner | null;
  pending: { action: MutationAction } | null;
  onRetry: () => void;
}) {
  if (!banner) return null;
  const className =
    banner.kind === "success"
      ? "rounded-md border border-[hsl(var(--success)/0.4)] bg-[hsl(var(--success)/0.1)] p-3 text-sm"
      : banner.kind === "conflict"
        ? "rounded-md border border-[hsl(var(--warning)/0.5)] bg-[hsl(var(--warning)/0.12)] p-3 text-sm"
        : "rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm";
  return (
    <div className={className}>
      <div className="flex items-center gap-2">
        {banner.code && (
          <Badge variant={banner.kind === "conflict" ? "warning" : banner.kind === "success" ? "success" : "destructive"}>
            {banner.code}
          </Badge>
        )}
        <span>{banner.message}</span>
      </div>
      {banner.traceId && <p className="mt-1 font-mono text-xs text-muted-foreground">trace {banner.traceId}</p>}
      {banner.kind === "conflict" && (
        <p className="mt-2 text-muted-foreground">
          The document changed on the server. Reload to get the latest version before editing again.
        </p>
      )}
      {pending && (
        <Button className="mt-2" size="sm" variant="outline" onClick={onRetry}>
          Retry {pending.action} (same command)
        </Button>
      )}
    </div>
  );
}

/** Local amount preview (client-side only; the server recomputes authoritatively). */
export function money(qty: string, rate: string): number {
  return (Number(qty) || 0) * (Number(rate) || 0);
}
