-- Complete Item/UOM semantics before making Item Price.uom mandatory.
--
-- 1. Every imported price is a SALES price, so its UOM comes from the linked
--    Item.default_sales_uom (falling back to stock_uom only for legacy Items).
-- 2. NVL-V5_KEM_STD was accidentally changed to purchase by Kg although the
--    exact source catalogue says M and both stock/sales remain Mét. There is no
--    declared kg/m factor, so restoring purchase UOM to Mét is the only
--    non-invented correction.

UPDATE documents AS price
SET payload_json = json_set(
      price.payload_json,
      '$.uom',
      (
        SELECT COALESCE(
          NULLIF(json_extract(item.payload_json, '$.default_sales_uom'), ''),
          json_extract(item.payload_json, '$.stock_uom')
        )
        FROM documents AS item
        WHERE item.tenant_id=price.tenant_id
          AND item.doctype='Item'
          AND item.name=json_extract(price.payload_json, '$.item_code')
      )
    ),
    modified_at = '2026-07-28T23:15:00.000Z',
    modified_by = 'admin',
    version = version + 1
WHERE price.tenant_id='alu'
  AND price.doctype='Item Price'
  AND COALESCE(json_extract(price.payload_json, '$.uom'), '')=''
  AND EXISTS (
    SELECT 1
    FROM documents AS item
    WHERE item.tenant_id=price.tenant_id
      AND item.doctype='Item'
      AND item.name=json_extract(price.payload_json, '$.item_code')
      AND COALESCE(
        NULLIF(json_extract(item.payload_json, '$.default_sales_uom'), ''),
        json_extract(item.payload_json, '$.stock_uom')
      ) IS NOT NULL
  );

UPDATE document_search
SET content = (
      SELECT printf(
        '%s %s %s %s',
        COALESCE(json_extract(price.payload_json, '$.price_list'), ''),
        COALESCE(json_extract(price.payload_json, '$.item_code'), ''),
        COALESCE(json_extract(price.payload_json, '$.uom'), ''),
        COALESCE(json_extract(price.payload_json, '$.rate'), '')
      )
      FROM documents AS price
      WHERE price.tenant_id=document_search.tenant_id
        AND price.doctype='Item Price'
        AND price.name=document_search.name
    ),
    modified_at = '2026-07-28T23:15:00.000Z'
WHERE tenant_id='alu'
  AND doctype='Item Price'
  AND EXISTS (
    SELECT 1
    FROM documents AS price
    WHERE price.tenant_id=document_search.tenant_id
      AND price.doctype='Item Price'
      AND price.name=document_search.name
  );

UPDATE documents
SET payload_json = json_set(payload_json, '$.default_purchase_uom', 'Mét'),
    modified_at = '2026-07-28T23:15:00.000Z',
    modified_by = 'admin',
    version = version + 1
WHERE tenant_id='alu'
  AND doctype='Item'
  AND name='NVL-V5_KEM_STD'
  AND json_extract(payload_json, '$.stock_uom')='Mét'
  AND json_extract(payload_json, '$.default_sales_uom')='Mét'
  AND json_extract(payload_json, '$.default_purchase_uom')='Kg'
  AND COALESCE(json_extract(payload_json, '$.uom_conversions'), '')='';
