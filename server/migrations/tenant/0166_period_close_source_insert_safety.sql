-- R8-B: direct submitted inserts must pass the same lock/source authority as draft submit.
DROP TRIGGER IF EXISTS period_closing_source_insert_guard;
CREATE TRIGGER period_closing_source_insert_guard
BEFORE INSERT ON documents
WHEN NEW.doctype='Period Closing Voucher' AND NEW.docstatus=1
BEGIN
  SELECT CASE
    WHEN NOT EXISTS (
      SELECT 1
      FROM accounting_period_locks l
      WHERE l.tenant_id=NEW.tenant_id
        AND l.company=json_extract(NEW.payload_json,'$.company')
        AND date(l.lock_date)>=date(json_extract(NEW.payload_json,'$.period_end_date'))
    )
    THEN RAISE(ABORT,'PERIOD_CLOSE_REQUIRES_LOCK')
  END;

  SELECT CASE
    WHEN CAST(COALESCE(json_extract(NEW.payload_json,'$.source_gl_row_count'),-1) AS INTEGER)
      <> (
        SELECT COUNT(*)
        FROM gl_entries g
        INNER JOIN documents d
          ON d.tenant_id=g.tenant_id
         AND d.doctype=g.voucher_type
         AND d.name=g.voucher_no
        INNER JOIN finance_active_accounts a
          ON a.tenant_id=g.tenant_id
         AND a.name=g.account
         AND a.company=json_extract(NEW.payload_json,'$.company')
         AND a.root_type IN ('Income','Expense')
         AND a.is_group=0
        WHERE g.tenant_id=NEW.tenant_id
          AND json_extract(d.payload_json,'$.company')=json_extract(NEW.payload_json,'$.company')
          AND date(g.posting_at)>=date(json_extract(NEW.payload_json,'$.period_start_date'))
          AND date(g.posting_at)<=date(json_extract(NEW.payload_json,'$.period_end_date'))
          AND (
            COALESCE(json_extract(NEW.payload_json,'$.branch'),'')=''
            OR COALESCE(
              NULLIF(json_extract(d.payload_json,'$.branch'),''),
              NULLIF(json_extract(g.dimensions_json,'$.branch'),''),
              ''
            )=json_extract(NEW.payload_json,'$.branch')
          )
      )
    THEN RAISE(ABORT,'PERIOD_CLOSE_SOURCE_CHANGED')
  END;

  SELECT CASE
    WHEN CAST(COALESCE(json_extract(NEW.payload_json,'$.source_debit_minor'),-1) AS INTEGER)
      <> COALESCE((
        SELECT SUM(g.debit_minor)
        FROM gl_entries g
        INNER JOIN documents d
          ON d.tenant_id=g.tenant_id
         AND d.doctype=g.voucher_type
         AND d.name=g.voucher_no
        INNER JOIN finance_active_accounts a
          ON a.tenant_id=g.tenant_id
         AND a.name=g.account
         AND a.company=json_extract(NEW.payload_json,'$.company')
         AND a.root_type IN ('Income','Expense')
         AND a.is_group=0
        WHERE g.tenant_id=NEW.tenant_id
          AND json_extract(d.payload_json,'$.company')=json_extract(NEW.payload_json,'$.company')
          AND date(g.posting_at)>=date(json_extract(NEW.payload_json,'$.period_start_date'))
          AND date(g.posting_at)<=date(json_extract(NEW.payload_json,'$.period_end_date'))
          AND (
            COALESCE(json_extract(NEW.payload_json,'$.branch'),'')=''
            OR COALESCE(
              NULLIF(json_extract(d.payload_json,'$.branch'),''),
              NULLIF(json_extract(g.dimensions_json,'$.branch'),''),
              ''
            )=json_extract(NEW.payload_json,'$.branch')
          )
      ),0)
    THEN RAISE(ABORT,'PERIOD_CLOSE_SOURCE_CHANGED')
  END;

  SELECT CASE
    WHEN CAST(COALESCE(json_extract(NEW.payload_json,'$.source_credit_minor'),-1) AS INTEGER)
      <> COALESCE((
        SELECT SUM(g.credit_minor)
        FROM gl_entries g
        INNER JOIN documents d
          ON d.tenant_id=g.tenant_id
         AND d.doctype=g.voucher_type
         AND d.name=g.voucher_no
        INNER JOIN finance_active_accounts a
          ON a.tenant_id=g.tenant_id
         AND a.name=g.account
         AND a.company=json_extract(NEW.payload_json,'$.company')
         AND a.root_type IN ('Income','Expense')
         AND a.is_group=0
        WHERE g.tenant_id=NEW.tenant_id
          AND json_extract(d.payload_json,'$.company')=json_extract(NEW.payload_json,'$.company')
          AND date(g.posting_at)>=date(json_extract(NEW.payload_json,'$.period_start_date'))
          AND date(g.posting_at)<=date(json_extract(NEW.payload_json,'$.period_end_date'))
          AND (
            COALESCE(json_extract(NEW.payload_json,'$.branch'),'')=''
            OR COALESCE(
              NULLIF(json_extract(d.payload_json,'$.branch'),''),
              NULLIF(json_extract(g.dimensions_json,'$.branch'),''),
              ''
            )=json_extract(NEW.payload_json,'$.branch')
          )
      ),0)
    THEN RAISE(ABORT,'PERIOD_CLOSE_SOURCE_CHANGED')
  END;
END;

DROP TRIGGER IF EXISTS period_close_source_date_update;
CREATE TRIGGER period_close_source_date_update
BEFORE UPDATE OF docstatus,payload_json ON documents
WHEN NEW.doctype='Period Closing Voucher' AND NEW.docstatus=1
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM gl_entries g
    JOIN documents d ON d.tenant_id=g.tenant_id AND d.doctype=g.voucher_type AND d.name=g.voucher_no
    JOIN finance_historical_accounts a ON a.tenant_id=g.tenant_id AND a.name=g.account
    WHERE g.tenant_id=NEW.tenant_id
      AND json_extract(d.payload_json,'$.company')=json_extract(NEW.payload_json,'$.company')
      AND a.root_type IN ('Income','Expense') AND a.is_group=0
      AND (COALESCE(json_extract(NEW.payload_json,'$.branch'),'')=''
        OR COALESCE(NULLIF(json_extract(d.payload_json,'$.branch'),''),NULLIF(json_extract(g.dimensions_json,'$.branch'),''),'')=json_extract(NEW.payload_json,'$.branch'))
      AND (datetime(g.posting_at) IS NULL OR date(g.posting_at,'+0 days') IS NOT substr(g.posting_at,1,10))
  ) THEN RAISE(ABORT,'PERIOD_CLOSE_INVALID_SOURCE_DATE') END;
END;

DROP TRIGGER IF EXISTS period_close_source_date_insert;
CREATE TRIGGER period_close_source_date_insert
BEFORE INSERT ON documents
WHEN NEW.doctype='Period Closing Voucher' AND NEW.docstatus=1
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM gl_entries g
    JOIN documents d ON d.tenant_id=g.tenant_id AND d.doctype=g.voucher_type AND d.name=g.voucher_no
    JOIN finance_historical_accounts a ON a.tenant_id=g.tenant_id AND a.name=g.account
    WHERE g.tenant_id=NEW.tenant_id
      AND json_extract(d.payload_json,'$.company')=json_extract(NEW.payload_json,'$.company')
      AND a.root_type IN ('Income','Expense') AND a.is_group=0
      AND (COALESCE(json_extract(NEW.payload_json,'$.branch'),'')=''
        OR COALESCE(NULLIF(json_extract(d.payload_json,'$.branch'),''),NULLIF(json_extract(g.dimensions_json,'$.branch'),''),'')=json_extract(NEW.payload_json,'$.branch'))
      AND (datetime(g.posting_at) IS NULL OR date(g.posting_at,'+0 days') IS NOT substr(g.posting_at,1,10))
  ) THEN RAISE(ABORT,'PERIOD_CLOSE_INVALID_SOURCE_DATE') END;
END;
