
-- Metadata: opt-in fiscal distribution preserves legacy annual-only budgets.
UPDATE doctype_definitions
SET metadata_json=json_insert(
      metadata_json,
      '$.fields[#]',json('{"fieldname":"fiscal_distribution_enabled","label":"Fiscal Distribution","fieldtype":"Check","default":false}'),
      '$.fields[#]',json('{"fieldname":"distribution_frequency","label":"Distribution Frequency","fieldtype":"Select","options":"Monthly\\nQuarterly\\nHalf-Yearly\\nYearly","depends_on":"eval:doc.fiscal_distribution_enabled==1"}'),
      '$.fields[#]',json('{"fieldname":"distribute_equally","label":"Distribute Equally","fieldtype":"Check","default":true,"depends_on":"eval:doc.fiscal_distribution_enabled==1"}'),
      '$.fields[#]',json('{"fieldname":"budget_distribution","label":"Budget Distribution","fieldtype":"Table","options":"Finance Budget Distribution","depends_on":"eval:doc.fiscal_distribution_enabled==1"}'),
      '$.fields[#]',json('{"fieldname":"budget_distribution_total","label":"Distribution Total","fieldtype":"Currency","read_only":true}'),
      '$.fields[#]',json('{"fieldname":"distribution_weight_total","label":"Distribution Weight Total","fieldtype":"Int","read_only":true,"hidden":true}')
    ),
    revision=revision+1,
    modified_by='migration-0158',
    modified_at='2026-10-02T00:00:00.000Z'
WHERE doctype='Finance Budget'
  AND NOT EXISTS(
    SELECT 1 FROM json_each(metadata_json,'$.fields')
    WHERE json_extract(value,'$.fieldname')='fiscal_distribution_enabled'
  );

INSERT OR IGNORE INTO doctype_definitions(
  tenant_id,doctype,module,is_custom,is_submittable,is_child,revision,
  metadata_json,disabled,modified_by,modified_at
)
SELECT
  tenant_id,'Finance Budget Distribution','Accounts',0,0,1,1,
  '{"name":"Finance Budget Distribution","module":"Accounts","is_child":true,"revision":1,"fields":[{"fieldname":"start_date","label":"Start Date","fieldtype":"Date","required":true,"in_list_view":true},{"fieldname":"end_date","label":"End Date","fieldtype":"Date","required":true,"in_list_view":true},{"fieldname":"percent","label":"Percent","fieldtype":"Float","required":true,"in_list_view":true},{"fieldname":"percent_bps","label":"Percent Basis Points","fieldtype":"Int","read_only":true,"hidden":true},{"fieldname":"allocation_weight","label":"Allocation Weight","fieldtype":"Int","read_only":true,"hidden":true},{"fieldname":"amount","label":"Amount","fieldtype":"Currency","read_only":true,"in_list_view":true},{"fieldname":"amount_minor","label":"Amount Minor Units","fieldtype":"Int","read_only":true,"hidden":true}],"permissions":[],"custom":false}',
  0,'migration-0158','2026-10-02T00:00:00.000Z'
FROM doctype_definitions
WHERE doctype='Finance Budget'
LIMIT 1;

UPDATE doctype_definitions
SET metadata_json=json_insert(
      metadata_json,
      '$.fields[#]',json('{"fieldname":"annual_effective_budget_amount","label":"Annual Effective Budget","fieldtype":"Currency","read_only":true}')
    ),
    revision=revision+1,
    modified_by='migration-0158',
    modified_at='2026-10-02T00:00:00.000Z'
WHERE doctype='Finance Budget Commitment'
  AND NOT EXISTS(
    SELECT 1 FROM json_each(metadata_json,'$.fields')
    WHERE json_extract(value,'$.fieldname')='annual_effective_budget_amount'
  );

DROP TRIGGER IF EXISTS finance_budget_distribution_insert_guard;
DROP TRIGGER IF EXISTS finance_budget_distribution_update_guard;

CREATE TRIGGER finance_budget_distribution_insert_guard
BEFORE INSERT ON documents
WHEN NEW.doctype='Finance Budget' AND NEW.docstatus=1
  AND COALESCE(CAST(json_extract(NEW.payload_json,'$.fiscal_distribution_enabled') AS INTEGER),0)=1
BEGIN
  SELECT CASE WHEN
    COALESCE(json_extract(NEW.payload_json,'$.distribution_frequency'),'') NOT IN ('Monthly','Quarterly','Half-Yearly','Yearly')
    OR CAST(COALESCE(json_extract(NEW.payload_json,'$.distribution_weight_total'),0) AS INTEGER) NOT BETWEEN 1 AND 10000
    OR json_array_length(COALESCE(json_extract(NEW.payload_json,'$.budget_distribution'),json('[]')))=0
    OR COALESCE((
      SELECT SUM(CAST(COALESCE(json_extract(row.value,'$.allocation_weight'),0) AS INTEGER))
      FROM json_each(json_extract(NEW.payload_json,'$.budget_distribution')) AS row
    ),0)<>CAST(json_extract(NEW.payload_json,'$.distribution_weight_total') AS INTEGER)
    OR COALESCE((
      SELECT SUM(CAST(COALESCE(json_extract(row.value,'$.percent_bps'),0) AS INTEGER))
      FROM json_each(json_extract(NEW.payload_json,'$.budget_distribution')) AS row
    ),0)<>10000
    OR COALESCE((
      SELECT SUM(CAST(COALESCE(json_extract(row.value,'$.amount_minor'),0) AS INTEGER))
      FROM json_each(json_extract(NEW.payload_json,'$.budget_distribution')) AS row
    ),0)<>CAST(json_extract(NEW.payload_json,'$.budget_amount_minor') AS INTEGER)
    OR EXISTS(
      SELECT 1 FROM json_each(json_extract(NEW.payload_json,'$.budget_distribution')) AS row
      WHERE CAST(COALESCE(json_extract(row.value,'$.allocation_weight'),0) AS INTEGER)<=0
        OR CAST(COALESCE(json_extract(row.value,'$.percent_bps'),0) AS INTEGER)<=0
        OR CAST(COALESCE(json_extract(row.value,'$.amount_minor'),-1) AS INTEGER)<0
        OR date(json_extract(row.value,'$.start_date')) IS NULL
        OR date(json_extract(row.value,'$.end_date')) IS NULL
        OR date(json_extract(row.value,'$.start_date'))>date(json_extract(row.value,'$.end_date'))
        OR date(json_extract(row.value,'$.start_date'))<date(json_extract(NEW.payload_json,'$.start_date'))
        OR date(json_extract(row.value,'$.end_date'))>date(json_extract(NEW.payload_json,'$.end_date'))
    )
    OR date(json_extract(NEW.payload_json,'$.budget_distribution[0].start_date'))
       <>date(json_extract(NEW.payload_json,'$.start_date'))
    OR date(json_extract(
         NEW.payload_json,
         '$.budget_distribution[' || (json_array_length(json_extract(NEW.payload_json,'$.budget_distribution'))-1) || '].end_date'
       ))<>date(json_extract(NEW.payload_json,'$.end_date'))
    OR EXISTS(
      SELECT 1
      FROM json_each(json_extract(NEW.payload_json,'$.budget_distribution')) AS row
      WHERE CAST(row.key AS INTEGER)>0
        AND date(json_extract(row.value,'$.start_date'))<>date(
          json_extract(
            NEW.payload_json,
            '$.budget_distribution[' || (CAST(row.key AS INTEGER)-1) || '].end_date'
          ),
          '+1 day'
        )
    )
  THEN RAISE(ABORT,'FINANCE_BUDGET_DISTRIBUTION_INVALID') END;
END;

CREATE TRIGGER finance_budget_distribution_update_guard
BEFORE UPDATE ON documents
WHEN NEW.doctype='Finance Budget' AND OLD.docstatus<>1 AND NEW.docstatus=1
  AND COALESCE(CAST(json_extract(NEW.payload_json,'$.fiscal_distribution_enabled') AS INTEGER),0)=1
BEGIN
  SELECT CASE WHEN
    COALESCE(json_extract(NEW.payload_json,'$.distribution_frequency'),'') NOT IN ('Monthly','Quarterly','Half-Yearly','Yearly')
    OR CAST(COALESCE(json_extract(NEW.payload_json,'$.distribution_weight_total'),0) AS INTEGER) NOT BETWEEN 1 AND 10000
    OR json_array_length(COALESCE(json_extract(NEW.payload_json,'$.budget_distribution'),json('[]')))=0
    OR COALESCE((
      SELECT SUM(CAST(COALESCE(json_extract(row.value,'$.allocation_weight'),0) AS INTEGER))
      FROM json_each(json_extract(NEW.payload_json,'$.budget_distribution')) AS row
    ),0)<>CAST(json_extract(NEW.payload_json,'$.distribution_weight_total') AS INTEGER)
    OR COALESCE((
      SELECT SUM(CAST(COALESCE(json_extract(row.value,'$.percent_bps'),0) AS INTEGER))
      FROM json_each(json_extract(NEW.payload_json,'$.budget_distribution')) AS row
    ),0)<>10000
    OR COALESCE((
      SELECT SUM(CAST(COALESCE(json_extract(row.value,'$.amount_minor'),0) AS INTEGER))
      FROM json_each(json_extract(NEW.payload_json,'$.budget_distribution')) AS row
    ),0)<>CAST(json_extract(NEW.payload_json,'$.budget_amount_minor') AS INTEGER)
    OR EXISTS(
      SELECT 1 FROM json_each(json_extract(NEW.payload_json,'$.budget_distribution')) AS row
      WHERE CAST(COALESCE(json_extract(row.value,'$.allocation_weight'),0) AS INTEGER)<=0
        OR CAST(COALESCE(json_extract(row.value,'$.percent_bps'),0) AS INTEGER)<=0
        OR CAST(COALESCE(json_extract(row.value,'$.amount_minor'),-1) AS INTEGER)<0
        OR date(json_extract(row.value,'$.start_date')) IS NULL
        OR date(json_extract(row.value,'$.end_date')) IS NULL
        OR date(json_extract(row.value,'$.start_date'))>date(json_extract(row.value,'$.end_date'))
        OR date(json_extract(row.value,'$.start_date'))<date(json_extract(NEW.payload_json,'$.start_date'))
        OR date(json_extract(row.value,'$.end_date'))>date(json_extract(NEW.payload_json,'$.end_date'))
    )
    OR date(json_extract(NEW.payload_json,'$.budget_distribution[0].start_date'))
       <>date(json_extract(NEW.payload_json,'$.start_date'))
    OR date(json_extract(
         NEW.payload_json,
         '$.budget_distribution[' || (json_array_length(json_extract(NEW.payload_json,'$.budget_distribution'))-1) || '].end_date'
       ))<>date(json_extract(NEW.payload_json,'$.end_date'))
    OR EXISTS(
      SELECT 1
      FROM json_each(json_extract(NEW.payload_json,'$.budget_distribution')) AS row
      WHERE CAST(row.key AS INTEGER)>0
        AND date(json_extract(row.value,'$.start_date'))<>date(
          json_extract(
            NEW.payload_json,
            '$.budget_distribution[' || (CAST(row.key AS INTEGER)-1) || '].end_date'
          ),
          '+1 day'
        )
    )
  THEN RAISE(ABORT,'FINANCE_BUDGET_DISTRIBUTION_INVALID') END;
END;


-- R8-B: Finance Budget fiscal distribution over canonical actual + outstanding commitments.
-- Rebuild the 0157 GL guard with an accumulated distribution cap. Equal/manual allocation
-- is normalized by the controller; D1 independently validates the frozen distribution and
-- applies the same integer quotient/remainder ratio to base budget + dated revisions.

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
            MAX(
              source_commitment.raw_minor
              - MIN(
                MAX(source_commitment.raw_minor,0),
                MAX(
                  COALESCE((
                    SELECT SUM(
                      CASE COALESCE(a.root_type,'')
                        WHEN 'Income' THEN linked.credit_minor-linked.debit_minor
                        ELSE linked.debit_minor-linked.credit_minor
                      END
                    )
                    FROM gl_entries linked
                    INNER JOIN documents linked_doc
                      ON linked_doc.tenant_id=linked.tenant_id
                     AND linked_doc.doctype=linked.voucher_type
                     AND linked_doc.name=linked.voucher_no
                    WHERE linked.tenant_id=NEW.tenant_id
                      AND linked.account=NEW.account
                      AND linked.currency=NEW.currency
                      AND linked.currency_scale=NEW.currency_scale
                      AND date(linked.posting_at)>=date(json_extract(b.payload_json,'$.start_date'))
                      AND date(linked.posting_at)<=date(NEW.posting_at)
                      AND json_extract(linked_doc.payload_json,'$.company')=json_extract(b.payload_json,'$.company')
                      AND (
                        json_extract(b.payload_json,'$.budget_against')='Company'
                        OR (
                          json_extract(b.payload_json,'$.budget_against')='Branch'
                          AND COALESCE(NULLIF(json_extract(linked_doc.payload_json,'$.branch'),''),
                                       NULLIF(json_extract(linked.dimensions_json,'$.branch'),''),'')
                              =COALESCE(json_extract(b.payload_json,'$.branch'),'')
                        )
                        OR (
                          json_extract(b.payload_json,'$.budget_against')='Cost Center'
                          AND COALESCE(NULLIF(linked.cost_center,''),
                                       NULLIF(json_extract(linked.dimensions_json,'$.cost_center'),''),'')
                              =COALESCE(json_extract(b.payload_json,'$.cost_center'),'')
                        )
                        OR (
                          json_extract(b.payload_json,'$.budget_against')='Project'
                          AND COALESCE(NULLIF(json_extract(linked_doc.payload_json,'$.project'),''),
                                       NULLIF(json_extract(linked.dimensions_json,'$.project'),''),'')
                              =COALESCE(json_extract(b.payload_json,'$.project'),'')
                        )
                      )
                      AND (
                        (
                          source_commitment.source_doctype='Expense Claim'
                          AND linked.voucher_type='Expense Claim'
                          AND linked.voucher_no=source_commitment.source_name
                        )
                        OR (
                          source_commitment.source_doctype IN ('Purchase Order','Material Request')
                          AND linked.voucher_type='Purchase Invoice'
                          AND EXISTS (
                            SELECT 1
                            FROM json_each(json_extract(linked_doc.payload_json,'$.items')) AS item
                            WHERE (
                              linked.line_key='EXPENSE-' || COALESCE(json_extract(item.value,'$.row_id'),'')
                              OR linked.line_key='REV-EXPENSE-' || COALESCE(json_extract(item.value,'$.row_id'),'')
                            )
                            AND (
                              (
                                source_commitment.source_doctype='Purchase Order'
                                AND COALESCE(
                                  NULLIF(json_extract(item.value,'$.purchase_order'),''),
                                  NULLIF(json_extract(linked_doc.payload_json,'$.against_purchase_order'),''),
                                  ''
                                )=source_commitment.source_name
                              )
                              OR (
                                source_commitment.source_doctype='Material Request'
                                AND COALESCE(NULLIF(json_extract(item.value,'$.material_request'),''),'')
                                    =source_commitment.source_name
                              )
                            )
                          )
                        )
                      )
                  ),0)
                  + CASE WHEN (
                    (
                      source_commitment.source_doctype='Expense Claim'
                      AND NEW.voucher_type='Expense Claim'
                      AND NEW.voucher_no=source_commitment.source_name
                    )
                    OR (
                      source_commitment.source_doctype IN ('Purchase Order','Material Request')
                      AND NEW.voucher_type='Purchase Invoice'
                      AND EXISTS (
                        SELECT 1
                        FROM json_each(json_extract(v.payload_json,'$.items')) AS current_item
                        WHERE (
                          NEW.line_key='EXPENSE-' || COALESCE(json_extract(current_item.value,'$.row_id'),'')
                          OR NEW.line_key='REV-EXPENSE-' || COALESCE(json_extract(current_item.value,'$.row_id'),'')
                        )
                        AND (
                          (
                            source_commitment.source_doctype='Purchase Order'
                            AND COALESCE(
                              NULLIF(json_extract(current_item.value,'$.purchase_order'),''),
                              NULLIF(json_extract(v.payload_json,'$.against_purchase_order'),''),
                              ''
                            )=source_commitment.source_name
                          )
                          OR (
                            source_commitment.source_doctype='Material Request'
                            AND COALESCE(NULLIF(json_extract(current_item.value,'$.material_request'),''),'')
                                =source_commitment.source_name
                          )
                        )
                      )
                    )
                  ) THEN
                    CASE COALESCE(a.root_type,'')
                      WHEN 'Income' THEN NEW.credit_minor-NEW.debit_minor
                      ELSE NEW.debit_minor-NEW.credit_minor
                    END
                  ELSE 0 END,
                  0
                )
              ),
              0
            )
          )
          FROM (
            SELECT
              json_extract(cm.payload_json,'$.source_doctype') AS source_doctype,
              json_extract(cm.payload_json,'$.source_name') AS source_name,
              SUM(
                CASE json_extract(cm.payload_json,'$.commitment_type')
                  WHEN 'Reserve' THEN CAST(COALESCE(json_extract(cm.payload_json,'$.amount_minor'),0) AS INTEGER)
                  WHEN 'Release' THEN -CAST(COALESCE(json_extract(cm.payload_json,'$.amount_minor'),0) AS INTEGER)
                  ELSE 0
                END
              ) AS raw_minor
            FROM documents cm
            WHERE cm.tenant_id=NEW.tenant_id
              AND cm.doctype='Finance Budget Commitment'
              AND cm.docstatus=1
              AND json_extract(cm.payload_json,'$.budget')=b.name
              AND date(json_extract(cm.payload_json,'$.posting_date'))>=date(json_extract(b.payload_json,'$.start_date'))
              AND date(json_extract(cm.payload_json,'$.posting_date'))<=date(NEW.posting_at)
            GROUP BY source_doctype,source_name
          ) AS source_commitment
        ),0)
      ) > (
        SELECT CASE
          WHEN distribution_enabled<>1 THEN annual_minor
          WHEN distribution_weight_total BETWEEN 1 AND 10000
            AND accumulated_weight BETWEEN 0 AND distribution_weight_total
            THEN
              CAST(annual_minor / distribution_weight_total AS INTEGER) * accumulated_weight
              + CAST((
                  (annual_minor % distribution_weight_total) * accumulated_weight
                  + CAST(distribution_weight_total / 2 AS INTEGER)
                ) / distribution_weight_total AS INTEGER)
          ELSE -1
        END
        FROM (
          SELECT
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
              ),0) AS annual_minor,
            COALESCE(CAST(json_extract(b.payload_json,'$.fiscal_distribution_enabled') AS INTEGER),0) AS distribution_enabled,
            CAST(COALESCE(json_extract(b.payload_json,'$.distribution_weight_total'),0) AS INTEGER) AS distribution_weight_total,
            COALESCE((
              SELECT SUM(CAST(COALESCE(json_extract(dist.value,'$.allocation_weight'),0) AS INTEGER))
              FROM json_each(COALESCE(json_extract(b.payload_json,'$.budget_distribution'),json('[]'))) AS dist
              WHERE date(json_extract(dist.value,'$.start_date'))<=date(NEW.posting_at)
            ),0) AS accumulated_weight
        ) AS distribution_limit
      )
  ) THEN RAISE(ABORT,'FINANCE_BUDGET_TRANSACTION_EXCEEDED') END;
END;


-- Replace raw annual-only commitment submission guards. Source/amount/lifecycle validation
-- stays here; projected Stop is enforced by the source-net actual+commitment triggers below.
DROP TRIGGER IF EXISTS finance_budget_commitment_submit_guard;
DROP TRIGGER IF EXISTS finance_budget_commitment_update_guard;
DROP TRIGGER IF EXISTS finance_budget_commitment_update_submission_closure;
DROP TRIGGER IF EXISTS finance_budget_commitment_projected_stop_insert_guard;
DROP TRIGGER IF EXISTS finance_budget_commitment_projected_stop_update_guard;

CREATE TRIGGER finance_budget_commitment_submit_guard
BEFORE INSERT ON documents
WHEN NEW.doctype='Finance Budget Commitment' AND NEW.docstatus=1
BEGIN
  SELECT CASE
    WHEN NOT EXISTS(
      SELECT 1 FROM documents b
      WHERE b.tenant_id=NEW.tenant_id AND b.doctype='Finance Budget'
        AND b.name=json_extract(NEW.payload_json,'$.budget') AND b.docstatus=1
    ) THEN RAISE(ABORT,'FINANCE_BUDGET_COMMITMENT_BUDGET_REQUIRED')
    WHEN COALESCE(json_extract(NEW.payload_json,'$.commitment_type'),'') NOT IN ('Reserve','Release')
      OR COALESCE(CAST(json_extract(NEW.payload_json,'$.amount_minor') AS INTEGER),0)<=0
      THEN RAISE(ABORT,'FINANCE_BUDGET_COMMITMENT_AMOUNT_INVALID')
    WHEN NOT EXISTS(
      SELECT 1 FROM documents s
      WHERE s.tenant_id=NEW.tenant_id
        AND s.doctype=json_extract(NEW.payload_json,'$.source_doctype')
        AND s.name=json_extract(NEW.payload_json,'$.source_name')
        AND s.docstatus=1
    ) THEN RAISE(ABORT,'FINANCE_BUDGET_COMMITMENT_SOURCE_REQUIRED')
    WHEN json_extract(NEW.payload_json,'$.commitment_type')='Release' AND (
      SELECT COALESCE(SUM(
        CASE json_extract(c.payload_json,'$.commitment_type')
          WHEN 'Reserve' THEN CAST(json_extract(c.payload_json,'$.amount_minor') AS INTEGER)
          ELSE -CAST(json_extract(c.payload_json,'$.amount_minor') AS INTEGER)
        END
      ),0)
      FROM documents c
      WHERE c.tenant_id=NEW.tenant_id
        AND c.doctype='Finance Budget Commitment'
        AND c.docstatus=1
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
      WHERE c.tenant_id=NEW.tenant_id
        AND c.doctype='Finance Budget Commitment'
        AND c.docstatus=1
        AND json_extract(c.payload_json,'$.budget')=json_extract(NEW.payload_json,'$.budget')
    ) + CASE json_extract(NEW.payload_json,'$.commitment_type')
          WHEN 'Reserve' THEN CAST(json_extract(NEW.payload_json,'$.amount_minor') AS INTEGER)
          ELSE -CAST(json_extract(NEW.payload_json,'$.amount_minor') AS INTEGER)
        END < 0
      THEN RAISE(ABORT,'FINANCE_BUDGET_COMMITMENT_NEGATIVE')
  END;
END;

CREATE TRIGGER finance_budget_commitment_update_guard
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
    WHEN NOT EXISTS(
      SELECT 1 FROM documents s
      WHERE s.tenant_id=NEW.tenant_id
        AND s.doctype=json_extract(NEW.payload_json,'$.source_doctype')
        AND s.name=json_extract(NEW.payload_json,'$.source_name')
        AND s.docstatus=1
    ) THEN RAISE(ABORT,'FINANCE_BUDGET_COMMITMENT_SOURCE_REQUIRED')
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
    WHEN COALESCE(json_extract(NEW.payload_json,'$.commitment_type'),'') NOT IN ('Reserve','Release')
      OR COALESCE(CAST(json_extract(NEW.payload_json,'$.amount_minor') AS INTEGER),0)<=0
      THEN RAISE(ABORT,'FINANCE_BUDGET_COMMITMENT_AMOUNT_INVALID')
    WHEN json_extract(NEW.payload_json,'$.commitment_type')='Release' AND (
      SELECT COALESCE(SUM(
        CASE json_extract(c.payload_json,'$.commitment_type')
          WHEN 'Reserve' THEN CAST(json_extract(c.payload_json,'$.amount_minor') AS INTEGER)
          ELSE -CAST(json_extract(c.payload_json,'$.amount_minor') AS INTEGER)
        END
      ),0)
      FROM documents c
      WHERE c.tenant_id=NEW.tenant_id
        AND c.doctype='Finance Budget Commitment'
        AND c.docstatus=1
        AND c.doc_key<>OLD.doc_key
        AND json_extract(c.payload_json,'$.budget')=json_extract(NEW.payload_json,'$.budget')
        AND json_extract(c.payload_json,'$.source_doctype')=json_extract(NEW.payload_json,'$.source_doctype')
        AND json_extract(c.payload_json,'$.source_name')=json_extract(NEW.payload_json,'$.source_name')
    ) < CAST(json_extract(NEW.payload_json,'$.amount_minor') AS INTEGER)
      THEN RAISE(ABORT,'FINANCE_BUDGET_RELEASE_EXCEEDS_SOURCE')
  END;
END;

CREATE TRIGGER finance_budget_commitment_projected_stop_insert_guard
BEFORE INSERT ON documents
WHEN NEW.doctype='Finance Budget Commitment' AND NEW.docstatus=1
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1
    FROM documents b
    LEFT JOIN finance_historical_accounts a
      ON a.tenant_id=b.tenant_id
     AND a.name=json_extract(b.payload_json,'$.account')
     AND (a.company=json_extract(b.payload_json,'$.company') OR a.company IS NULL OR a.company='')
    WHERE b.tenant_id=NEW.tenant_id
      AND b.doctype='Finance Budget'
      AND b.name=json_extract(NEW.payload_json,'$.budget')
      AND b.docstatus=1
      AND COALESCE(json_extract(b.payload_json,'$.control_action'),'Stop')='Stop'
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
            ON d.tenant_id=g.tenant_id AND d.doctype=g.voucher_type AND d.name=g.voucher_no
          WHERE g.tenant_id=NEW.tenant_id
            AND g.voucher_type<>'Period Closing Voucher'
            AND g.account=json_extract(b.payload_json,'$.account')
            AND g.currency=json_extract(b.payload_json,'$.currency')
            AND g.currency_scale=CAST(COALESCE(json_extract(b.payload_json,'$.currency_scale'),2) AS INTEGER)
            AND json_extract(d.payload_json,'$.company')=json_extract(b.payload_json,'$.company')
            AND date(g.posting_at)>=date(json_extract(b.payload_json,'$.start_date'))
            AND date(g.posting_at)<=date(json_extract(NEW.payload_json,'$.posting_date'))
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
        + COALESCE((
          SELECT SUM(
            MAX(
              sc.raw_minor
              - MIN(
                MAX(sc.raw_minor,0),
                MAX(COALESCE((
                  SELECT SUM(
                    CASE COALESCE(a.root_type,'')
                      WHEN 'Income' THEN linked.credit_minor-linked.debit_minor
                      ELSE linked.debit_minor-linked.credit_minor
                    END
                  )
                  FROM gl_entries linked
                  INNER JOIN documents linked_doc
                    ON linked_doc.tenant_id=linked.tenant_id
                   AND linked_doc.doctype=linked.voucher_type
                   AND linked_doc.name=linked.voucher_no
                  WHERE linked.tenant_id=NEW.tenant_id
                    AND linked.account=json_extract(b.payload_json,'$.account')
                    AND linked.currency=json_extract(b.payload_json,'$.currency')
                    AND linked.currency_scale=CAST(COALESCE(json_extract(b.payload_json,'$.currency_scale'),2) AS INTEGER)
                    AND date(linked.posting_at)>=date(json_extract(b.payload_json,'$.start_date'))
                    AND date(linked.posting_at)<=date(json_extract(NEW.payload_json,'$.posting_date'))
                    AND json_extract(linked_doc.payload_json,'$.company')=json_extract(b.payload_json,'$.company')
                    AND (
                      json_extract(b.payload_json,'$.budget_against')='Company'
                      OR (
                        json_extract(b.payload_json,'$.budget_against')='Branch'
                        AND COALESCE(NULLIF(json_extract(linked_doc.payload_json,'$.branch'),''),
                                     NULLIF(json_extract(linked.dimensions_json,'$.branch'),''),'')
                            =COALESCE(json_extract(b.payload_json,'$.branch'),'')
                      )
                      OR (
                        json_extract(b.payload_json,'$.budget_against')='Cost Center'
                        AND COALESCE(NULLIF(linked.cost_center,''),
                                     NULLIF(json_extract(linked.dimensions_json,'$.cost_center'),''),'')
                            =COALESCE(json_extract(b.payload_json,'$.cost_center'),'')
                      )
                      OR (
                        json_extract(b.payload_json,'$.budget_against')='Project'
                        AND COALESCE(NULLIF(json_extract(linked_doc.payload_json,'$.project'),''),
                                     NULLIF(json_extract(linked.dimensions_json,'$.project'),''),'')
                            =COALESCE(json_extract(b.payload_json,'$.project'),'')
                      )
                    )
                    AND (
                      (
                        sc.source_doctype='Expense Claim'
                        AND linked.voucher_type='Expense Claim'
                        AND linked.voucher_no=sc.source_name
                      )
                      OR (
                        sc.source_doctype IN ('Purchase Order','Material Request')
                        AND linked.voucher_type='Purchase Invoice'
                        AND EXISTS (
                          SELECT 1
                          FROM json_each(json_extract(linked_doc.payload_json,'$.items')) AS item
                          WHERE (
                            linked.line_key='EXPENSE-' || COALESCE(json_extract(item.value,'$.row_id'),'')
                            OR linked.line_key='REV-EXPENSE-' || COALESCE(json_extract(item.value,'$.row_id'),'')
                          )
                          AND (
                            (
                              sc.source_doctype='Purchase Order'
                              AND COALESCE(
                                NULLIF(json_extract(item.value,'$.purchase_order'),''),
                                NULLIF(json_extract(linked_doc.payload_json,'$.against_purchase_order'),''),
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
          )
          FROM (
            SELECT source_doctype,source_name,SUM(effect_minor) AS raw_minor
            FROM (
              SELECT
                COALESCE(json_extract(c.payload_json,'$.source_doctype'),'') AS source_doctype,
                COALESCE(json_extract(c.payload_json,'$.source_name'),'') AS source_name,
                CASE json_extract(c.payload_json,'$.commitment_type')
                  WHEN 'Reserve' THEN CAST(COALESCE(json_extract(c.payload_json,'$.amount_minor'),0) AS INTEGER)
                  WHEN 'Release' THEN -CAST(COALESCE(json_extract(c.payload_json,'$.amount_minor'),0) AS INTEGER)
                  ELSE 0
                END AS effect_minor
              FROM documents c
              WHERE c.tenant_id=NEW.tenant_id
                AND c.doctype='Finance Budget Commitment'
                AND c.docstatus=1
                AND json_extract(c.payload_json,'$.budget')=b.name
                AND date(json_extract(c.payload_json,'$.posting_date'))>=date(json_extract(b.payload_json,'$.start_date'))
                AND date(json_extract(c.payload_json,'$.posting_date'))<=date(json_extract(NEW.payload_json,'$.posting_date'))
              UNION ALL
              SELECT
                COALESCE(json_extract(NEW.payload_json,'$.source_doctype'),''),
                COALESCE(json_extract(NEW.payload_json,'$.source_name'),''),
                CASE json_extract(NEW.payload_json,'$.commitment_type')
                  WHEN 'Reserve' THEN CAST(COALESCE(json_extract(NEW.payload_json,'$.amount_minor'),0) AS INTEGER)
                  WHEN 'Release' THEN -CAST(COALESCE(json_extract(NEW.payload_json,'$.amount_minor'),0) AS INTEGER)
                  ELSE 0
                END
            ) all_commitments
            GROUP BY source_doctype,source_name
          ) sc
        ),0)
      ) > (
        SELECT CASE
          WHEN distribution_enabled<>1 THEN annual_minor
          WHEN distribution_weight_total BETWEEN 1 AND 10000
            AND accumulated_weight BETWEEN 0 AND distribution_weight_total
            THEN
              CAST(annual_minor / distribution_weight_total AS INTEGER) * accumulated_weight
              + CAST((
                  (annual_minor % distribution_weight_total) * accumulated_weight
                  + CAST(distribution_weight_total / 2 AS INTEGER)
                ) / distribution_weight_total AS INTEGER)
          ELSE -1
        END
        FROM (
          SELECT
            CAST(COALESCE(json_extract(b.payload_json,'$.budget_amount_minor'),0) AS INTEGER)
              + COALESCE((
                SELECT SUM(CAST(COALESCE(json_extract(r.payload_json,'$.delta_amount_minor'),0) AS INTEGER))
                FROM documents r
                WHERE r.tenant_id=NEW.tenant_id
                  AND r.doctype='Finance Budget Revision'
                  AND r.docstatus=1
                  AND json_extract(r.payload_json,'$.budget')=b.name
                  AND date(json_extract(r.payload_json,'$.posting_date'))>=date(json_extract(b.payload_json,'$.start_date'))
                  AND date(json_extract(r.payload_json,'$.posting_date'))<=date(json_extract(NEW.payload_json,'$.posting_date'))
              ),0) AS annual_minor,
            COALESCE(CAST(json_extract(b.payload_json,'$.fiscal_distribution_enabled') AS INTEGER),0) AS distribution_enabled,
            CAST(COALESCE(json_extract(b.payload_json,'$.distribution_weight_total'),0) AS INTEGER) AS distribution_weight_total,
            COALESCE((
              SELECT SUM(CAST(COALESCE(json_extract(dist.value,'$.allocation_weight'),0) AS INTEGER))
              FROM json_each(COALESCE(json_extract(b.payload_json,'$.budget_distribution'),json('[]'))) AS dist
              WHERE date(json_extract(dist.value,'$.start_date'))<=date(json_extract(NEW.payload_json,'$.posting_date'))
            ),0) AS accumulated_weight
        ) distribution_limit
      )
  ) THEN RAISE(ABORT,'FINANCE_BUDGET_TRANSACTION_EXCEEDED') END;
END;

CREATE TRIGGER finance_budget_commitment_projected_stop_update_guard
BEFORE UPDATE ON documents
WHEN NEW.doctype='Finance Budget Commitment' AND OLD.docstatus<>1 AND NEW.docstatus=1
BEGIN
  -- Draft -> submitted has no previously submitted OLD row, so the INSERT projection is
  -- identical except that NEW already occupies the documents slot as a draft. Submitted
  -- source CTE ignores docstatus 0 and UNION ALL adds the authoritative NEW effect.
  SELECT CASE WHEN EXISTS (
    SELECT 1
    FROM documents b
    LEFT JOIN finance_historical_accounts a
      ON a.tenant_id=b.tenant_id
     AND a.name=json_extract(b.payload_json,'$.account')
     AND (a.company=json_extract(b.payload_json,'$.company') OR a.company IS NULL OR a.company='')
    WHERE b.tenant_id=NEW.tenant_id
      AND b.doctype='Finance Budget'
      AND b.name=json_extract(NEW.payload_json,'$.budget')
      AND b.docstatus=1
      AND COALESCE(json_extract(b.payload_json,'$.control_action'),'Stop')='Stop'
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
            ON d.tenant_id=g.tenant_id AND d.doctype=g.voucher_type AND d.name=g.voucher_no
          WHERE g.tenant_id=NEW.tenant_id
            AND g.voucher_type<>'Period Closing Voucher'
            AND g.account=json_extract(b.payload_json,'$.account')
            AND g.currency=json_extract(b.payload_json,'$.currency')
            AND g.currency_scale=CAST(COALESCE(json_extract(b.payload_json,'$.currency_scale'),2) AS INTEGER)
            AND json_extract(d.payload_json,'$.company')=json_extract(b.payload_json,'$.company')
            AND date(g.posting_at)>=date(json_extract(b.payload_json,'$.start_date'))
            AND date(g.posting_at)<=date(json_extract(NEW.payload_json,'$.posting_date'))
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
        + COALESCE((
          SELECT SUM(
            MAX(
              sc.raw_minor
              - MIN(
                MAX(sc.raw_minor,0),
                MAX(COALESCE((
                  SELECT SUM(
                    CASE COALESCE(a.root_type,'')
                      WHEN 'Income' THEN linked.credit_minor-linked.debit_minor
                      ELSE linked.debit_minor-linked.credit_minor
                    END
                  )
                  FROM gl_entries linked
                  INNER JOIN documents linked_doc
                    ON linked_doc.tenant_id=linked.tenant_id
                   AND linked_doc.doctype=linked.voucher_type
                   AND linked_doc.name=linked.voucher_no
                  WHERE linked.tenant_id=NEW.tenant_id
                    AND linked.account=json_extract(b.payload_json,'$.account')
                    AND linked.currency=json_extract(b.payload_json,'$.currency')
                    AND linked.currency_scale=CAST(COALESCE(json_extract(b.payload_json,'$.currency_scale'),2) AS INTEGER)
                    AND date(linked.posting_at)>=date(json_extract(b.payload_json,'$.start_date'))
                    AND date(linked.posting_at)<=date(json_extract(NEW.payload_json,'$.posting_date'))
                    AND json_extract(linked_doc.payload_json,'$.company')=json_extract(b.payload_json,'$.company')
                    AND (
                      json_extract(b.payload_json,'$.budget_against')='Company'
                      OR (
                        json_extract(b.payload_json,'$.budget_against')='Branch'
                        AND COALESCE(NULLIF(json_extract(linked_doc.payload_json,'$.branch'),''),
                                     NULLIF(json_extract(linked.dimensions_json,'$.branch'),''),'')
                            =COALESCE(json_extract(b.payload_json,'$.branch'),'')
                      )
                      OR (
                        json_extract(b.payload_json,'$.budget_against')='Cost Center'
                        AND COALESCE(NULLIF(linked.cost_center,''),
                                     NULLIF(json_extract(linked.dimensions_json,'$.cost_center'),''),'')
                            =COALESCE(json_extract(b.payload_json,'$.cost_center'),'')
                      )
                      OR (
                        json_extract(b.payload_json,'$.budget_against')='Project'
                        AND COALESCE(NULLIF(json_extract(linked_doc.payload_json,'$.project'),''),
                                     NULLIF(json_extract(linked.dimensions_json,'$.project'),''),'')
                            =COALESCE(json_extract(b.payload_json,'$.project'),'')
                      )
                    )
                    AND (
                      (
                        sc.source_doctype='Expense Claim'
                        AND linked.voucher_type='Expense Claim'
                        AND linked.voucher_no=sc.source_name
                      )
                      OR (
                        sc.source_doctype IN ('Purchase Order','Material Request')
                        AND linked.voucher_type='Purchase Invoice'
                        AND EXISTS (
                          SELECT 1
                          FROM json_each(json_extract(linked_doc.payload_json,'$.items')) AS item
                          WHERE (
                            linked.line_key='EXPENSE-' || COALESCE(json_extract(item.value,'$.row_id'),'')
                            OR linked.line_key='REV-EXPENSE-' || COALESCE(json_extract(item.value,'$.row_id'),'')
                          )
                          AND (
                            (
                              sc.source_doctype='Purchase Order'
                              AND COALESCE(
                                NULLIF(json_extract(item.value,'$.purchase_order'),''),
                                NULLIF(json_extract(linked_doc.payload_json,'$.against_purchase_order'),''),
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
          )
          FROM (
            SELECT source_doctype,source_name,SUM(effect_minor) AS raw_minor
            FROM (
              SELECT
                COALESCE(json_extract(c.payload_json,'$.source_doctype'),'') AS source_doctype,
                COALESCE(json_extract(c.payload_json,'$.source_name'),'') AS source_name,
                CASE json_extract(c.payload_json,'$.commitment_type')
                  WHEN 'Reserve' THEN CAST(COALESCE(json_extract(c.payload_json,'$.amount_minor'),0) AS INTEGER)
                  WHEN 'Release' THEN -CAST(COALESCE(json_extract(c.payload_json,'$.amount_minor'),0) AS INTEGER)
                  ELSE 0
                END AS effect_minor
              FROM documents c
              WHERE c.tenant_id=NEW.tenant_id
                AND c.doctype='Finance Budget Commitment'
                AND c.docstatus=1
                AND c.doc_key<>OLD.doc_key
                AND json_extract(c.payload_json,'$.budget')=b.name
                AND date(json_extract(c.payload_json,'$.posting_date'))>=date(json_extract(b.payload_json,'$.start_date'))
                AND date(json_extract(c.payload_json,'$.posting_date'))<=date(json_extract(NEW.payload_json,'$.posting_date'))
              UNION ALL
              SELECT
                COALESCE(json_extract(NEW.payload_json,'$.source_doctype'),''),
                COALESCE(json_extract(NEW.payload_json,'$.source_name'),''),
                CASE json_extract(NEW.payload_json,'$.commitment_type')
                  WHEN 'Reserve' THEN CAST(COALESCE(json_extract(NEW.payload_json,'$.amount_minor'),0) AS INTEGER)
                  WHEN 'Release' THEN -CAST(COALESCE(json_extract(NEW.payload_json,'$.amount_minor'),0) AS INTEGER)
                  ELSE 0
                END
            ) all_commitments
            GROUP BY source_doctype,source_name
          ) sc
        ),0)
      ) > (
        SELECT CASE
          WHEN distribution_enabled<>1 THEN annual_minor
          WHEN distribution_weight_total BETWEEN 1 AND 10000
            AND accumulated_weight BETWEEN 0 AND distribution_weight_total
            THEN
              CAST(annual_minor / distribution_weight_total AS INTEGER) * accumulated_weight
              + CAST((
                  (annual_minor % distribution_weight_total) * accumulated_weight
                  + CAST(distribution_weight_total / 2 AS INTEGER)
                ) / distribution_weight_total AS INTEGER)
          ELSE -1
        END
        FROM (
          SELECT
            CAST(COALESCE(json_extract(b.payload_json,'$.budget_amount_minor'),0) AS INTEGER)
              + COALESCE((
                SELECT SUM(CAST(COALESCE(json_extract(r.payload_json,'$.delta_amount_minor'),0) AS INTEGER))
                FROM documents r
                WHERE r.tenant_id=NEW.tenant_id
                  AND r.doctype='Finance Budget Revision'
                  AND r.docstatus=1
                  AND json_extract(r.payload_json,'$.budget')=b.name
                  AND date(json_extract(r.payload_json,'$.posting_date'))>=date(json_extract(b.payload_json,'$.start_date'))
                  AND date(json_extract(r.payload_json,'$.posting_date'))<=date(json_extract(NEW.payload_json,'$.posting_date'))
              ),0) AS annual_minor,
            COALESCE(CAST(json_extract(b.payload_json,'$.fiscal_distribution_enabled') AS INTEGER),0) AS distribution_enabled,
            CAST(COALESCE(json_extract(b.payload_json,'$.distribution_weight_total'),0) AS INTEGER) AS distribution_weight_total,
            COALESCE((
              SELECT SUM(CAST(COALESCE(json_extract(dist.value,'$.allocation_weight'),0) AS INTEGER))
              FROM json_each(COALESCE(json_extract(b.payload_json,'$.budget_distribution'),json('[]'))) AS dist
              WHERE date(json_extract(dist.value,'$.start_date'))<=date(json_extract(NEW.payload_json,'$.posting_date'))
            ),0) AS accumulated_weight
        ) distribution_limit
      )
  ) THEN RAISE(ABORT,'FINANCE_BUDGET_TRANSACTION_EXCEEDED') END;
END;
