import type { JsonObject, JsonValue } from "../../contracts/src/index.js";

export interface ReconciliationFinding extends JsonObject {
  category: "GL_IMBALANCE" | "RECEIVABLE_DRIFT" | "POSTING_DATE_MISMATCH" | "ORPHAN_REFERENCE" | "OUTBOX_FAILURE";
  key: string;
  details: JsonObject;
}

export interface ReconciliationReport extends JsonObject {
  ok: boolean;
  tenant_id: string;
  checked_at: string;
  counts: JsonObject;
  findings: ReconciliationFinding[];
  truncated: boolean;
}

/**
 * Bounded, read-only commercial reconciliation probe for support/monitoring.
 * It never mutates accounting data and never accepts table/field names from a
 * caller. Every query is tenant-scoped and capped so it is safe to run from an
 * authenticated internal health check.
 */
export class D1CommercialReconciliationService {
  constructor(private readonly db: D1Database, private readonly limit = 50) {}

  async run(tenantId: string, now = new Date().toISOString()): Promise<ReconciliationReport> {
    const limit = Math.max(1, Math.min(this.limit, 100));
    const [gl, receivable, receivableGl, posting, orphan, outbox] = await Promise.all([
      this.db.prepare(
        `SELECT voucher_type, voucher_no, voucher_revision,
                SUM(debit_minor) AS debit_minor, SUM(credit_minor) AS credit_minor
         FROM gl_entries WHERE tenant_id=?1
         GROUP BY voucher_type, voucher_no, voucher_revision
         HAVING SUM(debit_minor)<>SUM(credit_minor)
         LIMIT ?2`,
      ).bind(tenantId, limit).all<Record<string, JsonValue>>(),
      this.db.prepare(
        `SELECT against_voucher_type, against_voucher_no,
                SUM(amount_minor) AS outstanding_minor,
                SUM(base_amount_minor) AS base_outstanding_minor
         FROM payment_ledger_entries
         WHERE tenant_id=?1 AND against_voucher_type IS NOT NULL AND against_voucher_no IS NOT NULL
         GROUP BY against_voucher_type, against_voucher_no
         HAVING SUM(amount_minor)<0 OR SUM(base_amount_minor)<0
             OR (SUM(amount_minor)=0 AND SUM(base_amount_minor)<>0)
         LIMIT ?2`,
      ).bind(tenantId, limit).all<Record<string, JsonValue>>(),
      this.db.prepare(
        `WITH keys AS (
           SELECT account, party FROM gl_entries
           WHERE tenant_id=?1 AND party_type='Customer' AND party IS NOT NULL
           UNION
           SELECT account, party FROM payment_ledger_entries
           WHERE tenant_id=?1 AND account_type='Receivable'
         ), gl AS (
           SELECT account, party, SUM(debit_minor-credit_minor) AS gl_balance_minor
           FROM gl_entries
           WHERE tenant_id=?1 AND party_type='Customer' AND party IS NOT NULL
           GROUP BY account, party
         ), ple AS (
           SELECT account, party, SUM(base_amount_minor) AS ple_base_outstanding_minor
           FROM payment_ledger_entries
           WHERE tenant_id=?1 AND account_type='Receivable'
           GROUP BY account, party
         )
         SELECT keys.account, keys.party,
                COALESCE(gl.gl_balance_minor,0) AS gl_balance_minor,
                COALESCE(ple.ple_base_outstanding_minor,0) AS ple_base_outstanding_minor
         FROM keys
         LEFT JOIN gl ON gl.account=keys.account AND gl.party=keys.party
         LEFT JOIN ple ON ple.account=keys.account AND ple.party=keys.party
         WHERE COALESCE(gl.gl_balance_minor,0)<>COALESCE(ple.ple_base_outstanding_minor,0)
         LIMIT ?2`,
      ).bind(tenantId, limit).all<Record<string, JsonValue>>(),
      this.db.prepare(
        `SELECT ledger, voucher_type, voucher_no, posting_at, expected_posting_at FROM (
           SELECT 'GL' AS ledger, g.voucher_type, g.voucher_no, g.posting_at,
                  json_extract(d.payload_json,'$.posting_at') AS expected_posting_at
           FROM gl_entries g JOIN documents d
             ON d.tenant_id=g.tenant_id AND d.doc_key=g.voucher_type || ':' || g.voucher_no
           WHERE g.tenant_id=?1
           UNION ALL
           SELECT 'PLE', p.voucher_type, p.voucher_no, p.posting_at,
                  json_extract(d.payload_json,'$.posting_at')
           FROM payment_ledger_entries p JOIN documents d
             ON d.tenant_id=p.tenant_id AND d.doc_key=p.voucher_type || ':' || p.voucher_no
           WHERE p.tenant_id=?1
           UNION ALL
           SELECT 'FULFILLMENT', f.voucher_type, f.voucher_no, f.posting_at,
                  json_extract(d.payload_json,'$.posting_at')
           FROM sales_order_fulfillment_entries f JOIN documents d
             ON d.tenant_id=f.tenant_id AND d.doc_key=f.voucher_type || ':' || f.voucher_no
           WHERE f.tenant_id=?1
         ) WHERE expected_posting_at IS NOT NULL AND posting_at<>expected_posting_at
         LIMIT ?2`,
      ).bind(tenantId, limit).all<Record<string, JsonValue>>(),
      this.db.prepare(
        `SELECT p.against_voucher_type, p.against_voucher_no
         FROM payment_ledger_entries p
         LEFT JOIN documents d ON d.tenant_id=p.tenant_id
           AND d.doc_key=p.against_voucher_type || ':' || p.against_voucher_no
         WHERE p.tenant_id=?1 AND p.against_voucher_type IS NOT NULL
           AND p.against_voucher_no IS NOT NULL AND d.doc_key IS NULL
         GROUP BY p.against_voucher_type, p.against_voucher_no
         LIMIT ?2`,
      ).bind(tenantId, limit).all<Record<string, JsonValue>>(),
      this.db.prepare(
        `SELECT event_id, event_type, attempts, occurred_at
         FROM outbox WHERE tenant_id=?1 AND status='failed'
         ORDER BY occurred_at ASC LIMIT ?2`,
      ).bind(tenantId, limit).all<Record<string, JsonValue>>(),
    ]);

    const findings: ReconciliationFinding[] = [];
    for (const row of gl.results ?? []) findings.push(finding("GL_IMBALANCE", `${row.voucher_type}:${row.voucher_no}:${row.voucher_revision}`, row));
    for (const row of receivable.results ?? []) findings.push(finding("RECEIVABLE_DRIFT", `${row.against_voucher_type}:${row.against_voucher_no}`, row));
    for (const row of receivableGl.results ?? []) findings.push(finding("RECEIVABLE_DRIFT", `GL_VS_PLE:${row.account}:${row.party}`, row));
    for (const row of posting.results ?? []) findings.push(finding("POSTING_DATE_MISMATCH", `${row.ledger}:${row.voucher_type}:${row.voucher_no}`, row));
    for (const row of orphan.results ?? []) findings.push(finding("ORPHAN_REFERENCE", `${row.against_voucher_type}:${row.against_voucher_no}`, row));
    for (const row of outbox.results ?? []) findings.push(finding("OUTBOX_FAILURE", String(row.event_id), row));

    const counts: JsonObject = {
      gl_imbalance: gl.results?.length ?? 0,
      receivable_drift: receivable.results?.length ?? 0,
      receivable_gl_mismatch: receivableGl.results?.length ?? 0,
      posting_date_mismatch: posting.results?.length ?? 0,
      orphan_reference: orphan.results?.length ?? 0,
      outbox_failure: outbox.results?.length ?? 0,
    };
    const truncated = [gl, receivable, receivableGl, posting, orphan, outbox].some((result) => (result.results?.length ?? 0) >= limit);
    return { ok: findings.length === 0, tenant_id: tenantId, checked_at: now, counts, findings, truncated };
  }
}

function finding(category: ReconciliationFinding["category"], key: string, row: Record<string, JsonValue>): ReconciliationFinding {
  return { category, key, details: row as JsonObject };
}
