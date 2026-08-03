-- WS01 deterministic tax DSL version gate.
-- 0049 validates JSON/evidence/effective ranges; 0051 freezes the machine-readable
-- formula contract to schema v1 so future evaluator versions cannot reinterpret history.

DROP TRIGGER IF EXISTS vn_tax_ruleset_dsl_insert_guard;
DROP TRIGGER IF EXISTS vn_tax_ruleset_dsl_update_guard;

CREATE TRIGGER vn_tax_ruleset_dsl_insert_guard
BEFORE INSERT ON documents
WHEN NEW.doctype='VN Tax Ruleset' AND NEW.docstatus<>2
BEGIN
  SELECT CASE
    WHEN COALESCE(CAST(json_extract(NEW.payload_json,'$.schema_version') AS INTEGER),0)<>1
      THEN RAISE(ABORT,'VN_TAX_RULESET_SCHEMA_VERSION_UNSUPPORTED')
    WHEN json_valid(COALESCE(json_extract(NEW.payload_json,'$.expression_json'),''))=0
      OR COALESCE(CAST(json_extract(json_extract(NEW.payload_json,'$.expression_json'),'$.version') AS INTEGER),0)<>1
      THEN RAISE(ABORT,'VN_TAX_RULESET_EXPRESSION_VERSION_UNSUPPORTED')
  END;
END;

CREATE TRIGGER vn_tax_ruleset_dsl_update_guard
BEFORE UPDATE ON documents
WHEN NEW.doctype='VN Tax Ruleset' AND OLD.docstatus<>1 AND NEW.docstatus<>2
BEGIN
  SELECT CASE
    WHEN COALESCE(CAST(json_extract(NEW.payload_json,'$.schema_version') AS INTEGER),0)<>1
      THEN RAISE(ABORT,'VN_TAX_RULESET_SCHEMA_VERSION_UNSUPPORTED')
    WHEN json_valid(COALESCE(json_extract(NEW.payload_json,'$.expression_json'),''))=0
      OR COALESCE(CAST(json_extract(json_extract(NEW.payload_json,'$.expression_json'),'$.version') AS INTEGER),0)<>1
      THEN RAISE(ABORT,'VN_TAX_RULESET_EXPRESSION_VERSION_UNSUPPORTED')
  END;
END;
