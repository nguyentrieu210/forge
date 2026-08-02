-- Integrity guards for TT99 localization, tax rules and e-invoice evidence.
-- Keep D1 authoritative for version/effective-date conflicts so UI/API bugs cannot
-- silently publish two legal definitions for the same scope.

DROP TRIGGER IF EXISTS vn_accounting_localization_insert_guard;
DROP TRIGGER IF EXISTS vn_accounting_localization_update_guard;

CREATE TRIGGER vn_accounting_localization_insert_guard
BEFORE INSERT ON documents
WHEN NEW.doctype IN (
  'TT99 Account Map',
  'TT99 Voucher Form',
  'TT99 Book Form',
  'TT99 Financial Statement Template',
  'TT99 Transition Map',
  'Tax Ruleset',
  'E-Invoice Document'
)
AND NEW.docstatus<>2
BEGIN
  SELECT CASE
    WHEN NEW.doctype IN (
      'TT99 Account Map', 'TT99 Voucher Form', 'TT99 Book Form',
      'TT99 Financial Statement Template', 'Tax Ruleset'
    )
    AND (
      date(json_extract(NEW.payload_json, '$.effective_from')) IS NULL
      OR (
        NULLIF(json_extract(NEW.payload_json, '$.effective_to'), '') IS NOT NULL
        AND date(json_extract(NEW.payload_json, '$.effective_to')) < date(json_extract(NEW.payload_json, '$.effective_from'))
      )
    ) THEN RAISE(ABORT, 'ACCOUNTING_LOCALIZATION_INVALID_RANGE')

    WHEN NEW.doctype='TT99 Account Map'
      AND json_valid(COALESCE(json_extract(NEW.payload_json, '$.test_evidence_json'), ''))=0
    THEN RAISE(ABORT, 'TT99_ACCOUNT_MAP_INVALID_EVIDENCE_JSON')

    WHEN NEW.doctype='TT99 Voucher Form'
      AND (
        json_valid(COALESCE(json_extract(NEW.payload_json, '$.template_json'), ''))=0
        OR json_valid(COALESCE(json_extract(NEW.payload_json, '$.required_fields_json'), ''))=0
        OR json_valid(COALESCE(json_extract(NEW.payload_json, '$.test_evidence_json'), ''))=0
      )
    THEN RAISE(ABORT, 'TT99_VOUCHER_INVALID_JSON')

    WHEN NEW.doctype='TT99 Book Form'
      AND (
        json_valid(COALESCE(json_extract(NEW.payload_json, '$.columns_json'), ''))=0
        OR json_valid(COALESCE(json_extract(NEW.payload_json, '$.grouping_json'), ''))=0
        OR json_valid(COALESCE(json_extract(NEW.payload_json, '$.filter_schema_json'), ''))=0
        OR json_valid(COALESCE(json_extract(NEW.payload_json, '$.test_evidence_json'), ''))=0
      )
    THEN RAISE(ABORT, 'TT99_BOOK_INVALID_JSON')

    WHEN NEW.doctype='TT99 Financial Statement Template'
      AND (
        json_valid(COALESCE(json_extract(NEW.payload_json, '$.lines_json'), ''))=0
        OR json_valid(COALESCE(json_extract(NEW.payload_json, '$.test_evidence_json'), ''))=0
      )
    THEN RAISE(ABORT, 'TT99_FINANCIAL_STATEMENT_INVALID_JSON')

    WHEN NEW.doctype='TT99 Transition Map'
      AND (
        json_valid(COALESCE(json_extract(NEW.payload_json, '$.preview_result_json'), ''))=0
        OR json_valid(COALESCE(json_extract(NEW.payload_json, '$.balance_check_json'), ''))=0
      )
    THEN RAISE(ABORT, 'TT99_TRANSITION_INVALID_JSON')

    WHEN NEW.doctype='Tax Ruleset'
      AND (
        json_valid(COALESCE(json_extract(NEW.payload_json, '$.scope_json'), ''))=0
        OR json_valid(COALESCE(json_extract(NEW.payload_json, '$.expression_json'), ''))=0
        OR json_valid(COALESCE(json_extract(NEW.payload_json, '$.fixtures_json'), ''))=0
        OR json_valid(COALESCE(json_extract(NEW.payload_json, '$.test_evidence_json'), ''))=0
      )
    THEN RAISE(ABORT, 'TAX_RULESET_INVALID_JSON')

    WHEN NEW.doctype='Tax Ruleset'
      AND NEW.docstatus=1
      AND (
        COALESCE(CAST(json_extract(NEW.payload_json, '$.test_passed') AS INTEGER), 0)<>1
        OR COALESCE(json_extract(NEW.payload_json, '$.ruleset_hash'), '')=''
      )
    THEN RAISE(ABORT, 'TAX_RULESET_UNVERIFIED')

    WHEN NEW.doctype='TT99 Transition Map'
      AND NEW.docstatus=1
      AND (
        COALESCE(json_extract(NEW.payload_json, '$.mapping_set_hash'), '')=''
        OR COALESCE(CAST(json_extract(NEW.payload_json, '$.exception_count') AS INTEGER), 0)<>0
      )
    THEN RAISE(ABORT, 'TT99_TRANSITION_NOT_READY')

    WHEN NEW.doctype='E-Invoice Document'
      AND NEW.docstatus=1
      AND (
        COALESCE(json_extract(NEW.payload_json, '$.xml_hash'), '')=''
        OR COALESCE(json_extract(NEW.payload_json, '$.provider_status'), '')=''
      )
    THEN RAISE(ABORT, 'EINVOICE_EVIDENCE_MISSING')

    WHEN NEW.doctype='TT99 Account Map'
      AND NEW.docstatus=1
      AND EXISTS (
        SELECT 1 FROM documents d
        WHERE d.tenant_id=NEW.tenant_id
          AND d.doctype='TT99 Account Map'
          AND d.docstatus=1
          AND json_extract(d.payload_json, '$.company')=json_extract(NEW.payload_json, '$.company')
          AND json_extract(d.payload_json, '$.source_account')=json_extract(NEW.payload_json, '$.source_account')
          AND date(json_extract(d.payload_json, '$.effective_from')) <= date(COALESCE(NULLIF(json_extract(NEW.payload_json, '$.effective_to'), ''), '9999-12-31'))
          AND date(COALESCE(NULLIF(json_extract(d.payload_json, '$.effective_to'), ''), '9999-12-31')) >= date(json_extract(NEW.payload_json, '$.effective_from'))
      )
    THEN RAISE(ABORT, 'TT99_ACCOUNT_MAP_OVERLAP')

    WHEN NEW.doctype='TT99 Voucher Form'
      AND NEW.docstatus=1
      AND EXISTS (
        SELECT 1 FROM documents d
        WHERE d.tenant_id=NEW.tenant_id
          AND d.doctype='TT99 Voucher Form'
          AND d.docstatus=1
          AND COALESCE(json_extract(d.payload_json, '$.company'), '')=COALESCE(json_extract(NEW.payload_json, '$.company'), '')
          AND json_extract(d.payload_json, '$.form_code')=json_extract(NEW.payload_json, '$.form_code')
          AND date(json_extract(d.payload_json, '$.effective_from')) <= date(COALESCE(NULLIF(json_extract(NEW.payload_json, '$.effective_to'), ''), '9999-12-31'))
          AND date(COALESCE(NULLIF(json_extract(d.payload_json, '$.effective_to'), ''), '9999-12-31')) >= date(json_extract(NEW.payload_json, '$.effective_from'))
      )
    THEN RAISE(ABORT, 'TT99_VOUCHER_FORM_OVERLAP')

    WHEN NEW.doctype='TT99 Book Form'
      AND NEW.docstatus=1
      AND EXISTS (
        SELECT 1 FROM documents d
        WHERE d.tenant_id=NEW.tenant_id
          AND d.doctype='TT99 Book Form'
          AND d.docstatus=1
          AND COALESCE(json_extract(d.payload_json, '$.company'), '')=COALESCE(json_extract(NEW.payload_json, '$.company'), '')
          AND json_extract(d.payload_json, '$.book_code')=json_extract(NEW.payload_json, '$.book_code')
          AND date(json_extract(d.payload_json, '$.effective_from')) <= date(COALESCE(NULLIF(json_extract(NEW.payload_json, '$.effective_to'), ''), '9999-12-31'))
          AND date(COALESCE(NULLIF(json_extract(d.payload_json, '$.effective_to'), ''), '9999-12-31')) >= date(json_extract(NEW.payload_json, '$.effective_from'))
      )
    THEN RAISE(ABORT, 'TT99_BOOK_FORM_OVERLAP')

    WHEN NEW.doctype='TT99 Financial Statement Template'
      AND NEW.docstatus=1
      AND EXISTS (
        SELECT 1 FROM documents d
        WHERE d.tenant_id=NEW.tenant_id
          AND d.doctype='TT99 Financial Statement Template'
          AND d.docstatus=1
          AND COALESCE(json_extract(d.payload_json, '$.company'), '')=COALESCE(json_extract(NEW.payload_json, '$.company'), '')
          AND json_extract(d.payload_json, '$.statement_code')=json_extract(NEW.payload_json, '$.statement_code')
          AND date(json_extract(d.payload_json, '$.effective_from')) <= date(COALESCE(NULLIF(json_extract(NEW.payload_json, '$.effective_to'), ''), '9999-12-31'))
          AND date(COALESCE(NULLIF(json_extract(d.payload_json, '$.effective_to'), ''), '9999-12-31')) >= date(json_extract(NEW.payload_json, '$.effective_from'))
      )
    THEN RAISE(ABORT, 'TT99_FINANCIAL_STATEMENT_OVERLAP')

    WHEN NEW.doctype='Tax Ruleset'
      AND NEW.docstatus=1
      AND EXISTS (
        SELECT 1 FROM documents d
        WHERE d.tenant_id=NEW.tenant_id
          AND d.doctype='Tax Ruleset'
          AND d.docstatus=1
          AND COALESCE(json_extract(d.payload_json, '$.company'), '')=COALESCE(json_extract(NEW.payload_json, '$.company'), '')
          AND json_extract(d.payload_json, '$.rule_type')=json_extract(NEW.payload_json, '$.rule_type')
          AND json_extract(d.payload_json, '$.scope_key')=json_extract(NEW.payload_json, '$.scope_key')
          AND date(json_extract(d.payload_json, '$.effective_from')) <= date(COALESCE(NULLIF(json_extract(NEW.payload_json, '$.effective_to'), ''), '9999-12-31'))
          AND date(COALESCE(NULLIF(json_extract(d.payload_json, '$.effective_to'), ''), '9999-12-31')) >= date(json_extract(NEW.payload_json, '$.effective_from'))
      )
    THEN RAISE(ABORT, 'TAX_RULESET_OVERLAP')

    WHEN NEW.doctype='E-Invoice Document'
      AND EXISTS (
        SELECT 1 FROM documents d
        WHERE d.tenant_id=NEW.tenant_id
          AND d.doctype='E-Invoice Document'
          AND d.docstatus<>2
          AND json_extract(d.payload_json, '$.company')=json_extract(NEW.payload_json, '$.company')
          AND json_extract(d.payload_json, '$.provider')=json_extract(NEW.payload_json, '$.provider')
          AND json_extract(d.payload_json, '$.invoice_series')=json_extract(NEW.payload_json, '$.invoice_series')
          AND json_extract(d.payload_json, '$.invoice_number')=json_extract(NEW.payload_json, '$.invoice_number')
      )
    THEN RAISE(ABORT, 'EINVOICE_DUPLICATE_NUMBER')
  END;
END;

CREATE TRIGGER vn_accounting_localization_update_guard
BEFORE UPDATE ON documents
WHEN NEW.doctype IN (
  'TT99 Account Map',
  'TT99 Voucher Form',
  'TT99 Book Form',
  'TT99 Financial Statement Template',
  'TT99 Transition Map',
  'Tax Ruleset',
  'E-Invoice Document'
)
AND NEW.docstatus<>2
AND (NEW.payload_json IS NOT OLD.payload_json OR NEW.docstatus IS NOT OLD.docstatus)
BEGIN
  SELECT CASE
    WHEN NEW.doctype IN (
      'TT99 Account Map', 'TT99 Voucher Form', 'TT99 Book Form',
      'TT99 Financial Statement Template', 'Tax Ruleset'
    )
    AND (
      date(json_extract(NEW.payload_json, '$.effective_from')) IS NULL
      OR (
        NULLIF(json_extract(NEW.payload_json, '$.effective_to'), '') IS NOT NULL
        AND date(json_extract(NEW.payload_json, '$.effective_to')) < date(json_extract(NEW.payload_json, '$.effective_from'))
      )
    ) THEN RAISE(ABORT, 'ACCOUNTING_LOCALIZATION_INVALID_RANGE')

    WHEN NEW.doctype='Tax Ruleset'
      AND NEW.docstatus=1
      AND (
        COALESCE(CAST(json_extract(NEW.payload_json, '$.test_passed') AS INTEGER), 0)<>1
        OR COALESCE(json_extract(NEW.payload_json, '$.ruleset_hash'), '')=''
      )
    THEN RAISE(ABORT, 'TAX_RULESET_UNVERIFIED')

    WHEN NEW.doctype='TT99 Transition Map'
      AND NEW.docstatus=1
      AND (
        COALESCE(json_extract(NEW.payload_json, '$.mapping_set_hash'), '')=''
        OR COALESCE(CAST(json_extract(NEW.payload_json, '$.exception_count') AS INTEGER), 0)<>0
      )
    THEN RAISE(ABORT, 'TT99_TRANSITION_NOT_READY')

    WHEN NEW.doctype='E-Invoice Document'
      AND NEW.docstatus=1
      AND (
        COALESCE(json_extract(NEW.payload_json, '$.xml_hash'), '')=''
        OR COALESCE(json_extract(NEW.payload_json, '$.provider_status'), '')=''
      )
    THEN RAISE(ABORT, 'EINVOICE_EVIDENCE_MISSING')

    WHEN NEW.doctype='TT99 Account Map'
      AND NEW.docstatus=1
      AND EXISTS (
        SELECT 1 FROM documents d
        WHERE d.tenant_id=NEW.tenant_id
          AND d.doc_key<>OLD.doc_key
          AND d.doctype='TT99 Account Map'
          AND d.docstatus=1
          AND json_extract(d.payload_json, '$.company')=json_extract(NEW.payload_json, '$.company')
          AND json_extract(d.payload_json, '$.source_account')=json_extract(NEW.payload_json, '$.source_account')
          AND date(json_extract(d.payload_json, '$.effective_from')) <= date(COALESCE(NULLIF(json_extract(NEW.payload_json, '$.effective_to'), ''), '9999-12-31'))
          AND date(COALESCE(NULLIF(json_extract(d.payload_json, '$.effective_to'), ''), '9999-12-31')) >= date(json_extract(NEW.payload_json, '$.effective_from'))
      )
    THEN RAISE(ABORT, 'TT99_ACCOUNT_MAP_OVERLAP')

    WHEN NEW.doctype='TT99 Voucher Form'
      AND NEW.docstatus=1
      AND EXISTS (
        SELECT 1 FROM documents d
        WHERE d.tenant_id=NEW.tenant_id
          AND d.doc_key<>OLD.doc_key
          AND d.doctype='TT99 Voucher Form'
          AND d.docstatus=1
          AND COALESCE(json_extract(d.payload_json, '$.company'), '')=COALESCE(json_extract(NEW.payload_json, '$.company'), '')
          AND json_extract(d.payload_json, '$.form_code')=json_extract(NEW.payload_json, '$.form_code')
          AND date(json_extract(d.payload_json, '$.effective_from')) <= date(COALESCE(NULLIF(json_extract(NEW.payload_json, '$.effective_to'), ''), '9999-12-31'))
          AND date(COALESCE(NULLIF(json_extract(d.payload_json, '$.effective_to'), ''), '9999-12-31')) >= date(json_extract(NEW.payload_json, '$.effective_from'))
      )
    THEN RAISE(ABORT, 'TT99_VOUCHER_FORM_OVERLAP')

    WHEN NEW.doctype='TT99 Book Form'
      AND NEW.docstatus=1
      AND EXISTS (
        SELECT 1 FROM documents d
        WHERE d.tenant_id=NEW.tenant_id
          AND d.doc_key<>OLD.doc_key
          AND d.doctype='TT99 Book Form'
          AND d.docstatus=1
          AND COALESCE(json_extract(d.payload_json, '$.company'), '')=COALESCE(json_extract(NEW.payload_json, '$.company'), '')
          AND json_extract(d.payload_json, '$.book_code')=json_extract(NEW.payload_json, '$.book_code')
          AND date(json_extract(d.payload_json, '$.effective_from')) <= date(COALESCE(NULLIF(json_extract(NEW.payload_json, '$.effective_to'), ''), '9999-12-31'))
          AND date(COALESCE(NULLIF(json_extract(d.payload_json, '$.effective_to'), ''), '9999-12-31')) >= date(json_extract(NEW.payload_json, '$.effective_from'))
      )
    THEN RAISE(ABORT, 'TT99_BOOK_FORM_OVERLAP')

    WHEN NEW.doctype='TT99 Financial Statement Template'
      AND NEW.docstatus=1
      AND EXISTS (
        SELECT 1 FROM documents d
        WHERE d.tenant_id=NEW.tenant_id
          AND d.doc_key<>OLD.doc_key
          AND d.doctype='TT99 Financial Statement Template'
          AND d.docstatus=1
          AND COALESCE(json_extract(d.payload_json, '$.company'), '')=COALESCE(json_extract(NEW.payload_json, '$.company'), '')
          AND json_extract(d.payload_json, '$.statement_code')=json_extract(NEW.payload_json, '$.statement_code')
          AND date(json_extract(d.payload_json, '$.effective_from')) <= date(COALESCE(NULLIF(json_extract(NEW.payload_json, '$.effective_to'), ''), '9999-12-31'))
          AND date(COALESCE(NULLIF(json_extract(d.payload_json, '$.effective_to'), ''), '9999-12-31')) >= date(json_extract(NEW.payload_json, '$.effective_from'))
      )
    THEN RAISE(ABORT, 'TT99_FINANCIAL_STATEMENT_OVERLAP')

    WHEN NEW.doctype='Tax Ruleset'
      AND NEW.docstatus=1
      AND EXISTS (
        SELECT 1 FROM documents d
        WHERE d.tenant_id=NEW.tenant_id
          AND d.doc_key<>OLD.doc_key
          AND d.doctype='Tax Ruleset'
          AND d.docstatus=1
          AND COALESCE(json_extract(d.payload_json, '$.company'), '')=COALESCE(json_extract(NEW.payload_json, '$.company'), '')
          AND json_extract(d.payload_json, '$.rule_type')=json_extract(NEW.payload_json, '$.rule_type')
          AND json_extract(d.payload_json, '$.scope_key')=json_extract(NEW.payload_json, '$.scope_key')
          AND date(json_extract(d.payload_json, '$.effective_from')) <= date(COALESCE(NULLIF(json_extract(NEW.payload_json, '$.effective_to'), ''), '9999-12-31'))
          AND date(COALESCE(NULLIF(json_extract(d.payload_json, '$.effective_to'), ''), '9999-12-31')) >= date(json_extract(NEW.payload_json, '$.effective_from'))
      )
    THEN RAISE(ABORT, 'TAX_RULESET_OVERLAP')

    WHEN NEW.doctype='E-Invoice Document'
      AND EXISTS (
        SELECT 1 FROM documents d
        WHERE d.tenant_id=NEW.tenant_id
          AND d.doc_key<>OLD.doc_key
          AND d.doctype='E-Invoice Document'
          AND d.docstatus<>2
          AND json_extract(d.payload_json, '$.company')=json_extract(NEW.payload_json, '$.company')
          AND json_extract(d.payload_json, '$.provider')=json_extract(NEW.payload_json, '$.provider')
          AND json_extract(d.payload_json, '$.invoice_series')=json_extract(NEW.payload_json, '$.invoice_series')
          AND json_extract(d.payload_json, '$.invoice_number')=json_extract(NEW.payload_json, '$.invoice_number')
      )
    THEN RAISE(ABORT, 'EINVOICE_DUPLICATE_NUMBER')
  END;
END;
