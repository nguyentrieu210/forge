-- Alumdoor pilot catalogue import.
-- Idempotent: every business record has a natural primary key and can be re-run safely.
-- Source: pasted product catalogue supplied on 2026-07-28.

-- Materialise installed fixture masters in `documents` so the generic list/tree screens
-- can display them. The platform master reader already de-duplicates the two stores by name.
INSERT OR IGNORE INTO documents
  (tenant_id,doc_key,doctype,name,owner,docstatus,status,version,created_at,modified_at,modified_by,payload_json)
SELECT tenant_id,record_type||':'||name,record_type,name,'admin',0,'Draft',1,
       '2026-07-28T10:55:00.000Z','2026-07-28T10:55:00.000Z','admin',data_json
FROM master_records
WHERE tenant_id='alu' AND record_type IN ('Item Group','UOM');

INSERT INTO document_search(tenant_id,doctype,name,title,content,modified_at)
SELECT tenant_id,record_type,name,name,data_json,'2026-07-28T10:55:00.000Z'
FROM master_records
WHERE tenant_id='alu' AND record_type IN ('Item Group','UOM')
ON CONFLICT(tenant_id,doctype,name) DO UPDATE SET
  title=excluded.title,content=excluded.content,modified_at=excluded.modified_at;

-- UOM values present in the catalogue but absent from the installed fixture set.
WITH seed(name,payload) AS (
  VALUES
    ('Cặp',json_object('uom_name','Cặp','must_be_whole_number',json('true'),'_metadata_revision',1)),
    ('Con',json_object('uom_name','Con','must_be_whole_number',json('true'),'_metadata_revision',1))
)
INSERT OR IGNORE INTO documents
  (tenant_id,doc_key,doctype,name,owner,docstatus,status,version,created_at,modified_at,modified_by,payload_json)
SELECT 'alu','UOM:'||name,'UOM',name,'admin',0,'Draft',1,
       '2026-07-28T10:55:00.000Z','2026-07-28T10:55:00.000Z','admin',payload
FROM seed;

WITH seed(name,payload) AS (
  VALUES
    ('Cặp',json_object('uom_name','Cặp','must_be_whole_number',json('true'),'_metadata_revision',1)),
    ('Con',json_object('uom_name','Con','must_be_whole_number',json('true'),'_metadata_revision',1))
)
INSERT INTO document_search(tenant_id,doctype,name,title,content,modified_at)
SELECT 'alu','UOM',name,name,payload,'2026-07-28T10:55:00.000Z' FROM seed WHERE true
ON CONFLICT(tenant_id,doctype,name) DO UPDATE SET
  title=excluded.title,content=excluded.content,modified_at=excluded.modified_at;

-- Exact product groups from the source catalogue. "Nhóm logic" is deliberately excluded:
-- it belongs to the forthcoming sales-combo/programme layer, not the inventory tree.
WITH seed(name,parent_name) AS (
  VALUES
    ('Cửa CN Đức','Thành phẩm'),
    ('Cửa Đài Loan','Thành phẩm'),
    ('Cửa tấm liền Úc','Thành phẩm'),
    ('Cửa Lưới','Thành phẩm'),
    ('Cửa siêu trường','Thành phẩm'),
    ('Cửa Đài Loan Inox','Thành phẩm'),
    ('Cửa kéo Đài Loan','Thành phẩm'),
    ('Motor & Bình điện','Linh kiện & thiết bị'),
    ('Phụ kiện CN Đức','Linh kiện & thiết bị')
)
INSERT OR IGNORE INTO documents
  (tenant_id,doc_key,doctype,name,owner,docstatus,status,version,created_at,modified_at,modified_by,payload_json)
SELECT 'alu','Item Group:'||name,'Item Group',name,'admin',0,'Draft',1,
       '2026-07-28T10:55:00.000Z','2026-07-28T10:55:00.000Z','admin',
       json_object('item_group_name',name,'parent_item_group',parent_name,'is_group',json('false'),'disabled',json('false'),'_metadata_revision',1)
FROM seed;

WITH seed(name,parent_name) AS (
  VALUES
    ('Cửa CN Đức','Thành phẩm'),
    ('Cửa Đài Loan','Thành phẩm'),
    ('Cửa tấm liền Úc','Thành phẩm'),
    ('Cửa Lưới','Thành phẩm'),
    ('Cửa siêu trường','Thành phẩm'),
    ('Cửa Đài Loan Inox','Thành phẩm'),
    ('Cửa kéo Đài Loan','Thành phẩm'),
    ('Motor & Bình điện','Linh kiện & thiết bị'),
    ('Phụ kiện CN Đức','Linh kiện & thiết bị')
)
INSERT INTO document_search(tenant_id,doctype,name,title,content,modified_at)
SELECT 'alu','Item Group',name,name,name||' '||parent_name,'2026-07-28T10:55:00.000Z' FROM seed WHERE true
ON CONFLICT(tenant_id,doctype,name) DO UPDATE SET
  title=excluded.title,content=excluded.content,modified_at=excluded.modified_at;

-- Physical/default warehouse codes carried by the catalogue.
WITH seed(name,label) AS (
  VALUES ('K36','Kho K36'),('K12','Kho K12')
)
INSERT OR IGNORE INTO documents
  (tenant_id,doc_key,doctype,name,owner,docstatus,status,version,created_at,modified_at,modified_by,payload_json)
SELECT 'alu','Warehouse:'||name,'Warehouse',name,'admin',0,'Draft',1,
       '2026-07-28T10:55:00.000Z','2026-07-28T10:55:00.000Z','admin',
       json_object('warehouse_name',name,'address',label,'disabled',json('false'),'_metadata_revision',24)
FROM seed;

WITH seed(name,label) AS (VALUES ('K36','Kho K36'),('K12','Kho K12'))
INSERT INTO document_search(tenant_id,doctype,name,title,content,modified_at)
SELECT 'alu','Warehouse',name,name,name||' '||label,'2026-07-28T10:55:00.000Z' FROM seed WHERE true
ON CONFLICT(tenant_id,doctype,name) DO UPDATE SET
  title=excluded.title,content=excluded.content,modified_at=excluded.modified_at;

-- Price lists. A zero in the source "Giá có ray" column means not applicable and is never
-- imported as a free selling price.
WITH seed(name,note) AS (
  VALUES
    ('Giá niêm yết','Giá niêm yết từ danh mục Alumdoor'),
    ('Giá có ray','Giá trọn bộ có ray; chỉ có dòng khi nguồn khai giá lớn hơn 0')
)
INSERT OR IGNORE INTO documents
  (tenant_id,doc_key,doctype,name,owner,docstatus,status,version,created_at,modified_at,modified_by,payload_json)
SELECT 'alu','Price List:'||name,'Price List',name,'admin',0,'Draft',1,
       '2026-07-28T10:55:00.000Z','2026-07-28T10:55:00.000Z','admin',
       json_object('price_list_name',name,'currency','VND','note',note,'disabled',json('false'),'_metadata_revision',16)
FROM seed;

WITH seed(name,note) AS (
  VALUES
    ('Giá niêm yết','Giá niêm yết từ danh mục Alumdoor'),
    ('Giá có ray','Giá trọn bộ có ray; chỉ có dòng khi nguồn khai giá lớn hơn 0')
)
INSERT INTO document_search(tenant_id,doctype,name,title,content,modified_at)
SELECT 'alu','Price List',name,name,name||' '||note,'2026-07-28T10:55:00.000Z' FROM seed WHERE true
ON CONFLICT(tenant_id,doctype,name) DO UPDATE SET
  title=excluded.title,content=excluded.content,modified_at=excluded.modified_at;

-- Ten representative, non-combo, non-negative-price catalogue items.
WITH seed(code,item_name,item_group,stock_uom,material_stage,supply_type,is_purchase,inventory_mode,measurement_profile,default_warehouse,description) AS (
  VALUES
    ('TD-AL595','ĐỨC AL595','Cửa CN Đức','m2','Thành phẩm','Tự sản xuất',0,'Thành phẩm theo m2','Thành phẩm theo m2','K36','Dày 0.8-0.9mm | Bản lá 60'),
    ('TP-RAYHOP','RAY HỘP TD U76','Phụ kiện CN Đức','Mét','Hàng hoá','Mua ngoài',1,'Hàng thường',NULL,NULL,'Dày 1.2mm'),
    ('TP-TD87A1 GS','RAY ĐƠN TD U76','Phụ kiện CN Đức','Mét','Hàng hoá','Mua ngoài',1,'Hàng thường',NULL,NULL,'Dày 1mm'),
    ('TP-Tanker-Alumax-Lac33','LẮC TANKER_ALUMAX 33','Motor & Bình điện','Cái','Hàng hoá','Mua ngoài',1,'Hàng thường',NULL,NULL,''),
    ('TP-Tanker-Alumax-HDK','HỘP ĐK TANKER_ALUMAX','Motor & Bình điện','Cái','Hàng hoá','Mua ngoài',1,'Hàng thường',NULL,NULL,''),
    ('TP-Tanker-Alumax_TayDK','TAY ĐIỀU KHIỂN TANKER','Motor & Bình điện','Cái','Hàng hoá','Mua ngoài',1,'Hàng thường',NULL,NULL,''),
    ('TP_PAT_CODAY','PHÍM ÂM TƯỜNG CÓ DÂY','Motor & Bình điện','Bộ','Hàng hoá','Mua ngoài',1,'Hàng thường',NULL,NULL,''),
    ('TP-DAYDIEN','DÂY ĐIỆN PHÍM ÂM TƯỜNG','Motor & Bình điện','Mét','Hàng hoá','Mua ngoài',1,'Hàng thường',NULL,NULL,''),
    ('NVL-XOP-N45','XỐP NHỎ','Phụ kiện','Cái','Nguyên vật liệu','Mua ngoài',1,'Hàng thường',NULL,NULL,''),
    ('TP-GOIGANG','GỐI GANG','Phụ kiện','Cặp','Hàng hoá','Mua ngoài',1,'Hàng thường',NULL,NULL,'')
)
INSERT OR IGNORE INTO documents
  (tenant_id,doc_key,doctype,name,owner,docstatus,status,version,created_at,modified_at,modified_by,payload_json)
SELECT 'alu','Item:'||code,'Item',code,'admin',0,'Draft',1,
       '2026-07-28T10:55:00.000Z','2026-07-28T10:55:00.000Z','admin',
       json_object(
         'item_code',code,'item_name',item_name,'item_group',item_group,
         'item_nature','Hàng tồn kho','material_stage',material_stage,'supply_type',supply_type,
         'is_stock_item',json('true'),'is_purchase_item',json(CASE WHEN is_purchase=1 THEN 'true' ELSE 'false' END),
         'is_sales_item',json('true'),'include_item_in_manufacturing',json('false'),
         'inventory_mode',inventory_mode,'measurement_profile',measurement_profile,
         'stock_uom',stock_uom,'default_purchase_uom',CASE WHEN is_purchase=1 THEN stock_uom ELSE NULL END,
         'default_sales_uom',stock_uom,'default_warehouse',default_warehouse,
         'valuation_method','FIFO','has_batch_no',json('false'),'has_serial_no',json('false'),
         'allow_negative_stock',json('false'),'description',description,'disabled',json('false'),
         '_metadata_revision',24
       )
FROM seed;

WITH seed(code,item_name,item_group) AS (
  VALUES
    ('TD-AL595','ĐỨC AL595','Cửa CN Đức'),
    ('TP-RAYHOP','RAY HỘP TD U76','Phụ kiện CN Đức'),
    ('TP-TD87A1 GS','RAY ĐƠN TD U76','Phụ kiện CN Đức'),
    ('TP-Tanker-Alumax-Lac33','LẮC TANKER_ALUMAX 33','Motor & Bình điện'),
    ('TP-Tanker-Alumax-HDK','HỘP ĐK TANKER_ALUMAX','Motor & Bình điện'),
    ('TP-Tanker-Alumax_TayDK','TAY ĐIỀU KHIỂN TANKER','Motor & Bình điện'),
    ('TP_PAT_CODAY','PHÍM ÂM TƯỜNG CÓ DÂY','Motor & Bình điện'),
    ('TP-DAYDIEN','DÂY ĐIỆN PHÍM ÂM TƯỜNG','Motor & Bình điện'),
    ('NVL-XOP-N45','XỐP NHỎ','Phụ kiện'),
    ('TP-GOIGANG','GỐI GANG','Phụ kiện')
)
INSERT INTO document_search(tenant_id,doctype,name,title,content,modified_at)
SELECT 'alu','Item',code,item_name,code||' '||item_name||' '||item_group,'2026-07-28T10:55:00.000Z' FROM seed WHERE true
ON CONFLICT(tenant_id,doctype,name) DO UPDATE SET
  title=excluded.title,content=excluded.content,modified_at=excluded.modified_at;

-- Catalogue list prices for the ten pilot items.
WITH seed(code,rate) AS (
  VALUES
    ('TD-AL595',1049000),
    ('TP-RAYHOP',190000),
    ('TP-TD87A1 GS',145000),
    ('TP-Tanker-Alumax-Lac33',450000),
    ('TP-Tanker-Alumax-HDK',150000),
    ('TP-Tanker-Alumax_TayDK',120000),
    ('TP_PAT_CODAY',150000),
    ('TP-DAYDIEN',15000),
    ('NVL-XOP-N45',18000),
    ('TP-GOIGANG',90000)
)
INSERT OR IGNORE INTO documents
  (tenant_id,doc_key,doctype,name,owner,docstatus,status,version,created_at,modified_at,modified_by,payload_json)
SELECT 'alu','Item Price:Giá niêm yết:'||code,'Item Price','Giá niêm yết:'||code,
       'admin',0,'Draft',1,'2026-07-28T10:55:00.000Z','2026-07-28T10:55:00.000Z','admin',
       json_object('price_list','Giá niêm yết','item_code',code,'rate',rate,'currency','VND',
                   'note','Lô thử từ danh mục 2026-07-28','disabled',json('false'),'_metadata_revision',16)
FROM seed;

WITH seed(code,rate) AS (
  VALUES
    ('TD-AL595',1049000),
    ('TP-RAYHOP',190000),
    ('TP-TD87A1 GS',145000),
    ('TP-Tanker-Alumax-Lac33',450000),
    ('TP-Tanker-Alumax-HDK',150000),
    ('TP-Tanker-Alumax_TayDK',120000),
    ('TP_PAT_CODAY',150000),
    ('TP-DAYDIEN',15000),
    ('NVL-XOP-N45',18000),
    ('TP-GOIGANG',90000)
)
INSERT INTO document_search(tenant_id,doctype,name,title,content,modified_at)
SELECT 'alu','Item Price','Giá niêm yết:'||code,code,
       'Giá niêm yết '||code||' '||rate,'2026-07-28T10:55:00.000Z' FROM seed WHERE true
ON CONFLICT(tenant_id,doctype,name) DO UPDATE SET
  title=excluded.title,content=excluded.content,modified_at=excluded.modified_at;

-- Only one pilot row has a real source price including rails.
INSERT OR IGNORE INTO documents
  (tenant_id,doc_key,doctype,name,owner,docstatus,status,version,created_at,modified_at,modified_by,payload_json)
VALUES (
  'alu','Item Price:Giá có ray:TD-AL595','Item Price','Giá có ray:TD-AL595',
  'admin',0,'Draft',1,'2026-07-28T10:55:00.000Z','2026-07-28T10:55:00.000Z','admin',
  json_object('price_list','Giá có ray','item_code','TD-AL595','rate',1124000,'currency','VND',
              'note','Lô thử từ danh mục 2026-07-28','disabled',json('false'),'_metadata_revision',16)
);

INSERT INTO document_search(tenant_id,doctype,name,title,content,modified_at)
VALUES (
  'alu','Item Price','Giá có ray:TD-AL595','TD-AL595',
  'Giá có ray TD-AL595 1124000','2026-07-28T10:55:00.000Z'
)
ON CONFLICT(tenant_id,doctype,name) DO UPDATE SET
  title=excluded.title,content=excluded.content,modified_at=excluded.modified_at;
