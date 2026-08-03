/** @jsxImportSource react */
import type { CSSProperties, ReactNode } from "react";

const RED = "var(--forge-primary, #ef332d)";
const BORDER = "var(--forge-border, #292d33)";
const MUTED = "var(--forge-muted, #9ca3af)";

export function DataPanel({ title, eyebrow, action, children, className = "" }: { title?: string; eyebrow?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`relative min-w-0 overflow-hidden rounded-lg border border-white/10 bg-[#111317]/92 shadow-[0_18px_60px_rgba(0,0,0,.22)] ${className}`}>
      {(title || eyebrow || action) ? <header className="flex min-w-0 items-start gap-3 border-b border-white/8 px-4 py-3">
        <div className="min-w-0 flex-1">{eyebrow ? <div className="mb-1 text-[9px] font-semibold uppercase tracking-[0.18em] text-white/42">{eyebrow}</div> : null}{title ? <h3 className="truncate text-sm font-semibold tracking-[-0.01em] text-white/92">{title}</h3> : null}</div>
        {action}
      </header> : null}
      <div className="min-w-0 p-4">{children}</div>
    </section>
  );
}

export function EdgeFrame({ children, className = "" }: { children: ReactNode; className?: string }) {
  const corner = "pointer-events-none absolute size-3 border-[var(--forge-primary,#ef332d)] opacity-75";
  return (
    <div className={`relative ${className}`}>
      <span className={`${corner} left-0 top-0 border-l border-t`} aria-hidden="true" />
      <span className={`${corner} right-0 top-0 border-r border-t`} aria-hidden="true" />
      <span className={`${corner} bottom-0 left-0 border-b border-l`} aria-hidden="true" />
      <span className={`${corner} bottom-0 right-0 border-b border-r`} aria-hidden="true" />
      {children}
    </div>
  );
}

export function GlowDivider({ className = "" }: { className?: string }) {
  return <div className={`h-px w-full ${className}`} style={{ background: `linear-gradient(90deg, transparent, ${RED}, transparent)`, opacity: 0.48 }} aria-hidden="true" />;
}

export function MetricNumber({ label, value, suffix, hint, accent = false }: { label?: string; value: string | number; suffix?: string; hint?: string; accent?: boolean }) {
  return (
    <div className="min-w-0">
      {label ? <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/42">{label}</div> : null}
      <div className={`mt-1 truncate text-[clamp(1.65rem,3vw,2.6rem)] font-bold leading-none tracking-[-0.045em] tabular-nums ${accent ? "text-[var(--forge-primary,#ef332d)]" : "text-white"}`}>{value}{suffix ? <span className="ml-1 text-[0.42em] font-semibold tracking-normal text-white/45">{suffix}</span> : null}</div>
      {hint ? <div className="mt-2 text-[10px] text-white/38">{hint}</div> : null}
    </div>
  );
}

export function StatusPulse({ label, active = false, tone = "neutral" }: { label: string; active?: boolean; tone?: "neutral" | "ok" | "warning" | "danger" }) {
  const toneClass = tone === "ok" ? "bg-emerald-400" : tone === "warning" ? "bg-amber-400" : tone === "danger" ? "bg-[var(--forge-primary,#ef332d)]" : "bg-white/45";
  return <span className="inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/52"><span className={`size-1.5 rounded-full ${toneClass} ${active ? "animate-pulse motion-reduce:animate-none" : ""}`} aria-hidden="true" />{label}</span>;
}

export function FlowLine({ active = false, direction = "right", className = "" }: { active?: boolean; direction?: "right" | "left"; className?: string }) {
  const points = direction === "right" ? "0,6 92,6 86,2 92,6 86,10" : "92,6 0,6 6,2 0,6 6,10";
  return <svg className={`h-3 w-full ${className}`} viewBox="0 0 92 12" preserveAspectRatio="none" aria-hidden="true"><polyline points={points} fill="none" stroke={active ? RED : BORDER} strokeWidth={active ? 1.5 : 1} vectorEffect="non-scaling-stroke" /><circle cx={direction === "right" ? 2 : 90} cy="6" r={active ? 2 : 1.4} fill={active ? RED : MUTED} /></svg>;
}

export function GeoConnection({ from = [10, 72], to = [90, 24], active = false, className = "" }: { from?: [number, number]; to?: [number, number]; active?: boolean; className?: string }) {
  const midX = (from[0] + to[0]) / 2;
  const midY = Math.min(from[1], to[1]) - 20;
  const path = `M ${from[0]} ${from[1]} Q ${midX} ${midY} ${to[0]} ${to[1]}`;
  return <svg className={`h-full w-full ${className}`} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><path d={path} fill="none" stroke={active ? RED : BORDER} strokeWidth={active ? 1.6 : 1} vectorEffect="non-scaling-stroke" /><circle cx={from[0]} cy={from[1]} r="2" fill={active ? RED : MUTED} /><circle cx={to[0]} cy={to[1]} r="2" fill={active ? RED : MUTED} /></svg>;
}

export function RadarFrame({ rings = 4, spokes = 6, className = "" }: { rings?: number; spokes?: number; className?: string }) {
  const center = 50;
  const pointAt = (radius: number, index: number) => {
    const angle = -Math.PI / 2 + (Math.PI * 2 * index) / Math.max(spokes, 3);
    return `${center + Math.cos(angle) * radius},${center + Math.sin(angle) * radius}`;
  };
  return <svg className={`h-full w-full ${className}`} viewBox="0 0 100 100" aria-hidden="true">{Array.from({ length: Math.max(rings, 1) }, (_, ring) => { const radius = 42 * ((ring + 1) / Math.max(rings, 1)); return <polygon key={ring} points={Array.from({ length: Math.max(spokes, 3) }, (_, index) => pointAt(radius, index)).join(" ")} fill="none" stroke={BORDER} strokeWidth="0.7" />; })}{Array.from({ length: Math.max(spokes, 3) }, (_, index) => <line key={index} x1={center} y1={center} x2={pointAt(42, index).split(",")[0]} y2={pointAt(42, index).split(",")[1]} stroke={BORDER} strokeWidth="0.55" />)}</svg>;
}

export function CommandCenterGrid({ children, fullscreen = false, className = "", style }: { children: ReactNode; fullscreen?: boolean; className?: string; style?: CSSProperties }) {
  const backgroundImage = "linear-gradient(rgba(255,255,255,.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.025) 1px, transparent 1px), radial-gradient(circle at 50% 0%, rgba(239,51,45,.09), transparent 34%)";
  return <div className={`${fullscreen ? "min-h-screen" : "min-h-[32rem] rounded-xl"} relative overflow-hidden bg-[#090909] text-white ${className}`} style={{ backgroundImage, backgroundSize: "28px 28px, 28px 28px, 100% 100%", ...style }}>{children}</div>;
}

export function AlertBeacon({ label, detail, active = false, severity = "warning" }: { label: string; detail?: string; active?: boolean; severity?: "info" | "warning" | "danger" }) {
  const tone = severity === "danger" ? "border-[var(--forge-primary,#ef332d)]/45 bg-[var(--forge-primary,#ef332d)]/8" : severity === "warning" ? "border-amber-400/30 bg-amber-400/6" : "border-sky-400/30 bg-sky-400/6";
  const dot = severity === "danger" ? "bg-[var(--forge-primary,#ef332d)]" : severity === "warning" ? "bg-amber-400" : "bg-sky-400";
  return <div className={`flex min-w-0 items-start gap-3 rounded-md border px-3 py-2.5 ${tone}`}><span className={`mt-1 size-2 shrink-0 rounded-full ${dot} ${active ? "animate-pulse motion-reduce:animate-none" : ""}`} aria-hidden="true" /><div className="min-w-0"><div className="text-xs font-semibold text-white/88">{label}</div>{detail ? <div className="mt-0.5 text-[10px] leading-4 text-white/40">{detail}</div> : null}</div></div>;
}
