-- Permit append-only cancellation corrections after settlement reversal.
-- A reversed settlement window remains closed to new obligations, allocations and
-- unapplied receipts. Only signed reversal rows may be appended so operators can
-- follow the documented sequence: reverse settlement, then cancel the Receipt.

DROP TRIGGER IF EXISTS purchase_allocation_reference_guard;

CREATE TRIGGER purchase_allocation_reference_guard
BEFORE INSERT ON purchase_receipt_allocation_entries
BEGIN
  SELECT CASE
    WHEN NOT EXISTS (
      SELECT 1 FROM purchase_settlement_windows
      WHERE tenant_id=NEW.tenant_id AND window_id=NEW.window_id
        AND queue_key=NEW.queue_key
        AND (status='Open' OR (status='Reversed' AND NEW.entry_kind='reverse'))
    ) THEN RAISE(ABORT,'PURCHASE_ALLOCATION_WINDOW_NOT_OPEN')
    WHEN NEW.source='live' AND NOT EXISTS (
      SELECT 1 FROM document_children
      WHERE tenant_id=NEW.tenant_id
        AND parent_key='Purchase Receipt:' || NEW.voucher_no
        AND fieldname='items' AND row_id=NEW.receipt_item_row_id
    ) THEN RAISE(ABORT,'PURCHASE_ALLOCATION_RECEIPT_ROW_NOT_FOUND')
    WHEN NEW.source='live' AND NOT EXISTS (
      SELECT 1 FROM document_children
      WHERE tenant_id=NEW.tenant_id
        AND parent_key='Purchase Order:' || NEW.purchase_order
        AND fieldname='items' AND row_id=NEW.purchase_order_item_row_id
    ) THEN RAISE(ABORT,'PURCHASE_ALLOCATION_PO_ROW_NOT_FOUND')
    WHEN NEW.entry_kind='reverse' AND NOT EXISTS (
      SELECT 1 FROM purchase_receipt_allocation_entries source
      WHERE source.tenant_id=NEW.tenant_id AND source.entry_id=NEW.reversal_of_entry_id
        AND source.qty_micros > 0 AND source.queue_key=NEW.queue_key
        AND source.window_id=NEW.window_id
        AND source.purchase_order=NEW.purchase_order
        AND source.purchase_order_item_row_id IS NEW.purchase_order_item_row_id
    ) THEN RAISE(ABORT,'PURCHASE_ALLOCATION_REVERSAL_SOURCE_INVALID')
    WHEN NEW.entry_kind='reverse' AND COALESCE((
      SELECT SUM(-reversal.qty_micros)
      FROM purchase_receipt_allocation_entries reversal
      WHERE reversal.tenant_id=NEW.tenant_id
        AND reversal.reversal_of_entry_id=NEW.reversal_of_entry_id
        AND reversal.entry_kind='reverse'
    ),0) + (-NEW.qty_micros) > (
      SELECT source.qty_micros FROM purchase_receipt_allocation_entries source
      WHERE source.tenant_id=NEW.tenant_id AND source.entry_id=NEW.reversal_of_entry_id
    ) THEN RAISE(ABORT,'PURCHASE_ALLOCATION_REVERSAL_EXCEEDED')
    WHEN NEW.purchase_order_item_row_id IS NOT NULL AND COALESCE((
      SELECT SUM(qty_micros) FROM purchase_receipt_allocation_entries
      WHERE tenant_id=NEW.tenant_id AND purchase_order=NEW.purchase_order
        AND purchase_order_item_row_id=NEW.purchase_order_item_row_id
    ),0) + NEW.qty_micros < 0
      THEN RAISE(ABORT,'PURCHASE_ALLOCATION_QUANTITY_NEGATIVE')
    WHEN NEW.purchase_order_item_row_id IS NOT NULL AND COALESCE((
      SELECT SUM(qty_micros) FROM purchase_receipt_allocation_entries
      WHERE tenant_id=NEW.tenant_id AND purchase_order=NEW.purchase_order
        AND purchase_order_item_row_id=NEW.purchase_order_item_row_id
    ),0) + NEW.qty_micros > COALESCE((
      SELECT SUM(qty_micros) FROM purchase_window_obligation_entries
      WHERE tenant_id=NEW.tenant_id AND purchase_order=NEW.purchase_order
        AND purchase_order_item_row_id=NEW.purchase_order_item_row_id
    ),0) THEN RAISE(ABORT,'PURCHASE_ALLOCATION_QUANTITY_EXCEEDED')
  END;
END;

DROP TRIGGER IF EXISTS purchase_unapplied_balance_guard;

CREATE TRIGGER purchase_unapplied_balance_guard
BEFORE INSERT ON purchase_unapplied_receipt_entries
BEGIN
  SELECT CASE
    WHEN NOT EXISTS (
      SELECT 1 FROM purchase_settlement_windows
      WHERE tenant_id=NEW.tenant_id AND window_id=NEW.window_id
        AND queue_key=NEW.queue_key
        AND (status='Open' OR (status='Reversed' AND NEW.entry_kind='reverse'))
    ) THEN RAISE(ABORT,'PURCHASE_ALLOCATION_WINDOW_NOT_OPEN')
    WHEN NEW.entry_kind!='receive' AND NOT EXISTS (
      SELECT 1 FROM purchase_unapplied_receipt_entries source
      WHERE source.tenant_id=NEW.tenant_id AND source.entry_id=NEW.source_entry_id
        AND source.entry_kind='receive' AND source.qty_micros > 0
        AND source.window_id=NEW.window_id AND source.queue_key=NEW.queue_key
    ) THEN RAISE(ABORT,'PURCHASE_UNAPPLIED_SOURCE_INVALID')
    WHEN NEW.entry_kind!='receive' AND COALESCE((
      SELECT SUM(-movement.qty_micros)
      FROM purchase_unapplied_receipt_entries movement
      WHERE movement.tenant_id=NEW.tenant_id
        AND movement.source_entry_id=NEW.source_entry_id
        AND movement.entry_kind IN ('apply','reverse','settle')
    ),0) + (-NEW.qty_micros) > (
      SELECT source.qty_micros FROM purchase_unapplied_receipt_entries source
      WHERE source.tenant_id=NEW.tenant_id AND source.entry_id=NEW.source_entry_id
    ) THEN RAISE(ABORT,'PURCHASE_UNAPPLIED_QUANTITY_EXCEEDED')
  END;
END;
