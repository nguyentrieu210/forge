/**
 * Màn "Báo cáo công nợ" — TẦNG GỌI SERVER.
 *
 * Mỗi hàm ở đây là một lời hỏi tới một thẩm quyền ĐÃ CÓ SẴN của nền tảng hoặc
 * của worker Alumdoor. Không hàm nào tự dựng số dư: chúng chỉ chuyển hình dạng
 * payload server trả về sang kiểu của `model.ts`.
 *
 * Bản đồ nguồn (đọc thẳng từ code, ngày 21/08/2026):
 *
 * | Cần gì | Gọi ai | Ở đâu |
 * |---|---|---|
 * | Tổng phát sinh + số dư theo TỪNG KHÁCH | báo cáo app `Công nợ theo khách hàng` | `server/briefs/alumdoor-v2.json` → `reports[]` |
 * | Số dư theo TỪNG CHỨNG TỪ (sổ Payment Ledger) | báo cáo nền tảng `Accounts Receivable` / `Accounts Payable` | `server/packages/query/src/index.ts` → `DEFINITIONS` |
 * | Tuổi nợ chia khoảng | báo cáo nền tảng `Accounts Receivable Aging` / `Accounts Payable Aging` | `server/packages/query/src/finance-aging.ts` — CHƯA nối dây, xem `loadAging` |
 * | Giao hàng + đối trừ + công nợ phải trả của 1 NCC | `alumdoor.purchase.supplier_delivery_dashboard` | `server/apps-src/alumdoor-worker/src/purchase-supplier-dashboard.ts` |
 * | Chốt / đảo một kỳ giao hàng | `alumdoor.purchase.supplier_delivery_settlement` | `server/apps-src/alumdoor-worker/src/purchase-supplier-settlement.ts` |
 * | Chứng từ gốc để đối chiếu | `getList` trên đúng DocType | danh mục nền tảng |
 */
import {
  amount,
  dateOnly,
  reportRows,
  text,
  type AgingRow,
  type DebtSideConfig,
  type LedgerRow,
  type PartyRow,
  type SourceDocumentRow,
} from "./model.js";

/**
 * Bề mặt server màn này cần — khai bằng CẤU TRÚC, không import `FrappeAdapter`.
 *
 * `@metaforge/vertical-alumdoor` cố ý KHÔNG phụ thuộc `@metaforge/adapter-frappe`
 * (xem `package.json`: chỉ có core/ui/controls/views). Khai structural giữ nguyên
 * ranh giới đó mà vẫn nhận thẳng `adapter` từ `useMetaForge()`.
 */
export interface DebtServer {
  runReport(
    name: string,
    filters?: unknown,
    options?: { ignorePreparedReport?: boolean },
  ): Promise<{ result?: unknown[]; columns?: unknown[] }>;
  getList(
    doctype: string,
    options?: {
      fields?: string[];
      filters?: unknown;
      orderBy?: string;
      pageLength?: number;
      limitStart?: number;
    },
  ): Promise<Array<Record<string, unknown>>>;
  callPost<T = unknown>(method: string, args?: Record<string, unknown>): Promise<T>;
}

/** Tên báo cáo app khai trong brief cho phần phải thu. Trùng chính xác `reports[].name`. */
export const RECEIVABLE_PARTY_REPORT = "Công nợ theo khách hàng";

/** Một điều kiện lọc báo cáo, đúng hình dạng `parseFilters` của nền tảng mong đợi. */
interface ReportFilter {
  field: string;
  operator: "=" | "!=" | ">" | ">=" | "<" | "<=" | "in" | "like" | "is_null";
  value?: unknown;
}

/**
 * Ngày kế tiếp của `iso`, để chặn trên kỳ bằng `<` thay vì `<=`.
 *
 * `posting_at` là Datetime. So `<= "2026-08-21"` sẽ ĐÁNH RƠI trọn ngày 21 vì
 * "2026-08-21T09:00:00Z" lớn hơn "2026-08-21" khi so chuỗi. Dùng `< "2026-08-22"`
 * thì đúng với mọi định dạng ISO mà server đang lưu.
 */
function nextDayIso(iso: string): string {
  const parsed = Date.parse(`${iso}T00:00:00.000Z`);
  if (!Number.isFinite(parsed)) return iso;
  return new Date(parsed + 86_400_000).toISOString().slice(0, 10);
}

/** Điều kiện kỳ cho một trường Datetime. */
function periodFilters(field: string, fromDate: string, toDate: string): ReportFilter[] {
  const filters: ReportFilter[] = [];
  if (fromDate) filters.push({ field, operator: ">=", value: fromDate });
  if (toDate) filters.push({ field, operator: "<", value: nextDayIso(toDate) });
  return filters;
}

/** Cùng điều kiện kỳ, nhưng theo dạng tuple mà `getList` nhận. */
function periodListFilters(field: string, fromDate: string, toDate: string): Array<[string, string, unknown]> {
  const filters: Array<[string, string, unknown]> = [];
  if (fromDate) filters.push([field, ">=", fromDate]);
  if (toDate) filters.push([field, "<", nextDayIso(toDate)]);
  return filters;
}

/**
 * Bảng đối tác PHẢI THU — server gộp sẵn theo khách hàng.
 *
 * Trả về đúng bốn cột báo cáo khai trong brief; khoá của dòng là tên field đã
 * khai (`count(name)` ⇒ khoá `name`), theo `compileAppReport` — aggregate không
 * đổi danh tính cột.
 *
 * CẢNH BÁO HỢP ĐỒNG: `compileAppReport` chỉ loại chứng từ đã huỷ (`docstatus<>2`),
 * nên báo cáo này CÓ tính cả hoá đơn NHÁP. Màn phải nói ra điều đó.
 */
export async function loadReceivableParties(
  server: DebtServer,
  input: { party: string; fromDate: string; toDate: string },
): Promise<PartyRow[]> {
  const filters: ReportFilter[] = [
    ...(input.party ? [{ field: "customer", operator: "=" as const, value: input.party }] : []),
    ...periodFilters("posting_at", input.fromDate, input.toDate),
  ];
  const result = await server.runReport(RECEIVABLE_PARTY_REPORT, filters);
  return reportRows(result)
    .map((row) => ({
      party: text(row.customer),
      documentCount: amount(row.name),
      totalBilled: amount(row.grand_total),
      outstandingByInvoice: amount(row.outstanding_amount),
      outstandingByLedger: null,
      ledgerVoucherCount: 0,
      currencies: [],
    }))
    .filter((row) => row.party);
}

/**
 * Sổ Payment Ledger còn dư, MỘT DÒNG MỘT CHỨNG TỪ.
 *
 * Đây là bảng "giải trình": mỗi số dư chỉ ra được nó đến từ chứng từ nào.
 * Báo cáo này KHÔNG nhận lọc theo ngày (`allowedFilters` chỉ có
 * party/currency/against_voucher_type/against_voucher_no/outstanding_amount),
 * nên nó luôn là số dư LŨY KẾ tới hiện tại — màn phải ghi rõ chỗ này.
 */
export async function loadLedgerRows(
  server: DebtServer,
  config: DebtSideConfig,
  party: string,
): Promise<LedgerRow[]> {
  const filters: ReportFilter[] = party ? [{ field: "party", operator: "=", value: party }] : [];
  const result = await server.runReport(config.ledgerReport, filters);
  return reportRows(result)
    .map((row) => ({
      party: text(row.party),
      currency: text(row.currency),
      voucherType: text(row.against_voucher_type),
      voucherNo: text(row.against_voucher_no),
      outstanding: amount(row.outstanding_amount),
    }))
    .filter((row) => row.party || row.voucherNo);
}

/**
 * Gộp các dòng sổ thành bảng đối tác cho mặt KHÔNG có báo cáo gộp sẵn (phải trả).
 *
 * Phép cộng ở đây là TỔNG HIỂN THỊ của đúng các dòng sổ vừa nạp, không phải một
 * số dư do client tính lại: từng dòng `outstanding` đã là con số server. Giao diện
 * gọi hàm này phải gắn nhãn "tổng hiển thị" ở đầu cột.
 */
export function groupLedgerByParty(rows: LedgerRow[]): PartyRow[] {
  const grouped = new Map<string, PartyRow>();
  for (const row of rows) {
    const key = row.party || "(không rõ đối tác)";
    const current = grouped.get(key) ?? {
      party: key,
      documentCount: null,
      totalBilled: null,
      outstandingByInvoice: null,
      outstandingByLedger: null,
      ledgerVoucherCount: 0,
      currencies: [],
    };
    if (typeof row.outstanding === "number") {
      current.outstandingByLedger = (current.outstandingByLedger ?? 0) + row.outstanding;
    }
    current.ledgerVoucherCount += 1;
    if (row.currency && !current.currencies.includes(row.currency)) current.currencies.push(row.currency);
    grouped.set(key, current);
  }
  return [...grouped.values()].sort(
    (left, right) => (right.outstandingByLedger ?? 0) - (left.outstandingByLedger ?? 0)
      || left.party.localeCompare(right.party, "vi"),
  );
}

/** Ghép số dư sổ vào bảng đối tác đã có (phải thu). */
export function mergeLedgerIntoParties(parties: PartyRow[], ledger: PartyRow[]): PartyRow[] {
  const byParty = new Map(ledger.map((row) => [row.party, row]));
  const merged = parties.map((row) => {
    const found = byParty.get(row.party);
    byParty.delete(row.party);
    return found
      ? { ...row, outstandingByLedger: found.outstandingByLedger, ledgerVoucherCount: found.ledgerVoucherCount, currencies: found.currencies }
      : row;
  });
  // Đối tác chỉ có trong sổ mà không có hoá đơn trong kỳ vẫn PHẢI hiện — giấu đi
  // là giấu đúng phần nợ cũ mà người bán cần đòi.
  return [...merged, ...byParty.values()];
}

/**
 * Tuổi nợ chia khoảng — báo cáo nền tảng.
 *
 * TÌNH TRẠNG THẬT (đọc code 21/08/2026): `Accounts Receivable Aging` /
 * `Accounts Payable Aging` ĐÃ được viết đầy đủ ở
 * `server/packages/query/src/finance-aging.ts` (5 khoảng: Chưa đến hạn · 1–30 ·
 * 31–60 · 61–90 · Trên 90) và ĐÃ có quyền trong `server/packages/policy/src/index.ts`.
 * Nhưng tuyến chạy report tương tác lại dựng
 * `reports: new D1ReportService(requestDb)` với compiler MẶC ĐỊNH
 * (`server/apps/tenant-worker/src/index-core-base.ts:1263`), tức
 * `FinanceQueryCompiler` KHÔNG nằm trên đường đi — gọi tên báo cáo này hiện trả
 * `Unknown report`.
 *
 * Vì vậy màn VẪN GỌI, và khi server từ chối thì hiện NGUYÊN VĂN lời từ chối chứ
 * không tự phân khoảng. Tự tính tuổi nợ ở client là dựng nguồn sự thật thứ hai
 * cho ngày đáo hạn — đúng loại hỏng mà bản kiểm kê §2 gọi là "luật đang ngủ".
 */
export async function loadAging(
  server: DebtServer,
  config: DebtSideConfig,
  input: { asOfDate: string; party: string },
): Promise<AgingRow[]> {
  const filters: ReportFilter[] = [
    { field: "as_of_date", operator: "=", value: input.asOfDate },
    ...(input.party ? [{ field: "party", operator: "=" as const, value: input.party }] : []),
  ];
  const result = await server.runReport(config.agingReport, filters);
  return reportRows(result).map((row) => ({
    party: text(row.party),
    company: text(row.company),
    currency: text(row.currency),
    voucherType: text(row.voucher_type),
    voucherNo: text(row.voucher_no),
    postingDate: dateOnly(row.posting_date),
    dueDate: dateOnly(row.due_date),
    invoiceTotal: amount(row.invoice_total),
    allocated: amount(row.allocated_amount),
    outstanding: amount(row.outstanding_amount),
    daysOverdue: amount(row.days_overdue),
    bucket: text(row.aging_bucket),
  }));
}

// ── Chứng từ gốc ─────────────────────────────────────────────────────────────

const PAGE_LENGTH = 200;

function documentRow(
  doctype: string,
  row: Record<string, unknown>,
  options: {
    dateField: string;
    referenceField?: string;
    amountField?: string;
    outstandingField?: string;
    extraField?: string;
  },
): SourceDocumentRow {
  return {
    doctype,
    name: text(row.name),
    postingAt: dateOnly(row[options.dateField]),
    dueDate: dateOnly(row.due_date),
    reference: options.referenceField ? text(row[options.referenceField]) : "",
    amount: options.amountField ? amount(row[options.amountField]) : null,
    outstanding: options.outstandingField ? amount(row[options.outstandingField]) : null,
    extra: options.extraField ? text(row[options.extraField]) : "",
    docstatus: amount(row.docstatus),
  };
}

/** Hoá đơn bán / hoá đơn mua của một đối tác trong kỳ. */
export async function loadInvoices(
  server: DebtServer,
  config: DebtSideConfig,
  input: { party: string; fromDate: string; toDate: string },
): Promise<SourceDocumentRow[]> {
  const orderField = config.side === "receivable" ? "against_sales_order" : "against_purchase_order";
  const rows = await server.getList(config.invoiceDoctype, {
    fields: ["name", "posting_at", "due_date", "grand_total", "outstanding_amount", orderField, "docstatus", "currency"],
    filters: [
      [config.partyField, "=", input.party],
      ...periodListFilters("posting_at", input.fromDate, input.toDate),
    ],
    orderBy: "posting_at desc",
    pageLength: PAGE_LENGTH,
  });
  return rows.map((row) => documentRow(config.invoiceDoctype, row, {
    dateField: "posting_at",
    referenceField: orderField,
    amountField: "grand_total",
    outstandingField: "outstanding_amount",
    extraField: "currency",
  }));
}

/** Phiếu thu / phiếu chi đã ghi cho đối tác trong kỳ. */
export async function loadPayments(
  server: DebtServer,
  config: DebtSideConfig,
  input: { party: string; fromDate: string; toDate: string },
): Promise<SourceDocumentRow[]> {
  const rows = await server.getList("Payment Entry", {
    fields: ["name", "posting_at", "paid_amount", "received_amount", "mode_of_payment", "reference_no", "payment_type", "party_type", "docstatus"],
    filters: [
      ["party_type", "=", config.paymentPartyType],
      ["party", "=", input.party],
      ["payment_type", "=", config.paymentType],
      ...periodListFilters("posting_at", input.fromDate, input.toDate),
    ],
    orderBy: "posting_at desc",
    pageLength: PAGE_LENGTH,
  });
  return rows.map((row) => documentRow("Payment Entry", row, {
    dateField: "posting_at",
    referenceField: "reference_no",
    amountField: "paid_amount",
    extraField: "mode_of_payment",
  }));
}

/** Giảm trừ: Credit Note (bán) / Debit Note (mua). */
export async function loadCreditNotes(
  server: DebtServer,
  config: DebtSideConfig,
  input: { party: string; fromDate: string; toDate: string },
): Promise<SourceDocumentRow[]> {
  const rows = await server.getList(config.creditDoctype, {
    fields: ["name", "posting_at", "grand_total", "return_against", "warranty_claim", "docstatus"],
    filters: [
      [config.partyField, "=", input.party],
      ...periodListFilters("posting_at", input.fromDate, input.toDate),
    ],
    orderBy: "posting_at desc",
    pageLength: PAGE_LENGTH,
  });
  return rows.map((row) => documentRow(config.creditDoctype, row, {
    dateField: "posting_at",
    referenceField: "return_against",
    amountField: "grand_total",
    extraField: "warranty_claim",
  }));
}

/** Phiếu giao hàng / phiếu nhập kho — vế HIỆN VẬT của cùng số dư. */
export async function loadMovements(
  server: DebtServer,
  config: DebtSideConfig,
  input: { party: string; fromDate: string; toDate: string },
): Promise<SourceDocumentRow[]> {
  const isDelivery = config.side === "receivable";
  const referenceField = isDelivery ? "against_sales_order" : "against_purchase_order";
  const fields = isDelivery
    ? ["name", "posting_at", referenceField, "issue_purpose", "installer", "docstatus"]
    : ["name", "posting_at", referenceField, "grand_total", "supplier_invoice_no", "docstatus"];
  const rows = await server.getList(config.movementDoctype, {
    fields,
    filters: [
      [config.partyField, "=", input.party],
      ...periodListFilters("posting_at", input.fromDate, input.toDate),
    ],
    orderBy: "posting_at desc",
    pageLength: PAGE_LENGTH,
  });
  return rows.map((row) => documentRow(config.movementDoctype, row, {
    dateField: "posting_at",
    referenceField,
    ...(isDelivery ? {} : { amountField: "grand_total" }),
    extraField: isDelivery ? "issue_purpose" : "supplier_invoice_no",
  }));
}

// ── Theo dõi giao hàng + công nợ phải trả của một nhà cung cấp ───────────────

/**
 * Hình dạng `alumdoor.purchase.supplier_delivery_dashboard` trả về.
 *
 * Chép theo `handlePurchaseSupplierDashboard` (dòng ~636 trở đi của
 * `purchase-supplier-dashboard.ts`). Mọi trường để optional vì worker còn nới
 * payload; luật đọc là "có thì hiện, không có thì ẩn", không dựng số 0 giả.
 */
export interface SupplierDashboard {
  supplier?: string;
  generated_at?: string;
  source?: string;
  summary?: {
    purchase_order_count?: number;
    open_purchase_order_count?: number;
    overdue_purchase_order_count?: number;
    material_count?: number;
    unsettled_material_count?: number;
    remaining_bars?: number;
    remaining_meters?: number;
    remaining_barem_weight_kg?: number;
    purchase_value?: number;
    receipt_count?: number;
    payable_outstanding?: number;
    payable_overdue?: number;
    supplier_advance?: number;
    payable_net_exposure?: number;
  };
  materials?: Array<Record<string, unknown>>;
  purchase_orders?: Array<Record<string, unknown>>;
  purchase_order_lines?: Array<Record<string, unknown>>;
  receipts?: Array<Record<string, unknown>>;
  billing?: {
    authoritative?: boolean;
    source?: string;
    note?: string;
    invoice_count?: number;
    invoice_total?: number;
    received_value?: number;
    received_not_invoiced_hint?: number;
    invoice_outstanding_hint?: number;
    total_outstanding?: number;
    due_amount?: number | null;
    overdue_amount?: number | null;
    advance_balance?: number | null;
    net_exposure?: number;
    oldest_due_date?: string | null;
    currencies?: string[];
  };
  capabilities?: Record<string, unknown>;
}

/** Chữ ký thật: `{ supplier }` bắt buộc, thiếu ⇒ 422 "Cần chọn Nhà cung cấp.". */
export function loadSupplierDashboard(server: DebtServer, supplier: string): Promise<SupplierDashboard> {
  return server.callPost<SupplierDashboard>("alumdoor.purchase.supplier_delivery_dashboard", { supplier });
}

export interface SettlementResult {
  ok?: boolean;
  operation?: "Close" | "Reverse";
  supplier?: string;
  queue_key?: string;
  window_id?: string;
  window_sequence?: number;
  doctype?: string;
  name?: string;
}

/**
 * Chốt hoặc đảo một kỳ giao hàng.
 *
 * Chữ ký thật đọc từ `handlePurchaseSupplierSettlement`:
 * `{ supplier, queue_key, operation: "Close" | "Reverse", reason }`.
 * `queue_key` bắt buộc; `reason` phải từ 3 ký tự; server tự tìm `window_id` đang
 * ở đúng trạng thái (`Open` để chốt, `Settled` để đảo) rồi tạo + ghi sổ chứng từ
 * `Purchase Settlement`. Client KHÔNG được tự chọn `window_id`.
 */
export function runSupplierSettlement(
  server: DebtServer,
  input: { supplier: string; queueKey: string; operation: "Close" | "Reverse"; reason: string },
): Promise<SettlementResult> {
  return server.callPost<SettlementResult>("alumdoor.purchase.supplier_delivery_settlement", {
    supplier: input.supplier,
    queue_key: input.queueKey,
    operation: input.operation,
    reason: input.reason,
  });
}
