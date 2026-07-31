-- Operator-facing control documents for purchase allocation settlement and FIFO override.
--
-- These doctypes are append-only audit commands. The controller remains the business
-- authority; metadata only makes the existing DocumentKernel/DO write path available
-- to the shared metadata-driven client. Seed every catalogue already present in this
-- tenant database, including __standard__ for tenants provisioned later.

WITH tenants AS (
  SELECT DISTINCT tenant_id FROM doctype_definitions
)
INSERT OR IGNORE INTO roles(tenant_id,role,desk_access,is_standard,modified_at)
SELECT tenant_id, role, 1, 1, '2026-07-31T00:00:00.000Z'
FROM tenants
CROSS JOIN (
  SELECT 'Purchase Manager' AS role
  UNION ALL SELECT 'Stock Manager'
  UNION ALL SELECT 'System Manager'
  UNION ALL SELECT 'Chủ xưởng'
  UNION ALL SELECT 'Kế toán'
);

WITH tenants AS (
  SELECT DISTINCT tenant_id FROM doctype_definitions
)
INSERT OR IGNORE INTO doctype_definitions(
  tenant_id,doctype,module,is_custom,is_submittable,is_child,revision,
  metadata_json,disabled,modified_by,modified_at
)
SELECT tenant_id,
       'Purchase Settlement',
       'Buying',
       0,1,0,1,
       '{"name":"Purchase Settlement","module":"Buying","is_submittable":true,"track_changes":true,"autoname":"PSET-.YYYY.-#####","sort_field":"modified","sort_order":"DESC","revision":1,"fields":[{"fieldname":"operation","label":"Operation","fieldtype":"Select","options":"Close\nReverse","required":true,"in_list_view":true},{"fieldname":"queue_key","label":"Queue Key","fieldtype":"Data","required":true,"hidden":true},{"fieldname":"window_id","label":"Settlement Window","fieldtype":"Data","required":true,"hidden":true},{"fieldname":"reason","label":"Reason","fieldtype":"Small Text","required":true},{"fieldname":"nominal_qty","label":"Nominal Qty","fieldtype":"Float","read_only":true},{"fieldname":"received_qty","label":"Received Qty","fieldtype":"Float","read_only":true},{"fieldname":"minimum_qty","label":"Minimum Qty","fieldtype":"Float","read_only":true},{"fieldname":"maximum_qty","label":"Maximum Qty","fieldtype":"Float","read_only":true}],"permissions":[{"role":"Purchase Manager","read":true,"write":true,"create":true,"submit":true,"print":true,"report":true},{"role":"Stock Manager","read":true,"write":true,"create":true,"submit":true,"print":true,"report":true},{"role":"Chủ xưởng","read":true,"write":true,"create":true,"submit":true,"print":true,"report":true},{"role":"Kế toán","read":true,"write":true,"create":true,"submit":true,"print":true,"report":true},{"role":"System Manager","read":true,"write":true,"create":true,"submit":true,"print":true,"report":true}],"custom":false}',
       0,'migration','2026-07-31T00:00:00.000Z'
FROM tenants;

WITH tenants AS (
  SELECT DISTINCT tenant_id FROM doctype_definitions
)
INSERT OR IGNORE INTO doctype_definitions(
  tenant_id,doctype,module,is_custom,is_submittable,is_child,revision,
  metadata_json,disabled,modified_by,modified_at
)
SELECT tenant_id,
       'Purchase Allocation Override',
       'Buying',
       0,1,0,1,
       '{"name":"Purchase Allocation Override","module":"Buying","is_submittable":true,"track_changes":true,"autoname":"PAO-.YYYY.-#####","sort_field":"modified","sort_order":"DESC","revision":1,"fields":[{"fieldname":"source_allocation_entry_id","label":"Source Allocation","fieldtype":"Data","required":true,"hidden":true},{"fieldname":"target_purchase_order","label":"Target Purchase Order","fieldtype":"Link","options":"Purchase Order","required":true,"in_list_view":true},{"fieldname":"target_purchase_order_item_row_id","label":"Target PO Row","fieldtype":"Data","required":true},{"fieldname":"qty","label":"Quantity","fieldtype":"Float","required":true,"in_list_view":true},{"fieldname":"reason","label":"Reason","fieldtype":"Small Text","required":true},{"fieldname":"source_purchase_receipt","label":"Source Purchase Receipt","fieldtype":"Link","options":"Purchase Receipt","read_only":true},{"fieldname":"source_purchase_order","label":"Source Purchase Order","fieldtype":"Link","options":"Purchase Order","read_only":true},{"fieldname":"source_purchase_order_item_row_id","label":"Source PO Row","fieldtype":"Data","read_only":true}],"permissions":[{"role":"Purchase Manager","read":true,"write":true,"create":true,"submit":true,"print":true,"report":true},{"role":"Stock Manager","read":true,"write":true,"create":true,"submit":true,"print":true,"report":true},{"role":"Chủ xưởng","read":true,"write":true,"create":true,"submit":true,"print":true,"report":true},{"role":"System Manager","read":true,"write":true,"create":true,"submit":true,"print":true,"report":true}],"custom":false}',
       0,'migration','2026-07-31T00:00:00.000Z'
FROM tenants;
