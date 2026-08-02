-- Accounting integrity closure: company/branch scope, period coverage, legal-rule immutability,
-- scoped financial statements, and reconciliation exceptions.

CREATE TABLE IF NOT EXISTS accounting_ledger_scope (
  tenant_id TEXT NOT NULL,
  ledger_kind TEXT NOT NULL CHECK (ledger_kind IN ('GL','Payment')),
  voucher_type TEXT NOT NULL,
  voucher_no TEXT NOT NULL,
  voucher_revision INTEGER NOT NULL,
  line_key TEXT NOT NULL,
  company TEXT NOT NULL CHECK (length(trim(company)) > 0),
  branch TEXT,
  posting_at TEXT NOT NULL,
  PRIMARY KEY (tenant_id, ledger_kind, voucher_type, voucher_no, voucher_revision, line_key)
);
CREATE INDEX IF NOT EXISTS idx_accounting_ledger_scope_company_posting
  ON accounting_ledger_scope(tenant_id, company, branch, posting_at);
CREATE INDEX IF NOT EXISTS idx_accounting_ledger_scope_voucher
  ON accounting_ledger_scope(tenant_id, voucher_type, voucher_no, voucher_revision);

-- Backfill the scope from authoritative source/reference documents. Payment rows
-- prefer the against-voucher scope, so AR/AP remains attached to the invoice even
-- when a central treasury Payment Entry performs the settlement.
INSERT OR IGNORE INTO accounting_ledger_scope(
  tenant_id,ledger_kind,voucher_type,voucher_no,voucher_revision,line_key,company,branch,posting_at
)
SELECT g.tenant_id,'GL',g.voucher_type,g.voucher_no,g.voucher_revision,g.line_key,
       json_extract(d.payload_json,'$.company'),
       NULLIF(COALESCE(json_extract(d.payload_json,'$.branch'),json_extract(g.dimensions_json,'$.branch'),''),''),
       g.posting_at
FROM gl_entries g
JOIN documents d ON d.tenant_id=g.tenant_id AND d.doctype=g.voucher_type AND d.name=g.voucher_no
WHERE COALESCE(json_extract(d.payload_json,'$.company'),'')<>'';

INSERT OR IGNORE INTO accounting_ledger_scope(
  tenant_id,ledger_kind,voucher_type,voucher_no,voucher_revision,line_key,company,branch,posting_at
)
SELECT p.tenant_id,'Payment',p.voucher_type,p.voucher_no,p.voucher_revision,p.line_key,
       COALESCE(NULLIF(json_extract(r.payload_json,'$.company'),''),json_extract(s.payload_json,'$.company')),
       NULLIF(COALESCE(json_extract(r.payload_json,'$.branch'),json_extract(s.payload_json,'$.branch'),''),''),
       p.posting_at
FROM payment_ledger_entries p
JOIN documents s ON s.tenant_id=p.tenant_id AND s.doctype=p.voucher_type AND s.name=p.voucher_no
LEFT JOIN documents r ON r.tenant_id=p.tenant_id
  AND r.doctype=p.against_voucher_type AND r.name=p.against_voucher_no
WHERE COALESCE(COALESCE(NULLIF(json_extract(r.payload_json,'$.company'),''),json_extract(s.payload_json,'$.company')),'')<>'';

-- Migration fails closed if historical ledgers cannot be mapped to a legal entity,
-- or if a payment allocation crossed company boundaries.
DROP TABLE IF EXISTS accounting_scope_migration_guard;
CREATE TABLE accounting_scope_migration_guard (
  id INTEGER PRIMARY KEY CHECK (id=1),
  gl_missing INTEGER NOT NULL CHECK (gl_missing=0),
  payment_missing INTEGER NOT NULL CHECK (payment_missing=0),
  payment_cross_company INTEGER NOT NULL CHECK (payment_cross_company=0)
);
INSERT INTO accounting_scope_migration_guard(id,gl_missing,payment_missing,payment_cross_company)
SELECT 1,
  (SELECT COUNT(*) FROM gl_entries g
   LEFT JOIN accounting_ledger_scope s
     ON s.tenant_id=g.tenant_id AND s.ledger_kind='GL'
    AND s.voucher_type=g.voucher_type AND s.voucher_no=g.voucher_no
    AND s.voucher_revision=g.voucher_revision AND s.line_key=g.line_key
   WHERE s.tenant_id IS NULL),
  (SELECT COUNT(*) FROM payment_ledger_entries p
   LEFT JOIN accounting_ledger_scope s
     ON s.tenant_id=p.tenant_id AND s.ledger_kind='Payment'
    AND s.voucher_type=p.voucher_type AND s.voucher_no=p.voucher_no
    AND s.voucher_revision=p.voucher_revision AND s.line_key=p.line_key
   WHERE s.tenant_id IS NULL),
  (SELECT COUNT(*) FROM payment_ledger_entries p
   JOIN documents s ON s.tenant_id=p.tenant_id AND s.doctype=p.voucher_type AND s.name=p.voucher_no
   JOIN documents r ON r.tenant_id=p.tenant_id AND r.doctype=p.against_voucher_type AND r.name=p.against_voucher_no
   WHERE COALESCE(json_extract(s.payload_json,'$.company'),'')=''
      OR COALESCE(json_extract(r.payload_json,'$.company'),'')=''
      OR json_extract(s.payload_json,'$.company')<>json_extract(r.payload_json,'$.company'));
DROP TABLE accounting_scope_migration_guard;

DROP TRIGGER IF EXISTS accounting_gl_scope_guard;
CREATE TRIGGER accounting_gl_scope_guard
BEFORE INSERT ON gl_entries
BEGIN
  SELECT CASE
    WHEN NOT EXISTS(
      SELECT 1 FROM documents d
      WHERE d.tenant_id=NEW.tenant_id AND d.doctype=NEW.voucher_type AND d.name=NEW.voucher_no
        AND COALESCE(json_extract(d.payload_json,'$.company'),'')<>''
    ) THEN RAISE(ABORT,'GL_COMPANY_SCOPE_REQUIRED')
    WHEN EXISTS(
      SELECT 1
      FROM documents d
      JOIN master_records a
        ON a.tenant_id=d.tenant_id AND a.record_type='Account' AND a.name=NEW.account AND a.disabled=0
      WHERE d.tenant_id=NEW.tenant_id AND d.doctype=NEW.voucher_type AND d.name=NEW.voucher_no
        AND COALESCE(json_extract(a.data_json,'$.company'),'')<>''
        AND json_extract(a.data_json,'$.company')<>json_extract(d.payload_json,'$.company')
    ) THEN RAISE(ABORT,'GL_ACCOUNT_COMPANY_MISMATCH')
    WHEN EXISTS(
      SELECT 1 FROM documents d
      WHERE d.tenant_id=NEW.tenant_id AND d.doctype=NEW.voucher_type AND d.name=NEW.voucher_no
        AND COALESCE(json_extract(d.payload_json,'$.branch'),'')<>''
        AND COALESCE(json_extract(NEW.dimensions_json,'$.branch'),'')<>''
        AND json_extract(d.payload_json,'$.branch')<>json_extract(NEW.dimensions_json,'$.branch')
    ) THEN RAISE(ABORT,'GL_BRANCH_SCOPE_MISMATCH')
  END;
END;

DROP TRIGGER IF EXISTS accounting_gl_scope_capture;
CREATE TRIGGER accounting_gl_scope_capture
AFTER INSERT ON gl_entries
BEGIN
  INSERT INTO accounting_ledger_scope(
    tenant_id,ledger_kind,voucher_type,voucher_no,voucher_revision,line_key,company,branch,posting_at
  )
  SELECT NEW.tenant_id,'GL',NEW.voucher_type,NEW.voucher_no,NEW.voucher_revision,NEW.line_key,
         json_extract(d.payload_json,'$.company'),
         NULLIF(COALESCE(json_extract(d.payload_json,'$.branch'),json_extract(NEW.dimensions_json,'$.branch'),''),''),
         NEW.posting_at
  FROM documents d
  WHERE d.tenant_id=NEW.tenant_id AND d.doctype=NEW.voucher_type AND d.name=NEW.voucher_no;
END;

DROP TRIGGER IF EXISTS accounting_payment_scope_guard;
CREATE TRIGGER accounting_payment_scope_guard
BEFORE INSERT ON payment_ledger_entries
BEGIN
  SELECT CASE
    WHEN NOT EXISTS(
      SELECT 1 FROM documents d
      WHERE d.tenant_id=NEW.tenant_id AND d.doctype=NEW.voucher_type AND d.name=NEW.voucher_no
        AND COALESCE(json_extract(d.payload_json,'$.company'),'')<>''
    ) THEN RAISE(ABORT,'PAYMENT_COMPANY_SCOPE_REQUIRED')
    WHEN NEW.against_voucher_type IS NOT NULL AND NEW.against_voucher_no IS NOT NULL
      AND EXISTS(
        SELECT 1
        FROM documents s
        JOIN documents r ON r.tenant_id=s.tenant_id
          AND r.doctype=NEW.against_voucher_type AND r.name=NEW.against_voucher_no
        WHERE s.tenant_id=NEW.tenant_id AND s.doctype=NEW.voucher_type AND s.name=NEW.voucher_no
          AND COALESCE(json_extract(r.payload_json,'$.company'),'')<>''
          AND json_extract(s.payload_json,'$.company')<>json_extract(r.payload_json,'$.company')
      ) THEN RAISE(ABORT,'PAYMENT_REFERENCE_COMPANY_MISMATCH')
  END;
END;

DROP TRIGGER IF EXISTS accounting_payment_scope_capture;
CREATE TRIGGER accounting_payment_scope_capture
AFTER INSERT ON payment_ledger_entries
BEGIN
  INSERT INTO accounting_ledger_scope(
    tenant_id,ledger_kind,voucher_type,voucher_no,voucher_revision,line_key,company,branch,posting_at
  )
  SELECT NEW.tenant_id,'Payment',NEW.voucher_type,NEW.voucher_no,NEW.voucher_revision,NEW.line_key,
         COALESCE(NULLIF(json_extract(r.payload_json,'$.company'),''),json_extract(s.payload_json,'$.company')),
         NULLIF(COALESCE(json_extract(r.payload_json,'$.branch'),json_extract(s.payload_json,'$.branch'),''),''),
         NEW.posting_at
  FROM documents s
  LEFT JOIN documents r ON r.tenant_id=s.tenant_id
    AND r.doctype=NEW.against_voucher_type AND r.name=NEW.against_voucher_no
  WHERE s.tenant_id=NEW.tenant_id AND s.doctype=NEW.voucher_type AND s.name=NEW.voucher_no;
END;

-- A stock-affecting purchase receipt must never exist without its accounting
-- counterpart. D1MutationStore writes GL before stock in the same atomic batch.
DROP TRIGGER IF EXISTS purchase_receipt_requires_gl;
CREATE TRIGGER purchase_receipt_requires_gl
BEFORE INSERT ON stock_ledger_entries
WHEN NEW.voucher_type='Purchase Receipt'
  AND NEW.stock_value_difference_minor<>0
  AND NOT EXISTS(
    SELECT 1 FROM gl_entries g
    WHERE g.tenant_id=NEW.tenant_id AND g.voucher_type=NEW.voucher_type
      AND g.voucher_no=NEW.voucher_no AND g.voucher_revision=NEW.voucher_revision
  )
BEGIN
  SELECT RAISE(ABORT,'PURCHASE_RECEIPT_GL_REQUIRED');
END;

-- Payment Allocation mutates authoritative AR/AP and must obey the same period
-- boundary as Payment Entry and invoices.
DROP TRIGGER IF EXISTS vn_accounting_period_payment_allocation_insert_guard;
CREATE TRIGGER vn_accounting_period_payment_allocation_insert_guard
BEFORE INSERT ON documents
WHEN NEW.doctype='Payment Allocation' AND NEW.docstatus=1
BEGIN
  SELECT CASE
    WHEN EXISTS(
      SELECT 1 FROM documents p
      WHERE p.tenant_id=NEW.tenant_id AND p.doctype='VN Accounting Period' AND p.docstatus=1
        AND json_extract(p.payload_json,'$.close_state')='Hard Locked'
        AND json_extract(p.payload_json,'$.company')=json_extract(NEW.payload_json,'$.company')
        AND (COALESCE(json_extract(p.payload_json,'$.branch'),'')=''
          OR json_extract(p.payload_json,'$.branch')=json_extract(NEW.payload_json,'$.branch'))
        AND date(json_extract(NEW.payload_json,'$.posting_at'))
          BETWEEN date(json_extract(p.payload_json,'$.start_date')) AND date(json_extract(p.payload_json,'$.end_date'))
    ) THEN RAISE(ABORT,'ACCOUNTING_PERIOD_HARD_LOCKED')
    WHEN EXISTS(
      SELECT 1 FROM documents p
      WHERE p.tenant_id=NEW.tenant_id AND p.doctype='VN Accounting Period' AND p.docstatus=1
        AND json_extract(p.payload_json,'$.close_state')='Soft Closed'
        AND json_extract(p.payload_json,'$.company')=json_extract(NEW.payload_json,'$.company')
        AND (COALESCE(json_extract(p.payload_json,'$.branch'),'')=''
          OR json_extract(p.payload_json,'$.branch')=json_extract(NEW.payload_json,'$.branch'))
        AND date(json_extract(NEW.payload_json,'$.posting_at'))
          BETWEEN date(json_extract(p.payload_json,'$.start_date')) AND date(json_extract(p.payload_json,'$.end_date'))
        AND NOT(
          COALESCE(CAST(json_extract(p.payload_json,'$.allow_approved_adjustments') AS INTEGER),0)=1
          AND COALESCE(CAST(json_extract(NEW.payload_json,'$.approved_adjustment') AS INTEGER),0)=1
          AND COALESCE(json_extract(NEW.payload_json,'$.adjustment_reason'),'')<>''
          AND COALESCE(json_extract(NEW.payload_json,'$.adjustment_approved_by'),'')<>''
        )
    ) THEN RAISE(ABORT,'ACCOUNTING_PERIOD_SOFT_CLOSED')
  END;
END;

DROP TRIGGER IF EXISTS vn_accounting_period_payment_allocation_update_old_guard;
CREATE TRIGGER vn_accounting_period_payment_allocation_update_old_guard
BEFORE UPDATE ON documents
WHEN OLD.doctype='Payment Allocation' AND OLD.docstatus=1
  AND (NEW.docstatus IS NOT OLD.docstatus OR NEW.payload_json IS NOT OLD.payload_json)
BEGIN
  SELECT CASE
    WHEN EXISTS(
      SELECT 1 FROM documents p
      WHERE p.tenant_id=OLD.tenant_id AND p.doctype='VN Accounting Period' AND p.docstatus=1
        AND json_extract(p.payload_json,'$.close_state')='Hard Locked'
        AND json_extract(p.payload_json,'$.company')=json_extract(OLD.payload_json,'$.company')
        AND (COALESCE(json_extract(p.payload_json,'$.branch'),'')=''
          OR json_extract(p.payload_json,'$.branch')=json_extract(OLD.payload_json,'$.branch'))
        AND date(json_extract(OLD.payload_json,'$.posting_at'))
          BETWEEN date(json_extract(p.payload_json,'$.start_date')) AND date(json_extract(p.payload_json,'$.end_date'))
    ) THEN RAISE(ABORT,'ACCOUNTING_PERIOD_HARD_LOCKED')
    WHEN EXISTS(
      SELECT 1 FROM documents p
      WHERE p.tenant_id=OLD.tenant_id AND p.doctype='VN Accounting Period' AND p.docstatus=1
        AND json_extract(p.payload_json,'$.close_state')='Soft Closed'
        AND json_extract(p.payload_json,'$.company')=json_extract(OLD.payload_json,'$.company')
        AND (COALESCE(json_extract(p.payload_json,'$.branch'),'')=''
          OR json_extract(p.payload_json,'$.branch')=json_extract(OLD.payload_json,'$.branch'))
        AND date(json_extract(OLD.payload_json,'$.posting_at'))
          BETWEEN date(json_extract(p.payload_json,'$.start_date')) AND date(json_extract(p.payload_json,'$.end_date'))
        AND NOT(
          COALESCE(CAST(json_extract(p.payload_json,'$.allow_approved_adjustments') AS INTEGER),0)=1
          AND COALESCE(CAST(json_extract(OLD.payload_json,'$.approved_adjustment') AS INTEGER),0)=1
          AND COALESCE(json_extract(OLD.payload_json,'$.adjustment_reason'),'')<>''
          AND COALESCE(json_extract(OLD.payload_json,'$.adjustment_approved_by'),'')<>''
        )
    ) THEN RAISE(ABORT,'ACCOUNTING_PERIOD_SOFT_CLOSED')
  END;
END;

DROP TRIGGER IF EXISTS vn_accounting_period_payment_allocation_update_new_guard;
CREATE TRIGGER vn_accounting_period_payment_allocation_update_new_guard
BEFORE UPDATE ON documents
WHEN NEW.doctype='Payment Allocation' AND NEW.docstatus=1
  AND (OLD.docstatus<>1 OR NEW.payload_json IS NOT OLD.payload_json)
BEGIN
  SELECT CASE
    WHEN EXISTS(
      SELECT 1 FROM documents p
      WHERE p.tenant_id=NEW.tenant_id AND p.doctype='VN Accounting Period' AND p.docstatus=1
        AND json_extract(p.payload_json,'$.close_state')='Hard Locked'
        AND json_extract(p.payload_json,'$.company')=json_extract(NEW.payload_json,'$.company')
        AND (COALESCE(json_extract(p.payload_json,'$.branch'),'')=''
          OR json_extract(p.payload_json,'$.branch')=json_extract(NEW.payload_json,'$.branch'))
        AND date(json_extract(NEW.payload_json,'$.posting_at'))
          BETWEEN date(json_extract(p.payload_json,'$.start_date')) AND date(json_extract(p.payload_json,'$.end_date'))
    ) THEN RAISE(ABORT,'ACCOUNTING_PERIOD_HARD_LOCKED')
    WHEN EXISTS(
      SELECT 1 FROM documents p
      WHERE p.tenant_id=NEW.tenant_id AND p.doctype='VN Accounting Period' AND p.docstatus=1
        AND json_extract(p.payload_json,'$.close_state')='Soft Closed'
        AND json_extract(p.payload_json,'$.company')=json_extract(NEW.payload_json,'$.company')
        AND (COALESCE(json_extract(p.payload_json,'$.branch'),'')=''
          OR json_extract(p.payload_json,'$.branch')=json_extract(NEW.payload_json,'$.branch'))
        AND date(json_extract(NEW.payload_json,'$.posting_at'))
          BETWEEN date(json_extract(p.payload_json,'$.start_date')) AND date(json_extract(p.payload_json,'$.end_date'))
        AND NOT(
          COALESCE(CAST(json_extract(p.payload_json,'$.allow_approved_adjustments') AS INTEGER),0)=1
          AND COALESCE(CAST(json_extract(NEW.payload_json,'$.approved_adjustment') AS INTEGER),0)=1
          AND COALESCE(json_extract(NEW.payload_json,'$.adjustment_reason'),'')<>''
          AND COALESCE(json_extract(NEW.payload_json,'$.adjustment_approved_by'),'')<>''
        )
    ) THEN RAISE(ABORT,'ACCOUNTING_PERIOD_SOFT_CLOSED')
  END;
END;

-- Accounting policy and legal-rule effective intervals are deterministic.
DROP TRIGGER IF EXISTS vn_accounting_policy_effective_insert_guard;
CREATE TRIGGER vn_accounting_policy_effective_insert_guard
BEFORE INSERT ON documents
WHEN NEW.doctype='VN Accounting Policy' AND NEW.docstatus<>2
BEGIN
  SELECT CASE
    WHEN date(json_extract(NEW.payload_json,'$.effective_from')) IS NULL
      OR (COALESCE(json_extract(NEW.payload_json,'$.effective_to'),'')<>''
        AND date(json_extract(NEW.payload_json,'$.effective_to')) < date(json_extract(NEW.payload_json,'$.effective_from')))
    THEN RAISE(ABORT,'VN_ACCOUNTING_POLICY_INVALID_RANGE')
    WHEN NEW.docstatus=1 AND EXISTS(
      SELECT 1 FROM documents p
      WHERE p.tenant_id=NEW.tenant_id AND p.doctype='VN Accounting Policy' AND p.docstatus=1
        AND json_extract(p.payload_json,'$.company')=json_extract(NEW.payload_json,'$.company')
        AND date(json_extract(p.payload_json,'$.effective_from')) <= date(COALESCE(NULLIF(json_extract(NEW.payload_json,'$.effective_to'),''),'9999-12-31'))
        AND date(COALESCE(NULLIF(json_extract(p.payload_json,'$.effective_to'),''),'9999-12-31')) >= date(json_extract(NEW.payload_json,'$.effective_from'))
    ) THEN RAISE(ABORT,'VN_ACCOUNTING_POLICY_OVERLAP')
  END;
END;

DROP TRIGGER IF EXISTS vn_accounting_policy_effective_update_guard;
CREATE TRIGGER vn_accounting_policy_effective_update_guard
BEFORE UPDATE ON documents
WHEN NEW.doctype='VN Accounting Policy' AND NEW.docstatus<>2
BEGIN
  SELECT CASE
    WHEN date(json_extract(NEW.payload_json,'$.effective_from')) IS NULL
      OR (COALESCE(json_extract(NEW.payload_json,'$.effective_to'),'')<>''
        AND date(json_extract(NEW.payload_json,'$.effective_to')) < date(json_extract(NEW.payload_json,'$.effective_from')))
    THEN RAISE(ABORT,'VN_ACCOUNTING_POLICY_INVALID_RANGE')
    WHEN NEW.docstatus=1 AND EXISTS(
      SELECT 1 FROM documents p
      WHERE p.tenant_id=NEW.tenant_id AND p.doctype='VN Accounting Policy' AND p.docstatus=1
        AND p.doc_key<>OLD.doc_key
        AND json_extract(p.payload_json,'$.company')=json_extract(NEW.payload_json,'$.company')
        AND date(json_extract(p.payload_json,'$.effective_from')) <= date(COALESCE(NULLIF(json_extract(NEW.payload_json,'$.effective_to'),''),'9999-12-31'))
        AND date(COALESCE(NULLIF(json_extract(p.payload_json,'$.effective_to'),''),'9999-12-31')) >= date(json_extract(NEW.payload_json,'$.effective_from'))
    ) THEN RAISE(ABORT,'VN_ACCOUNTING_POLICY_OVERLAP')
  END;
END;

DROP TRIGGER IF EXISTS vn_legal_rule_effective_insert_guard;
CREATE TRIGGER vn_legal_rule_effective_insert_guard
BEFORE INSERT ON documents
WHEN NEW.doctype='VN Legal Rule' AND NEW.docstatus<>2
BEGIN
  SELECT CASE
    WHEN date(json_extract(NEW.payload_json,'$.effective_from')) IS NULL
      OR (COALESCE(json_extract(NEW.payload_json,'$.effective_to'),'')<>''
        AND date(json_extract(NEW.payload_json,'$.effective_to')) < date(json_extract(NEW.payload_json,'$.effective_from')))
    THEN RAISE(ABORT,'VN_LEGAL_RULE_INVALID_RANGE')
    WHEN NEW.docstatus=1 AND EXISTS(
      SELECT 1 FROM documents r
      WHERE r.tenant_id=NEW.tenant_id AND r.doctype='VN Legal Rule' AND r.docstatus=1
        AND json_extract(r.payload_json,'$.rule_type')=json_extract(NEW.payload_json,'$.rule_type')
        AND json_extract(r.payload_json,'$.regime_code')=json_extract(NEW.payload_json,'$.regime_code')
        AND json_extract(r.payload_json,'$.taxpayer_segment')=json_extract(NEW.payload_json,'$.taxpayer_segment')
        AND date(json_extract(r.payload_json,'$.effective_from')) <= date(COALESCE(NULLIF(json_extract(NEW.payload_json,'$.effective_to'),''),'9999-12-31'))
        AND date(COALESCE(NULLIF(json_extract(r.payload_json,'$.effective_to'),''),'9999-12-31')) >= date(json_extract(NEW.payload_json,'$.effective_from'))
    ) THEN RAISE(ABORT,'VN_LEGAL_RULE_OVERLAP')
  END;
END;

DROP TRIGGER IF EXISTS vn_legal_rule_effective_update_guard;
CREATE TRIGGER vn_legal_rule_effective_update_guard
BEFORE UPDATE ON documents
WHEN NEW.doctype='VN Legal Rule' AND NEW.docstatus<>2
BEGIN
  SELECT CASE
    WHEN OLD.docstatus=1 THEN RAISE(ABORT,'VN_LEGAL_RULE_IMMUTABLE')
    WHEN date(json_extract(NEW.payload_json,'$.effective_from')) IS NULL
      OR (COALESCE(json_extract(NEW.payload_json,'$.effective_to'),'')<>''
        AND date(json_extract(NEW.payload_json,'$.effective_to')) < date(json_extract(NEW.payload_json,'$.effective_from')))
    THEN RAISE(ABORT,'VN_LEGAL_RULE_INVALID_RANGE')
    WHEN NEW.docstatus=1 AND EXISTS(
      SELECT 1 FROM documents r
      WHERE r.tenant_id=NEW.tenant_id AND r.doctype='VN Legal Rule' AND r.docstatus=1
        AND r.doc_key<>OLD.doc_key
        AND json_extract(r.payload_json,'$.rule_type')=json_extract(NEW.payload_json,'$.rule_type')
        AND json_extract(r.payload_json,'$.regime_code')=json_extract(NEW.payload_json,'$.regime_code')
        AND json_extract(r.payload_json,'$.taxpayer_segment')=json_extract(NEW.payload_json,'$.taxpayer_segment')
        AND date(json_extract(r.payload_json,'$.effective_from')) <= date(COALESCE(NULLIF(json_extract(NEW.payload_json,'$.effective_to'),''),'9999-12-31'))
        AND date(COALESCE(NULLIF(json_extract(r.payload_json,'$.effective_to'),''),'9999-12-31')) >= date(json_extract(NEW.payload_json,'$.effective_from'))
    ) THEN RAISE(ABORT,'VN_LEGAL_RULE_OVERLAP')
  END;
END;

DROP TRIGGER IF EXISTS vn_legal_rule_delete_guard;
CREATE TRIGGER vn_legal_rule_delete_guard
BEFORE DELETE ON documents
WHEN OLD.doctype='VN Legal Rule' AND OLD.docstatus=1
BEGIN
  SELECT RAISE(ABORT,'VN_LEGAL_RULE_IMMUTABLE');
END;

-- TT99 mappings are versioned. A submitted mapping is immutable and replacement
-- happens by a new effective interval.
DROP TRIGGER IF EXISTS tt99_account_map_insert_guard;
CREATE TRIGGER tt99_account_map_insert_guard
BEFORE INSERT ON documents
WHEN NEW.doctype='TT99 Account Map' AND NEW.docstatus<>2
BEGIN
  SELECT CASE
    WHEN date(json_extract(NEW.payload_json,'$.effective_from')) IS NULL
      OR (COALESCE(json_extract(NEW.payload_json,'$.effective_to'),'')<>''
        AND date(json_extract(NEW.payload_json,'$.effective_to')) < date(json_extract(NEW.payload_json,'$.effective_from')))
    THEN RAISE(ABORT,'TT99_ACCOUNT_MAP_INVALID_RANGE')
    WHEN NEW.docstatus=1 AND EXISTS(
      SELECT 1 FROM documents m
      WHERE m.tenant_id=NEW.tenant_id AND m.doctype='TT99 Account Map' AND m.docstatus=1
        AND json_extract(m.payload_json,'$.company')=json_extract(NEW.payload_json,'$.company')
        AND json_extract(m.payload_json,'$.source_account')=json_extract(NEW.payload_json,'$.source_account')
        AND date(json_extract(m.payload_json,'$.effective_from')) <= date(COALESCE(NULLIF(json_extract(NEW.payload_json,'$.effective_to'),''),'9999-12-31'))
        AND date(COALESCE(NULLIF(json_extract(m.payload_json,'$.effective_to'),''),'9999-12-31')) >= date(json_extract(NEW.payload_json,'$.effective_from'))
    ) THEN RAISE(ABORT,'TT99_ACCOUNT_MAP_OVERLAP')
  END;
END;

DROP TRIGGER IF EXISTS tt99_account_map_update_guard;
CREATE TRIGGER tt99_account_map_update_guard
BEFORE UPDATE ON documents
WHEN NEW.doctype='TT99 Account Map' AND NEW.docstatus<>2
BEGIN
  SELECT CASE
    WHEN OLD.docstatus=1 THEN RAISE(ABORT,'TT99_ACCOUNT_MAP_IMMUTABLE')
    WHEN date(json_extract(NEW.payload_json,'$.effective_from')) IS NULL
      OR (COALESCE(json_extract(NEW.payload_json,'$.effective_to'),'')<>''
        AND date(json_extract(NEW.payload_json,'$.effective_to')) < date(json_extract(NEW.payload_json,'$.effective_from')))
    THEN RAISE(ABORT,'TT99_ACCOUNT_MAP_INVALID_RANGE')
    WHEN NEW.docstatus=1 AND EXISTS(
      SELECT 1 FROM documents m
      WHERE m.tenant_id=NEW.tenant_id AND m.doctype='TT99 Account Map' AND m.docstatus=1
        AND m.doc_key<>OLD.doc_key
        AND json_extract(m.payload_json,'$.company')=json_extract(NEW.payload_json,'$.company')
        AND json_extract(m.payload_json,'$.source_account')=json_extract(NEW.payload_json,'$.source_account')
        AND date(json_extract(m.payload_json,'$.effective_from')) <= date(COALESCE(NULLIF(json_extract(NEW.payload_json,'$.effective_to'),''),'9999-12-31'))
        AND date(COALESCE(NULLIF(json_extract(m.payload_json,'$.effective_to'),''),'9999-12-31')) >= date(json_extract(NEW.payload_json,'$.effective_from'))
    ) THEN RAISE(ABORT,'TT99_ACCOUNT_MAP_OVERLAP')
  END;
END;

DROP TRIGGER IF EXISTS tt99_account_map_delete_guard;
CREATE TRIGGER tt99_account_map_delete_guard
BEFORE DELETE ON documents
WHEN OLD.doctype='TT99 Account Map' AND OLD.docstatus=1
BEGIN SELECT RAISE(ABORT,'TT99_ACCOUNT_MAP_IMMUTABLE'); END;

-- Tax rulesets use explicit effective versions and immutable submitted formulas.
DROP TRIGGER IF EXISTS vn_tax_ruleset_insert_guard;
CREATE TRIGGER vn_tax_ruleset_insert_guard
BEFORE INSERT ON documents
WHEN NEW.doctype='VN Tax Ruleset' AND NEW.docstatus<>2
BEGIN
  SELECT CASE
    WHEN date(json_extract(NEW.payload_json,'$.effective_from')) IS NULL
      OR (COALESCE(json_extract(NEW.payload_json,'$.effective_to'),'')<>''
        AND date(json_extract(NEW.payload_json,'$.effective_to')) < date(json_extract(NEW.payload_json,'$.effective_from')))
    THEN RAISE(ABORT,'VN_TAX_RULESET_INVALID_RANGE')
    WHEN NEW.docstatus=1 AND EXISTS(
      SELECT 1 FROM documents r
      WHERE r.tenant_id=NEW.tenant_id AND r.doctype='VN Tax Ruleset' AND r.docstatus=1
        AND json_extract(r.payload_json,'$.company')=json_extract(NEW.payload_json,'$.company')
        AND json_extract(r.payload_json,'$.rule_type')=json_extract(NEW.payload_json,'$.rule_type')
        AND json_extract(r.payload_json,'$.taxpayer_segment')=json_extract(NEW.payload_json,'$.taxpayer_segment')
        AND date(json_extract(r.payload_json,'$.effective_from')) <= date(COALESCE(NULLIF(json_extract(NEW.payload_json,'$.effective_to'),''),'9999-12-31'))
        AND date(COALESCE(NULLIF(json_extract(r.payload_json,'$.effective_to'),''),'9999-12-31')) >= date(json_extract(NEW.payload_json,'$.effective_from'))
    ) THEN RAISE(ABORT,'VN_TAX_RULESET_OVERLAP')
  END;
END;

DROP TRIGGER IF EXISTS vn_tax_ruleset_update_guard;
CREATE TRIGGER vn_tax_ruleset_update_guard
BEFORE UPDATE ON documents
WHEN NEW.doctype='VN Tax Ruleset' AND NEW.docstatus<>2
BEGIN
  SELECT CASE
    WHEN OLD.docstatus=1 THEN RAISE(ABORT,'VN_TAX_RULESET_IMMUTABLE')
    WHEN date(json_extract(NEW.payload_json,'$.effective_from')) IS NULL
      OR (COALESCE(json_extract(NEW.payload_json,'$.effective_to'),'')<>''
        AND date(json_extract(NEW.payload_json,'$.effective_to')) < date(json_extract(NEW.payload_json,'$.effective_from')))
    THEN RAISE(ABORT,'VN_TAX_RULESET_INVALID_RANGE')
    WHEN NEW.docstatus=1 AND EXISTS(
      SELECT 1 FROM documents r
      WHERE r.tenant_id=NEW.tenant_id AND r.doctype='VN Tax Ruleset' AND r.docstatus=1
        AND r.doc_key<>OLD.doc_key
        AND json_extract(r.payload_json,'$.company')=json_extract(NEW.payload_json,'$.company')
        AND json_extract(r.payload_json,'$.rule_type')=json_extract(NEW.payload_json,'$.rule_type')
        AND json_extract(r.payload_json,'$.taxpayer_segment')=json_extract(NEW.payload_json,'$.taxpayer_segment')
        AND date(json_extract(r.payload_json,'$.effective_from')) <= date(COALESCE(NULLIF(json_extract(NEW.payload_json,'$.effective_to'),''),'9999-12-31'))
        AND date(COALESCE(NULLIF(json_extract(r.payload_json,'$.effective_to'),''),'9999-12-31')) >= date(json_extract(NEW.payload_json,'$.effective_from'))
    ) THEN RAISE(ABORT,'VN_TAX_RULESET_OVERLAP')
  END;
END;

DROP TRIGGER IF EXISTS vn_tax_ruleset_delete_guard;
CREATE TRIGGER vn_tax_ruleset_delete_guard
BEFORE DELETE ON documents
WHEN OLD.doctype='VN Tax Ruleset' AND OLD.docstatus=1
BEGIN SELECT RAISE(ABORT,'VN_TAX_RULESET_IMMUTABLE'); END;

-- Reconciliation differences are integer minor units. Resolution must point to
-- an existing submitted correction/reversal document.
DROP TRIGGER IF EXISTS vn_reconciliation_case_insert_guard;
CREATE TRIGGER vn_reconciliation_case_insert_guard
BEFORE INSERT ON documents
WHEN NEW.doctype='VN Reconciliation Case'
BEGIN
  SELECT CASE
    WHEN CAST(COALESCE(json_extract(NEW.payload_json,'$.expected_minor'),0) AS INTEGER)
       - CAST(COALESCE(json_extract(NEW.payload_json,'$.actual_minor'),0) AS INTEGER)
       <> CAST(COALESCE(json_extract(NEW.payload_json,'$.difference_minor'),0) AS INTEGER)
    THEN RAISE(ABORT,'VN_RECONCILIATION_DIFFERENCE_MISMATCH')
    WHEN NEW.docstatus=1 AND (
      COALESCE(json_extract(NEW.payload_json,'$.root_cause'),'')=''
      OR COALESCE(json_extract(NEW.payload_json,'$.resolution_doctype'),'')=''
      OR COALESCE(json_extract(NEW.payload_json,'$.resolution_document'),'')=''
      OR NOT EXISTS(
        SELECT 1 FROM documents r
        WHERE r.tenant_id=NEW.tenant_id
          AND r.doctype=json_extract(NEW.payload_json,'$.resolution_doctype')
          AND r.name=json_extract(NEW.payload_json,'$.resolution_document')
          AND r.docstatus=1
      )
    ) THEN RAISE(ABORT,'VN_RECONCILIATION_RESOLUTION_REQUIRED')
  END;
END;

DROP TRIGGER IF EXISTS vn_reconciliation_case_update_guard;
CREATE TRIGGER vn_reconciliation_case_update_guard
BEFORE UPDATE ON documents
WHEN NEW.doctype='VN Reconciliation Case'
BEGIN
  SELECT CASE
    WHEN OLD.docstatus=1 AND NEW.payload_json IS NOT OLD.payload_json
    THEN RAISE(ABORT,'VN_RECONCILIATION_RESOLVED_IMMUTABLE')
    WHEN CAST(COALESCE(json_extract(NEW.payload_json,'$.expected_minor'),0) AS INTEGER)
       - CAST(COALESCE(json_extract(NEW.payload_json,'$.actual_minor'),0) AS INTEGER)
       <> CAST(COALESCE(json_extract(NEW.payload_json,'$.difference_minor'),0) AS INTEGER)
    THEN RAISE(ABORT,'VN_RECONCILIATION_DIFFERENCE_MISMATCH')
    WHEN NEW.docstatus=1 AND (
      COALESCE(json_extract(NEW.payload_json,'$.root_cause'),'')=''
      OR COALESCE(json_extract(NEW.payload_json,'$.resolution_doctype'),'')=''
      OR COALESCE(json_extract(NEW.payload_json,'$.resolution_document'),'')=''
      OR NOT EXISTS(
        SELECT 1 FROM documents r
        WHERE r.tenant_id=NEW.tenant_id
          AND r.doctype=json_extract(NEW.payload_json,'$.resolution_doctype')
          AND r.name=json_extract(NEW.payload_json,'$.resolution_document')
          AND r.docstatus=1
      )
    ) THEN RAISE(ABORT,'VN_RECONCILIATION_RESOLUTION_REQUIRED')
  END;
END;

-- Company-scoped accounting reports. Currency scale is never hardcoded to 2.
DROP VIEW IF EXISTS receivable_outstanding;
CREATE VIEW receivable_outstanding AS
SELECT p.tenant_id,s.company,s.branch,p.party,p.currency,p.currency_scale,
       p.against_voucher_type,p.against_voucher_no,
       SUM(p.amount_minor) AS outstanding_minor,
       SUM(p.base_amount_minor) AS base_outstanding_minor,
       CAST(SUM(p.amount_minor) AS REAL)/
         CASE p.currency_scale WHEN 0 THEN 1 WHEN 1 THEN 10 WHEN 2 THEN 100 WHEN 3 THEN 1000
           WHEN 4 THEN 10000 WHEN 5 THEN 100000 ELSE 1000000 END AS outstanding_amount
FROM payment_ledger_entries p
JOIN accounting_ledger_scope s
  ON s.tenant_id=p.tenant_id AND s.ledger_kind='Payment'
 AND s.voucher_type=p.voucher_type AND s.voucher_no=p.voucher_no
 AND s.voucher_revision=p.voucher_revision AND s.line_key=p.line_key
WHERE p.account_type='Receivable'
GROUP BY p.tenant_id,s.company,s.branch,p.party,p.currency,p.currency_scale,p.against_voucher_type,p.against_voucher_no;

DROP VIEW IF EXISTS payable_outstanding;
CREATE VIEW payable_outstanding AS
SELECT p.tenant_id,s.company,s.branch,p.party,p.currency,p.currency_scale,
       p.against_voucher_type,p.against_voucher_no,
       SUM(p.amount_minor) AS outstanding_minor,
       SUM(p.base_amount_minor) AS base_outstanding_minor,
       CAST(SUM(p.amount_minor) AS REAL)/
         CASE p.currency_scale WHEN 0 THEN 1 WHEN 1 THEN 10 WHEN 2 THEN 100 WHEN 3 THEN 1000
           WHEN 4 THEN 10000 WHEN 5 THEN 100000 ELSE 1000000 END AS outstanding_amount
FROM payment_ledger_entries p
JOIN accounting_ledger_scope s
  ON s.tenant_id=p.tenant_id AND s.ledger_kind='Payment'
 AND s.voucher_type=p.voucher_type AND s.voucher_no=p.voucher_no
 AND s.voucher_revision=p.voucher_revision AND s.line_key=p.line_key
WHERE p.account_type='Payable'
GROUP BY p.tenant_id,s.company,s.branch,p.party,p.currency,p.currency_scale,p.against_voucher_type,p.against_voucher_no;

DROP VIEW IF EXISTS general_ledger_report;
CREATE VIEW general_ledger_report AS
SELECT g.tenant_id,s.company,s.branch,g.posting_at,g.voucher_type,g.voucher_no,g.account,
       g.party_type,g.party,g.currency,g.currency_scale,
       CAST(g.debit_minor AS REAL)/
         CASE g.currency_scale WHEN 0 THEN 1 WHEN 1 THEN 10 WHEN 2 THEN 100 WHEN 3 THEN 1000
           WHEN 4 THEN 10000 WHEN 5 THEN 100000 ELSE 1000000 END AS debit,
       CAST(g.credit_minor AS REAL)/
         CASE g.currency_scale WHEN 0 THEN 1 WHEN 1 THEN 10 WHEN 2 THEN 100 WHEN 3 THEN 1000
           WHEN 4 THEN 10000 WHEN 5 THEN 100000 ELSE 1000000 END AS credit,
       g.cost_center
FROM gl_entries g
JOIN accounting_ledger_scope s
  ON s.tenant_id=g.tenant_id AND s.ledger_kind='GL'
 AND s.voucher_type=g.voucher_type AND s.voucher_no=g.voucher_no
 AND s.voucher_revision=g.voucher_revision AND s.line_key=g.line_key;

DROP VIEW IF EXISTS trial_balance;
CREATE VIEW trial_balance AS
SELECT g.tenant_id,s.company,s.branch,g.account,g.currency,g.currency_scale,
       CAST(SUM(g.debit_minor) AS REAL)/
         CASE g.currency_scale WHEN 0 THEN 1 WHEN 1 THEN 10 WHEN 2 THEN 100 WHEN 3 THEN 1000
           WHEN 4 THEN 10000 WHEN 5 THEN 100000 ELSE 1000000 END AS debit,
       CAST(SUM(g.credit_minor) AS REAL)/
         CASE g.currency_scale WHEN 0 THEN 1 WHEN 1 THEN 10 WHEN 2 THEN 100 WHEN 3 THEN 1000
           WHEN 4 THEN 10000 WHEN 5 THEN 100000 ELSE 1000000 END AS credit,
       CAST(SUM(g.debit_minor-g.credit_minor) AS REAL)/
         CASE g.currency_scale WHEN 0 THEN 1 WHEN 1 THEN 10 WHEN 2 THEN 100 WHEN 3 THEN 1000
           WHEN 4 THEN 10000 WHEN 5 THEN 100000 ELSE 1000000 END AS balance
FROM gl_entries g
JOIN accounting_ledger_scope s
  ON s.tenant_id=g.tenant_id AND s.ledger_kind='GL'
 AND s.voucher_type=g.voucher_type AND s.voucher_no=g.voucher_no
 AND s.voucher_revision=g.voucher_revision AND s.line_key=g.line_key
GROUP BY g.tenant_id,s.company,s.branch,g.account,g.currency,g.currency_scale;

DROP VIEW IF EXISTS profit_and_loss;
CREATE VIEW profit_and_loss AS
SELECT g.tenant_id,s.company,s.branch,g.account,
       json_extract(m.data_json,'$.root_type') AS root_type,
       g.currency,g.currency_scale,
       CAST(SUM(g.debit_minor) AS REAL)/
         CASE g.currency_scale WHEN 0 THEN 1 WHEN 1 THEN 10 WHEN 2 THEN 100 WHEN 3 THEN 1000
           WHEN 4 THEN 10000 WHEN 5 THEN 100000 ELSE 1000000 END AS debit,
       CAST(SUM(g.credit_minor) AS REAL)/
         CASE g.currency_scale WHEN 0 THEN 1 WHEN 1 THEN 10 WHEN 2 THEN 100 WHEN 3 THEN 1000
           WHEN 4 THEN 10000 WHEN 5 THEN 100000 ELSE 1000000 END AS credit,
       CAST(CASE WHEN json_extract(m.data_json,'$.root_type')='Income'
            THEN SUM(g.credit_minor)-SUM(g.debit_minor)
            ELSE SUM(g.debit_minor)-SUM(g.credit_minor) END AS REAL)/
         CASE g.currency_scale WHEN 0 THEN 1 WHEN 1 THEN 10 WHEN 2 THEN 100 WHEN 3 THEN 1000
           WHEN 4 THEN 10000 WHEN 5 THEN 100000 ELSE 1000000 END AS balance
FROM gl_entries g
JOIN accounting_ledger_scope s
  ON s.tenant_id=g.tenant_id AND s.ledger_kind='GL'
 AND s.voucher_type=g.voucher_type AND s.voucher_no=g.voucher_no
 AND s.voucher_revision=g.voucher_revision AND s.line_key=g.line_key
JOIN master_records m ON m.tenant_id=g.tenant_id AND m.record_type='Account' AND m.name=g.account AND m.disabled=0
WHERE json_extract(m.data_json,'$.root_type') IN ('Income','Expense')
GROUP BY g.tenant_id,s.company,s.branch,g.account,root_type,g.currency,g.currency_scale;

DROP VIEW IF EXISTS balance_sheet;
CREATE VIEW balance_sheet AS
SELECT g.tenant_id,s.company,s.branch,g.account,
       json_extract(m.data_json,'$.root_type') AS root_type,
       g.currency,g.currency_scale,
       CAST(SUM(g.debit_minor) AS REAL)/
         CASE g.currency_scale WHEN 0 THEN 1 WHEN 1 THEN 10 WHEN 2 THEN 100 WHEN 3 THEN 1000
           WHEN 4 THEN 10000 WHEN 5 THEN 100000 ELSE 1000000 END AS debit,
       CAST(SUM(g.credit_minor) AS REAL)/
         CASE g.currency_scale WHEN 0 THEN 1 WHEN 1 THEN 10 WHEN 2 THEN 100 WHEN 3 THEN 1000
           WHEN 4 THEN 10000 WHEN 5 THEN 100000 ELSE 1000000 END AS credit,
       CAST(CASE WHEN json_extract(m.data_json,'$.root_type')='Asset'
            THEN SUM(g.debit_minor)-SUM(g.credit_minor)
            ELSE SUM(g.credit_minor)-SUM(g.debit_minor) END AS REAL)/
         CASE g.currency_scale WHEN 0 THEN 1 WHEN 1 THEN 10 WHEN 2 THEN 100 WHEN 3 THEN 1000
           WHEN 4 THEN 10000 WHEN 5 THEN 100000 ELSE 1000000 END AS balance
FROM gl_entries g
JOIN accounting_ledger_scope s
  ON s.tenant_id=g.tenant_id AND s.ledger_kind='GL'
 AND s.voucher_type=g.voucher_type AND s.voucher_no=g.voucher_no
 AND s.voucher_revision=g.voucher_revision AND s.line_key=g.line_key
JOIN master_records m ON m.tenant_id=g.tenant_id AND m.record_type='Account' AND m.name=g.account AND m.disabled=0
WHERE json_extract(m.data_json,'$.root_type') IN ('Asset','Liability','Equity')
GROUP BY g.tenant_id,s.company,s.branch,g.account,root_type,g.currency,g.currency_scale;

DROP VIEW IF EXISTS cash_flow;
CREATE VIEW cash_flow AS
SELECT g.tenant_id,s.company,s.branch,g.account,g.currency,g.currency_scale,
       CAST(SUM(g.debit_minor-g.credit_minor) AS REAL)/
         CASE g.currency_scale WHEN 0 THEN 1 WHEN 1 THEN 10 WHEN 2 THEN 100 WHEN 3 THEN 1000
           WHEN 4 THEN 10000 WHEN 5 THEN 100000 ELSE 1000000 END AS net_cash_flow
FROM gl_entries g
JOIN accounting_ledger_scope s
  ON s.tenant_id=g.tenant_id AND s.ledger_kind='GL'
 AND s.voucher_type=g.voucher_type AND s.voucher_no=g.voucher_no
 AND s.voucher_revision=g.voucher_revision AND s.line_key=g.line_key
JOIN master_records m ON m.tenant_id=g.tenant_id AND m.record_type='Account' AND m.name=g.account AND m.disabled=0
WHERE json_extract(m.data_json,'$.account_type') IN ('Cash','Bank')
GROUP BY g.tenant_id,s.company,s.branch,g.account,g.currency,g.currency_scale;

-- Machine-queryable accounting control tower. A clean production ledger returns zero rows.
DROP VIEW IF EXISTS accounting_integrity_exceptions;
CREATE VIEW accounting_integrity_exceptions AS
SELECT g.tenant_id,'CRITICAL' AS severity,'GL_SCOPE_MISSING' AS code,
       NULL AS company,g.voucher_type,g.voucher_no,g.voucher_revision,
       'GL line has no authoritative company scope' AS details
FROM gl_entries g
LEFT JOIN accounting_ledger_scope s
  ON s.tenant_id=g.tenant_id AND s.ledger_kind='GL'
 AND s.voucher_type=g.voucher_type AND s.voucher_no=g.voucher_no
 AND s.voucher_revision=g.voucher_revision AND s.line_key=g.line_key
WHERE s.tenant_id IS NULL
UNION ALL
SELECT p.tenant_id,'CRITICAL','PAYMENT_SCOPE_MISSING',
       NULL,p.voucher_type,p.voucher_no,p.voucher_revision,
       'Payment-ledger line has no authoritative company scope'
FROM payment_ledger_entries p
LEFT JOIN accounting_ledger_scope s
  ON s.tenant_id=p.tenant_id AND s.ledger_kind='Payment'
 AND s.voucher_type=p.voucher_type AND s.voucher_no=p.voucher_no
 AND s.voucher_revision=p.voucher_revision AND s.line_key=p.line_key
WHERE s.tenant_id IS NULL
UNION ALL
SELECT g.tenant_id,'CRITICAL','GL_VOUCHER_IMBALANCED',
       MIN(s.company),g.voucher_type,g.voucher_no,g.voucher_revision,
       'Voucher revision is not balanced'
FROM gl_entries g
LEFT JOIN accounting_ledger_scope s
  ON s.tenant_id=g.tenant_id AND s.ledger_kind='GL'
 AND s.voucher_type=g.voucher_type AND s.voucher_no=g.voucher_no
 AND s.voucher_revision=g.voucher_revision AND s.line_key=g.line_key
GROUP BY g.tenant_id,g.voucher_type,g.voucher_no,g.voucher_revision
HAVING SUM(g.debit_minor)<>SUM(g.credit_minor)
UNION ALL
SELECT d.tenant_id,'CRITICAL','PURCHASE_RECEIPT_WITHOUT_GL',
       json_extract(d.payload_json,'$.company'),d.doctype,d.name,
       COALESCE(MAX(s.voucher_revision),d.version),
       'Submitted Purchase Receipt changed stock value without GL'
FROM documents d
JOIN stock_ledger_entries s ON s.tenant_id=d.tenant_id AND s.voucher_type=d.doctype AND s.voucher_no=d.name
LEFT JOIN gl_entries g ON g.tenant_id=s.tenant_id AND g.voucher_type=s.voucher_type
  AND g.voucher_no=s.voucher_no AND g.voucher_revision=s.voucher_revision
WHERE d.doctype='Purchase Receipt' AND d.docstatus=1 AND s.stock_value_difference_minor<>0
GROUP BY d.tenant_id,d.doc_key
HAVING COUNT(g.line_key)=0
UNION ALL
SELECT d.tenant_id,'HIGH','STOCK_ENTRY_WITHOUT_GL',
       json_extract(d.payload_json,'$.company'),d.doctype,d.name,
       COALESCE(MAX(s.voucher_revision),d.version),
       'Material Receipt/Issue changed stock value without GL'
FROM documents d
JOIN stock_ledger_entries s ON s.tenant_id=d.tenant_id AND s.voucher_type=d.doctype AND s.voucher_no=d.name
LEFT JOIN gl_entries g ON g.tenant_id=s.tenant_id AND g.voucher_type=s.voucher_type
  AND g.voucher_no=s.voucher_no AND g.voucher_revision=s.voucher_revision
WHERE d.doctype='Stock Entry' AND d.docstatus=1
  AND json_extract(d.payload_json,'$.purpose') IN ('Material Receipt','Material Issue')
  AND s.stock_value_difference_minor<>0
GROUP BY d.tenant_id,d.doc_key
HAVING COUNT(g.line_key)=0;

-- Server-authenticated audit rows are the approval evidence. Payload fields such as
-- approved_by are display metadata only and must never be the sole audit source.
DROP VIEW IF EXISTS accounting_approval_evidence;
CREATE VIEW accounting_approval_evidence AS
SELECT v.tenant_id,v.doc_key,
       json_extract(v.snapshot_json,'$.doctype') AS doctype,
       json_extract(v.snapshot_json,'$.name') AS name,
       v.actor AS approved_by,v.created_at AS approved_at,v.command_id,
       v.version
FROM versions v
WHERE v.action='submit'
  AND json_extract(v.snapshot_json,'$.doctype') IN (
    'VN Accounting Policy','VN Legal Rule','VN Accounting Period',
    'TT99 Account Map','VN Tax Ruleset','VN Reconciliation Case','Payroll Accounting Batch'
  );