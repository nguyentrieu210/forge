import { useEffect } from "react";
import { Printer, Settings, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@metaforge/ui";
import { AlumdoorSalesSheetV3 } from "./AlumdoorSalesSheetV3.js";

/**
 * Alumdoor sales is a true operational Experience over canonical Sales Order authority.
 * It deliberately occupies the whole viewport: operators spend their time in the sheet,
 * so sidebar/top-shell chrome must not consume working area or split keyboard focus.
 */
export function AlumdoorSalesModeWorkspace() {
  const navigate = useNavigate();
  const close = () => navigate(`/app/${encodeURIComponent("Sales Order")}`);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="fixed inset-0 z-[200] flex min-h-0 flex-col overflow-hidden bg-white text-slate-900" data-alumdoor-sales-focus="true">
      <header className="flex h-14 shrink-0 items-center gap-4 bg-gradient-to-r from-orange-600 via-orange-500 to-amber-500 px-4 text-white shadow-sm">
        <div className="text-lg font-extrabold tracking-tight">ALUMDOOR</div>
        <div className="h-6 w-px bg-white/30" />
        <div className="text-xl font-bold">BÁN HÀNG</div>
        <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-semibold">Tạo đơn mới</span>
        <div className="ml-auto flex items-center gap-1">
          <Button type="button" variant="ghost" size="sm" className="text-white hover:bg-white/15 hover:text-white" onClick={() => window.print()}><Printer /> In</Button>
          <Button type="button" variant="ghost" size="sm" className="text-white hover:bg-white/15 hover:text-white"><Settings /> Cài đặt</Button>
          <Button type="button" variant="ghost" size="sm" className="text-white hover:bg-white/15 hover:text-white" onClick={close}><X /> Đóng (ESC)</Button>
        </div>
      </header>
      <div className="grid h-12 shrink-0 grid-cols-3 items-center border-b bg-white px-[14%] text-sm font-semibold text-slate-600">
        <div className="text-orange-600">1&nbsp;&nbsp; Thông tin đơn hàng</div>
        <div className="text-center">2&nbsp;&nbsp; Hàng hóa &amp; Tính toán</div>
        <div className="text-right">3&nbsp;&nbsp; Xác nhận &amp; Lưu</div>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        <AlumdoorSalesSheetV3 />
      </div>
    </div>
  );
}
