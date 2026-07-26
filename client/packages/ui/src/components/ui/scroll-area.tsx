import * as React from "react";
import * as ScrollAreaPrimitive from "@radix-ui/react-scroll-area";
import { cn } from "../../lib/cn.js";

export const ScrollArea = React.forwardRef<
  React.ElementRef<typeof ScrollAreaPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.Root>
>(({ className, children, ...props }, ref) => (
  <ScrollAreaPrimitive.Root ref={ref} className={cn("relative overflow-hidden", className)} {...props}>
    <ScrollAreaPrimitive.Viewport className="h-full w-full rounded-[inherit]">{children}</ScrollAreaPrimitive.Viewport>
    <ScrollAreaPrimitive.Scrollbar
      orientation="vertical"
      className="flex w-2.5 touch-none select-none p-0.5 transition-colors"
    >
      <ScrollAreaPrimitive.Thumb className="relative flex-1 rounded-full bg-border transition-colors hover:bg-muted-foreground/50" />
    </ScrollAreaPrimitive.Scrollbar>
    {/* Thanh cuộn NGANG trước đây không được khai báo ⇒ nội dung rộng hơn khung (bảng nhiều cột,
        biểu đồ) không có cách nào kéo ngang bằng chuột. */}
    <ScrollAreaPrimitive.Scrollbar
      orientation="horizontal"
      className="flex h-2.5 flex-col touch-none select-none p-0.5 transition-colors"
    >
      <ScrollAreaPrimitive.Thumb className="relative flex-1 rounded-full bg-border transition-colors hover:bg-muted-foreground/50" />
    </ScrollAreaPrimitive.Scrollbar>
    <ScrollAreaPrimitive.Corner />
  </ScrollAreaPrimitive.Root>
));
ScrollArea.displayName = ScrollAreaPrimitive.Root.displayName;
