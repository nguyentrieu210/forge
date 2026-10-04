-- Race guard for Landed Cost value propagated into another warehouse.
DROP TRIGGER IF EXISTS landed_cost_propagated_history_submit_guard;
CREATE TRIGGER landed_cost_propagated_history_submit_guard
BEFORE UPDATE OF docstatus ON documents
WHEN NEW.doctype='Landed Cost Voucher' AND NEW.docstatus=1 AND OLD.docstatus=0
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1
    FROM json_each(json_extract(NEW.payload_json,'$.allocations')) AS a,
         json_each(COALESCE(json_extract(a.value,'$.propagation_fingerprints'),json('[]'))) AS f
    WHERE CAST(json_extract(f.value,'$.history_row_count') AS INTEGER) <> (
      SELECT COUNT(*) FROM stock_ledger_entries s
      WHERE s.tenant_id=NEW.tenant_id
        AND s.item_code=json_extract(f.value,'$.item_code')
        AND s.warehouse=json_extract(f.value,'$.warehouse')
        AND s.posting_at<=COALESCE(json_extract(f.value,'$.history_until'),json_extract(NEW.payload_json,'$.posting_at'))
    )
    OR CAST(json_extract(f.value,'$.history_qty_micros') AS INTEGER) <> (
      SELECT COALESCE(SUM(s.actual_qty_micros),0) FROM stock_ledger_entries s
      WHERE s.tenant_id=NEW.tenant_id
        AND s.item_code=json_extract(f.value,'$.item_code')
        AND s.warehouse=json_extract(f.value,'$.warehouse')
        AND s.posting_at<=COALESCE(json_extract(f.value,'$.history_until'),json_extract(NEW.payload_json,'$.posting_at'))
    )
    OR CAST(json_extract(f.value,'$.history_value_minor') AS INTEGER) <> (
      SELECT COALESCE(SUM(s.stock_value_difference_minor),0) FROM stock_ledger_entries s
      WHERE s.tenant_id=NEW.tenant_id
        AND s.item_code=json_extract(f.value,'$.item_code')
        AND s.warehouse=json_extract(f.value,'$.warehouse')
        AND s.posting_at<=COALESCE(json_extract(f.value,'$.history_until'),json_extract(NEW.payload_json,'$.posting_at'))
    )
  ) THEN RAISE(ABORT,'Landed Cost propagated stock history changed after planning; retry submit') END;
END;

DROP TRIGGER IF EXISTS landed_cost_propagated_history_cancel_guard;
CREATE TRIGGER landed_cost_propagated_history_cancel_guard
BEFORE UPDATE OF docstatus ON documents
WHEN NEW.doctype='Landed Cost Voucher' AND NEW.docstatus=2 AND OLD.docstatus=1
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1
    FROM json_each(json_extract(NEW.payload_json,'$.allocations')) AS a,
         json_each(COALESCE(json_extract(a.value,'$.propagation_fingerprints'),json('[]'))) AS f
    WHERE CAST(json_extract(f.value,'$.history_row_count') AS INTEGER) <> (
      SELECT COUNT(*) FROM stock_ledger_entries s
      WHERE s.tenant_id=NEW.tenant_id
        AND NOT(s.voucher_type='Landed Cost Voucher' AND s.voucher_no=NEW.name)
        AND s.item_code=json_extract(f.value,'$.item_code')
        AND s.warehouse=json_extract(f.value,'$.warehouse')
        AND s.posting_at<=COALESCE(json_extract(f.value,'$.history_until'),json_extract(NEW.payload_json,'$.posting_at'))
    )
    OR CAST(json_extract(f.value,'$.history_qty_micros') AS INTEGER) <> (
      SELECT COALESCE(SUM(s.actual_qty_micros),0) FROM stock_ledger_entries s
      WHERE s.tenant_id=NEW.tenant_id
        AND NOT(s.voucher_type='Landed Cost Voucher' AND s.voucher_no=NEW.name)
        AND s.item_code=json_extract(f.value,'$.item_code')
        AND s.warehouse=json_extract(f.value,'$.warehouse')
        AND s.posting_at<=COALESCE(json_extract(f.value,'$.history_until'),json_extract(NEW.payload_json,'$.posting_at'))
    )
    OR CAST(json_extract(f.value,'$.history_value_minor') AS INTEGER) <> (
      SELECT COALESCE(SUM(s.stock_value_difference_minor),0) FROM stock_ledger_entries s
      WHERE s.tenant_id=NEW.tenant_id
        AND NOT(s.voucher_type='Landed Cost Voucher' AND s.voucher_no=NEW.name)
        AND s.item_code=json_extract(f.value,'$.item_code')
        AND s.warehouse=json_extract(f.value,'$.warehouse')
        AND s.posting_at<=COALESCE(json_extract(f.value,'$.history_until'),json_extract(NEW.payload_json,'$.posting_at'))
    )
  ) THEN RAISE(ABORT,'Landed Cost propagated stock history changed after planning; retry submit') END;
END;
