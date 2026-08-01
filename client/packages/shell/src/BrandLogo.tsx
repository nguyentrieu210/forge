import { useId, type CSSProperties } from "react";
import { cn } from "@metaforge/ui";

export interface ForgeBrandLogoProps {
  size?: number;
  className?: string;
  title?: string;
  /** Hiện chữ thương hiệu bên phải biểu tượng. */
  wordmark?: boolean;
  name?: string;
  subtitle?: string;
}

/**
 * Logo Forge dùng chung cho landing, login, shell và PWA.
 * SVG giữ nét rõ ở mọi kích thước, không cần duy trì nhiều bản PNG lệch màu.
 */
export function ForgeBrandLogo({
  size = 36,
  className,
  title = "Forge",
  wordmark = false,
  name = "Forge",
  subtitle,
}: ForgeBrandLogoProps) {
  const id = useId().replace(/:/g, "");
  const gradientId = `forge-gradient-${id}`;
  const shadowId = `forge-shadow-${id}`;
  const style = { "--forge-logo-size": `${size}px` } as CSSProperties;

  const mark = (
    <svg
      viewBox="0 0 96 96"
      role="img"
      aria-label={title}
      className="size-full"
    >
      <defs>
        <linearGradient id={gradientId} x1="10" y1="10" x2="86" y2="86" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#7c3aed" />
          <stop offset="0.52" stopColor="#d946ef" />
          <stop offset="1" stopColor="#fb923c" />
        </linearGradient>
        <filter id={shadowId} x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="4" stdDeviation="5" floodColor="#7c3aed" floodOpacity="0.24" />
        </filter>
      </defs>
      <circle cx="48" cy="48" r="43" fill={`url(#${gradientId})`} filter={`url(#${shadowId})`} />
      <g fill="none" stroke="#fff" strokeLinecap="round" strokeLinejoin="round">
        <path d="M31 66 47.5 28 66 66" strokeWidth="9" />
        <path d="M39.5 52.5h17" strokeWidth="7" />
        <path d="M22 43.5 31.5 39" strokeWidth="5.5" />
        <path d="M20.5 54 30 49.5" strokeWidth="5.5" />
      </g>
    </svg>
  );

  if (!wordmark) {
    return (
      <span
        className={cn("inline-grid shrink-0 place-items-center", className)}
        style={{ width: `var(--forge-logo-size)`, height: `var(--forge-logo-size)`, ...style }}
      >
        {mark}
      </span>
    );
  }

  return (
    <span className={cn("inline-flex min-w-0 items-center gap-2.5", className)}>
      <span className="inline-grid shrink-0 place-items-center" style={{ width: size, height: size }}>
        {mark}
      </span>
      <span className="min-w-0 leading-none">
        <span className="block truncate text-[1.05rem] font-bold tracking-[-0.035em]">{name}</span>
        {subtitle ? (
          <span className="mt-1 block truncate text-[0.62rem] font-semibold uppercase tracking-[0.17em] text-muted-foreground">
            {subtitle}
          </span>
        ) : null}
      </span>
    </span>
  );
}
