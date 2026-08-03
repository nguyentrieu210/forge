-- WS01 Finance Budget submission-path closure.
-- 0052 established the documents and primary INSERT invariants. Real form submission
-- is usually UPDATE draft -> submitted, so repeat all authoritative cap/source checks here.

DROP TRIGGER IF EXISTS finance_budget_update_submission_closure;
DROP TRIGGER IF EXISTS finance_budget_revision_update_submission_closure;
DROP TRIGGER IF EXISTS finance_budget_commitment_insert_source_scope_guard;
DROP TRIGGER IF EXISTS finance_budget_commitment_update_submission_closure;

CREATE TRIGGER finance_budget_update_submission_closure
BEFORE UPDATE ON documents
WHEN NEW.doctype='Finance Budget' AND OLD.docstatus<>1 AND NEW.docstatus=1
BEGIN
  SELECT CASE
    WHEN COALESCE(json_extract(NEW.payload_json,'$.scope_key'),'')=''
      OR COALESCE(json_extract(NEW.payload_json,'$.currency'),'')=''
      OR COALESCE(CAST(json_extract(NEW.payload_json,'$.currency_scale') AS INTEGER),-1) NOT BETWEEN 0 AND 6
      THEN RAISE(ABORT,'FINANCE_BUDGET_SCOPE_OR_CURRENCY_INVALID')
    WHEN COALESCE(json_extract(NEW.payload_json,'$.budget_against'),'')='Company'
      AND json_extract(NEW.payload_json,'$.scope_key')<>'Company:*'
      THEN RAISE(ABORT,'FINANCE_BUDGET_SCOPE_INVALID')
    WHEN COALESCE(json_extract(NEW.payload_json,'$.budget_against'),'')='Cost Center'
      AND json_extract(NEW.payload_json,'$.scope_key')<>('Cost Center:' || COALESCE(json_extract(NEW.payload_json,'$.cost_center'),''))
      THEN RAISE(ABORT,'FINANCE_BUDGET_SCOPE_INVALID')
    WHEN COALESCE(json_extract(NEW.payload_json,'$.budget_against'),'')='Project'
      AND json_extract(NEW.payload_json,'$.scope_key')<>('Project:' || COALESCE(json_extract(NEW.payload_json,'$.project'),''))
      THEN RAISE(ABORT,'FINANCE_BUDGET_SCOPE_INVALID')
    WHEN COALESCE(json_extract(NEW.payload_json,'$.budget_against'),'')='Branch'
      AND json_extract(NEW.payload_json,'$.scope_key')<>('Branch:' || COALESCE(json_extract(NEW.payload_json,'$.branch'),''))
      THEN RAISE(ABORT,'FINANCE_BUDGET_SCOPE_INVALID')
  END;
END;

CREATE TRIGGER finance_budget_revision_update_submission_closure
BEFORE UPDATE ON documents
WHEN NEW.doctype='Finance Budget Revision' AND OLD.docstatus<>1 AND NEW.docstatus=1
BEGIN
  SELECT CASE
    WHEN NOT EXISTS(
      SELECT 1 FROM documents b
      WHERE b.tenant_id=NEW.tenant_id AND b.doctype='Finance Budget'
        AND b.name=json_extract(NEW.payload_json,'$.budget') AND b.docstatus=1
        AND date(json_extract(NEW.payload_json,'$.posting_date'))
          BETWEEN date(json_extract(b.payload_json,'$.start_date')) AND date(json_extract(b.payload_json,'$.end_date'))
    ) THEN RAISE(ABORT,'FINANCE_BUDGET_REVISION_PERIOD_INVALID')
    WHEN (
      SELECT CAST(json_extract(b.payload_json,'$.budget_amount_minor') AS INTEGER)
        + COALESCE((
          SELECT SUM(CAST(json_extract(r.payload_json,'$.delta_amount_minor') AS INTEGER))
          FROM documents r
          WHERE r.tenant_id=NEW.tenant_id AND r.doctype='Finance Budget Revision' AND r.docstatus=1
            AND json_extract(r.payload_json,'$.budget')=b.name AND r.doc_key<>OLD.doc_key
        ),0)
        + CAST(json_extract(NEW.payload_json,'$.delta_amount_minor') AS INTEGER)
      FROM documents b
      WHERE b.tenant_id=NEW.tenant_id AND b.doctype='Finance Budget'
        AND b.name=json_extract(NEW.payload_json,'$.budget') AND b.docstatus=1
    ) < 0 THEN RAISE(ABORT,'FINANCE_BUDGET_REVISION_NEGATIVE_RESULT')
    WHEN (
      SELECT COALESCE(SUM(
        CASE json_extract(c.payload_json,'$.commitment_type')
          WHEN 'Reserve' THEN CAST(json_extract(c.payload_json,'$.amount_minor') AS INTEGER)
          ELSE -CAST(json_extract(c.payload_json,'$.amount_minor') AS INTEGER)
        END
      ),0)
      FROM documents c
      WHERE c.tenant_id=NEW.tenant_id AND c.doctype='Finance Budget Commitment' AND c.docstatus=1
        AND json_extract(c.payload_json,'$.budget')=json_extract(NEW.payload_json,'$.budget')
    ) > (
      SELECT CAST(json_extract(b.payload_json,'$.budget_amount_minor') AS INTEGER)
        + COALESCE((
          SELECT SUM(CAST(json_extract(r.payload_json,'$.delta_amount_minor') AS INTEGER))
          FROM documents r
          WHERE r.tenant_id=NEW.tenant_id AND r.doctype='Finance Budget Revision' AND r.docstatus=1
            AND json_extract(r.payload_json,'$.budget')=b.name AND r.doc_key<>OLD.doc_key
        ),0)
        + CAST(json_extract(NEW.payload_json,'$.delta_amount_minor') AS INTEGER)
      FROM documents b
      WHERE b.tenant_id=NEW.tenant_id AND b.doctype='Finance Budget'
        AND b.name=json_extract(NEW.payload_json,'$.budget') AND b.docstatus=1
    ) THEN RAISE(ABORT,'FINANCE_BUDGET_REVISION_BELOW_COMMITMENTS')
  END;
END;

CREATE TRIGGER finance_budget_commitment_insert_source_scope_guard
BEFORE INSERT ON documents
WHEN NEW.doctype='Finance Budget Commitment' AND NEW.docstatus=1
BEGIN
  SELECT CASE
    WHEN NOT EXISTS(
      SELECT 1 FROM documents b
      WHERE b.tenant_id=NEW.tenant_id AND b.doctype='Finance Budget'
        AND b.name=json_extract(NEW.payload_json,'$.budget') AND b.docstatus=1
        AND date(json_extract(NEW.payload_json,'$.posting_date'))
          BETWEEN date(json_extract(b.payload_json,'$.start_date')) AND date(json_extract(b.payload_json,'$.end_date'))
    ) THEN RAISE(ABORT,'FINANCE_BUDGET_COMMITMENT_PERIOD_INVALID')
    WHEN EXISTS(
      SELECT 1
      FROM documents b
      JOIN documents s ON s.tenant_id=b.tenant_id
        AND s.doctype=json_extract(NEW.payload_json,'$.source_doctype')
        AND s.name=json_extract(NEW.payload_json,'$.source_name') AND s.docstatus=1
      WHERE b.tenant_id=NEW.tenant_id AND b.doctype='Finance Budget'
        AND b.name=json_extract(NEW.payload_json,'$.budget') AND b.docstatus=1
        AND COALESCE(json_extract(s.payload_json,'$.company'),'')<>''
        AND json_extract(s.payload_json,'$.company')<>json_extract(b.payload_json,'$.company')
    ) THEN RAISE(ABORT,'FINANCE_BUDGET_SOURCE_COMPANY_MISMATCH')
  END;
END;

CREATE TRIGGER finance_budget_commitment_update_submission_closure
BEFORE UPDATE ON documents
WHEN NEW.doctype='Finance Budget Commitment' AND OLD.docstatus<>1 AND NEW.docstatus=1
BEGIN
  SELECT CASE
    WHEN NOT EXISTS(
      SELECT 1 FROM documents b
      WHERE b.tenant_id=NEW.tenant_id AND b.doctype='Finance Budget'
        AND b.name=json_extract(NEW.payload_json,'$.budget') AND b.docstatus=1
        AND date(json_extract(NEW.payload_json,'$.posting_date'))
          BETWEEN date(json_extract(b.payload_json,'$.start_date')) AND date(json_extract(b.payload_json,'$.end_date'))
    ) THEN RAISE(ABORT,'FINANCE_BUDGET_COMMITMENT_PERIOD_INVALID')
    WHEN EXISTS(
      SELECT 1
      FROM documents b
      JOIN documents s ON s.tenant_id=b.tenant_id
        AND s.doctype=json_extract(NEW.payload_json,'$.source_doctype')
        AND s.name=json_extract(NEW.payload_json,'$.source_name') AND s.docstatus=1
      WHERE b.tenant_id=NEW.tenant_id AND b.doctype='Finance Budget'
        AND b.name=json_extract(NEW.payload_json,'$.budget') AND b.docstatus=1
        AND COALESCE(json_extract(s.payload_json,'$.company'),'')<>''
        AND json_extract(s.payload_json,'$.company')<>json_extract(b.payload_json,'$.company')
    ) THEN RAISE(ABORT,'FINANCE_BUDGET_SOURCE_COMPANY_MISMATCH')
    WHEN json_extract(NEW.payload_json,'$.commitment_type')='Release' AND (
      SELECT COALESCE(SUM(
        CASE json_extract(c.payload_json,'$.commitment_type')
          WHEN 'Reserve' THEN CAST(json_extract(c.payload_json,'$.amount_minor') AS INTEGER)
          ELSE -CAST(json_extract(c.payload_json,'$.amount_minor') AS INTEGER)
        END
      ),0)
      FROM documents c
      WHERE c.tenant_id=NEW.tenant_id AND c.doctype='Finance Budget Commitment' AND c.docstatus=1
        AND c.doc_key<>OLD.doc_key
        AND json_extract(c.payload_json,'$.budget')=json_extract(NEW.payload_json,'$.budget')
        AND json_extract(c.payload_json,'$.source_doctype')=json_extract(NEW.payload_json,'$.source_doctype')
        AND json_extract(c.payload_json,'$.source_name')=json_extract(NEW.payload_json,'$.source_name')
    ) < CAST(json_extract(NEW.payload_json,'$.amount_minor') AS INTEGER)
      THEN RAISE(ABORT,'FINANCE_BUDGET_RELEASE_EXCEEDS_SOURCE')
    WHEN (
      SELECT COALESCE(SUM(
        CASE json_extract(c.payload_json,'$.commitment_type')
          WHEN 'Reserve' THEN CAST(json_extract(c.payload_json,'$.amount_minor') AS INTEGER)
          ELSE -CAST(json_extract(c.payload_json,'$.amount_minor') AS INTEGER)
        END
      ),0)
      FROM documents c
      WHERE c.tenant_id=NEW.tenant_id AND c.doctype='Finance Budget Commitment' AND c.docstatus=1
        AND c.doc_key<>OLD.doc_key
        AND json_extract(c.payload_json,'$.budget')=json_extract(NEW.payload_json,'$.budget')
    ) + CASE json_extract(NEW.payload_json,'$.commitment_type')
          WHEN 'Reserve' THEN CAST(json_extract(NEW.payload_json,'$.amount_minor') AS INTEGER)
          ELSE -CAST(json_extract(NEW.payload_json,'$.amount_minor') AS INTEGER)
        END < 0
      THEN RAISE(ABORT,'FINANCE_BUDGET_COMMITMENT_NEGATIVE')
    WHEN COALESCE((
      SELECT json_extract(b.payload_json,'$.control_action') FROM documents b
      WHERE b.tenant_id=NEW.tenant_id AND b.doctype='Finance Budget'
        AND b.name=json_extract(NEW.payload_json,'$.budget') AND b.docstatus=1
    ),'Stop')='Stop'
      AND (
        SELECT COALESCE(SUM(
          CASE json_extract(c.payload_json,'$.commitment_type')
            WHEN 'Reserve' THEN CAST(json_extract(c.payload_json,'$.amount_minor') AS INTEGER)
            ELSE -CAST(json_extract(c.payload_json,'$.amount_minor') AS INTEGER)
          END
        ),0)
        FROM documents c
        WHERE c.tenant_id=NEW.tenant_id AND c.doctype='Finance Budget Commitment' AND c.docstatus=1
          AND c.doc_key<>OLD.doc_key
          AND json_extract(c.payload_json,'$.budget')=json_extract(NEW.payload_json,'$.budget')
      ) + CASE json_extract(NEW.payload_json,'$.commitment_type')
            WHEN 'Reserve' THEN CAST(json_extract(NEW.payload_json,'$.amount_minor') AS INTEGER)
            ELSE -CAST(json_extract(NEW.payload_json,'$.amount_minor') AS INTEGER)
          END > (
        SELECT CAST(json_extract(b.payload_json,'$.budget_amount_minor') AS INTEGER)
          + COALESCE((
            SELECT SUM(CAST(json_extract(r.payload_json,'$.delta_amount_minor') AS INTEGER))
            FROM documents r
            WHERE r.tenant_id=NEW.tenant_id AND r.doctype='Finance Budget Revision' AND r.docstatus=1
              AND json_extract(r.payload_json,'$.budget')=b.name
          ),0)
        FROM documents b
        WHERE b.tenant_id=NEW.tenant_id AND b.doctype='Finance Budget'
          AND b.name=json_extract(NEW.payload_json,'$.budget') AND b.docstatus=1
      ) THEN RAISE(ABORT,'FINANCE_BUDGET_COMMITMENT_EXCEEDED')
  END;
END;
