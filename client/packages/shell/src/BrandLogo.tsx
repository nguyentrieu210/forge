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

/** Logo dùng chung cho landing, login, shell và PWA. */
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
  const clipId = `forge-circle-${id}`;
  const style = { "--forge-logo-size": `${size}px` } as CSSProperties;

  const mark = (
    <svg viewBox="0 0 96 96" role="img" aria-label={title} className="size-full">
      <defs>
        <linearGradient id={gradientId} x1="15" y1="10" x2="82" y2="88" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#6d28d9" />
          <stop offset="0.55" stopColor="#a21caf" />
          <stop offset="1" stopColor="#ec4899" />
        </linearGradient>
        <clipPath id={clipId}>
          <circle cx="48" cy="48" r="43" />
        </clipPath>
      </defs>

      <circle cx="48" cy="48" r="43" fill={`url(#${gradientId})`} />
      <g
        clipPath={`url(#${clipId})`}
        fill="none"
        stroke="#fff"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M10 37.5h20" strokeWidth="5.8" />
        <path d="M7 48h21" strokeWidth="5.8" />
        <path d="M13 58.5h13" strokeWidth="5.8" />
        <path d="M29.5 69 48 27 68.5 69" strokeWidth="9.2" />
        <path d="M39 53h19.5" strokeWidth="7.2" />
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
