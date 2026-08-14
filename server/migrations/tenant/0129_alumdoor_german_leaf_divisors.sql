-- Backfill the German-door leaf divisor from the audited product catalogue.
-- The source lists the leaf width in millimetres; production formulas use metres.
WITH german_leaf(item_code, leaf_divisor_m) AS (
  VALUES
    ('TD-AL595', 0.060),
    ('TP-TD-AL71N', 0.055),
    ('TP-TD-AL503N26', 0.055),
    ('AL503C', 0.050),
    ('TP-ALD-548N', 0.055),
    ('AL501C', 0.050),
    ('TP-TD-AL501N', 0.056),
    ('TP-TD-AL652', 0.050),
    ('TP-ALD-DL552', 0.056),
    ('TP-TD-AL752N', 0.050),
    ('TP-TD-AL50', 0.055),
    ('TP-ALVIP50', 0.055),
    ('TP-ALVIPST500', 0.055),
    ('TP-ALVIPST700', 0.050),
    ('TP-AL75', 0.066)
)
UPDATE documents
SET payload_json = json_set(
      payload_json,
      '$.leaf_divisor_m', (
        SELECT german_leaf.leaf_divisor_m
        FROM german_leaf
        WHERE german_leaf.item_code = documents.name
      ),
      '$.door_type', 'Cửa Đức',
      '$._formula_source', 'migration-0129-audited-german-leaf-divisor'
    ),
    version = version + 1,
    modified_at = '2026-08-13T00:00:00.000Z',
    modified_by = 'migration-0129'
WHERE doctype = 'Item'
  AND json_extract(payload_json, '$.item_group') = 'Cửa CN Đức'
  AND name IN (SELECT item_code FROM german_leaf);
