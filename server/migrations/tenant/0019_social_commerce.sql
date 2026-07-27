CREATE TABLE IF NOT EXISTS social_connections (
  tenant_id TEXT NOT NULL,
  connection_id TEXT NOT NULL,
  provider TEXT NOT NULL CHECK(provider IN ('facebook','tiktok')),
  external_account_id_ciphertext TEXT NOT NULL,
  access_token_ciphertext TEXT NOT NULL,
  token_expires_at TEXT,
  scopes_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL CHECK(status IN ('active','reauthorization_required','revoked')),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  modified_at TEXT NOT NULL,
  PRIMARY KEY(tenant_id, connection_id)
);

CREATE TABLE IF NOT EXISTS social_pages (
  tenant_id TEXT NOT NULL,
  page_id TEXT NOT NULL,
  connection_id TEXT NOT NULL,
  provider TEXT NOT NULL CHECK(provider IN ('facebook','tiktok')),
  external_page_id_ciphertext TEXT NOT NULL,
  page_name TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('active','paused','revoked')),
  created_at TEXT NOT NULL,
  modified_at TEXT NOT NULL,
  PRIMARY KEY(tenant_id, page_id),
  FOREIGN KEY(tenant_id, connection_id) REFERENCES social_connections(tenant_id, connection_id)
);

CREATE TABLE IF NOT EXISTS social_events (
  tenant_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  page_id TEXT NOT NULL,
  event_kind TEXT NOT NULL,
  external_actor_id TEXT,
  message_text TEXT,
  payload_json TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  received_at TEXT NOT NULL,
  processed_at TEXT,
  PRIMARY KEY(tenant_id, event_id)
);

CREATE INDEX IF NOT EXISTS idx_social_events_inbox
  ON social_events(tenant_id, page_id, received_at DESC);

CREATE TABLE IF NOT EXISTS social_keyword_rules (
  tenant_id TEXT NOT NULL,
  rule_id TEXT NOT NULL,
  page_id TEXT NOT NULL,
  keyword TEXT NOT NULL,
  sku TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1 CHECK(quantity > 0),
  status TEXT NOT NULL CHECK(status IN ('active','paused')),
  created_at TEXT NOT NULL,
  modified_at TEXT NOT NULL,
  PRIMARY KEY(tenant_id, rule_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_social_keyword_rules_match
  ON social_keyword_rules(tenant_id, page_id, keyword COLLATE NOCASE)
  WHERE status='active';

CREATE TABLE IF NOT EXISTS social_carts (
  tenant_id TEXT NOT NULL,
  cart_id TEXT NOT NULL,
  page_id TEXT NOT NULL,
  external_actor_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('open','confirmed','converted','abandoned')),
  customer_name TEXT,
  phone TEXT,
  address TEXT,
  created_at TEXT NOT NULL,
  modified_at TEXT NOT NULL,
  PRIMARY KEY(tenant_id, cart_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_social_carts_open_actor
  ON social_carts(tenant_id, page_id, external_actor_id)
  WHERE status='open';

CREATE TABLE IF NOT EXISTS social_cart_items (
  tenant_id TEXT NOT NULL,
  cart_id TEXT NOT NULL,
  sku TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK(quantity > 0),
  source_event_id TEXT NOT NULL,
  modified_at TEXT NOT NULL,
  PRIMARY KEY(tenant_id, cart_id, sku),
  FOREIGN KEY(tenant_id, cart_id) REFERENCES social_carts(tenant_id, cart_id)
);

CREATE TABLE IF NOT EXISTS social_orders (
  tenant_id TEXT NOT NULL,
  order_id TEXT NOT NULL,
  cart_id TEXT NOT NULL,
  sales_order_name TEXT,
  status TEXT NOT NULL CHECK(status IN ('draft','confirmed','packing','shipped','completed','cancelled','returned')),
  cod_amount_minor INTEGER NOT NULL DEFAULT 0 CHECK(cod_amount_minor >= 0),
  currency TEXT NOT NULL DEFAULT 'VND',
  created_at TEXT NOT NULL,
  modified_at TEXT NOT NULL,
  PRIMARY KEY(tenant_id, order_id),
  UNIQUE(tenant_id, cart_id)
);

CREATE TABLE IF NOT EXISTS social_shipments (
  tenant_id TEXT NOT NULL,
  shipment_id TEXT NOT NULL,
  order_id TEXT NOT NULL,
  carrier TEXT NOT NULL,
  tracking_code TEXT,
  status TEXT NOT NULL CHECK(status IN ('ready','picked_up','in_transit','delivered','failed','returned')),
  cod_expected_minor INTEGER NOT NULL DEFAULT 0,
  cod_collected_minor INTEGER,
  cod_reconciled_at TEXT,
  created_at TEXT NOT NULL,
  modified_at TEXT NOT NULL,
  PRIMARY KEY(tenant_id, shipment_id),
  FOREIGN KEY(tenant_id, order_id) REFERENCES social_orders(tenant_id, order_id)
);
