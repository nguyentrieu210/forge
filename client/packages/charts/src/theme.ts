import type { ForgeChartTheme } from "./types.js";

export interface ForgeChartTokens {
  dark: boolean;
  background: string;
  surface: string;
  text: string;
  muted: string;
  border: string;
  primary: string;
  success: string;
  warning: string;
  danger: string;
  info: string;
  palette: string[];
}

const LIGHT: ForgeChartTokens = {
  dark: false,
  background: "#ffffff",
  surface: "#f6f7f8",
  text: "#15171a",
  muted: "#69707d",
  border: "#dee2e7",
  primary: "#e52521",
  success: "#168a4f",
  warning: "#c47a09",
  danger: "#d92d20",
  info: "#2563eb",
  palette: ["#e52521", "#2563eb", "#168a4f", "#c47a09", "#7c3aed", "#0891b2", "#db2777"],
};

const DARK: ForgeChartTokens = {
  dark: true,
  background: "#131519",
  surface: "#191c21",
  text: "#f7f7f8",
  muted: "#9ca3af",
  border: "#292d33",
  primary: "#ef332d",
  success: "#32b36f",
  warning: "#f0a63a",
  danger: "#ff514a",
  info: "#59a5ff",
  palette: ["#ef332d", "#59a5ff", "#32b36f", "#f0a63a", "#a78bfa", "#22d3ee", "#f472b6"],
};

function colorToken(style: CSSStyleDeclaration, names: string[], fallback: string): string {
  for (const name of names) {
    const value = style.getPropertyValue(name).trim();
    if (value && /^(#|rgb|hsl|oklch|oklab|color\()/i.test(value)) return value;
  }
  return fallback;
}

export function prefersDark(host?: HTMLElement | null): boolean {
  if (typeof document === "undefined") return false;
  const root = document.documentElement;
  if (root.classList.contains("dark") || root.dataset.theme === "dark") return true;
  if (root.dataset.theme === "light") return false;
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches === true;
}

export function resolveForgeChartTokens(host: HTMLElement, mode: ForgeChartTheme = "auto"): ForgeChartTokens {
  const dark = mode === "dark" || (mode === "auto" && prefersDark(host));
  const base = dark ? DARK : LIGHT;
  if (typeof window === "undefined") return base;
  const style = window.getComputedStyle(host);
  const primary = colorToken(style, ["--forge-primary", "--primary"], base.primary);
  return {
    ...base,
    background: colorToken(style, ["--forge-surface", "--background", "--card"], base.background),
    surface: colorToken(style, ["--forge-surface-soft", "--muted"], base.surface),
    text: colorToken(style, ["--forge-foreground", "--foreground"], base.text),
    muted: colorToken(style, ["--forge-muted", "--muted-foreground"], base.muted),
    border: colorToken(style, ["--forge-border", "--border"], base.border),
    primary,
    success: colorToken(style, ["--success"], base.success),
    warning: colorToken(style, ["--warning"], base.warning),
    danger: colorToken(style, ["--destructive"], base.danger),
    info: colorToken(style, ["--info"], base.info),
    palette: [primary, ...base.palette.slice(1)],
  };
}

export function compactMetric(value: number, locale = "vi-VN"): string {
  if (!Number.isFinite(value)) return "–";
  const absolute = Math.abs(value);
  const format = (scaled: number, suffix: string) => `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(scaled)} ${suffix}`;
  if (absolute >= 1_000_000_000) return format(value / 1_000_000_000, "tỷ");
  if (absolute >= 1_000_000) return format(value / 1_000_000, "tr");
  if (absolute >= 10_000) return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(value / 1_000)}k`;
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value);
}
