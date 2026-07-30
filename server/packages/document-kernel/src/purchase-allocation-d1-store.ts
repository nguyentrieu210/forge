import type { JsonObject, MutationPlan, MutationReceipt } from "../../contracts/src/index.js";
import type { PurchaseAllocationMutationPlanExtension } from "../../contracts/src/purchase-allocation.js";
import { asCloudForgeError, documentKey, errors } from "../../core/src/index.js";
import { D1MutationStore } from "./d1-store.js";

/**
 * D1 mutation adapter that extends the ordinary document batch with the M1
 * Purchase Receipt allocation ledgers. All statements, including revision
 * claims, execute in the same D1 batch as document/stock/procurement writes.
 *
 * This class intentionally inherits every read method from D1MutationStore. The
 * override is isolated here until the allocation plan becomes a core MutationPlan
 * field and the statement builder can be folded back into d1-store.ts without a
 * flag day for unrelated controllers.
 */
export class D1PurchaseAllocationMutationStore extends D1MutationStore {
  private readonly allocationWriter: D1Database | D1DatabaseSession;

  constructor(db: D1Database) {
    super(db);
    this.allocationWriter = db.withSession?.("first-primary") ?? db;
  }

  override async execute<T extends JsonObject>(plan: MutationPlan<T>): Promise<MutationReceipt> {
    const allocationPlan = plan as MutationPlan<T> & PurchaseAllocationMutationPlanExtension;
    const command = plan.command;
    const key = documentKey(command.aggregate.doctype, command.aggregate.name);
    const database = this.allocationWriter;
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
        plan.document.modified_at, command.actor.user_id,
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
        plan.document.name.slice(0, 320), searchableContent(plan.document.data), plan.document.modified_at,
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
         (tenant_id,voucher_type,voucher_no,voucher_revision,line_key,item_code,warehouse,actual_qty_micros,actual_weight_micros,valuation_rate_minor,stock_value_difference_minor,qty_scale,currency_scale,currency,posting_at,batch_no,serial_no,allow_negative_stock)
         VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18)`,
      ).bind(
        command.tenant_id, command.aggregate.doctype, command.aggregate.name, plan.document.version,
        line.line_key, line.item_code, line.warehouse, line.actual_qty_micros,
        line.actual_weight_micros ?? null, line.valuation_rate_minor,
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

    // Seed rows precede revision claims. Concurrent creators converge on the same
    // PK/unique key; the revision trigger remains the authoritative commit guard.
    for (const queue of allocationPlan.purchase_queue_seeds ?? []) {
      statements.push(database.prepare(
        `INSERT INTO purchase_obligation_queues(
           tenant_id,queue_key,company,supplier,material_match_key,material_schema_version,
           material_snapshot_json,revision,created_at,modified_at)
         VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)
         ON CONFLICT(tenant_id,queue_key) DO NOTHING`,
      ).bind(
        command.tenant_id, queue.queue_key, queue.company, queue.supplier, queue.material_match_key,
        queue.material_schema_version, JSON.stringify(queue.material_snapshot), queue.revision,
        queue.created_at, queue.modified_at,
      ));
    }
    for (const window of allocationPlan.purchase_window_seeds ?? []) {
      statements.push(database.prepare(
        `INSERT INTO purchase_settlement_windows(
           tenant_id,window_id,queue_key,window_sequence,status,tolerance_bps,revision,
           opened_at,settled_at,settled_by,settlement_reason)
         VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)
         ON CONFLICT(tenant_id,window_id) DO NOTHING`,
      ).bind(
        command.tenant_id, window.window_id, window.queue_key, window.window_sequence,
        window.status, window.tolerance_bps, window.revision, window.opened_at,
        window.settled_at ?? null, window.settled_by ?? null, window.settlement_reason ?? null,
      ));
    }
    for (const claim of allocationPlan.purchase_revision_claims ?? []) {
      statements.push(database.prepare(
        `INSERT INTO purchase_allocation_revision_claims(
           tenant_id,command_id,scope_type,scope_key,expected_revision,claimed_at)
         VALUES(?1,?2,?3,?4,?5,?6)`,
      ).bind(
        command.tenant_id, command.command_id, claim.scope_type, claim.scope_key,
        claim.expected_revision, claim.claimed_at,
      ));
    }
    for (const line of allocationPlan.purchase_obligation_entries ?? []) {
      statements.push(database.prepare(
        `INSERT INTO purchase_window_obligation_entries(
           tenant_id,entry_id,queue_key,window_id,voucher_type,voucher_no,voucher_revision,line_key,
           purchase_order,purchase_order_item_row_id,entry_kind,qty_micros,transaction_date,
           purchase_order_created_at,item_idx,committed_at,actor,command_id,source,resolution)
         VALUES(?1,?2,?3,?4,'Purchase Order',?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19)`,
      ).bind(
        command.tenant_id, line.entry_id, line.queue_key, line.window_id,
        command.aggregate.name, plan.document.version, line.line_key, line.purchase_order,
        line.purchase_order_item_row_id ?? null, line.entry_kind, line.qty_micros,
        line.transaction_date, line.purchase_order_created_at, line.item_idx, line.committed_at,
        command.actor.user_id, command.command_id, line.source, line.resolution,
      ));
    }
    for (const line of allocationPlan.purchase_allocation_entries ?? []) {
      statements.push(database.prepare(
        `INSERT INTO purchase_receipt_allocation_entries(
           tenant_id,entry_id,queue_key,window_id,voucher_type,voucher_no,voucher_revision,line_key,
           receipt_item_row_id,purchase_order,purchase_order_item_row_id,entry_kind,qty_micros,
           barem_weight_micros,projected_actual_weight_micros,projection_version,allocation_sequence,
           posting_at,committed_at,actor,reason,command_id,source,resolution,reversal_of_entry_id)
         VALUES(?1,?2,?3,?4,'Purchase Receipt',?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19,?20,?21,?22,?23,?24)`,
      ).bind(
        command.tenant_id, line.entry_id, line.queue_key, line.window_id,
        command.aggregate.name, plan.document.version, line.line_key, line.receipt_item_row_id ?? null,
        line.purchase_order, line.purchase_order_item_row_id ?? null, line.entry_kind, line.qty_micros,
        line.barem_weight_micros, line.projected_actual_weight_micros ?? null,
        line.projection_version ?? null, line.allocation_sequence, line.posting_at, line.committed_at,
        command.actor.user_id, line.reason ?? null, command.command_id, line.source, line.resolution,
        line.reversal_of_entry_id ?? null,
      ));
    }
    for (const line of allocationPlan.purchase_unapplied_entries ?? []) {
      statements.push(database.prepare(
        `INSERT INTO purchase_unapplied_receipt_entries(
           tenant_id,entry_id,queue_key,window_id,voucher_type,voucher_no,voucher_revision,line_key,
           receipt_item_row_id,entry_kind,qty_micros,source_entry_id,allocation_entry_id,posting_at,
           committed_at,actor,reason,command_id)
         VALUES(?1,?2,?3,?4,'Purchase Receipt',?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17)`,
      ).bind(
        command.tenant_id, line.entry_id, line.queue_key, line.window_id,
        command.aggregate.name, plan.document.version, line.line_key, line.receipt_item_row_id,
        line.entry_kind, line.qty_micros, line.source_entry_id ?? null,
        line.allocation_entry_id ?? null, line.posting_at, line.committed_at,
        command.actor.user_id, line.reason ?? null, command.command_id,
      ));
    }
    for (const line of allocationPlan.purchase_settlement_entries ?? []) {
      statements.push(database.prepare(
        `INSERT INTO purchase_settlement_entries(
           tenant_id,entry_id,queue_key,window_id,entry_kind,nominal_qty_micros,
           received_qty_micros,minimum_qty_micros,maximum_qty_micros,
           shortage_variance_micros,overage_variance_micros,committed_at,actor,reason,
           command_id,reversal_of_entry_id)
         VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16)`,
      ).bind(
        command.tenant_id, line.entry_id, line.queue_key, line.window_id, line.entry_kind,
        line.nominal_qty_micros, line.received_qty_micros, line.minimum_qty_micros,
        line.maximum_qty_micros, line.shortage_variance_micros, line.overage_variance_micros,
        line.committed_at, command.actor.user_id, line.reason, command.command_id,
        line.reversal_of_entry_id ?? null,
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
        line.base_amount_minor, line.currency, line.currency_scale, line.against_voucher_type ?? null,
        line.against_voucher_no ?? null, line.posting_at,
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
      receipt.tenant_id, receipt.command_id, receipt.actor_user_id, receipt.aggregate.doctype,
      receipt.aggregate.name, receipt.aggregate_version, receipt.payload_hash, receipt.committed_at,
      JSON.stringify(receipt.result),
    ));
    statements.push(database.prepare("DELETE FROM mutation_guard WHERE tenant_id=?1 AND command_id=?2")
      .bind(command.tenant_id, command.command_id));

    try {
      await database.batch(statements);
      const bookmark = typeof (database as D1DatabaseSession).getBookmark === "function"
        ? (database as D1DatabaseSession).getBookmark()
        : null;
      return { ...receipt, ...(bookmark ? { bookmark } : {}) };
    } catch (error) {
      const committed = await this.getReceipt(command.tenant_id, command.command_id);
      if (committed) {
        if (committed.payload_hash !== command.payload_hash || committed.actor_user_id !== command.actor.user_id) {
          throw errors.idempotency();
        }
        return committed;
      }
      throw asCloudForgeError(error);
    }
  }
}

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
