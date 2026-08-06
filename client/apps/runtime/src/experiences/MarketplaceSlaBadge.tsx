import { StatusBadge } from "@metaforge/ui";

export type MarketplaceSlaState = "on_track" | "at_risk" | "met" | "breached" | "not_applicable" | "policy_invalid";

export interface MarketplaceSlaObservation {
  metric: "order_to_fulfillment";
  state: MarketplaceSlaState;
  target_minutes: number | null;
  warning_minutes: number | null;
  due_at: string | null;
  fulfilled_at: string | null;
  remaining_minutes: number | null;
}

export function MarketplaceSlaBadge({ sla }: { sla: MarketplaceSlaObservation | null }) {
  if (!sla) return <StatusBadge tone="muted">Chưa cấu hình SLA</StatusBadge>;
  const tone = sla.state === "met" || sla.state === "on_track" ? "success"
    : sla.state === "at_risk" || sla.state === "breached" || sla.state === "policy_invalid" ? "warning"
      : "muted";
  return (
    <div className="grid gap-0.5">
      <StatusBadge tone={tone}>{slaLabel(sla.state)}</StatusBadge>
      {sla.due_at && !sla.fulfilled_at && sla.state !== "not_applicable" ? (
        <span className="whitespace-nowrap text-[11px] text-muted-foreground">Hạn {dateTime(sla.due_at)}</span>
      ) : sla.fulfilled_at ? (
        <span className="whitespace-nowrap text-[11px] text-muted-foreground">Ghi nhận {dateTime(sla.fulfilled_at)}</span>
      ) : null}
    </div>
  );
}

export function slaNeedsAttention(sla: MarketplaceSlaObservation | null): boolean {
  return sla?.state === "at_risk" || sla?.state === "breached" || sla?.state === "policy_invalid";
}

function slaLabel(state: MarketplaceSlaState): string {
  if (state === "on_track") return "Đúng SLA";
  if (state === "at_risk") return "Sắp tới hạn";
  if (state === "met") return "Đạt SLA";
  if (state === "breached") return "Vi phạm SLA";
  if (state === "not_applicable") return "Không áp dụng";
  return "Policy SLA lỗi";
}

function dateTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("vi-VN");
}
