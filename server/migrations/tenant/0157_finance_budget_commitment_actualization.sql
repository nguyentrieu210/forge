-- R8-B: automatic Finance Budget commitment consumption by canonical actual GL.
--
-- Commitments remain immutable Reserve/Release evidence. Availability uses only the
-- outstanding part of each source commitment after subtracting linked actual GL,
-- capped at the source's net reservation. Cancellation is append-only GL reversal,
-- so it automatically restores the reservation without synthetic Release documents.
--
-- Supported canonical sources:
--   * Purchase Order -> Purchase Invoice EXPENSE-{row_id} with exact PO row lineage
--   * Material Request -> Purchase Invoice EXPENSE-{row_id} with frozen MR lineage
--   * Expense Claim -> its own matching-account GL
--
-- The trigger includes NEW in source actualization before comparing Stop, keeping the
-- consumption and new actual atomic inside the same D1 insert.

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
