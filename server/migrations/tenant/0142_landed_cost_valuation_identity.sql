-- R8-B: immutable identity for receipt-row targeted valuation adjustments.
-- Source-only migration; deployment remains outside this branch.
--
-- Landed Cost must never smear a receipt-specific charge across unrelated FIFO layers.
-- The source-row column identifies the physical Purchase Receipt row that created an SLE;
-- the valuation_target_* columns let a later zero-quantity SLE point back to that exact row.
ALTER TABLE stock_ledger_entries ADD COLUMN source_row_id TEXT;
ALTER TABLE stock_ledger_entries ADD COLUMN valuation_target_voucher_type TEXT;
ALTER TABLE stock_ledger_entries ADD COLUMN valuation_target_voucher_no TEXT;
ALTER TABLE stock_ledger_entries ADD COLUMN valuation_target_voucher_revision INTEGER;
ALTER TABLE stock_ledger_entries ADD COLUMN valuation_target_row_id TEXT;

CREATE INDEX IF NOT EXISTS idx_sle_source_row
ON stock_ledger_entries(
  tenant_id,voucher_type,voucher_no,voucher_revision,source_row_id
)
WHERE source_row_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sle_valuation_target
ON stock_ledger_entries(
  tenant_id,valuation_target_voucher_type,valuation_target_voucher_no,
  valuation_target_voucher_revision,valuation_target_row_id
)
WHERE valuation_target_voucher_no IS NOT NULL;


-- First-class Landed Cost Voucher metadata. Allocation rows are server-owned evidence.
INSERT OR REPLACE INTO doctype_definitions(
  tenant_id,doctype,module,is_custom,is_submittable,is_child,revision,metadata_json,disabled,modified_by,modified_at
) VALUES(
  '__standard__','Landed Cost Voucher','Buying',0,1,0,1,
  json('{"name":"Landed Cost Voucher","module":"Buying","is_submittable":true,"is_child":false,"track_changes":true,"revision":1,"fields":[{"fieldname":"posting_at","label":"Posting At","fieldtype":"Datetime","required":true,"in_list_view":true},{"fieldname":"basis","label":"Allocation Basis","fieldtype":"Select","options":"amount\nquantity\nweight","required":true,"in_list_view":true},{"fieldname":"total_cost","label":"Total Landed Cost","fieldtype":"Currency","required":true},{"fieldname":"landed_cost_account","label":"Landed Cost Clearing Account","fieldtype":"Link","options":"Account","required":true},{"fieldname":"repost_difference_account","label":"Historical Repost Difference Account","fieldtype":"Link","options":"Account"},{"fieldname":"company","label":"Company","fieldtype":"Link","options":"Company","read_only":true},{"fieldname":"currency","label":"Currency","fieldtype":"Link","options":"Currency","read_only":true},{"fieldname":"purchase_receipts","label":"Purchase Receipts","fieldtype":"Table","options":"Landed Cost Voucher Receipt","required":true},{"fieldname":"allocations","label":"Allocations","fieldtype":"Table","options":"Landed Cost Voucher Allocation","read_only":true}],"permissions":[],"custom":false}'),
  0,'migration-0142','2026-10-02T00:00:00.000Z'
);

INSERT OR REPLACE INTO doctype_definitions(
  tenant_id,doctype,module,is_custom,is_submittable,is_child,revision,metadata_json,disabled,modified_by,modified_at
) VALUES(
  '__standard__','Landed Cost Voucher Receipt','Buying',0,0,1,1,
  json('{"name":"Landed Cost Voucher Receipt","module":"Buying","is_submittable":false,"is_child":true,"track_changes":false,"revision":1,"fields":[{"fieldname":"purchase_receipt","label":"Purchase Receipt","fieldtype":"Link","options":"Purchase Receipt","required":true,"in_list_view":true}],"permissions":[],"custom":false}'),
  0,'migration-0142','2026-10-02T00:00:00.000Z'
);

INSERT OR REPLACE INTO doctype_definitions(
  tenant_id,doctype,module,is_custom,is_submittable,is_child,revision,metadata_json,disabled,modified_by,modified_at
) VALUES(
  '__standard__','Landed Cost Voucher Allocation','Buying',0,0,1,1,
  json('{"name":"Landed Cost Voucher Allocation","module":"Buying","is_submittable":false,"is_child":true,"track_changes":false,"revision":1,"fields":[{"fieldname":"purchase_receipt","label":"Purchase Receipt","fieldtype":"Link","options":"Purchase Receipt","read_only":true,"in_list_view":true},{"fieldname":"purchase_receipt_row_id","label":"Receipt Row","fieldtype":"Data","read_only":true},{"fieldname":"item_code","label":"Item","fieldtype":"Link","options":"Item","read_only":true,"in_list_view":true},{"fieldname":"warehouse","label":"Warehouse","fieldtype":"Link","options":"Warehouse","read_only":true},{"fieldname":"stock_account","label":"Stock Account","fieldtype":"Link","options":"Account","read_only":true},{"fieldname":"basis_units","label":"Basis Units","fieldtype":"Int","read_only":true},{"fieldname":"allocated_cost_minor","label":"Allocated Cost Minor","fieldtype":"Int","read_only":true},{"fieldname":"source_qty_micros","label":"Source Qty Micros","fieldtype":"Int","read_only":true},{"fieldname":"remaining_qty_micros","label":"Remaining Qty Micros","fieldtype":"Int","read_only":true},{"fieldname":"inventory_cost_minor","label":"Inventory Cost Minor","fieldtype":"Int","read_only":true},{"fieldname":"consumed_cost_minor","label":"Consumed Cost Minor","fieldtype":"Int","read_only":true},{"fieldname":"history_row_count","label":"History Row Count","fieldtype":"Int","read_only":true},{"fieldname":"history_qty_micros","label":"History Qty Micros","fieldtype":"Int","read_only":true},{"fieldname":"history_value_minor","label":"History Value Minor","fieldtype":"Int","read_only":true}],"permissions":[],"custom":false}'),
  0,'migration-0142','2026-10-02T00:00:00.000Z'
);


-- Commit-time source fingerprint: the controller freezes the stock slice used to split
-- inventory vs already-consumed landed cost. If another stock mutation wins the race
-- before this submit commits, abort instead of posting a stale COGS/inventory split.
CREATE TRIGGER IF NOT EXISTS landed_cost_history_fingerprint_guard
BEFORE UPDATE OF docstatus ON documents
WHEN NEW.doctype='Landed Cost Voucher' AND NEW.docstatus=1 AND OLD.docstatus=0
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1
    FROM json_each(json_extract(NEW.payload_json,'$.allocations')) AS a
    WHERE CAST(json_extract(a.value,'$.history_row_count') AS INTEGER) <> (
      SELECT COUNT(*)
      FROM stock_ledger_entries s
      WHERE s.tenant_id=NEW.tenant_id
        AND s.item_code=json_extract(a.value,'$.item_code')
        AND s.warehouse=json_extract(a.value,'$.warehouse')
        AND s.posting_at<=json_extract(NEW.payload_json,'$.posting_at')
    )
    OR CAST(json_extract(a.value,'$.history_qty_micros') AS INTEGER) <> (
      SELECT COALESCE(SUM(s.actual_qty_micros),0)
      FROM stock_ledger_entries s
      WHERE s.tenant_id=NEW.tenant_id
        AND s.item_code=json_extract(a.value,'$.item_code')
        AND s.warehouse=json_extract(a.value,'$.warehouse')
        AND s.posting_at<=json_extract(NEW.payload_json,'$.posting_at')
    )
    OR CAST(json_extract(a.value,'$.history_value_minor') AS INTEGER) <> (
      SELECT COALESCE(SUM(s.stock_value_difference_minor),0)
      FROM stock_ledger_entries s
      WHERE s.tenant_id=NEW.tenant_id
        AND s.item_code=json_extract(a.value,'$.item_code')
        AND s.warehouse=json_extract(a.value,'$.warehouse')
        AND s.posting_at<=json_extract(NEW.payload_json,'$.posting_at')
    )
  ) THEN RAISE(ABORT,'Landed Cost stock history changed after planning; retry submit') END;
END;
