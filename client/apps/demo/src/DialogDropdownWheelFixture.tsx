import { useState } from "react";
import { LinkCombobox } from "@metaforge/controls";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  I18nProvider,
} from "@metaforge/ui";

const OPTIONS = Array.from({ length: 40 }, (_, index) => ({
  value: `ITEM-${String(index + 1).padStart(3, "0")}`,
  description: `Mặt hàng kiểm thử ${index + 1}`,
}));

/**
 * Fixture hẹp cho browser regression: Link dropdown portalled từ bên trong Radix Dialog.
 * Đây chính là tổ hợp làm wheel bị scroll-lock chặn trong bảng child mở rộng production.
 */
export function DialogDropdownWheelFixture() {
  const [value, setValue] = useState("");

  return (
    <I18nProvider>
      <div className="min-h-screen bg-background p-8 text-foreground">
        <Dialog open>
          <DialogContent className="h-[78vh] w-[min(92vw,900px)] max-w-none overflow-hidden">
            <DialogHeader>
              <DialogTitle>Kiểm thử cuộn dropdown trong hộp thoại</DialogTitle>
              <DialogDescription>
                Fixture tự động cho wheel của Link dropdown trong child-grid dialog.
              </DialogDescription>
            </DialogHeader>
            <div className="grid min-h-0 flex-1 content-start gap-2 overflow-auto rounded-md border p-6">
              <label className="text-sm font-medium" htmlFor="dialog-wheel-item">Mã hàng</label>
              <div className="w-80">
                <LinkCombobox
                  id="dialog-wheel-item"
                  value={value}
                  target="Item"
                  label="Mã hàng"
                  search={async () => OPTIONS}
                  onChange={setValue}
                />
              </div>
              <div className="h-[900px]" aria-hidden="true" />
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </I18nProvider>
  );
}
