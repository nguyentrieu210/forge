-- Correct the lifecycle side of the M1 obligation trigger.
--
-- In a Purchase Order cancel command the document update and the signed obligation
-- reversal are committed in the same D1 batch. The reversal therefore sees
-- docstatus=2, not docstatus=1. Keep the row/reference checks, but validate the
-- expected lifecycle per event kind instead of treating open and cancel alike.

DROP TRIGGER IF EXISTS purchase_obligation_window_guard;

CREATE TRIGGER purchase_obligation_window_guard
BEFORE INSERT ON purchase_window_obligation_entries
BEGIN
  SELECT CASE
    WHEN NOT EXISTS (
      SELECT 1 FROM purchase_settlement_windows
      WHERE tenant_id=NEW.tenant_id AND window_id=NEW.window_id
        AND queue_key=NEW.queue_key AND status='Open'
    ) THEN RAISE(ABORT,'PURCHASE_ALLOCATION_WINDOW_NOT_OPEN')
    WHEN NEW.source='live' AND NEW.entry_kind='open' AND NOT EXISTS (
      SELECT 1 FROM documents
      WHERE tenant_id=NEW.tenant_id
        AND doc_key='Purchase Order:' || NEW.purchase_order
        AND doctype='Purchase Order' AND docstatus=1
    ) THEN RAISE(ABORT,'PURCHASE_ALLOCATION_PO_NOT_SUBMITTED')
    WHEN NEW.source='live' AND NEW.entry_kind='cancel' AND NOT EXISTS (
      SELECT 1 FROM documents
      WHERE tenant_id=NEW.tenant_id
        AND doc_key='Purchase Order:' || NEW.purchase_order
        AND doctype='Purchase Order' AND docstatus=2
    ) THEN RAISE(ABORT,'PURCHASE_ALLOCATION_PO_NOT_CANCELLED')
    WHEN NEW.source='live' AND NOT EXISTS (
      SELECT 1 FROM document_children
      WHERE tenant_id=NEW.tenant_id
        AND parent_key='Purchase Order:' || NEW.purchase_order
        AND fieldname='items' AND row_id=NEW.purchase_order_item_row_id
    ) THEN RAISE(ABORT,'PURCHASE_ALLOCATION_PO_ROW_NOT_FOUND')
    WHEN NEW.purchase_order_item_row_id IS NOT NULL AND COALESCE((
      SELECT SUM(qty_micros) FROM purchase_window_obligation_entries
      WHERE tenant_id=NEW.tenant_id AND purchase_order=NEW.purchase_order
        AND purchase_order_item_row_id=NEW.purchase_order_item_row_id
    ),0) + NEW.qty_micros < 0
      THEN RAISE(ABORT,'PURCHASE_OBLIGATION_QUANTITY_NEGATIVE')
  END;
END;
