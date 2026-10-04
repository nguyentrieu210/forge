-- Rejected units are a subset of total completed quantity, held as valued stock.
-- They are payable only under an explicit full-service-cost policy; no supplier credit.
UPDATE doctype_definitions
SET metadata_json=json_insert(metadata_json,'$.fields[#]',json('{"fieldname":"rejected_qty","label":"Rejected Quantity (part of Total Received)","fieldtype":"Float"}')),
    revision=revision+1, modified_by='migration-0168', modified_at='2026-10-04T09:00:00.000Z'
WHERE doctype='Subcontracting Receipt' AND json_valid(metadata_json)
  AND NOT EXISTS(SELECT 1 FROM json_each(metadata_json,'$.fields') WHERE json_extract(value,'$.fieldname')='rejected_qty');
UPDATE doctype_definitions
SET metadata_json=json_insert(metadata_json,'$.fields[#]',json('{"fieldname":"rejected_warehouse","label":"Rejected Goods Warehouse","fieldtype":"Link","options":"Warehouse"}')),
    revision=revision+1, modified_by='migration-0168', modified_at='2026-10-04T09:00:00.000Z'
WHERE doctype='Subcontracting Receipt' AND json_valid(metadata_json)
  AND NOT EXISTS(SELECT 1 FROM json_each(metadata_json,'$.fields') WHERE json_extract(value,'$.fieldname')='rejected_warehouse');
UPDATE doctype_definitions
SET metadata_json=json_insert(metadata_json,'$.fields[#]',json('{"fieldname":"rejected_service_policy","label":"Rejected Goods Service Payment","fieldtype":"Select","options":"\nPay Full Service"}')),
    revision=revision+1, modified_by='migration-0168', modified_at='2026-10-04T09:00:00.000Z'
WHERE doctype='Subcontracting Receipt' AND json_valid(metadata_json)
  AND NOT EXISTS(SELECT 1 FROM json_each(metadata_json,'$.fields') WHERE json_extract(value,'$.fieldname')='rejected_service_policy');
UPDATE doctype_definitions
SET metadata_json=json_insert(metadata_json,'$.fields[#]',json('{"fieldname":"rejected_good_bundle","label":"Rejected Goods Serial and Batch Bundle","fieldtype":"Link","options":"Serial and Batch Bundle"}')),
    revision=revision+1, modified_by='migration-0168', modified_at='2026-10-04T09:00:00.000Z'
WHERE doctype='Subcontracting Receipt' AND json_valid(metadata_json)
  AND NOT EXISTS(SELECT 1 FROM json_each(metadata_json,'$.fields') WHERE json_extract(value,'$.fieldname')='rejected_good_bundle');
UPDATE doctype_definitions
SET metadata_json=json_insert(metadata_json,'$.fields[#]',json('{"fieldname":"accepted_qty","label":"Accepted Quantity","fieldtype":"Float","read_only":1}')),
    revision=revision+1, modified_by='migration-0168', modified_at='2026-10-04T09:00:00.000Z'
WHERE doctype='Subcontracting Receipt' AND json_valid(metadata_json)
  AND NOT EXISTS(SELECT 1 FROM json_each(metadata_json,'$.fields') WHERE json_extract(value,'$.fieldname')='accepted_qty');
UPDATE doctype_definitions
SET metadata_json=json_set(metadata_json,
    '$.fields['||(SELECT key FROM json_each(metadata_json,'$.fields') WHERE json_extract(value,'$.fieldname')='received_qty')||'].label',
    'Total Completed Quantity (Accepted + Rejected)'),
    revision=revision+1, modified_by='migration-0168', modified_at='2026-10-04T09:00:00.000Z'
WHERE doctype='Subcontracting Receipt' AND json_valid(metadata_json)
  AND EXISTS(SELECT 1 FROM json_each(metadata_json,'$.fields')
    WHERE json_extract(value,'$.fieldname')='received_qty'
      AND json_extract(value,'$.label') IS NOT 'Total Completed Quantity (Accepted + Rejected)');
UPDATE doctype_definitions SET metadata_json=json_set(metadata_json,'$.revision',revision)
WHERE doctype='Subcontracting Receipt' AND json_valid(metadata_json);

DROP VIEW IF EXISTS subcontracting_rejected_violations;
CREATE VIEW subcontracting_rejected_violations AS
SELECT tenant_id,name FROM documents
WHERE doctype='Subcontracting Receipt' AND docstatus=1 AND (
 (json_type(payload_json,'$.rejected_qty_micros') IS NOT NULL AND (
   json_type(payload_json,'$.rejected_qty_micros') IS NOT 'integer'
   OR json_extract(payload_json,'$.rejected_qty_micros')<0
   OR json_extract(payload_json,'$.rejected_qty_micros')>json_extract(payload_json,'$.received_qty_micros')))
 OR (json_type(payload_json,'$.accepted_qty_micros') IS NOT NULL AND (
   json_type(payload_json,'$.accepted_qty_micros') IS NOT 'integer'
   OR json_extract(payload_json,'$.accepted_qty_micros') IS NOT
     json_extract(payload_json,'$.received_qty_micros')-COALESCE(json_extract(payload_json,'$.rejected_qty_micros'),0)))
 OR (COALESCE(json_extract(payload_json,'$.rejected_qty_micros'),0)>0 AND (
   json_extract(payload_json,'$.rejected_service_policy') IS NOT 'Pay Full Service'
   OR COALESCE(TRIM(json_extract(payload_json,'$.rejected_warehouse')),'')=''
   OR json_extract(payload_json,'$.rejected_warehouse') IS json_extract(payload_json,'$.target_warehouse')
   OR json_extract(payload_json,'$.rejected_warehouse') IS json_extract(payload_json,'$.supplier_warehouse')))
);
CREATE TRIGGER IF NOT EXISTS subcontracting_rejected_insert_guard
AFTER INSERT ON documents WHEN NEW.doctype='Subcontracting Receipt' AND NEW.docstatus=1
BEGIN
 SELECT RAISE(ABORT,'Subcontracting rejected quantity or payment policy is invalid')
 WHERE EXISTS(SELECT 1 FROM subcontracting_rejected_violations WHERE tenant_id=NEW.tenant_id AND name=NEW.name);
END;
CREATE TRIGGER IF NOT EXISTS subcontracting_rejected_update_guard
AFTER UPDATE ON documents WHEN NEW.doctype='Subcontracting Receipt' AND NEW.docstatus=1
BEGIN
 SELECT RAISE(ABORT,'Subcontracting rejected quantity or payment policy is invalid')
 WHERE EXISTS(SELECT 1 FROM subcontracting_rejected_violations WHERE tenant_id=NEW.tenant_id AND name=NEW.name);
END;
