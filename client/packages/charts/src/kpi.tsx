/** @jsxImportSource react */
import type { ReactNode } from "react";
import { ForgeSparkline } from "./specialized.js";

export type ForgeKpiTone = "neutral" | "info" | "success" | "warning" | "danger";

export interface ForgeKpiCardProps {
  label: string;
  value: number | string;
  formatted?: string;
  trend?: number;
  higherIsBetter?: boolean;
  tone?: ForgeKpiTone;
  description?: string;
  eyebrow?: string;
  icon?: ReactNode;
  sparkline?: number[];
  onActivate?: () => void;
  changed?: boolean;
  className?: string;
}

const toneClass: Record<ForgeKpiTone, string> = {
  neutral: "text-foreground",
  info: "text-sky-600 dark:text-sky-400",
  success: "text-emerald-600 dark:text-emerald-400",
  warning: "text-amber-600 dark:text-amber-400",
  danger: "text-destructive",
};

export function ForgeKpiCard({
  label,
  value,
  formatted,
  trend,
  higherIsBetter = true,
  tone = "neutral",
  description,
  eyebrow,
  icon,
  sparkline,
  onActivate,
  changed = false,
  className = "",
}: ForgeKpiCardProps) {
  const trendGood = typeof trend === "number" && trend !== 0 && ((trend > 0) === higherIsBetter);
  const trendClass = trend === 0 ? "text-muted-foreground" : trendGood ? "text-emerald-600 dark:text-emerald-400" : "text-destructive";
  const body = (
    <>
      <div className="flex min-w-0 items-start gap-3">
        <div className="min-w-0 flex-1">
          {eyebrow ? <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{eyebrow}</div> : null}
          <div className="truncate text-xs font-medium text-muted-foreground">{label}</div>
          <div className={`mt-2 truncate text-[clamp(1.45rem,2.4vw,2rem)] font-bold leading-none tracking-[-0.035em] tabular-nums ${toneClass[tone]} ${changed ? "scale-[1.01]" : "scale-100"} transition-transform duration-200 motion-reduce:transition-none`}>{formatted ?? String(value)}</div>
          {typeof trend === "number" ? <div className={`mt-2 text-[11px] font-semibold tabular-nums ${trendClass}`} aria-label={`${trend > 0 ? "Tăng" : trend < 0 ? "Giảm" : "Không đổi"} ${Math.abs(trend)} phần trăm`}>{trend > 0 ? "↗" : trend < 0 ? "↘" : "→"} {Math.abs(trend)}%</div> : null}
        </div>
        {icon ? <div className="grid size-9 shrink-0 place-items-center rounded-md border bg-muted/35 text-muted-foreground">{icon}</div> : null}
      </div>
      {sparkline?.length ? <div className="mt-3 -mx-1"><ForgeSparkline values={sparkline} height={38} ariaLabel={`Xu hướng ${label}`} /></div> : null}
      {description ? <div className="mt-2 line-clamp-2 text-[11px] leading-4 text-muted-foreground">{description}</div> : null}
    </>
  );
  const classes = `min-w-0 rounded-lg border bg-card/95 p-4 text-left shadow-[0_1px_0_rgba(0,0,0,.025)] transition-[border-color,box-shadow,transform] duration-150 motion-reduce:transition-none ${onActivate ? "hover:-translate-y-px hover:border-primary/40 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30" : ""} ${className}`;
  return onActivate ? <button type="button" onClick={onActivate} className={classes}>{body}</button> : <div className={classes}>{body}</div>;
}

export function ForgeKpiStrip({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4 ${className}`}>{children}</div>;
}

export function ForgeDashboardPanel({ title, subtitle, action, children, className = "" }: { title: string; subtitle?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`min-w-0 rounded-lg border bg-card/95 shadow-[0_1px_0_rgba(0,0,0,.025)] ${className}`}>
      <header className="flex min-w-0 items-start gap-3 border-b px-4 py-3">
        <div className="min-w-0 flex-1"><h3 className="truncate text-sm font-semibold tracking-[-0.01em]">{title}</h3>{subtitle ? <p className="mt-0.5 text-[11px] text-muted-foreground">{subtitle}</p> : null}</div>
        {action}
      </header>
      <div className="min-w-0 p-4">{children}</div>
    </section>
  );
}
