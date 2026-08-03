-- WS01 Finance Budget / Revision / Commitment foundation.
-- Generic finance capability, not Vietnam-specific. Money is authoritative company-currency
-- minor units. Budget revisions and commitments are documents, not a competing GL.

INSERT OR IGNORE INTO doctype_definitions(tenant_id,doctype,module,is_custom,is_submittable,is_child,revision,metadata_json,disabled,modified_by,modified_at)
VALUES('demo','Finance Budget','Accounts',0,1,0,1,'{"name":"Finance Budget","module":"Accounts","is_submittable":true,"track_changes":true,"autoname":"BUDGET-.YYYY.-#####","title_field":"account","sort_field":"start_date","sort_order":"DESC","revision":1,"fields":[{"fieldname":"company","label":"Company","fieldtype":"Link","options":"Company","required":true,"in_list_view":true,"in_standard_filter":true},{"fieldname":"account","label":"Account","fieldtype":"Link","options":"Account","required":true,"in_list_view":true,"in_standard_filter":true},{"fieldname":"budget_against","label":"Budget Against","fieldtype":"Select","options":"Company\nCost Center\nProject\nBranch","required":true,"default":"Cost Center","in_list_view":true,"in_standard_filter":true},{"fieldname":"cost_center","label":"Cost Center","fieldtype":"Link","options":"Cost Center","depends_on":"eval:doc.budget_against==\"Cost Center\""},{"fieldname":"project","label":"Project","fieldtype":"Link","options":"Project","depends_on":"eval:doc.budget_against==\"Project\""},{"fieldname":"branch","label":"Branch","fieldtype":"Link","options":"Branch","depends_on":"eval:doc.budget_against==\"Branch\""},{"fieldname":"start_date","label":"Start Date","fieldtype":"Date","required":true,"in_list_view":true},{"fieldname":"end_date","label":"End Date","fieldtype":"Date","required":true,"in_list_view":true},{"fieldname":"budget_amount","label":"Budget Amount","fieldtype":"Currency","required":true,"in_list_view":true},{"fieldname":"control_action","label":"Commitment Control","fieldtype":"Select","options":"Stop\nWarn\nIgnore","required":true,"default":"Stop","in_list_view":true},{"fieldname":"note","label":"Note","fieldtype":"Small Text"},{"fieldname":"currency","label":"Company Currency","fieldtype":"Link","options":"Currency","read_only":true},{"fieldname":"currency_scale","label":"Currency Scale","fieldtype":"Int","read_only":true,"hidden":true},{"fieldname":"budget_amount_minor","label":"Budget Minor Units","fieldtype":"Int","read_only":true,"hidden":true},{"fieldname":"scope_key","label":"Scope Key","fieldtype":"Data","read_only":true,"hidden":true}],"permissions":[{"role":"Accounts User","read":true,"write":true,"create":true,"print":true,"report":true,"export":true},{"role":"Accounts Manager","read":true,"write":true,"create":true,"submit":true,"cancel":true,"print":true,"report":true,"export":true,"share":true},{"role":"Chief Accountant","read":true,"write":true,"create":true,"submit":true,"cancel":true,"print":true,"report":true,"export":true,"share":true},{"role":"Purchase Manager","read":true,"report":true},{"role":"Internal Auditor","read":true,"report":true,"export":true},{"role":"System Manager","read":true,"write":true,"create":true,"submit":true,"cancel":true,"print":true,"report":true,"export":true,"share":true}],"custom":false}',0,'migration','2026-08-03T00:00:00.000Z');

INSERT OR IGNORE INTO doctype_definitions(tenant_id,doctype,module,is_custom,is_submittable,is_child,revision,metadata_json,disabled,modified_by,modified_at)
VALUES('demo','Finance Budget Revision','Accounts',0,1,0,1,'{"name":"Finance Budget Revision","module":"Accounts","is_submittable":true,"track_changes":true,"autoname":"BUDREV-.YYYY.-#####","title_field":"budget","sort_field":"posting_date","sort_order":"DESC","revision":1,"fields":[{"fieldname":"budget","label":"Budget","fieldtype":"Link","options":"Finance Budget","required":true,"in_list_view":true,"in_standard_filter":true},{"fieldname":"posting_date","label":"Posting Date","fieldtype":"Date","required":true,"in_list_view":true},{"fieldname":"delta_amount","label":"Revision Amount (+/-)","fieldtype":"Currency","required":true,"in_list_view":true},{"fieldname":"reason","label":"Reason","fieldtype":"Small Text","required":true},{"fieldname":"currency","label":"Currency","fieldtype":"Link","options":"Currency","read_only":true},{"fieldname":"currency_scale","label":"Currency Scale","fieldtype":"Int","read_only":true,"hidden":true},{"fieldname":"delta_amount_minor","label":"Revision Minor Units","fieldtype":"Int","read_only":true,"hidden":true},{"fieldname":"resulting_budget_amount","label":"Resulting Budget","fieldtype":"Currency","read_only":true,"in_list_view":true},{"fieldname":"resulting_budget_amount_minor","label":"Resulting Budget Minor Units","fieldtype":"Int","read_only":true,"hidden":true}],"permissions":[{"role":"Accounts User","read":true,"write":true,"create":true,"print":true,"report":true,"export":true},{"role":"Accounts Manager","read":true,"write":true,"create":true,"submit":true,"cancel":true,"print":true,"report":true,"export":true,"share":true},{"role":"Chief Accountant","read":true,"write":true,"create":true,"submit":true,"cancel":true,"print":true,"report":true,"export":true,"share":true},{"role":"Internal Auditor","read":true,"report":true,"export":true},{"role":"System Manager","read":true,"write":true,"create":true,"submit":true,"cancel":true,"print":true,"report":true,"export":true,"share":true}],"custom":false}',0,'migration','2026-08-03T00:00:00.000Z');

INSERT OR IGNORE INTO doctype_definitions(tenant_id,doctype,module,is_custom,is_submittable,is_child,revision,metadata_json,disabled,modified_by,modified_at)
VALUES('demo','Finance Budget Commitment','Accounts',0,1,0,1,'{"name":"Finance Budget Commitment","module":"Accounts","is_submittable":true,"track_changes":true,"autoname":"BUDCOM-.YYYY.-#####","title_field":"source_name","sort_field":"posting_date","sort_order":"DESC","revision":1,"fields":[{"fieldname":"budget","label":"Budget","fieldtype":"Link","options":"Finance Budget","required":true,"in_list_view":true,"in_standard_filter":true},{"fieldname":"posting_date","label":"Posting Date","fieldtype":"Date","required":true,"in_list_view":true},{"fieldname":"commitment_type","label":"Type","fieldtype":"Select","options":"Reserve\nRelease","required":true,"default":"Reserve","in_list_view":true,"in_standard_filter":true},{"fieldname":"amount","label":"Amount","fieldtype":"Currency","required":true,"in_list_view":true},{"fieldname":"source_doctype","label":"Source Type","fieldtype":"Select","options":"Material Request\nPurchase Order\nExpense Claim","required":true,"in_list_view":true},{"fieldname":"source_name","label":"Source Document","fieldtype":"Dynamic Link","options":"source_doctype","required":true,"in_list_view":true,"search_index":true},{"fieldname":"reason","label":"Reason","fieldtype":"Small Text"},{"fieldname":"currency","label":"Currency","fieldtype":"Link","options":"Currency","read_only":true},{"fieldname":"currency_scale","label":"Currency Scale","fieldtype":"Int","read_only":true,"hidden":true},{"fieldname":"amount_minor","label":"Amount Minor Units","fieldtype":"Int","read_only":true,"hidden":true},{"fieldname":"effective_budget_amount","label":"Effective Budget","fieldtype":"Currency","read_only":true},{"fieldname":"committed_after","label":"Committed After","fieldtype":"Currency","read_only":true},{"fieldname":"available_after","label":"Available After","fieldtype":"Currency","read_only":true},{"fieldname":"budget_exceeded","label":"Budget Exceeded","fieldtype":"Check","read_only":true,"in_list_view":true},{"fieldname":"exceeded_by_minor","label":"Exceeded Minor Units","fieldtype":"Int","read_only":true,"hidden":true}],"permissions":[{"role":"Accounts User","read":true,"write":true,"create":true,"print":true,"report":true,"export":true},{"role":"Accounts Manager","read":true,"write":true,"create":true,"submit":true,"cancel":true,"print":true,"report":true,"export":true,"share":true},{"role":"Chief Accountant","read":true,"write":true,"create":true,"submit":true,"cancel":true,"print":true,"report":true,"export":true,"share":true},{"role":"Purchase User","read":true,"write":true,"create":true,"print":true,"report":true},{"role":"Purchase Manager","read":true,"write":true,"create":true,"submit":true,"cancel":true,"print":true,"report":true,"export":true},{"role":"Internal Auditor","read":true,"report":true,"export":true},{"role":"System Manager","read":true,"write":true,"create":true,"submit":true,"cancel":true,"print":true,"report":true,"export":true,"share":true}],"custom":false}',0,'migration','2026-08-03T00:00:00.000Z');

DROP TRIGGER IF EXISTS finance_budget_submit_guard;
DROP TRIGGER IF EXISTS finance_budget_update_guard;
DROP TRIGGER IF EXISTS finance_budget_immutable_update_guard;
DROP TRIGGER IF EXISTS finance_budget_immutable_delete_guard;
DROP TRIGGER IF EXISTS finance_budget_revision_submit_guard;
DROP TRIGGER IF EXISTS finance_budget_revision_update_guard;
DROP TRIGGER IF EXISTS finance_budget_revision_immutable_update_guard;
DROP TRIGGER IF EXISTS finance_budget_revision_immutable_delete_guard;
DROP TRIGGER IF EXISTS finance_budget_commitment_submit_guard;
DROP TRIGGER IF EXISTS finance_budget_commitment_update_guard;
DROP TRIGGER IF EXISTS finance_budget_commitment_immutable_update_guard;
DROP TRIGGER IF EXISTS finance_budget_commitment_immutable_delete_guard;

CREATE TRIGGER finance_budget_submit_guard
BEFORE INSERT ON documents
WHEN NEW.doctype='Finance Budget' AND NEW.docstatus=1
BEGIN
  SELECT CASE
    WHEN date(json_extract(NEW.payload_json,'$.start_date')) IS NULL
      OR date(json_extract(NEW.payload_json,'$.end_date')) IS NULL
      OR date(json_extract(NEW.payload_json,'$.start_date'))>date(json_extract(NEW.payload_json,'$.end_date'))
      THEN RAISE(ABORT,'FINANCE_BUDGET_INVALID_RANGE')
    WHEN COALESCE(CAST(json_extract(NEW.payload_json,'$.budget_amount_minor') AS INTEGER),0)<=0
      THEN RAISE(ABORT,'FINANCE_BUDGET_AMOUNT_INVALID')
    WHEN COALESCE(json_extract(NEW.payload_json,'$.scope_key'),'')=''
      OR COALESCE(json_extract(NEW.payload_json,'$.currency'),'')=''
      OR COALESCE(CAST(json_extract(NEW.payload_json,'$.currency_scale') AS INTEGER),-1) NOT BETWEEN 0 AND 6
      THEN RAISE(ABORT,'FINANCE_BUDGET_SCOPE_OR_CURRENCY_INVALID')
    WHEN EXISTS(
      SELECT 1 FROM documents b
      WHERE b.tenant_id=NEW.tenant_id AND b.doctype='Finance Budget' AND b.docstatus=1
        AND json_extract(b.payload_json,'$.company')=json_extract(NEW.payload_json,'$.company')
        AND json_extract(b.payload_json,'$.account')=json_extract(NEW.payload_json,'$.account')
        AND json_extract(b.payload_json,'$.scope_key')=json_extract(NEW.payload_json,'$.scope_key')
        AND date(json_extract(b.payload_json,'$.start_date'))<=date(json_extract(NEW.payload_json,'$.end_date'))
        AND date(json_extract(b.payload_json,'$.end_date'))>=date(json_extract(NEW.payload_json,'$.start_date'))
    ) THEN RAISE(ABORT,'FINANCE_BUDGET_OVERLAP')
  END;
END;

CREATE TRIGGER finance_budget_update_guard
BEFORE UPDATE ON documents
WHEN NEW.doctype='Finance Budget' AND OLD.docstatus<>1 AND NEW.docstatus=1
BEGIN
  SELECT CASE
    WHEN date(json_extract(NEW.payload_json,'$.start_date')) IS NULL
      OR date(json_extract(NEW.payload_json,'$.end_date')) IS NULL
      OR date(json_extract(NEW.payload_json,'$.start_date'))>date(json_extract(NEW.payload_json,'$.end_date'))
      THEN RAISE(ABORT,'FINANCE_BUDGET_INVALID_RANGE')
    WHEN COALESCE(CAST(json_extract(NEW.payload_json,'$.budget_amount_minor') AS INTEGER),0)<=0
      THEN RAISE(ABORT,'FINANCE_BUDGET_AMOUNT_INVALID')
    WHEN EXISTS(
      SELECT 1 FROM documents b
      WHERE b.tenant_id=NEW.tenant_id AND b.doctype='Finance Budget' AND b.docstatus=1 AND b.doc_key<>OLD.doc_key
        AND json_extract(b.payload_json,'$.company')=json_extract(NEW.payload_json,'$.company')
        AND json_extract(b.payload_json,'$.account')=json_extract(NEW.payload_json,'$.account')
        AND json_extract(b.payload_json,'$.scope_key')=json_extract(NEW.payload_json,'$.scope_key')
        AND date(json_extract(b.payload_json,'$.start_date'))<=date(json_extract(NEW.payload_json,'$.end_date'))
        AND date(json_extract(b.payload_json,'$.end_date'))>=date(json_extract(NEW.payload_json,'$.start_date'))
    ) THEN RAISE(ABORT,'FINANCE_BUDGET_OVERLAP')
  END;
END;

CREATE TRIGGER finance_budget_immutable_update_guard
BEFORE UPDATE ON documents
WHEN OLD.doctype='Finance Budget' AND OLD.docstatus=1
  AND NOT (NEW.docstatus=2 AND NEW.payload_json IS OLD.payload_json)
BEGIN SELECT RAISE(ABORT,'FINANCE_BUDGET_IMMUTABLE'); END;
CREATE TRIGGER finance_budget_immutable_delete_guard
BEFORE DELETE ON documents WHEN OLD.doctype='Finance Budget' AND OLD.docstatus=1
BEGIN SELECT RAISE(ABORT,'FINANCE_BUDGET_IMMUTABLE'); END;

CREATE TRIGGER finance_budget_revision_submit_guard
BEFORE INSERT ON documents
WHEN NEW.doctype='Finance Budget Revision' AND NEW.docstatus=1
BEGIN
  SELECT CASE
    WHEN NOT EXISTS(SELECT 1 FROM documents b WHERE b.tenant_id=NEW.tenant_id AND b.doctype='Finance Budget' AND b.name=json_extract(NEW.payload_json,'$.budget') AND b.docstatus=1)
      THEN RAISE(ABORT,'FINANCE_BUDGET_REVISION_BUDGET_REQUIRED')
    WHEN COALESCE(CAST(json_extract(NEW.payload_json,'$.delta_amount_minor') AS INTEGER),0)=0
      THEN RAISE(ABORT,'FINANCE_BUDGET_REVISION_AMOUNT_INVALID')
    WHEN (
      SELECT CAST(json_extract(b.payload_json,'$.budget_amount_minor') AS INTEGER)
        + COALESCE((SELECT SUM(CAST(json_extract(r.payload_json,'$.delta_amount_minor') AS INTEGER)) FROM documents r WHERE r.tenant_id=NEW.tenant_id AND r.doctype='Finance Budget Revision' AND r.docstatus=1 AND json_extract(r.payload_json,'$.budget')=b.name),0)
        + CAST(json_extract(NEW.payload_json,'$.delta_amount_minor') AS INTEGER)
      FROM documents b WHERE b.tenant_id=NEW.tenant_id AND b.doctype='Finance Budget' AND b.name=json_extract(NEW.payload_json,'$.budget') AND b.docstatus=1
    )<0 THEN RAISE(ABORT,'FINANCE_BUDGET_REVISION_NEGATIVE_RESULT')
    WHEN (
      SELECT COALESCE(SUM(CASE json_extract(c.payload_json,'$.commitment_type') WHEN 'Reserve' THEN CAST(json_extract(c.payload_json,'$.amount_minor') AS INTEGER) ELSE -CAST(json_extract(c.payload_json,'$.amount_minor') AS INTEGER) END),0)
      FROM documents c WHERE c.tenant_id=NEW.tenant_id AND c.doctype='Finance Budget Commitment' AND c.docstatus=1 AND json_extract(c.payload_json,'$.budget')=json_extract(NEW.payload_json,'$.budget')
    ) > (
      SELECT CAST(json_extract(b.payload_json,'$.budget_amount_minor') AS INTEGER)
        + COALESCE((SELECT SUM(CAST(json_extract(r.payload_json,'$.delta_amount_minor') AS INTEGER)) FROM documents r WHERE r.tenant_id=NEW.tenant_id AND r.doctype='Finance Budget Revision' AND r.docstatus=1 AND json_extract(r.payload_json,'$.budget')=b.name),0)
        + CAST(json_extract(NEW.payload_json,'$.delta_amount_minor') AS INTEGER)
      FROM documents b WHERE b.tenant_id=NEW.tenant_id AND b.doctype='Finance Budget' AND b.name=json_extract(NEW.payload_json,'$.budget') AND b.docstatus=1
    ) THEN RAISE(ABORT,'FINANCE_BUDGET_REVISION_BELOW_COMMITMENTS')
  END;
END;

CREATE TRIGGER finance_budget_revision_update_guard
BEFORE UPDATE ON documents
WHEN NEW.doctype='Finance Budget Revision' AND OLD.docstatus<>1 AND NEW.docstatus=1
BEGIN
  SELECT CASE
    WHEN NOT EXISTS(SELECT 1 FROM documents b WHERE b.tenant_id=NEW.tenant_id AND b.doctype='Finance Budget' AND b.name=json_extract(NEW.payload_json,'$.budget') AND b.docstatus=1)
      THEN RAISE(ABORT,'FINANCE_BUDGET_REVISION_BUDGET_REQUIRED')
    WHEN COALESCE(CAST(json_extract(NEW.payload_json,'$.delta_amount_minor') AS INTEGER),0)=0
      THEN RAISE(ABORT,'FINANCE_BUDGET_REVISION_AMOUNT_INVALID')
  END;
END;
CREATE TRIGGER finance_budget_revision_immutable_update_guard
BEFORE UPDATE ON documents
WHEN OLD.doctype='Finance Budget Revision' AND OLD.docstatus=1
  AND NOT (NEW.docstatus=2 AND NEW.payload_json IS OLD.payload_json)
BEGIN SELECT RAISE(ABORT,'FINANCE_BUDGET_REVISION_IMMUTABLE'); END;
CREATE TRIGGER finance_budget_revision_immutable_delete_guard
BEFORE DELETE ON documents WHEN OLD.doctype='Finance Budget Revision' AND OLD.docstatus=1
BEGIN SELECT RAISE(ABORT,'FINANCE_BUDGET_REVISION_IMMUTABLE'); END;

CREATE TRIGGER finance_budget_commitment_submit_guard
BEFORE INSERT ON documents
WHEN NEW.doctype='Finance Budget Commitment' AND NEW.docstatus=1
BEGIN
  SELECT CASE
    WHEN NOT EXISTS(SELECT 1 FROM documents b WHERE b.tenant_id=NEW.tenant_id AND b.doctype='Finance Budget' AND b.name=json_extract(NEW.payload_json,'$.budget') AND b.docstatus=1)
      THEN RAISE(ABORT,'FINANCE_BUDGET_COMMITMENT_BUDGET_REQUIRED')
    WHEN COALESCE(json_extract(NEW.payload_json,'$.commitment_type'),'') NOT IN ('Reserve','Release')
      OR COALESCE(CAST(json_extract(NEW.payload_json,'$.amount_minor') AS INTEGER),0)<=0
      THEN RAISE(ABORT,'FINANCE_BUDGET_COMMITMENT_AMOUNT_INVALID')
    WHEN NOT EXISTS(SELECT 1 FROM documents s WHERE s.tenant_id=NEW.tenant_id AND s.doctype=json_extract(NEW.payload_json,'$.source_doctype') AND s.name=json_extract(NEW.payload_json,'$.source_name') AND s.docstatus=1)
      THEN RAISE(ABORT,'FINANCE_BUDGET_COMMITMENT_SOURCE_REQUIRED')
    WHEN json_extract(NEW.payload_json,'$.commitment_type')='Release' AND (
      SELECT COALESCE(SUM(CASE json_extract(c.payload_json,'$.commitment_type') WHEN 'Reserve' THEN CAST(json_extract(c.payload_json,'$.amount_minor') AS INTEGER) ELSE -CAST(json_extract(c.payload_json,'$.amount_minor') AS INTEGER) END),0)
      FROM documents c WHERE c.tenant_id=NEW.tenant_id AND c.doctype='Finance Budget Commitment' AND c.docstatus=1
        AND json_extract(c.payload_json,'$.budget')=json_extract(NEW.payload_json,'$.budget')
        AND json_extract(c.payload_json,'$.source_doctype')=json_extract(NEW.payload_json,'$.source_doctype')
        AND json_extract(c.payload_json,'$.source_name')=json_extract(NEW.payload_json,'$.source_name')
    ) < CAST(json_extract(NEW.payload_json,'$.amount_minor') AS INTEGER)
      THEN RAISE(ABORT,'FINANCE_BUDGET_RELEASE_EXCEEDS_SOURCE')
    WHEN (
      SELECT COALESCE(SUM(CASE json_extract(c.payload_json,'$.commitment_type') WHEN 'Reserve' THEN CAST(json_extract(c.payload_json,'$.amount_minor') AS INTEGER) ELSE -CAST(json_extract(c.payload_json,'$.amount_minor') AS INTEGER) END),0)
      FROM documents c WHERE c.tenant_id=NEW.tenant_id AND c.doctype='Finance Budget Commitment' AND c.docstatus=1 AND json_extract(c.payload_json,'$.budget')=json_extract(NEW.payload_json,'$.budget')
    ) + CASE json_extract(NEW.payload_json,'$.commitment_type') WHEN 'Reserve' THEN CAST(json_extract(NEW.payload_json,'$.amount_minor') AS INTEGER) ELSE -CAST(json_extract(NEW.payload_json,'$.amount_minor') AS INTEGER) END < 0
      THEN RAISE(ABORT,'FINANCE_BUDGET_COMMITMENT_NEGATIVE')
    WHEN COALESCE((SELECT json_extract(b.payload_json,'$.control_action') FROM documents b WHERE b.tenant_id=NEW.tenant_id AND b.doctype='Finance Budget' AND b.name=json_extract(NEW.payload_json,'$.budget') AND b.docstatus=1),'Stop')='Stop'
      AND (
        SELECT COALESCE(SUM(CASE json_extract(c.payload_json,'$.commitment_type') WHEN 'Reserve' THEN CAST(json_extract(c.payload_json,'$.amount_minor') AS INTEGER) ELSE -CAST(json_extract(c.payload_json,'$.amount_minor') AS INTEGER) END),0)
        FROM documents c WHERE c.tenant_id=NEW.tenant_id AND c.doctype='Finance Budget Commitment' AND c.docstatus=1 AND json_extract(c.payload_json,'$.budget')=json_extract(NEW.payload_json,'$.budget')
      ) + CASE json_extract(NEW.payload_json,'$.commitment_type') WHEN 'Reserve' THEN CAST(json_extract(NEW.payload_json,'$.amount_minor') AS INTEGER) ELSE -CAST(json_extract(NEW.payload_json,'$.amount_minor') AS INTEGER) END > (
        SELECT CAST(json_extract(b.payload_json,'$.budget_amount_minor') AS INTEGER)
          + COALESCE((SELECT SUM(CAST(json_extract(r.payload_json,'$.delta_amount_minor') AS INTEGER)) FROM documents r WHERE r.tenant_id=NEW.tenant_id AND r.doctype='Finance Budget Revision' AND r.docstatus=1 AND json_extract(r.payload_json,'$.budget')=b.name),0)
        FROM documents b WHERE b.tenant_id=NEW.tenant_id AND b.doctype='Finance Budget' AND b.name=json_extract(NEW.payload_json,'$.budget') AND b.docstatus=1
      ) THEN RAISE(ABORT,'FINANCE_BUDGET_COMMITMENT_EXCEEDED')
  END;
END;

CREATE TRIGGER finance_budget_commitment_update_guard
BEFORE UPDATE ON documents
WHEN NEW.doctype='Finance Budget Commitment' AND OLD.docstatus<>1 AND NEW.docstatus=1
BEGIN
  SELECT CASE
    WHEN NOT EXISTS(SELECT 1 FROM documents b WHERE b.tenant_id=NEW.tenant_id AND b.doctype='Finance Budget' AND b.name=json_extract(NEW.payload_json,'$.budget') AND b.docstatus=1)
      THEN RAISE(ABORT,'FINANCE_BUDGET_COMMITMENT_BUDGET_REQUIRED')
    WHEN COALESCE(json_extract(NEW.payload_json,'$.commitment_type'),'') NOT IN ('Reserve','Release')
      OR COALESCE(CAST(json_extract(NEW.payload_json,'$.amount_minor') AS INTEGER),0)<=0
      THEN RAISE(ABORT,'FINANCE_BUDGET_COMMITMENT_AMOUNT_INVALID')
    WHEN NOT EXISTS(SELECT 1 FROM documents s WHERE s.tenant_id=NEW.tenant_id AND s.doctype=json_extract(NEW.payload_json,'$.source_doctype') AND s.name=json_extract(NEW.payload_json,'$.source_name') AND s.docstatus=1)
      THEN RAISE(ABORT,'FINANCE_BUDGET_COMMITMENT_SOURCE_REQUIRED')
    WHEN json_extract(NEW.payload_json,'$.commitment_type')='Release' AND (
      SELECT COALESCE(SUM(CASE json_extract(c.payload_json,'$.commitment_type') WHEN 'Reserve' THEN CAST(json_extract(c.payload_json,'$.amount_minor') AS INTEGER) ELSE -CAST(json_extract(c.payload_json,'$.amount_minor') AS INTEGER) END),0)
      FROM documents c WHERE c.tenant_id=NEW.tenant_id AND c.doctype='Finance Budget Commitment' AND c.docstatus=1
        AND json_extract(c.payload_json,'$.budget')=json_extract(NEW.payload_json,'$.budget')
        AND json_extract(c.payload_json,'$.source_doctype')=json_extract(NEW.payload_json,'$.source_doctype')
        AND json_extract(c.payload_json,'$.source_name')=json_extract(NEW.payload_json,'$.source_name')
    ) < CAST(json_extract(NEW.payload_json,'$.amount_minor') AS INTEGER)
      THEN RAISE(ABORT,'FINANCE_BUDGET_RELEASE_EXCEEDS_SOURCE')
  END;
END;
CREATE TRIGGER finance_budget_commitment_immutable_update_guard
BEFORE UPDATE ON documents
WHEN OLD.doctype='Finance Budget Commitment' AND OLD.docstatus=1
  AND NOT (NEW.docstatus=2 AND NEW.payload_json IS OLD.payload_json)
BEGIN SELECT RAISE(ABORT,'FINANCE_BUDGET_COMMITMENT_IMMUTABLE'); END;
CREATE TRIGGER finance_budget_commitment_immutable_delete_guard
BEFORE DELETE ON documents WHEN OLD.doctype='Finance Budget Commitment' AND OLD.docstatus=1
BEGIN SELECT RAISE(ABORT,'FINANCE_BUDGET_COMMITMENT_IMMUTABLE'); END;
