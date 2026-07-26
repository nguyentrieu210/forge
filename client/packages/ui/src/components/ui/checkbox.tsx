import * as React from "react";
import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import { Check, Minus } from "lucide-react";
import { cn } from "../../lib/cn.js";
import { focusRing } from "./control-styles.js";

export const Checkbox = React.forwardRef<
  React.ElementRef<typeof CheckboxPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>
>(({ className, ...props }, ref) => (
  <CheckboxPrimitive.Root
    ref={ref}
    className={cn(
      focusRing,
      // `border-input` thay cho `border-primary/50`: ở brand zinc primary là gần-đen nên ô chưa
      // tick có viền đen 50% rất nặng, không ăn nhập với viền các ô nhập bên cạnh. Bỏ `shadow`
      // (ô 16px không cần đổ bóng) và thêm trạng thái indeterminate.
      "peer size-4 shrink-0 rounded-sm border border-input transition-colors disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=checked]:border-primary data-[state=checked]:text-primary-foreground data-[state=indeterminate]:bg-primary data-[state=indeterminate]:border-primary data-[state=indeterminate]:text-primary-foreground",
      className,
    )}
    {...props}
  >
    <CheckboxPrimitive.Indicator className="flex items-center justify-center text-current">
      {props.checked === "indeterminate" ? <Minus className="size-3.5" /> : <Check className="size-3.5" />}
    </CheckboxPrimitive.Indicator>
  </CheckboxPrimitive.Root>
));
Checkbox.displayName = CheckboxPrimitive.Root.displayName;
