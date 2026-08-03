-- WS01 Vietnam e-invoice compliance evidence on the canonical ERPNext E-Invoice Submission.
-- Transport/provider APIs remain owned by the integration layer. This migration only
-- strengthens the statutory contract and never creates a competing e-invoice ledger.

-- Add compliance fields to the existing canonical metadata without rewriting 0009.
UPDATE doctype_definitions
SET metadata_json=json_insert(metadata_json,'$.fields[#]',json('{"fieldname":"operation_type","label":"E-Invoice Operation","fieldtype":"Select","options":"Original\\nAdjustment\\nReplacement\\nCancellation","required":true,"default":"Original","in_list_view":true,"in_standard_filter":true}')),
    revision=revision+1,modified_by='migration',modified_at='2026-08-03T00:00:00.000Z'
WHERE doctype='E-Invoice Submission'
  AND NOT EXISTS(SELECT 1 FROM json_each(metadata_json,'$.fields') WHERE json_extract(value,'$.fieldname')='operation_type');

UPDATE doctype_definitions
SET metadata_json=json_insert(metadata_json,'$.fields[#]',json('{"fieldname":"prior_submission","label":"Prior E-Invoice Submission","fieldtype":"Link","options":"E-Invoice Submission"}')),
    revision=revision+1,modified_by='migration',modified_at='2026-08-03T00:00:00.000Z'
WHERE doctype='E-Invoice Submission'
  AND NOT EXISTS(SELECT 1 FROM json_each(metadata_json,'$.fields') WHERE json_extract(value,'$.fieldname')='prior_submission');

UPDATE doctype_definitions
SET metadata_json=json_insert(metadata_json,'$.fields[#]',json('{"fieldname":"legal_rule","label":"Legal Rule","fieldtype":"Link","options":"VN Legal Rule","required":true}')),
    revision=revision+1,modified_by='migration',modified_at='2026-08-03T00:00:00.000Z'
WHERE doctype='E-Invoice Submission'
  AND NOT EXISTS(SELECT 1 FROM json_each(metadata_json,'$.fields') WHERE json_extract(value,'$.fieldname')='legal_rule');

UPDATE doctype_definitions
SET metadata_json=json_insert(metadata_json,'$.fields[#]',json('{"fieldname":"tax_ruleset","label":"E-Invoice Ruleset","fieldtype":"Link","options":"VN Tax Ruleset","required":true}')),
    revision=revision+1,modified_by='migration',modified_at='2026-08-03T00:00:00.000Z'
WHERE doctype='E-Invoice Submission'
  AND NOT EXISTS(SELECT 1 FROM json_each(metadata_json,'$.fields') WHERE json_extract(value,'$.fieldname')='tax_ruleset');

UPDATE doctype_definitions
SET metadata_json=json_insert(metadata_json,'$.fields[#]',json('{"fieldname":"payload_hash","label":"Payload/XML SHA-256","fieldtype":"Data","read_only":true}')),
    revision=revision+1,modified_by='migration',modified_at='2026-08-03T00:00:00.000Z'
WHERE doctype='E-Invoice Submission'
  AND NOT EXISTS(SELECT 1 FROM json_each(metadata_json,'$.fields') WHERE json_extract(value,'$.fieldname')='payload_hash');

UPDATE doctype_definitions
SET metadata_json=json_insert(metadata_json,'$.fields[#]',json('{"fieldname":"signature_reference","label":"Digital Signature Reference","fieldtype":"Data","read_only":true}')),
    revision=revision+1,modified_by='migration',modified_at='2026-08-03T00:00:00.000Z'
WHERE doctype='E-Invoice Submission'
  AND NOT EXISTS(SELECT 1 FROM json_each(metadata_json,'$.fields') WHERE json_extract(value,'$.fieldname')='signature_reference');

UPDATE doctype_definitions
SET metadata_json=json_insert(metadata_json,'$.fields[#]',json('{"fieldname":"tax_authority_reference","label":"Tax Authority Reference","fieldtype":"Data","read_only":true}')),
    revision=revision+1,modified_by='migration',modified_at='2026-08-03T00:00:00.000Z'
WHERE doctype='E-Invoice Submission'
  AND NOT EXISTS(SELECT 1 FROM json_each(metadata_json,'$.fields') WHERE json_extract(value,'$.fieldname')='tax_authority_reference');

UPDATE doctype_definitions
SET metadata_json=json_insert(metadata_json,'$.fields[#]',json('{"fieldname":"response_evidence_json","label":"Provider/Authority Evidence","fieldtype":"Code","read_only":true,"default":"{}"}')),
    revision=revision+1,modified_by='migration',modified_at='2026-08-03T00:00:00.000Z'
WHERE doctype='E-Invoice Submission'
  AND NOT EXISTS(SELECT 1 FROM json_each(metadata_json,'$.fields') WHERE json_extract(value,'$.fieldname')='response_evidence_json');

-- Give the VN statutory roles explicit access to this external canonical document.
UPDATE doctype_definitions
SET metadata_json=json_insert(metadata_json,'$.permissions[#]',json('{"role":"Tax Specialist","read":true,"write":true,"create":true,"print":true,"report":true,"export":true}')),
    revision=revision+1,modified_by='migration',modified_at='2026-08-03T00:00:00.000Z'
WHERE doctype='E-Invoice Submission'
  AND NOT EXISTS(SELECT 1 FROM json_each(metadata_json,'$.permissions') WHERE json_extract(value,'$.role')='Tax Specialist');

UPDATE doctype_definitions
SET metadata_json=json_insert(metadata_json,'$.permissions[#]',json('{"role":"Chief Accountant","read":true,"write":true,"create":true,"submit":true,"print":true,"report":true,"export":true,"share":true}')),
    revision=revision+1,modified_by='migration',modified_at='2026-08-03T00:00:00.000Z'
WHERE doctype='E-Invoice Submission'
  AND NOT EXISTS(SELECT 1 FROM json_each(metadata_json,'$.permissions') WHERE json_extract(value,'$.role')='Chief Accountant');

UPDATE doctype_definitions
SET metadata_json=json_insert(metadata_json,'$.permissions[#]',json('{"role":"Internal Auditor","read":true,"print":true,"report":true,"export":true}')),
    revision=revision+1,modified_by='migration',modified_at='2026-08-03T00:00:00.000Z'
WHERE doctype='E-Invoice Submission'
  AND NOT EXISTS(SELECT 1 FROM json_each(metadata_json,'$.permissions') WHERE json_extract(value,'$.role')='Internal Auditor');

DROP TRIGGER IF EXISTS vn_einvoice_compliance_insert_guard;
DROP TRIGGER IF EXISTS vn_einvoice_compliance_update_guard;

CREATE TRIGGER vn_einvoice_compliance_insert_guard
BEFORE INSERT ON documents
WHEN NEW.doctype='E-Invoice Submission' AND NEW.docstatus=1
BEGIN
  SELECT CASE
    WHEN COALESCE(json_extract(NEW.payload_json,'$.operation_type'),'') NOT IN ('Original','Adjustment','Replacement','Cancellation')
      THEN RAISE(ABORT,'VN_EINVOICE_OPERATION_INVALID')
    WHEN json_extract(NEW.payload_json,'$.operation_type')='Original'
      AND COALESCE(json_extract(NEW.payload_json,'$.prior_submission'),'')<>''
      THEN RAISE(ABORT,'VN_EINVOICE_ORIGINAL_HAS_PRIOR')
    WHEN json_extract(NEW.payload_json,'$.operation_type')<>'Original'
      AND NOT EXISTS(
        SELECT 1 FROM documents p
        WHERE p.tenant_id=NEW.tenant_id AND p.doctype='E-Invoice Submission'
          AND p.name=json_extract(NEW.payload_json,'$.prior_submission') AND p.docstatus=1
          AND COALESCE(json_extract(p.payload_json,'$.company'),'')=COALESCE(json_extract(NEW.payload_json,'$.company'),'')
      ) THEN RAISE(ABORT,'VN_EINVOICE_PRIOR_SUBMISSION_REQUIRED')
    WHEN NOT EXISTS(
      SELECT 1 FROM documents r
      WHERE r.tenant_id=NEW.tenant_id AND r.doctype='VN Legal Rule'
        AND r.name=json_extract(NEW.payload_json,'$.legal_rule') AND r.docstatus=1
        AND json_extract(r.payload_json,'$.rule_type')='E-Invoice'
        AND date(json_extract(r.payload_json,'$.effective_from'))<=date(json_extract(NEW.payload_json,'$.posting_at'))
        AND date(COALESCE(NULLIF(json_extract(r.payload_json,'$.effective_to'),''),'9999-12-31'))>=date(json_extract(NEW.payload_json,'$.posting_at'))
    ) THEN RAISE(ABORT,'VN_EINVOICE_LEGAL_RULE_REQUIRED')
    WHEN NOT EXISTS(
      SELECT 1 FROM documents t
      WHERE t.tenant_id=NEW.tenant_id AND t.doctype='VN Tax Ruleset'
        AND t.name=json_extract(NEW.payload_json,'$.tax_ruleset') AND t.docstatus=1
        AND json_extract(t.payload_json,'$.company')=json_extract(NEW.payload_json,'$.company')
        AND json_extract(t.payload_json,'$.rule_type')='E-Invoice'
        AND json_extract(t.payload_json,'$.legal_rule')=json_extract(NEW.payload_json,'$.legal_rule')
        AND date(json_extract(t.payload_json,'$.effective_from'))<=date(json_extract(NEW.payload_json,'$.posting_at'))
        AND date(COALESCE(NULLIF(json_extract(t.payload_json,'$.effective_to'),''),'9999-12-31'))>=date(json_extract(NEW.payload_json,'$.posting_at'))
    ) THEN RAISE(ABORT,'VN_EINVOICE_RULESET_REQUIRED')
  END;
END;

CREATE TRIGGER vn_einvoice_compliance_update_guard
BEFORE UPDATE ON documents
WHEN NEW.doctype='E-Invoice Submission' AND NEW.docstatus=1
BEGIN
  SELECT CASE
    WHEN COALESCE(json_extract(NEW.payload_json,'$.operation_type'),'') NOT IN ('Original','Adjustment','Replacement','Cancellation')
      THEN RAISE(ABORT,'VN_EINVOICE_OPERATION_INVALID')
    WHEN json_extract(NEW.payload_json,'$.operation_type')='Original'
      AND COALESCE(json_extract(NEW.payload_json,'$.prior_submission'),'')<>''
      THEN RAISE(ABORT,'VN_EINVOICE_ORIGINAL_HAS_PRIOR')
    WHEN json_extract(NEW.payload_json,'$.operation_type')<>'Original'
      AND NOT EXISTS(
        SELECT 1 FROM documents p
        WHERE p.tenant_id=NEW.tenant_id AND p.doctype='E-Invoice Submission'
          AND p.name=json_extract(NEW.payload_json,'$.prior_submission') AND p.docstatus=1
          AND p.doc_key<>NEW.doc_key
          AND COALESCE(json_extract(p.payload_json,'$.company'),'')=COALESCE(json_extract(NEW.payload_json,'$.company'),'')
      ) THEN RAISE(ABORT,'VN_EINVOICE_PRIOR_SUBMISSION_REQUIRED')
    WHEN NOT EXISTS(
      SELECT 1 FROM documents r
      WHERE r.tenant_id=NEW.tenant_id AND r.doctype='VN Legal Rule'
        AND r.name=json_extract(NEW.payload_json,'$.legal_rule') AND r.docstatus=1
        AND json_extract(r.payload_json,'$.rule_type')='E-Invoice'
        AND date(json_extract(r.payload_json,'$.effective_from'))<=date(json_extract(NEW.payload_json,'$.posting_at'))
        AND date(COALESCE(NULLIF(json_extract(r.payload_json,'$.effective_to'),''),'9999-12-31'))>=date(json_extract(NEW.payload_json,'$.posting_at'))
    ) THEN RAISE(ABORT,'VN_EINVOICE_LEGAL_RULE_REQUIRED')
    WHEN NOT EXISTS(
      SELECT 1 FROM documents t
      WHERE t.tenant_id=NEW.tenant_id AND t.doctype='VN Tax Ruleset'
        AND t.name=json_extract(NEW.payload_json,'$.tax_ruleset') AND t.docstatus=1
        AND json_extract(t.payload_json,'$.company')=json_extract(NEW.payload_json,'$.company')
        AND json_extract(t.payload_json,'$.rule_type')='E-Invoice'
        AND json_extract(t.payload_json,'$.legal_rule')=json_extract(NEW.payload_json,'$.legal_rule')
        AND date(json_extract(t.payload_json,'$.effective_from'))<=date(json_extract(NEW.payload_json,'$.posting_at'))
        AND date(COALESCE(NULLIF(json_extract(t.payload_json,'$.effective_to'),''),'9999-12-31'))>=date(json_extract(NEW.payload_json,'$.posting_at'))
    ) THEN RAISE(ABORT,'VN_EINVOICE_RULESET_REQUIRED')
    WHEN COALESCE(json_extract(NEW.payload_json,'$.submission_status'),'Queued') IN ('Submitted','Accepted','Rejected','Cancelled')
      AND (
        length(trim(COALESCE(json_extract(NEW.payload_json,'$.payload_hash'),'')))<>64
        OR trim(COALESCE(json_extract(NEW.payload_json,'$.payload_hash'),'')) GLOB '*[^0-9A-Fa-f]*'
        OR json_valid(COALESCE(json_extract(NEW.payload_json,'$.response_evidence_json'),''))=0
        OR json_extract(NEW.payload_json,'$.response_evidence_json') IN ('{}','[]','null','')
      ) THEN RAISE(ABORT,'VN_EINVOICE_RESPONSE_EVIDENCE_REQUIRED')
  END;
END;
