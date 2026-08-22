/**
 * Màn "Báo cáo công nợ" — kiểu dữ liệu và phép biến đổi THUẦN TRÌNH BÀY.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * LUẬT CỦA THƯ MỤC NÀY (không có ngoại lệ):
 *
 *   Không một dòng nào trong `cong-no/` được cộng/trừ/chia số tiền để RA MỘT SỐ
 *   DƯ CÔNG NỢ. Mọi con số tiền hiển thị là con số server trả về, nguyên vẹn.
 *
 *   Chỗ DUY NHẤT được phép cộng là `displaySubtotal()` — tổng của ĐÚNG những
 *   dòng đang hiện trên màn, phục vụ hàng "Tổng (đang hiện)" và cột xuất CSV.
 *   Nó là một phép cộng TRÌNH BÀY, không phải sổ cái, và mọi nơi gọi nó đều
 *   phải nói ra điều đó trên giao diện.
 *
 * Lý do: `skills/forge-ui-change-routing/SKILL.md` §4.8 và §7.5 — client chỉ
 * điều phối + trình bày; tiền là thẩm quyền server. Một con số công nợ do TSX
 * tự tính là một nguồn sự thật thứ hai cho tiền, và nó sẽ trôi dạt trong im
 * lặng đúng như các "luật đang ngủ" mô tả ở
 * `docs/audits/ALUMDOOR-BAN-HANG-DANH-MUC-GAP-20260821.md` §2.
 * ────────────────────────────────────────────────────────────────────────────
 */
import { money, numberValue, text } from "../sales-order-v2/model.js";

export { money, numberValue, text };

/** Hai mặt của cùng một màn: phải thu (khách hàng) và phải trả (nhà cung cấp). */
export type DebtSide = "receivable" | "payable";

/** Cấu hình của từng mặt — nhờ nó hai tab dùng CHUNG một khuôn trình bày. */
export interface DebtSideConfig {
  side: DebtSide;
  /** Nhãn tab. */
  label: string;
  /** DocType danh mục đối tác — dùng làm `options` cho LinkControl, KHÔNG hardcode danh sách. */
  partyDoctype: "Customer" | "Supplier";
  partyLabel: string;
  /** Báo cáo nền tảng đọc thẳng Payment Ledger cho mặt này. */
  ledgerReport: string;
  /** Báo cáo tuổi nợ của nền tảng (xem `agingAvailability` — có thể chưa nối dây). */
  agingReport: string;
  /** DocType hoá đơn gốc. */
  invoiceDoctype: "Sales Invoice" | "Purchase Invoice";
  /** DocType giảm trừ. */
  creditDoctype: "Credit Note" | "Debit Note";
  /** DocType phiếu giao/nhập kèm theo. */
  movementDoctype: "Delivery Note" | "Purchase Receipt";
  /** DocType đơn hàng gốc. */
  orderDoctype: "Sales Order" | "Purchase Order";
  /** Trường trỏ đối tác trên các chứng từ của mặt này. */
  partyField: "customer" | "supplier";
  /** `Payment Entry.party_type` tương ứng. */
  paymentPartyType: "Customer" | "Supplier";
  /** `Payment Entry.payment_type` của dòng tiền đúng chiều (thu / chi). */
  paymentType: "Receive" | "Pay";
  paymentLabel: string;
}

export const RECEIVABLE: DebtSideConfig = {
  side: "receivable",
  label: "Phải thu (khách hàng)",
  partyDoctype: "Customer",
  partyLabel: "Khách hàng",
  ledgerReport: "Accounts Receivable",
  agingReport: "Accounts Receivable Aging",
  invoiceDoctype: "Sales Invoice",
  creditDoctype: "Credit Note",
  movementDoctype: "Delivery Note",
  orderDoctype: "Sales Order",
  partyField: "customer",
  paymentPartyType: "Customer",
  paymentType: "Receive",
  paymentLabel: "Phiếu thu",
};

export const PAYABLE: DebtSideConfig = {
  side: "payable",
  label: "Phải trả (nhà cung cấp)",
  partyDoctype: "Supplier",
  partyLabel: "Nhà cung cấp",
  ledgerReport: "Accounts Payable",
  agingReport: "Accounts Payable Aging",
  invoiceDoctype: "Purchase Invoice",
  creditDoctype: "Debit Note",
  movementDoctype: "Purchase Receipt",
  orderDoctype: "Purchase Order",
  partyField: "supplier",
  paymentPartyType: "Supplier",
  paymentType: "Pay",
  paymentLabel: "Phiếu chi",
};

export function sideConfig(side: DebtSide): DebtSideConfig {
  return side === "payable" ? PAYABLE : RECEIVABLE;
}

/** Bộ lọc dùng chung cho cả hai tab. */
export interface DebtFilterState {
  fromDate: string;
  toDate: string;
  party: string;
  /** Chỉ hiện đối tác còn dư nợ lớn hơn `minBalance`. */
  onlyOpen: boolean;
  minBalance: string;
}

/**
 * Một dòng đối tác trên bảng tổng hợp.
 *
 * Ba con số tiền ở đây có BA nguồn khác nhau và KHÔNG được trộn vào nhau:
 * - `totalBilled`, `outstandingByInvoice`: server gộp sẵn (báo cáo app, SQL `SUM`);
 * - `outstandingByLedger`: tổng HIỂN THỊ của đúng các dòng sổ đang hiện.
 */
export interface PartyRow {
  party: string;
  /** `count(name)` do server đếm. `null` = mặt này không có báo cáo gộp theo đối tác. */
  documentCount: number | null;
  /** `sum(grand_total)` do server cộng — tổng phát sinh theo hoá đơn. */
  totalBilled: number | null;
  /** `sum(outstanding_amount)` do server cộng — số dư theo chứng từ hoá đơn. */
  outstandingByInvoice: number | null;
  /** Tổng HIỂN THỊ của các dòng sổ Payment Ledger đang hiện cho đối tác này. */
  outstandingByLedger: number | null;
  /** Số chứng từ còn dư trong sổ Payment Ledger. */
  ledgerVoucherCount: number;
  currencies: string[];
  /**
   * `Customer.credit_limit` — chỉ gắn cho mặt PHẢI THU (K2,
   * docs/audits/ALUMDOOR-SAN-XUAT-KE-TOAN-DANH-MUC-GAP-20260821.md §K2). `undefined` = chưa nạp
   * (chưa gọi `loadCreditLimits`); `null` = đã hỏi Customer nhưng field trống (chưa từng nhập hạn
   * mức) — hai trạng thái này KHÔNG được gộp làm một, "chưa nạp" không phải "không có hạn mức".
   * `Supplier` không có field tương đương trong danh mục nên mặt PHẢI TRẢ luôn để `undefined`.
   */
  creditLimit?: number | null;
}

/** Một dòng chứng từ còn dư trong sổ Payment Ledger (báo cáo `Accounts Receivable`/`Accounts Payable`). */
export interface LedgerRow {
  party: string;
  currency: string;
  voucherType: string;
  voucherNo: string;
  outstanding: number | null;
}

/** Một dòng của báo cáo tuổi nợ nền tảng (`Accounts Receivable Aging` / `Accounts Payable Aging`). */
export interface AgingRow {
  party: string;
  company: string;
  currency: string;
  voucherType: string;
  voucherNo: string;
  postingDate: string;
  dueDate: string;
  invoiceTotal: number | null;
  allocated: number | null;
  outstanding: number | null;
  daysOverdue: number | null;
  bucket: string;
}

/**
 * Các khoảng tuổi nợ do SERVER đặt tên, chép nguyên văn từ
 * `server/packages/query/src/finance-aging.ts::agingSource` (kể cả dấu gạch ngang `–`).
 *
 * Client KHÔNG được tự phân khoảng: ngày đáo hạn, ngày chốt và quy tắc so sánh đều
 * nằm ở server. Hằng số này chỉ để XẾP THỨ TỰ cột khi server đã trả nhãn.
 */
export const AGING_BUCKETS = [
  "Chưa đến hạn",
  "1–30 ngày",
  "31–60 ngày",
  "61–90 ngày",
  "Trên 90 ngày",
] as const;

export type AgingBucket = typeof AGING_BUCKETS[number];

/** Trạng thái của khối tuổi nợ: hoặc server trả được, hoặc nói thẳng vì sao không. */
export type AgingState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; rows: AgingRow[] }
  | { status: "unavailable"; message: string };

/**
 * Một dòng tổng hợp công nợ theo party-account-currency (báo cáo nền tảng `Debt Summary`).
 *
 * Khác bảng đối tác chính (tổng theo từng đối tác, gộp mọi tài khoản/tiền tệ), dòng ở đây
 * TÁCH theo từng tài khoản-tiền tệ — vì đó đúng là đơn vị mà báo cáo `Party Statement`
 * (sao kê luỹ kế) cần để chạy. Xem `documentPath`/nút "Sao kê" trong màn.
 */
export interface DebtSummaryRow {
  party: string;
  accountType: string;
  company: string;
  account: string;
  currency: string;
  totalOutstanding: number | null;
  due: number | null;
  overdue: number | null;
  oldestDueDate: string | null;
  advance: number | null;
  netExposure: number | null;
}

/** Trạng thái của khối tổng hợp công nợ: cùng khuôn với `AgingState`. */
export type DebtSummaryState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; rows: DebtSummaryRow[] }
  | { status: "unavailable"; message: string };

/** Một dòng tạm ứng chưa phân bổ hết (báo cáo nền tảng `Advance Balance`), một dòng = một Payment Entry gốc. */
export interface AdvanceBalanceRow {
  sourcePaymentEntry: string;
  sourcePostingAt: string;
  partyType: string;
  party: string;
  company: string;
  account: string;
  currency: string;
  originalAdvance: number | null;
  allocatedAmount: number | null;
  remainingAdvance: number | null;
}

/**
 * Một dòng sổ luỹ kế của một đối tác trên đúng MỘT tài khoản-tiền tệ (báo cáo nền tảng
 * `Party Statement`). Dòng đầu tiên server trả luôn là "Opening" — số dư đầu kỳ, không phải
 * một chứng từ thật.
 */
export interface PartyStatementRow {
  postingAt: string;
  voucherType: string;
  voucherNo: string;
  entryType: string;
  debit: number | null;
  credit: number | null;
  runningBalance: number | null;
  againstVoucherType: string;
  againstVoucherNo: string;
}

/** Một dòng chứng từ gốc để đối chiếu; `doctype` + `name` là đường nhảy tới chính chứng từ đó. */
export interface SourceDocumentRow {
  doctype: string;
  name: string;
  postingAt: string;
  dueDate: string;
  /** Chứng từ nguồn (đơn hàng / hoá đơn bị giảm trừ / số chứng từ ngân hàng). */
  reference: string;
  /** Số tiền do server lưu trên chứng từ. `null` = chứng từ không mang trường tiền. */
  amount: number | null;
  /** Số còn nợ do server lưu trên chứng từ. `null` = chứng từ không có khái niệm này. */
  outstanding: number | null;
  extra: string;
  docstatus: number | null;
}

/** Một nhóm chứng từ trong bảng chi tiết đối tác. */
export interface SourceDocumentGroup {
  key: string;
  title: string;
  /** Câu giải thích nhóm này đóng vai gì trong số dư. */
  hint: string;
  amountLabel: string;
  showOutstanding: boolean;
  rows: SourceDocumentRow[];
  /** Lỗi nguyên văn của server khi nạp nhóm này (không nuốt lỗi). */
  error: string;
}

// ── Chuẩn hoá kết quả báo cáo ────────────────────────────────────────────────

/**
 * Cột báo cáo do nền tảng trả về. Chỉ đọc `fieldname`/`field` để zip dòng dạng mảng.
 */
function columnFields(columns: unknown[] | undefined): string[] {
  return (columns ?? []).map((column) => {
    if (typeof column === "string") return column.split(":")[0] ?? "";
    const record = (column ?? {}) as Record<string, unknown>;
    return text(record.fieldname ?? record.field ?? record.name);
  });
}

/**
 * Đưa `ReportResult.result` về mảng object dù server trả dict hay mảng theo cột.
 *
 * `D1ReportService`/`AppReportService` hiện trả dict, nhưng hợp đồng Frappe cho phép
 * cả hai dạng và `ReportView` của nền tảng cũng nhận cả hai. Chuẩn hoá ở một chỗ
 * để phần còn lại của màn không phải đoán.
 */
export function reportRows(result: { result?: unknown[]; columns?: unknown[] } | null | undefined): Array<Record<string, unknown>> {
  const rows = Array.isArray(result?.result) ? result!.result : [];
  const fields = columnFields(result?.columns);
  return rows.flatMap((row) => {
    if (Array.isArray(row)) {
      const mapped: Record<string, unknown> = {};
      row.forEach((value, index) => {
        const field = fields[index];
        if (field) mapped[field] = value;
      });
      return [mapped];
    }
    if (row && typeof row === "object") return [row as Record<string, unknown>];
    return [];
  });
}

// ── Phép cộng TRÌNH BÀY (chỗ duy nhất được cộng tiền) ────────────────────────

/**
 * Tổng của ĐÚNG các dòng đang hiện trên màn.
 *
 * KHÔNG phải số dư sổ cái. Nếu bộ lọc đang giấu bớt dòng, con số này nhỏ đi theo —
 * đó là hành vi đúng của một dòng "Tổng (đang hiện)", và giao diện phải ghi rõ chữ
 * "đang hiện" ở mọi nơi in nó ra. Trả `null` khi không có dòng nào mang số, để
 * không dựng một số 0 giả từ chỗ trống.
 */
export function displaySubtotal(values: Array<number | null | undefined>): number | null {
  let total = 0;
  let seen = false;
  for (const value of values) {
    if (typeof value !== "number" || !Number.isFinite(value)) continue;
    total += value;
    seen = true;
  }
  return seen ? total : null;
}

/** Đọc một số tiền từ payload server; thiếu/không phải số ⇒ `null` (không phải 0). */
export function amount(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = numberValue(value);
  return parsed === undefined ? null : parsed;
}

/** In một số tiền có thể vắng mặt. */
export function moneyOrDash(value: number | null | undefined): string {
  return value === null || value === undefined ? "—" : money(value);
}

/** In một số nguyên có thể vắng mặt. */
export function countOrDash(value: number | null | undefined): string {
  return value === null || value === undefined ? "—" : String(value);
}

/** Ngày hiển thị: cắt phần giờ của Datetime, giữ nguyên phần ngày server gửi. */
export function dateOnly(value: unknown): string {
  const raw = text(value);
  return raw ? raw.slice(0, 10) : "";
}

export function docstatusLabel(value: number | null): string {
  if (value === 1) return "Đã ghi sổ";
  if (value === 2) return "Đã huỷ";
  if (value === 0) return "Nháp";
  return "—";
}

// ── Bộ lọc phía client (CHỈ lọc, không tính lại tiền) ────────────────────────

/**
 * Áp "chỉ hiện còn nợ" lên bảng đối tác.
 *
 * Đây là phép LỌC trên con số server đã trả, không phải phép tính. Ngưỡng lấy từ
 * ô người dùng gõ; để trống ⇒ ngưỡng 0.
 *
 * ƯU TIÊN SỔ PAYMENT LEDGER, KHÔNG ưu tiên `outstandingByInvoice`.
 * `outstandingByInvoice` là `sum(outstanding_amount)` do báo cáo app gộp trên
 * bảng `documents`, và nó sai theo HAI đường cùng lúc:
 *   1. `compileAppReport` chỉ loại chứng từ đã huỷ (`docstatus<>2`) nên hoá đơn
 *      NHÁP cũng được cộng vào;
 *   2. giá trị đọc ra là bản đông cứng trong `payload_json`, không phải số dư
 *      hiện tại (xem `data.ts::loadInvoices`).
 * Đo thật ngày 21/08/2026 với khách "CỬA CUỐN MINH ĐỨC": báo cáo app nói
 * 85.440.000, sổ Payment Ledger nói 2.000.000. Lọc "chỉ hiện còn nợ" theo con số
 * thứ nhất là giữ lại những đối tác đã trả hết chỉ vì họ còn hoá đơn nháp.
 */
export function applyOpenOnly(rows: PartyRow[], state: DebtFilterState): PartyRow[] {
  if (!state.onlyOpen) return rows;
  const threshold = numberValue(state.minBalance) ?? 0;
  return rows.filter((row) => {
    const balance = row.outstandingByLedger ?? row.outstandingByInvoice;
    return typeof balance === "number" && balance > threshold;
  });
}

/**
 * Số dư theo hoá đơn và số dư theo sổ Payment Ledger có LỆCH nhau không.
 *
 * Trả về boolean, KHÔNG trả về hiệu số: một hiệu số in ra màn hình sẽ lập tức bị
 * đọc như "số tiền chênh lệch" và trở thành con số thứ ba không ai chịu trách
 * nhiệm. Ở đây chỉ cần biết "hai nguồn server có đang nói khác nhau không" để
 * bật cảnh báo và mời người dùng mở chi tiết ra soát.
 */
export function partySourcesDisagree(row: PartyRow): boolean {
  if (typeof row.outstandingByInvoice !== "number") return false;
  if (typeof row.outstandingByLedger !== "number") return false;
  return Math.abs(row.outstandingByInvoice - row.outstandingByLedger) > 0.5;
}

// ── Kết xuất CSV ─────────────────────────────────────────────────────────────

function csvCell(value: unknown): string {
  const raw = value === null || value === undefined ? "" : String(value);
  return /[",\r\n;]/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw;
}

/** Dựng CSV từ đúng dữ liệu đang hiện. */
export function toCsv(headers: string[], rows: Array<Array<unknown>>): string {
  const lines = [headers.map(csvCell).join(","), ...rows.map((row) => row.map(csvCell).join(","))];
  // BOM để Excel bản tiếng Việt đọc đúng dấu; không có nó thì mọi nhãn thành ký tự lạ.
  return `﻿${lines.join("\r\n")}\r\n`;
}

/** Tải CSV về máy. Không có `document` (SSR/test) thì im lặng bỏ qua. */
export function downloadCsv(filename: string, csv: string): void {
  if (typeof document === "undefined" || typeof URL === "undefined") return;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

/** Ngày hôm nay theo múi giờ máy, dạng `YYYY-MM-DD`. */
export function todayIso(): string {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** Ngày đầu năm hiện tại — mốc mặc định của kỳ báo cáo. */
export function startOfYearIso(): string {
  return `${new Date().getFullYear()}-01-01`;
}

/** Đường đi tới một chứng từ trong runtime (`/app/:doctype/:name`). */
export function documentPath(doctype: string, name: string): string {
  return `/app/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`;
}
