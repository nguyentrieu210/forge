import * as React from "react";
import * as SheetPrimitive from "@radix-ui/react-dialog";
import { cva, type VariantProps } from "class-variance-authority";
import { X } from "lucide-react";
import { cn } from "../../lib/cn.js";
import { focusRing } from "./control-styles.js";
import { useT } from "../../i18n/index.js";

export const Sheet = SheetPrimitive.Root;
export const SheetTrigger = SheetPrimitive.Trigger;
export const SheetClose = SheetPrimitive.Close;

const sheetVariants = cva(
  // TRƯỚC: chỉ có `animate-in`/`animate-out` mà không kèm utility slide nào ⇒ panel BẬT RA tức thì,
  // không hề trượt. Mỗi hướng phải khai báo đúng cặp slide vào/ra của nó.
  "fixed z-50 gap-4 bg-popover text-popover-foreground p-4 shadow-lg data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:duration-200 data-[state=closed]:duration-150",
  {
    variants: {
      side: {
        top: "inset-x-0 top-0 border-b data-[state=open]:slide-in-from-top data-[state=closed]:slide-out-to-top",
        bottom: "inset-x-0 bottom-0 border-t data-[state=open]:slide-in-from-bottom data-[state=closed]:slide-out-to-bottom",
        left: "inset-y-0 left-0 h-full w-3/4 border-r sm:max-w-sm data-[state=open]:slide-in-from-left data-[state=closed]:slide-out-to-left",
        right: "inset-y-0 right-0 h-full w-3/4 border-l sm:max-w-md data-[state=open]:slide-in-from-right data-[state=closed]:slide-out-to-right",
      },
    },
    defaultVariants: { side: "right" },
  },
);

export const SheetContent = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Content> & VariantProps<typeof sheetVariants>
>(({ side = "right", className, children, ...props }, ref) => {
  const t = useT();
  return (
    <SheetPrimitive.Portal>
      <SheetPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0" />
      <SheetPrimitive.Content ref={ref} className={cn(sheetVariants({ side }), className)} {...props}>
        {children}
        {/* TRƯỚC: `focus:outline-none` mà không vẽ ring thay thế ⇒ người dùng bàn phím không thấy
            nút Đóng đang được focus. */}
        <SheetPrimitive.Close className={cn("absolute right-4 top-4 -m-1 rounded-sm p-1 opacity-70 transition-opacity hover:opacity-100", focusRing)}>
          <X className="size-4" />
          <span className="sr-only">{t("common.close")}</span>
        </SheetPrimitive.Close>
      </SheetPrimitive.Content>
    </SheetPrimitive.Portal>
  );
});
SheetContent.displayName = SheetPrimitive.Content.displayName;

export function SheetHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col space-y-1.5 text-left", className)} {...props} />;
}
export const SheetTitle = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Title>
>(({ className, ...props }, ref) => <SheetPrimitive.Title ref={ref} className={cn("text-base font-semibold", className)} {...props} />);
SheetTitle.displayName = SheetPrimitive.Title.displayName;
