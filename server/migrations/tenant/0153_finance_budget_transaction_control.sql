-- R8-B: actual-aware Finance Budget transactional control.
-- This trigger runs inside the same D1 batch that appends immutable GL rows, so Stop
-- semantics cannot race a concurrent submit. Warn/Ignore remain non-blocking and are
-- observable through the canonical Budget vs Actual projection.
DROP TRIGGER IF EXISTS finance_budget_gl_currency_guard;
CREATE TRIGGER finance_budget_gl_currency_guard
BEFORE INSERT ON gl_entries
WHEN NEW.voucher_type<>'Period Closing Voucher'
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1
    FROM documents b
    INNER JOIN documents v
      ON v.tenant_id=NEW.tenant_id
     AND v.doctype=NEW.voucher_type
     AND v.name=NEW.voucher_no
    WHERE b.tenant_id=NEW.tenant_id
      AND b.doctype='Finance Budget'
      AND b.docstatus=1
      AND json_extract(b.payload_json,'$.company')=json_extract(v.payload_json,'$.company')
      AND json_extract(b.payload_json,'$.account')=NEW.account
      AND date(NEW.posting_at) BETWEEN date(json_extract(b.payload_json,'$.start_date'))
                                   AND date(json_extract(b.payload_json,'$.end_date'))
      AND (
        json_extract(b.payload_json,'$.budget_against')='Company'
        OR (
          json_extract(b.payload_json,'$.budget_against')='Branch'
          AND COALESCE(NULLIF(json_extract(v.payload_json,'$.branch'),''),
                       NULLIF(json_extract(NEW.dimensions_json,'$.branch'),''),'')
              =COALESCE(json_extract(b.payload_json,'$.branch'),'')
        )
        OR (
          json_extract(b.payload_json,'$.budget_against')='Cost Center'
          AND COALESCE(NULLIF(NEW.cost_center,''),
                       NULLIF(json_extract(NEW.dimensions_json,'$.cost_center'),''),'')
              =COALESCE(json_extract(b.payload_json,'$.cost_center'),'')
        )
        OR (
          json_extract(b.payload_json,'$.budget_against')='Project'
          AND COALESCE(NULLIF(json_extract(v.payload_json,'$.project'),''),
                       NULLIF(json_extract(NEW.dimensions_json,'$.project'),''),'')
              =COALESCE(json_extract(b.payload_json,'$.project'),'')
        )
      )
      AND (
        NEW.currency<>json_extract(b.payload_json,'$.currency')
        OR NEW.currency_scale<>CAST(COALESCE(json_extract(b.payload_json,'$.currency_scale'),2) AS INTEGER)
      )
  ) THEN RAISE(ABORT,'FINANCE_BUDGET_GL_CURRENCY_SCALE_MISMATCH') END;
END;

DROP TRIGGER IF EXISTS finance_budget_gl_stop_guard;
CREATE TRIGGER finance_budget_gl_stop_guard
BEFORE INSERT ON gl_entries
WHEN NEW.voucher_type<>'Period Closing Voucher'
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1
    FROM documents b
    INNER JOIN documents v
      ON v.tenant_id=NEW.tenant_id
     AND v.doctype=NEW.voucher_type
     AND v.name=NEW.voucher_no
    LEFT JOIN finance_historical_accounts a
      ON a.tenant_id=b.tenant_id
     AND a.name=json_extract(b.payload_json,'$.account')
     AND (a.company=json_extract(b.payload_json,'$.company') OR a.company IS NULL OR a.company='')
    WHERE b.tenant_id=NEW.tenant_id
      AND b.doctype='Finance Budget'
      AND b.docstatus=1
      AND COALESCE(json_extract(b.payload_json,'$.control_action'),'Stop')='Stop'
      AND json_extract(b.payload_json,'$.company')=json_extract(v.payload_json,'$.company')
      AND json_extract(b.payload_json,'$.account')=NEW.account
      AND NEW.currency=json_extract(b.payload_json,'$.currency')
      AND NEW.currency_scale=CAST(COALESCE(json_extract(b.payload_json,'$.currency_scale'),2) AS INTEGER)
      AND date(NEW.posting_at) BETWEEN date(json_extract(b.payload_json,'$.start_date'))
                                   AND date(json_extract(b.payload_json,'$.end_date'))
      AND (
        json_extract(b.payload_json,'$.budget_against')='Company'
        OR (
          json_extract(b.payload_json,'$.budget_against')='Branch'
          AND COALESCE(NULLIF(json_extract(v.payload_json,'$.branch'),''),
                       NULLIF(json_extract(NEW.dimensions_json,'$.branch'),''),'')
              =COALESCE(json_extract(b.payload_json,'$.branch'),'')
        )
        OR (
          json_extract(b.payload_json,'$.budget_against')='Cost Center'
          AND COALESCE(NULLIF(NEW.cost_center,''),
                       NULLIF(json_extract(NEW.dimensions_json,'$.cost_center'),''),'')
              =COALESCE(json_extract(b.payload_json,'$.cost_center'),'')
        )
        OR (
          json_extract(b.payload_json,'$.budget_against')='Project'
          AND COALESCE(NULLIF(json_extract(v.payload_json,'$.project'),''),
                       NULLIF(json_extract(NEW.dimensions_json,'$.project'),''),'')
              =COALESCE(json_extract(b.payload_json,'$.project'),'')
        )
      )
      AND (
        COALESCE((
          SELECT SUM(
            CASE COALESCE(a.root_type,'')
              WHEN 'Income' THEN g.credit_minor-g.debit_minor
              ELSE g.debit_minor-g.credit_minor
            END
          )
          FROM gl_entries g
          INNER JOIN documents d
            ON d.tenant_id=g.tenant_id
           AND d.doctype=g.voucher_type
           AND d.name=g.voucher_no
          WHERE g.tenant_id=NEW.tenant_id
            AND g.voucher_type<>'Period Closing Voucher'
            AND g.account=NEW.account
            AND g.currency=NEW.currency
            AND g.currency_scale=NEW.currency_scale
            AND json_extract(d.payload_json,'$.company')=json_extract(b.payload_json,'$.company')
            AND date(g.posting_at)>=date(json_extract(b.payload_json,'$.start_date'))
            AND date(g.posting_at)<=date(NEW.posting_at)
            AND (
              json_extract(b.payload_json,'$.budget_against')='Company'
              OR (
                json_extract(b.payload_json,'$.budget_against')='Branch'
                AND COALESCE(NULLIF(json_extract(d.payload_json,'$.branch'),''),
                             NULLIF(json_extract(g.dimensions_json,'$.branch'),''),'')
                    =COALESCE(json_extract(b.payload_json,'$.branch'),'')
              )
              OR (
                json_extract(b.payload_json,'$.budget_against')='Cost Center'
                AND COALESCE(NULLIF(g.cost_center,''),
                             NULLIF(json_extract(g.dimensions_json,'$.cost_center'),''),'')
                    =COALESCE(json_extract(b.payload_json,'$.cost_center'),'')
              )
              OR (
                json_extract(b.payload_json,'$.budget_against')='Project'
                AND COALESCE(NULLIF(json_extract(d.payload_json,'$.project'),''),
                             NULLIF(json_extract(g.dimensions_json,'$.project'),''),'')
                    =COALESCE(json_extract(b.payload_json,'$.project'),'')
              )
            )
        ),0)
        + CASE COALESCE(a.root_type,'')
            WHEN 'Income' THEN NEW.credit_minor-NEW.debit_minor
            ELSE NEW.debit_minor-NEW.credit_minor
          END
        + COALESCE((
          SELECT SUM(
            CASE json_extract(cm.payload_json,'$.commitment_type')
              WHEN 'Reserve' THEN CAST(COALESCE(json_extract(cm.payload_json,'$.amount_minor'),0) AS INTEGER)
              WHEN 'Release' THEN -CAST(COALESCE(json_extract(cm.payload_json,'$.amount_minor'),0) AS INTEGER)
              ELSE 0
            END
          )
          FROM documents cm
          WHERE cm.tenant_id=NEW.tenant_id
            AND cm.doctype='Finance Budget Commitment'
            AND cm.docstatus=1
            AND json_extract(cm.payload_json,'$.budget')=b.name
            AND date(json_extract(cm.payload_json,'$.posting_date'))>=date(json_extract(b.payload_json,'$.start_date'))
            AND date(json_extract(cm.payload_json,'$.posting_date'))<=date(NEW.posting_at)
        ),0)
      ) > (
        CAST(COALESCE(json_extract(b.payload_json,'$.budget_amount_minor'),0) AS INTEGER)
        + COALESCE((
          SELECT SUM(CAST(COALESCE(json_extract(r.payload_json,'$.delta_amount_minor'),0) AS INTEGER))
          FROM documents r
          WHERE r.tenant_id=NEW.tenant_id
            AND r.doctype='Finance Budget Revision'
            AND r.docstatus=1
            AND json_extract(r.payload_json,'$.budget')=b.name
            AND date(json_extract(r.payload_json,'$.posting_date'))>=date(json_extract(b.payload_json,'$.start_date'))
            AND date(json_extract(r.payload_json,'$.posting_date'))<=date(NEW.posting_at)
        ),0)
      )
  ) THEN RAISE(ABORT,'FINANCE_BUDGET_TRANSACTION_EXCEEDED') END;
END;
