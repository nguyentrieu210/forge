-- Alumdoor warehouse cleanup.
-- Keeps one logical root and exactly two physical stock warehouses: K36 and K12.
-- Removes generated test lots before removing their fake warehouse masters.
-- Re-runnable: all predicates are based on the retained warehouse allow-list.

-- Old Aluminium Lot rows were generated against fake warehouses. None points to K36/K12,
-- and no stock ledger entry exists for this tenant at the time of this cleanup.
DELETE FROM versions
WHERE tenant_id = 'alu'
  AND doc_key IN (
    SELECT doc_key
    FROM documents
    WHERE tenant_id = 'alu'
      AND doctype = 'Aluminium Lot'
      AND COALESCE(json_extract(payload_json, '$.warehouse'), '') NOT IN ('K36', 'K12')
  );

DELETE FROM document_comments
WHERE tenant_id = 'alu'
  AND doctype = 'Aluminium Lot'
  AND name IN (
    SELECT name
    FROM documents
    WHERE tenant_id = 'alu'
      AND doctype = 'Aluminium Lot'
      AND COALESCE(json_extract(payload_json, '$.warehouse'), '') NOT IN ('K36', 'K12')
  );

DELETE FROM document_shares
WHERE tenant_id = 'alu'
  AND doctype = 'Aluminium Lot'
  AND name IN (
    SELECT name
    FROM documents
    WHERE tenant_id = 'alu'
      AND doctype = 'Aluminium Lot'
      AND COALESCE(json_extract(payload_json, '$.warehouse'), '') NOT IN ('K36', 'K12')
  );

DELETE FROM document_tags
WHERE tenant_id = 'alu'
  AND doctype = 'Aluminium Lot'
  AND name IN (
    SELECT name
    FROM documents
    WHERE tenant_id = 'alu'
      AND doctype = 'Aluminium Lot'
      AND COALESCE(json_extract(payload_json, '$.warehouse'), '') NOT IN ('K36', 'K12')
  );

DELETE FROM assignments
WHERE tenant_id = 'alu'
  AND doctype = 'Aluminium Lot'
  AND name IN (
    SELECT name
    FROM documents
    WHERE tenant_id = 'alu'
      AND doctype = 'Aluminium Lot'
      AND COALESCE(json_extract(payload_json, '$.warehouse'), '') NOT IN ('K36', 'K12')
  );

DELETE FROM files
WHERE tenant_id = 'alu'
  AND attached_to_doctype = 'Aluminium Lot'
  AND attached_to_name IN (
    SELECT name
    FROM documents
    WHERE tenant_id = 'alu'
      AND doctype = 'Aluminium Lot'
      AND COALESCE(json_extract(payload_json, '$.warehouse'), '') NOT IN ('K36', 'K12')
  );

DELETE FROM documents
WHERE tenant_id = 'alu'
  AND doctype = 'Aluminium Lot'
  AND COALESCE(json_extract(payload_json, '$.warehouse'), '') NOT IN ('K36', 'K12');

-- Remove every fake warehouse master and its detached activity metadata.
DELETE FROM versions
WHERE tenant_id = 'alu'
  AND doc_key IN (
    SELECT doc_key
    FROM documents
    WHERE tenant_id = 'alu'
      AND doctype = 'Warehouse'
      AND name NOT IN ('Kho Alumdoor', 'K36', 'K12')
  );

DELETE FROM document_comments
WHERE tenant_id = 'alu'
  AND doctype = 'Warehouse'
  AND name NOT IN ('Kho Alumdoor', 'K36', 'K12');

DELETE FROM document_shares
WHERE tenant_id = 'alu'
  AND doctype = 'Warehouse'
  AND name NOT IN ('Kho Alumdoor', 'K36', 'K12');

DELETE FROM document_tags
WHERE tenant_id = 'alu'
  AND doctype = 'Warehouse'
  AND name NOT IN ('Kho Alumdoor', 'K36', 'K12');

DELETE FROM assignments
WHERE tenant_id = 'alu'
  AND doctype = 'Warehouse'
  AND name NOT IN ('Kho Alumdoor', 'K36', 'K12');

DELETE FROM files
WHERE tenant_id = 'alu'
  AND attached_to_doctype = 'Warehouse'
  AND attached_to_name NOT IN ('Kho Alumdoor', 'K36', 'K12');

DELETE FROM documents
WHERE tenant_id = 'alu'
  AND doctype = 'Warehouse'
  AND name NOT IN ('Kho Alumdoor', 'K36', 'K12');

-- The root groups the tree but never carries stock.
INSERT INTO documents
  (tenant_id, doc_key, doctype, name, owner, docstatus, status, version,
   created_at, modified_at, modified_by, payload_json)
VALUES
  ('alu', 'Warehouse:Kho Alumdoor', 'Warehouse', 'Kho Alumdoor', 'admin', 0, 'Draft', 1,
   '2026-07-28T12:30:00.000Z', '2026-07-28T12:30:00.000Z', 'admin',
   json_object(
     'warehouse_name', 'Kho Alumdoor',
     'is_group', json('true'),
     'disabled', json('false'),
     '_metadata_revision', 25
   ))
ON CONFLICT(tenant_id, doctype, name) DO UPDATE SET
  payload_json = excluded.payload_json,
  modified_at = excluded.modified_at,
  modified_by = excluded.modified_by,
  version = documents.version + 1;

-- K36 and K12 are the only physical leaves allowed to carry inventory.
INSERT INTO documents
  (tenant_id, doc_key, doctype, name, owner, docstatus, status, version,
   created_at, modified_at, modified_by, payload_json)
VALUES
  ('alu', 'Warehouse:K36', 'Warehouse', 'K36', 'admin', 0, 'Draft', 1,
   '2026-07-28T10:55:00.000Z', '2026-07-28T12:30:00.000Z', 'admin',
   json_object(
     'warehouse_name', 'K36',
     'parent_warehouse', 'Kho Alumdoor',
     'is_group', json('false'),
     'address', 'Kho vật lý K36',
     'disabled', json('false'),
     '_metadata_revision', 25
   )),
  ('alu', 'Warehouse:K12', 'Warehouse', 'K12', 'admin', 0, 'Draft', 1,
   '2026-07-28T10:55:00.000Z', '2026-07-28T12:30:00.000Z', 'admin',
   json_object(
     'warehouse_name', 'K12',
     'parent_warehouse', 'Kho Alumdoor',
     'is_group', json('false'),
     'address', 'Kho vật lý K12',
     'disabled', json('false'),
     '_metadata_revision', 25
   ))
ON CONFLICT(tenant_id, doctype, name) DO UPDATE SET
  payload_json = excluded.payload_json,
  modified_at = excluded.modified_at,
  modified_by = excluded.modified_by,
  version = documents.version + 1;

INSERT INTO document_search (tenant_id, doctype, name, title, content, modified_at)
VALUES
  ('alu', 'Warehouse', 'Kho Alumdoor', 'Kho Alumdoor', 'Kho Alumdoor nhóm gốc', '2026-07-28T12:30:00.000Z'),
  ('alu', 'Warehouse', 'K36', 'K36', 'K36 Kho vật lý K36 Kho Alumdoor', '2026-07-28T12:30:00.000Z'),
  ('alu', 'Warehouse', 'K12', 'K12', 'K12 Kho vật lý K12 Kho Alumdoor', '2026-07-28T12:30:00.000Z')
ON CONFLICT(tenant_id, doctype, name) DO UPDATE SET
  title = excluded.title,
  content = excluded.content,
  modified_at = excluded.modified_at;
