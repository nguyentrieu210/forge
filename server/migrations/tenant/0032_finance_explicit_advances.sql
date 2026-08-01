-- Explicit operator confirmation for customer/supplier advances.
--
-- Payment Entry may be partially or fully unallocated after migration 0031, but
-- the operator must deliberately confirm that the remainder becomes an advance.

UPDATE doctype_definitions
SET metadata_json=json_insert(
      metadata_json,
      '$.fields[#]',
      json('{"fieldname":"allow_unallocated","label":"Cho phép ghi nhận tiền ứng trước","fieldtype":"Check","default":false,"description":"Bật khi phần chưa phân bổ của phiếu thu/chi được ghi nhận là tiền ứng trước.","in_standard_filter":true}')
    ),
    revision=revision+1,
    modified_by='migration',
    modified_at='2026-08-01T00:00:00.000Z'
WHERE doctype='Payment Entry'
  AND NOT EXISTS(
    SELECT 1 FROM json_each(metadata_json,'$.fields')
    WHERE json_extract(value,'$.fieldname')='allow_unallocated'
  );
