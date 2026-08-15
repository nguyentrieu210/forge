-- Item Group BỔ SUNG — nhóm mà Item trỏ tới nhưng chưa file nào tạo.
-- Lỗ hổng có sẵn: 90 Item của bản 11/08 đã trỏ tới 3 nhóm này rồi.

DELETE FROM document_search WHERE tenant_id='demo' AND doctype='Item Group' AND name='Phụ kiện chung';
DELETE FROM documents WHERE tenant_id='demo' AND doctype='Item Group' AND name='Phụ kiện chung';
DELETE FROM document_search WHERE tenant_id='demo' AND doctype='Item Group' AND name='Linh kiện motor';
DELETE FROM documents WHERE tenant_id='demo' AND doctype='Item Group' AND name='Linh kiện motor';
DELETE FROM document_search WHERE tenant_id='demo' AND doctype='Item Group' AND name='Điều khiển & phụ kiện điện';
DELETE FROM documents WHERE tenant_id='demo' AND doctype='Item Group' AND name='Điều khiển & phụ kiện điện';

INSERT INTO documents
  (tenant_id,doc_key,doctype,name,owner,docstatus,status,version,created_at,modified_at,modified_by,payload_json)
VALUES
  ('demo','Item Group:Phụ kiện chung','Item Group','Phụ kiện chung','admin',0,'Draft',1,'2026-08-15T09:00:00.000Z','2026-08-15T09:00:00.000Z','admin','{"item_group_name":"Phụ kiện chung","parent_item_group":"Linh kiện & thiết bị","is_group":false,"disabled":false,"_migration_source":"alumdoor-bom-2026-08-15"}'),
  ('demo','Item Group:Linh kiện motor','Item Group','Linh kiện motor','admin',0,'Draft',1,'2026-08-15T09:00:00.000Z','2026-08-15T09:00:00.000Z','admin','{"item_group_name":"Linh kiện motor","parent_item_group":"Linh kiện & thiết bị","is_group":false,"disabled":false,"_migration_source":"alumdoor-bom-2026-08-15"}'),
  ('demo','Item Group:Điều khiển & phụ kiện điện','Item Group','Điều khiển & phụ kiện điện','admin',0,'Draft',1,'2026-08-15T09:00:00.000Z','2026-08-15T09:00:00.000Z','admin','{"item_group_name":"Điều khiển & phụ kiện điện","parent_item_group":"Linh kiện & thiết bị","is_group":false,"disabled":false,"_migration_source":"alumdoor-bom-2026-08-15"}');
