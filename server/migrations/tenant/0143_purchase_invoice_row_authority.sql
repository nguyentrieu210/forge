-- R8-B: exact Purchase Order child-row authority for Receipt/Billing progress.
-- Source-only migration. Existing aggregate rows remain NULL and are treated as legacy
-- evidence; duplicate-item Purchase Orders fail closed until such evidence is resolved.

ALTER TABLE purchase_order_progress_entries
ADD COLUMN purchase_order_item_row_id TEXT;

CREATE INDEX IF NOT EXISTS idx_po_progress_row
ON purchase_order_progress_entries(
  tenant_id,purchase_order,kind,item_code,purchase_order_item_row_id,posting_at
);

DROP TRIGGER IF EXISTS purchase_progress_reference_guard;

CREATE TRIGGER purchase_progress_reference_guard
BEFORE INSERT ON purchase_order_progress_entries
BEGIN
  SELECT CASE
    WHEN NOT EXISTS (
      SELECT 1 FROM documents
      WHERE tenant_id=NEW.tenant_id
        AND doc_key='Purchase Order:' || NEW.purchase_order
        AND doctype='Purchase Order'
        AND docstatus=1
    ) THEN RAISE(ABORT,'PURCHASE_REFERENCE_SOURCE_NOT_FOUND')

    WHEN NOT EXISTS (
      SELECT 1 FROM document_children
      WHERE tenant_id=NEW.tenant_id
        AND parent_key='Purchase Order:' || NEW.purchase_order
        AND fieldname='items'
        AND json_extract(payload_json,'$.item_code')=NEW.item_code
    ) THEN RAISE(ABORT,'PURCHASE_REFERENCE_ITEM_NOT_FOUND')

    WHEN NEW.purchase_order_item_row_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM document_children
        WHERE tenant_id=NEW.tenant_id
          AND parent_key='Purchase Order:' || NEW.purchase_order
          AND fieldname='items'
          AND row_id=NEW.purchase_order_item_row_id
          AND json_extract(payload_json,'$.item_code')=NEW.item_code
      )
      THEN RAISE(ABORT,'PURCHASE_REFERENCE_ROW_NOT_FOUND')

    -- Aggregate compatibility invariant: all progress for an item remains non-negative.
    WHEN COALESCE((
      SELECT SUM(qty_micros)
      FROM purchase_order_progress_entries
      WHERE tenant_id=NEW.tenant_id
        AND purchase_order=NEW.purchase_order
        AND kind=NEW.kind
        AND item_code=NEW.item_code
    ),0)+NEW.qty_micros < 0
      THEN RAISE(ABORT,'PURCHASE_REFERENCE_QUANTITY_NEGATIVE')

    -- New exact-row invariant: reversal cannot drive one PO row below zero.
    WHEN NEW.purchase_order_item_row_id IS NOT NULL
      AND COALESCE((
        SELECT SUM(qty_micros)
        FROM purchase_order_progress_entries
        WHERE tenant_id=NEW.tenant_id
          AND purchase_order=NEW.purchase_order
          AND kind=NEW.kind
          AND item_code=NEW.item_code
          AND purchase_order_item_row_id=NEW.purchase_order_item_row_id
      ),0)+NEW.qty_micros < 0
      THEN RAISE(ABORT,'PURCHASE_REFERENCE_ROW_QUANTITY_NEGATIVE')

    -- Preserve the existing aggregate hard ceiling (Receipt may use supplier tolerance).
    WHEN COALESCE((
      SELECT SUM(qty_micros)
      FROM purchase_order_progress_entries
      WHERE tenant_id=NEW.tenant_id
        AND purchase_order=NEW.purchase_order
        AND kind=NEW.kind
        AND item_code=NEW.item_code
    ),0)+NEW.qty_micros >
      CAST(
        (SELECT COALESCE(SUM(CAST(COALESCE(
          json_extract(payload_json,'$.stock_qty_micros'),
          json_extract(payload_json,'$.qty_micros')
        ) AS INTEGER)),0)
         FROM document_children
         WHERE tenant_id=NEW.tenant_id
           AND parent_key='Purchase Order:' || NEW.purchase_order
           AND fieldname='items'
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

    -- Exact-row ceiling prevents one duplicate item row consuming another row's approval.
    WHEN NEW.purchase_order_item_row_id IS NOT NULL
      AND COALESCE((
        SELECT SUM(qty_micros)
        FROM purchase_order_progress_entries
        WHERE tenant_id=NEW.tenant_id
          AND purchase_order=NEW.purchase_order
          AND kind=NEW.kind
          AND item_code=NEW.item_code
          AND purchase_order_item_row_id=NEW.purchase_order_item_row_id
      ),0)+NEW.qty_micros >
      CAST(
        COALESCE((
          SELECT CAST(COALESCE(
            json_extract(payload_json,'$.stock_qty_micros'),
            json_extract(payload_json,'$.qty_micros')
          ) AS INTEGER)
          FROM document_children
          WHERE tenant_id=NEW.tenant_id
            AND parent_key='Purchase Order:' || NEW.purchase_order
            AND fieldname='items'
            AND row_id=NEW.purchase_order_item_row_id
            AND json_extract(payload_json,'$.item_code')=NEW.item_code
          LIMIT 1
        ),0)
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
      THEN RAISE(ABORT,'PURCHASE_REFERENCE_ROW_QUANTITY_EXCEEDED')
  END;
END;
