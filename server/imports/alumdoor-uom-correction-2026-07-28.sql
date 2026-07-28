-- Correct Item UOM semantics from the confirmed Alumdoor BOM/source sheet.
--
-- Rule:
--   stock/purchase = Kg
--   sales          = Mét
--   factor         = Kg consumed by one Mét sold
--
-- Read-only audit on 2026-07-28 found no relational stock/transaction rows for
-- these Item codes, so changing their base stock UOM does not relabel history.
WITH corrections(item_code, kg_per_m) AS (
  VALUES
    ('TRỤC 114_1.8LY', 4.4),
    ('TRỤC 114_2.1LY', 4.7),
    ('RON-DD', 0.117),
    ('RNHUA-DR', 0.1),
    ('RNINOX-DR', 0.12),
    ('TP-RAYHOP', 1.08),
    ('TP-TD87A1 GS', 0.6),
    ('TP-RAY HỘP TD U100', 1.42)
)
UPDATE documents
SET payload_json = json_set(
      payload_json,
      '$.stock_uom', 'Kg',
      '$.default_purchase_uom', 'Kg',
      '$.default_sales_uom', 'Mét',
      '$.uom_conversions', json_array(json_object(
        'row_id', 'UOM-MÉT',
        'uom', 'Mét',
        'conversion_factor', (
          SELECT kg_per_m FROM corrections WHERE item_code=documents.name
        )
      ))
    ),
    modified_at = '2026-07-28T20:15:00.000Z',
    modified_by = 'admin',
    version = version + 1
WHERE tenant_id='alu'
  AND doctype='Item'
  AND name IN (SELECT item_code FROM corrections)
  AND (
    COALESCE(json_extract(payload_json, '$.stock_uom'), '') <> 'Kg'
    OR COALESCE(json_extract(payload_json, '$.default_purchase_uom'), '') <> 'Kg'
    OR COALESCE(json_extract(payload_json, '$.default_sales_uom'), '') <> 'Mét'
    OR COALESCE(json_extract(payload_json, '$.uom_conversions[0].conversion_factor'), -1)
       <> (SELECT kg_per_m FROM corrections WHERE item_code=documents.name)
  );
