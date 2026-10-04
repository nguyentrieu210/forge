-- Commit-time subcontract entitlement projections over canonical documents only.
-- No balance table: every D1 writer must revalidate the latest submitted sources.
DROP VIEW IF EXISTS subcontracting_commit_materials;
CREATE VIEW subcontracting_commit_materials AS
SELECT o.tenant_id, o.name AS order_name,
  json_extract(b.value,'$.bom_row_id') AS bom_row_id,
  json_extract(b.value,'$.item_code') AS item_code,
  json_extract(b.value,'$.source_warehouse') AS source_warehouse,
  CAST(json_extract(b.value,'$.required_qty_micros') AS INTEGER) AS required_qty_micros,
  COALESCE((SELECT SUM(
    CASE WHEN COALESCE(json_extract(d.payload_json,'$.subcontracting_material_return'),0)=1 THEN -1 ELSE 1 END
    * CAST(json_extract(r.value,'$.qty_micros') AS INTEGER))
    FROM documents d, json_each(d.payload_json,'$.items') r
    WHERE d.tenant_id=o.tenant_id AND d.doctype='Stock Entry' AND d.docstatus=1
      AND json_extract(d.payload_json,'$.subcontracting_order')=o.name
      AND json_extract(r.value,'$.bom_row_id')=json_extract(b.value,'$.bom_row_id')),0) AS net_sent_qty_micros,
  COALESCE((SELECT SUM(CAST(json_extract(r.value,'$.consumed_qty_micros') AS INTEGER))
    FROM documents d, json_each(d.payload_json,'$.supplied_items') r
    WHERE d.tenant_id=o.tenant_id AND d.doctype='Subcontracting Receipt' AND d.docstatus=1
      AND json_extract(d.payload_json,'$.subcontracting_order')=o.name
      AND json_extract(r.value,'$.bom_row_id')=json_extract(b.value,'$.bom_row_id')),0) AS consumed_qty_micros
FROM documents o, json_each(o.payload_json,'$.supplied_items') b
WHERE o.doctype='Subcontracting Order' AND o.docstatus=1;

DROP VIEW IF EXISTS subcontracting_commit_violations;
CREATE VIEW subcontracting_commit_violations AS
-- Net supply/return and receipt consumption are tested after the document write,
-- so another aggregate winning first cannot leave a stale plan authoritative.
SELECT tenant_id,order_name,'material entitlement exceeded' AS reason
FROM subcontracting_commit_materials
WHERE required_qty_micros<=0 OR net_sent_qty_micros<0
   OR net_sent_qty_micros>required_qty_micros
   OR consumed_qty_micros<0 OR consumed_qty_micros>net_sent_qty_micros
UNION ALL
SELECT o.tenant_id,o.name,'receipt quantity or service ceiling exceeded'
FROM documents o
WHERE o.doctype='Subcontracting Order' AND o.docstatus=1
  AND (COALESCE((SELECT SUM(CAST(json_extract(r.payload_json,'$.received_qty_micros') AS INTEGER))
       FROM documents r WHERE r.tenant_id=o.tenant_id AND r.doctype='Subcontracting Receipt' AND r.docstatus=1
       AND json_extract(r.payload_json,'$.subcontracting_order')=o.name),0)>CAST(json_extract(o.payload_json,'$.qty_micros') AS INTEGER)
    OR COALESCE((SELECT SUM(CAST(json_extract(r.payload_json,'$.service_cost_minor') AS INTEGER))
       FROM documents r WHERE r.tenant_id=o.tenant_id AND r.doctype='Subcontracting Receipt' AND r.docstatus=1
       AND json_extract(r.payload_json,'$.subcontracting_order')=o.name),0)>CAST(json_extract(o.payload_json,'$.service_amount_minor') AS INTEGER))
UNION ALL
-- Missing/cancelled sources and altered frozen warehouse/item bindings fail closed.
SELECT d.tenant_id,json_extract(d.payload_json,'$.subcontracting_order'),'material source snapshot mismatch'
FROM documents d LEFT JOIN documents o
  ON o.tenant_id=d.tenant_id AND o.doctype='Subcontracting Order'
 AND o.name=json_extract(d.payload_json,'$.subcontracting_order') AND o.docstatus=1
WHERE d.doctype='Stock Entry' AND d.docstatus=1
 AND COALESCE(json_extract(d.payload_json,'$.subcontracting_order'),'')<>''
 AND (o.name IS NULL OR json_extract(d.payload_json,'$.purpose') IS NOT 'Material Transfer'
   OR json_extract(d.payload_json,'$.company') IS NOT json_extract(o.payload_json,'$.company')
   OR json_type(d.payload_json,'$.items') IS NOT 'array' OR json_array_length(d.payload_json,'$.items')=0
   OR COALESCE(json_extract(d.payload_json,'$.subcontracting_material_return'),0) NOT IN (0,1)
   OR EXISTS(SELECT 1 FROM json_each(d.payload_json,'$.items') r WHERE
     json_type(r.value,'$.qty_micros') IS NOT 'integer' OR json_extract(r.value,'$.qty_micros')<=0
     OR NOT EXISTS(SELECT 1 FROM subcontracting_commit_materials b
       WHERE b.tenant_id=d.tenant_id AND b.order_name=o.name
         AND b.bom_row_id=json_extract(r.value,'$.bom_row_id')
         AND b.item_code=json_extract(r.value,'$.item_code')
         AND json_extract(r.value,'$.source_warehouse') IS CASE WHEN COALESCE(json_extract(d.payload_json,'$.subcontracting_material_return'),0)=1
           THEN json_extract(o.payload_json,'$.supplier_warehouse') ELSE b.source_warehouse END
         AND json_extract(r.value,'$.target_warehouse') IS CASE WHEN COALESCE(json_extract(d.payload_json,'$.subcontracting_material_return'),0)=1
           THEN b.source_warehouse ELSE json_extract(o.payload_json,'$.supplier_warehouse') END)))
UNION ALL
SELECT d.tenant_id,json_extract(d.payload_json,'$.subcontracting_order'),'receipt source snapshot mismatch'
FROM documents d LEFT JOIN documents o
  ON o.tenant_id=d.tenant_id AND o.doctype='Subcontracting Order'
 AND o.name=json_extract(d.payload_json,'$.subcontracting_order') AND o.docstatus=1
WHERE d.doctype='Subcontracting Receipt' AND d.docstatus=1
 AND (o.name IS NULL
   OR json_type(d.payload_json,'$.received_qty_micros') IS NOT 'integer' OR json_extract(d.payload_json,'$.received_qty_micros')<=0
   OR json_type(d.payload_json,'$.service_cost_minor') IS NOT 'integer' OR json_extract(d.payload_json,'$.service_cost_minor')<0
   OR json_extract(d.payload_json,'$.company') IS NOT json_extract(o.payload_json,'$.company')
   OR json_extract(d.payload_json,'$.supplier') IS NOT json_extract(o.payload_json,'$.supplier')
   OR json_extract(d.payload_json,'$.currency') IS NOT json_extract(o.payload_json,'$.currency')
   OR json_extract(d.payload_json,'$.purchase_order') IS NOT json_extract(o.payload_json,'$.purchase_order')
   OR json_extract(d.payload_json,'$.purchase_order_row_id') IS NOT json_extract(o.payload_json,'$.purchase_order_row_id')
   OR json_extract(d.payload_json,'$.service_item') IS NOT json_extract(o.payload_json,'$.service_item')
   OR json_extract(d.payload_json,'$.production_item') IS NOT json_extract(o.payload_json,'$.production_item')
   OR json_extract(d.payload_json,'$.supplier_warehouse') IS NOT json_extract(o.payload_json,'$.supplier_warehouse')
   OR json_extract(d.payload_json,'$.target_warehouse') IS NOT json_extract(o.payload_json,'$.target_warehouse')
   OR json_type(d.payload_json,'$.supplied_items') IS NOT 'array'
   OR json_array_length(d.payload_json,'$.supplied_items')<>json_array_length(o.payload_json,'$.supplied_items')
   OR EXISTS(SELECT 1 FROM json_each(d.payload_json,'$.supplied_items') r WHERE
     json_type(r.value,'$.consumed_qty_micros') IS NOT 'integer' OR json_extract(r.value,'$.consumed_qty_micros')<0
     OR NOT EXISTS(SELECT 1 FROM subcontracting_commit_materials b WHERE b.tenant_id=d.tenant_id AND b.order_name=o.name
       AND b.bom_row_id=json_extract(r.value,'$.bom_row_id') AND b.item_code=json_extract(r.value,'$.item_code')))
   OR EXISTS(SELECT 1 FROM json_each(d.payload_json,'$.supplied_items') r GROUP BY json_extract(r.value,'$.bom_row_id') HAVING COUNT(*)>1))
UNION ALL
-- A source PO cancellation cannot silently orphan an active subcontracting order.
SELECT o.tenant_id,o.name,'purchase order source snapshot mismatch'
FROM documents o LEFT JOIN documents p
 ON p.tenant_id=o.tenant_id AND p.doctype='Purchase Order'
 AND p.name=json_extract(o.payload_json,'$.purchase_order') AND p.docstatus=1
WHERE o.doctype='Subcontracting Order' AND o.docstatus=1
 AND (p.name IS NULL OR COALESCE(json_extract(p.payload_json,'$.is_subcontracted'),0)<>1
   OR json_extract(o.payload_json,'$.company') IS NOT json_extract(p.payload_json,'$.company')
   OR json_extract(o.payload_json,'$.supplier') IS NOT json_extract(p.payload_json,'$.supplier')
   OR json_extract(o.payload_json,'$.currency') IS NOT json_extract(p.payload_json,'$.currency')
   OR json_type(o.payload_json,'$.qty_micros') IS NOT 'integer' OR json_extract(o.payload_json,'$.qty_micros')<=0
   OR json_type(o.payload_json,'$.service_amount_minor') IS NOT 'integer' OR json_extract(o.payload_json,'$.service_amount_minor')<0
   OR json_type(o.payload_json,'$.supplied_items') IS NOT 'array' OR json_array_length(o.payload_json,'$.supplied_items')=0
   OR EXISTS(SELECT 1 FROM json_each(o.payload_json,'$.supplied_items') b
     WHERE json_type(b.value,'$.required_qty_micros') IS NOT 'integer' OR json_extract(b.value,'$.required_qty_micros')<=0
       OR json_type(b.value,'$.bom_row_id') IS NOT 'text' OR COALESCE(json_extract(b.value,'$.bom_row_id'),'')=''
       OR json_type(b.value,'$.item_code') IS NOT 'text' OR COALESCE(json_extract(b.value,'$.item_code'),'')=''
       OR json_type(b.value,'$.source_warehouse') IS NOT 'text' OR COALESCE(json_extract(b.value,'$.source_warehouse'),'')='')
   OR EXISTS(SELECT 1 FROM json_each(o.payload_json,'$.supplied_items') b GROUP BY json_extract(b.value,'$.bom_row_id') HAVING COUNT(*)>1)
   OR NOT EXISTS(SELECT 1 FROM json_each(p.payload_json,'$.items') r
     WHERE json_extract(r.value,'$.row_id')=json_extract(o.payload_json,'$.purchase_order_row_id')
       AND json_extract(r.value,'$.item_code')=json_extract(o.payload_json,'$.service_item')
       AND COALESCE((SELECT SUM(CAST(json_extract(s.payload_json,'$.qty_micros') AS INTEGER))
         FROM documents s WHERE s.tenant_id=o.tenant_id AND s.doctype='Subcontracting Order' AND s.docstatus=1
           AND json_extract(s.payload_json,'$.purchase_order')=p.name
           AND json_extract(s.payload_json,'$.purchase_order_row_id')=json_extract(r.value,'$.row_id')),0)
         <=CAST(json_extract(r.value,'$.qty_micros') AS INTEGER)));

DROP TRIGGER IF EXISTS subcontracting_commit_insert_guard;
CREATE TRIGGER subcontracting_commit_insert_guard
AFTER INSERT ON documents
WHEN NEW.doctype IN ('Subcontracting Order','Stock Entry','Subcontracting Receipt','Purchase Order')
BEGIN
  SELECT CASE WHEN EXISTS(SELECT 1 FROM subcontracting_commit_violations v WHERE
    (v.tenant_id=NEW.tenant_id AND (
    (NEW.doctype='Subcontracting Order' AND v.order_name=NEW.name)
    OR (NEW.doctype IN ('Stock Entry','Subcontracting Receipt') AND v.order_name=json_extract(NEW.payload_json,'$.subcontracting_order'))
    OR (NEW.doctype='Purchase Order' AND v.order_name IN (SELECT o.name FROM documents o
      WHERE o.tenant_id=NEW.tenant_id AND o.doctype='Subcontracting Order' AND o.docstatus=1
      AND json_extract(o.payload_json,'$.purchase_order')=NEW.name)))))
  THEN RAISE(ABORT,'Subcontracting source snapshot or material entitlement changed; retry mutation') END;
END;

DROP TRIGGER IF EXISTS subcontracting_commit_update_guard;
CREATE TRIGGER subcontracting_commit_update_guard
AFTER UPDATE ON documents
WHEN NEW.doctype IN ('Subcontracting Order','Stock Entry','Subcontracting Receipt','Purchase Order') OR OLD.doctype IN ('Subcontracting Order','Stock Entry','Subcontracting Receipt','Purchase Order')
BEGIN
  SELECT CASE WHEN EXISTS(SELECT 1 FROM subcontracting_commit_violations v WHERE
    (v.tenant_id=NEW.tenant_id AND (
    (NEW.doctype='Subcontracting Order' AND v.order_name=NEW.name)
    OR (NEW.doctype IN ('Stock Entry','Subcontracting Receipt') AND v.order_name=json_extract(NEW.payload_json,'$.subcontracting_order'))
    OR (NEW.doctype='Purchase Order' AND v.order_name IN (SELECT o.name FROM documents o
      WHERE o.tenant_id=NEW.tenant_id AND o.doctype='Subcontracting Order' AND o.docstatus=1
      AND json_extract(o.payload_json,'$.purchase_order')=NEW.name)))) OR (v.tenant_id=OLD.tenant_id AND (
    (OLD.doctype='Subcontracting Order' AND v.order_name=OLD.name)
    OR (OLD.doctype IN ('Stock Entry','Subcontracting Receipt') AND v.order_name=json_extract(OLD.payload_json,'$.subcontracting_order'))
    OR (OLD.doctype='Purchase Order' AND v.order_name IN (SELECT o.name FROM documents o
      WHERE o.tenant_id=OLD.tenant_id AND o.doctype='Subcontracting Order' AND o.docstatus=1
      AND json_extract(o.payload_json,'$.purchase_order')=OLD.name)))))
  THEN RAISE(ABORT,'Subcontracting source snapshot or material entitlement changed; retry mutation') END;
END;

DROP TRIGGER IF EXISTS subcontracting_commit_delete_guard;
CREATE TRIGGER subcontracting_commit_delete_guard
AFTER DELETE ON documents
WHEN OLD.doctype IN ('Subcontracting Order','Stock Entry','Subcontracting Receipt','Purchase Order')
BEGIN
  SELECT CASE WHEN EXISTS(SELECT 1 FROM subcontracting_commit_violations v WHERE
    (v.tenant_id=OLD.tenant_id AND (
    (OLD.doctype='Subcontracting Order' AND v.order_name=OLD.name)
    OR (OLD.doctype IN ('Stock Entry','Subcontracting Receipt') AND v.order_name=json_extract(OLD.payload_json,'$.subcontracting_order'))
    OR (OLD.doctype='Purchase Order' AND v.order_name IN (SELECT o.name FROM documents o
      WHERE o.tenant_id=OLD.tenant_id AND o.doctype='Subcontracting Order' AND o.docstatus=1
      AND json_extract(o.payload_json,'$.purchase_order')=OLD.name)))))
  THEN RAISE(ABORT,'Subcontracting source snapshot or material entitlement changed; retry mutation') END;
END;
