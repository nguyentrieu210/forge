-- PB ray (khách Lẻ) và PB nhựa (khách Đại lý) là hai số đo độc lập trên dòng đơn.
-- width_m vẫn được giữ làm giá trị chuẩn hoá cho công thức/BOM hiện hữu.

UPDATE doctype_definitions
SET metadata_json = json_insert(
      metadata_json,
      '$.fields[#]',
      json('{"fieldname":"width_pb_ray_m","label":"Rộng PB ray (m)","fieldtype":"Float","depends_on":"eval:doc.inventory_mode == ''Thành phẩm theo m2''","description":"Rộng phủ bì đo theo ray cho khách Lẻ; field riêng với PB nhựa.","surface":"quick"}')
    ),
    revision = revision + 1,
    modified_by = 'migration-0134',
    modified_at = '2026-08-18T00:00:00.000Z'
WHERE doctype = 'Sales Order Item'
  AND json_valid(metadata_json)
  AND NOT EXISTS (
    SELECT 1 FROM json_each(metadata_json, '$.fields') field
    WHERE json_extract(field.value, '$.fieldname') = 'width_pb_ray_m'
  );

UPDATE doctype_definitions
SET metadata_json = json_insert(
      metadata_json,
      '$.fields[#]',
      json('{"fieldname":"width_pb_nhua_m","label":"Rộng PB nhựa (m)","fieldtype":"Float","depends_on":"eval:doc.inventory_mode == ''Thành phẩm theo m2''","description":"Rộng phủ bì đo theo nhựa cho khách Đại lý; field riêng với PB ray.","surface":"quick"}')
    ),
    revision = revision + 1,
    modified_by = 'migration-0134',
    modified_at = '2026-08-18T00:00:00.000Z'
WHERE doctype = 'Sales Order Item'
  AND json_valid(metadata_json)
  AND NOT EXISTS (
    SELECT 1 FROM json_each(metadata_json, '$.fields') field
    WHERE json_extract(field.value, '$.fieldname') = 'width_pb_nhua_m'
  );

UPDATE doctype_definitions
SET metadata_json = json_set(metadata_json, '$.revision', revision)
WHERE doctype = 'Sales Order Item'
  AND json_valid(metadata_json)
  AND COALESCE(json_extract(metadata_json, '$.revision'), -1) <> revision;
