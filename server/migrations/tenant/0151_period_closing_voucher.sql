-- R8-B: authoritative period-closing / retained-earnings safe path.
--
-- The controller derives closing entries from the canonical GL aggregate.  This migration
-- provides the DocType surface plus commit-time guards so the source cannot change between
-- controller planning and the D1 transaction.

INSERT OR IGNORE INTO doctype_definitions (
  tenant_id,doctype,module,is_custom,is_submittable,is_child,revision,
  metadata_json,disabled,modified_by,modified_at
) VALUES (
  '__standard__',
  'Period Closing Voucher',
  'Accounts',
  0,1,0,1,
  '{"name":"Period Closing Voucher","module":"Accounts","is_submittable":true,"track_changes":true,"fields":[{"fieldname":"company","label":"Company","fieldtype":"Link","options":"Company","reqd":true},{"fieldname":"fiscal_year","label":"Fiscal Year","fieldtype":"Link","options":"Fiscal Year","reqd":true},{"fieldname":"posting_at","label":"Posting At","fieldtype":"Datetime","reqd":true},{"fieldname":"closing_account","label":"Closing Account","fieldtype":"Link","options":"Account","reqd":true},{"fieldname":"branch","label":"Branch","fieldtype":"Link","options":"Branch"},{"fieldname":"remarks","label":"Remarks","fieldtype":"Small Text"},{"fieldname":"period_start_date","label":"Period Start Date","fieldtype":"Date","read_only":true},{"fieldname":"period_end_date","label":"Period End Date","fieldtype":"Date","read_only":true},{"fieldname":"company_currency","label":"Company Currency","fieldtype":"Link","options":"Currency","read_only":true},{"fieldname":"net_profit_loss","label":"Net Profit / Loss","fieldtype":"Currency","read_only":true},{"fieldname":"closing_entries","label":"Closing Entries","fieldtype":"JSON","read_only":true,"hidden":true},{"fieldname":"source_gl_row_count","label":"Source GL Row Count","fieldtype":"Int","read_only":true,"hidden":true},{"fieldname":"source_debit_minor","label":"Source Debit Minor","fieldtype":"Int","read_only":true,"hidden":true},{"fieldname":"source_credit_minor","label":"Source Credit Minor","fieldtype":"Int","read_only":true,"hidden":true}],"permissions":[{"role":"Accounts Manager","read":true,"write":true,"create":true,"submit":true,"cancel":true,"print":true,"report":true},{"role":"System Manager","read":true,"write":true,"create":true,"submit":true,"cancel":true,"print":true,"report":true},{"role":"Accounts User","read":true,"print":true,"report":true}]}',
  0,'migration:0151_period_closing_voucher','2026-10-02T00:00:00.000Z'
);

INSERT OR IGNORE INTO doctype_definitions (
  tenant_id,doctype,module,is_custom,is_submittable,is_child,revision,
  metadata_json,disabled,modified_by,modified_at
)
SELECT
  'demo',doctype,module,is_custom,is_submittable,is_child,revision,
  metadata_json,disabled,'migration:0151_period_closing_voucher','2026-10-02T00:00:00.000Z'
FROM doctype_definitions
WHERE tenant_id='__standard__' AND doctype='Period Closing Voucher';

DROP VIEW IF EXISTS finance_active_accounts;
CREATE VIEW finance_active_accounts AS
SELECT
  d.tenant_id,
  d.name,
  json_extract(d.payload_json,'$.company') AS company,
  json_extract(d.payload_json,'$.root_type') AS root_type,
  COALESCE(CAST(json_extract(d.payload_json,'$.is_group') AS INTEGER),0) AS is_group
FROM documents d
WHERE d.doctype='Account'
  AND d.docstatus<>2
  AND COALESCE(CAST(json_extract(d.payload_json,'$.disabled') AS INTEGER),0)=0

UNION ALL

SELECT
  m.tenant_id,
  m.name,
  json_extract(m.data_json,'$.company') AS company,
  json_extract(m.data_json,'$.root_type') AS root_type,
  COALESCE(CAST(json_extract(m.data_json,'$.is_group') AS INTEGER),0) AS is_group
FROM master_records m
WHERE m.record_type='Account'
  AND m.disabled=0
  AND NOT EXISTS (
    SELECT 1
    FROM documents d
    WHERE d.tenant_id=m.tenant_id
      AND d.doctype='Account'
      AND d.name=m.name
      AND d.docstatus<>2
  );

CREATE UNIQUE INDEX IF NOT EXISTS idx_period_closing_active_scope
ON documents(
  tenant_id,
  doctype,
  json_extract(payload_json,'$.company'),
  json_extract(payload_json,'$.period_start_date'),
  json_extract(payload_json,'$.period_end_date'),
  COALESCE(json_extract(payload_json,'$.branch'),'')
)
WHERE doctype='Period Closing Voucher' AND docstatus=1;

DROP TRIGGER IF EXISTS period_closing_source_guard;
CREATE TRIGGER period_closing_source_guard
BEFORE UPDATE OF docstatus,payload_json ON documents
WHEN NEW.doctype='Period Closing Voucher'
 AND OLD.docstatus=0
 AND NEW.docstatus=1
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
