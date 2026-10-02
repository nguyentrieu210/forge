-- R8-B: distributed Finance Budget revision historical revalidation.
--
-- A negative revision (or cancellation of a positive revision) changes every accumulated
-- fiscal cap from its posting date forward. Validate every frozen distribution checkpoint
-- against canonical GL actuals plus source-net outstanding commitments before the revision
-- can become authoritative. These views contain no balances of their own; they are read-only
-- projections over documents + immutable GL.

DROP VIEW IF EXISTS finance_budget_distribution_checkpoints;
CREATE VIEW finance_budget_distribution_checkpoints AS
SELECT
  b.tenant_id,
  b.name AS budget,
  json_extract(b.payload_json,'$.company') AS company,
  json_extract(b.payload_json,'$.account') AS account,
  json_extract(b.payload_json,'$.budget_against') AS budget_against,
  COALESCE(json_extract(b.payload_json,'$.branch'),'') AS branch,
  COALESCE(json_extract(b.payload_json,'$.cost_center'),'') AS cost_center,
  COALESCE(json_extract(b.payload_json,'$.project'),'') AS project,
  json_extract(b.payload_json,'$.start_date') AS start_date,
  json_extract(b.payload_json,'$.end_date') AS end_date,
  json_extract(b.payload_json,'$.currency') AS currency,
  CAST(COALESCE(json_extract(b.payload_json,'$.currency_scale'),2) AS INTEGER) AS currency_scale,
  COALESCE(json_extract(b.payload_json,'$.control_action'),'Stop') AS control_action,
  CAST(COALESCE(json_extract(b.payload_json,'$.budget_amount_minor'),0) AS INTEGER) AS budget_amount_minor,
  CAST(COALESCE(json_extract(b.payload_json,'$.distribution_weight_total'),0) AS INTEGER) AS distribution_weight_total,
  json_extract(dist.value,'$.end_date') AS checkpoint_date,
  COALESCE((
    SELECT SUM(CAST(COALESCE(json_extract(prior.value,'$.allocation_weight'),0) AS INTEGER))
    FROM json_each(json_extract(b.payload_json,'$.budget_distribution')) AS prior
    WHERE date(json_extract(prior.value,'$.start_date'))<=date(json_extract(dist.value,'$.end_date'))
  ),0) AS accumulated_weight
FROM documents b
JOIN json_each(json_extract(b.payload_json,'$.budget_distribution')) AS dist
WHERE b.doctype='Finance Budget'
  AND b.docstatus=1
  AND COALESCE(CAST(json_extract(b.payload_json,'$.fiscal_distribution_enabled') AS INTEGER),0)=1;

DROP VIEW IF EXISTS finance_budget_commitment_source_checkpoint;
CREATE VIEW finance_budget_commitment_source_checkpoint AS
SELECT
  cp.tenant_id,cp.budget,cp.company,cp.account,cp.budget_against,
  cp.branch,cp.cost_center,cp.project,cp.start_date,cp.end_date,
  cp.currency,cp.currency_scale,cp.control_action,cp.budget_amount_minor,
  cp.distribution_weight_total,cp.checkpoint_date,cp.accumulated_weight,
  COALESCE(json_extract(cm.payload_json,'$.source_doctype'),'') AS source_doctype,
  COALESCE(json_extract(cm.payload_json,'$.source_name'),'') AS source_name,
  SUM(
    CASE json_extract(cm.payload_json,'$.commitment_type')
      WHEN 'Reserve' THEN CAST(COALESCE(json_extract(cm.payload_json,'$.amount_minor'),0) AS INTEGER)
      WHEN 'Release' THEN -CAST(COALESCE(json_extract(cm.payload_json,'$.amount_minor'),0) AS INTEGER)
      ELSE 0
    END
  ) AS raw_commitment_minor
FROM finance_budget_distribution_checkpoints cp
JOIN documents cm
  ON cm.tenant_id=cp.tenant_id
 AND cm.doctype='Finance Budget Commitment'
 AND cm.docstatus=1
 AND json_extract(cm.payload_json,'$.budget')=cp.budget
 AND date(json_extract(cm.payload_json,'$.posting_date'))>=date(cp.start_date)
 AND date(json_extract(cm.payload_json,'$.posting_date'))<=date(cp.checkpoint_date)
GROUP BY
  cp.tenant_id,cp.budget,cp.company,cp.account,cp.budget_against,
  cp.branch,cp.cost_center,cp.project,cp.start_date,cp.end_date,
  cp.currency,cp.currency_scale,cp.control_action,cp.budget_amount_minor,
  cp.distribution_weight_total,cp.checkpoint_date,cp.accumulated_weight,
  source_doctype,source_name;

DROP VIEW IF EXISTS finance_budget_commitment_checkpoint_usage;
CREATE VIEW finance_budget_commitment_checkpoint_usage AS
SELECT
  sc.tenant_id,sc.budget,sc.checkpoint_date,
  SUM(
    MAX(
      sc.raw_commitment_minor
      - MIN(
        MAX(sc.raw_commitment_minor,0),
        MAX(COALESCE((
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
          LEFT JOIN finance_historical_accounts a
            ON a.tenant_id=sc.tenant_id
           AND a.name=sc.account
           AND (a.company=sc.company OR a.company IS NULL OR a.company='')
          WHERE g.tenant_id=sc.tenant_id
            AND g.voucher_type<>'Period Closing Voucher'
            AND g.account=sc.account
            AND g.currency=sc.currency
            AND g.currency_scale=sc.currency_scale
            AND date(g.posting_at)>=date(sc.start_date)
            AND date(g.posting_at)<=date(sc.checkpoint_date)
            AND json_extract(d.payload_json,'$.company')=sc.company
            AND (
              sc.budget_against='Company'
              OR (
                sc.budget_against='Branch'
                AND COALESCE(NULLIF(json_extract(d.payload_json,'$.branch'),''),
                             NULLIF(json_extract(g.dimensions_json,'$.branch'),''),'')=sc.branch
              )
              OR (
                sc.budget_against='Cost Center'
                AND COALESCE(NULLIF(g.cost_center,''),
                             NULLIF(json_extract(g.dimensions_json,'$.cost_center'),''),'')=sc.cost_center
              )
              OR (
                sc.budget_against='Project'
                AND COALESCE(NULLIF(json_extract(d.payload_json,'$.project'),''),
                             NULLIF(json_extract(g.dimensions_json,'$.project'),''),'')=sc.project
              )
            )
            AND (
              (
                sc.source_doctype='Expense Claim'
                AND g.voucher_type='Expense Claim'
                AND g.voucher_no=sc.source_name
              )
              OR (
                sc.source_doctype IN ('Purchase Order','Material Request')
                AND g.voucher_type='Purchase Invoice'
                AND EXISTS (
                  SELECT 1
                  FROM json_each(json_extract(d.payload_json,'$.items')) AS item
                  WHERE (
                    g.line_key='EXPENSE-' || COALESCE(json_extract(item.value,'$.row_id'),'')
                    OR g.line_key='REV-EXPENSE-' || COALESCE(json_extract(item.value,'$.row_id'),'')
                  )
                  AND (
                    (
                      sc.source_doctype='Purchase Order'
                      AND COALESCE(
                        NULLIF(json_extract(item.value,'$.purchase_order'),''),
                        NULLIF(json_extract(d.payload_json,'$.against_purchase_order'),''),
                        ''
                      )=sc.source_name
                    )
                    OR (
                      sc.source_doctype='Material Request'
                      AND COALESCE(NULLIF(json_extract(item.value,'$.material_request'),''),'')=sc.source_name
                    )
                  )
                )
              )
            )
        ),0),0)
      ),
      0
    )
  ) AS outstanding_commitment_minor
FROM finance_budget_commitment_source_checkpoint sc
GROUP BY sc.tenant_id,sc.budget,sc.checkpoint_date;

DROP VIEW IF EXISTS finance_budget_checkpoint_usage;
CREATE VIEW finance_budget_checkpoint_usage AS
SELECT
  cp.*,
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
    LEFT JOIN finance_historical_accounts a
      ON a.tenant_id=cp.tenant_id
     AND a.name=cp.account
     AND (a.company=cp.company OR a.company IS NULL OR a.company='')
    WHERE g.tenant_id=cp.tenant_id
      AND g.voucher_type<>'Period Closing Voucher'
      AND g.account=cp.account
      AND g.currency=cp.currency
      AND g.currency_scale=cp.currency_scale
      AND date(g.posting_at)>=date(cp.start_date)
      AND date(g.posting_at)<=date(cp.checkpoint_date)
      AND json_extract(d.payload_json,'$.company')=cp.company
      AND (
        cp.budget_against='Company'
        OR (
          cp.budget_against='Branch'
          AND COALESCE(NULLIF(json_extract(d.payload_json,'$.branch'),''),
                       NULLIF(json_extract(g.dimensions_json,'$.branch'),''),'')=cp.branch
        )
        OR (
          cp.budget_against='Cost Center'
          AND COALESCE(NULLIF(g.cost_center,''),
                       NULLIF(json_extract(g.dimensions_json,'$.cost_center'),''),'')=cp.cost_center
        )
        OR (
          cp.budget_against='Project'
          AND COALESCE(NULLIF(json_extract(d.payload_json,'$.project'),''),
                       NULLIF(json_extract(g.dimensions_json,'$.project'),''),'')=cp.project
        )
      )
  ),0) AS actual_minor,
  COALESCE((
    SELECT cu.outstanding_commitment_minor
    FROM finance_budget_commitment_checkpoint_usage cu
    WHERE cu.tenant_id=cp.tenant_id
      AND cu.budget=cp.budget
      AND cu.checkpoint_date=cp.checkpoint_date
  ),0) AS committed_minor
FROM finance_budget_distribution_checkpoints cp;

DROP TRIGGER IF EXISTS finance_budget_revision_distribution_insert_guard;
CREATE TRIGGER finance_budget_revision_distribution_insert_guard
BEFORE INSERT ON documents
WHEN NEW.doctype='Finance Budget Revision'
  AND NEW.docstatus=1
  AND CAST(COALESCE(json_extract(NEW.payload_json,'$.delta_amount_minor'),0) AS INTEGER)<0
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1
    FROM finance_budget_checkpoint_usage u
    WHERE u.tenant_id=NEW.tenant_id
      AND u.budget=json_extract(NEW.payload_json,'$.budget')
      AND u.control_action='Stop'
      AND date(u.checkpoint_date)>=date(json_extract(NEW.payload_json,'$.posting_date'))
      AND (
        (
          u.budget_amount_minor
          + COALESCE((
            SELECT SUM(CAST(COALESCE(json_extract(r.payload_json,'$.delta_amount_minor'),0) AS INTEGER))
            FROM documents r
            WHERE r.tenant_id=NEW.tenant_id
              AND r.doctype='Finance Budget Revision'
              AND r.docstatus=1
              AND json_extract(r.payload_json,'$.budget')=u.budget
              AND date(json_extract(r.payload_json,'$.posting_date'))<=date(u.checkpoint_date)
          ),0)
          + CAST(json_extract(NEW.payload_json,'$.delta_amount_minor') AS INTEGER)
        ) < 0
        OR (u.actual_minor+u.committed_minor) > (
          CAST((
            u.budget_amount_minor
            + COALESCE((
              SELECT SUM(CAST(COALESCE(json_extract(r.payload_json,'$.delta_amount_minor'),0) AS INTEGER))
              FROM documents r
              WHERE r.tenant_id=NEW.tenant_id
                AND r.doctype='Finance Budget Revision'
                AND r.docstatus=1
                AND json_extract(r.payload_json,'$.budget')=u.budget
                AND date(json_extract(r.payload_json,'$.posting_date'))<=date(u.checkpoint_date)
            ),0)
            + CAST(json_extract(NEW.payload_json,'$.delta_amount_minor') AS INTEGER)
          ) / u.distribution_weight_total AS INTEGER) * u.accumulated_weight
          + CAST((
              (
                (
                  u.budget_amount_minor
                  + COALESCE((
                    SELECT SUM(CAST(COALESCE(json_extract(r.payload_json,'$.delta_amount_minor'),0) AS INTEGER))
                    FROM documents r
                    WHERE r.tenant_id=NEW.tenant_id
                      AND r.doctype='Finance Budget Revision'
                      AND r.docstatus=1
                      AND json_extract(r.payload_json,'$.budget')=u.budget
                      AND date(json_extract(r.payload_json,'$.posting_date'))<=date(u.checkpoint_date)
                  ),0)
                  + CAST(json_extract(NEW.payload_json,'$.delta_amount_minor') AS INTEGER)
                ) % u.distribution_weight_total
              ) * u.accumulated_weight
              + CAST(u.distribution_weight_total/2 AS INTEGER)
            ) / u.distribution_weight_total AS INTEGER)
        )
      )
  ) THEN RAISE(ABORT,'FINANCE_BUDGET_REVISION_DISTRIBUTION_EXCEEDED') END;
END;

DROP TRIGGER IF EXISTS finance_budget_revision_distribution_update_guard;
CREATE TRIGGER finance_budget_revision_distribution_update_guard
BEFORE UPDATE ON documents
WHEN NEW.doctype='Finance Budget Revision'
  AND OLD.docstatus<>1
  AND NEW.docstatus=1
  AND CAST(COALESCE(json_extract(NEW.payload_json,'$.delta_amount_minor'),0) AS INTEGER)<0
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1
    FROM finance_budget_checkpoint_usage u
    WHERE u.tenant_id=NEW.tenant_id
      AND u.budget=json_extract(NEW.payload_json,'$.budget')
      AND u.control_action='Stop'
      AND date(u.checkpoint_date)>=date(json_extract(NEW.payload_json,'$.posting_date'))
      AND (
        (
          u.budget_amount_minor
          + COALESCE((
            SELECT SUM(CAST(COALESCE(json_extract(r.payload_json,'$.delta_amount_minor'),0) AS INTEGER))
            FROM documents r
            WHERE r.tenant_id=NEW.tenant_id
              AND r.doctype='Finance Budget Revision'
              AND r.docstatus=1
              AND r.doc_key<>OLD.doc_key
              AND json_extract(r.payload_json,'$.budget')=u.budget
              AND date(json_extract(r.payload_json,'$.posting_date'))<=date(u.checkpoint_date)
          ),0)
          + CAST(json_extract(NEW.payload_json,'$.delta_amount_minor') AS INTEGER)
        ) < 0
        OR (u.actual_minor+u.committed_minor) > (
          CAST((
            u.budget_amount_minor
            + COALESCE((
              SELECT SUM(CAST(COALESCE(json_extract(r.payload_json,'$.delta_amount_minor'),0) AS INTEGER))
              FROM documents r
              WHERE r.tenant_id=NEW.tenant_id
                AND r.doctype='Finance Budget Revision'
                AND r.docstatus=1
                AND r.doc_key<>OLD.doc_key
                AND json_extract(r.payload_json,'$.budget')=u.budget
                AND date(json_extract(r.payload_json,'$.posting_date'))<=date(u.checkpoint_date)
            ),0)
            + CAST(json_extract(NEW.payload_json,'$.delta_amount_minor') AS INTEGER)
          ) / u.distribution_weight_total AS INTEGER) * u.accumulated_weight
          + CAST((
              (
                (
                  u.budget_amount_minor
                  + COALESCE((
                    SELECT SUM(CAST(COALESCE(json_extract(r.payload_json,'$.delta_amount_minor'),0) AS INTEGER))
                    FROM documents r
                    WHERE r.tenant_id=NEW.tenant_id
                      AND r.doctype='Finance Budget Revision'
                      AND r.docstatus=1
                      AND r.doc_key<>OLD.doc_key
                      AND json_extract(r.payload_json,'$.budget')=u.budget
                      AND date(json_extract(r.payload_json,'$.posting_date'))<=date(u.checkpoint_date)
                  ),0)
                  + CAST(json_extract(NEW.payload_json,'$.delta_amount_minor') AS INTEGER)
                ) % u.distribution_weight_total
              ) * u.accumulated_weight
              + CAST(u.distribution_weight_total/2 AS INTEGER)
            ) / u.distribution_weight_total AS INTEGER)
        )
      )
  ) THEN RAISE(ABORT,'FINANCE_BUDGET_REVISION_DISTRIBUTION_EXCEEDED') END;
END;

DROP TRIGGER IF EXISTS finance_budget_revision_distribution_cancel_guard;
CREATE TRIGGER finance_budget_revision_distribution_cancel_guard
BEFORE UPDATE ON documents
WHEN OLD.doctype='Finance Budget Revision'
  AND OLD.docstatus=1
  AND NEW.docstatus=2
  AND CAST(COALESCE(json_extract(OLD.payload_json,'$.delta_amount_minor'),0) AS INTEGER)>0
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1
    FROM finance_budget_checkpoint_usage u
    WHERE u.tenant_id=OLD.tenant_id
      AND u.budget=json_extract(OLD.payload_json,'$.budget')
      AND u.control_action='Stop'
      AND date(u.checkpoint_date)>=date(json_extract(OLD.payload_json,'$.posting_date'))
      AND (
        (
          u.budget_amount_minor
          + COALESCE((
            SELECT SUM(CAST(COALESCE(json_extract(r.payload_json,'$.delta_amount_minor'),0) AS INTEGER))
            FROM documents r
            WHERE r.tenant_id=OLD.tenant_id
              AND r.doctype='Finance Budget Revision'
              AND r.docstatus=1
              AND json_extract(r.payload_json,'$.budget')=u.budget
              AND date(json_extract(r.payload_json,'$.posting_date'))<=date(u.checkpoint_date)
          ),0)
          - CAST(json_extract(OLD.payload_json,'$.delta_amount_minor') AS INTEGER)
        ) < 0
        OR (u.actual_minor+u.committed_minor) > (
          CAST((
            u.budget_amount_minor
            + COALESCE((
              SELECT SUM(CAST(COALESCE(json_extract(r.payload_json,'$.delta_amount_minor'),0) AS INTEGER))
              FROM documents r
              WHERE r.tenant_id=OLD.tenant_id
                AND r.doctype='Finance Budget Revision'
                AND r.docstatus=1
                AND json_extract(r.payload_json,'$.budget')=u.budget
                AND date(json_extract(r.payload_json,'$.posting_date'))<=date(u.checkpoint_date)
            ),0)
            - CAST(json_extract(OLD.payload_json,'$.delta_amount_minor') AS INTEGER)
          ) / u.distribution_weight_total AS INTEGER) * u.accumulated_weight
          + CAST((
              (
                (
                  u.budget_amount_minor
                  + COALESCE((
                    SELECT SUM(CAST(COALESCE(json_extract(r.payload_json,'$.delta_amount_minor'),0) AS INTEGER))
                    FROM documents r
                    WHERE r.tenant_id=OLD.tenant_id
                      AND r.doctype='Finance Budget Revision'
                      AND r.docstatus=1
                      AND json_extract(r.payload_json,'$.budget')=u.budget
                      AND date(json_extract(r.payload_json,'$.posting_date'))<=date(u.checkpoint_date)
                  ),0)
                  - CAST(json_extract(OLD.payload_json,'$.delta_amount_minor') AS INTEGER)
                ) % u.distribution_weight_total
              ) * u.accumulated_weight
              + CAST(u.distribution_weight_total/2 AS INTEGER)
            ) / u.distribution_weight_total AS INTEGER)
        )
      )
  ) THEN RAISE(ABORT,'FINANCE_BUDGET_REVISION_DISTRIBUTION_EXCEEDED') END;
END;
