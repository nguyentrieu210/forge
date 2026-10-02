-- R8-B: reject incomplete historical P&L closes and overlapping active scopes.
-- Disabled accounts remain historical ledger authority, even though active-master
-- readers intentionally exclude them. Until the close planner supports them, fail closed.
CREATE VIEW IF NOT EXISTS finance_historical_accounts AS
SELECT d.tenant_id,d.name,json_extract(d.payload_json,'$.company') AS company,
  json_extract(d.payload_json,'$.root_type') AS root_type,
  COALESCE(CAST(json_extract(d.payload_json,'$.is_group') AS INTEGER),0) AS is_group
FROM documents d WHERE d.doctype='Account'
UNION ALL
SELECT m.tenant_id,m.name,json_extract(m.data_json,'$.company'),
  json_extract(m.data_json,'$.root_type'),
  COALESCE(CAST(json_extract(m.data_json,'$.is_group') AS INTEGER),0)
FROM master_records m WHERE m.record_type='Account'
  AND NOT EXISTS (SELECT 1 FROM documents d WHERE d.tenant_id=m.tenant_id
    AND d.doctype='Account' AND d.name=m.name);

DROP TRIGGER IF EXISTS period_close_scope_safety;
CREATE TRIGGER period_close_scope_safety
BEFORE UPDATE OF docstatus,payload_json ON documents
WHEN NEW.doctype='Period Closing Voucher' AND NEW.docstatus=1
BEGIN
  SELECT CASE WHEN datetime(json_extract(NEW.payload_json,'$.posting_at')) IS NULL
    OR date(json_extract(NEW.payload_json,'$.posting_at')) IS NOT date(json_extract(NEW.payload_json,'$.period_end_date'))
    THEN RAISE(ABORT,'PERIOD_CLOSE_INVALID_POSTING_AT') END;

  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM documents c WHERE c.tenant_id=NEW.tenant_id
      AND c.doctype='Period Closing Voucher' AND c.name<>NEW.name AND c.docstatus=1
      AND json_extract(c.payload_json,'$.company')=json_extract(NEW.payload_json,'$.company')
      AND date(json_extract(c.payload_json,'$.period_start_date'))<=date(json_extract(NEW.payload_json,'$.period_end_date'))
      AND date(json_extract(c.payload_json,'$.period_end_date'))>=date(json_extract(NEW.payload_json,'$.period_start_date'))
      AND (COALESCE(json_extract(c.payload_json,'$.branch'),'')=''
        OR COALESCE(json_extract(NEW.payload_json,'$.branch'),'')=''
        OR json_extract(c.payload_json,'$.branch')=json_extract(NEW.payload_json,'$.branch'))
  ) THEN RAISE(ABORT,'PERIOD_CLOSE_OVERLAPPING_SCOPE') END;

  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM gl_entries g
    INNER JOIN documents d ON d.tenant_id=g.tenant_id AND d.doctype=g.voucher_type AND d.name=g.voucher_no
    INNER JOIN finance_historical_accounts h ON h.tenant_id=g.tenant_id AND h.name=g.account
    WHERE g.tenant_id=NEW.tenant_id
      AND json_extract(d.payload_json,'$.company')=json_extract(NEW.payload_json,'$.company')
      AND (h.company=json_extract(NEW.payload_json,'$.company') OR h.company IS NULL OR h.company='')
      AND h.root_type IN ('Income','Expense') AND h.is_group=0
      AND date(g.posting_at)>=date(json_extract(NEW.payload_json,'$.period_start_date'))
      AND date(g.posting_at)<=date(json_extract(NEW.payload_json,'$.period_end_date'))
      AND (COALESCE(json_extract(NEW.payload_json,'$.branch'),'')=''
        OR COALESCE(NULLIF(json_extract(d.payload_json,'$.branch'),''),NULLIF(json_extract(g.dimensions_json,'$.branch'),''),'')=json_extract(NEW.payload_json,'$.branch'))
      AND NOT EXISTS (SELECT 1 FROM finance_active_accounts a
        WHERE a.tenant_id=g.tenant_id AND a.name=g.account)
    GROUP BY g.account,g.currency,g.currency_scale
    HAVING SUM(g.debit_minor-g.credit_minor)<>0
  ) THEN RAISE(ABORT,'PERIOD_CLOSE_INACTIVE_PNL_BALANCE') END;
END;

-- The same boundary also applies to direct submitted-document insertion.
DROP TRIGGER IF EXISTS period_close_insert_safety;
CREATE TRIGGER period_close_insert_safety
BEFORE INSERT ON documents
WHEN NEW.doctype='Period Closing Voucher' AND NEW.docstatus=1
BEGIN
  SELECT CASE WHEN datetime(json_extract(NEW.payload_json,'$.posting_at')) IS NULL
    OR date(json_extract(NEW.payload_json,'$.posting_at')) IS NOT date(json_extract(NEW.payload_json,'$.period_end_date'))
    THEN RAISE(ABORT,'PERIOD_CLOSE_INVALID_POSTING_AT') END;

  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM documents c WHERE c.tenant_id=NEW.tenant_id
      AND c.doctype='Period Closing Voucher' AND c.name<>NEW.name AND c.docstatus=1
      AND json_extract(c.payload_json,'$.company')=json_extract(NEW.payload_json,'$.company')
      AND date(json_extract(c.payload_json,'$.period_start_date'))<=date(json_extract(NEW.payload_json,'$.period_end_date'))
      AND date(json_extract(c.payload_json,'$.period_end_date'))>=date(json_extract(NEW.payload_json,'$.period_start_date'))
      AND (COALESCE(json_extract(c.payload_json,'$.branch'),'')=''
        OR COALESCE(json_extract(NEW.payload_json,'$.branch'),'')=''
        OR json_extract(c.payload_json,'$.branch')=json_extract(NEW.payload_json,'$.branch'))
  ) THEN RAISE(ABORT,'PERIOD_CLOSE_OVERLAPPING_SCOPE') END;

  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM gl_entries g
    INNER JOIN documents d ON d.tenant_id=g.tenant_id AND d.doctype=g.voucher_type AND d.name=g.voucher_no
    INNER JOIN finance_historical_accounts h ON h.tenant_id=g.tenant_id AND h.name=g.account
    WHERE g.tenant_id=NEW.tenant_id
      AND json_extract(d.payload_json,'$.company')=json_extract(NEW.payload_json,'$.company')
      AND (h.company=json_extract(NEW.payload_json,'$.company') OR h.company IS NULL OR h.company='')
      AND h.root_type IN ('Income','Expense') AND h.is_group=0
      AND date(g.posting_at)>=date(json_extract(NEW.payload_json,'$.period_start_date'))
      AND date(g.posting_at)<=date(json_extract(NEW.payload_json,'$.period_end_date'))
      AND (COALESCE(json_extract(NEW.payload_json,'$.branch'),'')=''
        OR COALESCE(NULLIF(json_extract(d.payload_json,'$.branch'),''),NULLIF(json_extract(g.dimensions_json,'$.branch'),''),'')=json_extract(NEW.payload_json,'$.branch'))
      AND NOT EXISTS (SELECT 1 FROM finance_active_accounts a
        WHERE a.tenant_id=g.tenant_id AND a.name=g.account)
    GROUP BY g.account,g.currency,g.currency_scale
    HAVING SUM(g.debit_minor-g.credit_minor)<>0
  ) THEN RAISE(ABORT,'PERIOD_CLOSE_INACTIVE_PNL_BALANCE') END;
END;
