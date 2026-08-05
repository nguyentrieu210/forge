CREATE TABLE IF NOT EXISTS marketplace_settlement_evidence (
  tenant_id TEXT NOT NULL,
  settlement_id TEXT NOT NULL,
  order_id TEXT NOT NULL,
  provider TEXT NOT NULL CHECK(provider IN ('shopee','lazada','tiktok_shop')),
  external_settlement_id TEXT NOT NULL,
  currency TEXT NOT NULL,
  gross_minor INTEGER NOT NULL CHECK(gross_minor >= 0),
  commission_minor INTEGER NOT NULL DEFAULT 0 CHECK(commission_minor >= 0),
  service_fee_minor INTEGER NOT NULL DEFAULT 0 CHECK(service_fee_minor >= 0),
  seller_shipping_fee_minor INTEGER NOT NULL DEFAULT 0 CHECK(seller_shipping_fee_minor >= 0),
  seller_voucher_minor INTEGER NOT NULL DEFAULT 0 CHECK(seller_voucher_minor >= 0),
  refund_minor INTEGER NOT NULL DEFAULT 0 CHECK(refund_minor >= 0),
  other_deductions_minor INTEGER NOT NULL DEFAULT 0 CHECK(other_deductions_minor >= 0),
  platform_subsidy_minor INTEGER NOT NULL DEFAULT 0 CHECK(platform_subsidy_minor >= 0),
  other_credits_minor INTEGER NOT NULL DEFAULT 0 CHECK(other_credits_minor >= 0),
  expected_payout_minor INTEGER NOT NULL,
  payout_minor INTEGER NOT NULL CHECK(payout_minor >= 0),
  variance_minor INTEGER NOT NULL,
  sales_invoice_name TEXT,
  payment_entry_name TEXT,
  cash_evidence_verified INTEGER NOT NULL DEFAULT 0 CHECK(cash_evidence_verified IN (0,1)),
  status TEXT NOT NULL CHECK(status IN ('reconciled','variance')),
  occurred_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  modified_at TEXT NOT NULL,
  PRIMARY KEY(tenant_id, settlement_id),
  UNIQUE(tenant_id, provider, external_settlement_id),
  FOREIGN KEY(tenant_id, order_id) REFERENCES social_orders(tenant_id, order_id)
);

CREATE INDEX IF NOT EXISTS idx_marketplace_settlement_order
  ON marketplace_settlement_evidence(tenant_id, order_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_marketplace_settlement_status
  ON marketplace_settlement_evidence(tenant_id, status, occurred_at DESC);
