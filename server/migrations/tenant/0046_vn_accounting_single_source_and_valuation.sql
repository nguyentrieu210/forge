-- Make VN Accounting the single control source for opted-in companies and close
-- base-currency valuation/COGS invariants on the sales side.

-- A company that has moved to submitted VN Accounting Policy no longer uses the
-- legacy single lock_date table. New VN Accounting Period triggers are authoritative.
DELETE FROM accounting_period_locks
WHERE EXISTS(
  SELECT 1 FROM documents p
  WHERE p.tenant_id=accounting_period_locks.tenant_id
    AND p.doctype='VN Accounting Policy' AND p.docstatus=1
    AND json_extract(p.payload_json,'$.company')=accounting_period_locks.company
);

DROP TRIGGER IF EXISTS legacy_accounting_lock_vn_policy_insert_guard;
CREATE TRIGGER legacy_accounting_lock_vn_policy_insert_guard
BEFORE INSERT ON accounting_period_locks
WHEN EXISTS(
  SELECT 1 FROM documents p
  WHERE p.tenant_id=NEW.tenant_id AND p.doctype='VN Accounting Policy' AND p.docstatus=1
    AND json_extract(p.payload_json,'$.company')=NEW.company
)
BEGIN
  SELECT RAISE(ABORT,'USE_VN_ACCOUNTING_PERIOD');
END;

DROP TRIGGER IF EXISTS legacy_accounting_lock_vn_policy_update_guard;
CREATE TRIGGER legacy_accounting_lock_vn_policy_update_guard
BEFORE UPDATE ON accounting_period_locks
WHEN EXISTS(
  SELECT 1 FROM documents p
  WHERE p.tenant_id=NEW.tenant_id AND p.doctype='VN Accounting Policy' AND p.docstatus=1
    AND json_extract(p.payload_json,'$.company')=NEW.company
)
BEGIN
  SELECT RAISE(ABORT,'USE_VN_ACCOUNTING_PERIOD');
END;

DROP TRIGGER IF EXISTS vn_policy_supersede_legacy_lock_insert;
CREATE TRIGGER vn_policy_supersede_legacy_lock_insert
AFTER INSERT ON documents
WHEN NEW.doctype='VN Accounting Policy' AND NEW.docstatus=1
BEGIN
  DELETE FROM accounting_period_locks
  WHERE tenant_id=NEW.tenant_id AND company=json_extract(NEW.payload_json,'$.company');
END;

DROP TRIGGER IF EXISTS vn_policy_supersede_legacy_lock_update;
CREATE TRIGGER vn_policy_supersede_legacy_lock_update
AFTER UPDATE ON documents
WHEN NEW.doctype='VN Accounting Policy' AND NEW.docstatus=1 AND OLD.docstatus<>1
BEGIN
  DELETE FROM accounting_period_locks
  WHERE tenant_id=NEW.tenant_id AND company=json_extract(NEW.payload_json,'$.company');
END;

-- Critical accounting controls must be present before a policy can become active.
DROP TRIGGER IF EXISTS vn_accounting_policy_controls_insert_guard;
CREATE TRIGGER vn_accounting_policy_controls_insert_guard
BEFORE INSERT ON documents
WHEN NEW.doctype='VN Accounting Policy' AND NEW.docstatus=1
BEGIN
  SELECT CASE
    WHEN COALESCE(json_extract(NEW.payload_json,'$.accounting_currency'),'')=''
      OR COALESCE(json_extract(NEW.payload_json,'$.inventory_account'),'')=''
      OR COALESCE(json_extract(NEW.payload_json,'$.cogs_account'),'')=''
      OR COALESCE(json_extract(NEW.payload_json,'$.stock_adjustment_account'),'')=''
      OR COALESCE(json_extract(NEW.payload_json,'$.stock_received_but_not_billed_account'),'')=''
    THEN RAISE(ABORT,'VN_ACCOUNTING_POLICY_CONTROLS_REQUIRED')
    WHEN COALESCE((
      SELECT json_extract(c.data_json,'$.default_currency') FROM master_records c
      WHERE c.tenant_id=NEW.tenant_id AND c.record_type='Company'
        AND c.name=json_extract(NEW.payload_json,'$.company') AND c.disabled=0
      LIMIT 1
    ), json_extract(NEW.payload_json,'$.accounting_currency')) <> json_extract(NEW.payload_json,'$.accounting_currency')
    THEN RAISE(ABORT,'VN_ACCOUNTING_POLICY_CURRENCY_MISMATCH')
  END;
END;

DROP TRIGGER IF EXISTS vn_accounting_policy_controls_update_guard;
CREATE TRIGGER vn_accounting_policy_controls_update_guard
BEFORE UPDATE ON documents
WHEN NEW.doctype='VN Accounting Policy' AND NEW.docstatus=1
BEGIN
  SELECT CASE
    WHEN COALESCE(json_extract(NEW.payload_json,'$.accounting_currency'),'')=''
      OR COALESCE(json_extract(NEW.payload_json,'$.inventory_account'),'')=''
      OR COALESCE(json_extract(NEW.payload_json,'$.cogs_account'),'')=''
      OR COALESCE(json_extract(NEW.payload_json,'$.stock_adjustment_account'),'')=''
      OR COALESCE(json_extract(NEW.payload_json,'$.stock_received_but_not_billed_account'),'')=''
    THEN RAISE(ABORT,'VN_ACCOUNTING_POLICY_CONTROLS_REQUIRED')
    WHEN COALESCE((
      SELECT json_extract(c.data_json,'$.default_currency') FROM master_records c
      WHERE c.tenant_id=NEW.tenant_id AND c.record_type='Company'
        AND c.name=json_extract(NEW.payload_json,'$.company') AND c.disabled=0
      LIMIT 1
    ), json_extract(NEW.payload_json,'$.accounting_currency')) <> json_extract(NEW.payload_json,'$.accounting_currency')
    THEN RAISE(ABORT,'VN_ACCOUNTING_POLICY_CURRENCY_MISMATCH')
  END;
END;

-- Delivery Note/COGS must accompany every valued stock issue under active policy.
DROP TRIGGER IF EXISTS vn_delivery_note_requires_gl;
CREATE TRIGGER vn_delivery_note_requires_gl
BEFORE INSERT ON stock_ledger_entries
WHEN NEW.voucher_type='Delivery Note' AND NEW.stock_value_difference_minor<>0
  AND EXISTS(
    SELECT 1 FROM documents d
    WHERE d.tenant_id=NEW.tenant_id AND d.doctype='Delivery Note' AND d.name=NEW.voucher_no
      AND EXISTS(
        SELECT 1 FROM documents p
        WHERE p.tenant_id=d.tenant_id AND p.doctype='VN Accounting Policy' AND p.docstatus=1
          AND json_extract(p.payload_json,'$.company')=json_extract(d.payload_json,'$.company')
          AND date(COALESCE(json_extract(d.payload_json,'$.posting_at'),NEW.posting_at))>=date(json_extract(p.payload_json,'$.effective_from'))
          AND date(COALESCE(json_extract(d.payload_json,'$.posting_at'),NEW.posting_at))<=date(COALESCE(NULLIF(json_extract(p.payload_json,'$.effective_to'),''),'9999-12-31'))
      )
  )
  AND NOT EXISTS(
    SELECT 1 FROM gl_entries g
    WHERE g.tenant_id=NEW.tenant_id AND g.voucher_type=NEW.voucher_type
      AND g.voucher_no=NEW.voucher_no AND g.voucher_revision=NEW.voucher_revision
  )
BEGIN
  SELECT RAISE(ABORT,'DELIVERY_NOTE_GL_REQUIRED');
END;

DROP TRIGGER IF EXISTS vn_delivery_note_requires_balanced_gl;
CREATE TRIGGER vn_delivery_note_requires_balanced_gl
BEFORE INSERT ON stock_ledger_entries
WHEN NEW.voucher_type='Delivery Note' AND NEW.stock_value_difference_minor<>0
  AND EXISTS(
    SELECT 1 FROM documents d
    WHERE d.tenant_id=NEW.tenant_id AND d.doctype='Delivery Note' AND d.name=NEW.voucher_no
      AND EXISTS(
        SELECT 1 FROM documents p
        WHERE p.tenant_id=d.tenant_id AND p.doctype='VN Accounting Policy' AND p.docstatus=1
          AND json_extract(p.payload_json,'$.company')=json_extract(d.payload_json,'$.company')
          AND date(COALESCE(json_extract(d.payload_json,'$.posting_at'),NEW.posting_at))>=date(json_extract(p.payload_json,'$.effective_from'))
          AND date(COALESCE(json_extract(d.payload_json,'$.posting_at'),NEW.posting_at))<=date(COALESCE(NULLIF(json_extract(p.payload_json,'$.effective_to'),''),'9999-12-31'))
      )
  )
  AND EXISTS(
    SELECT 1 FROM gl_entries g
    WHERE g.tenant_id=NEW.tenant_id AND g.voucher_type=NEW.voucher_type
      AND g.voucher_no=NEW.voucher_no AND g.voucher_revision=NEW.voucher_revision
  )
  AND (
    SELECT COALESCE(SUM(g.debit_minor),0)<>COALESCE(SUM(g.credit_minor),0)
    FROM gl_entries g
    WHERE g.tenant_id=NEW.tenant_id AND g.voucher_type=NEW.voucher_type
      AND g.voucher_no=NEW.voucher_no AND g.voucher_revision=NEW.voucher_revision
  )
BEGIN
  SELECT RAISE(ABORT,'DELIVERY_NOTE_GL_UNBALANCED');
END;

-- Rebuild control tower with policy currency/COGS and stock-currency diagnostics.
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
SELECT p.tenant_id,'CRITICAL','PAYMENT_SCOPE_MISSING',NULL,p.voucher_type,p.voucher_no,p.voucher_revision,
       'Payment-ledger line has no authoritative company scope'
FROM payment_ledger_entries p
LEFT JOIN accounting_ledger_scope s
  ON s.tenant_id=p.tenant_id AND s.ledger_kind='Payment'
 AND s.voucher_type=p.voucher_type AND s.voucher_no=p.voucher_no
 AND s.voucher_revision=p.voucher_revision AND s.line_key=p.line_key
WHERE s.tenant_id IS NULL
UNION ALL
SELECT g.tenant_id,'CRITICAL','GL_VOUCHER_IMBALANCED',MIN(s.company),g.voucher_type,g.voucher_no,g.voucher_revision,
       'Voucher revision is not balanced'
FROM gl_entries g
LEFT JOIN accounting_ledger_scope s
  ON s.tenant_id=g.tenant_id AND s.ledger_kind='GL'
 AND s.voucher_type=g.voucher_type AND s.voucher_no=g.voucher_no
 AND s.voucher_revision=g.voucher_revision AND s.line_key=g.line_key
GROUP BY g.tenant_id,g.voucher_type,g.voucher_no,g.voucher_revision
HAVING SUM(g.debit_minor)<>SUM(g.credit_minor)
UNION ALL
SELECT p.tenant_id,'CRITICAL','VN_POLICY_CONTROLS_MISSING',json_extract(p.payload_json,'$.company'),
       'VN Accounting Policy',p.name,p.version,
       'Approved policy must define accounting currency, inventory, COGS, stock-adjustment and received-not-billed accounts'
FROM documents p
WHERE p.doctype='VN Accounting Policy' AND p.docstatus=1
  AND (
    COALESCE(json_extract(p.payload_json,'$.accounting_currency'),'')=''
    OR COALESCE(json_extract(p.payload_json,'$.inventory_account'),'')=''
    OR COALESCE(json_extract(p.payload_json,'$.cogs_account'),'')=''
    OR COALESCE(json_extract(p.payload_json,'$.stock_adjustment_account'),'')=''
    OR COALESCE(json_extract(p.payload_json,'$.stock_received_but_not_billed_account'),'')=''
  )
UNION ALL
SELECT p.tenant_id,'CRITICAL','VN_POLICY_CURRENCY_MISMATCH',json_extract(p.payload_json,'$.company'),
       'VN Accounting Policy',p.name,p.version,
       'Policy accounting currency differs from Company.default_currency'
FROM documents p
JOIN master_records c ON c.tenant_id=p.tenant_id AND c.record_type='Company'
  AND c.name=json_extract(p.payload_json,'$.company') AND c.disabled=0
WHERE p.doctype='VN Accounting Policy' AND p.docstatus=1
  AND COALESCE(json_extract(p.payload_json,'$.accounting_currency'),'')<>COALESCE(json_extract(c.data_json,'$.default_currency'),'')
UNION ALL
SELECT d.tenant_id,'CRITICAL','PURCHASE_RECEIPT_WITHOUT_GL',json_extract(d.payload_json,'$.company'),d.doctype,d.name,
       COALESCE(MAX(s.voucher_revision),d.version),'Submitted Purchase Receipt changed stock value without GL under active VN policy'
FROM documents d
JOIN stock_ledger_entries s ON s.tenant_id=d.tenant_id AND s.voucher_type=d.doctype AND s.voucher_no=d.name
LEFT JOIN gl_entries g ON g.tenant_id=s.tenant_id AND g.voucher_type=s.voucher_type AND g.voucher_no=s.voucher_no AND g.voucher_revision=s.voucher_revision
WHERE d.doctype='Purchase Receipt' AND d.docstatus=1 AND s.stock_value_difference_minor<>0
  AND EXISTS(SELECT 1 FROM documents p WHERE p.tenant_id=d.tenant_id AND p.doctype='VN Accounting Policy' AND p.docstatus=1
    AND json_extract(p.payload_json,'$.company')=json_extract(d.payload_json,'$.company')
    AND date(s.posting_at)>=date(json_extract(p.payload_json,'$.effective_from'))
    AND date(s.posting_at)<=date(COALESCE(NULLIF(json_extract(p.payload_json,'$.effective_to'),''),'9999-12-31')))
GROUP BY d.tenant_id,d.doc_key
HAVING COUNT(g.line_key)=0
UNION ALL
SELECT d.tenant_id,'CRITICAL','STOCK_ENTRY_WITHOUT_GL',json_extract(d.payload_json,'$.company'),d.doctype,d.name,
       COALESCE(MAX(s.voucher_revision),d.version),'Material Receipt/Issue changed stock value without GL under active VN policy'
FROM documents d
JOIN stock_ledger_entries s ON s.tenant_id=d.tenant_id AND s.voucher_type=d.doctype AND s.voucher_no=d.name
LEFT JOIN gl_entries g ON g.tenant_id=s.tenant_id AND g.voucher_type=s.voucher_type AND g.voucher_no=s.voucher_no AND g.voucher_revision=s.voucher_revision
WHERE d.doctype='Stock Entry' AND d.docstatus=1 AND json_extract(d.payload_json,'$.purpose') IN ('Material Receipt','Material Issue')
  AND s.stock_value_difference_minor<>0
  AND EXISTS(SELECT 1 FROM documents p WHERE p.tenant_id=d.tenant_id AND p.doctype='VN Accounting Policy' AND p.docstatus=1
    AND json_extract(p.payload_json,'$.company')=json_extract(d.payload_json,'$.company')
    AND date(s.posting_at)>=date(json_extract(p.payload_json,'$.effective_from'))
    AND date(s.posting_at)<=date(COALESCE(NULLIF(json_extract(p.payload_json,'$.effective_to'),''),'9999-12-31')))
GROUP BY d.tenant_id,d.doc_key
HAVING COUNT(g.line_key)=0
UNION ALL
SELECT d.tenant_id,'CRITICAL','DELIVERY_NOTE_WITHOUT_GL',json_extract(d.payload_json,'$.company'),d.doctype,d.name,
       COALESCE(MAX(s.voucher_revision),d.version),'Delivery Note changed stock value without COGS/GL under active VN policy'
FROM documents d
JOIN stock_ledger_entries s ON s.tenant_id=d.tenant_id AND s.voucher_type=d.doctype AND s.voucher_no=d.name
LEFT JOIN gl_entries g ON g.tenant_id=s.tenant_id AND g.voucher_type=s.voucher_type AND g.voucher_no=s.voucher_no AND g.voucher_revision=s.voucher_revision
WHERE d.doctype='Delivery Note' AND d.docstatus=1 AND s.stock_value_difference_minor<>0
  AND EXISTS(SELECT 1 FROM documents p WHERE p.tenant_id=d.tenant_id AND p.doctype='VN Accounting Policy' AND p.docstatus=1
    AND json_extract(p.payload_json,'$.company')=json_extract(d.payload_json,'$.company')
    AND date(s.posting_at)>=date(json_extract(p.payload_json,'$.effective_from'))
    AND date(s.posting_at)<=date(COALESCE(NULLIF(json_extract(p.payload_json,'$.effective_to'),''),'9999-12-31')))
GROUP BY d.tenant_id,d.doc_key
HAVING COUNT(g.line_key)=0
UNION ALL
SELECT d.tenant_id,'CRITICAL','STOCK_CURRENCY_MISMATCH',json_extract(d.payload_json,'$.company'),s.voucher_type,s.voucher_no,s.voucher_revision,
       'Stock valuation ledger currency/scale differs from Company.default_currency'
FROM stock_ledger_entries s
JOIN documents d ON d.tenant_id=s.tenant_id AND d.doctype=s.voucher_type AND d.name=s.voucher_no
JOIN master_records c ON c.tenant_id=d.tenant_id AND c.record_type='Company' AND c.name=json_extract(d.payload_json,'$.company') AND c.disabled=0
JOIN master_records cur ON cur.tenant_id=d.tenant_id AND cur.record_type='Currency' AND cur.name=json_extract(c.data_json,'$.default_currency') AND cur.disabled=0
WHERE EXISTS(SELECT 1 FROM documents p WHERE p.tenant_id=d.tenant_id AND p.doctype='VN Accounting Policy' AND p.docstatus=1
    AND json_extract(p.payload_json,'$.company')=json_extract(d.payload_json,'$.company')
    AND date(s.posting_at)>=date(json_extract(p.payload_json,'$.effective_from'))
    AND date(s.posting_at)<=date(COALESCE(NULLIF(json_extract(p.payload_json,'$.effective_to'),''),'9999-12-31')))
  AND (s.currency<>json_extract(c.data_json,'$.default_currency')
       OR s.currency_scale<>CAST(json_extract(cur.data_json,'$.currency_scale') AS INTEGER));
