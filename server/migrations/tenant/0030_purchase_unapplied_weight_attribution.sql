-- Preserve theoretical and projected actual-weight attribution while a Purchase
-- Receipt quantity is temporarily unapplied. A later Purchase Order may consume
-- this balance through an `apply_unapplied` event without rereading mutable UI
-- payloads or inventing weight values.

ALTER TABLE purchase_unapplied_receipt_entries
  ADD COLUMN barem_weight_micros INTEGER NOT NULL DEFAULT 0;

ALTER TABLE purchase_unapplied_receipt_entries
  ADD COLUMN projected_actual_weight_micros INTEGER;

ALTER TABLE purchase_unapplied_receipt_entries
  ADD COLUMN projection_version INTEGER;

CREATE TRIGGER IF NOT EXISTS purchase_unapplied_weight_guard
BEFORE INSERT ON purchase_unapplied_receipt_entries
BEGIN
  SELECT CASE
    WHEN NEW.qty_micros > 0 AND NEW.barem_weight_micros < 0
      THEN RAISE(ABORT, 'PURCHASE_UNAPPLIED_BAREM_SIGN')
    WHEN NEW.qty_micros < 0 AND NEW.barem_weight_micros > 0
      THEN RAISE(ABORT, 'PURCHASE_UNAPPLIED_BAREM_SIGN')
    WHEN NEW.projected_actual_weight_micros IS NOT NULL
      AND NEW.qty_micros > 0 AND NEW.projected_actual_weight_micros < 0
      THEN RAISE(ABORT, 'PURCHASE_UNAPPLIED_ACTUAL_WEIGHT_SIGN')
    WHEN NEW.projected_actual_weight_micros IS NOT NULL
      AND NEW.qty_micros < 0 AND NEW.projected_actual_weight_micros > 0
      THEN RAISE(ABORT, 'PURCHASE_UNAPPLIED_ACTUAL_WEIGHT_SIGN')
    WHEN (NEW.projected_actual_weight_micros IS NULL) != (NEW.projection_version IS NULL)
      THEN RAISE(ABORT, 'PURCHASE_UNAPPLIED_PROJECTION_PAIR')
    WHEN NEW.projection_version IS NOT NULL AND NEW.projection_version <= 0
      THEN RAISE(ABORT, 'PURCHASE_UNAPPLIED_PROJECTION_VERSION')
  END;
END;
