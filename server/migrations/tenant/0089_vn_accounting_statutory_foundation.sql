-- WS01 statutory foundation: effective/versioned VN legal rules and TT99 account mappings.
-- Reserved after WS06's known 0043-0047 migration range to avoid cross-workstream collision.
-- Shared ledger/query scoping from legacy accounting branches is audited separately.

DROP TRIGGER IF EXISTS vn_legal_rule_insert_guard;
DROP TRIGGER IF EXISTS vn_legal_rule_update_guard;
DROP TRIGGER IF EXISTS vn_legal_rule_immutable_update_guard;
DROP TRIGGER IF EXISTS vn_legal_rule_immutable_delete_guard;
DROP TRIGGER IF EXISTS tt99_account_map_insert_guard;
DROP TRIGGER IF EXISTS tt99_account_map_update_guard;
DROP TRIGGER IF EXISTS tt99_account_map_immutable_update_guard;
DROP TRIGGER IF EXISTS tt99_account_map_immutable_delete_guard;

CREATE TRIGGER vn_legal_rule_insert_guard
BEFORE INSERT ON documents
WHEN NEW.doctype='VN Legal Rule' AND NEW.docstatus<>2
BEGIN
  SELECT CASE
    WHEN date(json_extract(NEW.payload_json,'$.effective_from')) IS NULL
      OR (
        COALESCE(json_extract(NEW.payload_json,'$.effective_to'),'')<>''
        AND date(json_extract(NEW.payload_json,'$.effective_to')) < date(json_extract(NEW.payload_json,'$.effective_from'))
      )
    THEN RAISE(ABORT,'VN_LEGAL_RULE_INVALID_RANGE')
    WHEN NEW.docstatus=1 AND (
      COALESCE(trim(json_extract(NEW.payload_json,'$.source_url')),'')=''
      OR COALESCE(trim(json_extract(NEW.payload_json,'$.source_file_hash')),'')=''
      OR COALESCE(trim(json_extract(NEW.payload_json,'$.rule_json')),'')=''
    )
    THEN RAISE(ABORT,'VN_LEGAL_RULE_EVIDENCE_REQUIRED')
    WHEN NEW.docstatus=1 AND EXISTS(
      SELECT 1 FROM documents r
      WHERE r.tenant_id=NEW.tenant_id
        AND r.doctype='VN Legal Rule'
        AND r.docstatus=1
        AND json_extract(r.payload_json,'$.rule_type')=json_extract(NEW.payload_json,'$.rule_type')
        AND json_extract(r.payload_json,'$.regime_code')=json_extract(NEW.payload_json,'$.regime_code')
        AND json_extract(r.payload_json,'$.taxpayer_segment')=json_extract(NEW.payload_json,'$.taxpayer_segment')
        AND date(json_extract(r.payload_json,'$.effective_from'))
          <= date(COALESCE(NULLIF(json_extract(NEW.payload_json,'$.effective_to'),''),'9999-12-31'))
        AND date(COALESCE(NULLIF(json_extract(r.payload_json,'$.effective_to'),''),'9999-12-31'))
          >= date(json_extract(NEW.payload_json,'$.effective_from'))
    )
    THEN RAISE(ABORT,'VN_LEGAL_RULE_OVERLAP')
  END;
END;

CREATE TRIGGER vn_legal_rule_update_guard
BEFORE UPDATE ON documents
WHEN NEW.doctype='VN Legal Rule' AND OLD.docstatus<>1 AND NEW.docstatus<>2
BEGIN
  SELECT CASE
    WHEN date(json_extract(NEW.payload_json,'$.effective_from')) IS NULL
      OR (
        COALESCE(json_extract(NEW.payload_json,'$.effective_to'),'')<>''
        AND date(json_extract(NEW.payload_json,'$.effective_to')) < date(json_extract(NEW.payload_json,'$.effective_from'))
      )
    THEN RAISE(ABORT,'VN_LEGAL_RULE_INVALID_RANGE')
    WHEN NEW.docstatus=1 AND (
      COALESCE(trim(json_extract(NEW.payload_json,'$.source_url')),'')=''
      OR COALESCE(trim(json_extract(NEW.payload_json,'$.source_file_hash')),'')=''
      OR COALESCE(trim(json_extract(NEW.payload_json,'$.rule_json')),'')=''
    )
    THEN RAISE(ABORT,'VN_LEGAL_RULE_EVIDENCE_REQUIRED')
    WHEN NEW.docstatus=1 AND EXISTS(
      SELECT 1 FROM documents r
      WHERE r.tenant_id=NEW.tenant_id
        AND r.doctype='VN Legal Rule'
        AND r.docstatus=1
        AND r.doc_key<>OLD.doc_key
        AND json_extract(r.payload_json,'$.rule_type')=json_extract(NEW.payload_json,'$.rule_type')
        AND json_extract(r.payload_json,'$.regime_code')=json_extract(NEW.payload_json,'$.regime_code')
        AND json_extract(r.payload_json,'$.taxpayer_segment')=json_extract(NEW.payload_json,'$.taxpayer_segment')
        AND date(json_extract(r.payload_json,'$.effective_from'))
          <= date(COALESCE(NULLIF(json_extract(NEW.payload_json,'$.effective_to'),''),'9999-12-31'))
        AND date(COALESCE(NULLIF(json_extract(r.payload_json,'$.effective_to'),''),'9999-12-31'))
          >= date(json_extract(NEW.payload_json,'$.effective_from'))
    )
    THEN RAISE(ABORT,'VN_LEGAL_RULE_OVERLAP')
  END;
END;

CREATE TRIGGER vn_legal_rule_immutable_update_guard
BEFORE UPDATE ON documents
WHEN OLD.doctype='VN Legal Rule' AND OLD.docstatus=1
BEGIN
  SELECT RAISE(ABORT,'VN_LEGAL_RULE_IMMUTABLE');
END;

CREATE TRIGGER vn_legal_rule_immutable_delete_guard
BEFORE DELETE ON documents
WHEN OLD.doctype='VN Legal Rule' AND OLD.docstatus=1
BEGIN
  SELECT RAISE(ABORT,'VN_LEGAL_RULE_IMMUTABLE');
END;

CREATE TRIGGER tt99_account_map_insert_guard
BEFORE INSERT ON documents
WHEN NEW.doctype='TT99 Account Map' AND NEW.docstatus<>2
BEGIN
  SELECT CASE
    WHEN date(json_extract(NEW.payload_json,'$.effective_from')) IS NULL
      OR (
        COALESCE(json_extract(NEW.payload_json,'$.effective_to'),'')<>''
        AND date(json_extract(NEW.payload_json,'$.effective_to')) < date(json_extract(NEW.payload_json,'$.effective_from'))
      )
    THEN RAISE(ABORT,'TT99_ACCOUNT_MAP_INVALID_RANGE')
    WHEN COALESCE(json_extract(NEW.payload_json,'$.target_regime'),'')<>'TT99'
    THEN RAISE(ABORT,'TT99_ACCOUNT_MAP_TARGET_REQUIRED')
    WHEN NEW.docstatus=1 AND NOT EXISTS(
      SELECT 1 FROM documents r
      WHERE r.tenant_id=NEW.tenant_id
        AND r.doctype='VN Legal Rule'
        AND r.name=json_extract(NEW.payload_json,'$.legal_rule')
        AND r.docstatus=1
        AND json_extract(r.payload_json,'$.rule_type')='Accounting'
        AND json_extract(r.payload_json,'$.regime_code')='TT99'
        AND date(json_extract(r.payload_json,'$.effective_from')) <= date(json_extract(NEW.payload_json,'$.effective_from'))
        AND date(COALESCE(NULLIF(json_extract(r.payload_json,'$.effective_to'),''),'9999-12-31'))
          >= date(COALESCE(NULLIF(json_extract(NEW.payload_json,'$.effective_to'),''),'9999-12-31'))
    )
    THEN RAISE(ABORT,'TT99_ACCOUNT_MAP_LEGAL_RULE_REQUIRED')
    WHEN NEW.docstatus=1 AND EXISTS(
      SELECT 1 FROM documents m
      WHERE m.tenant_id=NEW.tenant_id
        AND m.doctype='TT99 Account Map'
        AND m.docstatus=1
        AND json_extract(m.payload_json,'$.company')=json_extract(NEW.payload_json,'$.company')
        AND json_extract(m.payload_json,'$.source_account')=json_extract(NEW.payload_json,'$.source_account')
        AND date(json_extract(m.payload_json,'$.effective_from'))
          <= date(COALESCE(NULLIF(json_extract(NEW.payload_json,'$.effective_to'),''),'9999-12-31'))
        AND date(COALESCE(NULLIF(json_extract(m.payload_json,'$.effective_to'),''),'9999-12-31'))
          >= date(json_extract(NEW.payload_json,'$.effective_from'))
    )
    THEN RAISE(ABORT,'TT99_ACCOUNT_MAP_OVERLAP')
  END;
END;

CREATE TRIGGER tt99_account_map_update_guard
BEFORE UPDATE ON documents
WHEN NEW.doctype='TT99 Account Map' AND OLD.docstatus<>1 AND NEW.docstatus<>2
BEGIN
  SELECT CASE
    WHEN date(json_extract(NEW.payload_json,'$.effective_from')) IS NULL
      OR (
        COALESCE(json_extract(NEW.payload_json,'$.effective_to'),'')<>''
        AND date(json_extract(NEW.payload_json,'$.effective_to')) < date(json_extract(NEW.payload_json,'$.effective_from'))
      )
    THEN RAISE(ABORT,'TT99_ACCOUNT_MAP_INVALID_RANGE')
    WHEN COALESCE(json_extract(NEW.payload_json,'$.target_regime'),'')<>'TT99'
    THEN RAISE(ABORT,'TT99_ACCOUNT_MAP_TARGET_REQUIRED')
    WHEN NEW.docstatus=1 AND NOT EXISTS(
      SELECT 1 FROM documents r
      WHERE r.tenant_id=NEW.tenant_id
        AND r.doctype='VN Legal Rule'
        AND r.name=json_extract(NEW.payload_json,'$.legal_rule')
        AND r.docstatus=1
        AND json_extract(r.payload_json,'$.rule_type')='Accounting'
        AND json_extract(r.payload_json,'$.regime_code')='TT99'
        AND date(json_extract(r.payload_json,'$.effective_from')) <= date(json_extract(NEW.payload_json,'$.effective_from'))
        AND date(COALESCE(NULLIF(json_extract(r.payload_json,'$.effective_to'),''),'9999-12-31'))
          >= date(COALESCE(NULLIF(json_extract(NEW.payload_json,'$.effective_to'),''),'9999-12-31'))
    )
    THEN RAISE(ABORT,'TT99_ACCOUNT_MAP_LEGAL_RULE_REQUIRED')
    WHEN NEW.docstatus=1 AND EXISTS(
      SELECT 1 FROM documents m
      WHERE m.tenant_id=NEW.tenant_id
        AND m.doctype='TT99 Account Map'
        AND m.docstatus=1
        AND m.doc_key<>OLD.doc_key
        AND json_extract(m.payload_json,'$.company')=json_extract(NEW.payload_json,'$.company')
        AND json_extract(m.payload_json,'$.source_account')=json_extract(NEW.payload_json,'$.source_account')
        AND date(json_extract(m.payload_json,'$.effective_from'))
          <= date(COALESCE(NULLIF(json_extract(NEW.payload_json,'$.effective_to'),''),'9999-12-31'))
        AND date(COALESCE(NULLIF(json_extract(m.payload_json,'$.effective_to'),''),'9999-12-31'))
          >= date(json_extract(NEW.payload_json,'$.effective_from'))
    )
    THEN RAISE(ABORT,'TT99_ACCOUNT_MAP_OVERLAP')
  END;
END;

CREATE TRIGGER tt99_account_map_immutable_update_guard
BEFORE UPDATE ON documents
WHEN OLD.doctype='TT99 Account Map' AND OLD.docstatus=1
BEGIN
  SELECT RAISE(ABORT,'TT99_ACCOUNT_MAP_IMMUTABLE');
END;

CREATE TRIGGER tt99_account_map_immutable_delete_guard
BEFORE DELETE ON documents
WHEN OLD.doctype='TT99 Account Map' AND OLD.docstatus=1
BEGIN
  SELECT RAISE(ABORT,'TT99_ACCOUNT_MAP_IMMUTABLE');
END;
