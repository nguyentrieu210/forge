-- R8-B: first-class subcontracting authority.
-- Source-only migration; deployment is intentionally outside this branch.
--
-- The transaction model reuses canonical Purchase Order progress and Stock Ledger:
--   PO service line -> Subcontracting Order BOM snapshot -> Stock Entry material transfer
--   -> Subcontracting Receipt raw consumption + FG receipt -> Purchase Invoice match.
-- It does not create a second stock/procurement ledger.

INSERT OR REPLACE INTO doctype_definitions(
  tenant_id,doctype,module,is_custom,is_submittable,is_child,revision,metadata_json,disabled,modified_by,modified_at
) VALUES(
  '__standard__','Subcontracting Order','Buying',0,1,0,1,
  json('{"name":"Subcontracting Order","module":"Buying","is_submittable":true,"is_child":false,"track_changes":true,"revision":1,"fields":[{"fieldname":"purchase_order","label":"Purchase Order","fieldtype":"Link","options":"Purchase Order","required":true,"in_list_view":true},{"fieldname":"purchase_order_row_id","label":"Purchase Order Row","fieldtype":"Data","required":true},{"fieldname":"service_item","label":"Service Item","fieldtype":"Link","options":"Item","required":true,"in_list_view":true},{"fieldname":"production_item","label":"Finished Item","fieldtype":"Link","options":"Item","required":true,"in_list_view":true},{"fieldname":"bom_no","label":"BOM","fieldtype":"Link","options":"Bill of Materials","required":true},{"fieldname":"qty","label":"Qty","fieldtype":"Float","required":true},{"fieldname":"transaction_date","label":"Date","fieldtype":"Date","required":true},{"fieldname":"source_warehouse","label":"Default Source Warehouse","fieldtype":"Link","options":"Warehouse"},{"fieldname":"supplier_warehouse","label":"Supplier Warehouse","fieldtype":"Link","options":"Warehouse","required":true},{"fieldname":"target_warehouse","label":"Finished Goods Warehouse","fieldtype":"Link","options":"Warehouse","required":true},{"fieldname":"supplier","label":"Supplier","fieldtype":"Link","options":"Supplier","read_only":true},{"fieldname":"company","label":"Company","fieldtype":"Link","options":"Company","read_only":true},{"fieldname":"currency","label":"Currency","fieldtype":"Link","options":"Currency","read_only":true},{"fieldname":"service_rate","label":"Service Rate","fieldtype":"Currency","read_only":true},{"fieldname":"supplied_items","label":"Supplied Items","fieldtype":"Table","options":"Subcontracting Order Supplied Items","read_only":true}],"permissions":[],"custom":false}'),
  0,'migration-0141','2026-10-02T00:00:00.000Z'
);

INSERT OR REPLACE INTO doctype_definitions(
  tenant_id,doctype,module,is_custom,is_submittable,is_child,revision,metadata_json,disabled,modified_by,modified_at
) VALUES(
  '__standard__','Subcontracting Order Supplied Items','Buying',0,0,1,1,
  json('{"name":"Subcontracting Order Supplied Items","module":"Buying","is_submittable":false,"is_child":true,"track_changes":false,"revision":1,"fields":[{"fieldname":"bom_row_id","label":"BOM Row","fieldtype":"Data","required":true},{"fieldname":"item_code","label":"Raw Material","fieldtype":"Link","options":"Item","required":true,"in_list_view":true},{"fieldname":"required_qty","label":"Required Qty","fieldtype":"Float","required":true,"read_only":true,"in_list_view":true},{"fieldname":"source_warehouse","label":"Source Warehouse","fieldtype":"Link","options":"Warehouse","required":true,"read_only":true}],"permissions":[],"custom":false}'),
  0,'migration-0141','2026-10-02T00:00:00.000Z'
);

INSERT OR REPLACE INTO doctype_definitions(
  tenant_id,doctype,module,is_custom,is_submittable,is_child,revision,metadata_json,disabled,modified_by,modified_at
) VALUES(
  '__standard__','Subcontracting Receipt','Buying',0,1,0,1,
  json('{"name":"Subcontracting Receipt","module":"Buying","is_submittable":true,"is_child":false,"track_changes":true,"revision":1,"fields":[{"fieldname":"subcontracting_order","label":"Subcontracting Order","fieldtype":"Link","options":"Subcontracting Order","required":true,"in_list_view":true},{"fieldname":"posting_at","label":"Posting At","fieldtype":"Datetime","required":true},{"fieldname":"received_qty","label":"Received Qty","fieldtype":"Float","required":true,"in_list_view":true},{"fieldname":"supplier","label":"Supplier","fieldtype":"Link","options":"Supplier","read_only":true},{"fieldname":"production_item","label":"Finished Item","fieldtype":"Link","options":"Item","read_only":true},{"fieldname":"supplier_warehouse","label":"Supplier Warehouse","fieldtype":"Link","options":"Warehouse","read_only":true},{"fieldname":"target_warehouse","label":"Finished Goods Warehouse","fieldtype":"Link","options":"Warehouse","read_only":true},{"fieldname":"finished_good_bundle","label":"Finished Serial/Batch Bundle","fieldtype":"Link","options":"Serial and Batch Bundle"},{"fieldname":"stock_account","label":"Stock Account","fieldtype":"Link","options":"Account"},{"fieldname":"stock_received_but_not_billed","label":"Stock Received But Not Billed","fieldtype":"Link","options":"Account"},{"fieldname":"service_cost_minor","label":"Service Cost Minor","fieldtype":"Int","read_only":true},{"fieldname":"material_cost_minor","label":"Material Cost Minor","fieldtype":"Int","read_only":true},{"fieldname":"finished_good_value_minor","label":"Finished Good Value Minor","fieldtype":"Int","read_only":true},{"fieldname":"supplied_items","label":"Consumed Materials","fieldtype":"Table","options":"Subcontracting Receipt Supplied Items","read_only":true}],"permissions":[],"custom":false}'),
  0,'migration-0141','2026-10-02T00:00:00.000Z'
);

INSERT OR REPLACE INTO doctype_definitions(
  tenant_id,doctype,module,is_custom,is_submittable,is_child,revision,metadata_json,disabled,modified_by,modified_at
) VALUES(
  '__standard__','Subcontracting Receipt Supplied Items','Buying',0,0,1,1,
  json('{"name":"Subcontracting Receipt Supplied Items","module":"Buying","is_submittable":false,"is_child":true,"track_changes":false,"revision":1,"fields":[{"fieldname":"bom_row_id","label":"BOM Row","fieldtype":"Data","required":true},{"fieldname":"item_code","label":"Raw Material","fieldtype":"Link","options":"Item","required":true,"in_list_view":true},{"fieldname":"consumed_qty","label":"Consumed Qty","fieldtype":"Float","required":true,"read_only":true,"in_list_view":true},{"fieldname":"serial_and_batch_bundle","label":"Serial and Batch Bundle","fieldtype":"Link","options":"Serial and Batch Bundle"}],"permissions":[],"custom":false}'),
  0,'migration-0141','2026-10-02T00:00:00.000Z'
);

UPDATE doctype_definitions
SET metadata_json=json_insert(metadata_json,'$.fields[#]',json('{"fieldname":"is_subcontracted","label":"Is Subcontracted","fieldtype":"Check","default":0,"in_standard_filter":true}')),
    revision=revision+1, modified_by='migration-0141', modified_at='2026-10-02T00:00:00.000Z'
WHERE doctype='Purchase Order' AND json_valid(metadata_json)
  AND NOT EXISTS(SELECT 1 FROM json_each(metadata_json,'$.fields') WHERE json_extract(value,'$.fieldname')='is_subcontracted');

UPDATE doctype_definitions
SET metadata_json=json_insert(metadata_json,'$.fields[#]',json('{"fieldname":"subcontracting_order","label":"Subcontracting Order","fieldtype":"Link","options":"Subcontracting Order","in_standard_filter":true}')),
    revision=revision+1, modified_by='migration-0141', modified_at='2026-10-02T00:00:00.000Z'
WHERE doctype='Stock Entry' AND json_valid(metadata_json)
  AND NOT EXISTS(SELECT 1 FROM json_each(metadata_json,'$.fields') WHERE json_extract(value,'$.fieldname')='subcontracting_order');

UPDATE doctype_definitions
SET metadata_json=json_insert(metadata_json,'$.fields[#]',json('{"fieldname":"bom_row_id","label":"BOM Row","fieldtype":"Data"}')),
    revision=revision+1, modified_by='migration-0141', modified_at='2026-10-02T00:00:00.000Z'
WHERE doctype='Stock Entry Detail' AND json_valid(metadata_json)
  AND NOT EXISTS(SELECT 1 FROM json_each(metadata_json,'$.fields') WHERE json_extract(value,'$.fieldname')='bom_row_id');

UPDATE doctype_definitions
SET metadata_json=json_set(metadata_json,'$.revision',revision)
WHERE doctype IN ('Purchase Order','Stock Entry','Stock Entry Detail') AND json_valid(metadata_json);
