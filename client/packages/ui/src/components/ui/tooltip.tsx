import * as React from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { cn } from "../../lib/cn.js";

export function TooltipProvider({ delayDuration = 250, ...props }: React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Provider>) {
  // Mặc định của Radix là 700ms — chậm tới mức người dùng tưởng nút không có tooltip.
  return <TooltipPrimitive.Provider delayDuration={delayDuration} {...props} />;
}
export const Tooltip = TooltipPrimitive.Root;
export const TooltipTrigger = TooltipPrimitive.Trigger;

export const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 4, ...props }, ref) => (
  <TooltipPrimitive.Portal>
    <TooltipPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        // max-w: tooltip dài trước đây kéo dài gần hết bề ngang màn hình thành một dải chữ 1 dòng.
        // balance: chia dòng cân đối thay vì để dòng cuối trơ trọi 1 từ.
        "z-50 max-w-xs overflow-hidden text-balance rounded-md bg-primary px-2.5 py-1 text-xs text-primary-foreground shadow-md",
        "data-[state=delayed-open]:animate-in data-[state=delayed-open]:fade-in-0 data-[state=delayed-open]:zoom-in-95",
        "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95",
        className,
      )}
      {...props}
    />
  </TooltipPrimitive.Portal>
));
TooltipContent.displayName = TooltipPrimitive.Content.displayName;
