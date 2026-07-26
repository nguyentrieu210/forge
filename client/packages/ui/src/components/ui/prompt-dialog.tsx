import { useEffect, useState, type FormEvent } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "./dialog.js";
import { Button } from "./button.js";
import { Input } from "./input.js";
import { Label } from "./label.js";

export interface PromptDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  label?: string;
  defaultValue?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: (value: string) => void;
}

/** Hộp thoại xin 1 giá trị text (vd đổi tên) — cùng bộ với ConfirmDialog, thay window.prompt() thô. */
export function PromptDialog({ open, onOpenChange, title, description, label, defaultValue = "", confirmLabel = "Đồng ý", cancelLabel = "Huỷ", onConfirm }: PromptDialogProps) {
  const [value, setValue] = useState(defaultValue);
  useEffect(() => { if (open) setValue(defaultValue); }, [open, defaultValue]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) return;
    onOpenChange(false);
    onConfirm(trimmed);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm" hideClose>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          {label ? <Label htmlFor="mf-prompt-input">{label}</Label> : null}
          <Input id="mf-prompt-input" autoFocus value={value} onChange={(e) => setValue(e.target.value)} />
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{cancelLabel}</Button>
            <Button type="submit" disabled={!value.trim()}>{confirmLabel}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
