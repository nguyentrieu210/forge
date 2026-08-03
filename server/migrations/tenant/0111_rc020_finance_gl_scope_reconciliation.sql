-- RC-020 — company/branch report scope and reconciliation directly from canonical GL.
-- No shadow ledger is introduced. gl_entries remains the accounting authority;
-- company/branch are resolved from the source document, with branch dimensions as
-- a fallback only when the source document is company-scoped but branch-neutral.

DROP TRIGGER IF EXISTS finance_gl_source_scope_guard;
CREATE TRIGGER finance_gl_source_scope_guard
BEFORE INSERT ON gl_entries
BEGIN
  SELECT CASE
    WHEN NOT EXISTS (
      SELECT 1 FROM documents d
      WHERE d.tenant_id=NEW.tenant_id
        AND d.doctype=NEW.voucher_type
        AND d.name=NEW.voucher_no
        AND COALESCE(json_extract(d.payload_json,'$.company'),'')<>''
    ) THEN RAISE(ABORT,'GL_COMPANY_SCOPE_REQUIRED')
    WHEN EXISTS (
      SELECT 1 FROM documents d
      WHERE d.tenant_id=NEW.tenant_id
        AND d.doctype=NEW.voucher_type
        AND d.name=NEW.voucher_no
        AND COALESCE(json_extract(d.payload_json,'$.branch'),'')<>''
        AND COALESCE(json_extract(NEW.dimensions_json,'$.branch'),'')<>''
        AND json_extract(d.payload_json,'$.branch')<>json_extract(NEW.dimensions_json,'$.branch')
    ) THEN RAISE(ABORT,'GL_BRANCH_SCOPE_MISMATCH')
  END;
END;

-- LEFT JOIN deliberately preserves every historical GL row. If an old row has no
-- resolvable source scope it remains visible with NULL company/branch and is also
-- surfaced by finance_gl_integrity_exceptions. A report must not become "balanced"
-- by silently dropping bad history.
DROP VIEW IF EXISTS general_ledger_report;
CREATE VIEW general_ledger_report AS
SELECT
  g.tenant_id,
  json_extract(d.payload_json,'$.company') AS company,
  NULLIF(COALESCE(json_extract(d.payload_json,'$.branch'),json_extract(g.dimensions_json,'$.branch'),''),'') AS branch,
  g.posting_at,
  g.voucher_type,
  g.voucher_no,
  g.account,
  g.party_type,
  g.party,
  g.currency,
  g.currency_scale,
  CAST(g.debit_minor AS REAL) /
    CASE g.currency_scale
      WHEN 0 THEN 1 WHEN 1 THEN 10 WHEN 2 THEN 100 WHEN 3 THEN 1000
      WHEN 4 THEN 10000 WHEN 5 THEN 100000 ELSE 1000000
    END AS debit,
  CAST(g.credit_minor AS REAL) /
    CASE g.currency_scale
      WHEN 0 THEN 1 WHEN 1 THEN 10 WHEN 2 THEN 100 WHEN 3 THEN 1000
      WHEN 4 THEN 10000 WHEN 5 THEN 100000 ELSE 1000000
    END AS credit,
  g.cost_center
FROM gl_entries g
LEFT JOIN documents d
  ON d.tenant_id=g.tenant_id
 AND d.doctype=g.voucher_type
 AND d.name=g.voucher_no;

DROP VIEW IF EXISTS trial_balance;
CREATE VIEW trial_balance AS
SELECT
  g.tenant_id,
  json_extract(d.payload_json,'$.company') AS company,
  NULLIF(COALESCE(json_extract(d.payload_json,'$.branch'),json_extract(g.dimensions_json,'$.branch'),''),'') AS branch,
  g.account,
  g.currency,
  g.currency_scale,
  CAST(SUM(g.debit_minor) AS REAL) /
    CASE g.currency_scale
      WHEN 0 THEN 1 WHEN 1 THEN 10 WHEN 2 THEN 100 WHEN 3 THEN 1000
      WHEN 4 THEN 10000 WHEN 5 THEN 100000 ELSE 1000000
    END AS debit,
  CAST(SUM(g.credit_minor) AS REAL) /
    CASE g.currency_scale
      WHEN 0 THEN 1 WHEN 1 THEN 10 WHEN 2 THEN 100 WHEN 3 THEN 1000
      WHEN 4 THEN 10000 WHEN 5 THEN 100000 ELSE 1000000
    END AS credit,
  CAST(SUM(g.debit_minor-g.credit_minor) AS REAL) /
    CASE g.currency_scale
      WHEN 0 THEN 1 WHEN 1 THEN 10 WHEN 2 THEN 100 WHEN 3 THEN 1000
      WHEN 4 THEN 10000 WHEN 5 THEN 100000 ELSE 1000000
    END AS balance
FROM gl_entries g
LEFT JOIN documents d
  ON d.tenant_id=g.tenant_id
 AND d.doctype=g.voucher_type
 AND d.name=g.voucher_no
GROUP BY
  g.tenant_id,
  json_extract(d.payload_json,'$.company'),
  NULLIF(COALESCE(json_extract(d.payload_json,'$.branch'),json_extract(g.dimensions_json,'$.branch'),''),''),
  g.account,
  g.currency,
  g.currency_scale;

-- Voucher-revision reconciliation is computed from the same authoritative rows
-- that financial reports read. Zero difference is the invariant expected from
-- every committed accounting mutation after DocumentKernel.assertBalancedGl.
DROP VIEW IF EXISTS finance_gl_reconciliation;
CREATE VIEW finance_gl_reconciliation AS
SELECT
  g.tenant_id,
  json_extract(d.payload_json,'$.company') AS company,
  NULLIF(COALESCE(json_extract(d.payload_json,'$.branch'),json_extract(g.dimensions_json,'$.branch'),''),'') AS branch,
  g.voucher_type,
  g.voucher_no,
  g.voucher_revision,
  g.currency,
  g.currency_scale,
  SUM(g.debit_minor) AS debit_minor,
  SUM(g.credit_minor) AS credit_minor,
  SUM(g.debit_minor-g.credit_minor) AS difference_minor,
  COUNT(*) AS line_count,
  MIN(g.posting_at) AS first_posting_at,
  MAX(g.posting_at) AS last_posting_at
FROM gl_entries g
LEFT JOIN documents d
  ON d.tenant_id=g.tenant_id
 AND d.doctype=g.voucher_type
 AND d.name=g.voucher_no
GROUP BY
  g.tenant_id,
  json_extract(d.payload_json,'$.company'),
  NULLIF(COALESCE(json_extract(d.payload_json,'$.branch'),json_extract(g.dimensions_json,'$.branch'),''),''),
  g.voucher_type,
  g.voucher_no,
  g.voucher_revision,
  g.currency,
  g.currency_scale;

-- Machine-queryable reconciliation/failure evidence. A healthy ledger returns
-- zero rows. Historical defects are never removed or rewritten to make this clean.
DROP VIEW IF EXISTS finance_gl_integrity_exceptions;
CREATE VIEW finance_gl_integrity_exceptions AS
SELECT
  g.tenant_id,
  'CRITICAL' AS severity,
  'GL_SCOPE_MISSING' AS code,
  json_extract(d.payload_json,'$.company') AS company,
  NULLIF(COALESCE(json_extract(d.payload_json,'$.branch'),json_extract(g.dimensions_json,'$.branch'),''),'') AS branch,
  g.voucher_type,
  g.voucher_no,
  g.voucher_revision,
  'GL line has no authoritative source company scope' AS details
FROM gl_entries g
LEFT JOIN documents d
  ON d.tenant_id=g.tenant_id
 AND d.doctype=g.voucher_type
 AND d.name=g.voucher_no
WHERE COALESCE(json_extract(d.payload_json,'$.company'),'')=''
UNION ALL
SELECT
  r.tenant_id,
  'CRITICAL',
  'GL_VOUCHER_IMBALANCED',
  r.company,
  r.branch,
  r.voucher_type,
  r.voucher_no,
  r.voucher_revision,
  'Voucher revision debit and credit totals differ'
FROM finance_gl_reconciliation r
WHERE r.difference_minor<>0;
