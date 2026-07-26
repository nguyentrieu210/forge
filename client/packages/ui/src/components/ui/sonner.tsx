import { Toaster as SonnerToaster, toast } from "sonner";

export function Toaster() {
  return (
    <SonnerToaster
      // bottom-right cố định che mất nút hành động ở góc phải dưới trên màn hình hẹp; sonner
      // tự dồn về giữa-dưới ở mobile khi dùng "bottom-center" nên chọn theo chiều rộng là thừa —
      // giữ bottom-right cho desktop, phần mobile do `mobileOffset` lo.
      position="bottom-right"
      // Đóng được bằng vuốt — trước đây toast lỗi dài phải chờ hết giờ mới biến mất.
      closeButton
      // sonner tự bơm CSS nền/chữ riêng của nó (theme sáng cứng) nên ở theme tối toast bị TRẮNG.
      // unstyled + classNames đảm bảo toast luôn theo token của design system.
      toastOptions={{
        classNames: {
          toast: "group flex w-full items-center gap-2 rounded-md border bg-popover px-4 py-3 text-sm text-popover-foreground shadow-lg",
          title: "font-medium",
          description: "text-muted-foreground",
          actionButton: "rounded-sm bg-primary px-2 py-1 text-xs font-medium text-primary-foreground",
          cancelButton: "rounded-sm bg-secondary px-2 py-1 text-xs text-secondary-foreground",
          closeButton: "border bg-popover text-foreground",
          // TRƯỚC: chỉ `error` có màu; success/warning/info hiện y hệt toast thường nên không phân
          // biệt được kết quả. Dùng biến *-text (đạt AA) chứ không dùng --success/--warning thô.
          error: "border-destructive/40 text-destructive-text",
          success: "border-success/40 text-success-text",
          warning: "border-warning/40 text-warning-text",
          info: "border-info/40 text-info-text",
        },
      }}
    />
  );
}

export { toast };
