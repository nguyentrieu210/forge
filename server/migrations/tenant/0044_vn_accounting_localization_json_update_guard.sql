-- Close the draft-update bypass left by migration 0043: JSON-bearing legal
-- configuration must remain parseable on every payload update, not only INSERT.

DROP TRIGGER IF EXISTS vn_accounting_localization_json_update_guard;

CREATE TRIGGER vn_accounting_localization_json_update_guard
BEFORE UPDATE OF payload_json ON documents
WHEN NEW.doctype IN (
  'TT99 Account Map',
  'TT99 Voucher Form',
  'TT99 Book Form',
  'TT99 Financial Statement Template',
  'TT99 Transition Map',
  'Tax Ruleset'
)
AND NEW.docstatus<>2
AND NEW.payload_json IS NOT OLD.payload_json
BEGIN
  SELECT CASE
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
  END;
END;
