-- Canonical Alumdoor Item Group tree for LOCAL development only.
-- Authority: server/scripts/lib/alumdoor-item-group-catalog.mjs
-- D1-safe + idempotent: rerunning updates the same records and never duplicates a group.

CREATE TABLE IF NOT EXISTS _alumdoor_item_groups (
  name TEXT PRIMARY KEY,
  parent_name TEXT,
  is_group INTEGER NOT NULL CHECK (is_group IN (0,1))
);
DELETE FROM _alumdoor_item_groups;
INSERT INTO _alumdoor_item_groups(name,parent_name,is_group) VALUES
  ('Tất cả mặt hàng',NULL,1),
  ('Cửa thành phẩm','Tất cả mặt hàng',1),
  ('Motor & điện','Tất cả mặt hàng',1),
  ('Phụ kiện & vật tư','Tất cả mặt hàng',1),
  ('Cửa CN Đức','Cửa thành phẩm',0),
  ('Cửa tấm liền Úc','Cửa thành phẩm',0),
  ('Cửa Đài Loan','Cửa thành phẩm',0),
  ('Cửa Đài Loan Inox','Cửa thành phẩm',0),
  ('Cửa Siêu Trường','Cửa thành phẩm',0),
  ('Cửa Lưới','Cửa thành phẩm',0),
  ('Cửa kéo Đài Loan','Cửa thành phẩm',0),
  ('Motor','Motor & điện',0),
  ('Bình lưu điện','Motor & điện',0),
  ('Điều khiển & phụ kiện điện','Motor & điện',0),
  ('Linh kiện motor','Motor & điện',0),
  ('Nan/lá cửa','Phụ kiện & vật tư',0),
  ('Ray và trục','Phụ kiện & vật tư',0),
  ('Phụ kiện chung','Phụ kiện & vật tư',0),
  ('Phụ kiện CN Đức','Phụ kiện & vật tư',0),
  ('Phụ kiện cần sơn tĩnh điện','Phụ kiện & vật tư',0);

-- Normalize legacy leaf aliases before disabling the duplicate masters.
UPDATE master_records
SET data_json=json_set(data_json,'$.item_group',CASE json_extract(data_json,'$.item_group')
      WHEN 'Cửa siêu trường' THEN 'Cửa Siêu Trường'
      WHEN 'Phụ kiện' THEN 'Phụ kiện chung'
      WHEN 'Mô tơ' THEN 'Motor'
      WHEN 'Bộ lưu điện' THEN 'Bình lưu điện'
      WHEN 'Remote và điều khiển' THEN 'Điều khiển & phụ kiện điện'
      ELSE json_extract(data_json,'$.item_group') END),
    modified_at=CURRENT_TIMESTAMP
WHERE tenant_id='demo' AND record_type='Item'
  AND json_extract(data_json,'$.item_group') IN (
    'Cửa siêu trường','Phụ kiện','Mô tơ','Bộ lưu điện','Remote và điều khiển'
  );

UPDATE documents
SET payload_json=json_set(payload_json,'$.item_group',CASE json_extract(payload_json,'$.item_group')
      WHEN 'Cửa siêu trường' THEN 'Cửa Siêu Trường'
      WHEN 'Phụ kiện' THEN 'Phụ kiện chung'
      WHEN 'Mô tơ' THEN 'Motor'
      WHEN 'Bộ lưu điện' THEN 'Bình lưu điện'
      WHEN 'Remote và điều khiển' THEN 'Điều khiển & phụ kiện điện'
      ELSE json_extract(payload_json,'$.item_group') END),
    modified_at=CURRENT_TIMESTAMP,
    modified_by='admin',
    version=version+1
WHERE tenant_id='demo' AND doctype='Item'
  AND json_extract(payload_json,'$.item_group') IN (
    'Cửa siêu trường','Phụ kiện','Mô tơ','Bộ lưu điện','Remote và điều khiển'
  );

INSERT INTO master_records (tenant_id, record_type, name, disabled, data_json, modified_at)
SELECT
  'demo','Item Group',g.name,0,
  CASE WHEN g.parent_name IS NULL THEN
    json_object(
      'item_group_name',g.name,
      'is_group',json(CASE WHEN g.is_group=1 THEN 'true' ELSE 'false' END),
      'disabled',json('false')
    )
  ELSE
    json_object(
      'item_group_name',g.name,
      'parent_item_group',g.parent_name,
      'is_group',json(CASE WHEN g.is_group=1 THEN 'true' ELSE 'false' END),
      'disabled',json('false')
    )
  END,
  CURRENT_TIMESTAMP
FROM _alumdoor_item_groups g
WHERE 1=1
ON CONFLICT(tenant_id, record_type, name) DO UPDATE SET
  disabled=excluded.disabled,
  data_json=excluded.data_json,
  modified_at=excluded.modified_at;

INSERT INTO documents
  (tenant_id, doc_key, doctype, name, owner, docstatus, status, version, created_at, modified_at, modified_by, payload_json)
SELECT
  'demo','Item Group:'||g.name,'Item Group',g.name,'admin',0,'Draft',1,
  CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,'admin',
  CASE WHEN g.parent_name IS NULL THEN
    json_object(
      'item_group_name',g.name,
      'is_group',json(CASE WHEN g.is_group=1 THEN 'true' ELSE 'false' END),
      'disabled',json('false'),
      '_metadata_revision',2
    )
  ELSE
    json_object(
      'item_group_name',g.name,
      'parent_item_group',g.parent_name,
      'is_group',json(CASE WHEN g.is_group=1 THEN 'true' ELSE 'false' END),
      'disabled',json('false'),
      '_metadata_revision',2
    )
  END
FROM _alumdoor_item_groups g
WHERE 1=1
ON CONFLICT(tenant_id, doc_key) DO UPDATE SET
  payload_json=excluded.payload_json,
  modified_at=excluded.modified_at,
  modified_by=excluded.modified_by,
  version=documents.version+1;

INSERT INTO document_search (tenant_id, doctype, name, title, content, modified_at)
SELECT 'demo','Item Group',g.name,g.name,
       g.name || ' ' || COALESCE(g.parent_name,''),CURRENT_TIMESTAMP
FROM _alumdoor_item_groups g
WHERE 1=1
ON CONFLICT(tenant_id, doctype, name) DO UPDATE SET
  title=excluded.title,
  content=excluded.content,
  modified_at=excluded.modified_at;

-- Legacy taxonomy remains recoverable but must not appear in active selectors.
-- Nan/lá cửa and Ray và trục are NOT legacy: current aluminium Item builders still use them.
UPDATE master_records
SET disabled=1,
    data_json=json_set(data_json,'$.disabled',json('true')),
    modified_at=CURRENT_TIMESTAMP
WHERE tenant_id='demo' AND record_type='Item Group'
  AND name IN (
    'Bộ lưu điện','Cửa cuốn','Cửa nhôm kính','Dịch vụ','Linh kiện & thiết bị',
    'Mô tơ','Motor & Bình điện','Nguyên vật liệu','Phụ kiện','Remote và điều khiển','Thành phẩm',
    'Cửa siêu trường'
  );

UPDATE documents
SET payload_json=json_set(payload_json,'$.disabled',json('true')),
    modified_at=CURRENT_TIMESTAMP,
    modified_by='admin',
    version=version+1
WHERE tenant_id='demo' AND doctype='Item Group'
  AND name IN (
    'Bộ lưu điện','Cửa cuốn','Cửa nhôm kính','Dịch vụ','Linh kiện & thiết bị',
    'Mô tơ','Motor & Bình điện','Nguyên vật liệu','Phụ kiện','Remote và điều khiển','Thành phẩm',
    'Cửa siêu trường'
  );

-- ── master_records: dọn nhóm hàng NGOÀI cây chuẩn ──
--
-- Ở trên đã vô hiệu hoá các nhóm cũ trong `documents`, nhưng `master_records` thì chưa ai
-- đụng tới — và đó mới là chỗ người dùng gặp. Ô chọn Link đọc HỢP documents ∪ master_records
-- (document-kernel/d1-store.ts → listMasterRecords), nên 13 nhóm fixture ERP tổng quát
-- (Cửa cuốn, Cửa nhôm kính, Thành phẩm, Nguyên vật liệu, Dịch vụ...) vẫn chọn được khi tạo
-- mặt hàng, dù màn hình Danh mục không hiển thị chúng và không chính sách giá hay công thức
-- nào bám vào. Gán một mặt hàng vào "Cửa cuốn" là gán vào hư không, lặng lẽ.
--
-- Dùng chính bảng tạm ở trên làm danh sách chuẩn: một nguồn, không chép tay lần thứ hai.
DELETE FROM master_records
WHERE tenant_id='demo' AND record_type='Item Group'
  AND name NOT IN (SELECT name FROM _alumdoor_item_groups);

DROP TABLE _alumdoor_item_groups;
