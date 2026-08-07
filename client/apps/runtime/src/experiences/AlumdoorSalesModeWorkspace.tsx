import { useEffect, useState } from "react";
import { Mail, Phone, Printer, Settings, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { Doc } from "@metaforge/core";
import { useMetaForge } from "@metaforge/views/provider";
import { Button } from "@metaforge/ui";
import { AlumdoorSalesSheetV3 } from "./AlumdoorSalesSheetV3.js";
import { ALUMDOOR_SALES_CUSTOMER_EVENT } from "./AlumdoorSalesPolicyBridge.js";

type ColumnPreset = "normal" | "ray" | "shaft" | "door" | "mesh" | "all";

type CustomerPanelState = {
  name: string;
  displayName: string;
  group: string;
  phone: string;
  email: string;
  rank: string;
  priceList: string;
  creditLimit: number | null;
  outstanding: number | null;
  orderCount: number | null;
  salesTotal: number | null;
  partial: boolean;
};

const money = (value: number | null) => value == null
  ? "—"
  : `${value.toLocaleString("vi-VN", { maximumFractionDigits: 0 })} VND`;

function creditLimitFromCustomer(doc: Doc, company: string): number | null {
  const rows = Array.isArray(doc.credit_limits) ? doc.credit_limits as Array<Record<string, unknown>> : [];
  const candidates = company
    ? rows.filter((row) => String(row.company ?? "").trim() === company)
    : rows;
  const values = candidates
    .map((row) => Number(row.credit_limit))
    .filter((value) => Number.isFinite(value) && value >= 0);
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0);
}

/**
 * Alumdoor sales is a true operational Experience over canonical Sales Order authority.
 * It deliberately occupies the whole viewport: operators spend their time in the sheet,
 * so sidebar/top-shell chrome must not consume working area or split keyboard focus.
 *
 * IMPORTANT: this surface stays BELOW shared portal controls (Popover/Dialog/Select use z-50).
 * Raising the fullscreen host above those portals makes Link dropdowns open behind the sheet,
 * which looks exactly like a dead picker even though the search request succeeded.
 */
export function AlumdoorSalesModeWorkspace() {
  const navigate = useNavigate();
  const { adapter, businessContext } = useMetaForge();
  const company = String(businessContext.company ?? "").trim();
  const [columnPreset, setColumnPreset] = useState<ColumnPreset>("normal");
  const [customerPanel, setCustomerPanel] = useState<CustomerPanelState | null>(null);
  const [panelVisible, setPanelVisible] = useState(true);
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

  useEffect(() => {
    const root = document.querySelector<HTMLElement>("[data-sales-sheet-host] > div");
    if (!root) return;
    const onScroll = () => setPanelVisible(root.scrollTop < 120);
    onScroll();
    root.addEventListener("scroll", onScroll, { passive: true });
    return () => root.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    let generation = 0;
    const loadPaged = async (doctype: string, fields: string[], filters: unknown[]) => {
      const rows: Doc[] = [];
      const pageLength = 200;
      for (let start = 0; start < 5_000; start += pageLength) {
        const page = await adapter.getList(doctype, {
          fields,
          filters: filters as never,
          limitStart: start,
          pageLength,
        });
        rows.push(...page);
        if (page.length < pageLength) break;
      }
      return rows;
    };

    const onCustomer = (event: Event) => {
      const detail = (event as CustomEvent<{ name?: string; doc?: Doc }>).detail;
      const name = String(detail?.name ?? detail?.doc?.name ?? "").trim();
      const doc = detail?.doc;
      if (!name || !doc) return;
      const current = ++generation;
      const base: CustomerPanelState = {
        name,
        displayName: String(doc.customer_name ?? doc.name ?? name),
        group: String(doc.customer_group ?? ""),
        phone: String(doc.mobile_no ?? doc.phone ?? ""),
        email: String(doc.email_id ?? ""),
        rank: String(doc.loyalty_program_tier ?? doc.customer_group ?? ""),
        priceList: String(doc.default_price_list ?? doc.selling_price_list ?? doc.price_list ?? ""),
        creditLimit: creditLimitFromCustomer(doc, company),
        outstanding: null,
        orderCount: null,
        salesTotal: null,
        partial: false,
      };
      setCustomerPanel(base);
      setPanelVisible(true);

      const common = [["customer", "=", name], ...(company ? [["company", "=", company]] : [])];
      void Promise.allSettled([
        loadPaged("Sales Invoice", ["name", "outstanding_amount"], [...common, ["docstatus", "=", 1]]),
        loadPaged("Sales Order", ["name", "grand_total"], [...common, ["docstatus", "!=", 2]]),
      ]).then(([invoiceResult, orderResult]) => {
        if (current !== generation) return;
        const invoices = invoiceResult.status === "fulfilled" ? invoiceResult.value : null;
        const orders = orderResult.status === "fulfilled" ? orderResult.value : null;
        setCustomerPanel((old) => old?.name === name ? {
          ...old,
          outstanding: invoices
            ? invoices.reduce((sum, row) => sum + (Number(row.outstanding_amount) || 0), 0)
            : null,
          orderCount: orders?.length ?? null,
          salesTotal: orders
            ? orders.reduce((sum, row) => sum + (Number(row.grand_total) || 0), 0)
            : null,
          partial: !invoices || !orders,
        } : old);
      });
    };

    window.addEventListener(ALUMDOOR_SALES_CUSTOMER_EVENT, onCustomer);
    return () => {
      generation += 1;
      window.removeEventListener(ALUMDOOR_SALES_CUSTOMER_EVENT, onCustomer);
    };
  }, [adapter, company]);

  return (
    <div
      className="fixed inset-0 z-40 flex min-h-0 flex-col overflow-hidden bg-white text-slate-900"
      data-alumdoor-sales-focus="true"
      data-column-preset={columnPreset}
    >
      <style>{`
        @media (min-width: 1280px) {
          [data-sales-sheet-host] > div > div > section:first-child { margin-right: 22rem; min-height: 11.5rem; }
        }
        [data-column-preset="normal"] table thead th:nth-child(4),
        [data-column-preset="normal"] table thead th:nth-child(5),
        [data-column-preset="normal"] table thead th:nth-child(6),
        [data-column-preset="normal"] table thead th:nth-child(7),
        [data-column-preset="normal"] table tbody tr:not([class*="bg-orange-50"]) td:nth-child(4),
        [data-column-preset="normal"] table tbody tr:not([class*="bg-orange-50"]) td:nth-child(5),
        [data-column-preset="normal"] table tbody tr:not([class*="bg-orange-50"]) td:nth-child(6),
        [data-column-preset="normal"] table tbody tr:not([class*="bg-orange-50"]) td:nth-child(7),
        [data-column-preset="normal"] table tbody tr[class*="bg-orange-50"] td:nth-child(3),
        [data-column-preset="normal"] table tbody tr[class*="bg-orange-50"] td:nth-child(4),
        [data-column-preset="normal"] table tbody tr[class*="bg-orange-50"] td:nth-child(5),
        [data-column-preset="normal"] table tbody tr[class*="bg-orange-50"] td:nth-child(6),
        [data-column-preset="ray"] table thead th:nth-child(6),
        [data-column-preset="ray"] table thead th:nth-child(7),
        [data-column-preset="ray"] table tbody tr:not([class*="bg-orange-50"]) td:nth-child(6),
        [data-column-preset="ray"] table tbody tr:not([class*="bg-orange-50"]) td:nth-child(7),
        [data-column-preset="ray"] table tbody tr[class*="bg-orange-50"] td:nth-child(5),
        [data-column-preset="ray"] table tbody tr[class*="bg-orange-50"] td:nth-child(6),
        [data-column-preset="shaft"] table thead th:nth-child(5),
        [data-column-preset="shaft"] table thead th:nth-child(7),
        [data-column-preset="shaft"] table tbody tr:not([class*="bg-orange-50"]) td:nth-child(5),
        [data-column-preset="shaft"] table tbody tr:not([class*="bg-orange-50"]) td:nth-child(7),
        [data-column-preset="shaft"] table tbody tr[class*="bg-orange-50"] td:nth-child(4),
        [data-column-preset="shaft"] table tbody tr[class*="bg-orange-50"] td:nth-child(6) { display: none; }
      `}</style>

      <header className="flex h-14 shrink-0 items-center gap-4 bg-gradient-to-r from-orange-600 via-orange-500 to-amber-500 px-4 text-white shadow-sm">
        <div className="text-lg font-extrabold tracking-tight">ALUMDOOR</div>
        <div className="h-6 w-px bg-white/30" />
        <div className="text-xl font-bold">BÁN HÀNG</div>
        <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-semibold">Tạo đơn mới</span>
        <div className="ml-auto flex items-center gap-1">
          <label className="mr-2 flex items-center gap-2 text-xs font-semibold">
            Bộ quy tắc cột
            <select
              className="h-8 rounded-md border border-white/30 bg-white/15 px-2 text-xs text-white outline-none [&>option]:text-slate-900"
              value={columnPreset}
              onChange={(event) => setColumnPreset(event.target.value as ColumnPreset)}
            >
              <option value="normal">Hàng thường (mặc định)</option>
              <option value="ray">Ray</option>
              <option value="shaft">Trục</option>
              <option value="door">Cửa Đức / cửa m²</option>
              <option value="mesh">Cửa lưới</option>
              <option value="all">Hiện tất cả cột</option>
            </select>
          </label>
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
      <div className="relative min-h-0 flex-1 overflow-hidden" data-sales-sheet-host>
        <AlumdoorSalesSheetV3 />
        <aside className={`absolute right-3 top-3 hidden w-[21rem] rounded-lg border bg-white p-3 shadow-sm transition-opacity xl:block ${panelVisible ? "opacity-100" : "pointer-events-none opacity-0"}`} aria-label="Thông tin bổ sung khách hàng">
          <div className="mb-2 border-b pb-2 text-xs font-extrabold uppercase tracking-wide text-orange-600">Thông tin bổ sung</div>
          {customerPanel ? (
            <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
              <div><div className="text-slate-500">Công nợ hiện tại</div><div className="font-bold text-orange-600">{money(customerPanel.outstanding)}</div></div>
              <div><div className="text-slate-500">Hạn mức tín dụng</div><div className="font-semibold">{money(customerPanel.creditLimit)}</div></div>
              <div><div className="text-slate-500">Hạng khách hàng</div><div className="font-semibold">{customerPanel.rank || customerPanel.group || "—"}</div></div>
              <div><div className="text-slate-500">Điều kiện chiết khấu</div><div className="font-semibold">{customerPanel.priceList ? `Theo ${customerPanel.priceList}` : "Theo bảng giá / quy tắc"}</div></div>
              <div className="col-span-2 border-t pt-2">
                <div className="mb-1 text-slate-500">Liên hệ chính</div>
                <div className="font-semibold">{customerPanel.displayName}</div>
                {customerPanel.phone ? <div className="mt-1 flex items-center gap-1 text-blue-700"><Phone className="size-3" />{customerPanel.phone}</div> : null}
                {customerPanel.email ? <div className="mt-1 flex items-center gap-1 text-blue-700"><Mail className="size-3" />{customerPanel.email}</div> : null}
              </div>
              <div className="col-span-2 border-t pt-2">
                <div className="text-slate-500">Lịch sử mua hàng</div>
                <div className="font-semibold">{customerPanel.orderCount == null ? "—" : `${customerPanel.orderCount.toLocaleString("vi-VN")} đơn`} · {money(customerPanel.salesTotal)}</div>
                {customerPanel.partial ? <div className="mt-1 text-[10px] text-amber-700">Một số số liệu không đọc được theo quyền hiện tại.</div> : null}
              </div>
            </div>
          ) : (
            <div className="py-6 text-center text-xs text-slate-500">Chọn khách hàng để xem công nợ, hạn mức và lịch sử mua.</div>
          )}
        </aside>
      </div>
    </div>
  );
}
