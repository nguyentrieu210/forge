-- RC-023 Cash/Bank/Reconciliation hardening.
-- Keep GL/Payment Entry/Journal Entry as financial authority. Bank Transaction is statement evidence;
-- Bank Reconciliation is reversible control state tied to authoritative GL movement.

-- Generic provider/import boundary. Manual rows need no provider identity; imported/feed rows do.
CREATE UNIQUE INDEX IF NOT EXISTS uq_bank_transaction_external_source
ON documents(
  tenant_id,
  json_extract(payload_json,'$.bank_account'),
  lower(trim(json_extract(payload_json,'$.source_provider'))),
  trim(json_extract(payload_json,'$.source_row_id'))
)
WHERE doctype='Bank Transaction'
  AND COALESCE(json_extract(payload_json,'$.source_kind'),'Manual') IN ('Statement Import','Bank Feed')
  AND COALESCE(trim(json_extract(payload_json,'$.source_provider')),'')<>''
  AND COALESCE(trim(json_extract(payload_json,'$.source_row_id')),'')<>'';

DROP TRIGGER IF EXISTS bank_transaction_source_insert_guard;
CREATE TRIGGER bank_transaction_source_insert_guard
BEFORE INSERT ON documents
WHEN NEW.doctype='Bank Transaction'
BEGIN
  SELECT CASE
    WHEN COALESCE(json_extract(NEW.payload_json,'$.source_kind'),'Manual')
      NOT IN ('Manual','Statement Import','Bank Feed')
      THEN RAISE(ABORT,'BANK_TRANSACTION_SOURCE_KIND_INVALID')
    WHEN COALESCE(json_extract(NEW.payload_json,'$.source_kind'),'Manual') IN ('Statement Import','Bank Feed')
      AND (
        COALESCE(trim(json_extract(NEW.payload_json,'$.source_provider')),'')=''
        OR COALESCE(trim(json_extract(NEW.payload_json,'$.source_row_id')),'')=''
      )
      THEN RAISE(ABORT,'BANK_TRANSACTION_SOURCE_ID_REQUIRED')
  END;
END;

DROP TRIGGER IF EXISTS bank_transaction_source_update_guard;
CREATE TRIGGER bank_transaction_source_update_guard
BEFORE UPDATE OF payload_json ON documents
WHEN NEW.doctype='Bank Transaction'
BEGIN
  SELECT CASE
    WHEN COALESCE(json_extract(NEW.payload_json,'$.source_kind'),'Manual')
      NOT IN ('Manual','Statement Import','Bank Feed')
      THEN RAISE(ABORT,'BANK_TRANSACTION_SOURCE_KIND_INVALID')
    WHEN COALESCE(json_extract(NEW.payload_json,'$.source_kind'),'Manual') IN ('Statement Import','Bank Feed')
      AND (
        COALESCE(trim(json_extract(NEW.payload_json,'$.source_provider')),'')=''
        OR COALESCE(trim(json_extract(NEW.payload_json,'$.source_row_id')),'')=''
      )
      THEN RAISE(ABORT,'BANK_TRANSACTION_SOURCE_ID_REQUIRED')
  END;
END;

-- Reconciliation must be a control projection over a submitted bank statement row and a real GL movement.
-- It may be partial, but neither the statement row nor the authoritative voucher bank-side movement can be over-used.
DROP TRIGGER IF EXISTS bank_reconciliation_amount_guard;
CREATE TRIGGER bank_reconciliation_amount_guard
BEFORE INSERT ON bank_reconciliation_entries
BEGIN
  SELECT CASE
    WHEN NEW.amount_minor=0
      THEN RAISE(ABORT,'BANK_RECONCILIATION_ZERO')
    WHEN NOT EXISTS(
      SELECT 1 FROM documents bt
      WHERE bt.tenant_id=NEW.tenant_id
        AND bt.doctype='Bank Transaction'
        AND bt.name=NEW.bank_transaction
        AND bt.docstatus=1
        AND json_extract(bt.payload_json,'$.bank_account')=NEW.bank_account
        AND json_extract(bt.payload_json,'$.currency')=NEW.currency
        AND COALESCE(CAST(json_extract(bt.payload_json,'$.currency_scale') AS INTEGER),NEW.currency_scale)=NEW.currency_scale
    )
      THEN RAISE(ABORT,'BANK_TRANSACTION_NOT_SUBMITTED')
    WHEN NOT EXISTS(
      SELECT 1 FROM documents v
      WHERE v.tenant_id=NEW.tenant_id
        AND v.doctype=NEW.against_voucher_type
        AND v.name=NEW.against_voucher_no
        AND v.docstatus=1
    )
      THEN RAISE(ABORT,'BANK_RECONCILIATION_VOUCHER_NOT_SUBMITTED')
    WHEN COALESCE((
      SELECT json_extract(v.payload_json,'$.company')
      FROM documents v
      WHERE v.tenant_id=NEW.tenant_id
        AND v.doctype=NEW.against_voucher_type
        AND v.name=NEW.against_voucher_no
        AND v.docstatus=1
    ),'') <> COALESCE((
      SELECT json_extract(bt.payload_json,'$.company')
      FROM documents bt
      WHERE bt.tenant_id=NEW.tenant_id
        AND bt.doctype='Bank Transaction'
        AND bt.name=NEW.bank_transaction
        AND bt.docstatus=1
    ),'')
      THEN RAISE(ABORT,'BANK_RECONCILIATION_COMPANY_MISMATCH')
    WHEN COALESCE((
      SELECT SUM(e.amount_minor)
      FROM bank_reconciliation_entries e
      WHERE e.tenant_id=NEW.tenant_id
        AND e.bank_transaction=NEW.bank_transaction
    ),0)+NEW.amount_minor < 0
      THEN RAISE(ABORT,'BANK_RECONCILIATION_NEGATIVE')
    WHEN COALESCE((
      SELECT SUM(e.amount_minor)
      FROM bank_reconciliation_entries e
      WHERE e.tenant_id=NEW.tenant_id
        AND e.bank_transaction=NEW.bank_transaction
    ),0)+NEW.amount_minor > COALESCE((
      SELECT ABS(CAST(json_extract(bt.payload_json,'$.amount_minor') AS INTEGER))
      FROM documents bt
      WHERE bt.tenant_id=NEW.tenant_id
        AND bt.doctype='Bank Transaction'
        AND bt.name=NEW.bank_transaction
        AND bt.docstatus=1
    ),-1)
      THEN RAISE(ABORT,'BANK_RECONCILIATION_OVER_ALLOCATED')
    WHEN COALESCE((
      SELECT SUM(e.amount_minor)
      FROM bank_reconciliation_entries e
      WHERE e.tenant_id=NEW.tenant_id
        AND e.bank_transaction=NEW.bank_transaction
        AND e.against_voucher_type=NEW.against_voucher_type
        AND e.against_voucher_no=NEW.against_voucher_no
    ),0)+NEW.amount_minor < 0
      THEN RAISE(ABORT,'BANK_RECONCILIATION_PAIR_NEGATIVE')
    WHEN NEW.amount_minor>0 AND COALESCE((
      SELECT CASE json_extract(bt.payload_json,'$.transaction_type')
        WHEN 'Deposit' THEN SUM(g.debit_minor-g.credit_minor)
        WHEN 'Withdrawal' THEN SUM(g.credit_minor-g.debit_minor)
        ELSE 0
      END
      FROM documents bt
      JOIN gl_entries g
        ON g.tenant_id=bt.tenant_id
       AND g.voucher_type=NEW.against_voucher_type
       AND g.voucher_no=NEW.against_voucher_no
       AND g.account=json_extract(bt.payload_json,'$.gl_account')
       AND g.currency=NEW.currency
       AND g.currency_scale=NEW.currency_scale
      WHERE bt.tenant_id=NEW.tenant_id
        AND bt.doctype='Bank Transaction'
        AND bt.name=NEW.bank_transaction
        AND bt.docstatus=1
    ),0) <= 0
      THEN RAISE(ABORT,'BANK_RECONCILIATION_NO_BANK_GL')
    WHEN NEW.amount_minor>0 AND
      COALESCE((
        SELECT SUM(e.amount_minor)
        FROM bank_reconciliation_entries e
        JOIN documents prior_bt
          ON prior_bt.tenant_id=e.tenant_id
         AND prior_bt.doctype='Bank Transaction'
         AND prior_bt.name=e.bank_transaction
        WHERE e.tenant_id=NEW.tenant_id
          AND e.against_voucher_type=NEW.against_voucher_type
          AND e.against_voucher_no=NEW.against_voucher_no
          AND e.currency=NEW.currency
          AND e.currency_scale=NEW.currency_scale
          AND json_extract(prior_bt.payload_json,'$.gl_account')=(
            SELECT json_extract(bt.payload_json,'$.gl_account')
            FROM documents bt
            WHERE bt.tenant_id=NEW.tenant_id
              AND bt.doctype='Bank Transaction'
              AND bt.name=NEW.bank_transaction
              AND bt.docstatus=1
          )
      ),0)+NEW.amount_minor >
      COALESCE((
        SELECT CASE json_extract(bt.payload_json,'$.transaction_type')
          WHEN 'Deposit' THEN SUM(g.debit_minor-g.credit_minor)
          WHEN 'Withdrawal' THEN SUM(g.credit_minor-g.debit_minor)
          ELSE 0
        END
        FROM documents bt
        JOIN gl_entries g
          ON g.tenant_id=bt.tenant_id
         AND g.voucher_type=NEW.against_voucher_type
         AND g.voucher_no=NEW.against_voucher_no
         AND g.account=json_extract(bt.payload_json,'$.gl_account')
         AND g.currency=NEW.currency
         AND g.currency_scale=NEW.currency_scale
        WHERE bt.tenant_id=NEW.tenant_id
          AND bt.doctype='Bank Transaction'
          AND bt.name=NEW.bank_transaction
          AND bt.docstatus=1
      ),0)
      THEN RAISE(ABORT,'BANK_RECONCILIATION_VOUCHER_OVER_ALLOCATED')
  END;
END;

-- A statement row or an authoritative voucher cannot be cancelled while an active reconciliation points at it.
DROP TRIGGER IF EXISTS bank_transaction_reconciled_cancel_guard;
CREATE TRIGGER bank_transaction_reconciled_cancel_guard
BEFORE UPDATE OF docstatus ON documents
WHEN OLD.doctype='Bank Transaction'
  AND OLD.docstatus=1
  AND NEW.docstatus=2
  AND COALESCE((
    SELECT SUM(e.amount_minor)
    FROM bank_reconciliation_entries e
    WHERE e.tenant_id=OLD.tenant_id
      AND e.bank_transaction=OLD.name
  ),0)<>0
BEGIN
  SELECT RAISE(ABORT,'BANK_TRANSACTION_ACTIVE_RECONCILIATION');
END;

DROP TRIGGER IF EXISTS bank_reconciled_voucher_cancel_guard;
CREATE TRIGGER bank_reconciled_voucher_cancel_guard
BEFORE UPDATE OF docstatus ON documents
WHEN OLD.docstatus=1
  AND NEW.docstatus=2
  AND OLD.doctype<>'Bank Reconciliation'
  AND COALESCE((
    SELECT SUM(e.amount_minor)
    FROM bank_reconciliation_entries e
    WHERE e.tenant_id=OLD.tenant_id
      AND e.against_voucher_type=OLD.doctype
      AND e.against_voucher_no=OLD.name
  ),0)<>0
BEGIN
  SELECT RAISE(ABORT,'BANK_RECONCILIATION_ACTIVE_VOUCHER');
END;

-- Bank statement import is evidence and remains allowed after close. Applying/removing reconciliation
-- changes financial control state, so Bank Reconciliation follows the same hard/soft-close policy as posting documents.
DROP TRIGGER IF EXISTS bank_reconciliation_period_insert_guard;
CREATE TRIGGER bank_reconciliation_period_insert_guard
BEFORE INSERT ON documents
WHEN NEW.doctype='Bank Reconciliation' AND NEW.docstatus=1
BEGIN
  SELECT CASE
    WHEN EXISTS(
      SELECT 1 FROM documents p
      WHERE p.tenant_id=NEW.tenant_id
        AND p.doctype='VN Accounting Period'
        AND p.docstatus=1
        AND json_extract(p.payload_json,'$.close_state')='Hard Locked'
        AND json_extract(p.payload_json,'$.company')=json_extract(NEW.payload_json,'$.company')
        AND (
          COALESCE(json_extract(p.payload_json,'$.branch'),'')=''
          OR json_extract(p.payload_json,'$.branch')=json_extract(NEW.payload_json,'$.branch')
        )
        AND date(json_extract(NEW.payload_json,'$.posting_at'))
          BETWEEN date(json_extract(p.payload_json,'$.start_date')) AND date(json_extract(p.payload_json,'$.end_date'))
    ) THEN RAISE(ABORT,'ACCOUNTING_PERIOD_HARD_LOCKED')
    WHEN EXISTS(
      SELECT 1 FROM documents p
      WHERE p.tenant_id=NEW.tenant_id
        AND p.doctype='VN Accounting Period'
        AND p.docstatus=1
        AND json_extract(p.payload_json,'$.close_state')='Soft Closed'
        AND json_extract(p.payload_json,'$.company')=json_extract(NEW.payload_json,'$.company')
        AND (
          COALESCE(json_extract(p.payload_json,'$.branch'),'')=''
          OR json_extract(p.payload_json,'$.branch')=json_extract(NEW.payload_json,'$.branch')
        )
        AND date(json_extract(NEW.payload_json,'$.posting_at'))
          BETWEEN date(json_extract(p.payload_json,'$.start_date')) AND date(json_extract(p.payload_json,'$.end_date'))
        AND NOT (
          COALESCE(CAST(json_extract(p.payload_json,'$.allow_approved_adjustments') AS INTEGER),0)=1
          AND COALESCE(CAST(json_extract(NEW.payload_json,'$.approved_adjustment') AS INTEGER),0)=1
          AND COALESCE(json_extract(NEW.payload_json,'$.adjustment_reason'),'')<>''
          AND COALESCE(json_extract(NEW.payload_json,'$.adjustment_approved_by'),'')<>''
        )
    ) THEN RAISE(ABORT,'ACCOUNTING_PERIOD_SOFT_CLOSED')
  END;
END;

DROP TRIGGER IF EXISTS bank_reconciliation_period_update_old_guard;
CREATE TRIGGER bank_reconciliation_period_update_old_guard
BEFORE UPDATE ON documents
WHEN OLD.doctype='Bank Reconciliation'
  AND OLD.docstatus=1
  AND (NEW.docstatus IS NOT OLD.docstatus OR NEW.payload_json IS NOT OLD.payload_json)
BEGIN
  SELECT CASE
    WHEN EXISTS(
      SELECT 1 FROM documents p
      WHERE p.tenant_id=OLD.tenant_id
        AND p.doctype='VN Accounting Period'
        AND p.docstatus=1
        AND json_extract(p.payload_json,'$.close_state')='Hard Locked'
        AND json_extract(p.payload_json,'$.company')=json_extract(OLD.payload_json,'$.company')
        AND (
          COALESCE(json_extract(p.payload_json,'$.branch'),'')=''
          OR json_extract(p.payload_json,'$.branch')=json_extract(OLD.payload_json,'$.branch')
        )
        AND date(json_extract(OLD.payload_json,'$.posting_at'))
          BETWEEN date(json_extract(p.payload_json,'$.start_date')) AND date(json_extract(p.payload_json,'$.end_date'))
    ) THEN RAISE(ABORT,'ACCOUNTING_PERIOD_HARD_LOCKED')
    WHEN EXISTS(
      SELECT 1 FROM documents p
      WHERE p.tenant_id=OLD.tenant_id
        AND p.doctype='VN Accounting Period'
        AND p.docstatus=1
        AND json_extract(p.payload_json,'$.close_state')='Soft Closed'
        AND json_extract(p.payload_json,'$.company')=json_extract(OLD.payload_json,'$.company')
        AND (
          COALESCE(json_extract(p.payload_json,'$.branch'),'')=''
          OR json_extract(p.payload_json,'$.branch')=json_extract(OLD.payload_json,'$.branch')
        )
        AND date(json_extract(OLD.payload_json,'$.posting_at'))
          BETWEEN date(json_extract(p.payload_json,'$.start_date')) AND date(json_extract(p.payload_json,'$.end_date'))
        AND NOT (
          COALESCE(CAST(json_extract(p.payload_json,'$.allow_approved_adjustments') AS INTEGER),0)=1
          AND COALESCE(CAST(json_extract(OLD.payload_json,'$.approved_adjustment') AS INTEGER),0)=1
          AND COALESCE(json_extract(OLD.payload_json,'$.adjustment_reason'),'')<>''
          AND COALESCE(json_extract(OLD.payload_json,'$.adjustment_approved_by'),'')<>''
        )
    ) THEN RAISE(ABORT,'ACCOUNTING_PERIOD_SOFT_CLOSED')
  END;
END;

DROP TRIGGER IF EXISTS bank_reconciliation_period_update_new_guard;
CREATE TRIGGER bank_reconciliation_period_update_new_guard
BEFORE UPDATE ON documents
WHEN NEW.doctype='Bank Reconciliation'
  AND NEW.docstatus=1
  AND (OLD.docstatus<>1 OR NEW.payload_json IS NOT OLD.payload_json)
BEGIN
  SELECT CASE
    WHEN EXISTS(
      SELECT 1 FROM documents p
      WHERE p.tenant_id=NEW.tenant_id
        AND p.doctype='VN Accounting Period'
        AND p.docstatus=1
        AND json_extract(p.payload_json,'$.close_state')='Hard Locked'
        AND json_extract(p.payload_json,'$.company')=json_extract(NEW.payload_json,'$.company')
        AND (
          COALESCE(json_extract(p.payload_json,'$.branch'),'')=''
          OR json_extract(p.payload_json,'$.branch')=json_extract(NEW.payload_json,'$.branch')
        )
        AND date(json_extract(NEW.payload_json,'$.posting_at'))
          BETWEEN date(json_extract(p.payload_json,'$.start_date')) AND date(json_extract(p.payload_json,'$.end_date'))
    ) THEN RAISE(ABORT,'ACCOUNTING_PERIOD_HARD_LOCKED')
    WHEN EXISTS(
      SELECT 1 FROM documents p
      WHERE p.tenant_id=NEW.tenant_id
        AND p.doctype='VN Accounting Period'
        AND p.docstatus=1
        AND json_extract(p.payload_json,'$.close_state')='Soft Closed'
        AND json_extract(p.payload_json,'$.company')=json_extract(NEW.payload_json,'$.company')
        AND (
          COALESCE(json_extract(p.payload_json,'$.branch'),'')=''
          OR json_extract(p.payload_json,'$.branch')=json_extract(NEW.payload_json,'$.branch')
        )
        AND date(json_extract(NEW.payload_json,'$.posting_at'))
          BETWEEN date(json_extract(p.payload_json,'$.start_date')) AND date(json_extract(p.payload_json,'$.end_date'))
        AND NOT (
          COALESCE(CAST(json_extract(p.payload_json,'$.allow_approved_adjustments') AS INTEGER),0)=1
          AND COALESCE(CAST(json_extract(NEW.payload_json,'$.approved_adjustment') AS INTEGER),0)=1
          AND COALESCE(json_extract(NEW.payload_json,'$.adjustment_reason'),'')<>''
          AND COALESCE(json_extract(NEW.payload_json,'$.adjustment_approved_by'),'')<>''
        )
    ) THEN RAISE(ABORT,'ACCOUNTING_PERIOD_SOFT_CLOSED')
  END;
END;

-- Fix the old hard-coded /100.0 report. Keep compatibility column names while respecting currency scale.
DROP VIEW IF EXISTS bank_reconciliation_summary;
CREATE VIEW bank_reconciliation_summary AS
SELECT
  e.tenant_id,
  e.bank_account,
  e.bank_transaction,
  e.currency,
  e.currency_scale,
  SUM(e.amount_minor) AS reconciled_amount_minor,
  CASE e.currency_scale
    WHEN 0 THEN SUM(e.amount_minor)*1.0
    WHEN 1 THEN SUM(e.amount_minor)/10.0
    WHEN 2 THEN SUM(e.amount_minor)/100.0
    WHEN 3 THEN SUM(e.amount_minor)/1000.0
    WHEN 4 THEN SUM(e.amount_minor)/10000.0
    WHEN 5 THEN SUM(e.amount_minor)/100000.0
    WHEN 6 THEN SUM(e.amount_minor)/1000000.0
  END AS reconciled_amount,
  MAX(e.posting_at) AS last_reconciled_at,
  SUM(CASE WHEN e.amount_minor>0 THEN 1 WHEN e.amount_minor<0 THEN -1 ELSE 0 END) AS match_count
FROM bank_reconciliation_entries e
GROUP BY e.tenant_id,e.bank_account,e.bank_transaction,e.currency,e.currency_scale;

-- Authoritative position projection. No balance is stored here: all balances are derived from GL,
-- while statement/reconciliation metrics remain evidence/control-state sidecars.
DROP VIEW IF EXISTS cash_bank_position;
CREATE VIEW cash_bank_position AS
WITH bank_sources AS (
  SELECT
    m.tenant_id,
    json_extract(m.data_json,'$.company') AS company,
    'Bank' AS position_type,
    m.name AS source_name,
    json_extract(m.data_json,'$.account') AS account,
    json_extract(m.data_json,'$.currency') AS currency
  FROM master_records m
  WHERE m.record_type='Bank Account'
    AND m.disabled=0
  UNION ALL
  SELECT
    d.tenant_id,
    json_extract(d.payload_json,'$.company') AS company,
    'Bank' AS position_type,
    d.name AS source_name,
    json_extract(d.payload_json,'$.account') AS account,
    json_extract(d.payload_json,'$.currency') AS currency
  FROM documents d
  WHERE d.doctype='Bank Account'
    AND d.docstatus<>2
    AND COALESCE(CAST(json_extract(d.payload_json,'$.disabled') AS INTEGER),0)=0
    AND NOT EXISTS(
      SELECT 1 FROM master_records m
      WHERE m.tenant_id=d.tenant_id
        AND m.record_type='Bank Account'
        AND m.name=d.name
        AND m.disabled=0
    )
),
cash_sources AS (
  SELECT
    d.tenant_id,
    json_extract(d.payload_json,'$.company') AS company,
    'Cash' AS position_type,
    d.name AS source_name,
    json_extract(d.payload_json,'$.cash_account') AS account,
    json_extract(d.payload_json,'$.currency') AS currency
  FROM documents d
  WHERE d.doctype='Warehouse Cash Fund'
    AND d.docstatus<>2
    AND COALESCE(CAST(json_extract(d.payload_json,'$.disabled') AS INTEGER),0)=0
),
sources AS (
  SELECT * FROM bank_sources
  UNION ALL
  SELECT * FROM cash_sources
)
SELECT
  s.tenant_id,
  s.company,
  s.position_type,
  s.source_name,
  s.account,
  s.currency,
  COALESCE((
    SELECT MAX(g.currency_scale)
    FROM gl_entries g
    WHERE g.tenant_id=s.tenant_id
      AND g.account=s.account
      AND g.currency=s.currency
  ),2) AS currency_scale,
  COALESCE((
    SELECT SUM(g.debit_minor-g.credit_minor)
    FROM gl_entries g
    WHERE g.tenant_id=s.tenant_id
      AND g.account=s.account
      AND g.currency=s.currency
  ),0) AS gl_balance_minor,
  CASE WHEN s.position_type='Bank' THEN COALESCE((
    SELECT SUM(COALESCE(
      CAST(json_extract(bt.payload_json,'$.signed_amount_minor') AS INTEGER),
      CASE json_extract(bt.payload_json,'$.transaction_type')
        WHEN 'Deposit' THEN CAST(json_extract(bt.payload_json,'$.amount_minor') AS INTEGER)
        WHEN 'Withdrawal' THEN -CAST(json_extract(bt.payload_json,'$.amount_minor') AS INTEGER)
        ELSE 0
      END
    ))
    FROM documents bt
    WHERE bt.tenant_id=s.tenant_id
      AND bt.doctype='Bank Transaction'
      AND bt.docstatus=1
      AND json_extract(bt.payload_json,'$.bank_account')=s.source_name
  ),0) ELSE NULL END AS statement_activity_minor,
  CASE WHEN s.position_type='Bank' THEN COALESCE((
    SELECT SUM(r.reconciled_amount_minor)
    FROM bank_reconciliation_summary r
    WHERE r.tenant_id=s.tenant_id
      AND r.bank_account=s.source_name
  ),0) ELSE NULL END AS reconciled_statement_minor,
  CASE WHEN s.position_type='Bank' THEN COALESCE((
    SELECT SUM(
      ABS(CAST(json_extract(bt.payload_json,'$.amount_minor') AS INTEGER))
      - COALESCE((
        SELECT SUM(e.amount_minor)
        FROM bank_reconciliation_entries e
        WHERE e.tenant_id=bt.tenant_id
          AND e.bank_transaction=bt.name
      ),0)
    )
    FROM documents bt
    WHERE bt.tenant_id=s.tenant_id
      AND bt.doctype='Bank Transaction'
      AND bt.docstatus=1
      AND json_extract(bt.payload_json,'$.bank_account')=s.source_name
  ),0) ELSE NULL END AS unreconciled_statement_minor
FROM sources s
WHERE COALESCE(s.account,'')<>'' AND COALESCE(s.currency,'')<>'';

-- Metadata: make statement provenance visible/generic and tighten bank-account configuration authority.
UPDATE doctype_definitions
SET revision=CASE WHEN revision<3 THEN 3 ELSE revision END,
    metadata_json=json_set(
      json_insert(
        metadata_json,
        '$.fields[#]',json('{"fieldname":"source_kind","label":"Source","fieldtype":"Select","options":"Manual\\nStatement Import\\nBank Feed","default":"Manual","in_list_view":true}'),
        '$.fields[#]',json('{"fieldname":"source_provider","label":"Source Provider","fieldtype":"Data"}'),
        '$.fields[#]',json('{"fieldname":"source_row_id","label":"Source Row ID","fieldtype":"Data"}'),
        '$.fields[#]',json('{"fieldname":"source_batch_id","label":"Source Batch ID","fieldtype":"Data"}')
      ),
      '$.revision',CASE WHEN revision<3 THEN 3 ELSE revision END
    )
WHERE doctype='Bank Transaction' AND revision<3;

UPDATE doctype_definitions
SET revision=CASE WHEN revision<3 THEN 3 ELSE revision END,
    metadata_json=json_set(
      metadata_json,
      '$.revision',CASE WHEN revision<3 THEN 3 ELSE revision END,
      '$.permissions',json('[{"role":"Accounts Manager","read":true,"write":true,"create":true,"print":true,"email":true,"report":true,"import":true,"export":true,"share":true,"submit":false,"cancel":false},{"role":"Accounts User","read":true,"write":false,"create":false,"print":true,"email":true,"report":true,"import":false,"export":true,"share":false,"submit":false,"cancel":false},{"role":"System Manager","read":true,"write":true,"create":true,"print":true,"email":true,"report":true,"import":true,"export":true,"share":true,"submit":false,"cancel":false}]')
    )
WHERE doctype='Bank Account' AND revision<3;
