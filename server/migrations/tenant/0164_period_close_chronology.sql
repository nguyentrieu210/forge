-- R8-B: close chronology is enforced atomically, including cancellation races.
DROP TRIGGER IF EXISTS period_close_cancel_chronology;
CREATE TRIGGER period_close_cancel_chronology
BEFORE UPDATE OF docstatus ON documents
WHEN NEW.doctype='Period Closing Voucher' AND OLD.docstatus=1 AND NEW.docstatus=2
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM documents c WHERE c.tenant_id=OLD.tenant_id
      AND c.doctype=OLD.doctype AND c.name<>OLD.name AND c.docstatus=1
      AND json_extract(c.payload_json,'$.company')=json_extract(OLD.payload_json,'$.company')
      AND date(json_extract(c.payload_json,'$.period_end_date'))>date(json_extract(OLD.payload_json,'$.period_end_date'))
      AND (COALESCE(json_extract(c.payload_json,'$.branch'),'')=''
        OR COALESCE(json_extract(OLD.payload_json,'$.branch'),'')=''
        OR json_extract(c.payload_json,'$.branch')=json_extract(OLD.payload_json,'$.branch'))
  ) THEN RAISE(ABORT,'PERIOD_CLOSE_FUTURE_CLOSE_EXISTS') END;
END;

DROP TRIGGER IF EXISTS period_close_prior_pnl_update;
CREATE TRIGGER period_close_prior_pnl_update
BEFORE UPDATE OF docstatus,payload_json ON documents
WHEN NEW.doctype='Period Closing Voucher' AND NEW.docstatus=1
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM gl_entries g
    JOIN documents d ON d.tenant_id=g.tenant_id AND d.doctype=g.voucher_type AND d.name=g.voucher_no
    JOIN finance_historical_accounts a ON a.tenant_id=g.tenant_id AND a.name=g.account
    WHERE g.tenant_id=NEW.tenant_id
      AND json_extract(d.payload_json,'$.company')=json_extract(NEW.payload_json,'$.company')
      AND (a.company=json_extract(NEW.payload_json,'$.company') OR a.company IS NULL OR a.company='')
      AND a.root_type IN ('Income','Expense') AND a.is_group=0
      AND date(g.posting_at)<date(json_extract(NEW.payload_json,'$.period_start_date'))
      AND (COALESCE(json_extract(NEW.payload_json,'$.branch'),'')=''
        OR COALESCE(NULLIF(json_extract(d.payload_json,'$.branch'),''),NULLIF(json_extract(g.dimensions_json,'$.branch'),''),'')=json_extract(NEW.payload_json,'$.branch'))
    GROUP BY g.account,g.currency,g.currency_scale
    HAVING SUM(g.debit_minor-g.credit_minor)<>0
  ) THEN RAISE(ABORT,'PERIOD_CLOSE_PRIOR_PNL_BALANCE') END;
END;

DROP TRIGGER IF EXISTS period_close_prior_pnl_insert;
CREATE TRIGGER period_close_prior_pnl_insert
BEFORE INSERT ON documents
WHEN NEW.doctype='Period Closing Voucher' AND NEW.docstatus=1
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM gl_entries g
    JOIN documents d ON d.tenant_id=g.tenant_id AND d.doctype=g.voucher_type AND d.name=g.voucher_no
    JOIN finance_historical_accounts a ON a.tenant_id=g.tenant_id AND a.name=g.account
    WHERE g.tenant_id=NEW.tenant_id
      AND json_extract(d.payload_json,'$.company')=json_extract(NEW.payload_json,'$.company')
      AND (a.company=json_extract(NEW.payload_json,'$.company') OR a.company IS NULL OR a.company='')
      AND a.root_type IN ('Income','Expense') AND a.is_group=0
      AND date(g.posting_at)<date(json_extract(NEW.payload_json,'$.period_start_date'))
      AND (COALESCE(json_extract(NEW.payload_json,'$.branch'),'')=''
        OR COALESCE(NULLIF(json_extract(d.payload_json,'$.branch'),''),NULLIF(json_extract(g.dimensions_json,'$.branch'),''),'')=json_extract(NEW.payload_json,'$.branch'))
    GROUP BY g.account,g.currency,g.currency_scale
    HAVING SUM(g.debit_minor-g.credit_minor)<>0
  ) THEN RAISE(ABORT,'PERIOD_CLOSE_PRIOR_PNL_BALANCE') END;
END;
