CREATE TABLE IF NOT EXISTS commercial_stock_reservations (
  tenant_id TEXT NOT NULL,
  reservation_id TEXT NOT NULL,
  source_doctype TEXT NOT NULL,
  source_name TEXT NOT NULL,
  item_code TEXT NOT NULL,
  warehouse TEXT NOT NULL,
  qty_micros INTEGER NOT NULL CHECK(qty_micros > 0),
  status TEXT NOT NULL CHECK(status IN ('active','committed','released','expired')),
  expires_at TEXT,
  released_reason TEXT,
  created_at TEXT NOT NULL,
  modified_at TEXT NOT NULL,
  PRIMARY KEY(tenant_id, reservation_id),
  UNIQUE(tenant_id, source_doctype, source_name, item_code, warehouse)
);

CREATE INDEX IF NOT EXISTS idx_commercial_stock_reservation_atp
  ON commercial_stock_reservations(tenant_id, item_code, warehouse, status, expires_at);

CREATE INDEX IF NOT EXISTS idx_commercial_stock_reservation_source
  ON commercial_stock_reservations(tenant_id, source_doctype, source_name, status);
