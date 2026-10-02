import type {
  CanonicalDocument,
  ChildRow,
  GeneralLedgerEntry,
  JsonObject,
  MutationPlan,
  MutationReceipt,
  StockLedgerEntry,
} from "../../contracts/src/index.js";
import { asCloudForgeError, documentKey, errors } from "../../core/src/index.js";
import { fromScaledInt, toScaledInt } from "../../money/src/index.js";
import { deriveDeliveryNoteStatus, deriveO2CStatus } from "./status.js";
import { deriveSalesOrderProgress } from "./sales-order-progress.js";
import type { GlAccountBalance, GlAccountBalanceQuery, MutationStore, OpenPaymentBalance, OpenPaymentBalanceQuery, SubmittedQuantityQuery, TrackedStockPosition, TrackedStockState } from "./store.js";

interface DocumentRow {
  tenant_id: string;
  doctype: string;
  name: string;
  owner: string;
  docstatus: number;
  status: string;
  version: number;
  created_at: string;
  modified_at: string;
  modified_by: string;
  amended_from: string | null;
  payload_json: string;
}

interface ReceiptRow {
  command_id: string;
  tenant_id: string;
  actor_user_id: string;
  doctype: string;
  name: string;
  aggregate_version: number;
  payload_hash: string;
  committed_at: string;
  result_json: string;
}

/**
 * Khoá mang NHÃN chứ không mang con trỏ.
 *
 * `item_name`, `source_item_name`, … chứa tên người đọc. Trên D1 Alumdoor có 17 giá trị nhãn
 * TRÙNG Y HỆT một mã hàng, chỉ vì lúc nhập liệu người ta gõ mã vào ô tên. Nếu tính chúng là
 * tham chiếu thì rename bị chặn oan; nếu thay chúng theo mã mới thì giao diện xấu đi mà không
 * sửa được liên kết nào. Cả cascade lẫn guard đều bỏ qua nhóm khoá này.
 */
const DISPLAY_LABEL_KEY = /_name$/;

/**
 * Thay mọi lá có giá trị ĐÚNG BẰNG `from` thành `to`, giữ nguyên phần còn lại.
 *
 * So nguyên giá trị, không so chuỗi con — đây là toàn bộ lằn ranh an toàn của cascade.
 */
/**
 * Mã hàng ẩn ở ba chỗ, không phải một.
 *
 * Ngoài giá trị lá nguyên vẹn, nó còn sống trong hai dạng nữa — cả hai đều đo được trên D1
 * Alumdoor 19/08, và cả hai đều KHÔNG được sửa bằng thay chuỗi con:
 *
 *  1. KHOÁ NỐI BẰNG DẤU HAI CHẤM. Chính nền tảng đặt tên bằng `format:{a}:{b}:{c}`, nên đây là
 *     dạng của nền tảng chứ không phải thói quen riêng của một app:
 *       `Item Price.name`      558  `{bảng giá}:{mã}:{đvt}:{biến thể}`
 *       `rule_code`            337  `{mã cha}:{mã con}:{số thứ tự}`
 *       `Pricing Rule.name` / `.title` / `.exclusive_group`  56 mỗi loại
 *     So theo ĐOẠN, không so chuỗi con: đã kiểm không mã hàng nào chứa dấu hai chấm, nên một
 *     đoạn hoặc bằng đúng mã hoặc không liên quan. Nhờ vậy `TP-CUA` không đụng `TP-CUADL1LY`.
 *
 *  2. JSON SERIALIZE THÀNH CHUỖI. `deferred_components_json` (100 lần) là mảng JSON nằm trong
 *     một ô text, `item_code` nằm bên trong. Parse ra, sửa, đóng gói lại — vẫn là so nguyên giá
 *     trị lá, chỉ là sâu thêm một lớp.
 */
function rewriteColonSegments(input: string, from: string, to: string): { value: string; changed: boolean } {
  if (!input.includes(":") || !input.includes(from)) return { value: input, changed: false };
  const parts = input.split(":");
  let changed = false;
  const next = parts.map((part) => {
    if (part !== from) return part;
    changed = true;
    return to;
  });
  return changed ? { value: next.join(":"), changed } : { value: input, changed: false };
}

function rewriteEmbeddedJson(input: string, from: string, to: string): { value: string; changed: boolean } {
  const trimmed = input.trim();
  if (!trimmed.startsWith("[") && !trimmed.startsWith("{")) return { value: input, changed: false };
  if (!input.includes(from)) return { value: input, changed: false };
  let parsed: unknown;
  // Chuỗi trông giống JSON mà parse không ra thì để nguyên — đây là ô dữ liệu của người dùng,
  // không phải chỗ để đoán.
  try { parsed = JSON.parse(input); } catch { return { value: input, changed: false }; }
  if (parsed === null || typeof parsed !== "object") return { value: input, changed: false };
  const next = rewriteLeafMatches(parsed, from, to);
  return next.changed ? { value: JSON.stringify(next.value), changed: true } : { value: input, changed: false };
}

export function rewriteLeafMatches(input: unknown, from: string, to: string, key = ""): { value: unknown; changed: boolean } {
  if (typeof input === "string") {
    if (DISPLAY_LABEL_KEY.test(key)) return { value: input, changed: false };
    if (input === from) return { value: to, changed: true };
    const embedded = rewriteEmbeddedJson(input, from, to);
    if (embedded.changed) return embedded;
    const segmented = rewriteColonSegments(input, from, to);
    if (segmented.changed) return segmented;
    return { value: input, changed: false };
  }
  if (Array.isArray(input)) {
    let changed = false;
    const out = input.map((entry) => {
      // Phần tử mảng thừa hưởng khoá của mảng: `tags[]` vẫn là `tags`, `items[]` vẫn là `items`.
      const next = rewriteLeafMatches(entry, from, to, key);
      changed ||= next.changed;
      return next.value;
    });
    return changed ? { value: out, changed } : { value: input, changed: false };
  }
  if (input && typeof input === "object") {
    let changed = false;
    const out: Record<string, unknown> = {};
    for (const [childKey, childValue] of Object.entries(input as Record<string, unknown>)) {
      const next = rewriteLeafMatches(childValue, from, to, childKey);
      changed ||= next.changed;
      out[childKey] = next.value;
    }
    return changed ? { value: out, changed } : { value: input, changed: false };
  }
  return { value: input, changed: false };
}

export class D1MutationStore implements MutationStore {
  private readonly writer: D1Database | D1DatabaseSession;

  constructor(private readonly db: D1Database) {
    // Every command-side read starts at the primary and remains in one bookmark
    // chain. Report reads use D1ReportService separately and may use replicas.
    this.writer = db.withSession?.("first-primary") ?? db;
  }

  async getDocument<T extends JsonObject>(tenantId: string, doctype: string, name: string): Promise<CanonicalDocument<T> | null> {
    const row = await this.writer.prepare(
      `SELECT tenant_id, doctype, name, owner, docstatus, status, version, created_at, modified_at,
              modified_by, amended_from, payload_json
       FROM documents WHERE tenant_id=?1 AND doc_key=?2`,
    ).bind(tenantId, documentKey(doctype, name)).first<DocumentRow>();
    if (!row) return null;
    const children = await this.writer.prepare(
      `SELECT fieldname, child_doctype, row_id, idx, payload_json
       FROM document_children WHERE tenant_id=?1 AND parent_key=?2 ORDER BY fieldname, idx`,
    ).bind(tenantId, documentKey(doctype, name)).all<{
      fieldname: string; child_doctype: string; row_id: string; idx: number; payload_json: string;
    }>();
    const document: CanonicalDocument<T> = {
      tenant_id: row.tenant_id,
      doctype: row.doctype,
      name: row.name,
      owner: row.owner,
      docstatus: row.docstatus as 0 | 1 | 2,
      status: row.status,
      version: row.version,
      created_at: row.created_at,
      modified_at: row.modified_at,
      ...(row.modified_by ? { modified_by: row.modified_by } : {}),
      ...(row.amended_from ? { amended_from: row.amended_from } : {}),
      data: JSON.parse(row.payload_json) as T,
      children: (children.results ?? []).map((child) => ({
        fieldname: child.fieldname,
        child_doctype: child.child_doctype,
        row_id: child.row_id,
        idx: child.idx,
        data: JSON.parse(child.payload_json) as JsonObject,
      })),
    };
    await this.hydrateDerived(document);
    return document;
  }

  /**
   * Read-side document authority: operator/imported documents override app fixtures.
   *
   * `getDocument` intentionally remains documents-only because the command kernel uses
   * absence there to create a first operator overlay.  The Frappe GET surface calls this
   * method instead, so an active fixture can be opened with the same canonical shape as a
   * document without pretending it has already been persisted in `documents`.
   */
  async getReadableDocument<T extends JsonObject>(
    tenantId: string,
    doctype: string,
    name: string,
  ): Promise<CanonicalDocument<T> | null> {
    const document = await this.getDocument<T>(tenantId, doctype, name);
    if (document) return document;
    const row = await this.writer.prepare(
      `SELECT data_json,modified_at FROM master_records
        WHERE tenant_id=?1 AND record_type=?2 AND name=?3 AND disabled=0`,
    ).bind(tenantId, doctype, name).first<{ data_json: string; modified_at: string }>();
    if (!row) return null;
    let data: T;
    try {
      const parsed = JSON.parse(row.data_json) as unknown;
      data = (parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {}) as T;
    } catch {
      throw errors.database("Master record data is invalid JSON");
    }
    return {
      tenant_id: tenantId,
      doctype,
      name,
      owner: "Administrator",
      docstatus: 0,
      status: "Draft",
      version: 1,
      created_at: row.modified_at,
      modified_at: row.modified_at,
      modified_by: "app",
      data,
      children: [],
    };
  }

  async listDocumentsByDoctype<T extends JsonObject>(
    tenantId: string,
    doctype: string,
  ): Promise<Array<CanonicalDocument<T>>> {
    const rows = await this.writer.prepare(
      `SELECT tenant_id, doctype, name, owner, docstatus, status, version, created_at, modified_at,
              modified_by, amended_from, payload_json
       FROM documents WHERE tenant_id=?1 AND doctype=?2 ORDER BY name LIMIT 5000`,
    ).bind(tenantId, doctype).all<DocumentRow>();
    return (rows.results ?? []).map((row): CanonicalDocument<T> => ({
      tenant_id: row.tenant_id,
      doctype: row.doctype,
      name: row.name,
      owner: row.owner,
      docstatus: row.docstatus as 0 | 1 | 2,
      status: row.status,
      version: row.version,
      created_at: row.created_at,
      modified_at: row.modified_at,
      ...(row.modified_by ? { modified_by: row.modified_by } : {}),
      ...(row.amended_from ? { amended_from: row.amended_from } : {}),
      data: JSON.parse(row.payload_json) as T,
      children: [],
    }));
  }

  async getReceipt(tenantId: string, commandId: string): Promise<MutationReceipt | null> {
    const row = await this.writer.prepare(
      `SELECT command_id, tenant_id, actor_user_id, doctype, name, aggregate_version, payload_hash, committed_at, result_json
       FROM mutation_receipts WHERE tenant_id=?1 AND command_id=?2`,
    ).bind(tenantId, commandId).first<ReceiptRow>();
    if (!row) return null;
    return {
      command_id: row.command_id,
      tenant_id: row.tenant_id,
      actor_user_id: row.actor_user_id,
      aggregate: { doctype: row.doctype, name: row.name },
      aggregate_version: row.aggregate_version,
      payload_hash: row.payload_hash,
      committed_at: row.committed_at,
      result: JSON.parse(row.result_json) as JsonObject,
    };
  }

  async sumSubmittedChildQuantityMicros(query: SubmittedQuantityQuery): Promise<number> {
    if (!/^[a-z_][a-z0-9_]*$/i.test(query.referenceField)) throw errors.validation("Unsafe reference field");
    const exclusion = query.excludeName ? "AND d.name<>?5" : "";
    // `stock_qty_micros` trước `qty_micros`: một dòng mua theo CÂY và một dòng yêu cầu
    // theo MÉT chỉ so được với nhau sau khi quy về đơn vị tồn. Dòng không quy đổi thì
    // hai con số bằng nhau, nên COALESCE giữ nguyên hành vi của mọi chứng từ đang chạy.
    const quantityExpression = query.quantityKind === "transaction"
      ? "json_extract(c.payload_json, '$.qty_micros')"
      : "COALESCE(json_extract(c.payload_json, '$.stock_qty_micros'), json_extract(c.payload_json, '$.qty_micros'))";
    const sql = `SELECT COALESCE(SUM(CAST(${quantityExpression} AS INTEGER)),0) AS total
      FROM documents d
      JOIN document_children c ON c.tenant_id=d.tenant_id AND c.parent_key=d.doc_key AND c.fieldname='items'
      WHERE d.tenant_id=?1 AND d.doctype=?2 AND d.docstatus=1
        AND json_extract(d.payload_json, '$.${query.referenceField}')=?3
        AND json_extract(c.payload_json, '$.item_code')=?4
        ${exclusion}`;
    const statement = this.writer.prepare(sql);
    const row = query.excludeName
      ? await statement.bind(query.tenantId, query.parentDoctype, query.referenceName, query.itemCode, query.excludeName).first<{ total: number }>()
      : await statement.bind(query.tenantId, query.parentDoctype, query.referenceName, query.itemCode).first<{ total: number }>();
    return Number(row?.total ?? 0);
  }

  async getGlAccountBalances(query: GlAccountBalanceQuery): Promise<GlAccountBalance[]> {
    const rows = await this.writer.prepare(
      `SELECT g.account,g.currency,g.currency_scale,
              COALESCE(SUM(g.debit_minor),0) AS debit_minor,
              COALESCE(SUM(g.credit_minor),0) AS credit_minor,
              COUNT(*) AS row_count
       FROM gl_entries g
       INNER JOIN documents d
         ON d.tenant_id=g.tenant_id
        AND d.doctype=g.voucher_type
        AND d.name=g.voucher_no
       WHERE g.tenant_id=?1
         AND json_extract(d.payload_json,'$.company')=?2
         AND date(g.posting_at)>=date(?3)
         AND date(g.posting_at)<=date(?4)
         AND (?5='' OR COALESCE(
           NULLIF(json_extract(d.payload_json,'$.branch'),''),
           NULLIF(json_extract(g.dimensions_json,'$.branch'),''),
           ''
         )=?5)
         AND (?6='' OR g.account=?6)
       GROUP BY g.account,g.currency,g.currency_scale
       HAVING SUM(g.debit_minor)<>0 OR SUM(g.credit_minor)<>0
       ORDER BY g.account,g.currency,g.currency_scale`,
    ).bind(
      query.tenantId,
      query.company,
      query.fromDate,
      query.throughDate,
      query.branch ?? "",
      query.account ?? "",
    ).all<{
      account: string;
      currency: string;
      currency_scale: number;
      debit_minor: number;
      credit_minor: number;
      row_count: number;
    }>();
    return (rows.results ?? []).map((row) => ({
      account: String(row.account),
      currency: String(row.currency),
      currency_scale: Number(row.currency_scale),
      debit_minor: Number(row.debit_minor),
      credit_minor: Number(row.credit_minor),
      row_count: Number(row.row_count),
      balance_minor: Number(row.debit_minor) - Number(row.credit_minor),
    }));
  }

  async getOutstandingMinor(tenantId: string, voucherType: string, voucherNo: string): Promise<number> {
    const row = await this.writer.prepare(
      `SELECT COALESCE(SUM(amount_minor),0) AS total FROM payment_ledger_entries
       WHERE tenant_id=?1 AND against_voucher_type=?2 AND against_voucher_no=?3`,
    ).bind(tenantId, voucherType, voucherNo).first<{ total: number }>();
    return Number(row?.total ?? 0);
  }

  async getBaseOutstandingMinor(tenantId: string, voucherType: string, voucherNo: string): Promise<number> {
    const row = await this.writer.prepare(
      `SELECT COALESCE(SUM(base_amount_minor),0) AS total FROM payment_ledger_entries
       WHERE tenant_id=?1 AND against_voucher_type=?2 AND against_voucher_no=?3`,
    ).bind(tenantId, voucherType, voucherNo).first<{ total: number }>();
    return Number(row?.total ?? 0);
  }

  async listOpenPaymentBalances(query: OpenPaymentBalanceQuery): Promise<OpenPaymentBalance[]> {
    const rows = await this.writer.prepare(
      `SELECT
         p.account_type,p.party_type,p.party,p.account,
         p.against_voucher_type,p.against_voucher_no,p.currency,p.currency_scale,
         SUM(p.amount_minor) AS amount_minor,
         SUM(p.base_amount_minor) AS base_amount_minor,
         COUNT(*) AS row_count
       FROM payment_ledger_entries p
       INNER JOIN documents d
         ON d.tenant_id=p.tenant_id
        AND d.doctype=p.against_voucher_type
        AND d.name=p.against_voucher_no
       WHERE p.tenant_id=?1
         AND p.against_voucher_type IN ('Sales Invoice','Purchase Invoice')
         AND json_extract(d.payload_json,'$.company')=?2
         AND date(p.posting_at)<=date(?3)
       GROUP BY
         p.account_type,p.party_type,p.party,p.account,
         p.against_voucher_type,p.against_voucher_no,p.currency,p.currency_scale
       HAVING SUM(p.amount_minor)<>0 OR SUM(p.base_amount_minor)<>0
       ORDER BY p.account,p.party,p.against_voucher_type,p.against_voucher_no`,
    ).bind(query.tenantId, query.company, query.throughDate).all<Record<string, unknown>>();
    return (rows.results ?? []).map((row) => ({
      account_type: String(row.account_type) as "Receivable" | "Payable",
      party_type: String(row.party_type),
      party: String(row.party),
      account: String(row.account),
      against_voucher_type: String(row.against_voucher_type) as "Sales Invoice" | "Purchase Invoice",
      against_voucher_no: String(row.against_voucher_no),
      currency: String(row.currency),
      currency_scale: Number(row.currency_scale),
      amount_minor: Number(row.amount_minor),
      base_amount_minor: Number(row.base_amount_minor),
      row_count: Number(row.row_count),
    }));
  }

  async getStockBalanceMicros(tenantId: string, itemCode: string, warehouse: string): Promise<number> {
    const row = await this.writer.prepare(
      `SELECT COALESCE(SUM(actual_qty_micros),0) AS total FROM stock_ledger_entries
       WHERE tenant_id=?1 AND item_code=?2 AND warehouse=?3`,
    ).bind(tenantId, itemCode, warehouse).first<{ total: number }>();
    return Number(row?.total ?? 0);
  }

  async getTrackedStockBalanceMicros(tenantId: string, itemCode: string, warehouse: string, batchNo?: string, serialNo?: string): Promise<number> {
    const conditions = ["tenant_id=?1", "item_code=?2", "warehouse=?3"];
    const values: unknown[] = [tenantId, itemCode, warehouse];
    if (batchNo) { conditions.push(`batch_no=?${values.length + 1}`); values.push(batchNo); }
    if (serialNo) { conditions.push(`serial_no=?${values.length + 1}`); values.push(serialNo); }
    const row = await this.writer.prepare(
      `SELECT COALESCE(SUM(actual_qty_micros),0) AS total FROM stock_ledger_entries WHERE ${conditions.join(" AND ")}`,
    ).bind(...values).first<{ total: number }>();
    return Number(row?.total ?? 0);
  }

  async getTrackedStockState(
    tenantId: string,
    itemCode: string,
    warehouse: string,
    batchNo?: string,
    throughPostingAt?: string,
  ): Promise<TrackedStockState> {
    const row = await this.writer.prepare(
      `SELECT COALESCE(SUM(actual_qty_micros),0) AS qty_micros,
              CASE WHEN COUNT(actual_weight_micros)=0 THEN NULL
                   ELSE COALESCE(SUM(actual_weight_micros),0) END AS weight_micros,
              COALESCE(SUM(stock_value_difference_minor),0) AS stock_value_minor
       FROM stock_ledger_entries
       WHERE tenant_id=?1 AND item_code=?2 AND warehouse=?3
         AND (?4 IS NULL OR batch_no=?4)
         AND (?5 IS NULL OR posting_at<=?5)`,
    ).bind(tenantId, itemCode, warehouse, batchNo ?? null, throughPostingAt ?? null)
      .first<{ qty_micros: number; weight_micros: number | null; stock_value_minor: number }>();
    return {
      qty_micros: Number(row?.qty_micros ?? 0),
      weight_micros: row?.weight_micros == null ? null : Number(row.weight_micros),
      stock_value_minor: Number(row?.stock_value_minor ?? 0),
    };
  }

  async listTrackedStockPositions(tenantId: string, itemCode?: string): Promise<TrackedStockPosition[]> {
    const result = await this.writer.prepare(
      `SELECT item_code,warehouse,batch_no,
              SUM(actual_qty_micros) AS qty_micros,
              CASE WHEN COUNT(actual_weight_micros)=0 THEN NULL
                   ELSE COALESCE(SUM(actual_weight_micros),0) END AS weight_micros,
              COALESCE(SUM(stock_value_difference_minor),0) AS stock_value_minor
       FROM stock_ledger_entries
       WHERE tenant_id=?1 AND batch_no IS NOT NULL AND (?2 IS NULL OR item_code=?2)
       GROUP BY item_code,warehouse,batch_no
       HAVING SUM(actual_qty_micros)<>0 OR COALESCE(SUM(actual_weight_micros),0)<>0`,
    ).bind(tenantId, itemCode ?? null).all<{
      item_code: string;
      warehouse: string;
      batch_no: string;
      qty_micros: number;
      weight_micros: number | null;
      stock_value_minor: number;
    }>();
    return (result.results ?? []).map((row) => ({
      item_code: String(row.item_code),
      warehouse: String(row.warehouse),
      batch_no: String(row.batch_no),
      qty_micros: Number(row.qty_micros),
      weight_micros: row.weight_micros == null ? null : Number(row.weight_micros),
      stock_value_minor: Number(row.stock_value_minor),
    }));
  }

  async getVoucherGlEntries(tenantId: string, voucherType: string, voucherNo: string, voucherRevision: number): Promise<GeneralLedgerEntry[]> {
    const result = await this.writer.prepare(
      `SELECT line_key,account,party_type,party,debit_minor,credit_minor,currency,currency_scale,
       cost_center,dimensions_json,remarks,posting_at
       FROM gl_entries
       WHERE tenant_id=?1 AND voucher_type=?2 AND voucher_no=?3 AND voucher_revision=?4
       ORDER BY rowid`,
    ).bind(tenantId, voucherType, voucherNo, voucherRevision).all<Record<string, unknown>>();
    return (result.results ?? []).map((row) => ({
      line_key: String(row.line_key),
      account: String(row.account),
      ...(row.party_type ? { party_type: String(row.party_type) } : {}),
      ...(row.party ? { party: String(row.party) } : {}),
      debit_minor: Number(row.debit_minor),
      credit_minor: Number(row.credit_minor),
      currency: String(row.currency),
      currency_scale: Number(row.currency_scale),
      ...(row.cost_center ? { cost_center: String(row.cost_center) } : {}),
      ...(typeof row.dimensions_json === "string"
        ? { accounting_dimensions: JSON.parse(row.dimensions_json) as JsonObject }
        : {}),
      ...(row.remarks ? { remarks: String(row.remarks) } : {}),
      posting_at: String(row.posting_at),
    }));
  }

  async getVoucherStockEntries(tenantId: string, voucherType: string, voucherNo: string, voucherRevision: number): Promise<StockLedgerEntry[]> {
    const result = await this.writer.prepare(
      `SELECT voucher_type,voucher_no,voucher_revision,line_key,source_row_id,
       valuation_target_voucher_type,valuation_target_voucher_no,valuation_target_voucher_revision,valuation_target_row_id,
       item_code,warehouse,actual_qty_micros,actual_weight_micros,valuation_rate_minor,stock_value_difference_minor,
       qty_scale,currency_scale,currency,posting_at,batch_no,serial_no,allow_negative_stock
       FROM stock_ledger_entries
       WHERE tenant_id=?1 AND voucher_type=?2 AND voucher_no=?3 AND voucher_revision=?4
       ORDER BY rowid`,
    ).bind(tenantId, voucherType, voucherNo, voucherRevision).all<Record<string, unknown>>();
    return (result.results ?? []).map(mapStockLedgerRow);
  }

  async getStockLedgerHistory(tenantId: string, itemCode: string, warehouse: string, throughPostingAt?: string, batchNo?: string): Promise<StockLedgerEntry[]> {
    // Dựng điều kiện theo danh sách thay vì nối chuỗi hai nhánh: thêm tham số thứ năm vào
    // lối viết `?4` cố định cũ là chỗ rất dễ lệch số thứ tự, và lệch một số là truy vấn sai
    // mà vẫn chạy.
    const conditions = ["tenant_id=?1", "item_code=?2", "warehouse=?3"];
    const values: unknown[] = [tenantId, itemCode, warehouse];
    if (throughPostingAt) { conditions.push(`posting_at<=?${values.length + 1}`); values.push(throughPostingAt); }
    if (batchNo) { conditions.push(`batch_no=?${values.length + 1}`); values.push(batchNo); }
    const sql = `SELECT voucher_type,voucher_no,voucher_revision,line_key,source_row_id,
      valuation_target_voucher_type,valuation_target_voucher_no,valuation_target_voucher_revision,valuation_target_row_id,
      item_code,warehouse,actual_qty_micros,actual_weight_micros,valuation_rate_minor,stock_value_difference_minor,
      qty_scale,currency_scale,currency,posting_at,batch_no,serial_no,allow_negative_stock
      FROM stock_ledger_entries WHERE ${conditions.join(" AND ")}
      ORDER BY posting_at,rowid`;
    const result = await this.writer.prepare(sql).bind(...values).all<Record<string, unknown>>();
    return (result.results ?? []).map(mapStockLedgerRow);
  }

  async isStockBundleUsed(tenantId: string, bundleName: string): Promise<boolean> {
    const row = await this.writer.prepare(
      `SELECT COALESCE(SUM(usage_delta),0) AS active
       FROM stock_bundle_usage_entries
       WHERE tenant_id=?1 AND bundle_name=?2`,
    ).bind(tenantId, bundleName).first<{ active: number }>();
    return Number(row?.active ?? 0) > 0;
  }

  async getReturnedQuantityMicros(tenantId: string, referenceDoctype: string, referenceName: string, kind: string, itemCode: string): Promise<number> {
    const row = await this.writer.prepare(
      `SELECT COALESCE(SUM(qty_micros),0) AS total FROM return_progress_entries
       WHERE tenant_id=?1 AND reference_doctype=?2 AND reference_name=?3 AND kind=?4 AND item_code=?5`,
    ).bind(tenantId,referenceDoctype,referenceName,kind,itemCode).first<{ total: number }>();
    return Number(row?.total ?? 0);
  }

  async getManufacturedQuantityMicros(tenantId: string, workOrder: string, kind?: "Material Transfer" | "Consumption" | "Manufacture", itemCode?: string): Promise<number> {
    const conditions = ["tenant_id=?1", "work_order=?2"]; const values: unknown[] = [tenantId,workOrder];
    if (kind) { conditions.push(`kind=?${values.length+1}`); values.push(kind); }
    if (itemCode) { conditions.push(`item_code=?${values.length+1}`); values.push(itemCode); }
    const row = await this.writer.prepare(
      `SELECT COALESCE(SUM(qty_micros),0) AS total FROM manufacturing_progress_entries WHERE ${conditions.join(" AND ")}`,
    ).bind(...values).first<{ total: number }>();
    return Number(row?.total ?? 0);
  }

  async getJobCardCompletedQuantityMicros(tenantId: string, workOrder: string, excludeName?: string): Promise<number> {
    const row = await this.writer.prepare(
      `SELECT COALESCE(SUM(CAST(json_extract(payload_json,'$.completed_qty_micros') AS INTEGER)),0) AS total
       FROM documents WHERE tenant_id=?1 AND doctype='Job Card' AND docstatus=1
         AND json_extract(payload_json,'$.work_order')=?2 AND (?3 IS NULL OR name<>?3)`,
    ).bind(tenantId, workOrder, excludeName ?? null).first<{ total: number }>();
    return Number(row?.total ?? 0);
  }

  async getAssetDepreciatedMinor(tenantId: string, asset: string): Promise<number> {
    const row = await this.writer.prepare(
      `SELECT COALESCE(SUM(amount_minor),0) AS total FROM asset_depreciation_entries WHERE tenant_id=?1 AND asset=?2`,
    ).bind(tenantId,asset).first<{ total: number }>();
    return Number(row?.total ?? 0);
  }

  async getAssetDisposalMinor(tenantId: string, asset: string): Promise<number> {
    const row = await this.writer.prepare(
      `SELECT COALESCE(SUM(amount_minor),0) AS total FROM asset_lifecycle_entries WHERE tenant_id=?1 AND asset=?2 AND kind='Disposal'`,
    ).bind(tenantId, asset).first<{ total: number }>();
    return Number(row?.total ?? 0);
  }

  async isAssetDisposed(tenantId: string, asset: string): Promise<boolean> {
    const row = await this.writer.prepare(
      `SELECT COALESCE(SUM(CASE WHEN line_key LIKE 'REV-%' THEN -1 ELSE 1 END),0) AS active
       FROM asset_lifecycle_entries WHERE tenant_id=?1 AND asset=?2 AND kind='Disposal'`,
    ).bind(tenantId, asset).first<{ active: number }>();
    return Number(row?.active ?? 0) > 0;
  }

  async getProjectTimeSummary(tenantId: string, project: string): Promise<{ hours_micros: number; cost_minor: number; billing_minor: number }> {
    const row = await this.writer.prepare(
      `SELECT COALESCE(SUM(hours_micros),0) AS hours_micros, COALESCE(SUM(cost_minor),0) AS cost_minor,
              COALESCE(SUM(billing_minor),0) AS billing_minor
       FROM project_time_entries WHERE tenant_id=?1 AND project=?2`,
    ).bind(tenantId, project).first<{ hours_micros: number; cost_minor: number; billing_minor: number }>();
    return { hours_micros: Number(row?.hours_micros ?? 0), cost_minor: Number(row?.cost_minor ?? 0), billing_minor: Number(row?.billing_minor ?? 0) };
  }

  async getPosSessionSales(tenantId: string, openingEntry: string): Promise<{ net_total_minor: number; tax_total_minor: number; grand_total_minor: number }> {
    const row = await this.writer.prepare(
      `SELECT COALESCE(SUM(net_total_minor),0) AS net_total_minor, COALESCE(SUM(tax_total_minor),0) AS tax_total_minor,
              COALESCE(SUM(grand_total_minor),0) AS grand_total_minor
       FROM pos_sales_entries WHERE tenant_id=?1 AND opening_entry=?2`,
    ).bind(tenantId, openingEntry).first<{ net_total_minor: number; tax_total_minor: number; grand_total_minor: number }>();
    return { net_total_minor: Number(row?.net_total_minor ?? 0), tax_total_minor: Number(row?.tax_total_minor ?? 0), grand_total_minor: Number(row?.grand_total_minor ?? 0) };
  }

  async isPosSessionClosed(tenantId: string, openingEntry: string): Promise<boolean> {
    const row = await this.writer.prepare(
      `SELECT 1 AS found FROM documents WHERE tenant_id=?1 AND doctype='POS Closing Entry' AND docstatus=1
       AND json_extract(payload_json,'$.opening_entry')=?2 LIMIT 1`,
    ).bind(tenantId, openingEntry).first<{ found: number }>();
    return Boolean(row);
  }

  async hasOpenPosSessionForProfile(tenantId: string, posProfile: string, excludeOpeningEntry?: string): Promise<boolean> {
    const row = await this.writer.prepare(
      `SELECT 1 AS found FROM documents o
       WHERE o.tenant_id=?1 AND o.doctype='POS Opening Entry' AND o.docstatus=1
         AND json_extract(o.payload_json,'$.pos_profile')=?2 AND (?3 IS NULL OR o.name<>?3)
         AND NOT EXISTS(SELECT 1 FROM documents c WHERE c.tenant_id=o.tenant_id AND c.doctype='POS Closing Entry'
           AND c.docstatus=1 AND json_extract(c.payload_json,'$.opening_entry')=o.name)
       LIMIT 1`,
    ).bind(tenantId, posProfile, excludeOpeningEntry ?? null).first<{ found: number }>();
    return Boolean(row);
  }

  async getBankReconciledMinor(tenantId: string, bankTransaction: string): Promise<number> {
    const row = await this.writer.prepare(
      `SELECT COALESCE(SUM(amount_minor),0) AS total FROM bank_reconciliation_entries
       WHERE tenant_id=?1 AND bank_transaction=?2`,
    ).bind(tenantId, bankTransaction).first<{ total: number }>();
    return Number(row?.total ?? 0);
  }

  async getFulfilledQuantityMicros(
    tenantId: string,
    salesOrder: string,
    kind?: "Delivery" | "Billing",
    itemCode?: string,
  ): Promise<number> {
    const conditions = ["tenant_id=?1", "sales_order=?2"];
    const values: unknown[] = [tenantId, salesOrder];
    if (kind) { conditions.push(`kind=?${values.length + 1}`); values.push(kind); }
    if (itemCode) { conditions.push(`item_code=?${values.length + 1}`); values.push(itemCode); }
    const row = await this.writer.prepare(
      `SELECT COALESCE(SUM(qty_micros),0) AS total FROM sales_order_fulfillment_entries WHERE ${conditions.join(" AND ")}`,
    ).bind(...values).first<{ total: number }>();
    return Number(row?.total ?? 0);
  }

  async getFulfilledLineQuantityMicros(
    tenantId: string,
    salesOrder: string,
    kind: "Delivery" | "Billing",
    salesOrderLineKey: string,
    packageComponentKey?: string,
  ): Promise<number> {
    const conditions = ["tenant_id=?1", "sales_order=?2", "kind=?3", "sales_order_line_key=?4"];
    const values: unknown[] = [tenantId, salesOrder, kind, salesOrderLineKey];
    if (packageComponentKey !== undefined) {
      conditions.push(`package_component_key=?${values.length + 1}`);
      values.push(packageComponentKey);
    }
    const row = await this.writer.prepare(
      `SELECT COALESCE(SUM(qty_micros),0) AS total FROM sales_line_fulfillment_entries WHERE ${conditions.join(" AND ")}`,
    ).bind(...values).first<{ total: number }>();
    return Number(row?.total ?? 0);
  }

  /**
   * Phần trăm đã nhận / đã xuất hoá đơn cho NHIỀU đơn mua bằng MỘT truy vấn.
   *
   * `getDocument` tính hai con số này lúc mở một chứng từ nhưng KHÔNG ghi lại, nên giá trị nằm
   * trong `documents` vẫn là "0.00" từ lúc tạo đơn. Hệ quả đo được ngày 23/08/2026: mở
   * DMH-2026-0009 ra thấy 100,00% còn danh sách và báo cáo "Đơn mua chưa nhận đủ" đều thấy
   * 0,00% — thủ kho đi giục nhà cung cấp những đơn đã về đủ.
   *
   * Gộp cả trang vào một câu truy vấn: đường danh sách không được phép đọc từng đơn một.
   * Số lượng đặt lấy y hệt `getDocument`: `qty_micros` nếu có, không thì quy `qty` ra micro.
   */
  async getPurchaseOrderProgress(
    tenantId: string,
    names: readonly string[],
  ): Promise<Map<string, { received: number; billed: number }>> {
    const unique = [...new Set(names.filter(Boolean))];
    const ket = new Map<string, { received: number; billed: number }>();
    if (!unique.length) return ket;
    const cho = unique.map((_, index) => `?${index + 2}`).join(",");
    const rows = await this.writer.prepare(
      `WITH dat AS (
         SELECT d.name AS don,
                COALESCE(SUM(COALESCE(
                  CAST(json_extract(j.value,'$.qty_micros') AS INTEGER),
                  CAST(ROUND(CAST(COALESCE(json_extract(j.value,'$.qty'),0) AS REAL) * 1000000) AS INTEGER),
                  0)), 0) AS dat_micros
         FROM documents d, json_each(json_extract(d.payload_json,'$.items')) j
         WHERE d.tenant_id=?1 AND d.doctype='Purchase Order' AND d.name IN (${cho})
         GROUP BY d.name
       ), tien AS (
         SELECT purchase_order AS don, kind, COALESCE(SUM(qty_micros),0) AS q
         FROM purchase_order_progress_entries
         WHERE tenant_id=?1 AND purchase_order IN (${cho})
         GROUP BY purchase_order, kind
       )
       SELECT dat.don AS don, dat.dat_micros AS dat_micros,
              COALESCE((SELECT q FROM tien WHERE tien.don=dat.don AND tien.kind='Receipt'),0) AS nhan,
              COALESCE((SELECT q FROM tien WHERE tien.don=dat.don AND tien.kind='Billing'),0) AS hoadon
       FROM dat`,
    ).bind(tenantId, ...unique).all<{ don: string; dat_micros: number; nhan: number; hoadon: number }>();
    for (const row of rows.results ?? []) {
      const dat = Number(row.dat_micros ?? 0);
      if (dat <= 0) continue;
      ket.set(row.don, {
        received: (Number(row.nhan ?? 0) * 100) / dat,
        billed: (Number(row.hoadon ?? 0) * 100) / dat,
      });
    }
    return ket;
  }

  async getProcuredQuantityMicros(
    tenantId: string,
    purchaseOrder: string,
    kind?: "Receipt" | "Billing",
    itemCode?: string,
    purchaseOrderItemRowId?: string,
  ): Promise<number> {
    const conditions = ["tenant_id=?1", "purchase_order=?2"];
    const values: unknown[] = [tenantId, purchaseOrder];
    if (kind) { conditions.push(`kind=?${values.length + 1}`); values.push(kind); }
    if (itemCode) { conditions.push(`item_code=?${values.length + 1}`); values.push(itemCode); }
    if (purchaseOrderItemRowId) {
      conditions.push(`purchase_order_item_row_id=?${values.length + 1}`);
      values.push(purchaseOrderItemRowId);
    }
    const row = await this.writer.prepare(
      `SELECT COALESCE(SUM(qty_micros),0) AS total FROM purchase_order_progress_entries WHERE ${conditions.join(" AND ")}`,
    ).bind(...values).first<{ total: number }>();
    return Number(row?.total ?? 0);
  }

  /**
   * Deletes a document and everything attached to it.
   *
   * Deliberately narrower than Frappe, which also allows deleting a cancelled
   * document. Here a cancelled document still owns its reversing ledger rows
   * (`gl_entries` and friends are keyed by voucher + revision, not by a
   * foreign key), so removing it would leave those reversals pointing at nothing
   * and silently unbalance the books. Non-draft deletion is available only through
   * an explicit metadata opt-in for configuration masters; the ledger check below
   * remains authoritative even for those masters.
   *
   * Returns false when the document is already gone, so a retried delete is
   * idempotent rather than a 404 the caller has to special-case.
   */
  async deleteDraftDocument(
    tenantId: string,
    doctype: string,
    name: string,
    options: { allowNonDraft?: boolean } = {},
  ): Promise<boolean> {
    const key = documentKey(doctype, name);
    const row = await this.writer.prepare(
      `SELECT docstatus FROM documents WHERE tenant_id=?1 AND doc_key=?2`,
    ).bind(tenantId, key).first<{ docstatus: number }>();
    if (!row) return false;
    if (!options.allowNonDraft && row.docstatus === 1) throw errors.lifecycle("A submitted document cannot be deleted; cancel it instead");
    if (!options.allowNonDraft && row.docstatus === 2) throw errors.lifecycle("A cancelled document cannot be deleted because its reversing ledger entries would be orphaned");

    // A draft has no ledger of its own, but an unposted projection would still
    // orphan; check rather than assume.
    const ledger = await this.writer.prepare(
      `SELECT (SELECT COUNT(*) FROM gl_entries WHERE tenant_id=?1 AND voucher_type=?2 AND voucher_no=?3)
            + (SELECT COUNT(*) FROM stock_ledger_entries WHERE tenant_id=?1 AND voucher_type=?2 AND voucher_no=?3)
            + (SELECT COUNT(*) FROM payment_ledger_entries WHERE tenant_id=?1 AND voucher_type=?2 AND voucher_no=?3) AS total`,
    ).bind(tenantId, doctype, name).first<{ total: number }>();
    if (Number(ledger?.total ?? 0) > 0) {
      throw errors.lifecycle("The document has posted ledger entries and cannot be deleted");
    }

    // `document_children` and `document_search` cascade from `documents`; the
    // collaboration tables carry no foreign key, so they are cleared explicitly.
    // Receipts and `mutation_guard` rows are KEPT: they are the idempotency and
    // audit record of what happened, and deleting them would let a replayed
    // command re-create the document as if new.
    await this.writer.batch([
      this.writer.prepare(`DELETE FROM versions WHERE tenant_id=?1 AND doc_key=?2`).bind(tenantId, key),
      this.writer.prepare(`DELETE FROM document_comments WHERE tenant_id=?1 AND doctype=?2 AND name=?3`).bind(tenantId, doctype, name),
      this.writer.prepare(`DELETE FROM assignments WHERE tenant_id=?1 AND doctype=?2 AND name=?3`).bind(tenantId, doctype, name),
      this.writer.prepare(`DELETE FROM document_shares WHERE tenant_id=?1 AND doctype=?2 AND name=?3`).bind(tenantId, doctype, name),
      this.writer.prepare(`DELETE FROM document_tags WHERE tenant_id=?1 AND doctype=?2 AND name=?3`).bind(tenantId, doctype, name),
      this.writer.prepare(`UPDATE files SET attached_to_doctype=NULL, attached_to_name=NULL
                           WHERE tenant_id=?1 AND attached_to_doctype=?2 AND attached_to_name=?3`).bind(tenantId, doctype, name),
      this.writer.prepare(
        options.allowNonDraft
          ? `DELETE FROM documents WHERE tenant_id=?1 AND doc_key=?2`
          : `DELETE FROM documents WHERE tenant_id=?1 AND doc_key=?2 AND docstatus=0`,
      ).bind(tenantId, key),
    ]);
    return true;
  }

  /**
   * Thay mọi tham chiếu tới `oldName` bằng `newName`, khớp NGUYÊN giá trị lá.
   *
   * Đọc–sửa–ghi ở tầng JS thay vì json_set trong SQL: đường dẫn tới một tham chiếu là tuỳ ý
   * và lồng nhiều tầng (`component_rules[].item_code`), viết bằng SQL vừa không đọc được vừa
   * không cách nào chứng minh là quét hết.
   *
   * Lọc `LIKE` chỉ để giảm số dòng phải parse; quyết định thay hay không luôn là phép so
   * nguyên giá trị ở `rewriteLeafMatches`, nên chuỗi con lọt vào đây rồi vẫn không bị đổi.
   */
  private async cascadeReferences(tenantId: string, oldKey: string, oldName: string, newName: string): Promise<void> {
    const like = `%${oldName}%`;
    const writes: D1PreparedStatement[] = [];

    const docs = await this.writer.prepare(
      `SELECT doc_key, payload_json FROM documents WHERE tenant_id=?1 AND doc_key<>?2 AND payload_json LIKE ?3`,
    ).bind(tenantId, oldKey, like).all<{ doc_key: string; payload_json: string }>();
    for (const row of docs.results ?? []) {
      const next = rewriteLeafMatches(JSON.parse(row.payload_json), oldName, newName);
      if (!next.changed) continue;
      writes.push(this.writer.prepare(`UPDATE documents SET payload_json=?3 WHERE tenant_id=?1 AND doc_key=?2`)
        .bind(tenantId, row.doc_key, JSON.stringify(next.value)));
    }

    const kids = await this.writer.prepare(
      `SELECT parent_key, fieldname, row_id, payload_json FROM document_children
       WHERE tenant_id=?1 AND parent_key<>?2 AND payload_json LIKE ?3`,
    ).bind(tenantId, oldKey, like).all<{ parent_key: string; fieldname: string; row_id: string; payload_json: string }>();
    for (const row of kids.results ?? []) {
      const next = rewriteLeafMatches(JSON.parse(row.payload_json), oldName, newName);
      if (!next.changed) continue;
      writes.push(this.writer.prepare(
        `UPDATE document_children SET payload_json=?5
         WHERE tenant_id=?1 AND parent_key=?2 AND fieldname=?3 AND row_id=?4`,
      ).bind(tenantId, row.parent_key, row.fieldname, row.row_id, JSON.stringify(next.value)));
    }

    if (writes.length > 0) await this.writer.batch(writes);
  }

  /**
   * Renames a document, moving its children and collaboration rows with it.
   *
   * Mặc định VẪN từ chối khi còn thứ trỏ vào tên cũ. Lý do ghi từ đầu vẫn đúng nguyên văn:
   * link nằm trong JSON, không có khoá ngoại, nên "thay mọi payload có chứa chuỗi này" sẽ
   * phá cả đoạn văn bản vô can trùng chữ.
   *
   * `cascade` là dạng AN TOÀN của việc đó, và khác ở đúng một điểm: nó thay **nguyên giá trị
   * lá**, không thay chuỗi con. Khác biệt ấy đo được trên dữ liệu thật:
   *   · `TP-CUA` KHÔNG bị đụng khi tồn tại `TP-CUADL1LY` — hai giá trị khác nhau;
   *   · `component_key` là trường ĐA HÌNH, 15 giá trị của nó là khoá vị trí (`LEAF_SHEET`,
   *     `T_BRACKET`, `BOTTOM_SEAL`) chứ không phải mã hàng — so nguyên giá trị nên chúng
   *     không bao giờ khớp, trong khi so theo ngữ nghĩa trường thì hoặc bỏ sót hoặc ăn nhầm.
   *
   * Khoá tận cùng `_name` bị loại khỏi CẢ cascade lẫn guard: đó là nhãn hiển thị, không phải
   * con trỏ. Đổi `item_name` "TẨY NHÔM" thành "VT-TAY-NHOM" là làm giao diện xấu đi chứ không
   * sửa được tham chiếu nào.
   *
   * Bất biến giữ cho cascade không thể bỏ sót: sau khi thay xong, guard vẫn chạy y như cũ và
   * PHẢI đếm được 0. Cascade và guard soi cùng một thứ theo cùng một phép so, nên "cascade
   * xong mà guard vẫn thấy" là ném lỗi chứ không phải ghi bừa.
   */
  async renameDocument(
    tenantId: string,
    doctype: string,
    oldName: string,
    newName: string,
    actor: string,
    now: string,
    namingField?: string,
    options: { cascade?: boolean } = {},
  ): Promise<void> {
    const oldKey = documentKey(doctype, oldName);
    const newKey = documentKey(doctype, newName);

    if (options.cascade) await this.cascadeReferences(tenantId, oldKey, oldName, newName);

    // `json_tree`, KHÔNG phải `json_each`: json_each chỉ liệt kê thành viên TẦNG TRÊN CÙNG, nên một
    // tham chiếu nằm trong mảng con lọt lưới hoàn toàn. Đo trên danh mục Alumdoor 19/08: trong 76 mã
    // hàng mà guard cũ cho qua, 3 mã đang được `Purchase Receipt.items[].item_code` trỏ tới — đổi tên
    // xong là ba dòng phiếu nhập trỏ vào mặt hàng không còn tồn tại, và không có gì báo.
    //
    // Phép so vẫn là so NGUYÊN giá trị lá (`type='text'`), không phải so chuỗi con: một mô tả có chứa
    // mã bên trong không bị tính là tham chiếu. Đổi lại, guard cố ý RỘNG TAY — một trường tên trùng y
    // hệt mã cũng làm nó từ chối. Với thao tác đổi danh tính thì lệch về phía từ chối mới đúng: từ
    // chối nhầm tốn một lần soát tay, cho qua nhầm thì mất tham chiếu mà không ai biết.
    const referenced = await this.writer.prepare(
      `SELECT (SELECT COUNT(*) FROM documents WHERE tenant_id=?1 AND doc_key<>?2
                 AND EXISTS(SELECT 1 FROM json_tree(payload_json) WHERE json_tree.type='text' AND json_tree.value=?3
                   AND (json_tree.key IS NULL OR substr(json_tree.key, -5) <> '_name')))
            + (SELECT COUNT(*) FROM document_children WHERE tenant_id=?1 AND parent_key<>?2
                 AND EXISTS(SELECT 1 FROM json_tree(payload_json) WHERE json_tree.type='text' AND json_tree.value=?3
                   AND (json_tree.key IS NULL OR substr(json_tree.key, -5) <> '_name')))
            + (SELECT COUNT(*) FROM documents WHERE tenant_id=?1 AND doctype=?4 AND amended_from=?3) AS total`,
    ).bind(tenantId, oldKey, oldName, doctype).first<{ total: number }>();
    if (Number(referenced?.total ?? 0) > 0) {
      throw errors.reference("The document is referenced elsewhere and cannot be renamed", { document: oldName });
    }

    await this.writer.batch([
      // `document_children` khoá ngoại theo doc_key và chỉ khai ON DELETE CASCADE — không có
      // ON UPDATE. Đổi doc_key của cha trong khi con còn trỏ tên cũ là vi phạm ngay, mà đổi con
      // trước thì tên mới chưa tồn tại nên cũng vi phạm. Không thứ tự nào đúng, phải hoãn kiểm
      // tra tới lúc commit.
      //
      // Mọi Item đều có dòng con `uom_conversions`, nên trước khi vá thì đường đổi tên coi như
      // chưa từng chạy được lần nào — và lỗi bị bọc thành HTTP 500 "Storage operation failed"
      // nên không log nào chỉ ra nguyên nhân.
      this.writer.prepare('PRAGMA defer_foreign_keys = ON'),
      this.writer.prepare(
        `UPDATE documents
         SET doc_key=?3,
             name=?4,
             modified_at=?5,
             modified_by=?6,
             payload_json=CASE WHEN ?7='' THEN payload_json ELSE json_set(payload_json, ?8, ?4) END
         WHERE tenant_id=?1 AND doc_key=?2`,
      ).bind(tenantId, oldKey, newKey, newName, now, actor, namingField ?? "", namingField ? `$.${namingField}` : "$.__unused"),
      this.writer.prepare(`UPDATE document_children SET parent_key=?3 WHERE tenant_id=?1 AND parent_key=?2`).bind(tenantId, oldKey, newKey),
      this.writer.prepare(`UPDATE versions SET doc_key=?3 WHERE tenant_id=?1 AND doc_key=?2`).bind(tenantId, oldKey, newKey),
      // `document_search` (2.796 dòng) và `document_views` khoá ngoại theo (tenant_id, doctype,
      // name) chứ không theo doc_key, nên chúng KHÔNG tự đi theo khi tên đổi. Lô lệnh cũ cập nhật
      // comments/assignments/shares/tags/files nhưng bỏ sót đúng hai bảng CÓ khoá ngoại.
      this.writer.prepare(`UPDATE document_search SET name=?4 WHERE tenant_id=?1 AND doctype=?2 AND name=?3`).bind(tenantId, doctype, oldName, newName),
      this.writer.prepare(`UPDATE document_views SET name=?4 WHERE tenant_id=?1 AND doctype=?2 AND name=?3`).bind(tenantId, doctype, oldName, newName),
      this.writer.prepare(`UPDATE document_comments SET name=?4 WHERE tenant_id=?1 AND doctype=?2 AND name=?3`).bind(tenantId, doctype, oldName, newName),
      this.writer.prepare(`UPDATE assignments SET name=?4 WHERE tenant_id=?1 AND doctype=?2 AND name=?3`).bind(tenantId, doctype, oldName, newName),
      this.writer.prepare(`UPDATE document_shares SET name=?4 WHERE tenant_id=?1 AND doctype=?2 AND name=?3`).bind(tenantId, doctype, oldName, newName),
      this.writer.prepare(`UPDATE document_tags SET name=?4 WHERE tenant_id=?1 AND doctype=?2 AND name=?3`).bind(tenantId, doctype, oldName, newName),
      this.writer.prepare(`UPDATE files SET attached_to_name=?4 WHERE tenant_id=?1 AND attached_to_doctype=?2 AND attached_to_name=?3`).bind(tenantId, doctype, oldName, newName),
    ]);
  }

  async hasMasterRecord(tenantId: string, recordType: string, name: string): Promise<boolean> {
    const row = await this.writer.prepare(
      `SELECT 1 AS found FROM documents WHERE tenant_id=?1 AND doctype=?2 AND name=?3
         AND docstatus<>2 AND COALESCE(CAST(json_extract(payload_json,'$.disabled') AS INTEGER),0)=0
       UNION ALL
       SELECT 1 AS found FROM master_records WHERE tenant_id=?1 AND record_type=?2 AND name=?3 AND disabled=0
         AND NOT EXISTS (
           SELECT 1 FROM documents WHERE tenant_id=?1 AND doctype=?2 AND name=?3
         )
       UNION ALL SELECT 1 AS found FROM roles WHERE ?2='Role' AND tenant_id=?1 AND role=?3 AND disabled=0
       UNION ALL SELECT 1 AS found FROM users WHERE ?2='User' AND tenant_id=?1 AND user_id=?3 AND enabled=1
       UNION ALL SELECT 1 AS found FROM doctype_definitions WHERE ?2='DocType' AND tenant_id=?1 AND doctype=?3 AND disabled=0
       LIMIT 1`,
    ).bind(tenantId, recordType, name).first<{ found: number }>();
    return Boolean(row);
  }

  /**
   * Lists master records of a type, for pickers and context selectors.
   *
   * Disabled records are excluded: offering one would let a user select a value the
   * business logic then refuses, with no explanation at the point of choice.
   * `label` prefers a human name from the payload and falls back to the id, so a
   * record without one still shows something selectable.
   */
  /**
   * Master data for a picker — from `master_records` AND from documents of that doctype.
   *
   * The UNION is not an optimisation, it is the whole correctness of this method. Its two
   * siblings (`getMasterRecordData`, `listMasterRecordData`) already read both, and this
   * one read only the first — so a record was resolvable by name and usable by the pricing
   * and stock kernels, yet invisible in every selector built from it.
   *
   * What that looked like in practice: an app declares `Warehouse` as a DocType (the normal
   * way — users need to create warehouses), forty-five warehouses exist, and the global
   * warehouse scope selector reports itself `enabled: false` with an empty list. The app
   * then blocks on "choose a scope" for a selector that can never be populated. Nothing is
   * logged, because nothing failed.
   */
  async listMasterRecords(tenantId: string, recordType: string, limit = 200): Promise<Array<{ name: string; label: string }>> {
    const bounded = Math.min(Math.max(limit, 1), 500);
    const result = await this.writer.prepare(
      `SELECT name, data_json FROM (
         SELECT name, data_json,
                ROW_NUMBER() OVER (PARTITION BY name ORDER BY source_rank) AS row_rank
         FROM (
           SELECT name, payload_json AS data_json, 0 AS source_rank FROM documents
             WHERE tenant_id=?1 AND doctype=?2 AND docstatus<>2
               AND COALESCE(CAST(json_extract(payload_json,'$.disabled') AS INTEGER),0)=0
           UNION ALL
           SELECT name, data_json, 1 AS source_rank FROM master_records
             WHERE tenant_id=?1 AND record_type=?2 AND disabled=0
               AND NOT EXISTS (
                 SELECT 1 FROM documents d
                 WHERE d.tenant_id=?1 AND d.doctype=?2 AND d.name=master_records.name
               )
           UNION ALL
           SELECT role AS name,json_object('role',role,'label',role) AS data_json,0 AS source_rank
             FROM roles WHERE ?2='Role' AND tenant_id=?1 AND disabled=0
           UNION ALL
           SELECT user_id AS name,json_object('user_id',user_id,'full_name',full_name,'email',email) AS data_json,0 AS source_rank
             FROM users WHERE ?2='User' AND tenant_id=?1 AND enabled=1
           UNION ALL
           SELECT doctype AS name,metadata_json AS data_json,0 AS source_rank
             FROM doctype_definitions WHERE ?2='DocType' AND tenant_id=?1 AND disabled=0
         )
       ) WHERE row_rank=1 ORDER BY name LIMIT ?3`,
    ).bind(tenantId, recordType, bounded).all<{ name: string; data_json: string }>();
    return (result.results ?? []).map((row) => {
      let label = row.name;
      try {
        const data = JSON.parse(row.data_json) as JsonObject;
        for (const key of ["title", "label", "full_name", `${recordType.toLowerCase().replace(/ /g, "_")}_name`]) {
          const candidate = data[key];
          if (typeof candidate === "string" && candidate.trim()) { label = candidate.trim(); break; }
        }
      } catch {
        // A corrupt payload must not hide the record from a picker.
      }
      return { name: row.name, label };
    });
  }

  async getMasterRecordData(tenantId: string, recordType: string, name: string): Promise<JsonObject | null> {
    const row = await this.writer.prepare(
      `SELECT payload_json AS data_json FROM documents WHERE tenant_id=?1 AND doctype=?2 AND name=?3
         AND docstatus<>2 AND COALESCE(CAST(json_extract(payload_json,'$.disabled') AS INTEGER),0)=0
       UNION ALL
       SELECT data_json FROM master_records WHERE tenant_id=?1 AND record_type=?2 AND name=?3 AND disabled=0
         AND NOT EXISTS (
           SELECT 1 FROM documents WHERE tenant_id=?1 AND doctype=?2 AND name=?3
         )
       UNION ALL SELECT json_object('role',role,'label',role) AS data_json FROM roles
         WHERE ?2='Role' AND tenant_id=?1 AND role=?3 AND disabled=0
       UNION ALL SELECT json_object('user_id',user_id,'full_name',full_name,'email',email) AS data_json FROM users
         WHERE ?2='User' AND tenant_id=?1 AND user_id=?3 AND enabled=1
       UNION ALL SELECT metadata_json AS data_json FROM doctype_definitions
         WHERE ?2='DocType' AND tenant_id=?1 AND doctype=?3 AND disabled=0
       LIMIT 1`,
    ).bind(tenantId, recordType, name).first<{ data_json: string }>();
    if (!row) return null;
    try {
      const parsed = JSON.parse(row.data_json) as unknown;
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as JsonObject : {};
    } catch {
      throw errors.database("Master record data is invalid JSON");
    }
  }


  async listMasterRecordData(tenantId: string, recordType: string): Promise<Array<{ name: string; data: JsonObject }>> {
    const rows = await this.writer.prepare(
      `SELECT name,data_json FROM (
         SELECT name,data_json,
                ROW_NUMBER() OVER (PARTITION BY name ORDER BY source_rank) AS row_rank
         FROM (
           SELECT name,payload_json AS data_json,0 AS source_rank FROM documents
             WHERE tenant_id=?1 AND doctype=?2 AND docstatus<>2
               AND COALESCE(CAST(json_extract(payload_json,'$.disabled') AS INTEGER),0)=0
           UNION ALL
           SELECT name,data_json,1 AS source_rank FROM master_records
             WHERE tenant_id=?1 AND record_type=?2 AND disabled=0
               AND NOT EXISTS (
                 SELECT 1 FROM documents d
                 WHERE d.tenant_id=?1 AND d.doctype=?2 AND d.name=master_records.name
               )
           UNION ALL SELECT role AS name,json_object('role',role,'label',role) AS data_json,0 AS source_rank FROM roles
             WHERE ?2='Role' AND tenant_id=?1 AND disabled=0
           UNION ALL SELECT user_id AS name,json_object('user_id',user_id,'full_name',full_name,'email',email) AS data_json,0 AS source_rank FROM users
             WHERE ?2='User' AND tenant_id=?1 AND enabled=1
           UNION ALL SELECT doctype AS name,metadata_json AS data_json,0 AS source_rank FROM doctype_definitions
             WHERE ?2='DocType' AND tenant_id=?1 AND disabled=0
         )
       ) WHERE row_rank=1 ORDER BY name`,
    ).bind(tenantId,recordType).all<{name:string;data_json:string}>();
    return (rows.results??[]).map((row)=>{try{const parsed=JSON.parse(row.data_json) as unknown;return{name:row.name,data:parsed&&typeof parsed==="object"&&!Array.isArray(parsed)?parsed as JsonObject:{}};}catch{throw errors.database("Master record data is invalid JSON");}});
  }
  async getPeriodLockDate(tenantId: string, company: string): Promise<string | null> {
    const row = await this.writer.prepare(
      `SELECT lock_date FROM accounting_period_locks WHERE tenant_id=?1 AND company=?2`,
    ).bind(tenantId, company).first<{ lock_date: string }>();
    return row?.lock_date ?? null;
  }

  async setAccountingPeriodLock(
    tenantId: string,
    company: string,
    lockDate: string,
    actor: string,
    reason: string,
    occurredAt: string,
  ): Promise<{ company: string; lock_date: string | null }> {
    const action = lockDate ? "Lock" : "Unlock";
    await this.db.batch([
      this.db.prepare(
        `INSERT INTO accounting_period_locks(tenant_id,company,lock_date,modified_at,modified_by,reason)
         VALUES(?1,?2,?3,?4,?5,?6)
         ON CONFLICT(tenant_id,company) DO UPDATE SET
           lock_date=excluded.lock_date,modified_at=excluded.modified_at,
           modified_by=excluded.modified_by,reason=excluded.reason`,
      ).bind(tenantId, company, lockDate, occurredAt, actor, reason),
      this.db.prepare(
        `INSERT INTO accounting_period_lock_events(
           tenant_id,event_id,company,action,lock_date,reason,actor,occurred_at
         ) VALUES(?1,?2,?3,?4,?5,?6,?7,?8)`,
      ).bind(tenantId, crypto.randomUUID(), company, action, lockDate, reason, actor, occurredAt),
    ]);
    return { company, lock_date: lockDate || null };
  }

  async execute<T extends JsonObject>(plan: MutationPlan<T>): Promise<MutationReceipt> {
    const [receipt] = await this.executeBundle([plan]);
    return receipt!;
  }

  async executeBundle(plans: readonly MutationPlan[]): Promise<MutationReceipt[]> {
    this.assertBundlePlans(plans);
    const replayed = await this.resolveBundleReceipts(plans);
    if (replayed) return replayed;

    // `D1Database.batch` runs its statements in order.  Carry the previous
    // planned child set forward so create -> submit on one aggregate produces
    // the same child-row replacement semantics as two separate commits, while
    // still emitting only one atomic batch.
    const previousChildren = new Map<string, readonly ChildRow[]>();
    const executions: Array<{ statements: D1PreparedStatement[]; receipt: MutationReceipt }> = [];
    for (const plan of plans) {
      const key = documentKey(plan.command.aggregate.doctype, plan.command.aggregate.name);
      const execution = await this.buildExecution(plan, previousChildren.get(key));
      previousChildren.set(key, plan.document.children);
      executions.push(execution);
    }

    const database = this.writer;
    try {
      await database.batch(executions.flatMap((execution) => execution.statements));
      const bookmark = typeof (database as D1DatabaseSession).getBookmark === "function"
        ? (database as D1DatabaseSession).getBookmark()
        : null;
      return executions.map(({ receipt }) => ({ ...receipt, ...(bookmark ? { bookmark } : {}) }));
    } catch (error) {
      const committed = await this.resolveBundleReceipts(plans);
      if (committed) return committed;
      throw asCloudForgeError(error);
    }
  }

  private async buildExecution<T extends JsonObject>(
    plan: MutationPlan<T>,
    existingChildrenOverride?: readonly ChildRow[],
  ): Promise<{ statements: D1PreparedStatement[]; receipt: MutationReceipt }> {
    const command = plan.command;
    const key = documentKey(command.aggregate.doctype, command.aggregate.name);
    const database = this.writer;
    const statements: D1PreparedStatement[] = [];
    statements.push(database.prepare(
      `INSERT INTO mutation_guard
       (tenant_id, command_id, doc_key, expected_version, action, payload_hash, created_at, allow_submitted_save)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`,
    ).bind(
      command.tenant_id, command.command_id, key, command.expected_version, command.action,
      command.payload_hash, plan.document.modified_at, plan.allow_submitted_save ? 1 : 0,
    ));

    if (command.expected_version === null) {
      statements.push(database.prepare(
        `INSERT INTO documents
         (tenant_id, doc_key, doctype, name, owner, docstatus, status, version, created_at, modified_at,
          modified_by, amended_from, payload_json)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)`,
      ).bind(
        command.tenant_id, key, plan.document.doctype, plan.document.name, plan.document.owner,
        plan.document.docstatus, plan.document.status, plan.document.version, plan.document.created_at,
        plan.document.modified_at,
        // Attribution comes from the authenticated actor on the command, never
        // from the controller output — a controller cannot credit the change to
        // someone else, and cannot omit it.
        command.actor.user_id,
        // The command is authoritative: a controller cannot forge a chain link
        // and cannot drop one the framework established.
        command.amended_from ?? plan.document.amended_from ?? null,
        JSON.stringify(plan.document.data),
      ));
    } else {
      statements.push(database.prepare(
        `UPDATE documents SET owner=?3, docstatus=?4, status=?5, version=?6, modified_at=?7, payload_json=?8,
                              modified_by=?10
         WHERE tenant_id=?1 AND doc_key=?2 AND version=?9`,
      ).bind(
        command.tenant_id, key, plan.document.owner, plan.document.docstatus, plan.document.status,
        plan.document.version, plan.document.modified_at, JSON.stringify(plan.document.data), command.expected_version,
        command.actor.user_id,
      ));
    }

    // Search index, refreshed in the SAME batch as the document.
    //
    // Indexing separately would let the two diverge on any partial failure, and a
    // stale index is worse than none: it surfaces titles for content that no
    // longer matches, and search results the permission layer then has to reject.
    // A cancelled document is removed from the index rather than reindexed — it is
    // history, and offering it in search invites acting on a void voucher.
    if (plan.document.docstatus === 2) {
      statements.push(database.prepare(
        `DELETE FROM document_search WHERE tenant_id=?1 AND doctype=?2 AND name=?3`,
      ).bind(command.tenant_id, plan.document.doctype, plan.document.name));
    } else {
      statements.push(database.prepare(
        `INSERT INTO document_search(tenant_id,doctype,name,title,content,modified_at) VALUES(?1,?2,?3,?4,?5,?6)
         ON CONFLICT(tenant_id,doctype,name) DO UPDATE SET
           title=excluded.title, content=excluded.content, modified_at=excluded.modified_at`,
      ).bind(
        command.tenant_id, plan.document.doctype, plan.document.name,
        plan.document.name.slice(0, 320),
        searchableContent(plan.document.data),
        plan.document.modified_at,
      ));
    }

    const existingChildren = existingChildrenOverride ?? (await database.prepare(
      `SELECT fieldname, row_id FROM document_children WHERE tenant_id=?1 AND parent_key=?2`,
    ).bind(command.tenant_id, key).all<{ fieldname: string; row_id: string }>()).results ?? [];
    const desiredChildKeys = new Set(plan.document.children.map((child) => `${child.fieldname}:${child.row_id}`));
    for (const child of existingChildren) {
      if (desiredChildKeys.has(`${child.fieldname}:${child.row_id}`)) continue;
      statements.push(database.prepare(
        `DELETE FROM document_children WHERE tenant_id=?1 AND parent_key=?2 AND fieldname=?3 AND row_id=?4`,
      ).bind(command.tenant_id, key, child.fieldname, child.row_id));
    }
    for (const child of plan.document.children) {
      statements.push(database.prepare(
        `INSERT INTO document_children
         (tenant_id, parent_key, fieldname, child_doctype, row_id, idx, payload_json)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
         ON CONFLICT(tenant_id, parent_key, fieldname, row_id) DO UPDATE SET
           child_doctype=excluded.child_doctype, idx=excluded.idx, payload_json=excluded.payload_json`,
      ).bind(command.tenant_id, key, child.fieldname, child.child_doctype, child.row_id, child.idx, JSON.stringify(child.data)));
    }

    statements.push(database.prepare(
      `INSERT INTO versions(tenant_id,doc_key,version,command_id,actor,action,snapshot_json,created_at)
       VALUES(?1,?2,?3,?4,?5,?6,?7,?8)`,
    ).bind(
      command.tenant_id, key, plan.document.version, command.command_id, command.actor.user_id,
      command.action, JSON.stringify(plan.document), plan.document.modified_at,
    ));

    for (const line of plan.gl_entries) {
      statements.push(database.prepare(
        `INSERT INTO gl_entries
         (tenant_id,voucher_type,voucher_no,voucher_revision,line_key,account,party_type,party,debit_minor,credit_minor,currency,currency_scale,cost_center,dimensions_json,remarks,posting_at)
         VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16)`,
      ).bind(
        command.tenant_id, command.aggregate.doctype, command.aggregate.name, plan.document.version,
        line.line_key, line.account, line.party_type ?? null, line.party ?? null, line.debit_minor,
        line.credit_minor, line.currency, line.currency_scale, line.cost_center ?? null,
        JSON.stringify(line.accounting_dimensions ?? {}), line.remarks ?? null, line.posting_at,
      ));
    }
    for (const line of plan.stock_entries) {
      statements.push(database.prepare(
        `INSERT INTO stock_ledger_entries
         (tenant_id,voucher_type,voucher_no,voucher_revision,line_key,source_row_id,
          valuation_target_voucher_type,valuation_target_voucher_no,valuation_target_voucher_revision,valuation_target_row_id,
          item_code,warehouse,actual_qty_micros,actual_weight_micros,valuation_rate_minor,stock_value_difference_minor,qty_scale,currency_scale,currency,posting_at,batch_no,serial_no,allow_negative_stock)
         VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19,?20,?21,?22,?23)`,
      ).bind(
        command.tenant_id, command.aggregate.doctype, command.aggregate.name, plan.document.version,
        line.line_key, line.source_row_id ?? null,
        line.valuation_target_voucher_type ?? null, line.valuation_target_voucher_no ?? null,
        line.valuation_target_voucher_revision ?? null, line.valuation_target_row_id ?? null,
        line.item_code, line.warehouse, line.actual_qty_micros,
        // `?? null` chứ KHÔNG `?? 0`: cột này rỗng nghĩa là không cân theo kiện, còn 0 nghĩa
        // là đã cân và được 0. Gộp hai thứ đó lại là mất luôn khả năng phân biệt.
        line.actual_weight_micros ?? null,
        line.valuation_rate_minor,
        line.stock_value_difference_minor, line.qty_scale, line.currency_scale, line.currency,
        line.posting_at, line.batch_no ?? null, line.serial_no ?? null, line.allow_negative_stock ? 1 : 0,
      ));
    }
    for (const line of plan.fulfillment_entries) {
      if (!line.skip_legacy_projection) {
        statements.push(database.prepare(
          `INSERT INTO sales_order_fulfillment_entries
           (tenant_id,voucher_type,voucher_no,voucher_revision,line_key,sales_order,kind,item_code,qty_micros,posting_at)
           VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)`,
        ).bind(
          command.tenant_id, command.aggregate.doctype, command.aggregate.name, plan.document.version,
          line.line_key, line.sales_order, line.kind, line.item_code, line.qty_micros, line.posting_at,
        ));
      }
      if (line.sales_order_line_key) {
        statements.push(database.prepare(
          `INSERT INTO sales_line_fulfillment_entries
           (tenant_id,line_key,sales_order,sales_order_line_key,kind,package_component_key,item_code,qty_micros,posting_at)
           VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9)`,
        ).bind(
          command.tenant_id, line.line_key, line.sales_order, line.sales_order_line_key, line.kind,
          line.package_component_key ?? "", line.item_code, line.qty_micros, line.posting_at,
        ));
      }
    }
    for (const line of plan.procurement_entries ?? []) {
      statements.push(database.prepare(
        `INSERT INTO purchase_order_progress_entries
         (tenant_id,voucher_type,voucher_no,voucher_revision,line_key,purchase_order,purchase_order_item_row_id,kind,item_code,qty_micros,posting_at)
         VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)`,
      ).bind(
        command.tenant_id, command.aggregate.doctype, command.aggregate.name, plan.document.version,
        line.line_key, line.purchase_order, line.purchase_order_item_row_id ?? null,
        line.kind, line.item_code, line.qty_micros, line.posting_at,
      ));
    }
    for (const line of plan.stock_bundle_usages ?? []) {
      statements.push(database.prepare(
        `INSERT INTO stock_bundle_usage_entries
         (tenant_id,voucher_type,voucher_no,voucher_revision,line_key,bundle_name,item_code,warehouse,direction,usage_delta,posting_at)
         VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)`,
      ).bind(command.tenant_id,command.aggregate.doctype,command.aggregate.name,plan.document.version,line.line_key,line.bundle_name,line.item_code,line.warehouse,line.direction,line.usage_delta,line.posting_at));
    }
    for (const line of plan.return_entries ?? []) {
      statements.push(database.prepare(
        `INSERT INTO return_progress_entries
         (tenant_id,voucher_type,voucher_no,voucher_revision,line_key,reference_doctype,reference_name,kind,item_code,qty_micros,posting_at)
         VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)`,
      ).bind(command.tenant_id,command.aggregate.doctype,command.aggregate.name,plan.document.version,line.line_key,line.reference_doctype,line.reference_name,line.kind,line.item_code,line.qty_micros,line.posting_at));
    }
    for (const line of plan.manufacturing_entries ?? []) {
      statements.push(database.prepare(
        `INSERT INTO manufacturing_progress_entries
         (tenant_id,voucher_type,voucher_no,voucher_revision,line_key,work_order,kind,item_code,qty_micros,posting_at)
         VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)`,
      ).bind(command.tenant_id,command.aggregate.doctype,command.aggregate.name,plan.document.version,line.line_key,line.work_order,line.kind,line.item_code,line.qty_micros,line.posting_at));
    }
    for (const line of plan.asset_depreciation_entries ?? []) {
      statements.push(database.prepare(
        `INSERT INTO asset_depreciation_entries
         (tenant_id,voucher_type,voucher_no,voucher_revision,line_key,asset,amount_minor,currency,currency_scale,posting_at)
         VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)`,
      ).bind(command.tenant_id,command.aggregate.doctype,command.aggregate.name,plan.document.version,line.line_key,line.asset,line.amount_minor,line.currency,line.currency_scale,line.posting_at));
    }
    for (const line of plan.asset_lifecycle_entries ?? []) {
      statements.push(database.prepare(
        `INSERT INTO asset_lifecycle_entries
         (tenant_id,voucher_type,voucher_no,voucher_revision,line_key,asset,kind,posting_at,location,custodian,amount_minor,currency,currency_scale)
         VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13)`,
      ).bind(command.tenant_id,command.aggregate.doctype,command.aggregate.name,plan.document.version,line.line_key,line.asset,line.kind,line.posting_at,line.location??null,line.custodian??null,line.amount_minor??0,line.currency??null,line.currency_scale??null));
    }
    for (const line of plan.project_time_entries ?? []) {
      statements.push(database.prepare(
        `INSERT INTO project_time_entries
         (tenant_id,voucher_type,voucher_no,voucher_revision,line_key,project,task,hours_micros,cost_minor,billing_minor,currency,currency_scale,posting_at)
         VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13)`,
      ).bind(command.tenant_id,command.aggregate.doctype,command.aggregate.name,plan.document.version,line.line_key,line.project,line.task??null,line.hours_micros,line.cost_minor,line.billing_minor,line.currency,line.currency_scale,line.posting_at));
    }
    for (const line of plan.pos_sales_entries ?? []) {
      statements.push(database.prepare(
        `INSERT INTO pos_sales_entries
         (tenant_id,voucher_type,voucher_no,voucher_revision,line_key,pos_profile,opening_entry,invoice,net_total_minor,tax_total_minor,grand_total_minor,currency,currency_scale,posting_at)
         VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14)`,
      ).bind(command.tenant_id,command.aggregate.doctype,command.aggregate.name,plan.document.version,line.line_key,line.pos_profile,line.opening_entry,line.invoice,line.net_total_minor,line.tax_total_minor,line.grand_total_minor,line.currency,line.currency_scale,line.posting_at));
    }

    for (const line of plan.bank_reconciliation_entries ?? []) {
      statements.push(database.prepare(
        `INSERT INTO bank_reconciliation_entries
         (tenant_id,voucher_type,voucher_no,voucher_revision,line_key,bank_account,bank_transaction,against_voucher_type,against_voucher_no,amount_minor,currency,currency_scale,posting_at)
         VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13)`,
      ).bind(command.tenant_id,command.aggregate.doctype,command.aggregate.name,plan.document.version,line.line_key,line.bank_account,line.bank_transaction,line.voucher_type,line.voucher_no,line.amount_minor,line.currency,line.currency_scale,line.posting_at));
    }

    for (const line of plan.payment_entries) {
      statements.push(database.prepare(
        `INSERT INTO payment_ledger_entries
         (tenant_id,voucher_type,voucher_no,voucher_revision,line_key,account_type,party_type,party,account,amount_minor,base_amount_minor,currency,currency_scale,against_voucher_type,against_voucher_no,posting_at)
         VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16)`,
      ).bind(
        command.tenant_id, command.aggregate.doctype, command.aggregate.name, plan.document.version,
        line.line_key, line.account_type, line.party_type, line.party, line.account, line.amount_minor,
        line.base_amount_minor, line.currency, line.currency_scale, line.against_voucher_type ?? null, line.against_voucher_no ?? null,
        line.posting_at,
      ));
    }
    for (const event of plan.events) {
      statements.push(database.prepare(
        `INSERT INTO outbox
         (tenant_id,event_id,event_type,aggregate_key,aggregate_version,command_id,payload_json,occurred_at,status,attempts)
         VALUES(?1,?2,?3,?4,?5,?6,?7,?8,'pending',0)`,
      ).bind(
        command.tenant_id, event.event_id, event.event_type, key, event.aggregate_version,
        command.command_id, JSON.stringify(event), event.occurred_at,
      ));
    }

    const receipt: MutationReceipt = {
      command_id: command.command_id,
      tenant_id: command.tenant_id,
      actor_user_id: command.actor.user_id,
      aggregate: command.aggregate,
      aggregate_version: plan.document.version,
      payload_hash: command.payload_hash,
      committed_at: plan.document.modified_at,
      result: plan.result,
    };
    statements.push(database.prepare(
      `INSERT INTO mutation_receipts
       (tenant_id,command_id,actor_user_id,doctype,name,aggregate_version,payload_hash,committed_at,result_json)
       VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9)`,
    ).bind(
      receipt.tenant_id, receipt.command_id, receipt.actor_user_id, receipt.aggregate.doctype, receipt.aggregate.name,
      receipt.aggregate_version, receipt.payload_hash, receipt.committed_at, JSON.stringify(receipt.result),
    ));
    statements.push(database.prepare("DELETE FROM mutation_guard WHERE tenant_id=?1 AND command_id=?2")
      .bind(command.tenant_id, command.command_id));

    return { statements, receipt };
  }

  private assertBundlePlans(plans: readonly MutationPlan[]): void {
    if (!Array.isArray(plans) || plans.length === 0) {
      throw errors.validation("Mutation bundle must contain at least one plan");
    }
    const tenantId = plans[0]!.command.tenant_id;
    const commandIds = new Set<string>();
    for (const plan of plans) {
      const command = plan.command;
      if (command.tenant_id !== tenantId) throw errors.validation("Mutation bundle plans must belong to one tenant");
      if (commandIds.has(command.command_id)) throw errors.validation("Mutation bundle command_id values must be unique");
      commandIds.add(command.command_id);
    }
  }

  private async resolveBundleReceipts(plans: readonly MutationPlan[]): Promise<MutationReceipt[] | null> {
    const receipts = await Promise.all(plans.map((plan) => this.getReceipt(plan.command.tenant_id, plan.command.command_id)));
    const committedCount = receipts.filter((receipt) => receipt !== null).length;
    if (committedCount === 0) return null;
    for (let index = 0; index < plans.length; index += 1) {
      const receipt = receipts[index];
      if (!receipt) continue;
      const command = plans[index]!.command;
      if (receipt.payload_hash !== command.payload_hash || receipt.actor_user_id !== command.actor.user_id) {
        throw errors.idempotency();
      }
    }
    if (committedCount !== plans.length) {
      throw errors.validation("Mutation bundle has an incomplete receipt set; it cannot be replayed safely");
    }
    return receipts as MutationReceipt[];
  }

  private async hydrateDerived<T extends JsonObject>(document: CanonicalDocument<T>): Promise<void> {
    if (document.doctype === "Sales Invoice" || document.doctype === "Purchase Invoice") {
      const scale = typeof document.data.currency_scale === "number" ? document.data.currency_scale : 2;
      const outstanding = await this.getOutstandingMinor(document.tenant_id, document.doctype, document.name);
      const data = document.data as JsonObject;
      data.outstanding_amount_minor = outstanding;
      data.outstanding_amount = fromScaledInt(outstanding, scale);
      if (document.docstatus === 1) {
        const grand = typeof data.grand_total_minor === "number"
          ? data.grand_total_minor : toScaledInt(String(data.grand_total ?? "0"), scale);
        document.status = deriveO2CStatus(document.doctype, document.docstatus,
          { outstandingMinor: outstanding, grandTotalMinor: grand });
      }
    }
    if (document.doctype === "Salary Slip") {
      const data = document.data as JsonObject;
      const scale = typeof data.currency_scale === "number" ? data.currency_scale : 2;
      const outstanding = await this.getOutstandingMinor(document.tenant_id, "Salary Slip", document.name);
      const net = typeof data.net_pay_minor === "number" ? data.net_pay_minor : toScaledInt(String(data.net_pay ?? 0), scale);
      data.outstanding_amount_minor = outstanding;
      data.outstanding_amount = fromScaledInt(outstanding, scale);
      if (document.docstatus === 1) document.status = outstanding <= 0 ? "Paid" : outstanding < net ? "Partly Paid" : "Unpaid";
    }
    if (document.doctype === "Bank Transaction") {
      const data = document.data as JsonObject;
      const scale = typeof data.currency_scale === "number" ? data.currency_scale : 2;
      const amount = Math.abs(typeof data.amount_minor === "number" ? data.amount_minor : toScaledInt(String(data.amount ?? 0), scale));
      const reconciled = await this.getBankReconciledMinor(document.tenant_id, document.name);
      data.reconciled_amount_minor = reconciled;
      data.reconciled_amount = fromScaledInt(reconciled, scale);
      data.unreconciled_amount_minor = Math.max(0, amount - reconciled);
      data.unreconciled_amount = fromScaledInt(Math.max(0, amount - reconciled), scale);
      if (document.docstatus === 1) document.status = reconciled <= 0 ? "Unreconciled" : reconciled >= amount ? "Reconciled" : "Partly Reconciled";
    }
    if (document.doctype === "Delivery Note" && document.docstatus === 1) {
      document.status = deriveDeliveryNoteStatus(
        document.docstatus,
        typeof document.data.issue_purpose === "string" ? document.data.issue_purpose : undefined,
      );
    }
    if (document.doctype === "Purchase Order") {
      const items = Array.isArray(document.data.items) ? document.data.items : [];
      let ordered = 0; let received = 0; let billed = 0;
      for (const value of items) {
        if (!value || typeof value !== "object" || Array.isArray(value)) continue;
        const item = value as JsonObject; const itemCode = String(item.item_code ?? "");
        ordered += typeof item.qty_micros === "number" ? item.qty_micros : toScaledInt(String(item.qty ?? 0), 6);
        received += await this.getProcuredQuantityMicros(document.tenant_id, document.name, "Receipt", itemCode);
        billed += await this.getProcuredQuantityMicros(document.tenant_id, document.name, "Billing", itemCode);
      }
      if (ordered > 0) {
        const receivedPercentage = (received * 100) / ordered; const billedPercentage = (billed * 100) / ordered;
        const data = document.data as JsonObject; data.received_percentage = receivedPercentage.toFixed(2); data.billed_percentage = billedPercentage.toFixed(2);
        if (document.docstatus === 1) document.status = deriveO2CStatus("Purchase Order", document.docstatus, { receivedPercentage, billedPercentage });
      }
    }
    if (document.doctype === "Work Order") {
      const data = document.data as JsonObject;
      const target = typeof data.qty_micros === "number" ? data.qty_micros : toScaledInt(String(data.qty ?? 0), 6);
      const item = typeof data.production_item === "string" ? data.production_item : "";
      const produced = item ? await this.getManufacturedQuantityMicros(document.tenant_id, document.name, "Manufacture", item) : 0;
      data.produced_qty_micros = produced;
      data.produced_qty = fromScaledInt(produced, 6);
      data.produced_percentage = target > 0 ? ((produced * 100) / target).toFixed(2) : "0.00";
      if (document.docstatus === 1) document.status = produced <= 0 ? "Not Started" : produced >= target ? "Completed" : "In Process";
    }
    if (document.doctype === "Asset") {
      const data = document.data as JsonObject;
      const scale = typeof data.currency_scale === "number" ? data.currency_scale : 2;
      const gross = typeof data.gross_purchase_amount_minor === "number" ? data.gross_purchase_amount_minor : toScaledInt(String(data.gross_purchase_amount ?? 0), scale);
      const salvage = typeof data.salvage_value_minor === "number" ? data.salvage_value_minor : toScaledInt(String(data.salvage_value ?? 0), scale);
      const depreciated = await this.getAssetDepreciatedMinor(document.tenant_id, document.name);
      data.accumulated_depreciation_minor = depreciated;
      data.accumulated_depreciation = fromScaledInt(depreciated, scale);
      data.net_book_value_minor = gross - depreciated;
      data.net_book_value = fromScaledInt(gross - depreciated, scale);
      const disposed = await this.getAssetDisposalMinor(document.tenant_id, document.name);
      const isDisposed = await this.isAssetDisposed(document.tenant_id, document.name);
      data.disposal_proceeds_minor = disposed;
      data.disposal_proceeds = fromScaledInt(disposed, scale);
      if (document.docstatus === 1) document.status = isDisposed ? "Disposed" : depreciated >= gross - salvage ? "Fully Depreciated" : "Active";
    }
    if (document.doctype === "Project") {
      const data = document.data as JsonObject;
      const summary = await this.getProjectTimeSummary(document.tenant_id, document.name);
      data.actual_hours_micros = summary.hours_micros;
      data.actual_hours = fromScaledInt(summary.hours_micros, 6);
      data.actual_cost_minor = summary.cost_minor;
      data.actual_billing_minor = summary.billing_minor;
    }
    if (document.doctype === "Sales Order") {
      const items = Array.isArray(document.data.items) ? document.data.items : [];
      const progress = await deriveSalesOrderProgress(items, {
        getLine: (kind, rowKey, componentKey) => this.getFulfilledLineQuantityMicros(
          document.tenant_id, document.name, kind, rowKey, componentKey,
        ),
        getLegacy: (kind, itemCode) => this.getFulfilledQuantityMicros(
          document.tenant_id, document.name, kind, itemCode,
        ),
      });
      if (progress.ordered_micros > 0) {
        const data = document.data as JsonObject;
        data.delivered_percentage = progress.delivered_percentage.toFixed(2);
        data.billed_percentage = progress.billed_percentage.toFixed(2);
        if (document.docstatus === 1) {
          document.status = deriveO2CStatus("Sales Order", document.docstatus, {
            deliveredPercentage: progress.delivered_percentage,
            billedPercentage: progress.billed_percentage,
          });
        }
      }
    }
  }
}

function mapStockLedgerRow(row: Record<string, unknown>): StockLedgerEntry {
  return {
    line_key: String(row.line_key), item_code: String(row.item_code), warehouse: String(row.warehouse),
    ...(row.voucher_type != null ? { source_voucher_type: String(row.voucher_type) } : {}),
    ...(row.voucher_no != null ? { source_voucher_no: String(row.voucher_no) } : {}),
    ...(row.voucher_revision != null ? { source_voucher_revision: Number(row.voucher_revision) } : {}),
    ...(row.source_row_id != null ? { source_row_id: String(row.source_row_id) } : {}),
    ...(row.valuation_target_voucher_type != null ? { valuation_target_voucher_type: String(row.valuation_target_voucher_type) } : {}),
    ...(row.valuation_target_voucher_no != null ? { valuation_target_voucher_no: String(row.valuation_target_voucher_no) } : {}),
    ...(row.valuation_target_voucher_revision != null ? { valuation_target_voucher_revision: Number(row.valuation_target_voucher_revision) } : {}),
    ...(row.valuation_target_row_id != null ? { valuation_target_row_id: String(row.valuation_target_row_id) } : {}),
    actual_qty_micros: Number(row.actual_qty_micros),
    // `!= null` bắt cả null lẫn undefined mà VẪN giữ số 0 — `row.x ? …` sẽ nuốt mất cân 0.
    ...(row.actual_weight_micros != null ? { actual_weight_micros: Number(row.actual_weight_micros) } : {}),
    valuation_rate_minor: Number(row.valuation_rate_minor),
    stock_value_difference_minor: Number(row.stock_value_difference_minor), qty_scale: 6,
    currency_scale: Number(row.currency_scale), currency: String(row.currency), posting_at: String(row.posting_at),
    ...(row.batch_no ? { batch_no: String(row.batch_no) } : {}), ...(row.serial_no ? { serial_no: String(row.serial_no) } : {}),
    allow_negative_stock: Number(row.allow_negative_stock) === 1,
  };
}

/**
 * Flattens a document's text into one searchable string.
 *
 * Only top-level string values, and only ones short enough to be a label or code
 * rather than a body of prose: indexing every note and address would make the
 * index larger than the documents it points at, and a LIKE scan over it slower
 * than scanning them. Numbers are excluded because a search for "100" matching
 * every quantity is noise, not a result.
 */
function searchableContent(data: JsonObject): string {
  const parts: string[] = [];
  let budget = 4000;
  for (const [key, value] of Object.entries(data)) {
    if (budget <= 0) break;
    if (key.startsWith("_")) continue;
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (!trimmed || trimmed.length > 200) continue;
    parts.push(trimmed);
    budget -= trimmed.length + 1;
  }
  return parts.join(" ").slice(0, 4000);
}
