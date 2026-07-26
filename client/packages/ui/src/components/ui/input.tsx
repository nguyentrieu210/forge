import * as React from "react";
import { cn } from "../../lib/cn.js";
import { controlBase, focusRing } from "./control-styles.js";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type}
      ref={ref}
      className={cn(
        controlBase,
        focusRing,
        "flex w-full px-[11px] py-1 file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";
