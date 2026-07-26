import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/cn.js";

export const badgeVariants = cva(
  // Bỏ `focus:outline-none`: Badge là <span> không nhận focus nên nó vô tác dụng, và nếu ai đó
  // bọc Badge trong phần tử bấm được thì nó lại XOÁ luôn chỉ báo focus của phần tử đó.
  "inline-flex items-center rounded-sm border px-2 py-0.5 text-[11px] font-medium transition-colors",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground font-semibold",
        secondary: "border-transparent bg-muted text-muted-foreground",
        // Chữ dùng biến *-text: --destructive/--success/--warning đặt trên nền 15% chỉ đạt ~3:1,
        // trượt AA cho cỡ chữ 11px. Nền/viền vẫn giữ màu gốc để giữ đúng sắc thái.
        destructive: "border-transparent bg-destructive/15 text-destructive-text",
        success: "border-transparent bg-success/15 text-success-text",
        warning: "border-transparent bg-warning/15 text-warning-text",
        info: "border-transparent bg-info/15 text-info-text",
        outline: "text-foreground",
        // pill "Nháp" — viền tròn, cảnh báo nhẹ
        pill: "rounded-full bg-muted text-destructive border-destructive/40",
        // mono id/version chip
        mono: "bg-muted text-muted-foreground font-mono border-transparent",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

/** Tông semantic cho StatusBadge (dot + label) — theo scMap prototype. */
export type StatusTone = "info" | "blue" | "warning" | "amber" | "success" | "green" | "destructive" | "red" | "subtle" | "muted";
// Dùng bản *-text (đã chỉnh đủ 4.5:1) — bản gốc --success #16a34a / --warning #ca8a04 trên nền
// sáng chỉ ~3:1, mà đây lại là chữ 11.5px, cỡ nhỏ nhất trong hệ thống.
const TONE_TEXT: Record<StatusTone, string> = {
  info: "text-info-text", blue: "text-info-text",
  warning: "text-warning-text", amber: "text-warning-text",
  success: "text-success-text", green: "text-success-text",
  destructive: "text-destructive-text", red: "text-destructive-text",
  subtle: "text-subtle", muted: "text-muted-foreground",
};

/**
 * StatusBadge — dot 6px + nhãn, màu semantic theo trạng thái (Run2 spec):
 * `padding 2px 9px · radius 6px · 11.5px/600`, dot = currentColor, nền nhạt.
 */
export function StatusBadge({
  tone = "muted", dot = true, className, children,
}: { tone?: StatusTone; dot?: boolean; className?: string; children: React.ReactNode }) {
  return (
    <span className={cn(
      "inline-flex items-center gap-1.5 rounded-sm border border-current/15 bg-current/10 px-2.5 py-0.5 text-[11.5px] font-semibold leading-none",
      TONE_TEXT[tone], className,
    )}>
      {dot ? <span className="size-1.5 shrink-0 rounded-full bg-current" /> : null}
      <span>{children}</span>
    </span>
  );
}
