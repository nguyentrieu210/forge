import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { ChevronDown, Loader2 } from "lucide-react";
import { cn } from "../../lib/cn.js";
import { focusRing } from "./control-styles.js";

export const buttonVariants = cva(
  // `active:` — trước đây bấm chuột không có phản hồi thị giác nào ngoài hover.
  `inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium transition-colors ${focusRing} active:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-busy:cursor-progress [&_svg]:size-4 [&_svg]:shrink-0`,
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground font-semibold hover:bg-primary/90 active:bg-primary/80",
        destructive: "bg-destructive text-destructive-foreground font-semibold hover:bg-destructive/90 active:bg-destructive/80",
        outline: "border border-input bg-background hover:bg-accent hover:text-accent-foreground active:bg-accent/70",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80 active:bg-secondary/60",
        ghost: "hover:bg-accent hover:text-accent-foreground active:bg-accent/70",
        // TRƯỚC: `--accent-foreground` — ở brand zinc token đó là #18181b (đen) nên "link" trông
        // y hệt chữ thường, không ai biết bấm được. Link phải mang màu primary.
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        // Run2: md h34 / sm h26 / lg h40 — đều ≥24px nên đạt WCAG 2.2 "Target Size (Minimum)".
        default: "h-[34px] px-3.5 text-[12.5px]",
        sm: "h-[26px] rounded-sm px-2.5 text-[11px]",
        lg: "h-10 rounded-lg px-[18px] text-[13.5px]",
        icon: "size-[34px]",
        "icon-sm": "size-7",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  /** Đang chạy tác vụ: hiện spinner ở đầu nút, khoá nút, báo `aria-busy` cho trình đọc màn hình.
   * Trước đây mỗi nơi gọi tự chèn <Loader2 className="animate-spin"> + tự disable ⇒ mỗi chỗ một
   * kiểu và thường quên aria-busy. KHÔNG dùng chung với asChild (Slot chỉ nhận đúng 1 con). */
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, loading, disabled, children, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        disabled={disabled || (!asChild && loading) || undefined}
        aria-busy={loading || undefined}
        {...props}
      >
        {loading && !asChild ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
        {children}
      </Comp>
    );
  },
);
Button.displayName = "Button";

/**
 * SplitButton — nút chính bo trái + caret bo phải (Run2). Ghép với DropdownMenu:
 *   <div className="inline-flex"><SplitButton>Lưu</SplitButton>
 *     <DropdownMenu><DropdownMenuTrigger asChild><SplitButtonCaret/></DropdownMenuTrigger>…</DropdownMenu></div>
 */
export const SplitButton = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, ...props }, ref) => (
    <Button ref={ref} className={cn("rounded-r-none", className)} {...props} />
  ),
);
SplitButton.displayName = "SplitButton";

export const SplitButtonCaret = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", "aria-label": ariaLabel, ...props }, ref) => (
    <Button
      ref={ref}
      variant={variant}
      // Nhãn mặc định là tiếng Anh trung tính và CHO PHÉP nơi gọi ghi đè bằng chuỗi đã dịch —
      // trước đây hardcode tiếng Việt "Thêm tùy chọn", không đổi được theo ngôn ngữ.
      aria-label={ariaLabel ?? "More options"}
      // TRƯỚC: `border-l-white/25` cứng — trên variant outline/secondary (nền sáng) vạch trắng này
      // vô hình. currentColor lấy đúng màu chữ của variant đang dùng.
      className={cn("w-[30px] rounded-l-none border-l border-l-current/25 px-0", className)}
      {...props}
    >
      <ChevronDown className="size-3.5" />
    </Button>
  ),
);
SplitButtonCaret.displayName = "SplitButtonCaret";
