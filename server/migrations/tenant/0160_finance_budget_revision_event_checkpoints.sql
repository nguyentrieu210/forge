-- R8-B: check every interval where fiscal budget utilization can change.
-- Period ends miss an overrun cleared by a later release/reversal. Event dates
-- and their preceding day cover each constant interval, including a proposed
-- revision date that is not visible yet to BEFORE INSERT/UPDATE triggers.
DROP VIEW IF EXISTS finance_budget_distribution_checkpoints;
CREATE VIEW finance_budget_distribution_checkpoints AS
WITH event_dates AS (
  SELECT b.tenant_id,b.name AS budget,json_extract(dist.value,'$.start_date') AS checkpoint_date
  FROM documents b JOIN json_each(json_extract(b.payload_json,'$.budget_distribution')) dist
  WHERE b.doctype='Finance Budget' AND b.docstatus=1
  UNION
  SELECT b.tenant_id,b.name,json_extract(dist.value,'$.end_date')
  FROM documents b JOIN json_each(json_extract(b.payload_json,'$.budget_distribution')) dist
  WHERE b.doctype='Finance Budget' AND b.docstatus=1
  UNION
  SELECT r.tenant_id,json_extract(r.payload_json,'$.budget'),json_extract(r.payload_json,'$.posting_date')
  FROM documents r WHERE r.doctype IN ('Finance Budget Revision','Finance Budget Commitment') AND r.docstatus=1
  UNION
  SELECT b.tenant_id,b.name,date(g.posting_at)
  FROM documents b JOIN gl_entries g ON g.tenant_id=b.tenant_id AND g.account=json_extract(b.payload_json,'$.account')
  WHERE b.doctype='Finance Budget' AND b.docstatus=1
), checkpoint_dates AS (
  SELECT tenant_id,budget,checkpoint_date FROM event_dates
  UNION
  SELECT tenant_id,budget,date(checkpoint_date,'-1 day') FROM event_dates
)
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
  cp.checkpoint_date AS checkpoint_date,
  COALESCE((
    SELECT SUM(CAST(COALESCE(json_extract(prior.value,'$.allocation_weight'),0) AS INTEGER))
    FROM json_each(json_extract(b.payload_json,'$.budget_distribution')) AS prior
    WHERE date(json_extract(prior.value,'$.start_date'))<=date(cp.checkpoint_date)
  ),0) AS accumulated_weight
FROM documents b
JOIN checkpoint_dates cp ON cp.tenant_id=b.tenant_id AND cp.budget=b.name
WHERE b.doctype='Finance Budget'
  AND b.docstatus=1
  AND COALESCE(CAST(json_extract(b.payload_json,'$.fiscal_distribution_enabled') AS INTEGER),0)=1
  AND cp.checkpoint_date BETWEEN json_extract(b.payload_json,'$.start_date') AND json_extract(b.payload_json,'$.end_date');

