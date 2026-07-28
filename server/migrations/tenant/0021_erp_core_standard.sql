-- Promotes the ERP core into the STANDARD catalogue.
--
-- Everything a trading or manufacturing tenant actually runs on — Item, Customer,
-- Warehouse, Sales Order, Delivery Note, Sales Invoice, Payment Entry — was seeded for
-- one tenant id: `demo`. Migrations 0004/0005/0007/0008 wrote those rows literally, so
-- every tenant database carries them, but they belong to a tenant nobody else is.
--
-- `provisionStandardCatalog` copies FROM tenant_id='__standard__' into the new tenant,
-- and these doctypes were never there. The consequence is not a visible failure at
-- provisioning time: the call succeeds, reports the 43 doctypes it did copy, and the
-- new tenant comes up with Lead, Opportunity, Issue and Payroll — but with no Item and
-- no Customer. The first thing anyone tries to do is create a product, and the platform
-- answers that the doctype does not exist. Every controller in clouderp-selling and
-- clouderp-stock is present and correct; nothing they act on can be created.
--
-- WHY A COPY AND NOT 43 RESTATED DEFINITIONS. The metadata is tens of kilobytes of JSON
-- that already exists, verified, three migrations back. Restating it here would create a
-- second copy that drifts from the first the moment either is edited, and the drift
-- would be invisible: both rows parse, both install, and only the tenants provisioned
-- after the edit behave differently from the tenants provisioned before it. Selecting
-- from the rows that are already there keeps one source.
--
-- INSERT OR IGNORE, so this is safe to re-run and never overwrites a `__standard__`
-- definition that a later migration deliberately replaced.
INSERT OR IGNORE INTO doctype_definitions(
  tenant_id, doctype, module, is_custom, is_submittable, is_child, revision,
  metadata_json, disabled, modified_by, modified_at
)
SELECT
  '__standard__', doctype, module, is_custom, is_submittable, is_child, revision,
  metadata_json, disabled, 'migration-0021', '2026-07-27T00:00:00.000Z'
FROM doctype_definitions
WHERE tenant_id = 'demo'
  AND doctype IN (
    -- Setup
    'Company', 'Currency', 'UOM',
    -- Selling / CRM downstream
    'Customer', 'Sales Order', 'Item Price', 'Pricing Rule',
    -- Stock
    'Item', 'Warehouse', 'Delivery Note', 'Batch', 'Serial No',
    'Serial and Batch Bundle', 'Serial and Batch Bundle Entry',
    'Stock Entry', 'Stock Entry Detail', 'Stock Return', 'Return Item',
    'Purchase Receipt', 'Purchase Receipt Item', 'Repost Item Valuation',
    -- Buying
    'Supplier', 'Purchase Order', 'Purchase Order Item',
    -- Accounts
    'Account', 'Cost Center', 'Journal Entry', 'Journal Entry Account',
    'Payment Entry', 'Sales Invoice', 'Purchase Invoice', 'Purchase Invoice Item',
    'Credit Note', 'Debit Note',
    -- Manufacturing (a fertiliser plant needs these; a trader simply never opens them)
    'Bill of Materials', 'BOM Item', 'Work Order', 'Work Order Required Item',
    -- Assets / Projects
    'Asset', 'Asset Category', 'Asset Depreciation Entry', 'Project', 'Task'
  );
