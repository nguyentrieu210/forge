-- WS01 TT99 mapping company/policy binding.
-- Historical source account may be disabled after transition, but it must still belong
-- to the same company. Target TT99 account must be active and posting-capable.

DROP TRIGGER IF EXISTS tt99_account_map_policy_insert_guard;
DROP TRIGGER IF EXISTS tt99_account_map_policy_update_guard;

CREATE TRIGGER tt99_account_map_policy_insert_guard
BEFORE INSERT ON documents
WHEN NEW.doctype='TT99 Account Map' AND NEW.docstatus=1
BEGIN
  SELECT CASE
    WHEN json_extract(NEW.payload_json,'$.source_account')=json_extract(NEW.payload_json,'$.target_account')
      THEN RAISE(ABORT,'TT99_ACCOUNT_MAP_SOURCE_TARGET_SAME')
    WHEN NOT EXISTS(
      SELECT 1 FROM master_records a
      WHERE a.tenant_id=NEW.tenant_id AND a.record_type='Account'
        AND a.name=json_extract(NEW.payload_json,'$.source_account')
        AND json_extract(a.data_json,'$.company')=json_extract(NEW.payload_json,'$.company')
        AND COALESCE(CAST(json_extract(a.data_json,'$.is_group') AS INTEGER),0)=0
    ) THEN RAISE(ABORT,'TT99_ACCOUNT_MAP_SOURCE_COMPANY_MISMATCH')
    WHEN NOT EXISTS(
      SELECT 1 FROM master_records a
      WHERE a.tenant_id=NEW.tenant_id AND a.record_type='Account'
        AND a.name=json_extract(NEW.payload_json,'$.target_account') AND a.disabled=0
        AND json_extract(a.data_json,'$.company')=json_extract(NEW.payload_json,'$.company')
        AND COALESCE(CAST(json_extract(a.data_json,'$.is_group') AS INTEGER),0)=0
    ) THEN RAISE(ABORT,'TT99_ACCOUNT_MAP_TARGET_COMPANY_MISMATCH')
    WHEN NOT EXISTS(
      SELECT 1 FROM documents p
      WHERE p.tenant_id=NEW.tenant_id AND p.doctype='VN Accounting Policy' AND p.docstatus=1
        AND json_extract(p.payload_json,'$.company')=json_extract(NEW.payload_json,'$.company')
        AND json_extract(p.payload_json,'$.regime_code')='TT99'
        AND json_extract(p.payload_json,'$.legal_rule')=json_extract(NEW.payload_json,'$.legal_rule')
        AND date(json_extract(p.payload_json,'$.effective_from'))<=date(json_extract(NEW.payload_json,'$.effective_from'))
        AND date(COALESCE(NULLIF(json_extract(p.payload_json,'$.effective_to'),''),'9999-12-31'))
          >= date(COALESCE(NULLIF(json_extract(NEW.payload_json,'$.effective_to'),''),'9999-12-31'))
    ) THEN RAISE(ABORT,'TT99_ACCOUNT_MAP_POLICY_REQUIRED')
  END;
END;

CREATE TRIGGER tt99_account_map_policy_update_guard
BEFORE UPDATE ON documents
WHEN NEW.doctype='TT99 Account Map' AND OLD.docstatus<>1 AND NEW.docstatus=1
BEGIN
  SELECT CASE
    WHEN json_extract(NEW.payload_json,'$.source_account')=json_extract(NEW.payload_json,'$.target_account')
      THEN RAISE(ABORT,'TT99_ACCOUNT_MAP_SOURCE_TARGET_SAME')
    WHEN NOT EXISTS(
      SELECT 1 FROM master_records a
      WHERE a.tenant_id=NEW.tenant_id AND a.record_type='Account'
        AND a.name=json_extract(NEW.payload_json,'$.source_account')
        AND json_extract(a.data_json,'$.company')=json_extract(NEW.payload_json,'$.company')
        AND COALESCE(CAST(json_extract(a.data_json,'$.is_group') AS INTEGER),0)=0
    ) THEN RAISE(ABORT,'TT99_ACCOUNT_MAP_SOURCE_COMPANY_MISMATCH')
    WHEN NOT EXISTS(
      SELECT 1 FROM master_records a
      WHERE a.tenant_id=NEW.tenant_id AND a.record_type='Account'
        AND a.name=json_extract(NEW.payload_json,'$.target_account') AND a.disabled=0
        AND json_extract(a.data_json,'$.company')=json_extract(NEW.payload_json,'$.company')
        AND COALESCE(CAST(json_extract(a.data_json,'$.is_group') AS INTEGER),0)=0
    ) THEN RAISE(ABORT,'TT99_ACCOUNT_MAP_TARGET_COMPANY_MISMATCH')
    WHEN NOT EXISTS(
      SELECT 1 FROM documents p
      WHERE p.tenant_id=NEW.tenant_id AND p.doctype='VN Accounting Policy' AND p.docstatus=1
        AND json_extract(p.payload_json,'$.company')=json_extract(NEW.payload_json,'$.company')
        AND json_extract(p.payload_json,'$.regime_code')='TT99'
        AND json_extract(p.payload_json,'$.legal_rule')=json_extract(NEW.payload_json,'$.legal_rule')
        AND date(json_extract(p.payload_json,'$.effective_from'))<=date(json_extract(NEW.payload_json,'$.effective_from'))
        AND date(COALESCE(NULLIF(json_extract(p.payload_json,'$.effective_to'),''),'9999-12-31'))
          >= date(COALESCE(NULLIF(json_extract(NEW.payload_json,'$.effective_to'),''),'9999-12-31'))
    ) THEN RAISE(ABORT,'TT99_ACCOUNT_MAP_POLICY_REQUIRED')
  END;
END;
