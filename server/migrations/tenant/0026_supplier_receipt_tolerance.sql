-- Receipt progress may exceed the ordered stock quantity only by the tolerance
-- configured on the Purchase Order supplier. Billing remains capped at exactly
-- the ordered quantity. This mirrors assertPurchaseRemaining in the core.

DROP TRIGGER IF EXISTS purchase_progress_reference_guard;

CREATE TRIGGER purchase_progress_reference_guard
BEFORE INSERT ON purchase_order_progress_entries
BEGIN
  SELECT CASE
    WHEN NOT EXISTS (
      SELECT 1 FROM documents WHERE tenant_id=NEW.tenant_id
        AND doc_key='Purchase Order:' || NEW.purchase_order AND doctype='Purchase Order' AND docstatus=1
    ) THEN RAISE(ABORT,'PURCHASE_REFERENCE_SOURCE_NOT_FOUND')
    WHEN NOT EXISTS (
      SELECT 1 FROM document_children WHERE tenant_id=NEW.tenant_id
        AND parent_key='Purchase Order:' || NEW.purchase_order AND fieldname='items'
        AND json_extract(payload_json,'$.item_code')=NEW.item_code
    ) THEN RAISE(ABORT,'PURCHASE_REFERENCE_ITEM_NOT_FOUND')
    WHEN COALESCE((SELECT SUM(qty_micros) FROM purchase_order_progress_entries
      WHERE tenant_id=NEW.tenant_id AND purchase_order=NEW.purchase_order AND kind=NEW.kind AND item_code=NEW.item_code),0)+NEW.qty_micros < 0
      THEN RAISE(ABORT,'PURCHASE_REFERENCE_QUANTITY_NEGATIVE')
    WHEN COALESCE((SELECT SUM(qty_micros) FROM purchase_order_progress_entries
      WHERE tenant_id=NEW.tenant_id AND purchase_order=NEW.purchase_order AND kind=NEW.kind AND item_code=NEW.item_code),0)+NEW.qty_micros >
      CAST(
        (SELECT COALESCE(SUM(CAST(COALESCE(json_extract(payload_json,'$.stock_qty_micros'),json_extract(payload_json,'$.qty_micros')) AS INTEGER)),0)
         FROM document_children
         WHERE tenant_id=NEW.tenant_id AND parent_key='Purchase Order:' || NEW.purchase_order AND fieldname='items'
         AND json_extract(payload_json,'$.item_code')=NEW.item_code)
        * (1 + CASE WHEN NEW.kind='Receipt' THEN COALESCE((
          SELECT CAST(json_extract(supplier.payload_json,'$.receipt_tolerance_pct') AS REAL) / 100
          FROM documents purchase_order
          LEFT JOIN documents supplier
            ON supplier.tenant_id=purchase_order.tenant_id
           AND supplier.doc_key='Supplier:' || json_extract(purchase_order.payload_json,'$.supplier')
          WHERE purchase_order.tenant_id=NEW.tenant_id
            AND purchase_order.doc_key='Purchase Order:' || NEW.purchase_order
        ),0) ELSE 0 END)
      AS INTEGER)
      THEN RAISE(ABORT,'PURCHASE_REFERENCE_QUANTITY_EXCEEDED')
  END;
END;
