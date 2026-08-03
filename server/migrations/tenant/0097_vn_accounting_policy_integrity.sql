-- WS01 authoritative VN Accounting Policy integrity.
-- Approved policy is immutable except controlled retirement: an open-ended submitted
-- version may receive an effective_to once, and workflow_state may subsequently move
-- to Hết hiệu lực. New policy versions are separate documents.

DROP TRIGGER IF EXISTS vn_accounting_policy_insert_guard;
DROP TRIGGER IF EXISTS vn_accounting_policy_submit_guard;
DROP TRIGGER IF EXISTS vn_accounting_policy_submitted_update_guard;
DROP TRIGGER IF EXISTS vn_accounting_policy_submitted_delete_guard;

CREATE TRIGGER vn_accounting_policy_insert_guard
BEFORE INSERT ON documents
WHEN NEW.doctype='VN Accounting Policy' AND NEW.docstatus=1
BEGIN
  SELECT CASE
    WHEN date(json_extract(NEW.payload_json,'$.effective_from')) IS NULL
      OR (
        COALESCE(json_extract(NEW.payload_json,'$.effective_to'),'')<>''
        AND date(json_extract(NEW.payload_json,'$.effective_to'))<date(json_extract(NEW.payload_json,'$.effective_from'))
      )
      THEN RAISE(ABORT,'VN_ACCOUNTING_POLICY_INVALID_RANGE')
    WHEN COALESCE(trim(json_extract(NEW.payload_json,'$.policy_version')),'')=''
      OR COALESCE(trim(json_extract(NEW.payload_json,'$.source_url')),'')=''
      OR length(trim(COALESCE(json_extract(NEW.payload_json,'$.source_file_hash'),'')))<>64
      OR trim(COALESCE(json_extract(NEW.payload_json,'$.source_file_hash'),'')) GLOB '*[^0-9A-Fa-f]*'
      THEN RAISE(ABORT,'VN_ACCOUNTING_POLICY_EVIDENCE_REQUIRED')
    WHEN NOT EXISTS(
      SELECT 1 FROM master_records c
      WHERE c.tenant_id=NEW.tenant_id AND c.record_type='Company'
        AND c.name=json_extract(NEW.payload_json,'$.company') AND c.disabled=0
        AND json_extract(c.data_json,'$.default_currency')=json_extract(NEW.payload_json,'$.accounting_currency')
    ) THEN RAISE(ABORT,'VN_ACCOUNTING_POLICY_COMPANY_CURRENCY_MISMATCH')
    WHEN NOT EXISTS(
      SELECT 1 FROM master_records cur
      WHERE cur.tenant_id=NEW.tenant_id AND cur.record_type='Currency'
        AND cur.name=json_extract(NEW.payload_json,'$.accounting_currency') AND cur.disabled=0
    ) OR NOT EXISTS(
      SELECT 1 FROM master_records cur
      WHERE cur.tenant_id=NEW.tenant_id AND cur.record_type='Currency'
        AND cur.name=json_extract(NEW.payload_json,'$.legal_report_currency') AND cur.disabled=0
    ) THEN RAISE(ABORT,'VN_ACCOUNTING_POLICY_CURRENCY_REQUIRED')
    WHEN NOT EXISTS(
      SELECT 1 FROM documents r
      WHERE r.tenant_id=NEW.tenant_id AND r.doctype='VN Legal Rule'
        AND r.name=json_extract(NEW.payload_json,'$.legal_rule') AND r.docstatus=1
        AND json_extract(r.payload_json,'$.rule_type')='Accounting'
        AND json_extract(r.payload_json,'$.regime_code')=json_extract(NEW.payload_json,'$.regime_code')
        AND json_extract(r.payload_json,'$.document_no')=json_extract(NEW.payload_json,'$.legal_document_no')
        AND date(json_extract(r.payload_json,'$.effective_from'))<=date(json_extract(NEW.payload_json,'$.effective_from'))
        AND date(COALESCE(NULLIF(json_extract(r.payload_json,'$.effective_to'),''),'9999-12-31'))
          >= date(COALESCE(NULLIF(json_extract(NEW.payload_json,'$.effective_to'),''),'9999-12-31'))
    ) THEN RAISE(ABORT,'VN_ACCOUNTING_POLICY_LEGAL_RULE_REQUIRED')
    WHEN (
      SELECT COUNT(DISTINCT value)
      FROM json_each(json_array(
        json_extract(NEW.payload_json,'$.inventory_account'),
        json_extract(NEW.payload_json,'$.cogs_account'),
        json_extract(NEW.payload_json,'$.stock_adjustment_account'),
        json_extract(NEW.payload_json,'$.stock_received_not_billed_account'),
        json_extract(NEW.payload_json,'$.retained_earnings_account')
      ))
      WHERE COALESCE(trim(CAST(value AS TEXT)),'')<>''
    )<>5 THEN RAISE(ABORT,'VN_ACCOUNTING_POLICY_ACCOUNTS_REQUIRED')
    WHEN EXISTS(
      SELECT 1
      FROM json_each(json_array(
        json_extract(NEW.payload_json,'$.inventory_account'),
        json_extract(NEW.payload_json,'$.cogs_account'),
        json_extract(NEW.payload_json,'$.stock_adjustment_account'),
        json_extract(NEW.payload_json,'$.stock_received_not_billed_account'),
        json_extract(NEW.payload_json,'$.retained_earnings_account')
      )) a
      WHERE NOT EXISTS(
        SELECT 1 FROM master_records m
        WHERE m.tenant_id=NEW.tenant_id AND m.record_type='Account' AND m.name=CAST(a.value AS TEXT) AND m.disabled=0
          AND json_extract(m.data_json,'$.company')=json_extract(NEW.payload_json,'$.company')
          AND COALESCE(CAST(json_extract(m.data_json,'$.is_group') AS INTEGER),0)=0
      )
    ) THEN RAISE(ABORT,'VN_ACCOUNTING_POLICY_ACCOUNT_COMPANY_MISMATCH')
    WHEN EXISTS(
      SELECT 1 FROM documents p
      WHERE p.tenant_id=NEW.tenant_id AND p.doctype='VN Accounting Policy' AND p.docstatus=1
        AND json_extract(p.payload_json,'$.company')=json_extract(NEW.payload_json,'$.company')
        AND json_extract(p.payload_json,'$.policy_version')=json_extract(NEW.payload_json,'$.policy_version')
    ) THEN RAISE(ABORT,'VN_ACCOUNTING_POLICY_VERSION_DUPLICATE')
    WHEN EXISTS(
      SELECT 1 FROM documents p
      WHERE p.tenant_id=NEW.tenant_id AND p.doctype='VN Accounting Policy' AND p.docstatus=1
        AND json_extract(p.payload_json,'$.company')=json_extract(NEW.payload_json,'$.company')
        AND date(json_extract(p.payload_json,'$.effective_from'))
          <= date(COALESCE(NULLIF(json_extract(NEW.payload_json,'$.effective_to'),''),'9999-12-31'))
        AND date(COALESCE(NULLIF(json_extract(p.payload_json,'$.effective_to'),''),'9999-12-31'))
          >= date(json_extract(NEW.payload_json,'$.effective_from'))
    ) THEN RAISE(ABORT,'VN_ACCOUNTING_POLICY_OVERLAP')
  END;
END;

CREATE TRIGGER vn_accounting_policy_submit_guard
BEFORE UPDATE ON documents
WHEN NEW.doctype='VN Accounting Policy' AND OLD.docstatus<>1 AND NEW.docstatus=1
BEGIN
  SELECT CASE
    WHEN date(json_extract(NEW.payload_json,'$.effective_from')) IS NULL
      OR (
        COALESCE(json_extract(NEW.payload_json,'$.effective_to'),'')<>''
        AND date(json_extract(NEW.payload_json,'$.effective_to'))<date(json_extract(NEW.payload_json,'$.effective_from'))
      )
      THEN RAISE(ABORT,'VN_ACCOUNTING_POLICY_INVALID_RANGE')
    WHEN COALESCE(trim(json_extract(NEW.payload_json,'$.policy_version')),'')=''
      OR COALESCE(trim(json_extract(NEW.payload_json,'$.source_url')),'')=''
      OR length(trim(COALESCE(json_extract(NEW.payload_json,'$.source_file_hash'),'')))<>64
      OR trim(COALESCE(json_extract(NEW.payload_json,'$.source_file_hash'),'')) GLOB '*[^0-9A-Fa-f]*'
      THEN RAISE(ABORT,'VN_ACCOUNTING_POLICY_EVIDENCE_REQUIRED')
    WHEN NOT EXISTS(
      SELECT 1 FROM master_records c
      WHERE c.tenant_id=NEW.tenant_id AND c.record_type='Company'
        AND c.name=json_extract(NEW.payload_json,'$.company') AND c.disabled=0
        AND json_extract(c.data_json,'$.default_currency')=json_extract(NEW.payload_json,'$.accounting_currency')
    ) THEN RAISE(ABORT,'VN_ACCOUNTING_POLICY_COMPANY_CURRENCY_MISMATCH')
    WHEN NOT EXISTS(
      SELECT 1 FROM master_records cur
      WHERE cur.tenant_id=NEW.tenant_id AND cur.record_type='Currency'
        AND cur.name=json_extract(NEW.payload_json,'$.accounting_currency') AND cur.disabled=0
    ) OR NOT EXISTS(
      SELECT 1 FROM master_records cur
      WHERE cur.tenant_id=NEW.tenant_id AND cur.record_type='Currency'
        AND cur.name=json_extract(NEW.payload_json,'$.legal_report_currency') AND cur.disabled=0
    ) THEN RAISE(ABORT,'VN_ACCOUNTING_POLICY_CURRENCY_REQUIRED')
    WHEN NOT EXISTS(
      SELECT 1 FROM documents r
      WHERE r.tenant_id=NEW.tenant_id AND r.doctype='VN Legal Rule'
        AND r.name=json_extract(NEW.payload_json,'$.legal_rule') AND r.docstatus=1
        AND json_extract(r.payload_json,'$.rule_type')='Accounting'
        AND json_extract(r.payload_json,'$.regime_code')=json_extract(NEW.payload_json,'$.regime_code')
        AND json_extract(r.payload_json,'$.document_no')=json_extract(NEW.payload_json,'$.legal_document_no')
        AND date(json_extract(r.payload_json,'$.effective_from'))<=date(json_extract(NEW.payload_json,'$.effective_from'))
        AND date(COALESCE(NULLIF(json_extract(r.payload_json,'$.effective_to'),''),'9999-12-31'))
          >= date(COALESCE(NULLIF(json_extract(NEW.payload_json,'$.effective_to'),''),'9999-12-31'))
    ) THEN RAISE(ABORT,'VN_ACCOUNTING_POLICY_LEGAL_RULE_REQUIRED')
    WHEN (
      SELECT COUNT(DISTINCT value)
      FROM json_each(json_array(
        json_extract(NEW.payload_json,'$.inventory_account'),
        json_extract(NEW.payload_json,'$.cogs_account'),
        json_extract(NEW.payload_json,'$.stock_adjustment_account'),
        json_extract(NEW.payload_json,'$.stock_received_not_billed_account'),
        json_extract(NEW.payload_json,'$.retained_earnings_account')
      ))
      WHERE COALESCE(trim(CAST(value AS TEXT)),'')<>''
    )<>5 THEN RAISE(ABORT,'VN_ACCOUNTING_POLICY_ACCOUNTS_REQUIRED')
    WHEN EXISTS(
      SELECT 1
      FROM json_each(json_array(
        json_extract(NEW.payload_json,'$.inventory_account'),
        json_extract(NEW.payload_json,'$.cogs_account'),
        json_extract(NEW.payload_json,'$.stock_adjustment_account'),
        json_extract(NEW.payload_json,'$.stock_received_not_billed_account'),
        json_extract(NEW.payload_json,'$.retained_earnings_account')
      )) a
      WHERE NOT EXISTS(
        SELECT 1 FROM master_records m
        WHERE m.tenant_id=NEW.tenant_id AND m.record_type='Account' AND m.name=CAST(a.value AS TEXT) AND m.disabled=0
          AND json_extract(m.data_json,'$.company')=json_extract(NEW.payload_json,'$.company')
          AND COALESCE(CAST(json_extract(m.data_json,'$.is_group') AS INTEGER),0)=0
      )
    ) THEN RAISE(ABORT,'VN_ACCOUNTING_POLICY_ACCOUNT_COMPANY_MISMATCH')
    WHEN EXISTS(
      SELECT 1 FROM documents p
      WHERE p.tenant_id=NEW.tenant_id AND p.doctype='VN Accounting Policy' AND p.docstatus=1 AND p.doc_key<>OLD.doc_key
        AND json_extract(p.payload_json,'$.company')=json_extract(NEW.payload_json,'$.company')
        AND json_extract(p.payload_json,'$.policy_version')=json_extract(NEW.payload_json,'$.policy_version')
    ) THEN RAISE(ABORT,'VN_ACCOUNTING_POLICY_VERSION_DUPLICATE')
    WHEN EXISTS(
      SELECT 1 FROM documents p
      WHERE p.tenant_id=NEW.tenant_id AND p.doctype='VN Accounting Policy' AND p.docstatus=1 AND p.doc_key<>OLD.doc_key
        AND json_extract(p.payload_json,'$.company')=json_extract(NEW.payload_json,'$.company')
        AND date(json_extract(p.payload_json,'$.effective_from'))
          <= date(COALESCE(NULLIF(json_extract(NEW.payload_json,'$.effective_to'),''),'9999-12-31'))
        AND date(COALESCE(NULLIF(json_extract(p.payload_json,'$.effective_to'),''),'9999-12-31'))
          >= date(json_extract(NEW.payload_json,'$.effective_from'))
    ) THEN RAISE(ABORT,'VN_ACCOUNTING_POLICY_OVERLAP')
  END;
END;

-- Approved policy has only two narrowly allowed mutations:
-- 1) set effective_to once on an open-ended version, keeping all other payload fields unchanged;
-- 2) after effective_to exists, move only workflow_state to Hết hiệu lực.
CREATE TRIGGER vn_accounting_policy_submitted_update_guard
BEFORE UPDATE ON documents
WHEN OLD.doctype='VN Accounting Policy' AND OLD.docstatus=1
BEGIN
  SELECT CASE
    WHEN NEW.docstatus<>1 THEN RAISE(ABORT,'VN_ACCOUNTING_POLICY_IMMUTABLE')
    WHEN COALESCE(json_extract(OLD.payload_json,'$.effective_to'),'')=''
      AND COALESCE(json_extract(NEW.payload_json,'$.effective_to'),'')<>''
      AND date(json_extract(NEW.payload_json,'$.effective_to'))>=date(json_extract(OLD.payload_json,'$.effective_from'))
      AND json(json_remove(NEW.payload_json,'$.effective_to'))=json(json_remove(OLD.payload_json,'$.effective_to'))
      THEN NULL
    WHEN COALESCE(json_extract(OLD.payload_json,'$.effective_to'),'')<>''
      AND json_extract(NEW.payload_json,'$.effective_to')=json_extract(OLD.payload_json,'$.effective_to')
      AND json_extract(NEW.payload_json,'$.workflow_state')='Hết hiệu lực'
      AND json(json_remove(NEW.payload_json,'$.workflow_state'))=json(json_remove(OLD.payload_json,'$.workflow_state'))
      THEN NULL
    ELSE RAISE(ABORT,'VN_ACCOUNTING_POLICY_IMMUTABLE')
  END;
END;

CREATE TRIGGER vn_accounting_policy_submitted_delete_guard
BEFORE DELETE ON documents
WHEN OLD.doctype='VN Accounting Policy' AND OLD.docstatus=1
BEGIN
  SELECT RAISE(ABORT,'VN_ACCOUNTING_POLICY_IMMUTABLE');
END;
