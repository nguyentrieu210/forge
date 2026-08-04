-- R6 production certification found that HRM correctly declares Fiscal Year as an
-- external ERPNext DocType, but the platform standard catalogue did not contain it.
-- Keep the authority in the shared ERP catalogue so every tenant can adopt it through
-- provisionStandardCatalog(); do not copy this definition into HRM.

INSERT OR IGNORE INTO doctype_definitions (
  tenant_id,
  doctype,
  module,
  is_custom,
  is_submittable,
  is_child,
  revision,
  metadata_json,
  disabled,
  modified_by,
  modified_at
) VALUES (
  '__standard__',
  'Fiscal Year',
  'Accounts',
  0,
  0,
  0,
  1,
  '{"name":"Fiscal Year","module":"Accounts","autoname":"field:year","title_field":"year","search_fields":"year","fields":[{"fieldname":"year","label":"Fiscal Year","fieldtype":"Data","reqd":1,"unique":1},{"fieldname":"year_start_date","label":"Year Start Date","fieldtype":"Date","reqd":1},{"fieldname":"year_end_date","label":"Year End Date","fieldtype":"Date","reqd":1},{"fieldname":"disabled","label":"Disabled","fieldtype":"Check","default":"0"}],"permissions":[{"role":"Accounts Manager","read":1,"write":1,"create":1,"delete":1},{"role":"Accounts User","read":1},{"role":"System Manager","read":1,"write":1,"create":1,"delete":1}]}',
  0,
  'migration:0116_standard_fiscal_year',
  '2026-08-04T00:00:00.000Z'
);

-- The test/demo tenant predates standard-catalogue provisioning and historically carries
-- the shared ERP core literally. Preserve that compatibility while __standard__ remains
-- the canonical source for all real tenant provisioning.
INSERT OR IGNORE INTO doctype_definitions (
  tenant_id,
  doctype,
  module,
  is_custom,
  is_submittable,
  is_child,
  revision,
  metadata_json,
  disabled,
  modified_by,
  modified_at
)
SELECT
  'demo',
  doctype,
  module,
  is_custom,
  is_submittable,
  is_child,
  revision,
  metadata_json,
  disabled,
  'migration:0116_standard_fiscal_year',
  '2026-08-04T00:00:00.000Z'
FROM doctype_definitions
WHERE tenant_id = '__standard__'
  AND doctype = 'Fiscal Year';
