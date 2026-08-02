-- VN Accounting completion: foreign-currency Journal Entry metadata, compatibility
-- boundaries for stock/GL guards, and immutable resolved reconciliation evidence.

-- Strict Purchase Receipt stock->GL parity applies when VN Accounting Policy is
-- active for that legal entity/date. Tenants that do not use VN Accounting keep
-- the shared ERP kernel's legacy behavior.
DROP TRIGGER IF EXISTS purchase_receipt_requires_gl;
CREATE TRIGGER purchase_receipt_requires_gl
BEFORE INSERT ON stock_ledger_entries
WHEN NEW.voucher_type='Purchase Receipt'
  AND NEW.stock_value_difference_minor<>0
  AND EXISTS(
    SELECT 1 FROM documents d
    WHERE d.tenant_id=NEW.tenant_id AND d.doctype='Purchase Receipt' AND d.name=NEW.voucher_no
      AND EXISTS(
        SELECT 1 FROM documents p
        WHERE p.tenant_id=d.tenant_id AND p.doctype='VN Accounting Policy' AND p.docstatus=1
          AND json_extract(p.payload_json,'$.company')=json_extract(d.payload_json,'$.company')
          AND date(COALESCE(json_extract(d.payload_json,'$.posting_at'),NEW.posting_at))
            >= date(json_extract(p.payload_json,'$.effective_from'))
          AND date(COALESCE(json_extract(d.payload_json,'$.posting_at'),NEW.posting_at))
            <= date(COALESCE(NULLIF(json_extract(p.payload_json,'$.effective_to'),''),'9999-12-31'))
      )
  )
  AND NOT EXISTS(
    SELECT 1 FROM gl_entries g
    WHERE g.tenant_id=NEW.tenant_id AND g.voucher_type=NEW.voucher_type
      AND g.voucher_no=NEW.voucher_no AND g.voucher_revision=NEW.voucher_revision
  )
BEGIN
  SELECT RAISE(ABORT,'PURCHASE_RECEIPT_GL_REQUIRED');
END;

DROP TRIGGER IF EXISTS purchase_receipt_requires_balanced_gl;
CREATE TRIGGER purchase_receipt_requires_balanced_gl
BEFORE INSERT ON stock_ledger_entries
WHEN NEW.voucher_type='Purchase Receipt'
  AND NEW.stock_value_difference_minor<>0
  AND EXISTS(
    SELECT 1 FROM documents d
    WHERE d.tenant_id=NEW.tenant_id AND d.doctype='Purchase Receipt' AND d.name=NEW.voucher_no
      AND EXISTS(
        SELECT 1 FROM documents p
        WHERE p.tenant_id=d.tenant_id AND p.doctype='VN Accounting Policy' AND p.docstatus=1
          AND json_extract(p.payload_json,'$.company')=json_extract(d.payload_json,'$.company')
          AND date(COALESCE(json_extract(d.payload_json,'$.posting_at'),NEW.posting_at))
            >= date(json_extract(p.payload_json,'$.effective_from'))
          AND date(COALESCE(json_extract(d.payload_json,'$.posting_at'),NEW.posting_at))
            <= date(COALESCE(NULLIF(json_extract(p.payload_json,'$.effective_to'),''),'9999-12-31'))
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
  SELECT RAISE(ABORT,'PURCHASE_RECEIPT_GL_UNBALANCED');
END;

-- A resolved reconciliation case is evidence, not an editable task ticket.
DROP TRIGGER IF EXISTS vn_reconciliation_resolved_immutable_update_guard;
CREATE TRIGGER vn_reconciliation_resolved_immutable_update_guard
BEFORE UPDATE ON documents
WHEN OLD.doctype='VN Reconciliation Case' AND OLD.docstatus=1
BEGIN
  SELECT RAISE(ABORT,'VN_RECONCILIATION_RESOLVED_IMMUTABLE');
END;
DROP TRIGGER IF EXISTS vn_reconciliation_resolved_delete_guard;
CREATE TRIGGER vn_reconciliation_resolved_delete_guard
BEFORE DELETE ON documents
WHEN OLD.doctype='VN Reconciliation Case' AND OLD.docstatus=1
BEGIN
  SELECT RAISE(ABORT,'VN_RECONCILIATION_RESOLVED_IMMUTABLE');
END;

-- Account currency is optional. Blank means Company.default_currency, preserving
-- every existing account while enabling foreign-currency bank/AR/AP accounts.
UPDATE doctype_definitions
SET metadata_json=json_insert(
      json_set(metadata_json,'$.revision',COALESCE(CAST(json_extract(metadata_json,'$.revision') AS INTEGER),revision)+1),
      '$.fields[#]',json_object(
        'fieldname','account_currency','label','Account Currency','fieldtype','Link','options','Currency',
        'in_list_view',json('true'),'in_standard_filter',json('true')
      )
    ),
    revision=revision+1,
    modified_by='migration-0045',
    modified_at='2026-08-03T00:00:00.000Z'
WHERE doctype='Account'
  AND NOT EXISTS(
    SELECT 1 FROM json_each(metadata_json,'$.fields') f
    WHERE json_extract(f.value,'$.fieldname')='account_currency'
  );

-- Journal child rows preserve both original account-currency amounts and their
-- server-resolved base conversion. GL still posts base/company currency only.
UPDATE doctype_definitions
SET metadata_json=json_insert(
      json_insert(
        json_insert(
          json_insert(
            json_set(metadata_json,'$.revision',COALESCE(CAST(json_extract(metadata_json,'$.revision') AS INTEGER),revision)+1),
            '$.fields[#]',json_object(
              'fieldname','account_currency','label','Account Currency','fieldtype','Link','options','Currency','read_only',json('true'),'in_list_view',json('true')
            )
          ),
          '$.fields[#]',json_object(
            'fieldname','exchange_rate','label','Exchange Rate to Company Currency','fieldtype','Float','precision',6,'read_only',json('true')
          )
        ),
        '$.fields[#]',json_object(
          'fieldname','debit_in_account_currency','label','Debit in Account Currency','fieldtype','Currency','options','account_currency','default','0'
        )
      ),
      '$.fields[#]',json_object(
        'fieldname','credit_in_account_currency','label','Credit in Account Currency','fieldtype','Currency','options','account_currency','default','0'
      )
    ),
    revision=revision+1,
    modified_by='migration-0045',
    modified_at='2026-08-03T00:00:00.000Z'
WHERE doctype='Journal Entry Account'
  AND NOT EXISTS(
    SELECT 1 FROM json_each(metadata_json,'$.fields') f
    WHERE json_extract(f.value,'$.fieldname')='account_currency'
  );

-- The control tower should report configuration gaps before the next stock
-- transaction discovers them the expensive way.
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
SELECT p.tenant_id,'CRITICAL','VN_POLICY_STOCK_ACCOUNTS_MISSING',
       json_extract(p.payload_json,'$.company'),'VN Accounting Policy',p.name,p.version,
       'Approved policy must define inventory, stock-adjustment and received-not-billed accounts'
FROM documents p
WHERE p.doctype='VN Accounting Policy' AND p.docstatus=1
  AND (
    COALESCE(json_extract(p.payload_json,'$.inventory_account'),'')=''
    OR COALESCE(json_extract(p.payload_json,'$.stock_adjustment_account'),'')=''
    OR COALESCE(json_extract(p.payload_json,'$.stock_received_but_not_billed_account'),'')=''
  )
UNION ALL
SELECT d.tenant_id,'CRITICAL','PURCHASE_RECEIPT_WITHOUT_GL',
       json_extract(d.payload_json,'$.company'),d.doctype,d.name,
       COALESCE(MAX(s.voucher_revision),d.version),
       'Submitted Purchase Receipt changed stock value without GL under active VN policy'
FROM documents d
JOIN stock_ledger_entries s ON s.tenant_id=d.tenant_id AND s.voucher_type=d.doctype AND s.voucher_no=d.name
LEFT JOIN gl_entries g ON g.tenant_id=s.tenant_id AND g.voucher_type=s.voucher_type
  AND g.voucher_no=s.voucher_no AND g.voucher_revision=s.voucher_revision
WHERE d.doctype='Purchase Receipt' AND d.docstatus=1 AND s.stock_value_difference_minor<>0
  AND EXISTS(
    SELECT 1 FROM documents p
    WHERE p.tenant_id=d.tenant_id AND p.doctype='VN Accounting Policy' AND p.docstatus=1
      AND json_extract(p.payload_json,'$.company')=json_extract(d.payload_json,'$.company')
      AND date(COALESCE(json_extract(d.payload_json,'$.posting_at'),s.posting_at))>=date(json_extract(p.payload_json,'$.effective_from'))
      AND date(COALESCE(json_extract(d.payload_json,'$.posting_at'),s.posting_at))<=date(COALESCE(NULLIF(json_extract(p.payload_json,'$.effective_to'),''),'9999-12-31'))
  )
GROUP BY d.tenant_id,d.doc_key
HAVING COUNT(g.line_key)=0
UNION ALL
SELECT d.tenant_id,'CRITICAL','STOCK_ENTRY_WITHOUT_GL',
       json_extract(d.payload_json,'$.company'),d.doctype,d.name,
       COALESCE(MAX(s.voucher_revision),d.version),
       'Material Receipt/Issue changed stock value without GL under active VN policy'
FROM documents d
JOIN stock_ledger_entries s ON s.tenant_id=d.tenant_id AND s.voucher_type=d.doctype AND s.voucher_no=d.name
LEFT JOIN gl_entries g ON g.tenant_id=s.tenant_id AND g.voucher_type=s.voucher_type
  AND g.voucher_no=s.voucher_no AND g.voucher_revision=s.voucher_revision
WHERE d.doctype='Stock Entry' AND d.docstatus=1
  AND json_extract(d.payload_json,'$.purpose') IN ('Material Receipt','Material Issue')
  AND s.stock_value_difference_minor<>0
  AND EXISTS(
    SELECT 1 FROM documents p
    WHERE p.tenant_id=d.tenant_id AND p.doctype='VN Accounting Policy' AND p.docstatus=1
      AND json_extract(p.payload_json,'$.company')=json_extract(d.payload_json,'$.company')
      AND date(COALESCE(json_extract(d.payload_json,'$.posting_at'),s.posting_at))>=date(json_extract(p.payload_json,'$.effective_from'))
      AND date(COALESCE(json_extract(d.payload_json,'$.posting_at'),s.posting_at))<=date(COALESCE(NULLIF(json_extract(p.payload_json,'$.effective_to'),''),'9999-12-31'))
  )
GROUP BY d.tenant_id,d.doc_key
HAVING COUNT(g.line_key)=0;
