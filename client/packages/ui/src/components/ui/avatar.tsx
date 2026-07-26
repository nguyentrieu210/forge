import * as React from "react";
import * as AvatarPrimitive from "@radix-ui/react-avatar";
import { cn } from "../../lib/cn.js";

export const Avatar = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Root>
>(({ className, ...props }, ref) => (
  <AvatarPrimitive.Root ref={ref} className={cn("relative flex h-8 w-8 shrink-0 overflow-hidden rounded-full", className)} {...props} />
));
Avatar.displayName = AvatarPrimitive.Root.displayName;

export const AvatarImage = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Image>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Image>
>(({ className, ...props }, ref) => (
  <AvatarPrimitive.Image ref={ref} className={cn("aspect-square h-full w-full", className)} {...props} />
));
AvatarImage.displayName = AvatarPrimitive.Image.displayName;

/**
 * 6 tông màu nền cho avatar chữ cái. Trước đây MỌI avatar đều `bg-muted` xám như nhau nên trong
 * danh sách phụ trách/bình luận không phân biệt được ai với ai nếu chữ đầu trùng nhau.
 * Chọn theo hash của `children` ⇒ cùng một người luôn ra cùng một màu ở mọi màn hình.
 * Dùng color-mix trên token nên tự hợp brand + tự đảo sáng/tối.
 */
const AVATAR_TINTS = ["--primary", "--info", "--success", "--warning", "--destructive", "--subtle"] as const;

function tintOf(seed: React.ReactNode): string | undefined {
  const text = typeof seed === "string" || typeof seed === "number" ? String(seed) : "";
  if (!text) return undefined;
  let hash = 0;
  for (let i = 0; i < text.length; i++) hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  return AVATAR_TINTS[hash % AVATAR_TINTS.length];
}

export const AvatarFallback = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Fallback>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Fallback>
>(({ className, style, children, ...props }, ref) => {
  const tint = tintOf(children);
  return (
    <AvatarPrimitive.Fallback
      ref={ref}
      className={cn("flex h-full w-full items-center justify-center rounded-full bg-muted text-xs font-semibold uppercase", className)}
      style={tint ? {
        backgroundColor: `color-mix(in srgb, var(${tint}) 16%, var(--card))`,
        color: `color-mix(in srgb, var(${tint}) 78%, var(--foreground))`,
        ...style,
      } : style}
      {...props}
    >
      {children}
    </AvatarPrimitive.Fallback>
  );
});
AvatarFallback.displayName = AvatarPrimitive.Fallback.displayName;
