-- R8-B: authoritative AR/AP period-end exchange-rate revaluation.
--
-- The controller snapshots open foreign-currency Payment Ledger groups as-of the
-- posting date and posts company-currency unrealized gain/loss plus next-day
-- reversal. These commit-time guards reject source/rate drift between planning
-- and the D1 batch.

INSERT OR IGNORE INTO doctype_definitions (
  tenant_id,doctype,module,is_custom,is_submittable,is_child,revision,
  metadata_json,disabled,modified_by,modified_at
) VALUES (
  '__standard__',
  'Exchange Rate Revaluation',
  'Accounts',
  0,1,0,1,
  '{"name":"Exchange Rate Revaluation","module":"Accounts","is_submittable":true,"track_changes":true,"fields":[{"fieldname":"company","label":"Company","fieldtype":"Link","options":"Company","reqd":true},{"fieldname":"posting_at","label":"Posting At","fieldtype":"Datetime","reqd":true},{"fieldname":"remarks","label":"Remarks","fieldtype":"Small Text"},{"fieldname":"company_currency","label":"Company Currency","fieldtype":"Link","options":"Currency","read_only":true},{"fieldname":"gain_loss_account","label":"Exchange Gain / Loss Account","fieldtype":"Link","options":"Account","read_only":true},{"fieldname":"reversal_at","label":"Auto Reversal At","fieldtype":"Datetime","read_only":true},{"fieldname":"total_gain_minor","label":"Total Gain Minor","fieldtype":"Int","read_only":true,"hidden":true},{"fieldname":"total_loss_minor","label":"Total Loss Minor","fieldtype":"Int","read_only":true,"hidden":true},{"fieldname":"total_adjustment_minor","label":"Total Adjustment Minor","fieldtype":"Int","read_only":true,"hidden":true},{"fieldname":"revaluation_entries","label":"Revaluation Entries","fieldtype":"JSON","read_only":true,"hidden":true}],"permissions":[{"role":"Accounts Manager","read":true,"write":true,"create":true,"submit":true,"cancel":true},{"role":"Chief Accountant","read":true,"write":true,"create":true,"submit":true,"cancel":true},{"role":"Kế toán trưởng","read":true,"write":true,"create":true,"submit":true,"cancel":true},{"role":"System Manager","read":true,"write":true,"create":true,"submit":true,"cancel":true},{"role":"Auditor","read":true,"report":true,"export":true}]}',
  0,'migration:0154','2026-10-02T00:00:00.000Z'
);

DROP VIEW IF EXISTS finance_fx_company_master;
CREATE VIEW finance_fx_company_master AS
SELECT d.tenant_id,d.name,
  json_extract(d.payload_json,'$.default_currency') AS default_currency,
  json_extract(d.payload_json,'$.exchange_gain_loss_account') AS exchange_gain_loss_account
FROM documents d
WHERE d.doctype='Company' AND d.docstatus<>2
UNION ALL
SELECT m.tenant_id,m.name,
  json_extract(m.data_json,'$.default_currency'),
  json_extract(m.data_json,'$.exchange_gain_loss_account')
FROM master_records m
WHERE m.record_type='Company' AND m.disabled=0
  AND NOT EXISTS (
    SELECT 1 FROM documents d
    WHERE d.tenant_id=m.tenant_id AND d.doctype='Company' AND d.name=m.name
  );

DROP VIEW IF EXISTS finance_fx_currency_master;
CREATE VIEW finance_fx_currency_master AS
SELECT d.tenant_id,d.name,
  CAST(COALESCE(json_extract(d.payload_json,'$.currency_scale'),2) AS INTEGER) AS currency_scale
FROM documents d
WHERE d.doctype='Currency' AND d.docstatus<>2
UNION ALL
SELECT m.tenant_id,m.name,
  CAST(COALESCE(json_extract(m.data_json,'$.currency_scale'),2) AS INTEGER)
FROM master_records m
WHERE m.record_type='Currency' AND m.disabled=0
  AND NOT EXISTS (
    SELECT 1 FROM documents d
    WHERE d.tenant_id=m.tenant_id AND d.doctype='Currency' AND d.name=m.name
  );

DROP VIEW IF EXISTS finance_fx_rate_master;
CREATE VIEW finance_fx_rate_master AS
SELECT d.tenant_id,d.name,
  CAST(ROUND(CAST(json_extract(d.payload_json,'$.rate') AS REAL)*1000000.0) AS INTEGER) AS rate_micros
FROM documents d
WHERE d.doctype='Exchange Rate' AND d.docstatus<>2
UNION ALL
SELECT m.tenant_id,m.name,
  CAST(ROUND(CAST(json_extract(m.data_json,'$.rate') AS REAL)*1000000.0) AS INTEGER)
FROM master_records m
WHERE m.record_type='Exchange Rate' AND m.disabled=0
  AND NOT EXISTS (
    SELECT 1 FROM documents d
    WHERE d.tenant_id=m.tenant_id AND d.doctype='Exchange Rate' AND d.name=m.name
  );

DROP TRIGGER IF EXISTS finance_fx_revaluation_update_guard;
CREATE TRIGGER finance_fx_revaluation_update_guard
BEFORE UPDATE ON documents
WHEN NEW.doctype='Exchange Rate Revaluation' AND OLD.docstatus<>1 AND NEW.docstatus=1
BEGIN
  SELECT CASE WHEN datetime(json_extract(NEW.payload_json,'$.posting_at')) IS NULL
    THEN RAISE(ABORT,'FINANCE_FX_INVALID_POSTING_AT') END;

  SELECT CASE WHEN date(json_extract(NEW.payload_json,'$.reversal_at'))
      IS NOT date(json_extract(NEW.payload_json,'$.posting_at'),'+1 day')
    THEN RAISE(ABORT,'FINANCE_FX_INVALID_REVERSAL_DATE') END;

  SELECT CASE WHEN json_type(NEW.payload_json,'$.revaluation_entries')<>'array'
    OR json_array_length(NEW.payload_json,'$.revaluation_entries')=0
    THEN RAISE(ABORT,'FINANCE_FX_SOURCE_SNAPSHOT_REQUIRED') END;

  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM finance_fx_company_master c
    INNER JOIN finance_fx_currency_master cur
      ON cur.tenant_id=c.tenant_id AND cur.name=c.default_currency
    WHERE c.tenant_id=NEW.tenant_id
      AND c.name=json_extract(NEW.payload_json,'$.company')
      AND c.default_currency=json_extract(NEW.payload_json,'$.company_currency')
      AND c.exchange_gain_loss_account=json_extract(NEW.payload_json,'$.gain_loss_account')
      AND cur.currency_scale=CAST(json_extract(NEW.payload_json,'$.company_currency_scale') AS INTEGER)
  ) THEN RAISE(ABORT,'FINANCE_FX_COMPANY_SNAPSHOT_DRIFT') END;

  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM documents x
    WHERE x.tenant_id=NEW.tenant_id
      AND x.doctype='Exchange Rate Revaluation'
      AND x.name<>NEW.name
      AND x.docstatus=1
      AND json_extract(x.payload_json,'$.company')=json_extract(NEW.payload_json,'$.company')
      AND date(json_extract(x.payload_json,'$.posting_at'))=date(json_extract(NEW.payload_json,'$.posting_at'))
  ) THEN RAISE(ABORT,'FINANCE_FX_DUPLICATE_DATE') END;

  SELECT CASE WHEN (
    SELECT COUNT(*) FROM json_each(NEW.payload_json,'$.revaluation_entries')
  ) <> (
    SELECT COUNT(*) FROM (
      SELECT p.account_type,p.party_type,p.party,p.account,
        p.against_voucher_type,p.against_voucher_no,p.currency,p.currency_scale
      FROM payment_ledger_entries p
      INNER JOIN documents d
        ON d.tenant_id=p.tenant_id
       AND d.doctype=p.against_voucher_type
       AND d.name=p.against_voucher_no
      WHERE p.tenant_id=NEW.tenant_id
        AND p.against_voucher_type IN ('Sales Invoice','Purchase Invoice')
        AND json_extract(d.payload_json,'$.company')=json_extract(NEW.payload_json,'$.company')
        AND date(p.posting_at)<=date(json_extract(NEW.payload_json,'$.posting_at'))
        AND p.currency<>json_extract(NEW.payload_json,'$.company_currency')
      GROUP BY p.account_type,p.party_type,p.party,p.account,
        p.against_voucher_type,p.against_voucher_no,p.currency,p.currency_scale
      HAVING SUM(p.amount_minor)<>0 OR SUM(p.base_amount_minor)<>0
    )
  ) THEN RAISE(ABORT,'FINANCE_FX_SOURCE_COUNT_DRIFT') END;

  SELECT CASE WHEN EXISTS (
    SELECT 1
    FROM json_each(NEW.payload_json,'$.revaluation_entries') j
    WHERE NOT EXISTS (
      SELECT 1
      FROM payment_ledger_entries p
      INNER JOIN documents d
        ON d.tenant_id=p.tenant_id
       AND d.doctype=p.against_voucher_type
       AND d.name=p.against_voucher_no
      WHERE p.tenant_id=NEW.tenant_id
        AND p.account_type=json_extract(j.value,'$.account_type')
        AND p.party_type=json_extract(j.value,'$.party_type')
        AND p.party=json_extract(j.value,'$.party')
        AND p.account=json_extract(j.value,'$.account')
        AND p.against_voucher_type=json_extract(j.value,'$.against_voucher_type')
        AND p.against_voucher_no=json_extract(j.value,'$.against_voucher_no')
        AND p.currency=json_extract(j.value,'$.currency')
        AND p.currency_scale=CAST(json_extract(j.value,'$.currency_scale') AS INTEGER)
        AND json_extract(d.payload_json,'$.company')=json_extract(NEW.payload_json,'$.company')
        AND date(p.posting_at)<=date(json_extract(NEW.payload_json,'$.posting_at'))
      GROUP BY p.account_type,p.party_type,p.party,p.account,
        p.against_voucher_type,p.against_voucher_no,p.currency,p.currency_scale
      HAVING SUM(p.amount_minor)=CAST(json_extract(j.value,'$.outstanding_minor') AS INTEGER)
        AND SUM(p.base_amount_minor)=CAST(json_extract(j.value,'$.base_outstanding_minor') AS INTEGER)
        AND COUNT(*)=CAST(json_extract(j.value,'$.source_row_count') AS INTEGER)
    )
  ) THEN RAISE(ABORT,'FINANCE_FX_SOURCE_BALANCE_DRIFT') END;

  SELECT CASE WHEN EXISTS (
    SELECT 1
    FROM json_each(NEW.payload_json,'$.revaluation_entries') j
    WHERE CAST(json_extract(j.value,'$.closing_rate_micros') AS INTEGER)<>COALESCE(
      (SELECT r.rate_micros FROM finance_fx_rate_master r
       WHERE r.tenant_id=NEW.tenant_id
         AND r.name=json_extract(j.value,'$.currency')||':'||json_extract(NEW.payload_json,'$.company_currency')||':'||date(json_extract(NEW.payload_json,'$.posting_at'))
       LIMIT 1),
      (SELECT r.rate_micros FROM finance_fx_rate_master r
       WHERE r.tenant_id=NEW.tenant_id
         AND r.name=json_extract(j.value,'$.currency')||':'||json_extract(NEW.payload_json,'$.company_currency')
       LIMIT 1),
      -1
    )
  ) THEN RAISE(ABORT,'FINANCE_FX_RATE_DRIFT') END;
END;

DROP TRIGGER IF EXISTS finance_fx_revaluation_insert_guard;
CREATE TRIGGER finance_fx_revaluation_insert_guard
BEFORE INSERT ON documents
WHEN NEW.doctype='Exchange Rate Revaluation' AND NEW.docstatus=1
BEGIN
  SELECT CASE WHEN datetime(json_extract(NEW.payload_json,'$.posting_at')) IS NULL
    THEN RAISE(ABORT,'FINANCE_FX_INVALID_POSTING_AT') END;
  SELECT CASE WHEN date(json_extract(NEW.payload_json,'$.reversal_at'))
      IS NOT date(json_extract(NEW.payload_json,'$.posting_at'),'+1 day')
    THEN RAISE(ABORT,'FINANCE_FX_INVALID_REVERSAL_DATE') END;
  SELECT CASE WHEN json_type(NEW.payload_json,'$.revaluation_entries')<>'array'
    OR json_array_length(NEW.payload_json,'$.revaluation_entries')=0
    THEN RAISE(ABORT,'FINANCE_FX_SOURCE_SNAPSHOT_REQUIRED') END;
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM finance_fx_company_master c
    INNER JOIN finance_fx_currency_master cur
      ON cur.tenant_id=c.tenant_id AND cur.name=c.default_currency
    WHERE c.tenant_id=NEW.tenant_id
      AND c.name=json_extract(NEW.payload_json,'$.company')
      AND c.default_currency=json_extract(NEW.payload_json,'$.company_currency')
      AND c.exchange_gain_loss_account=json_extract(NEW.payload_json,'$.gain_loss_account')
      AND cur.currency_scale=CAST(json_extract(NEW.payload_json,'$.company_currency_scale') AS INTEGER)
  ) THEN RAISE(ABORT,'FINANCE_FX_COMPANY_SNAPSHOT_DRIFT') END;
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM documents x
    WHERE x.tenant_id=NEW.tenant_id
      AND x.doctype='Exchange Rate Revaluation'
      AND x.name<>NEW.name
      AND x.docstatus=1
      AND json_extract(x.payload_json,'$.company')=json_extract(NEW.payload_json,'$.company')
      AND date(json_extract(x.payload_json,'$.posting_at'))=date(json_extract(NEW.payload_json,'$.posting_at'))
  ) THEN RAISE(ABORT,'FINANCE_FX_DUPLICATE_DATE') END;
  SELECT CASE WHEN (
    SELECT COUNT(*) FROM json_each(NEW.payload_json,'$.revaluation_entries')
  ) <> (
    SELECT COUNT(*) FROM (
      SELECT p.account_type,p.party_type,p.party,p.account,
        p.against_voucher_type,p.against_voucher_no,p.currency,p.currency_scale
      FROM payment_ledger_entries p
      INNER JOIN documents d
        ON d.tenant_id=p.tenant_id
       AND d.doctype=p.against_voucher_type
       AND d.name=p.against_voucher_no
      WHERE p.tenant_id=NEW.tenant_id
        AND p.against_voucher_type IN ('Sales Invoice','Purchase Invoice')
        AND json_extract(d.payload_json,'$.company')=json_extract(NEW.payload_json,'$.company')
        AND date(p.posting_at)<=date(json_extract(NEW.payload_json,'$.posting_at'))
        AND p.currency<>json_extract(NEW.payload_json,'$.company_currency')
      GROUP BY p.account_type,p.party_type,p.party,p.account,
        p.against_voucher_type,p.against_voucher_no,p.currency,p.currency_scale
      HAVING SUM(p.amount_minor)<>0 OR SUM(p.base_amount_minor)<>0
    )
  ) THEN RAISE(ABORT,'FINANCE_FX_SOURCE_COUNT_DRIFT') END;
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM json_each(NEW.payload_json,'$.revaluation_entries') j
    WHERE NOT EXISTS (
      SELECT 1
      FROM payment_ledger_entries p
      INNER JOIN documents d
        ON d.tenant_id=p.tenant_id
       AND d.doctype=p.against_voucher_type
       AND d.name=p.against_voucher_no
      WHERE p.tenant_id=NEW.tenant_id
        AND p.account_type=json_extract(j.value,'$.account_type')
        AND p.party_type=json_extract(j.value,'$.party_type')
        AND p.party=json_extract(j.value,'$.party')
        AND p.account=json_extract(j.value,'$.account')
        AND p.against_voucher_type=json_extract(j.value,'$.against_voucher_type')
        AND p.against_voucher_no=json_extract(j.value,'$.against_voucher_no')
        AND p.currency=json_extract(j.value,'$.currency')
        AND p.currency_scale=CAST(json_extract(j.value,'$.currency_scale') AS INTEGER)
        AND json_extract(d.payload_json,'$.company')=json_extract(NEW.payload_json,'$.company')
        AND date(p.posting_at)<=date(json_extract(NEW.payload_json,'$.posting_at'))
      GROUP BY p.account_type,p.party_type,p.party,p.account,
        p.against_voucher_type,p.against_voucher_no,p.currency,p.currency_scale
      HAVING SUM(p.amount_minor)=CAST(json_extract(j.value,'$.outstanding_minor') AS INTEGER)
        AND SUM(p.base_amount_minor)=CAST(json_extract(j.value,'$.base_outstanding_minor') AS INTEGER)
        AND COUNT(*)=CAST(json_extract(j.value,'$.source_row_count') AS INTEGER)
    )
  ) THEN RAISE(ABORT,'FINANCE_FX_SOURCE_BALANCE_DRIFT') END;
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM json_each(NEW.payload_json,'$.revaluation_entries') j
    WHERE CAST(json_extract(j.value,'$.closing_rate_micros') AS INTEGER)<>COALESCE(
      (SELECT r.rate_micros FROM finance_fx_rate_master r
       WHERE r.tenant_id=NEW.tenant_id
         AND r.name=json_extract(j.value,'$.currency')||':'||json_extract(NEW.payload_json,'$.company_currency')||':'||date(json_extract(NEW.payload_json,'$.posting_at'))
       LIMIT 1),
      (SELECT r.rate_micros FROM finance_fx_rate_master r
       WHERE r.tenant_id=NEW.tenant_id
         AND r.name=json_extract(j.value,'$.currency')||':'||json_extract(NEW.payload_json,'$.company_currency')
       LIMIT 1),
      -1
    )
  ) THEN RAISE(ABORT,'FINANCE_FX_RATE_DRIFT') END;
END;
