-- RC4-A4 VAT account-mapping guard hardening.
--
-- Migration 0096 introduced the versioned VAT account mapping contract. Its
-- missing-array check relied on SQLite NULL comparison semantics, so a mapping
-- such as {"input_vat":[]} could fall through to the EMPTY marker instead of
-- the intended INVALID marker. The write still failed closed, but the failure
-- contract was not deterministic enough for statutory regression evidence.
--
-- Do not edit 0096: it may already be applied. Replace only the guards here.
-- VAT amounts and filing data remain read-only projections over canonical
-- invoice/accounting authority; no tax or financial ledger is introduced.

DROP TRIGGER IF EXISTS vn_vat_account_mapping_insert_guard;
DROP TRIGGER IF EXISTS vn_vat_account_mapping_update_guard;

CREATE TRIGGER vn_vat_account_mapping_insert_guard
BEFORE INSERT ON documents
WHEN NEW.doctype='VN Tax Ruleset' AND NEW.docstatus=1
  AND json_extract(NEW.payload_json,'$.rule_type')='VAT'
BEGIN
  SELECT CASE
    WHEN json_valid(COALESCE(json_extract(NEW.payload_json,'$.tax_accounts_json'),''))=0
      THEN RAISE(ABORT,'VN_VAT_ACCOUNT_MAPPING_INVALID')
    WHEN COALESCE(json_type(json_extract(NEW.payload_json,'$.tax_accounts_json')),'')<>'object'
      OR COALESCE(json_type(json_extract(NEW.payload_json,'$.tax_accounts_json'),'$.input_vat'),'')<>'array'
      OR COALESCE(json_type(json_extract(NEW.payload_json,'$.tax_accounts_json'),'$.output_vat'),'')<>'array'
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
      THEN RAISE(ABORT,'VN_VAT_ACCOUNT_MAPPING_INVALID')
    WHEN COALESCE(json_type(json_extract(NEW.payload_json,'$.tax_accounts_json')),'')<>'object'
      OR COALESCE(json_type(json_extract(NEW.payload_json,'$.tax_accounts_json'),'$.input_vat'),'')<>'array'
      OR COALESCE(json_type(json_extract(NEW.payload_json,'$.tax_accounts_json'),'$.output_vat'),'')<>'array'
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
