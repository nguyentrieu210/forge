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

/**
 * Fallback khi chưa đọc được biến CSS (SSR, lúc stylesheet chưa vào, host tách khỏi document).
 *
 * Chúng PHẢI bám sát `@metaforge/ui/styles.css`. Trước đây thì không: `primary` ở đây là
 * `#e52521` — màu ĐỎ của một brand đã bỏ từ lâu, trong khi diện mạo đang chạy là navy
 * `#1e40af`. Fallback lệch brand không bao giờ bị bắt vì đường chạy bình thường luôn đọc được
 * biến CSS; nó chỉ hiện ra đúng lúc tệ nhất, là lúc có sự cố.
 */
const LIGHT: ForgeChartTokens = {
  dark: false,
  background: "#ffffff",
  surface: "#f8f9fb",
  text: "#111827",
  muted: "#4b5563",
  border: "#e1e5ea",
  primary: "#1e40af",
  success: "#16a34a",
  warning: "#d97706",
  danger: "#dc2626",
  info: "#1e40af",
  // 5 màu đầu = `--chart-1..5` bản light. Hai màu cuối là phần nối dài cho biểu đồ trên 5
  // series, giữ nguyên tính chất "hai series cạnh nhau khác cả sắc lẫn độ sáng".
  palette: ["#1e40af", "#0f766e", "#b45309", "#6d28d9", "#b91c1c", "#0891b2", "#be185d"],
};

const DARK: ForgeChartTokens = {
  dark: true,
  background: "#171a21",
  surface: "#1d212a",
  text: "#f3f4f6",
  muted: "#9ca3af",
  border: "#303641",
  primary: "#5b82ff",
  success: "#22c55e",
  warning: "#f59e0b",
  danger: "#f87171",
  info: "#5b82ff",
  palette: ["#5b82ff", "#2dd4bf", "#fbbf24", "#a78bfa", "#f87171", "#22d3ee", "#f472b6"],
};

/** Số màu series được khai thành token trong styles.css (`--chart-1` … `--chart-5`). */
const CHART_TOKEN_COUNT = 5;

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
  const primary = colorToken(style, ["--primary"], base.primary);
  return {
    ...base,
    background: colorToken(style, ["--card", "--background"], base.background),
    surface: colorToken(style, ["--muted"], base.surface),
    text: colorToken(style, ["--foreground"], base.text),
    muted: colorToken(style, ["--muted-foreground"], base.muted),
    border: colorToken(style, ["--border"], base.border),
    primary,
    success: colorToken(style, ["--success"], base.success),
    warning: colorToken(style, ["--warning"], base.warning),
    danger: colorToken(style, ["--destructive"], base.danger),
    info: colorToken(style, ["--info"], base.info),
    palette: chartPalette(style, base),
  };
}

/**
 * Dải màu series lấy từ `--chart-1..5` của styles.css.
 *
 * TRƯỚC ĐÂY chỉ series ĐẦU bám brand (`[primary, ...base.palette.slice(1)]`), còn series 2..7
 * luôn là mảng cứng — nên dải "navy → teal → hổ phách → tím → đỏ" mà styles.css chọn có chủ ý
 * (và `views` đã dùng qua `bg-chart-2`…) chỉ được tôn trọng đúng một nửa: hai hệ cùng nói về
 * màu biểu đồ mà bất đồng với nhau.
 *
 * Nay đọc đủ 5 token; series thứ 6 trở đi mới rơi về phần nối dài trong `base.palette`.
 */
function chartPalette(style: CSSStyleDeclaration, base: ForgeChartTokens): string[] {
  const resolved = base.palette.map((fallback, index) =>
    index < CHART_TOKEN_COUNT ? colorToken(style, [`--chart-${index + 1}`], fallback) : fallback,
  );
  return resolved;
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
