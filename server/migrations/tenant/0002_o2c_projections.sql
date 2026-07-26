CREATE VIEW IF NOT EXISTS receivable_outstanding AS
SELECT tenant_id, party, currency, currency_scale, against_voucher_type, against_voucher_no,
       SUM(amount_minor) AS outstanding_minor,
       CAST(SUM(amount_minor) AS REAL) / CASE currency_scale
         WHEN 0 THEN 1 WHEN 1 THEN 10 WHEN 2 THEN 100 WHEN 3 THEN 1000
         WHEN 4 THEN 10000 WHEN 5 THEN 100000 ELSE 1000000 END AS outstanding_amount
FROM payment_ledger_entries
WHERE account_type='Receivable'
GROUP BY tenant_id, party, currency, currency_scale, against_voucher_type, against_voucher_no;

CREATE VIEW IF NOT EXISTS stock_balance AS
SELECT tenant_id, item_code, warehouse, currency, currency_scale,
       SUM(actual_qty_micros) AS actual_qty_micros,
       CAST(SUM(actual_qty_micros) AS REAL) / 1000000.0 AS actual_qty,
       SUM(stock_value_difference_minor) AS stock_value_minor,
       CAST(SUM(stock_value_difference_minor) AS REAL) / CASE currency_scale
         WHEN 0 THEN 1 WHEN 1 THEN 10 WHEN 2 THEN 100 WHEN 3 THEN 1000
         WHEN 4 THEN 10000 WHEN 5 THEN 100000 ELSE 1000000 END AS stock_value
FROM stock_ledger_entries
GROUP BY tenant_id, item_code, warehouse, currency, currency_scale;

CREATE TABLE IF NOT EXISTS prepared_reports (
  tenant_id TEXT NOT NULL,
  job_id TEXT NOT NULL,
  report_name TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  request_json TEXT NOT NULL CHECK (json_valid(request_json)),
  status TEXT NOT NULL CHECK (status IN ('queued','running','completed','failed','expired')),
  result_json TEXT CHECK (result_json IS NULL OR json_valid(result_json)),
  error_message TEXT,
  created_at TEXT NOT NULL,
  started_at TEXT,
  completed_at TEXT,
  expires_at TEXT NOT NULL,
  PRIMARY KEY (tenant_id, job_id)
);
CREATE INDEX IF NOT EXISTS idx_prepared_reports_status ON prepared_reports(tenant_id, status, created_at);
