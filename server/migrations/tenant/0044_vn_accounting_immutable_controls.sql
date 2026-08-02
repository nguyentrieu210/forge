-- Close the last mutation paths for approved accounting/legal configuration and
-- enforce stock-to-GL parity whenever VN Accounting Policy is active.

DROP TRIGGER IF EXISTS vn_legal_rule_effective_update_guard;
DROP TRIGGER IF EXISTS vn_legal_rule_immutable_update_guard;
CREATE TRIGGER vn_legal_rule_immutable_update_guard
BEFORE UPDATE ON documents
WHEN OLD.doctype='VN Legal Rule' AND OLD.docstatus=1
BEGIN
  SELECT RAISE(ABORT,'VN_LEGAL_RULE_IMMUTABLE');
END;
CREATE TRIGGER vn_legal_rule_effective_update_guard
BEFORE UPDATE ON documents
WHEN NEW.doctype='VN Legal Rule' AND OLD.docstatus<>1 AND NEW.docstatus<>2
BEGIN
  SELECT CASE
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

DROP TRIGGER IF EXISTS tt99_account_map_update_guard;
DROP TRIGGER IF EXISTS tt99_account_map_immutable_update_guard;
CREATE TRIGGER tt99_account_map_immutable_update_guard
BEFORE UPDATE ON documents
WHEN OLD.doctype='TT99 Account Map' AND OLD.docstatus=1
BEGIN
  SELECT RAISE(ABORT,'TT99_ACCOUNT_MAP_IMMUTABLE');
END;
CREATE TRIGGER tt99_account_map_update_guard
BEFORE UPDATE ON documents
WHEN NEW.doctype='TT99 Account Map' AND OLD.docstatus<>1 AND NEW.docstatus<>2
BEGIN
  SELECT CASE
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

DROP TRIGGER IF EXISTS vn_tax_ruleset_update_guard;
DROP TRIGGER IF EXISTS vn_tax_ruleset_immutable_update_guard;
CREATE TRIGGER vn_tax_ruleset_immutable_update_guard
BEFORE UPDATE ON documents
WHEN OLD.doctype='VN Tax Ruleset' AND OLD.docstatus=1
BEGIN
  SELECT RAISE(ABORT,'VN_TAX_RULESET_IMMUTABLE');
END;
CREATE TRIGGER vn_tax_ruleset_update_guard
BEFORE UPDATE ON documents
WHEN NEW.doctype='VN Tax Ruleset' AND OLD.docstatus<>1 AND NEW.docstatus<>2
BEGIN
  SELECT CASE
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

DROP TRIGGER IF EXISTS purchase_receipt_requires_balanced_gl;
CREATE TRIGGER purchase_receipt_requires_balanced_gl
BEFORE INSERT ON stock_ledger_entries
WHEN NEW.voucher_type='Purchase Receipt'
  AND NEW.stock_value_difference_minor<>0
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

DROP TRIGGER IF EXISTS vn_stock_entry_requires_gl;
CREATE TRIGGER vn_stock_entry_requires_gl
BEFORE INSERT ON stock_ledger_entries
WHEN NEW.voucher_type='Stock Entry'
  AND NEW.stock_value_difference_minor<>0
  AND EXISTS(
    SELECT 1 FROM documents d
    WHERE d.tenant_id=NEW.tenant_id AND d.doctype='Stock Entry' AND d.name=NEW.voucher_no
      AND json_extract(d.payload_json,'$.purpose') IN ('Material Receipt','Material Issue')
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
  SELECT RAISE(ABORT,'STOCK_ENTRY_GL_REQUIRED');
END;

DROP TRIGGER IF EXISTS vn_stock_entry_requires_balanced_gl;
CREATE TRIGGER vn_stock_entry_requires_balanced_gl
BEFORE INSERT ON stock_ledger_entries
WHEN NEW.voucher_type='Stock Entry'
  AND NEW.stock_value_difference_minor<>0
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
  SELECT RAISE(ABORT,'STOCK_ENTRY_GL_UNBALANCED');
END;
