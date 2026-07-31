import React from "react";
import { createRoot } from "react-dom/client";
import { ControlRegistry } from "@metaforge/controls";
import { I18nProvider, Toaster } from "@metaforge/ui";
import { MetaForgeProvider } from "../../../packages/views/src/container/provider.js";
import {
  AllocationTimelineDialog,
  type AllocationTimeline,
} from "../../../packages/views/src/container/AllocationTimelineDialog.js";
import "@metaforge/ui/styles.css";
import "../src/styles.css";

const caps = {
  read: true, write: true, create: true, delete: true, submit: true, cancel: true,
  amend: true, print: true, email: true, share: true, assign: true, import: true, export: true,
  report: true, workflow_actions: [],
};

const columns = [
  { key: "event_at", label: "Thời điểm" },
  { key: "event", label: "Sự kiện" },
  { key: "purchase_receipt", label: "Phiếu nhập" },
  { key: "purchase_order", label: "Đơn mua" },
  { key: "qty", label: "Số lượng", align: "right" as const },
  { key: "window", label: "Cửa sổ" },
];

const windows = [
  {
    window_id: "WIN-OPEN", queue_key: "purchase:demo:Alumdoor:FACTORY-1", sequence: 1,
    status: "Open" as const, tolerance: "5%", nominal_qty: "100", received_qty: "95",
    remaining_qty: "5", minimum_qty: "95", maximum_qty: "105", shortage_variance: "5",
    overage_variance: "0", reason: null,
  },
  {
    window_id: "WIN-SETTLED", queue_key: "purchase:demo:Alumdoor:FACTORY-1", sequence: 2,
    status: "Settled" as const, tolerance: "5%", nominal_qty: "50", received_qty: "50",
    remaining_qty: "0", minimum_qty: "47.5", maximum_qty: "52.5", shortage_variance: "0",
    overage_variance: "0", reason: "Nhà máy xác nhận giao đủ",
  },
];

const reportColumns = [
  { key: "supplier" as const, label: "Nhà cung cấp" },
  { key: "company" as const, label: "Công ty" },
  { key: "item_code" as const, label: "Mã vật tư" },
  { key: "ordered_qty" as const, label: "Đã đặt", align: "right" as const },
  { key: "allocated_qty" as const, label: "Đã phân bổ", align: "right" as const },
  { key: "nominal_remaining_qty" as const, label: "Nợ danh nghĩa", align: "right" as const },
];

const timeline: AllocationTimeline = {
  kind: "purchase_allocation_timeline",
  doctype: "Purchase Receipt",
  name: "PR-QA-0001",
  title: "Phân bổ PR-QA-0001",
  description: "Browser QA trên allocation ledger giả lập.",
  columns,
  summary: [
    { label: "Đã đặt", value: "150" }, { label: "Đã nhận", value: "145" },
    { label: "Đã phân bổ", value: "145" }, { label: "Chưa phân bổ", value: "0" },
    { label: "Kg barem", value: "406.116" }, { label: "Kg thực tế", value: "402.5" },
  ],
  windows,
  rows: [{
    row_id: "ALLOC-1", event_at: "2026-07-31T08:00:00.000Z", event: "Phân bổ FIFO",
    purchase_receipt: "PR-QA-0001", purchase_order: "PO-QA-0001", purchase_order_row: "PO-ROW-1",
    receipt_row: "PR-ROW-1", qty: "95", barem_weight_kg: "266.076", actual_weight_kg: "264.1",
    window: "#1 · Đang mở", actor: "Administrator", reason: null,
  }],
  supplier_debt_reports: [{
    kind: "purchase_supplier_debt_report",
    title: "Công nợ giao hàng nhà cung cấp",
    description: "QA snapshot",
    generated_at: "2026-07-31T08:00:00.000Z",
    csv_filename: "purchase-supplier-debt.csv",
    filters: {},
    columns: reportColumns,
    rows: [{
      queue_key: "purchase:demo:Alumdoor:FACTORY-1", window_id: "WIN-OPEN", window_sequence: 1,
      window_status: "Open", company: "Alumdoor", supplier: "FACTORY-1", item_code: "AL71",
      material: "Nhôm AL71 GS", ordered_qty: "100", received_qty: "95", allocated_qty: "95",
      nominal_remaining_qty: "5", unapplied_receipt_qty: "0", tolerance: "5%",
      oldest_open_po_date: "2026-07-01", oldest_open_po_age_days: 30,
      barem_weight_kg: "280.08", actual_weight_kg: "277.5",
    }],
    summary: [],
  }],
};

let submissions: Array<Record<string, unknown>> = [];
const adapter = {
  getCapabilities: async () => caps,
  createDoc: async (doctype: string, document: Record<string, unknown>) => {
    submissions.push({ doctype, ...document });
    return { doctype, name: `${doctype}-QA`, docstatus: 0, modified: "2026-07-31T08:00:00.000Z", ...document };
  },
  submit: async (doc: Record<string, unknown>) => ({ ...doc, docstatus: 1 }),
  callGet: async () => timeline,
  mapError: (error: unknown) => ({ message: error instanceof Error ? error.message : String(error) }),
} as never;

function App() {
  React.useEffect(() => {
    const expose = () => document.body.setAttribute("data-submissions", JSON.stringify(submissions));
    const timer = window.setInterval(expose, 20);
    return () => window.clearInterval(timer);
  }, []);
  return (
    <I18nProvider initial="vi">
      <MetaForgeProvider
        adapter={adapter}
        registry={new ControlRegistry()}
        roles={["System Manager", "Stock Manager"]}
      >
        <main className="min-h-screen bg-background p-4">
          <AllocationTimelineDialog open timeline={timeline} loading={false} error={null} onClose={() => undefined} />
        </main>
        <Toaster />
      </MetaForgeProvider>
    </I18nProvider>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
