-- WS01 statutory registry integrity.
-- 0048 owns legal-rule/account-map integrity; this migration owns TT99 form/book/BCTC
-- registries and deterministic tax-ruleset evidence. Approved definitions are immutable.

DROP TRIGGER IF EXISTS tt99_registry_insert_guard;
DROP TRIGGER IF EXISTS tt99_registry_update_guard;
DROP TRIGGER IF EXISTS tt99_registry_immutable_update_guard;
DROP TRIGGER IF EXISTS tt99_registry_immutable_delete_guard;
DROP TRIGGER IF EXISTS vn_tax_ruleset_insert_guard;
DROP TRIGGER IF EXISTS vn_tax_ruleset_update_guard;
DROP TRIGGER IF EXISTS vn_tax_ruleset_immutable_update_guard;
DROP TRIGGER IF EXISTS vn_tax_ruleset_immutable_delete_guard;

CREATE TRIGGER tt99_registry_insert_guard
BEFORE INSERT ON documents
WHEN NEW.doctype IN ('TT99 Voucher Form','TT99 Book Form','TT99 Financial Statement Template')
  AND NEW.docstatus<>2
BEGIN
  SELECT CASE
    WHEN date(json_extract(NEW.payload_json,'$.effective_from')) IS NULL
      OR (
        COALESCE(json_extract(NEW.payload_json,'$.effective_to'),'')<>''
        AND date(json_extract(NEW.payload_json,'$.effective_to')) < date(json_extract(NEW.payload_json,'$.effective_from'))
      )
    THEN RAISE(ABORT,'TT99_REGISTRY_INVALID_RANGE')
    WHEN NEW.doctype='TT99 Voucher Form' AND (
      json_valid(COALESCE(json_extract(NEW.payload_json,'$.template_json'),''))=0
      OR json_valid(COALESCE(json_extract(NEW.payload_json,'$.required_fields_json'),''))=0
    ) THEN RAISE(ABORT,'TT99_VOUCHER_SCHEMA_INVALID')
    WHEN NEW.doctype='TT99 Book Form' AND (
      json_valid(COALESCE(json_extract(NEW.payload_json,'$.columns_json'),''))=0
      OR json_valid(COALESCE(json_extract(NEW.payload_json,'$.grouping_json'),''))=0
      OR json_valid(COALESCE(json_extract(NEW.payload_json,'$.filter_schema_json'),''))=0
    ) THEN RAISE(ABORT,'TT99_BOOK_SCHEMA_INVALID')
    WHEN NEW.doctype='TT99 Financial Statement Template' AND (
      json_valid(COALESCE(json_extract(NEW.payload_json,'$.lines_json'),''))=0
      OR COALESCE(CAST(json_extract(NEW.payload_json,'$.rounding_digits') AS INTEGER),-1) NOT BETWEEN 0 AND 6
    ) THEN RAISE(ABORT,'TT99_STATEMENT_SCHEMA_INVALID')
    WHEN NEW.docstatus=1 AND (
      json_valid(COALESCE(json_extract(NEW.payload_json,'$.test_evidence_json'),''))=0
      OR json_extract(NEW.payload_json,'$.test_evidence_json') IN ('{}','[]','null','')
    ) THEN RAISE(ABORT,'TT99_REGISTRY_TEST_EVIDENCE_REQUIRED')
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
    ) THEN RAISE(ABORT,'TT99_REGISTRY_LEGAL_RULE_REQUIRED')
    WHEN NEW.docstatus=1 AND EXISTS(
      SELECT 1 FROM documents d
      WHERE d.tenant_id=NEW.tenant_id
        AND d.doctype=NEW.doctype
        AND d.docstatus=1
        AND COALESCE(json_extract(d.payload_json,'$.company'),'')=COALESCE(json_extract(NEW.payload_json,'$.company'),'')
        AND CASE NEW.doctype
          WHEN 'TT99 Voucher Form' THEN json_extract(d.payload_json,'$.form_code')=json_extract(NEW.payload_json,'$.form_code')
          WHEN 'TT99 Book Form' THEN json_extract(d.payload_json,'$.book_code')=json_extract(NEW.payload_json,'$.book_code')
          ELSE json_extract(d.payload_json,'$.statement_code')=json_extract(NEW.payload_json,'$.statement_code')
        END
        AND date(json_extract(d.payload_json,'$.effective_from'))
          <= date(COALESCE(NULLIF(json_extract(NEW.payload_json,'$.effective_to'),''),'9999-12-31'))
        AND date(COALESCE(NULLIF(json_extract(d.payload_json,'$.effective_to'),''),'9999-12-31'))
          >= date(json_extract(NEW.payload_json,'$.effective_from'))
    ) THEN RAISE(ABORT,'TT99_REGISTRY_OVERLAP')
  END;
END;

CREATE TRIGGER tt99_registry_update_guard
BEFORE UPDATE ON documents
WHEN NEW.doctype IN ('TT99 Voucher Form','TT99 Book Form','TT99 Financial Statement Template')
  AND OLD.docstatus<>1 AND NEW.docstatus<>2
BEGIN
  SELECT CASE
    WHEN date(json_extract(NEW.payload_json,'$.effective_from')) IS NULL
      OR (
        COALESCE(json_extract(NEW.payload_json,'$.effective_to'),'')<>''
        AND date(json_extract(NEW.payload_json,'$.effective_to')) < date(json_extract(NEW.payload_json,'$.effective_from'))
      )
    THEN RAISE(ABORT,'TT99_REGISTRY_INVALID_RANGE')
    WHEN NEW.doctype='TT99 Voucher Form' AND (
      json_valid(COALESCE(json_extract(NEW.payload_json,'$.template_json'),''))=0
      OR json_valid(COALESCE(json_extract(NEW.payload_json,'$.required_fields_json'),''))=0
    ) THEN RAISE(ABORT,'TT99_VOUCHER_SCHEMA_INVALID')
    WHEN NEW.doctype='TT99 Book Form' AND (
      json_valid(COALESCE(json_extract(NEW.payload_json,'$.columns_json'),''))=0
      OR json_valid(COALESCE(json_extract(NEW.payload_json,'$.grouping_json'),''))=0
      OR json_valid(COALESCE(json_extract(NEW.payload_json,'$.filter_schema_json'),''))=0
    ) THEN RAISE(ABORT,'TT99_BOOK_SCHEMA_INVALID')
    WHEN NEW.doctype='TT99 Financial Statement Template' AND (
      json_valid(COALESCE(json_extract(NEW.payload_json,'$.lines_json'),''))=0
      OR COALESCE(CAST(json_extract(NEW.payload_json,'$.rounding_digits') AS INTEGER),-1) NOT BETWEEN 0 AND 6
    ) THEN RAISE(ABORT,'TT99_STATEMENT_SCHEMA_INVALID')
    WHEN NEW.docstatus=1 AND (
      json_valid(COALESCE(json_extract(NEW.payload_json,'$.test_evidence_json'),''))=0
      OR json_extract(NEW.payload_json,'$.test_evidence_json') IN ('{}','[]','null','')
    ) THEN RAISE(ABORT,'TT99_REGISTRY_TEST_EVIDENCE_REQUIRED')
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
    ) THEN RAISE(ABORT,'TT99_REGISTRY_LEGAL_RULE_REQUIRED')
    WHEN NEW.docstatus=1 AND EXISTS(
      SELECT 1 FROM documents d
      WHERE d.tenant_id=NEW.tenant_id
        AND d.doctype=NEW.doctype
        AND d.docstatus=1
        AND d.doc_key<>OLD.doc_key
        AND COALESCE(json_extract(d.payload_json,'$.company'),'')=COALESCE(json_extract(NEW.payload_json,'$.company'),'')
        AND CASE NEW.doctype
          WHEN 'TT99 Voucher Form' THEN json_extract(d.payload_json,'$.form_code')=json_extract(NEW.payload_json,'$.form_code')
          WHEN 'TT99 Book Form' THEN json_extract(d.payload_json,'$.book_code')=json_extract(NEW.payload_json,'$.book_code')
          ELSE json_extract(d.payload_json,'$.statement_code')=json_extract(NEW.payload_json,'$.statement_code')
        END
        AND date(json_extract(d.payload_json,'$.effective_from'))
          <= date(COALESCE(NULLIF(json_extract(NEW.payload_json,'$.effective_to'),''),'9999-12-31'))
        AND date(COALESCE(NULLIF(json_extract(d.payload_json,'$.effective_to'),''),'9999-12-31'))
          >= date(json_extract(NEW.payload_json,'$.effective_from'))
    ) THEN RAISE(ABORT,'TT99_REGISTRY_OVERLAP')
  END;
END;

CREATE TRIGGER tt99_registry_immutable_update_guard
BEFORE UPDATE ON documents
WHEN OLD.doctype IN ('TT99 Voucher Form','TT99 Book Form','TT99 Financial Statement Template')
  AND OLD.docstatus=1
BEGIN
  SELECT RAISE(ABORT,'TT99_REGISTRY_IMMUTABLE');
END;

CREATE TRIGGER tt99_registry_immutable_delete_guard
BEFORE DELETE ON documents
WHEN OLD.doctype IN ('TT99 Voucher Form','TT99 Book Form','TT99 Financial Statement Template')
  AND OLD.docstatus=1
BEGIN
  SELECT RAISE(ABORT,'TT99_REGISTRY_IMMUTABLE');
END;

CREATE TRIGGER vn_tax_ruleset_insert_guard
BEFORE INSERT ON documents
WHEN NEW.doctype='VN Tax Ruleset' AND NEW.docstatus<>2
BEGIN
  SELECT CASE
    WHEN date(json_extract(NEW.payload_json,'$.effective_from')) IS NULL
      OR (
        COALESCE(json_extract(NEW.payload_json,'$.effective_to'),'')<>''
        AND date(json_extract(NEW.payload_json,'$.effective_to')) < date(json_extract(NEW.payload_json,'$.effective_from'))
      )
    THEN RAISE(ABORT,'VN_TAX_RULESET_INVALID_RANGE')
    WHEN json_valid(COALESCE(json_extract(NEW.payload_json,'$.expression_json'),''))=0
      OR json_valid(COALESCE(json_extract(NEW.payload_json,'$.test_vectors_json'),''))=0
    THEN RAISE(ABORT,'VN_TAX_RULESET_SCHEMA_INVALID')
    WHEN NEW.docstatus=1 AND (
      json_extract(NEW.payload_json,'$.test_vectors_json') IN ('[]','{}','null','')
      OR length(trim(COALESCE(json_extract(NEW.payload_json,'$.source_hash'),'')))<>64
      OR trim(COALESCE(json_extract(NEW.payload_json,'$.source_hash'),'')) GLOB '*[^0-9A-Fa-f]*'
    ) THEN RAISE(ABORT,'VN_TAX_RULESET_EVIDENCE_REQUIRED')
    WHEN NEW.docstatus=1 AND NOT EXISTS(
      SELECT 1 FROM documents r
      WHERE r.tenant_id=NEW.tenant_id
        AND r.doctype='VN Legal Rule'
        AND r.name=json_extract(NEW.payload_json,'$.legal_rule')
        AND r.docstatus=1
        AND json_extract(r.payload_json,'$.rule_type')=json_extract(NEW.payload_json,'$.rule_type')
        AND date(json_extract(r.payload_json,'$.effective_from')) <= date(json_extract(NEW.payload_json,'$.effective_from'))
        AND date(COALESCE(NULLIF(json_extract(r.payload_json,'$.effective_to'),''),'9999-12-31'))
          >= date(COALESCE(NULLIF(json_extract(NEW.payload_json,'$.effective_to'),''),'9999-12-31'))
    ) THEN RAISE(ABORT,'VN_TAX_RULESET_LEGAL_RULE_REQUIRED')
    WHEN NEW.docstatus=1 AND EXISTS(
      SELECT 1 FROM documents d
      WHERE d.tenant_id=NEW.tenant_id
        AND d.doctype='VN Tax Ruleset'
        AND d.docstatus=1
        AND json_extract(d.payload_json,'$.company')=json_extract(NEW.payload_json,'$.company')
        AND json_extract(d.payload_json,'$.rule_type')=json_extract(NEW.payload_json,'$.rule_type')
        AND json_extract(d.payload_json,'$.taxpayer_segment')=json_extract(NEW.payload_json,'$.taxpayer_segment')
        AND date(json_extract(d.payload_json,'$.effective_from'))
          <= date(COALESCE(NULLIF(json_extract(NEW.payload_json,'$.effective_to'),''),'9999-12-31'))
        AND date(COALESCE(NULLIF(json_extract(d.payload_json,'$.effective_to'),''),'9999-12-31'))
          >= date(json_extract(NEW.payload_json,'$.effective_from'))
    ) THEN RAISE(ABORT,'VN_TAX_RULESET_OVERLAP')
  END;
END;

CREATE TRIGGER vn_tax_ruleset_update_guard
BEFORE UPDATE ON documents
WHEN NEW.doctype='VN Tax Ruleset' AND OLD.docstatus<>1 AND NEW.docstatus<>2
BEGIN
  SELECT CASE
    WHEN date(json_extract(NEW.payload_json,'$.effective_from')) IS NULL
      OR (
        COALESCE(json_extract(NEW.payload_json,'$.effective_to'),'')<>''
        AND date(json_extract(NEW.payload_json,'$.effective_to')) < date(json_extract(NEW.payload_json,'$.effective_from'))
      )
    THEN RAISE(ABORT,'VN_TAX_RULESET_INVALID_RANGE')
    WHEN json_valid(COALESCE(json_extract(NEW.payload_json,'$.expression_json'),''))=0
      OR json_valid(COALESCE(json_extract(NEW.payload_json,'$.test_vectors_json'),''))=0
    THEN RAISE(ABORT,'VN_TAX_RULESET_SCHEMA_INVALID')
    WHEN NEW.docstatus=1 AND (
      json_extract(NEW.payload_json,'$.test_vectors_json') IN ('[]','{}','null','')
      OR length(trim(COALESCE(json_extract(NEW.payload_json,'$.source_hash'),'')))<>64
      OR trim(COALESCE(json_extract(NEW.payload_json,'$.source_hash'),'')) GLOB '*[^0-9A-Fa-f]*'
    ) THEN RAISE(ABORT,'VN_TAX_RULESET_EVIDENCE_REQUIRED')
    WHEN NEW.docstatus=1 AND NOT EXISTS(
      SELECT 1 FROM documents r
      WHERE r.tenant_id=NEW.tenant_id
        AND r.doctype='VN Legal Rule'
        AND r.name=json_extract(NEW.payload_json,'$.legal_rule')
        AND r.docstatus=1
        AND json_extract(r.payload_json,'$.rule_type')=json_extract(NEW.payload_json,'$.rule_type')
        AND date(json_extract(r.payload_json,'$.effective_from')) <= date(json_extract(NEW.payload_json,'$.effective_from'))
        AND date(COALESCE(NULLIF(json_extract(r.payload_json,'$.effective_to'),''),'9999-12-31'))
          >= date(COALESCE(NULLIF(json_extract(NEW.payload_json,'$.effective_to'),''),'9999-12-31'))
    ) THEN RAISE(ABORT,'VN_TAX_RULESET_LEGAL_RULE_REQUIRED')
    WHEN NEW.docstatus=1 AND EXISTS(
      SELECT 1 FROM documents d
      WHERE d.tenant_id=NEW.tenant_id
        AND d.doctype='VN Tax Ruleset'
        AND d.docstatus=1
        AND d.doc_key<>OLD.doc_key
        AND json_extract(d.payload_json,'$.company')=json_extract(NEW.payload_json,'$.company')
        AND json_extract(d.payload_json,'$.rule_type')=json_extract(NEW.payload_json,'$.rule_type')
        AND json_extract(d.payload_json,'$.taxpayer_segment')=json_extract(NEW.payload_json,'$.taxpayer_segment')
        AND date(json_extract(d.payload_json,'$.effective_from'))
          <= date(COALESCE(NULLIF(json_extract(NEW.payload_json,'$.effective_to'),''),'9999-12-31'))
        AND date(COALESCE(NULLIF(json_extract(d.payload_json,'$.effective_to'),''),'9999-12-31'))
          >= date(json_extract(NEW.payload_json,'$.effective_from'))
    ) THEN RAISE(ABORT,'VN_TAX_RULESET_OVERLAP')
  END;
END;

CREATE TRIGGER vn_tax_ruleset_immutable_update_guard
BEFORE UPDATE ON documents
WHEN OLD.doctype='VN Tax Ruleset' AND OLD.docstatus=1
BEGIN
  SELECT RAISE(ABORT,'VN_TAX_RULESET_IMMUTABLE');
END;

CREATE TRIGGER vn_tax_ruleset_immutable_delete_guard
BEFORE DELETE ON documents
WHEN OLD.doctype='VN Tax Ruleset' AND OLD.docstatus=1
BEGIN
  SELECT RAISE(ABORT,'VN_TAX_RULESET_IMMUTABLE');
END;
