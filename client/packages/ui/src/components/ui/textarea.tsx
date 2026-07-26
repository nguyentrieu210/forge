import * as React from "react";
import { cn } from "../../lib/cn.js";
import { controlBase, focusRing } from "./control-styles.js";

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        controlBase,
        focusRing,
        // h-auto ghi đè chiều cao 1 dòng của controlBase; `resize-y` chặn kéo NGANG (kéo ngang làm
        // vỡ lưới form), `shadow-sm` cũ bị bỏ để đồng bộ với Input/Select (trước đây chỉ 2 cái này
        // có shadow, Input thì không — nhìn như 2 hệ thiết kế khác nhau).
        "flex h-auto min-h-[60px] w-full resize-y px-3 py-2 placeholder:text-muted-foreground",
        className,
      )}
      {...props}
    />
  ),
);
Textarea.displayName = "Textarea";
