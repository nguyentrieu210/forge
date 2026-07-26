import type {
  CanonicalDocument,
  JsonObject,
  MutationPlan,
  MutationReceipt,
  StockLedgerEntry,
} from "../../contracts/src/index.js";
import { asCloudForgeError, documentKey, errors } from "../../core/src/index.js";
import { fromScaledInt, toScaledInt } from "../../money/src/index.js";
import { deriveO2CStatus } from "./status.js";
import type { MutationStore, SubmittedQuantityQuery } from "./store.js";

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
    const sql = `SELECT COALESCE(SUM(CAST(json_extract(c.payload_json, '$.qty_micros') AS INTEGER)),0) AS total
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

  async getStockLedgerHistory(tenantId: string, itemCode: string, warehouse: string, throughPostingAt?: string): Promise<StockLedgerEntry[]> {
    const sql = `SELECT line_key,item_code,warehouse,actual_qty_micros,valuation_rate_minor,stock_value_difference_minor,
      qty_scale,currency_scale,currency,posting_at,batch_no,serial_no,allow_negative_stock
      FROM stock_ledger_entries WHERE tenant_id=?1 AND item_code=?2 AND warehouse=?3
      ${throughPostingAt ? "AND posting_at<=?4" : ""}
      ORDER BY posting_at,rowid`;
    const result = throughPostingAt
      ? await this.writer.prepare(sql).bind(tenantId,itemCode,warehouse,throughPostingAt).all<Record<string, unknown>>()
      : await this.writer.prepare(sql).bind(tenantId,itemCode,warehouse).all<Record<string, unknown>>();
    return (result.results ?? []).map((row) => ({
      line_key: String(row.line_key), item_code: String(row.item_code), warehouse: String(row.warehouse),
      actual_qty_micros: Number(row.actual_qty_micros), valuation_rate_minor: Number(row.valuation_rate_minor),
      stock_value_difference_minor: Number(row.stock_value_difference_minor), qty_scale: 6,
      currency_scale: Number(row.currency_scale), currency: String(row.currency), posting_at: String(row.posting_at),
      ...(row.batch_no ? { batch_no: String(row.batch_no) } : {}), ...(row.serial_no ? { serial_no: String(row.serial_no) } : {}),
      allow_negative_stock: Number(row.allow_negative_stock) === 1,
    }));
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

  async getProcuredQuantityMicros(
    tenantId: string,
    purchaseOrder: string,
    kind?: "Receipt" | "Billing",
    itemCode?: string,
  ): Promise<number> {
    const conditions = ["tenant_id=?1", "purchase_order=?2"];
    const values: unknown[] = [tenantId, purchaseOrder];
    if (kind) { conditions.push(`kind=?${values.length + 1}`); values.push(kind); }
    if (itemCode) { conditions.push(`item_code=?${values.length + 1}`); values.push(itemCode); }
    const row = await this.writer.prepare(
      `SELECT COALESCE(SUM(qty_micros),0) AS total FROM purchase_order_progress_entries WHERE ${conditions.join(" AND ")}`,
    ).bind(...values).first<{ total: number }>();
    return Number(row?.total ?? 0);
  }

  /**
   * Deletes a DRAFT document and everything attached to it.
   *
   * Deliberately narrower than Frappe, which also allows deleting a cancelled
   * document. Here a cancelled document still owns its reversing ledger rows
   * (`gl_entries` and friends are keyed by voucher + revision, not by a
   * foreign key), so removing it would leave those reversals pointing at nothing
   * and silently unbalance the books. A submitted document is never deletable.
   *
   * Returns false when the document is already gone, so a retried delete is
   * idempotent rather than a 404 the caller has to special-case.
   */
  async deleteDraftDocument(tenantId: string, doctype: string, name: string): Promise<boolean> {
    const key = documentKey(doctype, name);
    const row = await this.writer.prepare(
      `SELECT docstatus FROM documents WHERE tenant_id=?1 AND doc_key=?2`,
    ).bind(tenantId, key).first<{ docstatus: number }>();
    if (!row) return false;
    if (row.docstatus === 1) throw errors.lifecycle("A submitted document cannot be deleted; cancel it instead");
    if (row.docstatus === 2) throw errors.lifecycle("A cancelled document cannot be deleted because its reversing ledger entries would be orphaned");

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
      this.writer.prepare(`DELETE FROM documents WHERE tenant_id=?1 AND doc_key=?2 AND docstatus=0`).bind(tenantId, key),
    ]);
    return true;
  }

  /**
   * Renames a document, moving its children and collaboration rows with it.
   *
   * Refuses when anything still points at the old name. Link values live inside
   * JSON payloads with no foreign keys, so a rename cannot be cascaded reliably:
   * rewriting "every payload containing this string" would also corrupt unrelated
   * text that happens to match. A refused rename is recoverable; a half-rewritten
   * link graph is not.
   */
  async renameDocument(tenantId: string, doctype: string, oldName: string, newName: string, actor: string, now: string): Promise<void> {
    const oldKey = documentKey(doctype, oldName);
    const newKey = documentKey(doctype, newName);

    const referenced = await this.writer.prepare(
      `SELECT (SELECT COUNT(*) FROM documents WHERE tenant_id=?1 AND doc_key<>?2
                 AND EXISTS(SELECT 1 FROM json_each(payload_json) WHERE json_each.value=?3))
            + (SELECT COUNT(*) FROM document_children WHERE tenant_id=?1 AND parent_key<>?2
                 AND EXISTS(SELECT 1 FROM json_each(payload_json) WHERE json_each.value=?3))
            + (SELECT COUNT(*) FROM documents WHERE tenant_id=?1 AND doctype=?4 AND amended_from=?3) AS total`,
    ).bind(tenantId, oldKey, oldName, doctype).first<{ total: number }>();
    if (Number(referenced?.total ?? 0) > 0) {
      throw errors.reference("The document is referenced elsewhere and cannot be renamed", { document: oldName });
    }

    await this.writer.batch([
      this.writer.prepare(
        `UPDATE documents SET doc_key=?3, name=?4, modified_at=?5, modified_by=?6
         WHERE tenant_id=?1 AND doc_key=?2`,
      ).bind(tenantId, oldKey, newKey, newName, now, actor),
      this.writer.prepare(`UPDATE document_children SET parent_key=?3 WHERE tenant_id=?1 AND parent_key=?2`).bind(tenantId, oldKey, newKey),
      this.writer.prepare(`UPDATE versions SET doc_key=?3 WHERE tenant_id=?1 AND doc_key=?2`).bind(tenantId, oldKey, newKey),
      this.writer.prepare(`UPDATE document_comments SET name=?4 WHERE tenant_id=?1 AND doctype=?2 AND name=?3`).bind(tenantId, doctype, oldName, newName),
      this.writer.prepare(`UPDATE assignments SET name=?4 WHERE tenant_id=?1 AND doctype=?2 AND name=?3`).bind(tenantId, doctype, oldName, newName),
      this.writer.prepare(`UPDATE document_shares SET name=?4 WHERE tenant_id=?1 AND doctype=?2 AND name=?3`).bind(tenantId, doctype, oldName, newName),
      this.writer.prepare(`UPDATE document_tags SET name=?4 WHERE tenant_id=?1 AND doctype=?2 AND name=?3`).bind(tenantId, doctype, oldName, newName),
      this.writer.prepare(`UPDATE files SET attached_to_name=?4 WHERE tenant_id=?1 AND attached_to_doctype=?2 AND attached_to_name=?3`).bind(tenantId, doctype, oldName, newName),
    ]);
  }

  async hasMasterRecord(tenantId: string, recordType: string, name: string): Promise<boolean> {
    const row = await this.writer.prepare(
      `SELECT 1 AS found FROM master_records WHERE tenant_id=?1 AND record_type=?2 AND name=?3 AND disabled=0
       UNION ALL
       SELECT 1 AS found FROM documents WHERE tenant_id=?1 AND doctype=?2 AND name=?3
         AND docstatus<>2 AND COALESCE(CAST(json_extract(payload_json,'$.disabled') AS INTEGER),0)=0
       LIMIT 1`,
    ).bind(tenantId, recordType, name).first<{ found: number }>();
    return Boolean(row);
  }

  async getMasterRecordData(tenantId: string, recordType: string, name: string): Promise<JsonObject | null> {
    const row = await this.writer.prepare(
      `SELECT data_json FROM master_records WHERE tenant_id=?1 AND record_type=?2 AND name=?3 AND disabled=0
       UNION ALL
       SELECT payload_json AS data_json FROM documents WHERE tenant_id=?1 AND doctype=?2 AND name=?3
         AND docstatus<>2 AND COALESCE(CAST(json_extract(payload_json,'$.disabled') AS INTEGER),0)=0
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
      `SELECT name,data_json FROM master_records WHERE tenant_id=?1 AND record_type=?2 AND disabled=0
       UNION ALL
       SELECT name,payload_json AS data_json FROM documents WHERE tenant_id=?1 AND doctype=?2 AND docstatus<>2
        AND COALESCE(CAST(json_extract(payload_json,'$.disabled') AS INTEGER),0)=0`,
    ).bind(tenantId,recordType).all<{name:string;data_json:string}>();
    const result=new Map<string,JsonObject>();
    for(const row of rows.results??[]){try{const parsed=JSON.parse(row.data_json) as unknown;result.set(row.name,parsed&&typeof parsed==="object"&&!Array.isArray(parsed)?parsed as JsonObject:{});}catch{throw errors.database("Master record data is invalid JSON");}}
    return [...result.entries()].map(([name,data])=>({name,data}));
  }
  async getPeriodLockDate(tenantId: string, company: string): Promise<string | null> {
    const row = await this.writer.prepare(
      `SELECT lock_date FROM accounting_period_locks WHERE tenant_id=?1 AND company=?2`,
    ).bind(tenantId, company).first<{ lock_date: string }>();
    return row?.lock_date ?? null;
  }

  async execute<T extends JsonObject>(plan: MutationPlan<T>): Promise<MutationReceipt> {
    const command = plan.command;
    const key = documentKey(command.aggregate.doctype, command.aggregate.name);
    const database = this.writer;
    const statements: D1PreparedStatement[] = [];
    statements.push(database.prepare(
      `INSERT INTO mutation_guard
       (tenant_id, command_id, doc_key, expected_version, action, payload_hash, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`,
    ).bind(command.tenant_id, command.command_id, key, command.expected_version, command.action, command.payload_hash, plan.document.modified_at));

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

    const existingChildren = await database.prepare(
      `SELECT fieldname, row_id FROM document_children WHERE tenant_id=?1 AND parent_key=?2`,
    ).bind(command.tenant_id, key).all<{ fieldname: string; row_id: string }>();
    const desiredChildKeys = new Set(plan.document.children.map((child) => `${child.fieldname}:${child.row_id}`));
    for (const child of existingChildren.results ?? []) {
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
         (tenant_id,voucher_type,voucher_no,voucher_revision,line_key,item_code,warehouse,actual_qty_micros,valuation_rate_minor,stock_value_difference_minor,qty_scale,currency_scale,currency,posting_at,batch_no,serial_no,allow_negative_stock)
         VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17)`,
      ).bind(
        command.tenant_id, command.aggregate.doctype, command.aggregate.name, plan.document.version,
        line.line_key, line.item_code, line.warehouse, line.actual_qty_micros, line.valuation_rate_minor,
        line.stock_value_difference_minor, line.qty_scale, line.currency_scale, line.currency,
        line.posting_at, line.batch_no ?? null, line.serial_no ?? null, line.allow_negative_stock ? 1 : 0,
      ));
    }
    for (const line of plan.fulfillment_entries) {
      statements.push(database.prepare(
        `INSERT INTO sales_order_fulfillment_entries
         (tenant_id,voucher_type,voucher_no,voucher_revision,line_key,sales_order,kind,item_code,qty_micros,posting_at)
         VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)`,
      ).bind(
        command.tenant_id, command.aggregate.doctype, command.aggregate.name, plan.document.version,
        line.line_key, line.sales_order, line.kind, line.item_code, line.qty_micros, line.posting_at,
      ));
    }
    for (const line of plan.procurement_entries ?? []) {
      statements.push(database.prepare(
        `INSERT INTO purchase_order_progress_entries
         (tenant_id,voucher_type,voucher_no,voucher_revision,line_key,purchase_order,kind,item_code,qty_micros,posting_at)
         VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)`,
      ).bind(
        command.tenant_id, command.aggregate.doctype, command.aggregate.name, plan.document.version,
        line.line_key, line.purchase_order, line.kind, line.item_code, line.qty_micros, line.posting_at,
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

    try {
      await database.batch(statements);
      const bookmark = typeof (database as D1DatabaseSession).getBookmark === "function" ? (database as D1DatabaseSession).getBookmark() : null;
      return { ...receipt, ...(bookmark ? { bookmark } : {}) };
    } catch (error) {
      const committed = await this.getReceipt(command.tenant_id, command.command_id);
      if (committed) {
        if (committed.payload_hash !== command.payload_hash || committed.actor_user_id !== command.actor.user_id) throw errors.idempotency();
        return committed;
      }
      throw asCloudForgeError(error);
    }
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
      document.status = deriveO2CStatus("Delivery Note", document.docstatus);
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
      let ordered = 0;
      let delivered = 0;
      let billed = 0;
      for (const value of items) {
        if (!value || typeof value !== "object" || Array.isArray(value)) continue;
        const item = value as JsonObject;
        const itemCode = String(item.item_code ?? "");
        ordered += typeof item.qty_micros === "number" ? item.qty_micros : toScaledInt(String(item.qty ?? 0), 6);
        delivered += await this.getFulfilledQuantityMicros(document.tenant_id, document.name, "Delivery", itemCode);
        billed += await this.getFulfilledQuantityMicros(document.tenant_id, document.name, "Billing", itemCode);
      }
      if (ordered > 0) {
        const data = document.data as JsonObject;
        const deliveredPercentage = (delivered * 100) / ordered;
        const billedPercentage = (billed * 100) / ordered;
        data.delivered_percentage = deliveredPercentage.toFixed(2);
        data.billed_percentage = billedPercentage.toFixed(2);
        if (document.docstatus === 1) {
          document.status = deriveO2CStatus("Sales Order", document.docstatus, { deliveredPercentage, billedPercentage });
        }
      }
    }
  }
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
