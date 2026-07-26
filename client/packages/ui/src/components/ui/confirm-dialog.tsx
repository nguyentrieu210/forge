import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "./dialog.js";
import { Button } from "./button.js";

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
}

/** Hộp thoại xác nhận dùng chung — thay window.confirm() (thô, không theo theme, không chặn được
 * spam mở lại). Chỉ nên hiển thị khi caller đã tự biết cần hỏi (vd form đang dirty). */
export function ConfirmDialog({ open, onOpenChange, title, description, confirmLabel = "Đồng ý", cancelLabel = "Huỷ", destructive, onConfirm }: ConfirmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm" hideClose>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{cancelLabel}</Button>
          <Button type="button" variant={destructive ? "destructive" : "default"} onClick={() => { onOpenChange(false); onConfirm(); }}>{confirmLabel}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
