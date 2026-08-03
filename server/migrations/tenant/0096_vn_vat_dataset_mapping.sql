-- WS01 VAT dataset classification contract.
-- VAT amounts remain sourced from submitted invoice tax rows; this migration only
-- defines which company accounts are input/output VAT for a versioned VAT ruleset.

UPDATE doctype_definitions
SET metadata_json=json_insert(
      metadata_json,
      '$.fields[#]',
      json('{"fieldname":"tax_accounts_json","label":"VAT Account Mapping","fieldtype":"Code","description":"For VAT rulesets: {\"input_vat\":[\"...\"],\"output_vat\":[\"...\"]}","default":"{}"}')
    ),
    revision=revision+1,
    modified_by='migration',
    modified_at='2026-08-03T00:00:00.000Z'
WHERE doctype='VN Tax Ruleset'
  AND NOT EXISTS(
    SELECT 1 FROM json_each(metadata_json,'$.fields')
    WHERE json_extract(value,'$.fieldname')='tax_accounts_json'
  );

DROP TRIGGER IF EXISTS vn_vat_account_mapping_insert_guard;
DROP TRIGGER IF EXISTS vn_vat_account_mapping_update_guard;

CREATE TRIGGER vn_vat_account_mapping_insert_guard
BEFORE INSERT ON documents
WHEN NEW.doctype='VN Tax Ruleset' AND NEW.docstatus=1
  AND json_extract(NEW.payload_json,'$.rule_type')='VAT'
BEGIN
  SELECT CASE
    WHEN json_valid(COALESCE(json_extract(NEW.payload_json,'$.tax_accounts_json'),''))=0
      OR json_type(json_extract(NEW.payload_json,'$.tax_accounts_json'))<>'object'
      OR json_type(json_extract(NEW.payload_json,'$.tax_accounts_json'),'$.input_vat')<>'array'
      OR json_type(json_extract(NEW.payload_json,'$.tax_accounts_json'),'$.output_vat')<>'array'
      THEN RAISE(ABORT,'VN_VAT_ACCOUNT_MAPPING_INVALID')
    WHEN (
      SELECT COUNT(*) FROM json_each(json_extract(NEW.payload_json,'$.tax_accounts_json'),'$.input_vat')
    ) + (
      SELECT COUNT(*) FROM json_each(json_extract(NEW.payload_json,'$.tax_accounts_json'),'$.output_vat')
    ) = 0
      THEN RAISE(ABORT,'VN_VAT_ACCOUNT_MAPPING_EMPTY')
    WHEN EXISTS(
      SELECT 1 FROM json_each(json_extract(NEW.payload_json,'$.tax_accounts_json'),'$.input_vat')
      WHERE type<>'text' OR length(trim(CAST(value AS TEXT)))=0
    ) OR EXISTS(
      SELECT 1 FROM json_each(json_extract(NEW.payload_json,'$.tax_accounts_json'),'$.output_vat')
      WHERE type<>'text' OR length(trim(CAST(value AS TEXT)))=0
    ) THEN RAISE(ABORT,'VN_VAT_ACCOUNT_MAPPING_INVALID')
    WHEN EXISTS(
      SELECT 1
      FROM json_each(json_extract(NEW.payload_json,'$.tax_accounts_json'),'$.input_vat') i
      JOIN json_each(json_extract(NEW.payload_json,'$.tax_accounts_json'),'$.output_vat') o
        ON trim(CAST(i.value AS TEXT))=trim(CAST(o.value AS TEXT))
    ) THEN RAISE(ABORT,'VN_VAT_ACCOUNT_MAPPING_AMBIGUOUS')
  END;
END;

CREATE TRIGGER vn_vat_account_mapping_update_guard
BEFORE UPDATE ON documents
WHEN NEW.doctype='VN Tax Ruleset' AND OLD.docstatus<>1 AND NEW.docstatus=1
  AND json_extract(NEW.payload_json,'$.rule_type')='VAT'
BEGIN
  SELECT CASE
    WHEN json_valid(COALESCE(json_extract(NEW.payload_json,'$.tax_accounts_json'),''))=0
      OR json_type(json_extract(NEW.payload_json,'$.tax_accounts_json'))<>'object'
      OR json_type(json_extract(NEW.payload_json,'$.tax_accounts_json'),'$.input_vat')<>'array'
      OR json_type(json_extract(NEW.payload_json,'$.tax_accounts_json'),'$.output_vat')<>'array'
      THEN RAISE(ABORT,'VN_VAT_ACCOUNT_MAPPING_INVALID')
    WHEN (
      SELECT COUNT(*) FROM json_each(json_extract(NEW.payload_json,'$.tax_accounts_json'),'$.input_vat')
    ) + (
      SELECT COUNT(*) FROM json_each(json_extract(NEW.payload_json,'$.tax_accounts_json'),'$.output_vat')
    ) = 0
      THEN RAISE(ABORT,'VN_VAT_ACCOUNT_MAPPING_EMPTY')
    WHEN EXISTS(
      SELECT 1 FROM json_each(json_extract(NEW.payload_json,'$.tax_accounts_json'),'$.input_vat')
      WHERE type<>'text' OR length(trim(CAST(value AS TEXT)))=0
    ) OR EXISTS(
      SELECT 1 FROM json_each(json_extract(NEW.payload_json,'$.tax_accounts_json'),'$.output_vat')
      WHERE type<>'text' OR length(trim(CAST(value AS TEXT)))=0
    ) THEN RAISE(ABORT,'VN_VAT_ACCOUNT_MAPPING_INVALID')
    WHEN EXISTS(
      SELECT 1
      FROM json_each(json_extract(NEW.payload_json,'$.tax_accounts_json'),'$.input_vat') i
      JOIN json_each(json_extract(NEW.payload_json,'$.tax_accounts_json'),'$.output_vat') o
        ON trim(CAST(i.value AS TEXT))=trim(CAST(o.value AS TEXT))
    ) THEN RAISE(ABORT,'VN_VAT_ACCOUNT_MAPPING_AMBIGUOUS')
  END;
END;
