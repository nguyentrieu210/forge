-- Warehouse petty cash per warehouse.
--
-- Authoritative money remains in immutable gl_entries. The two master_records below
-- are server projections maintained in the SAME SQLite transaction by triggers so
-- controllers can read current balance/daily usage without scanning a bounded list
-- of documents. They are not a second ledger and are fully rebuildable from GL.

CREATE TRIGGER IF NOT EXISTS warehouse_cash_fund_mapping_immutable
BEFORE UPDATE ON documents
WHEN OLD.doctype='Warehouse Cash Fund'
  AND EXISTS (
    SELECT 1 FROM master_records p
    WHERE p.tenant_id=OLD.tenant_id
      AND p.record_type='Warehouse Cash Balance'
      AND p.name=OLD.name
      AND COALESCE(CAST(json_extract(p.data_json,'$.has_activity') AS INTEGER),0)=1
  )
  AND (
    json_extract(OLD.payload_json,'$.company') IS NOT json_extract(NEW.payload_json,'$.company')
    OR json_extract(OLD.payload_json,'$.warehouse') IS NOT json_extract(NEW.payload_json,'$.warehouse')
    OR json_extract(OLD.payload_json,'$.cash_account') IS NOT json_extract(NEW.payload_json,'$.cash_account')
    OR json_extract(OLD.payload_json,'$.currency') IS NOT json_extract(NEW.payload_json,'$.currency')
  )
BEGIN
  SELECT RAISE(ABORT, 'WAREHOUSE_CASH_FUND_MAPPING_IMMUTABLE');
END;

CREATE TRIGGER IF NOT EXISTS warehouse_cash_fund_disable_nonzero_guard
BEFORE UPDATE ON documents
WHEN OLD.doctype='Warehouse Cash Fund'
  AND COALESCE(CAST(json_extract(OLD.payload_json,'$.disabled') AS INTEGER),0)=0
  AND COALESCE(CAST(json_extract(NEW.payload_json,'$.disabled') AS INTEGER),0)=1
  AND COALESCE(CAST((
    SELECT json_extract(p.data_json,'$.current_balance_minor')
    FROM master_records p
    WHERE p.tenant_id=OLD.tenant_id
      AND p.record_type='Warehouse Cash Balance'
      AND p.name=OLD.name
  ) AS INTEGER),0)<>0
BEGIN
  SELECT RAISE(ABORT, 'WAREHOUSE_CASH_NONZERO_DISABLE');
END;

CREATE TRIGGER IF NOT EXISTS warehouse_cash_fund_delete_history_guard
BEFORE DELETE ON documents
WHEN OLD.doctype='Warehouse Cash Fund'
  AND EXISTS (
    SELECT 1 FROM master_records p
    WHERE p.tenant_id=OLD.tenant_id
      AND p.record_type='Warehouse Cash Balance'
      AND p.name=OLD.name
      AND COALESCE(CAST(json_extract(p.data_json,'$.has_activity') AS INTEGER),0)=1
  )
BEGIN
  SELECT RAISE(ABORT, 'WAREHOUSE_CASH_FUND_HAS_ACTIVITY');
END;

CREATE TRIGGER IF NOT EXISTS warehouse_cash_gl_guard
BEFORE INSERT ON gl_entries
WHEN json_extract(NEW.dimensions_json,'$.warehouse_cash_fund') IS NOT NULL
BEGIN
  SELECT CASE
    WHEN NOT EXISTS (
      SELECT 1 FROM documents f
      WHERE f.tenant_id=NEW.tenant_id
        AND f.doctype='Warehouse Cash Fund'
        AND f.name=json_extract(NEW.dimensions_json,'$.warehouse_cash_fund')
        AND f.docstatus<>2
        AND COALESCE(CAST(json_extract(f.payload_json,'$.disabled') AS INTEGER),0)=0
    ) THEN RAISE(ABORT, 'WAREHOUSE_CASH_FUND_NOT_AVAILABLE')

    WHEN NEW.account IS NOT (
      SELECT json_extract(f.payload_json,'$.cash_account')
      FROM documents f
      WHERE f.tenant_id=NEW.tenant_id
        AND f.doctype='Warehouse Cash Fund'
        AND f.name=json_extract(NEW.dimensions_json,'$.warehouse_cash_fund')
      LIMIT 1
    ) THEN RAISE(ABORT, 'WAREHOUSE_CASH_ACCOUNT_MISMATCH')

    WHEN NEW.currency IS NOT (
      SELECT json_extract(f.payload_json,'$.currency')
      FROM documents f
      WHERE f.tenant_id=NEW.tenant_id
        AND f.doctype='Warehouse Cash Fund'
        AND f.name=json_extract(NEW.dimensions_json,'$.warehouse_cash_fund')
      LIMIT 1
    ) THEN RAISE(ABORT, 'WAREHOUSE_CASH_CURRENCY_MISMATCH')

    WHEN json_extract(NEW.dimensions_json,'$.warehouse') IS NOT (
      SELECT json_extract(f.payload_json,'$.warehouse')
      FROM documents f
      WHERE f.tenant_id=NEW.tenant_id
        AND f.doctype='Warehouse Cash Fund'
        AND f.name=json_extract(NEW.dimensions_json,'$.warehouse_cash_fund')
      LIMIT 1
    ) THEN RAISE(ABORT, 'WAREHOUSE_CASH_WAREHOUSE_MISMATCH')

    WHEN COALESCE(CAST((
      SELECT json_extract(p.data_json,'$.current_balance_minor')
      FROM master_records p
      WHERE p.tenant_id=NEW.tenant_id
        AND p.record_type='Warehouse Cash Balance'
        AND p.name=json_extract(NEW.dimensions_json,'$.warehouse_cash_fund')
    ) AS INTEGER),0) + NEW.debit_minor - NEW.credit_minor < 0
    THEN RAISE(ABORT, 'WAREHOUSE_CASH_NEGATIVE_BALANCE')

    WHEN COALESCE(CAST((
      SELECT json_extract(f.payload_json,'$.max_balance_minor')
      FROM documents f
      WHERE f.tenant_id=NEW.tenant_id
        AND f.doctype='Warehouse Cash Fund'
        AND f.name=json_extract(NEW.dimensions_json,'$.warehouse_cash_fund')
    ) AS INTEGER),0) > 0
      AND COALESCE(CAST((
        SELECT json_extract(p.data_json,'$.current_balance_minor')
        FROM master_records p
        WHERE p.tenant_id=NEW.tenant_id
          AND p.record_type='Warehouse Cash Balance'
          AND p.name=json_extract(NEW.dimensions_json,'$.warehouse_cash_fund')
      ) AS INTEGER),0) + NEW.debit_minor - NEW.credit_minor > COALESCE(CAST((
        SELECT json_extract(f.payload_json,'$.max_balance_minor')
        FROM documents f
        WHERE f.tenant_id=NEW.tenant_id
          AND f.doctype='Warehouse Cash Fund'
          AND f.name=json_extract(NEW.dimensions_json,'$.warehouse_cash_fund')
      ) AS INTEGER),0)
    THEN RAISE(ABORT, 'WAREHOUSE_CASH_MAX_BALANCE')

    WHEN NEW.voucher_type='Warehouse Cash Voucher'
      AND json_extract(NEW.dimensions_json,'$.warehouse_cash_flow')='outgoing'
      AND COALESCE(CAST((
        SELECT json_extract(f.payload_json,'$.daily_limit_minor')
        FROM documents f
        WHERE f.tenant_id=NEW.tenant_id
          AND f.doctype='Warehouse Cash Fund'
          AND f.name=json_extract(NEW.dimensions_json,'$.warehouse_cash_fund')
      ) AS INTEGER),0) > 0
      AND COALESCE(CAST((
        SELECT json_extract(p.data_json,'$.outgoing_minor')
        FROM master_records p
        WHERE p.tenant_id=NEW.tenant_id
          AND p.record_type='Warehouse Cash Daily Usage'
          AND p.name=json_extract(NEW.dimensions_json,'$.warehouse_cash_fund') || ':' || substr(NEW.posting_at,1,10)
      ) AS INTEGER),0) + NEW.credit_minor - NEW.debit_minor > COALESCE(CAST((
        SELECT json_extract(f.payload_json,'$.daily_limit_minor')
        FROM documents f
        WHERE f.tenant_id=NEW.tenant_id
          AND f.doctype='Warehouse Cash Fund'
          AND f.name=json_extract(NEW.dimensions_json,'$.warehouse_cash_fund')
      ) AS INTEGER),0)
    THEN RAISE(ABORT, 'WAREHOUSE_CASH_DAILY_LIMIT')

    WHEN NEW.voucher_type='Warehouse Cash Voucher'
      AND json_extract(NEW.dimensions_json,'$.warehouse_cash_flow')='outgoing'
      AND COALESCE(CAST((
        SELECT json_extract(p.data_json,'$.outgoing_minor')
        FROM master_records p
        WHERE p.tenant_id=NEW.tenant_id
          AND p.record_type='Warehouse Cash Daily Usage'
          AND p.name=json_extract(NEW.dimensions_json,'$.warehouse_cash_fund') || ':' || substr(NEW.posting_at,1,10)
      ) AS INTEGER),0) + NEW.credit_minor - NEW.debit_minor < 0
    THEN RAISE(ABORT, 'WAREHOUSE_CASH_DAILY_USAGE_NEGATIVE')
  END;
END;

CREATE TRIGGER IF NOT EXISTS warehouse_cash_balance_projection
AFTER INSERT ON gl_entries
WHEN json_extract(NEW.dimensions_json,'$.warehouse_cash_fund') IS NOT NULL
BEGIN
  INSERT INTO master_records(tenant_id,record_type,name,disabled,data_json,modified_at)
  VALUES(
    NEW.tenant_id,
    'Warehouse Cash Balance',
    json_extract(NEW.dimensions_json,'$.warehouse_cash_fund'),
    0,
    json_object(
      'current_balance_minor', NEW.debit_minor - NEW.credit_minor,
      'has_activity', 1,
      'last_posting_at', NEW.posting_at
    ),
    strftime('%Y-%m-%dT%H:%M:%fZ','now')
  )
  ON CONFLICT(tenant_id,record_type,name) DO UPDATE SET
    disabled=0,
    data_json=json_object(
      'current_balance_minor', COALESCE(CAST(json_extract(master_records.data_json,'$.current_balance_minor') AS INTEGER),0) + NEW.debit_minor - NEW.credit_minor,
      'has_activity', 1,
      'last_posting_at', NEW.posting_at
    ),
    modified_at=strftime('%Y-%m-%dT%H:%M:%fZ','now');
END;

CREATE TRIGGER IF NOT EXISTS warehouse_cash_daily_usage_projection
AFTER INSERT ON gl_entries
WHEN NEW.voucher_type='Warehouse Cash Voucher'
  AND json_extract(NEW.dimensions_json,'$.warehouse_cash_flow')='outgoing'
  AND json_extract(NEW.dimensions_json,'$.warehouse_cash_fund') IS NOT NULL
BEGIN
  INSERT INTO master_records(tenant_id,record_type,name,disabled,data_json,modified_at)
  VALUES(
    NEW.tenant_id,
    'Warehouse Cash Daily Usage',
    json_extract(NEW.dimensions_json,'$.warehouse_cash_fund') || ':' || substr(NEW.posting_at,1,10),
    0,
    json_object('outgoing_minor', NEW.credit_minor - NEW.debit_minor),
    strftime('%Y-%m-%dT%H:%M:%fZ','now')
  )
  ON CONFLICT(tenant_id,record_type,name) DO UPDATE SET
    disabled=0,
    data_json=json_object(
      'outgoing_minor', COALESCE(CAST(json_extract(master_records.data_json,'$.outgoing_minor') AS INTEGER),0) + NEW.credit_minor - NEW.debit_minor
    ),
    modified_at=strftime('%Y-%m-%dT%H:%M:%fZ','now');
END;

INSERT INTO master_records(tenant_id,record_type,name,disabled,data_json,modified_at)
SELECT
  tenant_id,
  'Warehouse Cash Balance',
  json_extract(dimensions_json,'$.warehouse_cash_fund') AS fund,
  0,
  json_object(
    'current_balance_minor', SUM(debit_minor-credit_minor),
    'has_activity', 1,
    'last_posting_at', MAX(posting_at)
  ),
  strftime('%Y-%m-%dT%H:%M:%fZ','now')
FROM gl_entries
WHERE json_extract(dimensions_json,'$.warehouse_cash_fund') IS NOT NULL
GROUP BY tenant_id,json_extract(dimensions_json,'$.warehouse_cash_fund')
ON CONFLICT(tenant_id,record_type,name) DO UPDATE SET
  disabled=0,
  data_json=excluded.data_json,
  modified_at=excluded.modified_at;

INSERT INTO master_records(tenant_id,record_type,name,disabled,data_json,modified_at)
SELECT
  tenant_id,
  'Warehouse Cash Daily Usage',
  json_extract(dimensions_json,'$.warehouse_cash_fund') || ':' || substr(posting_at,1,10),
  0,
  json_object('outgoing_minor', SUM(credit_minor-debit_minor)),
  strftime('%Y-%m-%dT%H:%M:%fZ','now')
FROM gl_entries
WHERE voucher_type='Warehouse Cash Voucher'
  AND json_extract(dimensions_json,'$.warehouse_cash_flow')='outgoing'
  AND json_extract(dimensions_json,'$.warehouse_cash_fund') IS NOT NULL
GROUP BY tenant_id,json_extract(dimensions_json,'$.warehouse_cash_fund'),substr(posting_at,1,10)
ON CONFLICT(tenant_id,record_type,name) DO UPDATE SET
  disabled=0,
  data_json=excluded.data_json,
  modified_at=excluded.modified_at;
