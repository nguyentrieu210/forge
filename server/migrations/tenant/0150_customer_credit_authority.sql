-- R8-B: atomic customer credit-limit authority.
--
-- Customer credit policy is resolved by the selling controller and frozen on submitted
-- Sales Order / Sales Invoice documents in company-currency minor units.  The database
-- remains the final authority: concurrent submits cannot both pass a read-then-write check.
--
-- Exposure is not a shadow AR ledger:
--   * posted receivables come from canonical Payment Ledger;
--   * unbilled order exposure is derived from submitted Sales Orders + canonical billing progress.

DROP VIEW IF EXISTS customer_credit_exposure;
DROP VIEW IF EXISTS customer_receivable_credit_exposure;
DROP VIEW IF EXISTS customer_open_sales_order_credit_exposure;

CREATE VIEW customer_open_sales_order_credit_exposure AS
WITH line_state AS (
  SELECT
    d.tenant_id,
    d.name AS sales_order,
    json_extract(d.payload_json,'$.customer') AS customer,
    json_extract(d.payload_json,'$.company') AS company,
    CAST(COALESCE(json_extract(d.payload_json,'$.base_grand_total_minor'),0) AS INTEGER) AS base_grand_total_minor,
    c.row_id,
    CAST(COALESCE(
      json_extract(c.payload_json,'$.net_amount_minor'),
      json_extract(c.payload_json,'$.amount_minor'),
      0
    ) AS INTEGER) AS line_amount_minor,
    CAST(COALESCE(
      json_extract(c.payload_json,'$.qty_micros'),
      0
    ) AS INTEGER) AS ordered_qty_micros,
    COALESCE((
      SELECT SUM(f.qty_micros)
      FROM sales_line_fulfillment_entries f
      WHERE f.tenant_id=d.tenant_id
        AND f.sales_order=d.name
        AND f.kind='Billing'
        AND f.sales_order_line_key=c.row_id
    ),0) AS billed_qty_micros
  FROM documents d
  JOIN document_children c
    ON c.tenant_id=d.tenant_id
   AND c.parent_key=d.doc_key
   AND c.fieldname='items'
  WHERE d.doctype='Sales Order'
    AND d.docstatus=1
    AND COALESCE(CAST(json_extract(d.payload_json,'$.credit_limit_bypass_sales_order') AS INTEGER),0)=0
),
order_weight AS (
  SELECT
    tenant_id,
    sales_order,
    customer,
    company,
    base_grand_total_minor,
    SUM(CASE
      WHEN line_amount_minor<=0 OR ordered_qty_micros<=0 THEN 0.0
      WHEN billed_qty_micros>=ordered_qty_micros THEN 0.0
      ELSE CAST(line_amount_minor AS REAL)
           * CAST(ordered_qty_micros-billed_qty_micros AS REAL)
           / CAST(ordered_qty_micros AS REAL)
    END) AS open_weight,
    SUM(CASE WHEN line_amount_minor>0 THEN line_amount_minor ELSE 0 END) AS total_weight
  FROM line_state
  GROUP BY tenant_id,sales_order,customer,company,base_grand_total_minor
)
SELECT
  tenant_id,
  customer,
  company,
  sales_order,
  CASE
    WHEN base_grand_total_minor<=0 OR open_weight<=0 THEN 0
    WHEN total_weight<=0 THEN base_grand_total_minor
    ELSE CAST(ROUND(
      CAST(base_grand_total_minor AS REAL) * open_weight / CAST(total_weight AS REAL)
    ) AS INTEGER)
  END AS exposure_minor
FROM order_weight;

CREATE VIEW customer_receivable_credit_exposure AS
SELECT
  p.tenant_id,
  p.party AS customer,
  json_extract(i.payload_json,'$.company') AS company,
  SUM(p.base_amount_minor) AS exposure_minor
FROM payment_ledger_entries p
JOIN documents i
  ON i.tenant_id=p.tenant_id
 AND i.doctype='Sales Invoice'
 AND i.name=p.against_voucher_no
WHERE p.account_type='Receivable'
  AND p.party_type='Customer'
  AND p.against_voucher_type='Sales Invoice'
  AND p.against_voucher_no IS NOT NULL
GROUP BY p.tenant_id,p.party,json_extract(i.payload_json,'$.company');

CREATE VIEW customer_credit_exposure AS
SELECT tenant_id,customer,company,SUM(exposure_minor) AS exposure_minor
FROM (
  SELECT tenant_id,customer,company,exposure_minor
  FROM customer_receivable_credit_exposure
  UNION ALL
  SELECT tenant_id,customer,company,exposure_minor
  FROM customer_open_sales_order_credit_exposure
)
GROUP BY tenant_id,customer,company;

DROP TRIGGER IF EXISTS sales_order_credit_limit_guard;
CREATE TRIGGER sales_order_credit_limit_guard
BEFORE UPDATE OF docstatus,payload_json ON documents
WHEN NEW.doctype='Sales Order'
 AND OLD.docstatus=0
 AND NEW.docstatus=1
 AND COALESCE(CAST(json_extract(NEW.payload_json,'$.credit_limit_enforced') AS INTEGER),0)=1
BEGIN
  SELECT CASE
    WHEN COALESCE((
      SELECT exposure_minor
      FROM customer_credit_exposure
      WHERE tenant_id=NEW.tenant_id
        AND customer=json_extract(NEW.payload_json,'$.customer')
        AND company=json_extract(NEW.payload_json,'$.company')
    ),0)
    + CAST(COALESCE(json_extract(NEW.payload_json,'$.base_grand_total_minor'),0) AS INTEGER)
    > CAST(COALESCE(json_extract(NEW.payload_json,'$.credit_limit_minor'),0) AS INTEGER)
    THEN RAISE(ABORT,'CUSTOMER_CREDIT_LIMIT_EXCEEDED')
  END;
END;

DROP TRIGGER IF EXISTS sales_invoice_credit_limit_guard;
CREATE TRIGGER sales_invoice_credit_limit_guard
BEFORE INSERT ON payment_ledger_entries
WHEN NEW.account_type='Receivable'
 AND NEW.party_type='Customer'
 AND NEW.amount_minor>0
 AND NEW.base_amount_minor>0
 AND NEW.against_voucher_type='Sales Invoice'
 AND NEW.against_voucher_no IS NOT NULL
 AND COALESCE(CAST((
   SELECT json_extract(payload_json,'$.credit_limit_enforced')
   FROM documents
   WHERE tenant_id=NEW.tenant_id
     AND doctype='Sales Invoice'
     AND name=NEW.against_voucher_no
 ) AS INTEGER),0)=1
BEGIN
  SELECT CASE
    WHEN COALESCE((
      SELECT exposure_minor
      FROM customer_credit_exposure
      WHERE tenant_id=NEW.tenant_id
        AND customer=NEW.party
        AND company=(
          SELECT json_extract(payload_json,'$.company')
          FROM documents
          WHERE tenant_id=NEW.tenant_id
            AND doctype='Sales Invoice'
            AND name=NEW.against_voucher_no
        )
    ),0)
    + NEW.base_amount_minor
    > CAST(COALESCE((
      SELECT json_extract(payload_json,'$.credit_limit_minor')
      FROM documents
      WHERE tenant_id=NEW.tenant_id
        AND doctype='Sales Invoice'
        AND name=NEW.against_voucher_no
    ),0) AS INTEGER)
    THEN RAISE(ABORT,'CUSTOMER_CREDIT_LIMIT_EXCEEDED')
  END;
END;
