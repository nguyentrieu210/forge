-- Alumdoor master cleanup and verified catalogue-derived master data.

-- Generated 2026-07-28T14:30:00.000Z; cleanup targets come from alumdoor-master-cleanup-2026-07-28.audit.json.

-- Re-runnable: exact deletes plus idempotent upserts.

DELETE FROM versions
WHERE tenant_id='alu' AND doc_key IN (
  SELECT doc_key FROM documents
  WHERE tenant_id='alu' AND doctype='Payment Entry' AND name IN ('PT-2026-0001', 'PT-2026-0015')
);

DELETE FROM document_comments
WHERE tenant_id='alu' AND doctype='Payment Entry' AND name IN ('PT-2026-0001', 'PT-2026-0015');

DELETE FROM document_shares
WHERE tenant_id='alu' AND doctype='Payment Entry' AND name IN ('PT-2026-0001', 'PT-2026-0015');

DELETE FROM document_tags
WHERE tenant_id='alu' AND doctype='Payment Entry' AND name IN ('PT-2026-0001', 'PT-2026-0015');

DELETE FROM assignments
WHERE tenant_id='alu' AND doctype='Payment Entry' AND name IN ('PT-2026-0001', 'PT-2026-0015');

DELETE FROM files
WHERE tenant_id='alu' AND attached_to_doctype='Payment Entry' AND attached_to_name IN ('PT-2026-0001', 'PT-2026-0015');

DELETE FROM document_search
WHERE tenant_id='alu' AND doctype='Payment Entry' AND name IN ('PT-2026-0001', 'PT-2026-0015');

DELETE FROM documents
WHERE tenant_id='alu' AND doctype='Payment Entry' AND name IN ('PT-2026-0001', 'PT-2026-0015');

DELETE FROM versions
WHERE tenant_id='alu' AND doc_key IN (
  SELECT doc_key FROM documents
  WHERE tenant_id='alu' AND doctype='Customer' AND name IN ('C01140', 'KH tồn 02942', 'KH tồn 10332', 'KH tồn 19697', 'KH tồn 30063', 'KH tồn 33257', 'KH tồn 39732', 'KH tồn 51052', 'KH tồn 52412', 'KH tồn 60046', 'KH tồn 65996', 'KH tồn 69017', 'KH tồn 74677', 'KH tồn 90260', 'KH tồn 96480', 'KH tồn 99104', 'Khách thử 10332', 'Khách thử 11981', 'Khách thử 16758', 'Khách thử 19697', 'Khách thử 30063', 'Khách thử 33257', 'Khách thử 38833', 'Khách thử 51052', 'Khách thử 52412', 'Khách thử 56657', 'Khách thử 60046', 'Khách thử 65032', 'Khách thử 65996', 'Khách thử 69017', 'Khách thử 74677', 'Khách thử 76487', 'Khách thử 90260', 'Khách thử 91315', 'Khách thử 96480', 'Khách thử 99104', 'Khách thử mua 04060', 'Khách thử mua 40790', 'Khách thử mua 61624', 'Khách thử mua 78468', 'Khách thử mua 82075', 'Khách thử mua 84542', 'Khách thử mua 93792')
);

DELETE FROM document_comments
WHERE tenant_id='alu' AND doctype='Customer' AND name IN ('C01140', 'KH tồn 02942', 'KH tồn 10332', 'KH tồn 19697', 'KH tồn 30063', 'KH tồn 33257', 'KH tồn 39732', 'KH tồn 51052', 'KH tồn 52412', 'KH tồn 60046', 'KH tồn 65996', 'KH tồn 69017', 'KH tồn 74677', 'KH tồn 90260', 'KH tồn 96480', 'KH tồn 99104', 'Khách thử 10332', 'Khách thử 11981', 'Khách thử 16758', 'Khách thử 19697', 'Khách thử 30063', 'Khách thử 33257', 'Khách thử 38833', 'Khách thử 51052', 'Khách thử 52412', 'Khách thử 56657', 'Khách thử 60046', 'Khách thử 65032', 'Khách thử 65996', 'Khách thử 69017', 'Khách thử 74677', 'Khách thử 76487', 'Khách thử 90260', 'Khách thử 91315', 'Khách thử 96480', 'Khách thử 99104', 'Khách thử mua 04060', 'Khách thử mua 40790', 'Khách thử mua 61624', 'Khách thử mua 78468', 'Khách thử mua 82075', 'Khách thử mua 84542', 'Khách thử mua 93792');

DELETE FROM document_shares
WHERE tenant_id='alu' AND doctype='Customer' AND name IN ('C01140', 'KH tồn 02942', 'KH tồn 10332', 'KH tồn 19697', 'KH tồn 30063', 'KH tồn 33257', 'KH tồn 39732', 'KH tồn 51052', 'KH tồn 52412', 'KH tồn 60046', 'KH tồn 65996', 'KH tồn 69017', 'KH tồn 74677', 'KH tồn 90260', 'KH tồn 96480', 'KH tồn 99104', 'Khách thử 10332', 'Khách thử 11981', 'Khách thử 16758', 'Khách thử 19697', 'Khách thử 30063', 'Khách thử 33257', 'Khách thử 38833', 'Khách thử 51052', 'Khách thử 52412', 'Khách thử 56657', 'Khách thử 60046', 'Khách thử 65032', 'Khách thử 65996', 'Khách thử 69017', 'Khách thử 74677', 'Khách thử 76487', 'Khách thử 90260', 'Khách thử 91315', 'Khách thử 96480', 'Khách thử 99104', 'Khách thử mua 04060', 'Khách thử mua 40790', 'Khách thử mua 61624', 'Khách thử mua 78468', 'Khách thử mua 82075', 'Khách thử mua 84542', 'Khách thử mua 93792');

DELETE FROM document_tags
WHERE tenant_id='alu' AND doctype='Customer' AND name IN ('C01140', 'KH tồn 02942', 'KH tồn 10332', 'KH tồn 19697', 'KH tồn 30063', 'KH tồn 33257', 'KH tồn 39732', 'KH tồn 51052', 'KH tồn 52412', 'KH tồn 60046', 'KH tồn 65996', 'KH tồn 69017', 'KH tồn 74677', 'KH tồn 90260', 'KH tồn 96480', 'KH tồn 99104', 'Khách thử 10332', 'Khách thử 11981', 'Khách thử 16758', 'Khách thử 19697', 'Khách thử 30063', 'Khách thử 33257', 'Khách thử 38833', 'Khách thử 51052', 'Khách thử 52412', 'Khách thử 56657', 'Khách thử 60046', 'Khách thử 65032', 'Khách thử 65996', 'Khách thử 69017', 'Khách thử 74677', 'Khách thử 76487', 'Khách thử 90260', 'Khách thử 91315', 'Khách thử 96480', 'Khách thử 99104', 'Khách thử mua 04060', 'Khách thử mua 40790', 'Khách thử mua 61624', 'Khách thử mua 78468', 'Khách thử mua 82075', 'Khách thử mua 84542', 'Khách thử mua 93792');

DELETE FROM assignments
WHERE tenant_id='alu' AND doctype='Customer' AND name IN ('C01140', 'KH tồn 02942', 'KH tồn 10332', 'KH tồn 19697', 'KH tồn 30063', 'KH tồn 33257', 'KH tồn 39732', 'KH tồn 51052', 'KH tồn 52412', 'KH tồn 60046', 'KH tồn 65996', 'KH tồn 69017', 'KH tồn 74677', 'KH tồn 90260', 'KH tồn 96480', 'KH tồn 99104', 'Khách thử 10332', 'Khách thử 11981', 'Khách thử 16758', 'Khách thử 19697', 'Khách thử 30063', 'Khách thử 33257', 'Khách thử 38833', 'Khách thử 51052', 'Khách thử 52412', 'Khách thử 56657', 'Khách thử 60046', 'Khách thử 65032', 'Khách thử 65996', 'Khách thử 69017', 'Khách thử 74677', 'Khách thử 76487', 'Khách thử 90260', 'Khách thử 91315', 'Khách thử 96480', 'Khách thử 99104', 'Khách thử mua 04060', 'Khách thử mua 40790', 'Khách thử mua 61624', 'Khách thử mua 78468', 'Khách thử mua 82075', 'Khách thử mua 84542', 'Khách thử mua 93792');

DELETE FROM files
WHERE tenant_id='alu' AND attached_to_doctype='Customer' AND attached_to_name IN ('C01140', 'KH tồn 02942', 'KH tồn 10332', 'KH tồn 19697', 'KH tồn 30063', 'KH tồn 33257', 'KH tồn 39732', 'KH tồn 51052', 'KH tồn 52412', 'KH tồn 60046', 'KH tồn 65996', 'KH tồn 69017', 'KH tồn 74677', 'KH tồn 90260', 'KH tồn 96480', 'KH tồn 99104', 'Khách thử 10332', 'Khách thử 11981', 'Khách thử 16758', 'Khách thử 19697', 'Khách thử 30063', 'Khách thử 33257', 'Khách thử 38833', 'Khách thử 51052', 'Khách thử 52412', 'Khách thử 56657', 'Khách thử 60046', 'Khách thử 65032', 'Khách thử 65996', 'Khách thử 69017', 'Khách thử 74677', 'Khách thử 76487', 'Khách thử 90260', 'Khách thử 91315', 'Khách thử 96480', 'Khách thử 99104', 'Khách thử mua 04060', 'Khách thử mua 40790', 'Khách thử mua 61624', 'Khách thử mua 78468', 'Khách thử mua 82075', 'Khách thử mua 84542', 'Khách thử mua 93792');

DELETE FROM document_search
WHERE tenant_id='alu' AND doctype='Customer' AND name IN ('C01140', 'KH tồn 02942', 'KH tồn 10332', 'KH tồn 19697', 'KH tồn 30063', 'KH tồn 33257', 'KH tồn 39732', 'KH tồn 51052', 'KH tồn 52412', 'KH tồn 60046', 'KH tồn 65996', 'KH tồn 69017', 'KH tồn 74677', 'KH tồn 90260', 'KH tồn 96480', 'KH tồn 99104', 'Khách thử 10332', 'Khách thử 11981', 'Khách thử 16758', 'Khách thử 19697', 'Khách thử 30063', 'Khách thử 33257', 'Khách thử 38833', 'Khách thử 51052', 'Khách thử 52412', 'Khách thử 56657', 'Khách thử 60046', 'Khách thử 65032', 'Khách thử 65996', 'Khách thử 69017', 'Khách thử 74677', 'Khách thử 76487', 'Khách thử 90260', 'Khách thử 91315', 'Khách thử 96480', 'Khách thử 99104', 'Khách thử mua 04060', 'Khách thử mua 40790', 'Khách thử mua 61624', 'Khách thử mua 78468', 'Khách thử mua 82075', 'Khách thử mua 84542', 'Khách thử mua 93792');

DELETE FROM documents
WHERE tenant_id='alu' AND doctype='Customer' AND name IN ('C01140', 'KH tồn 02942', 'KH tồn 10332', 'KH tồn 19697', 'KH tồn 30063', 'KH tồn 33257', 'KH tồn 39732', 'KH tồn 51052', 'KH tồn 52412', 'KH tồn 60046', 'KH tồn 65996', 'KH tồn 69017', 'KH tồn 74677', 'KH tồn 90260', 'KH tồn 96480', 'KH tồn 99104', 'Khách thử 10332', 'Khách thử 11981', 'Khách thử 16758', 'Khách thử 19697', 'Khách thử 30063', 'Khách thử 33257', 'Khách thử 38833', 'Khách thử 51052', 'Khách thử 52412', 'Khách thử 56657', 'Khách thử 60046', 'Khách thử 65032', 'Khách thử 65996', 'Khách thử 69017', 'Khách thử 74677', 'Khách thử 76487', 'Khách thử 90260', 'Khách thử 91315', 'Khách thử 96480', 'Khách thử 99104', 'Khách thử mua 04060', 'Khách thử mua 40790', 'Khách thử mua 61624', 'Khách thử mua 78468', 'Khách thử mua 82075', 'Khách thử mua 84542', 'Khách thử mua 93792');

DELETE FROM versions
WHERE tenant_id='alu' AND doc_key IN (
  SELECT doc_key FROM documents
  WHERE tenant_id='alu' AND doctype='Supplier' AND name IN ('Hoàng Lai 04060', 'Hoàng Lai 40790', 'Hoàng Lai 61624', 'Hoàng Lai 78468', 'Hoàng Lai 82075', 'Hoàng Lai 84542', 'Hoàng Lai 93792', 'Lạ mặt 04060', 'Lạ mặt 40790', 'Lạ mặt 61624', 'Lạ mặt 78468', 'Lạ mặt 82075', 'Lạ mặt 84542', 'Lạ mặt 93792', 'Tiến Đạt 04060', 'Tiến Đạt 40790', 'Tiến Đạt 61624', 'Tiến Đạt 78468', 'Tiến Đạt 82075', 'Tiến Đạt 82701', 'Tiến Đạt 84542', 'Tiến Đạt 93792')
);

DELETE FROM document_comments
WHERE tenant_id='alu' AND doctype='Supplier' AND name IN ('Hoàng Lai 04060', 'Hoàng Lai 40790', 'Hoàng Lai 61624', 'Hoàng Lai 78468', 'Hoàng Lai 82075', 'Hoàng Lai 84542', 'Hoàng Lai 93792', 'Lạ mặt 04060', 'Lạ mặt 40790', 'Lạ mặt 61624', 'Lạ mặt 78468', 'Lạ mặt 82075', 'Lạ mặt 84542', 'Lạ mặt 93792', 'Tiến Đạt 04060', 'Tiến Đạt 40790', 'Tiến Đạt 61624', 'Tiến Đạt 78468', 'Tiến Đạt 82075', 'Tiến Đạt 82701', 'Tiến Đạt 84542', 'Tiến Đạt 93792');

DELETE FROM document_shares
WHERE tenant_id='alu' AND doctype='Supplier' AND name IN ('Hoàng Lai 04060', 'Hoàng Lai 40790', 'Hoàng Lai 61624', 'Hoàng Lai 78468', 'Hoàng Lai 82075', 'Hoàng Lai 84542', 'Hoàng Lai 93792', 'Lạ mặt 04060', 'Lạ mặt 40790', 'Lạ mặt 61624', 'Lạ mặt 78468', 'Lạ mặt 82075', 'Lạ mặt 84542', 'Lạ mặt 93792', 'Tiến Đạt 04060', 'Tiến Đạt 40790', 'Tiến Đạt 61624', 'Tiến Đạt 78468', 'Tiến Đạt 82075', 'Tiến Đạt 82701', 'Tiến Đạt 84542', 'Tiến Đạt 93792');

DELETE FROM document_tags
WHERE tenant_id='alu' AND doctype='Supplier' AND name IN ('Hoàng Lai 04060', 'Hoàng Lai 40790', 'Hoàng Lai 61624', 'Hoàng Lai 78468', 'Hoàng Lai 82075', 'Hoàng Lai 84542', 'Hoàng Lai 93792', 'Lạ mặt 04060', 'Lạ mặt 40790', 'Lạ mặt 61624', 'Lạ mặt 78468', 'Lạ mặt 82075', 'Lạ mặt 84542', 'Lạ mặt 93792', 'Tiến Đạt 04060', 'Tiến Đạt 40790', 'Tiến Đạt 61624', 'Tiến Đạt 78468', 'Tiến Đạt 82075', 'Tiến Đạt 82701', 'Tiến Đạt 84542', 'Tiến Đạt 93792');

DELETE FROM assignments
WHERE tenant_id='alu' AND doctype='Supplier' AND name IN ('Hoàng Lai 04060', 'Hoàng Lai 40790', 'Hoàng Lai 61624', 'Hoàng Lai 78468', 'Hoàng Lai 82075', 'Hoàng Lai 84542', 'Hoàng Lai 93792', 'Lạ mặt 04060', 'Lạ mặt 40790', 'Lạ mặt 61624', 'Lạ mặt 78468', 'Lạ mặt 82075', 'Lạ mặt 84542', 'Lạ mặt 93792', 'Tiến Đạt 04060', 'Tiến Đạt 40790', 'Tiến Đạt 61624', 'Tiến Đạt 78468', 'Tiến Đạt 82075', 'Tiến Đạt 82701', 'Tiến Đạt 84542', 'Tiến Đạt 93792');

DELETE FROM files
WHERE tenant_id='alu' AND attached_to_doctype='Supplier' AND attached_to_name IN ('Hoàng Lai 04060', 'Hoàng Lai 40790', 'Hoàng Lai 61624', 'Hoàng Lai 78468', 'Hoàng Lai 82075', 'Hoàng Lai 84542', 'Hoàng Lai 93792', 'Lạ mặt 04060', 'Lạ mặt 40790', 'Lạ mặt 61624', 'Lạ mặt 78468', 'Lạ mặt 82075', 'Lạ mặt 84542', 'Lạ mặt 93792', 'Tiến Đạt 04060', 'Tiến Đạt 40790', 'Tiến Đạt 61624', 'Tiến Đạt 78468', 'Tiến Đạt 82075', 'Tiến Đạt 82701', 'Tiến Đạt 84542', 'Tiến Đạt 93792');

DELETE FROM document_search
WHERE tenant_id='alu' AND doctype='Supplier' AND name IN ('Hoàng Lai 04060', 'Hoàng Lai 40790', 'Hoàng Lai 61624', 'Hoàng Lai 78468', 'Hoàng Lai 82075', 'Hoàng Lai 84542', 'Hoàng Lai 93792', 'Lạ mặt 04060', 'Lạ mặt 40790', 'Lạ mặt 61624', 'Lạ mặt 78468', 'Lạ mặt 82075', 'Lạ mặt 84542', 'Lạ mặt 93792', 'Tiến Đạt 04060', 'Tiến Đạt 40790', 'Tiến Đạt 61624', 'Tiến Đạt 78468', 'Tiến Đạt 82075', 'Tiến Đạt 82701', 'Tiến Đạt 84542', 'Tiến Đạt 93792');

DELETE FROM documents
WHERE tenant_id='alu' AND doctype='Supplier' AND name IN ('Hoàng Lai 04060', 'Hoàng Lai 40790', 'Hoàng Lai 61624', 'Hoàng Lai 78468', 'Hoàng Lai 82075', 'Hoàng Lai 84542', 'Hoàng Lai 93792', 'Lạ mặt 04060', 'Lạ mặt 40790', 'Lạ mặt 61624', 'Lạ mặt 78468', 'Lạ mặt 82075', 'Lạ mặt 84542', 'Lạ mặt 93792', 'Tiến Đạt 04060', 'Tiến Đạt 40790', 'Tiến Đạt 61624', 'Tiến Đạt 78468', 'Tiến Đạt 82075', 'Tiến Đạt 82701', 'Tiến Đạt 84542', 'Tiến Đạt 93792');

DELETE FROM versions
WHERE tenant_id='alu' AND doc_key IN (
  SELECT doc_key FROM documents
  WHERE tenant_id='alu' AND doctype='Price List' AND name IN ('Giá đại lý 10332', 'Giá đại lý 19697', 'Giá đại lý 30063', 'Giá đại lý 33257', 'Giá đại lý 51052', 'Giá đại lý 60046', 'Giá đại lý 65996', 'Giá đại lý 74677', 'Giá đại lý 90260')
);

DELETE FROM document_comments
WHERE tenant_id='alu' AND doctype='Price List' AND name IN ('Giá đại lý 10332', 'Giá đại lý 19697', 'Giá đại lý 30063', 'Giá đại lý 33257', 'Giá đại lý 51052', 'Giá đại lý 60046', 'Giá đại lý 65996', 'Giá đại lý 74677', 'Giá đại lý 90260');

DELETE FROM document_shares
WHERE tenant_id='alu' AND doctype='Price List' AND name IN ('Giá đại lý 10332', 'Giá đại lý 19697', 'Giá đại lý 30063', 'Giá đại lý 33257', 'Giá đại lý 51052', 'Giá đại lý 60046', 'Giá đại lý 65996', 'Giá đại lý 74677', 'Giá đại lý 90260');

DELETE FROM document_tags
WHERE tenant_id='alu' AND doctype='Price List' AND name IN ('Giá đại lý 10332', 'Giá đại lý 19697', 'Giá đại lý 30063', 'Giá đại lý 33257', 'Giá đại lý 51052', 'Giá đại lý 60046', 'Giá đại lý 65996', 'Giá đại lý 74677', 'Giá đại lý 90260');

DELETE FROM assignments
WHERE tenant_id='alu' AND doctype='Price List' AND name IN ('Giá đại lý 10332', 'Giá đại lý 19697', 'Giá đại lý 30063', 'Giá đại lý 33257', 'Giá đại lý 51052', 'Giá đại lý 60046', 'Giá đại lý 65996', 'Giá đại lý 74677', 'Giá đại lý 90260');

DELETE FROM files
WHERE tenant_id='alu' AND attached_to_doctype='Price List' AND attached_to_name IN ('Giá đại lý 10332', 'Giá đại lý 19697', 'Giá đại lý 30063', 'Giá đại lý 33257', 'Giá đại lý 51052', 'Giá đại lý 60046', 'Giá đại lý 65996', 'Giá đại lý 74677', 'Giá đại lý 90260');

DELETE FROM document_search
WHERE tenant_id='alu' AND doctype='Price List' AND name IN ('Giá đại lý 10332', 'Giá đại lý 19697', 'Giá đại lý 30063', 'Giá đại lý 33257', 'Giá đại lý 51052', 'Giá đại lý 60046', 'Giá đại lý 65996', 'Giá đại lý 74677', 'Giá đại lý 90260');

DELETE FROM documents
WHERE tenant_id='alu' AND doctype='Price List' AND name IN ('Giá đại lý 10332', 'Giá đại lý 19697', 'Giá đại lý 30063', 'Giá đại lý 33257', 'Giá đại lý 51052', 'Giá đại lý 60046', 'Giá đại lý 65996', 'Giá đại lý 74677', 'Giá đại lý 90260');

INSERT INTO documents
  (tenant_id,doc_key,doctype,name,owner,docstatus,status,version,created_at,modified_at,modified_by,payload_json)
VALUES
  ('alu','Item Color:THÔ','Item Color','THÔ','admin',0,'Draft',1,'2026-07-28T14:30:00.000Z','2026-07-28T14:30:00.000Z','admin','{"color_code":"THÔ","color_name":"Thô","finish":"Thô","note":"Mã màu gốc từ lịch sử tồn nhôm; xuất hiện 911 dòng. Chưa tự diễn giải mã viết tắt.","disabled":false,"_metadata_revision":1}'),
  ('alu','Item Color:GS','Item Color','GS','admin',0,'Draft',1,'2026-07-28T14:30:00.000Z','2026-07-28T14:30:00.000Z','admin','{"color_code":"GS","color_name":"GS","finish":"Khác","note":"Mã màu gốc từ lịch sử tồn nhôm; xuất hiện 286 dòng. Chưa tự diễn giải mã viết tắt.","disabled":false,"_metadata_revision":1}'),
  ('alu','Item Color:VK','Item Color','VK','admin',0,'Draft',1,'2026-07-28T14:30:00.000Z','2026-07-28T14:30:00.000Z','admin','{"color_code":"VK","color_name":"VK","finish":"Khác","note":"Mã màu gốc từ lịch sử tồn nhôm; xuất hiện 68 dòng. Chưa tự diễn giải mã viết tắt.","disabled":false,"_metadata_revision":1}'),
  ('alu','Item Color:CF','Item Color','CF','admin',0,'Draft',1,'2026-07-28T14:30:00.000Z','2026-07-28T14:30:00.000Z','admin','{"color_code":"CF","color_name":"CF","finish":"Khác","note":"Mã màu gốc từ lịch sử tồn nhôm; xuất hiện 1 dòng. Chưa tự diễn giải mã viết tắt.","disabled":false,"_metadata_revision":1}'),
  ('alu','Item Color:XF','Item Color','XF','admin',0,'Draft',1,'2026-07-28T14:30:00.000Z','2026-07-28T14:30:00.000Z','admin','{"color_code":"XF","color_name":"XF","finish":"Khác","note":"Mã màu gốc từ lịch sử tồn nhôm; xuất hiện 1 dòng. Chưa tự diễn giải mã viết tắt.","disabled":false,"_metadata_revision":1}'),
  ('alu','Item Color:4004','Item Color','4004','admin',0,'Draft',1,'2026-07-28T14:30:00.000Z','2026-07-28T14:30:00.000Z','admin','{"color_code":"4004","color_name":"4004","finish":"Khác","note":"Mã màu gốc từ lịch sử tồn nhôm; xuất hiện 1 dòng. Chưa tự diễn giải mã viết tắt.","disabled":false,"_metadata_revision":1}')
ON CONFLICT(tenant_id,doc_key) DO UPDATE SET
  payload_json=excluded.payload_json,
  modified_at=excluded.modified_at,
  modified_by=excluded.modified_by,
  version=documents.version+1;

INSERT INTO document_search(tenant_id,doctype,name,title,content,modified_at)
VALUES
  ('alu','Item Color','THÔ','Thô','THÔ Thô Thô','2026-07-28T14:30:00.000Z'),
  ('alu','Item Color','GS','GS','GS GS Khác','2026-07-28T14:30:00.000Z'),
  ('alu','Item Color','VK','VK','VK VK Khác','2026-07-28T14:30:00.000Z'),
  ('alu','Item Color','CF','CF','CF CF Khác','2026-07-28T14:30:00.000Z'),
  ('alu','Item Color','XF','XF','XF XF Khác','2026-07-28T14:30:00.000Z'),
  ('alu','Item Color','4004','4004','4004 4004 Khác','2026-07-28T14:30:00.000Z')
ON CONFLICT(tenant_id,doctype,name) DO UPDATE SET
  title=excluded.title,content=excluded.content,modified_at=excluded.modified_at;

INSERT INTO documents
  (tenant_id,doc_key,doctype,name,owner,docstatus,status,version,created_at,modified_at,modified_by,payload_json)
VALUES
  ('alu','Brand:ALUMAX','Brand','ALUMAX','admin',0,'Draft',1,'2026-07-28T14:30:00.000Z','2026-07-28T14:30:00.000Z','admin','{"brand_name":"ALUMAX","note":"Tên xuất hiện trực tiếp trong mã/tên mặt hàng Alumdoor.","disabled":false,"_metadata_revision":1}'),
  ('alu','Brand:TANKER','Brand','TANKER','admin',0,'Draft',1,'2026-07-28T14:30:00.000Z','2026-07-28T14:30:00.000Z','admin','{"brand_name":"TANKER","note":"Tên xuất hiện trực tiếp trong mã/tên mặt hàng Alumdoor.","disabled":false,"_metadata_revision":1}'),
  ('alu','Brand:YH TAIWAN','Brand','YH TAIWAN','admin',0,'Draft',1,'2026-07-28T14:30:00.000Z','2026-07-28T14:30:00.000Z','admin','{"brand_name":"YH TAIWAN","note":"Tên xuất hiện trực tiếp trong mã/tên mặt hàng Alumdoor.","disabled":false,"_metadata_revision":1}'),
  ('alu','Brand:YHLD','Brand','YHLD','admin',0,'Draft',1,'2026-07-28T14:30:00.000Z','2026-07-28T14:30:00.000Z','admin','{"brand_name":"YHLD","note":"Tên xuất hiện trực tiếp trong mã/tên mặt hàng Alumdoor.","disabled":false,"_metadata_revision":1}'),
  ('alu','Brand:JG','Brand','JG','admin',0,'Draft',1,'2026-07-28T14:30:00.000Z','2026-07-28T14:30:00.000Z','admin','{"brand_name":"JG","note":"Tên xuất hiện trực tiếp trong mã/tên mặt hàng Alumdoor.","disabled":false,"_metadata_revision":1}'),
  ('alu','Brand:BOSTEC','Brand','BOSTEC','admin',0,'Draft',1,'2026-07-28T14:30:00.000Z','2026-07-28T14:30:00.000Z','admin','{"brand_name":"BOSTEC","note":"Tên xuất hiện trực tiếp trong mã/tên mặt hàng Alumdoor.","disabled":false,"_metadata_revision":1}'),
  ('alu','Brand:CH TAIWAN','Brand','CH TAIWAN','admin',0,'Draft',1,'2026-07-28T14:30:00.000Z','2026-07-28T14:30:00.000Z','admin','{"brand_name":"CH TAIWAN","note":"Tên xuất hiện trực tiếp trong mã/tên mặt hàng Alumdoor.","disabled":false,"_metadata_revision":1}'),
  ('alu','Brand:MULLER','Brand','MULLER','admin',0,'Draft',1,'2026-07-28T14:30:00.000Z','2026-07-28T14:30:00.000Z','admin','{"brand_name":"MULLER","note":"Tên xuất hiện trực tiếp trong mã/tên mặt hàng Alumdoor.","disabled":false,"_metadata_revision":1}')
ON CONFLICT(tenant_id,doc_key) DO UPDATE SET
  payload_json=excluded.payload_json,
  modified_at=excluded.modified_at,
  modified_by=excluded.modified_by,
  version=documents.version+1;

INSERT INTO document_search(tenant_id,doctype,name,title,content,modified_at)
VALUES
  ('alu','Brand','ALUMAX','ALUMAX','ALUMAX','2026-07-28T14:30:00.000Z'),
  ('alu','Brand','TANKER','TANKER','TANKER','2026-07-28T14:30:00.000Z'),
  ('alu','Brand','YH TAIWAN','YH TAIWAN','YH TAIWAN','2026-07-28T14:30:00.000Z'),
  ('alu','Brand','YHLD','YHLD','YHLD','2026-07-28T14:30:00.000Z'),
  ('alu','Brand','JG','JG','JG','2026-07-28T14:30:00.000Z'),
  ('alu','Brand','BOSTEC','BOSTEC','BOSTEC','2026-07-28T14:30:00.000Z'),
  ('alu','Brand','CH TAIWAN','CH TAIWAN','CH TAIWAN','2026-07-28T14:30:00.000Z'),
  ('alu','Brand','MULLER','MULLER','MULLER','2026-07-28T14:30:00.000Z')
ON CONFLICT(tenant_id,doctype,name) DO UPDATE SET
  title=excluded.title,content=excluded.content,modified_at=excluded.modified_at;

INSERT INTO documents
  (tenant_id,doc_key,doctype,name,owner,docstatus,status,version,created_at,modified_at,modified_by,payload_json)
VALUES
  ('alu','Material Specification:QC-TD-AL595','Material Specification','QC-TD-AL595','admin',0,'Draft',1,'2026-07-28T14:30:00.000Z','2026-07-28T14:30:00.000Z','admin','{"spec_code":"QC-TD-AL595","spec_name":"Quy cách ĐỨC AL595","profile_system":"Cửa CN Đức","section_code":"TD-AL595","width_mm":60,"note":"Độ dày 0.8-0.9 mm; bản lá 60 mm. Nguồn: pasted-text.txt","disabled":false,"_metadata_revision":1}'),
  ('alu','Material Specification:QC-TP-TD-AL71N','Material Specification','QC-TP-TD-AL71N','admin',0,'Draft',1,'2026-07-28T14:30:00.000Z','2026-07-28T14:30:00.000Z','admin','{"spec_code":"QC-TP-TD-AL71N","spec_name":"Quy cách ĐỨC AL71N","profile_system":"Cửa CN Đức","section_code":"TP-TD-AL71N","width_mm":55,"note":"Độ dày 0.9-1.1 mm; bản lá 55 mm. Nguồn: pasted-text.txt","disabled":false,"_metadata_revision":1}'),
  ('alu','Material Specification:QC-TP-TD-AL503N26','Material Specification','QC-TP-TD-AL503N26','admin',0,'Draft',1,'2026-07-28T14:30:00.000Z','2026-07-28T14:30:00.000Z','admin','{"spec_code":"QC-TP-TD-AL503N26","spec_name":"Quy cách ĐỨC AL503N","profile_system":"Cửa CN Đức","section_code":"TP-TD-AL503N26","width_mm":55,"note":"Độ dày 1.0-1.1 mm; bản lá 55 mm. Nguồn: pasted-text.txt","disabled":false,"_metadata_revision":1}'),
  ('alu','Material Specification:QC-AL503C','Material Specification','QC-AL503C','admin',0,'Draft',1,'2026-07-28T14:30:00.000Z','2026-07-28T14:30:00.000Z','admin','{"spec_code":"QC-AL503C","spec_name":"Quy cách AL503C","profile_system":"Cửa CN Đức","section_code":"AL503C","width_mm":50,"note":"Độ dày 1.0-1.1 mm; bản lá 50 mm. Nguồn: pasted-text.txt","disabled":false,"_metadata_revision":1}'),
  ('alu','Material Specification:QC-TP-ALD-548N','Material Specification','QC-TP-ALD-548N','admin',0,'Draft',1,'2026-07-28T14:30:00.000Z','2026-07-28T14:30:00.000Z','admin','{"spec_code":"QC-TP-ALD-548N","spec_name":"Quy cách ĐỨC AL548N","profile_system":"Cửa CN Đức","section_code":"TP-ALD-548N","width_mm":55,"note":"Độ dày 1.0-1.2 mm; bản lá 55 mm. Nguồn: pasted-text.txt","disabled":false,"_metadata_revision":1}'),
  ('alu','Material Specification:QC-AL501C','Material Specification','QC-AL501C','admin',0,'Draft',1,'2026-07-28T14:30:00.000Z','2026-07-28T14:30:00.000Z','admin','{"spec_code":"QC-AL501C","spec_name":"Quy cách AL501C","profile_system":"Cửa CN Đức","section_code":"AL501C","width_mm":50,"note":"Độ dày 1.0-1.2 mm; bản lá 50 mm. Nguồn: pasted-text.txt","disabled":false,"_metadata_revision":1}'),
  ('alu','Material Specification:QC-TP-TD-AL501N','Material Specification','QC-TP-TD-AL501N','admin',0,'Draft',1,'2026-07-28T14:30:00.000Z','2026-07-28T14:30:00.000Z','admin','{"spec_code":"QC-TP-TD-AL501N","spec_name":"Quy cách ĐỨC AL501N","profile_system":"Cửa CN Đức","section_code":"TP-TD-AL501N","width_mm":56,"note":"Độ dày 1.1-1.3 mm; bản lá 56 mm. Nguồn: pasted-text.txt","disabled":false,"_metadata_revision":1}'),
  ('alu','Material Specification:QC-TP-TD-AL652','Material Specification','QC-TP-TD-AL652','admin',0,'Draft',1,'2026-07-28T14:30:00.000Z','2026-07-28T14:30:00.000Z','admin','{"spec_code":"QC-TP-TD-AL652","spec_name":"Quy cách ĐỨC AL652","profile_system":"Cửa CN Đức","section_code":"TP-TD-AL652","width_mm":50,"note":"Độ dày 1.1-1.3 mm; bản lá 50 mm. Nguồn: pasted-text.txt","disabled":false,"_metadata_revision":1}'),
  ('alu','Material Specification:QC-TP-ALD-DL552','Material Specification','QC-TP-ALD-DL552','admin',0,'Draft',1,'2026-07-28T14:30:00.000Z','2026-07-28T14:30:00.000Z','admin','{"spec_code":"QC-TP-ALD-DL552","spec_name":"Quy cách ĐỨC AL552N","profile_system":"Cửa CN Đức","section_code":"TP-ALD-DL552","width_mm":56,"note":"Độ dày 1.2-1.4 mm; bản lá 56 mm. Nguồn: pasted-text.txt","disabled":false,"_metadata_revision":1}'),
  ('alu','Material Specification:QC-TP-TD-AL752N','Material Specification','QC-TP-TD-AL752N','admin',0,'Draft',1,'2026-07-28T14:30:00.000Z','2026-07-28T14:30:00.000Z','admin','{"spec_code":"QC-TP-TD-AL752N","spec_name":"Quy cách ĐỨC AL752N","profile_system":"Cửa CN Đức","section_code":"TP-TD-AL752N","width_mm":50,"note":"Độ dày 1.2-1.4 mm; bản lá 50 mm. Nguồn: pasted-text.txt","disabled":false,"_metadata_revision":1}'),
  ('alu','Material Specification:QC-TP-TD-AL50','Material Specification','QC-TP-TD-AL50','admin',0,'Draft',1,'2026-07-28T14:30:00.000Z','2026-07-28T14:30:00.000Z','admin','{"spec_code":"QC-TP-TD-AL50","spec_name":"Quy cách ĐỨC AL50","profile_system":"Cửa CN Đức","section_code":"TP-TD-AL50","width_mm":55,"note":"Độ dày 1.3-1.5 mm; bản lá 55 mm. Nguồn: pasted-text.txt","disabled":false,"_metadata_revision":1}'),
  ('alu','Material Specification:QC-TP-ALVIP50','Material Specification','QC-TP-ALVIP50','admin',0,'Draft',1,'2026-07-28T14:30:00.000Z','2026-07-28T14:30:00.000Z','admin','{"spec_code":"QC-TP-ALVIP50","spec_name":"Quy cách ĐỨC AL-VIP50","profile_system":"Cửa CN Đức","section_code":"TP-ALVIP50","width_mm":55,"note":"Độ dày 1.5-1.8 mm; bản lá 55 mm. Nguồn: pasted-text.txt","disabled":false,"_metadata_revision":1}'),
  ('alu','Material Specification:QC-TP-ALVIPST500','Material Specification','QC-TP-ALVIPST500','admin',0,'Draft',1,'2026-07-28T14:30:00.000Z','2026-07-28T14:30:00.000Z','admin','{"spec_code":"QC-TP-ALVIPST500","spec_name":"Quy cách ĐỨC AL-VIPST500","profile_system":"Cửa CN Đức","section_code":"TP-ALVIPST500","width_mm":55,"note":"Độ dày 2.0-2.3 mm; bản lá 55 mm. Nguồn: pasted-text.txt","disabled":false,"_metadata_revision":1}'),
  ('alu','Material Specification:QC-TP-ALVIPST700','Material Specification','QC-TP-ALVIPST700','admin',0,'Draft',1,'2026-07-28T14:30:00.000Z','2026-07-28T14:30:00.000Z','admin','{"spec_code":"QC-TP-ALVIPST700","spec_name":"Quy cách ĐỨC AL-VIPST700","profile_system":"Cửa CN Đức","section_code":"TP-ALVIPST700","width_mm":50,"note":"Độ dày 2.3-2.5 mm; bản lá 50 mm. Nguồn: pasted-text.txt","disabled":false,"_metadata_revision":1}'),
  ('alu','Material Specification:QC-TP-AL75','Material Specification','QC-TP-AL75','admin',0,'Draft',1,'2026-07-28T14:30:00.000Z','2026-07-28T14:30:00.000Z','admin','{"spec_code":"QC-TP-AL75","spec_name":"Quy cách ĐỨC AL75","profile_system":"Cửa CN Đức","section_code":"TP-AL75","width_mm":66,"note":"Độ dày 1.2-1.4 mm; bản lá 66 mm. Nguồn: pasted-text.txt","disabled":false,"_metadata_revision":1}')
ON CONFLICT(tenant_id,doc_key) DO UPDATE SET
  payload_json=excluded.payload_json,
  modified_at=excluded.modified_at,
  modified_by=excluded.modified_by,
  version=documents.version+1;

INSERT INTO document_search(tenant_id,doctype,name,title,content,modified_at)
VALUES
  ('alu','Material Specification','QC-TD-AL595','Quy cách ĐỨC AL595','QC-TD-AL595 Quy cách ĐỨC AL595 Độ dày 0.8-0.9 mm; bản lá 60 mm. Nguồn: pasted-text.txt','2026-07-28T14:30:00.000Z'),
  ('alu','Material Specification','QC-TP-TD-AL71N','Quy cách ĐỨC AL71N','QC-TP-TD-AL71N Quy cách ĐỨC AL71N Độ dày 0.9-1.1 mm; bản lá 55 mm. Nguồn: pasted-text.txt','2026-07-28T14:30:00.000Z'),
  ('alu','Material Specification','QC-TP-TD-AL503N26','Quy cách ĐỨC AL503N','QC-TP-TD-AL503N26 Quy cách ĐỨC AL503N Độ dày 1.0-1.1 mm; bản lá 55 mm. Nguồn: pasted-text.txt','2026-07-28T14:30:00.000Z'),
  ('alu','Material Specification','QC-AL503C','Quy cách AL503C','QC-AL503C Quy cách AL503C Độ dày 1.0-1.1 mm; bản lá 50 mm. Nguồn: pasted-text.txt','2026-07-28T14:30:00.000Z'),
  ('alu','Material Specification','QC-TP-ALD-548N','Quy cách ĐỨC AL548N','QC-TP-ALD-548N Quy cách ĐỨC AL548N Độ dày 1.0-1.2 mm; bản lá 55 mm. Nguồn: pasted-text.txt','2026-07-28T14:30:00.000Z'),
  ('alu','Material Specification','QC-AL501C','Quy cách AL501C','QC-AL501C Quy cách AL501C Độ dày 1.0-1.2 mm; bản lá 50 mm. Nguồn: pasted-text.txt','2026-07-28T14:30:00.000Z'),
  ('alu','Material Specification','QC-TP-TD-AL501N','Quy cách ĐỨC AL501N','QC-TP-TD-AL501N Quy cách ĐỨC AL501N Độ dày 1.1-1.3 mm; bản lá 56 mm. Nguồn: pasted-text.txt','2026-07-28T14:30:00.000Z'),
  ('alu','Material Specification','QC-TP-TD-AL652','Quy cách ĐỨC AL652','QC-TP-TD-AL652 Quy cách ĐỨC AL652 Độ dày 1.1-1.3 mm; bản lá 50 mm. Nguồn: pasted-text.txt','2026-07-28T14:30:00.000Z'),
  ('alu','Material Specification','QC-TP-ALD-DL552','Quy cách ĐỨC AL552N','QC-TP-ALD-DL552 Quy cách ĐỨC AL552N Độ dày 1.2-1.4 mm; bản lá 56 mm. Nguồn: pasted-text.txt','2026-07-28T14:30:00.000Z'),
  ('alu','Material Specification','QC-TP-TD-AL752N','Quy cách ĐỨC AL752N','QC-TP-TD-AL752N Quy cách ĐỨC AL752N Độ dày 1.2-1.4 mm; bản lá 50 mm. Nguồn: pasted-text.txt','2026-07-28T14:30:00.000Z'),
  ('alu','Material Specification','QC-TP-TD-AL50','Quy cách ĐỨC AL50','QC-TP-TD-AL50 Quy cách ĐỨC AL50 Độ dày 1.3-1.5 mm; bản lá 55 mm. Nguồn: pasted-text.txt','2026-07-28T14:30:00.000Z'),
  ('alu','Material Specification','QC-TP-ALVIP50','Quy cách ĐỨC AL-VIP50','QC-TP-ALVIP50 Quy cách ĐỨC AL-VIP50 Độ dày 1.5-1.8 mm; bản lá 55 mm. Nguồn: pasted-text.txt','2026-07-28T14:30:00.000Z'),
  ('alu','Material Specification','QC-TP-ALVIPST500','Quy cách ĐỨC AL-VIPST500','QC-TP-ALVIPST500 Quy cách ĐỨC AL-VIPST500 Độ dày 2.0-2.3 mm; bản lá 55 mm. Nguồn: pasted-text.txt','2026-07-28T14:30:00.000Z'),
  ('alu','Material Specification','QC-TP-ALVIPST700','Quy cách ĐỨC AL-VIPST700','QC-TP-ALVIPST700 Quy cách ĐỨC AL-VIPST700 Độ dày 2.3-2.5 mm; bản lá 50 mm. Nguồn: pasted-text.txt','2026-07-28T14:30:00.000Z'),
  ('alu','Material Specification','QC-TP-AL75','Quy cách ĐỨC AL75','QC-TP-AL75 Quy cách ĐỨC AL75 Độ dày 1.2-1.4 mm; bản lá 66 mm. Nguồn: pasted-text.txt','2026-07-28T14:30:00.000Z')
ON CONFLICT(tenant_id,doctype,name) DO UPDATE SET
  title=excluded.title,content=excluded.content,modified_at=excluded.modified_at;

INSERT INTO documents
  (tenant_id,doc_key,doctype,name,owner,docstatus,status,version,created_at,modified_at,modified_by,payload_json)
VALUES
  ('alu','Measurement Profile:Hàng thường','Measurement Profile','Hàng thường','admin',0,'Draft',1,'2026-07-28T14:30:00.000Z','2026-07-28T14:30:00.000Z','admin','{"profile_name":"Hàng thường","inventory_mode":"Hàng thường","stock_uom":"Cái","disabled":false,"_metadata_revision":2}'),
  ('alu','Measurement Profile:Nhôm cây/lá','Measurement Profile','Nhôm cây/lá','admin',0,'Draft',1,'2026-07-28T14:30:00.000Z','2026-07-28T14:30:00.000Z','admin','{"profile_name":"Nhôm cây/lá","inventory_mode":"Nhôm cây/lá","stock_uom":"Kg","track_dimension_lot":true,"require_color":true,"require_condition":true,"require_length":true,"require_piece_qty":true,"disabled":false,"_metadata_revision":2}'),
  ('alu','Measurement Profile:Tấm/Kính','Measurement Profile','Tấm/Kính','admin',0,'Draft',1,'2026-07-28T14:30:00.000Z','2026-07-28T14:30:00.000Z','admin','{"profile_name":"Tấm/Kính","inventory_mode":"Tấm/Kính","stock_uom":"Tấm","track_dimension_lot":true,"require_length":true,"require_width":true,"require_piece_qty":true,"disabled":false,"_metadata_revision":2}'),
  ('alu','Measurement Profile:Cuộn','Measurement Profile','Cuộn','admin',0,'Draft',1,'2026-07-28T14:30:00.000Z','2026-07-28T14:30:00.000Z','admin','{"profile_name":"Cuộn","inventory_mode":"Cuộn","stock_uom":"Kg","track_dimension_lot":true,"require_width":true,"disabled":false,"_metadata_revision":2}'),
  ('alu','Measurement Profile:Lô/Serial','Measurement Profile','Lô/Serial','admin',0,'Draft',1,'2026-07-28T14:30:00.000Z','2026-07-28T14:30:00.000Z','admin','{"profile_name":"Lô/Serial","inventory_mode":"Lô/Serial","stock_uom":"Cái","disabled":false,"_metadata_revision":2}'),
  ('alu','Measurement Profile:Thành phẩm theo m2','Measurement Profile','Thành phẩm theo m2','admin',0,'Draft',1,'2026-07-28T14:30:00.000Z','2026-07-28T14:30:00.000Z','admin','{"profile_name":"Thành phẩm theo m2","inventory_mode":"Thành phẩm theo m2","stock_uom":"Bộ","require_length":true,"require_width":true,"disabled":false,"_metadata_revision":2}')
ON CONFLICT(tenant_id,doc_key) DO UPDATE SET
  payload_json=excluded.payload_json,
  modified_at=excluded.modified_at,
  modified_by=excluded.modified_by,
  version=documents.version+1;

INSERT INTO document_search(tenant_id,doctype,name,title,content,modified_at)
VALUES
  ('alu','Measurement Profile','Hàng thường','Hàng thường','Hàng thường Hàng thường Cái','2026-07-28T14:30:00.000Z'),
  ('alu','Measurement Profile','Nhôm cây/lá','Nhôm cây/lá','Nhôm cây/lá Nhôm cây/lá Kg','2026-07-28T14:30:00.000Z'),
  ('alu','Measurement Profile','Tấm/Kính','Tấm/Kính','Tấm/Kính Tấm/Kính Tấm','2026-07-28T14:30:00.000Z'),
  ('alu','Measurement Profile','Cuộn','Cuộn','Cuộn Cuộn Kg','2026-07-28T14:30:00.000Z'),
  ('alu','Measurement Profile','Lô/Serial','Lô/Serial','Lô/Serial Lô/Serial Cái','2026-07-28T14:30:00.000Z'),
  ('alu','Measurement Profile','Thành phẩm theo m2','Thành phẩm theo m2','Thành phẩm theo m2 Thành phẩm theo m2 Bộ','2026-07-28T14:30:00.000Z')
ON CONFLICT(tenant_id,doctype,name) DO UPDATE SET
  title=excluded.title,content=excluded.content,modified_at=excluded.modified_at;

UPDATE documents
SET payload_json=json_set(payload_json,'$.brand',CASE name
  WHEN 'TP-MT-TANKER400KG' THEN 'TANKER'
  WHEN 'TP-MT-TANKER600KG' THEN 'TANKER'
  WHEN 'TP-MT-TANKE800KG' THEN 'TANKER'
  WHEN 'TP-MT-TANKER1000KG' THEN 'TANKER'
  WHEN 'TP-MT-TANKER1500KG' THEN 'TANKER'
  WHEN 'TP-Tanker-Alumax-Lac33' THEN 'ALUMAX'
  WHEN 'TP-Tanker-Alumax-Lac36' THEN 'ALUMAX'
  WHEN 'TP-Tanker-Lac800&1000KG' THEN 'TANKER'
  WHEN 'TP-Tanker-Alumax-HDK' THEN 'ALUMAX'
  WHEN 'TP-Tanker-Alumax_TayDK' THEN 'TANKER'
  WHEN 'TP-MTT-BOSTEC-PAT' THEN 'BOSTEC'
  WHEN 'TP-MTT-BOSTEC-TAYDK' THEN 'BOSTEC'
  WHEN 'TP_BOSTEC_BODIEUKHIEN' THEN 'BOSTEC'
  WHEN 'TP-MTT-CHTAIWAN-PAT' THEN 'CH TAIWAN'
  WHEN 'TP-MTT-CHTAIWAN-TAYDK' THEN 'CH TAIWAN'
  WHEN 'TP_CHTAIWAN_BODIEUKHIEN' THEN 'CH TAIWAN'
  WHEN 'TP-MTT_BOSTEC-DOI(P)' THEN 'BOSTEC'
  WHEN 'TP-MTT_BOSTEC-DOI(T)' THEN 'BOSTEC'
  WHEN 'TP-MTT_BOSTEC-DON(P)' THEN 'BOSTEC'
  WHEN 'TP-MTT_BOSTEC-DON(T)' THEN 'BOSTEC'
  WHEN 'TP-MTT_CHTAIWAN-DOI(T)' THEN 'CH TAIWAN'
  WHEN 'TP-MTT_CHTAIWAN-DOI(P)' THEN 'CH TAIWAN'
  WHEN 'TP-MTT_CHTAIWAN-DON(P)' THEN 'CH TAIWAN'
  WHEN 'TP-MTT_CHTAIWAN-DON(T)' THEN 'CH TAIWAN'
  WHEN 'TP-MT-YHTAIWAN CH 300KG' THEN 'YH TAIWAN'
  WHEN 'TP-MT-YHTAIWAN CH 500KG' THEN 'YH TAIWAN'
  WHEN 'TP-MT-YHTAIWAN CH 400KG' THEN 'YH TAIWAN'
  WHEN 'TP-MT-YHTAIWAN CH 600KG' THEN 'YH TAIWAN'
  WHEN 'TP-MT-YHTAIWAN CH 700KG' THEN 'YH TAIWAN'
  WHEN 'TP-MT-YHTAIWAN CH 800KG' THEN 'YH TAIWAN'
  WHEN 'TP-MT-YHTAIWAN CH 1000KG' THEN 'YH TAIWAN'
  WHEN 'TP-YHTaiwan-BODK' THEN 'YH TAIWAN'
  WHEN 'TP-YHTaiwan-TayDK' THEN 'YH TAIWAN'
  WHEN 'TP-YHLD-BDK' THEN 'YHLD'
  WHEN 'TP-YHLD-HDK' THEN 'YHLD'
  WHEN 'TP-YHLD_TayDK' THEN 'YHLD'
  WHEN 'NVL_Tanker-nhong' THEN 'TANKER'
  WHEN 'TP-BDK-TANKER-ALUMAX' THEN 'ALUMAX'
  WHEN 'TP-MT-YHLD300KG' THEN 'YHLD'
  WHEN 'TP-MT-YHLD500KG' THEN 'YHLD'
END),
    modified_at='2026-07-28T14:30:00.000Z',
    modified_by='admin',
    version=version+1
WHERE tenant_id='alu' AND doctype='Item' AND name IN ('TP-MT-TANKER400KG', 'TP-MT-TANKER600KG', 'TP-MT-TANKE800KG', 'TP-MT-TANKER1000KG', 'TP-MT-TANKER1500KG', 'TP-Tanker-Alumax-Lac33', 'TP-Tanker-Alumax-Lac36', 'TP-Tanker-Lac800&1000KG', 'TP-Tanker-Alumax-HDK', 'TP-Tanker-Alumax_TayDK', 'TP-MTT-BOSTEC-PAT', 'TP-MTT-BOSTEC-TAYDK', 'TP_BOSTEC_BODIEUKHIEN', 'TP-MTT-CHTAIWAN-PAT', 'TP-MTT-CHTAIWAN-TAYDK', 'TP_CHTAIWAN_BODIEUKHIEN', 'TP-MTT_BOSTEC-DOI(P)', 'TP-MTT_BOSTEC-DOI(T)', 'TP-MTT_BOSTEC-DON(P)', 'TP-MTT_BOSTEC-DON(T)', 'TP-MTT_CHTAIWAN-DOI(T)', 'TP-MTT_CHTAIWAN-DOI(P)', 'TP-MTT_CHTAIWAN-DON(P)', 'TP-MTT_CHTAIWAN-DON(T)', 'TP-MT-YHTAIWAN CH 300KG', 'TP-MT-YHTAIWAN CH 500KG', 'TP-MT-YHTAIWAN CH 400KG', 'TP-MT-YHTAIWAN CH 600KG', 'TP-MT-YHTAIWAN CH 700KG', 'TP-MT-YHTAIWAN CH 800KG', 'TP-MT-YHTAIWAN CH 1000KG', 'TP-YHTaiwan-BODK', 'TP-YHTaiwan-TayDK', 'TP-YHLD-BDK', 'TP-YHLD-HDK', 'TP-YHLD_TayDK', 'NVL_Tanker-nhong', 'TP-BDK-TANKER-ALUMAX', 'TP-MT-YHLD300KG', 'TP-MT-YHLD500KG');

UPDATE documents
SET payload_json=json_set(payload_json,'$.brand',CASE name
  WHEN 'TP-MT-YHLD800KG' THEN 'YHLD'
  WHEN 'TP-MT-YHLD1000KG' THEN 'YHLD'
  WHEN 'TP-MT-JG300KG' THEN 'JG'
  WHEN 'TP-MT-JG400KG' THEN 'JG'
  WHEN 'TP-MT-JG500KG' THEN 'JG'
  WHEN 'TP-MT-JG600KG' THEN 'JG'
  WHEN 'TP-MT-JG800KG' THEN 'JG'
  WHEN 'TP-MT-JG1000KG' THEN 'JG'
  WHEN 'TP-MT-JG1500KG' THEN 'JG'
  WHEN 'TP-BDKDT_MULLER' THEN 'MULLER'
  WHEN 'TP-TDK_MULLER' THEN 'MULLER'
  WHEN 'TP-MT-ALUMAX400KG' THEN 'ALUMAX'
  WHEN 'TP-MT-ALUMAX600KG' THEN 'ALUMAX'
  WHEN 'TP_UPS-E800i' THEN 'ALUMAX'
  WHEN 'TP_UPS-E1000i' THEN 'ALUMAX'
END),
    modified_at='2026-07-28T14:30:00.000Z',
    modified_by='admin',
    version=version+1
WHERE tenant_id='alu' AND doctype='Item' AND name IN ('TP-MT-YHLD800KG', 'TP-MT-YHLD1000KG', 'TP-MT-JG300KG', 'TP-MT-JG400KG', 'TP-MT-JG500KG', 'TP-MT-JG600KG', 'TP-MT-JG800KG', 'TP-MT-JG1000KG', 'TP-MT-JG1500KG', 'TP-BDKDT_MULLER', 'TP-TDK_MULLER', 'TP-MT-ALUMAX400KG', 'TP-MT-ALUMAX600KG', 'TP_UPS-E800i', 'TP_UPS-E1000i');

UPDATE documents
SET payload_json=json_set(payload_json,'$.material_specification',CASE name
  WHEN 'TD-AL595' THEN 'QC-TD-AL595'
  WHEN 'TP-TD-AL71N' THEN 'QC-TP-TD-AL71N'
  WHEN 'TP-TD-AL503N26' THEN 'QC-TP-TD-AL503N26'
  WHEN 'AL503C' THEN 'QC-AL503C'
  WHEN 'TP-ALD-548N' THEN 'QC-TP-ALD-548N'
  WHEN 'AL501C' THEN 'QC-AL501C'
  WHEN 'TP-TD-AL501N' THEN 'QC-TP-TD-AL501N'
  WHEN 'TP-TD-AL652' THEN 'QC-TP-TD-AL652'
  WHEN 'TP-ALD-DL552' THEN 'QC-TP-ALD-DL552'
  WHEN 'TP-TD-AL752N' THEN 'QC-TP-TD-AL752N'
  WHEN 'TP-TD-AL50' THEN 'QC-TP-TD-AL50'
  WHEN 'TP-ALVIP50' THEN 'QC-TP-ALVIP50'
  WHEN 'TP-ALVIPST500' THEN 'QC-TP-ALVIPST500'
  WHEN 'TP-ALVIPST700' THEN 'QC-TP-ALVIPST700'
  WHEN 'TP-AL75' THEN 'QC-TP-AL75'
END),
    modified_at='2026-07-28T14:30:00.000Z',
    modified_by='admin',
    version=version+1
WHERE tenant_id='alu' AND doctype='Item' AND name IN ('TD-AL595', 'TP-TD-AL71N', 'TP-TD-AL503N26', 'AL503C', 'TP-ALD-548N', 'AL501C', 'TP-TD-AL501N', 'TP-TD-AL652', 'TP-ALD-DL552', 'TP-TD-AL752N', 'TP-TD-AL50', 'TP-ALVIP50', 'TP-ALVIPST500', 'TP-ALVIPST700', 'TP-AL75');
