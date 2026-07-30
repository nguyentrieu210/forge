-- Chuẩn hóa mặt hàng Alumdoor theo xác nhận ngày 2026-07-30.

-- Phạm vi: mặt hàng mua/tồn theo Kg, mặt hàng con nguyên tử và vô hiệu hóa mã ghép.

-- KHÔNG chứa công thức đặt hàng, tự tính kg, FIFO phân bổ hàng về hoặc công nợ.

-- Trước khi chạy phải xác nhận stock_ledger_entries = 0 cho toàn bộ mã đổi đơn vị.

INSERT INTO documents
  (tenant_id,doc_key,doctype,name,owner,docstatus,status,version,created_at,modified_at,modified_by,payload_json)
VALUES
  ('alu','Measurement Profile:Nhôm cây/lá','Measurement Profile','Nhôm cây/lá','admin',0,'Draft',1,'2026-07-30T16:30:00.000Z','2026-07-30T16:30:00.000Z','admin','{"profile_name":"Nhôm cây/lá","inventory_mode":"Nhôm cây/lá","stock_uom":"Kg","track_dimension_lot":true,"require_color":true,"require_condition":true,"require_length":true,"require_piece_qty":true,"disabled":false,"_migration_source":"alumdoor-item-standardization-2026-07-30"}')
ON CONFLICT(tenant_id,doc_key) DO UPDATE SET
  payload_json=json_patch(documents.payload_json,excluded.payload_json),
  modified_at=excluded.modified_at,
  modified_by=excluded.modified_by,
  version=documents.version+1
WHERE documents.payload_json<>json_patch(documents.payload_json,excluded.payload_json);

INSERT INTO document_search(tenant_id,doctype,name,title,content,modified_at)
VALUES('alu','Measurement Profile','Nhôm cây/lá','Nhôm cây/lá','Nhôm cây lá Kg chiều dài số cây màu tình trạng','2026-07-30T16:30:00.000Z')
ON CONFLICT(tenant_id,doctype,name) DO UPDATE SET
  title=excluded.title,
  content=excluded.content,
  modified_at=excluded.modified_at
WHERE document_search.title<>excluded.title
   OR document_search.content<>excluded.content;

INSERT INTO documents
  (tenant_id,doc_key,doctype,name,owner,docstatus,status,version,created_at,modified_at,modified_by,payload_json)
VALUES
  ('alu','Measurement Profile:Hàng thường','Measurement Profile','Hàng thường','admin',0,'Draft',1,'2026-07-30T16:30:00.000Z','2026-07-30T16:30:00.000Z','admin','{"profile_name":"Hàng thường","inventory_mode":"Hàng thường","stock_uom":"Cái","track_dimension_lot":false,"require_color":false,"require_condition":false,"require_length":false,"require_width":false,"require_piece_qty":false,"require_bundle_qty":false,"disabled":false,"_migration_source":"alumdoor-item-standardization-2026-07-30"}')
ON CONFLICT(tenant_id,doc_key) DO UPDATE SET
  payload_json=json_patch(documents.payload_json,excluded.payload_json),
  modified_at=excluded.modified_at,
  modified_by=excluded.modified_by,
  version=documents.version+1
WHERE documents.payload_json<>json_patch(documents.payload_json,excluded.payload_json);

INSERT INTO document_search(tenant_id,doctype,name,title,content,modified_at)
VALUES('alu','Measurement Profile','Hàng thường','Hàng thường','Hàng thường số lượng theo đơn vị tính của mặt hàng','2026-07-30T16:30:00.000Z')
ON CONFLICT(tenant_id,doctype,name) DO UPDATE SET
  title=excluded.title,
  content=excluded.content,
  modified_at=excluded.modified_at
WHERE document_search.title<>excluded.title
   OR document_search.content<>excluded.content;

INSERT INTO documents
  (tenant_id,doc_key,doctype,name,owner,docstatus,status,version,created_at,modified_at,modified_by,payload_json)
VALUES
  ('alu','Measurement Profile:Thành phẩm theo m2','Measurement Profile','Thành phẩm theo m2','admin',0,'Draft',1,'2026-07-30T16:30:00.000Z','2026-07-30T16:30:00.000Z','admin','{"profile_name":"Thành phẩm theo m2","inventory_mode":"Thành phẩm theo m2","stock_uom":"m2","track_dimension_lot":false,"require_color":true,"require_condition":false,"require_length":true,"require_width":true,"require_piece_qty":true,"require_bundle_qty":false,"disabled":false,"_migration_source":"alumdoor-item-standardization-2026-07-30"}')
ON CONFLICT(tenant_id,doc_key) DO UPDATE SET
  payload_json=json_patch(documents.payload_json,excluded.payload_json),
  modified_at=excluded.modified_at,
  modified_by=excluded.modified_by,
  version=documents.version+1
WHERE documents.payload_json<>json_patch(documents.payload_json,excluded.payload_json);

INSERT INTO document_search(tenant_id,doctype,name,title,content,modified_at)
VALUES('alu','Measurement Profile','Thành phẩm theo m2','Thành phẩm theo m2','Thành phẩm cửa theo chiều rộng chiều cao số bộ màu','2026-07-30T16:30:00.000Z')
ON CONFLICT(tenant_id,doctype,name) DO UPDATE SET
  title=excluded.title,
  content=excluded.content,
  modified_at=excluded.modified_at
WHERE document_search.title<>excluded.title
   OR document_search.content<>excluded.content;

INSERT INTO documents
  (tenant_id,doc_key,doctype,name,owner,docstatus,status,version,created_at,modified_at,modified_by,payload_json)
VALUES
  ('alu','Supplier:TIẾN ĐẠT','Supplier','TIẾN ĐẠT','admin',0,'Draft',1,'2026-07-30T16:30:00.000Z','2026-07-30T16:30:00.000Z','admin','{"supplier_name":"TIẾN ĐẠT","receipt_tolerance_pct":5,"disabled":false,"_migration_source":"alumdoor-item-standardization-2026-07-30"}')
ON CONFLICT(tenant_id,doc_key) DO UPDATE SET
  payload_json=json_patch(documents.payload_json,excluded.payload_json),
  modified_at=excluded.modified_at,
  modified_by=excluded.modified_by,
  version=documents.version+1
WHERE documents.payload_json<>json_patch(documents.payload_json,excluded.payload_json);

UPDATE documents
SET payload_json=json_set(
      payload_json,
      '$.measurement_profile',
      json_extract(payload_json,'$.inventory_mode')
    ),
    modified_at='2026-07-30T16:30:00.000Z',
    modified_by='admin',
    version=version+1
WHERE tenant_id='alu'
  AND doctype='Item'
  AND json_extract(payload_json,'$.inventory_mode') IN ('Hàng thường','Thành phẩm theo m2')
  AND COALESCE(json_extract(payload_json,'$.measurement_profile'),'')<>json_extract(payload_json,'$.inventory_mode');

INSERT INTO documents
  (tenant_id,doc_key,doctype,name,owner,docstatus,status,version,created_at,modified_at,modified_by,payload_json)
VALUES
  ('alu','Material Specification:ĐM-TD325','Material Specification','ĐM-TD325','admin',0,'Draft',1,'2026-07-30T16:30:00.000Z','2026-07-30T16:30:00.000Z','admin','{"spec_code":"ĐM-TD325","spec_name":"Định mức LÁ ĐÁY LỚN","profile_system":"TIẾN ĐẠT","section_code":"TD325","theoretical_kg_per_m":0.619,"note":"Định mức xác nhận: 0.619 kg/m. Chỉ lưu để đối chiếu và quy đổi đơn vị; không tự sinh số kg đặt mua.","disabled":false,"_migration_source":"alumdoor-item-standardization-2026-07-30"}')
ON CONFLICT(tenant_id,doc_key) DO UPDATE SET
  payload_json=json_patch(documents.payload_json,excluded.payload_json),
  modified_at=excluded.modified_at,
  modified_by=excluded.modified_by,
  version=documents.version+1
WHERE documents.payload_json<>json_patch(documents.payload_json,excluded.payload_json);

INSERT INTO document_search(tenant_id,doctype,name,title,content,modified_at)
VALUES('alu','Material Specification','ĐM-TD325','Định mức LÁ ĐÁY LỚN','ĐM-TD325 TP-TD325 TD325 0.619 kg/m','2026-07-30T16:30:00.000Z')
ON CONFLICT(tenant_id,doctype,name) DO UPDATE SET
  title=excluded.title,
  content=excluded.content,
  modified_at=excluded.modified_at
WHERE document_search.title<>excluded.title
   OR document_search.content<>excluded.content;

INSERT INTO documents
  (tenant_id,doc_key,doctype,name,owner,docstatus,status,version,created_at,modified_at,modified_by,payload_json)
VALUES
  ('alu','Item:TP-TD325','Item','TP-TD325','admin',0,'Draft',1,'2026-07-30T16:30:00.000Z','2026-07-30T16:30:00.000Z','admin','{"item_code":"TP-TD325","item_name":"LÁ ĐÁY LỚN","item_group":"Nan/lá cửa","item_nature":"Hàng tồn kho","material_stage":"Nguyên vật liệu","supply_type":"Mua ngoài","is_stock_item":true,"is_purchase_item":true,"is_sales_item":true,"include_item_in_manufacturing":true,"inventory_mode":"Nhôm cây/lá","measurement_profile":"Nhôm cây/lá","stock_uom":"Kg","default_purchase_uom":"Kg","default_sales_uom":"Mét","uom_conversions":[{"row_id":"UOM-MÉT","uom":"Mét","conversion_factor":0.619}],"material_specification":"ĐM-TD325","valuation_method":"FIFO","has_batch_no":false,"has_serial_no":false,"allow_negative_stock":false,"description":"Vật tư nguyên tử; mua và tồn theo Kg. Mã NCC TD325; nguồn data/trong-luong-nhom.json. Định mức kg/m chỉ là dữ liệu đối chiếu, không tự tính số lượng mua hoặc tồn.","disabled":false,"_migration_source":"alumdoor-item-standardization-2026-07-30"}')
ON CONFLICT(tenant_id,doc_key) DO UPDATE SET
  payload_json=json_patch(documents.payload_json,excluded.payload_json),
  modified_at=excluded.modified_at,
  modified_by=excluded.modified_by,
  version=documents.version+1
WHERE documents.payload_json<>json_patch(documents.payload_json,excluded.payload_json);

INSERT INTO document_search(tenant_id,doctype,name,title,content,modified_at)
VALUES('alu','Item','TP-TD325','LÁ ĐÁY LỚN','TP-TD325 LÁ ĐÁY LỚN Nan/lá cửa Kg TD325','2026-07-30T16:30:00.000Z')
ON CONFLICT(tenant_id,doctype,name) DO UPDATE SET
  title=excluded.title,
  content=excluded.content,
  modified_at=excluded.modified_at
WHERE document_search.title<>excluded.title
   OR document_search.content<>excluded.content;

INSERT INTO documents
  (tenant_id,doc_key,doctype,name,owner,docstatus,status,version,created_at,modified_at,modified_by,payload_json)
VALUES
  ('alu','Supplier Item:TIẾN ĐẠT:TP-TD325','Supplier Item','TIẾN ĐẠT:TP-TD325','admin',0,'Draft',1,'2026-07-30T16:30:00.000Z','2026-07-30T16:30:00.000Z','admin','{"supplier":"TIẾN ĐẠT","item_code":"TP-TD325","supplier_item_code":"TD325","preferred":true,"note":"Mã Tiến Đạt đối chiếu từ dữ liệu nhập thực tế; không kèm công thức đặt hàng.","disabled":false,"_migration_source":"alumdoor-item-standardization-2026-07-30"}')
ON CONFLICT(tenant_id,doc_key) DO UPDATE SET
  payload_json=json_patch(documents.payload_json,excluded.payload_json),
  modified_at=excluded.modified_at,
  modified_by=excluded.modified_by,
  version=documents.version+1
WHERE documents.payload_json<>json_patch(documents.payload_json,excluded.payload_json);

INSERT INTO document_search(tenant_id,doctype,name,title,content,modified_at)
VALUES('alu','Supplier Item','TIẾN ĐẠT:TP-TD325','TD325','TIẾN ĐẠT TD325 TP-TD325 LÁ ĐÁY LỚN','2026-07-30T16:30:00.000Z')
ON CONFLICT(tenant_id,doctype,name) DO UPDATE SET
  title=excluded.title,
  content=excluded.content,
  modified_at=excluded.modified_at
WHERE document_search.title<>excluded.title
   OR document_search.content<>excluded.content;

INSERT INTO documents
  (tenant_id,doc_key,doctype,name,owner,docstatus,status,version,created_at,modified_at,modified_by,payload_json)
VALUES
  ('alu','Material Specification:ĐM-TD326','Material Specification','ĐM-TD326','admin',0,'Draft',1,'2026-07-30T16:30:00.000Z','2026-07-30T16:30:00.000Z','admin','{"spec_code":"ĐM-TD326","spec_name":"Định mức LÁ TRUNG GIAN","profile_system":"TIẾN ĐẠT","section_code":"TD326","theoretical_kg_per_m":0.395,"note":"Định mức xác nhận: 0.395 kg/m. Chỉ lưu để đối chiếu và quy đổi đơn vị; không tự sinh số kg đặt mua.","disabled":false,"_migration_source":"alumdoor-item-standardization-2026-07-30"}')
ON CONFLICT(tenant_id,doc_key) DO UPDATE SET
  payload_json=json_patch(documents.payload_json,excluded.payload_json),
  modified_at=excluded.modified_at,
  modified_by=excluded.modified_by,
  version=documents.version+1
WHERE documents.payload_json<>json_patch(documents.payload_json,excluded.payload_json);

INSERT INTO document_search(tenant_id,doctype,name,title,content,modified_at)
VALUES('alu','Material Specification','ĐM-TD326','Định mức LÁ TRUNG GIAN','ĐM-TD326 TP-TD326 TD326 0.395 kg/m','2026-07-30T16:30:00.000Z')
ON CONFLICT(tenant_id,doctype,name) DO UPDATE SET
  title=excluded.title,
  content=excluded.content,
  modified_at=excluded.modified_at
WHERE document_search.title<>excluded.title
   OR document_search.content<>excluded.content;

INSERT INTO documents
  (tenant_id,doc_key,doctype,name,owner,docstatus,status,version,created_at,modified_at,modified_by,payload_json)
VALUES
  ('alu','Item:TP-TD326','Item','TP-TD326','admin',0,'Draft',1,'2026-07-30T16:30:00.000Z','2026-07-30T16:30:00.000Z','admin','{"item_code":"TP-TD326","item_name":"LÁ TRUNG GIAN","item_group":"Nan/lá cửa","item_nature":"Hàng tồn kho","material_stage":"Nguyên vật liệu","supply_type":"Mua ngoài","is_stock_item":true,"is_purchase_item":true,"is_sales_item":true,"include_item_in_manufacturing":true,"inventory_mode":"Nhôm cây/lá","measurement_profile":"Nhôm cây/lá","stock_uom":"Kg","default_purchase_uom":"Kg","default_sales_uom":"Mét","uom_conversions":[{"row_id":"UOM-MÉT","uom":"Mét","conversion_factor":0.395}],"material_specification":"ĐM-TD326","valuation_method":"FIFO","has_batch_no":false,"has_serial_no":false,"allow_negative_stock":false,"description":"Vật tư nguyên tử; mua và tồn theo Kg. Mã NCC TD326; nguồn data/trong-luong-nhom.json. Định mức kg/m chỉ là dữ liệu đối chiếu, không tự tính số lượng mua hoặc tồn.","disabled":false,"_migration_source":"alumdoor-item-standardization-2026-07-30"}')
ON CONFLICT(tenant_id,doc_key) DO UPDATE SET
  payload_json=json_patch(documents.payload_json,excluded.payload_json),
  modified_at=excluded.modified_at,
  modified_by=excluded.modified_by,
  version=documents.version+1
WHERE documents.payload_json<>json_patch(documents.payload_json,excluded.payload_json);

INSERT INTO document_search(tenant_id,doctype,name,title,content,modified_at)
VALUES('alu','Item','TP-TD326','LÁ TRUNG GIAN','TP-TD326 LÁ TRUNG GIAN Nan/lá cửa Kg TD326','2026-07-30T16:30:00.000Z')
ON CONFLICT(tenant_id,doctype,name) DO UPDATE SET
  title=excluded.title,
  content=excluded.content,
  modified_at=excluded.modified_at
WHERE document_search.title<>excluded.title
   OR document_search.content<>excluded.content;

INSERT INTO documents
  (tenant_id,doc_key,doctype,name,owner,docstatus,status,version,created_at,modified_at,modified_by,payload_json)
VALUES
  ('alu','Supplier Item:TIẾN ĐẠT:TP-TD326','Supplier Item','TIẾN ĐẠT:TP-TD326','admin',0,'Draft',1,'2026-07-30T16:30:00.000Z','2026-07-30T16:30:00.000Z','admin','{"supplier":"TIẾN ĐẠT","item_code":"TP-TD326","supplier_item_code":"TD326","preferred":true,"note":"Mã Tiến Đạt đối chiếu từ dữ liệu nhập thực tế; không kèm công thức đặt hàng.","disabled":false,"_migration_source":"alumdoor-item-standardization-2026-07-30"}')
ON CONFLICT(tenant_id,doc_key) DO UPDATE SET
  payload_json=json_patch(documents.payload_json,excluded.payload_json),
  modified_at=excluded.modified_at,
  modified_by=excluded.modified_by,
  version=documents.version+1
WHERE documents.payload_json<>json_patch(documents.payload_json,excluded.payload_json);

INSERT INTO document_search(tenant_id,doctype,name,title,content,modified_at)
VALUES('alu','Supplier Item','TIẾN ĐẠT:TP-TD326','TD326','TIẾN ĐẠT TD326 TP-TD326 LÁ TRUNG GIAN','2026-07-30T16:30:00.000Z')
ON CONFLICT(tenant_id,doctype,name) DO UPDATE SET
  title=excluded.title,
  content=excluded.content,
  modified_at=excluded.modified_at
WHERE document_search.title<>excluded.title
   OR document_search.content<>excluded.content;

INSERT INTO documents
  (tenant_id,doc_key,doctype,name,owner,docstatus,status,version,created_at,modified_at,modified_by,payload_json)
VALUES
  ('alu','Material Specification:ĐM-TD327','Material Specification','ĐM-TD327','admin',0,'Draft',1,'2026-07-30T16:30:00.000Z','2026-07-30T16:30:00.000Z','admin','{"spec_code":"ĐM-TD327","spec_name":"Định mức LÁ YẾM","profile_system":"TIẾN ĐẠT","section_code":"TD327","theoretical_kg_per_m":0.153,"note":"Định mức xác nhận: 0.153 kg/m. Chỉ lưu để đối chiếu và quy đổi đơn vị; không tự sinh số kg đặt mua.","disabled":false,"_migration_source":"alumdoor-item-standardization-2026-07-30"}')
ON CONFLICT(tenant_id,doc_key) DO UPDATE SET
  payload_json=json_patch(documents.payload_json,excluded.payload_json),
  modified_at=excluded.modified_at,
  modified_by=excluded.modified_by,
  version=documents.version+1
WHERE documents.payload_json<>json_patch(documents.payload_json,excluded.payload_json);

INSERT INTO document_search(tenant_id,doctype,name,title,content,modified_at)
VALUES('alu','Material Specification','ĐM-TD327','Định mức LÁ YẾM','ĐM-TD327 TP-TD327 TD327 0.153 kg/m','2026-07-30T16:30:00.000Z')
ON CONFLICT(tenant_id,doctype,name) DO UPDATE SET
  title=excluded.title,
  content=excluded.content,
  modified_at=excluded.modified_at
WHERE document_search.title<>excluded.title
   OR document_search.content<>excluded.content;

INSERT INTO documents
  (tenant_id,doc_key,doctype,name,owner,docstatus,status,version,created_at,modified_at,modified_by,payload_json)
VALUES
  ('alu','Item:TP-TD327','Item','TP-TD327','admin',0,'Draft',1,'2026-07-30T16:30:00.000Z','2026-07-30T16:30:00.000Z','admin','{"item_code":"TP-TD327","item_name":"LÁ YẾM","item_group":"Nan/lá cửa","item_nature":"Hàng tồn kho","material_stage":"Nguyên vật liệu","supply_type":"Mua ngoài","is_stock_item":true,"is_purchase_item":true,"is_sales_item":true,"include_item_in_manufacturing":true,"inventory_mode":"Nhôm cây/lá","measurement_profile":"Nhôm cây/lá","stock_uom":"Kg","default_purchase_uom":"Kg","default_sales_uom":"Mét","uom_conversions":[{"row_id":"UOM-MÉT","uom":"Mét","conversion_factor":0.153}],"material_specification":"ĐM-TD327","valuation_method":"FIFO","has_batch_no":false,"has_serial_no":false,"allow_negative_stock":false,"description":"Vật tư nguyên tử; mua và tồn theo Kg. Mã NCC TD327; nguồn data/trong-luong-nhom.json. Định mức kg/m chỉ là dữ liệu đối chiếu, không tự tính số lượng mua hoặc tồn.","disabled":false,"_migration_source":"alumdoor-item-standardization-2026-07-30"}')
ON CONFLICT(tenant_id,doc_key) DO UPDATE SET
  payload_json=json_patch(documents.payload_json,excluded.payload_json),
  modified_at=excluded.modified_at,
  modified_by=excluded.modified_by,
  version=documents.version+1
WHERE documents.payload_json<>json_patch(documents.payload_json,excluded.payload_json);

INSERT INTO document_search(tenant_id,doctype,name,title,content,modified_at)
VALUES('alu','Item','TP-TD327','LÁ YẾM','TP-TD327 LÁ YẾM Nan/lá cửa Kg TD327','2026-07-30T16:30:00.000Z')
ON CONFLICT(tenant_id,doctype,name) DO UPDATE SET
  title=excluded.title,
  content=excluded.content,
  modified_at=excluded.modified_at
WHERE document_search.title<>excluded.title
   OR document_search.content<>excluded.content;

INSERT INTO documents
  (tenant_id,doc_key,doctype,name,owner,docstatus,status,version,created_at,modified_at,modified_by,payload_json)
VALUES
  ('alu','Supplier Item:TIẾN ĐẠT:TP-TD327','Supplier Item','TIẾN ĐẠT:TP-TD327','admin',0,'Draft',1,'2026-07-30T16:30:00.000Z','2026-07-30T16:30:00.000Z','admin','{"supplier":"TIẾN ĐẠT","item_code":"TP-TD327","supplier_item_code":"TD327","preferred":true,"note":"Mã Tiến Đạt đối chiếu từ dữ liệu nhập thực tế; không kèm công thức đặt hàng.","disabled":false,"_migration_source":"alumdoor-item-standardization-2026-07-30"}')
ON CONFLICT(tenant_id,doc_key) DO UPDATE SET
  payload_json=json_patch(documents.payload_json,excluded.payload_json),
  modified_at=excluded.modified_at,
  modified_by=excluded.modified_by,
  version=documents.version+1
WHERE documents.payload_json<>json_patch(documents.payload_json,excluded.payload_json);

INSERT INTO document_search(tenant_id,doctype,name,title,content,modified_at)
VALUES('alu','Supplier Item','TIẾN ĐẠT:TP-TD327','TD327','TIẾN ĐẠT TD327 TP-TD327 LÁ YẾM','2026-07-30T16:30:00.000Z')
ON CONFLICT(tenant_id,doctype,name) DO UPDATE SET
  title=excluded.title,
  content=excluded.content,
  modified_at=excluded.modified_at
WHERE document_search.title<>excluded.title
   OR document_search.content<>excluded.content;

INSERT INTO documents
  (tenant_id,doc_key,doctype,name,owner,docstatus,status,version,created_at,modified_at,modified_by,payload_json)
VALUES
  ('alu','Material Specification:ĐM-A282','Material Specification','ĐM-A282','admin',0,'Draft',1,'2026-07-30T16:30:00.000Z','2026-07-30T16:30:00.000Z','admin','{"spec_code":"ĐM-A282","spec_name":"Định mức LÁ ĐẦU","profile_system":"TIẾN ĐẠT","section_code":"A282","theoretical_kg_per_m":0.452,"note":"Định mức xác nhận: 0.452 kg/m. Chỉ lưu để đối chiếu và quy đổi đơn vị; không tự sinh số kg đặt mua.","disabled":false,"_migration_source":"alumdoor-item-standardization-2026-07-30"}')
ON CONFLICT(tenant_id,doc_key) DO UPDATE SET
  payload_json=json_patch(documents.payload_json,excluded.payload_json),
  modified_at=excluded.modified_at,
  modified_by=excluded.modified_by,
  version=documents.version+1
WHERE documents.payload_json<>json_patch(documents.payload_json,excluded.payload_json);

INSERT INTO document_search(tenant_id,doctype,name,title,content,modified_at)
VALUES('alu','Material Specification','ĐM-A282','Định mức LÁ ĐẦU','ĐM-A282 TP-A282 A282 0.452 kg/m','2026-07-30T16:30:00.000Z')
ON CONFLICT(tenant_id,doctype,name) DO UPDATE SET
  title=excluded.title,
  content=excluded.content,
  modified_at=excluded.modified_at
WHERE document_search.title<>excluded.title
   OR document_search.content<>excluded.content;

INSERT INTO documents
  (tenant_id,doc_key,doctype,name,owner,docstatus,status,version,created_at,modified_at,modified_by,payload_json)
VALUES
  ('alu','Item:TP-A282','Item','TP-A282','admin',0,'Draft',1,'2026-07-30T16:30:00.000Z','2026-07-30T16:30:00.000Z','admin','{"item_code":"TP-A282","item_name":"LÁ ĐẦU","item_group":"Nan/lá cửa","item_nature":"Hàng tồn kho","material_stage":"Nguyên vật liệu","supply_type":"Mua ngoài","is_stock_item":true,"is_purchase_item":true,"is_sales_item":true,"include_item_in_manufacturing":true,"inventory_mode":"Nhôm cây/lá","measurement_profile":"Nhôm cây/lá","stock_uom":"Kg","default_purchase_uom":"Kg","default_sales_uom":"Mét","uom_conversions":[{"row_id":"UOM-MÉT","uom":"Mét","conversion_factor":0.452}],"material_specification":"ĐM-A282","valuation_method":"FIFO","has_batch_no":false,"has_serial_no":false,"allow_negative_stock":false,"description":"Vật tư nguyên tử; mua và tồn theo Kg. Mã NCC A282; nguồn data/trong-luong-nhom.json. Định mức kg/m chỉ là dữ liệu đối chiếu, không tự tính số lượng mua hoặc tồn.","disabled":false,"_migration_source":"alumdoor-item-standardization-2026-07-30"}')
ON CONFLICT(tenant_id,doc_key) DO UPDATE SET
  payload_json=json_patch(documents.payload_json,excluded.payload_json),
  modified_at=excluded.modified_at,
  modified_by=excluded.modified_by,
  version=documents.version+1
WHERE documents.payload_json<>json_patch(documents.payload_json,excluded.payload_json);

INSERT INTO document_search(tenant_id,doctype,name,title,content,modified_at)
VALUES('alu','Item','TP-A282','LÁ ĐẦU','TP-A282 LÁ ĐẦU Nan/lá cửa Kg A282','2026-07-30T16:30:00.000Z')
ON CONFLICT(tenant_id,doctype,name) DO UPDATE SET
  title=excluded.title,
  content=excluded.content,
  modified_at=excluded.modified_at
WHERE document_search.title<>excluded.title
   OR document_search.content<>excluded.content;

INSERT INTO documents
  (tenant_id,doc_key,doctype,name,owner,docstatus,status,version,created_at,modified_at,modified_by,payload_json)
VALUES
  ('alu','Supplier Item:TIẾN ĐẠT:TP-A282','Supplier Item','TIẾN ĐẠT:TP-A282','admin',0,'Draft',1,'2026-07-30T16:30:00.000Z','2026-07-30T16:30:00.000Z','admin','{"supplier":"TIẾN ĐẠT","item_code":"TP-A282","supplier_item_code":"A282","preferred":true,"note":"Mã Tiến Đạt đối chiếu từ dữ liệu nhập thực tế; không kèm công thức đặt hàng.","disabled":false,"_migration_source":"alumdoor-item-standardization-2026-07-30"}')
ON CONFLICT(tenant_id,doc_key) DO UPDATE SET
  payload_json=json_patch(documents.payload_json,excluded.payload_json),
  modified_at=excluded.modified_at,
  modified_by=excluded.modified_by,
  version=documents.version+1
WHERE documents.payload_json<>json_patch(documents.payload_json,excluded.payload_json);

INSERT INTO document_search(tenant_id,doctype,name,title,content,modified_at)
VALUES('alu','Supplier Item','TIẾN ĐẠT:TP-A282','A282','TIẾN ĐẠT A282 TP-A282 LÁ ĐẦU','2026-07-30T16:30:00.000Z')
ON CONFLICT(tenant_id,doctype,name) DO UPDATE SET
  title=excluded.title,
  content=excluded.content,
  modified_at=excluded.modified_at
WHERE document_search.title<>excluded.title
   OR document_search.content<>excluded.content;

INSERT INTO documents
  (tenant_id,doc_key,doctype,name,owner,docstatus,status,version,created_at,modified_at,modified_by,payload_json)
VALUES
  ('alu','Material Specification:ĐM-TD-TG-ALD','Material Specification','ĐM-TD-TG-ALD','admin',0,'Draft',1,'2026-07-30T16:30:00.000Z','2026-07-30T16:30:00.000Z','admin','{"spec_code":"ĐM-TD-TG-ALD","spec_name":"Định mức LÁ TRUNG GIAN ALUM","profile_system":"TIẾN ĐẠT","section_code":"TD-TG-ALD","theoretical_kg_per_m":0.36,"note":"Định mức xác nhận: 0.36 kg/m. Chỉ lưu để đối chiếu và quy đổi đơn vị; không tự sinh số kg đặt mua.","disabled":false,"_migration_source":"alumdoor-item-standardization-2026-07-30"}')
ON CONFLICT(tenant_id,doc_key) DO UPDATE SET
  payload_json=json_patch(documents.payload_json,excluded.payload_json),
  modified_at=excluded.modified_at,
  modified_by=excluded.modified_by,
  version=documents.version+1
WHERE documents.payload_json<>json_patch(documents.payload_json,excluded.payload_json);

INSERT INTO document_search(tenant_id,doctype,name,title,content,modified_at)
VALUES('alu','Material Specification','ĐM-TD-TG-ALD','Định mức LÁ TRUNG GIAN ALUM','ĐM-TD-TG-ALD TD-TG-ALD TD-TG-ALD 0.36 kg/m','2026-07-30T16:30:00.000Z')
ON CONFLICT(tenant_id,doctype,name) DO UPDATE SET
  title=excluded.title,
  content=excluded.content,
  modified_at=excluded.modified_at
WHERE document_search.title<>excluded.title
   OR document_search.content<>excluded.content;

INSERT INTO documents
  (tenant_id,doc_key,doctype,name,owner,docstatus,status,version,created_at,modified_at,modified_by,payload_json)
VALUES
  ('alu','Item:TD-TG-ALD','Item','TD-TG-ALD','admin',0,'Draft',1,'2026-07-30T16:30:00.000Z','2026-07-30T16:30:00.000Z','admin','{"item_code":"TD-TG-ALD","item_name":"LÁ TRUNG GIAN ALUM","item_group":"Nan/lá cửa","item_nature":"Hàng tồn kho","material_stage":"Nguyên vật liệu","supply_type":"Mua ngoài","is_stock_item":true,"is_purchase_item":true,"is_sales_item":false,"include_item_in_manufacturing":true,"inventory_mode":"Nhôm cây/lá","measurement_profile":"Nhôm cây/lá","stock_uom":"Kg","default_purchase_uom":"Kg","material_specification":"ĐM-TD-TG-ALD","valuation_method":"FIFO","has_batch_no":false,"has_serial_no":false,"allow_negative_stock":false,"description":"Vật tư nguyên tử; mua và tồn theo Kg. Mã NCC TD-TG-ALD; nguồn data/trong-luong-nhom.json. Định mức kg/m chỉ là dữ liệu đối chiếu, không tự tính số lượng mua hoặc tồn.","disabled":false,"_migration_source":"alumdoor-item-standardization-2026-07-30"}')
ON CONFLICT(tenant_id,doc_key) DO UPDATE SET
  payload_json=json_patch(documents.payload_json,excluded.payload_json),
  modified_at=excluded.modified_at,
  modified_by=excluded.modified_by,
  version=documents.version+1
WHERE documents.payload_json<>json_patch(documents.payload_json,excluded.payload_json);

INSERT INTO document_search(tenant_id,doctype,name,title,content,modified_at)
VALUES('alu','Item','TD-TG-ALD','LÁ TRUNG GIAN ALUM','TD-TG-ALD LÁ TRUNG GIAN ALUM Nan/lá cửa Kg TD-TG-ALD','2026-07-30T16:30:00.000Z')
ON CONFLICT(tenant_id,doctype,name) DO UPDATE SET
  title=excluded.title,
  content=excluded.content,
  modified_at=excluded.modified_at
WHERE document_search.title<>excluded.title
   OR document_search.content<>excluded.content;

INSERT INTO documents
  (tenant_id,doc_key,doctype,name,owner,docstatus,status,version,created_at,modified_at,modified_by,payload_json)
VALUES
  ('alu','Supplier Item:TIẾN ĐẠT:TD-TG-ALD','Supplier Item','TIẾN ĐẠT:TD-TG-ALD','admin',0,'Draft',1,'2026-07-30T16:30:00.000Z','2026-07-30T16:30:00.000Z','admin','{"supplier":"TIẾN ĐẠT","item_code":"TD-TG-ALD","supplier_item_code":"TD-TG-ALD","preferred":true,"note":"Mã Tiến Đạt đối chiếu từ dữ liệu nhập thực tế; không kèm công thức đặt hàng.","disabled":false,"_migration_source":"alumdoor-item-standardization-2026-07-30"}')
ON CONFLICT(tenant_id,doc_key) DO UPDATE SET
  payload_json=json_patch(documents.payload_json,excluded.payload_json),
  modified_at=excluded.modified_at,
  modified_by=excluded.modified_by,
  version=documents.version+1
WHERE documents.payload_json<>json_patch(documents.payload_json,excluded.payload_json);

INSERT INTO document_search(tenant_id,doctype,name,title,content,modified_at)
VALUES('alu','Supplier Item','TIẾN ĐẠT:TD-TG-ALD','TD-TG-ALD','TIẾN ĐẠT TD-TG-ALD TD-TG-ALD LÁ TRUNG GIAN ALUM','2026-07-30T16:30:00.000Z')
ON CONFLICT(tenant_id,doctype,name) DO UPDATE SET
  title=excluded.title,
  content=excluded.content,
  modified_at=excluded.modified_at
WHERE document_search.title<>excluded.title
   OR document_search.content<>excluded.content;

INSERT INTO documents
  (tenant_id,doc_key,doctype,name,owner,docstatus,status,version,created_at,modified_at,modified_by,payload_json)
VALUES
  ('alu','Material Specification:ĐM-RHM8','Material Specification','ĐM-RHM8','admin',0,'Draft',1,'2026-07-30T16:30:00.000Z','2026-07-30T16:30:00.000Z','admin','{"spec_code":"ĐM-RHM8","spec_name":"Định mức RAY HỘP TD U76","profile_system":"TIẾN ĐẠT","section_code":"RHM8","theoretical_kg_per_m":1.119,"note":"Định mức xác nhận: 1.119 kg/m. Chỉ lưu để đối chiếu và quy đổi đơn vị; không tự sinh số kg đặt mua.","disabled":false,"_migration_source":"alumdoor-item-standardization-2026-07-30"}')
ON CONFLICT(tenant_id,doc_key) DO UPDATE SET
  payload_json=json_patch(documents.payload_json,excluded.payload_json),
  modified_at=excluded.modified_at,
  modified_by=excluded.modified_by,
  version=documents.version+1
WHERE documents.payload_json<>json_patch(documents.payload_json,excluded.payload_json);

INSERT INTO document_search(tenant_id,doctype,name,title,content,modified_at)
VALUES('alu','Material Specification','ĐM-RHM8','Định mức RAY HỘP TD U76','ĐM-RHM8 TP-RAYHOP RHM8 1.119 kg/m','2026-07-30T16:30:00.000Z')
ON CONFLICT(tenant_id,doctype,name) DO UPDATE SET
  title=excluded.title,
  content=excluded.content,
  modified_at=excluded.modified_at
WHERE document_search.title<>excluded.title
   OR document_search.content<>excluded.content;

INSERT INTO documents
  (tenant_id,doc_key,doctype,name,owner,docstatus,status,version,created_at,modified_at,modified_by,payload_json)
VALUES
  ('alu','Item:TP-RAYHOP','Item','TP-RAYHOP','admin',0,'Draft',1,'2026-07-30T16:30:00.000Z','2026-07-30T16:30:00.000Z','admin','{"item_code":"TP-RAYHOP","item_name":"RAY HỘP TD U76","item_group":"Ray và trục","item_nature":"Hàng tồn kho","material_stage":"Nguyên vật liệu","supply_type":"Mua ngoài","is_stock_item":true,"is_purchase_item":true,"is_sales_item":true,"include_item_in_manufacturing":true,"inventory_mode":"Nhôm cây/lá","measurement_profile":"Nhôm cây/lá","stock_uom":"Kg","default_purchase_uom":"Kg","default_sales_uom":"Mét","uom_conversions":[{"row_id":"UOM-MÉT","uom":"Mét","conversion_factor":1.119}],"material_specification":"ĐM-RHM8","valuation_method":"FIFO","has_batch_no":false,"has_serial_no":false,"allow_negative_stock":false,"description":"Vật tư nguyên tử; mua và tồn theo Kg. Mã NCC RHM8; nguồn data/trong-luong-nhom.json. Định mức kg/m chỉ là dữ liệu đối chiếu, không tự tính số lượng mua hoặc tồn.","disabled":false,"_migration_source":"alumdoor-item-standardization-2026-07-30"}')
ON CONFLICT(tenant_id,doc_key) DO UPDATE SET
  payload_json=json_patch(documents.payload_json,excluded.payload_json),
  modified_at=excluded.modified_at,
  modified_by=excluded.modified_by,
  version=documents.version+1
WHERE documents.payload_json<>json_patch(documents.payload_json,excluded.payload_json);

INSERT INTO document_search(tenant_id,doctype,name,title,content,modified_at)
VALUES('alu','Item','TP-RAYHOP','RAY HỘP TD U76','TP-RAYHOP RAY HỘP TD U76 Ray và trục Kg RHM8','2026-07-30T16:30:00.000Z')
ON CONFLICT(tenant_id,doctype,name) DO UPDATE SET
  title=excluded.title,
  content=excluded.content,
  modified_at=excluded.modified_at
WHERE document_search.title<>excluded.title
   OR document_search.content<>excluded.content;

INSERT INTO documents
  (tenant_id,doc_key,doctype,name,owner,docstatus,status,version,created_at,modified_at,modified_by,payload_json)
VALUES
  ('alu','Supplier Item:TIẾN ĐẠT:TP-RAYHOP','Supplier Item','TIẾN ĐẠT:TP-RAYHOP','admin',0,'Draft',1,'2026-07-30T16:30:00.000Z','2026-07-30T16:30:00.000Z','admin','{"supplier":"TIẾN ĐẠT","item_code":"TP-RAYHOP","supplier_item_code":"RHM8","preferred":true,"note":"Mã Tiến Đạt đối chiếu từ dữ liệu nhập thực tế; không kèm công thức đặt hàng.","disabled":false,"_migration_source":"alumdoor-item-standardization-2026-07-30"}')
ON CONFLICT(tenant_id,doc_key) DO UPDATE SET
  payload_json=json_patch(documents.payload_json,excluded.payload_json),
  modified_at=excluded.modified_at,
  modified_by=excluded.modified_by,
  version=documents.version+1
WHERE documents.payload_json<>json_patch(documents.payload_json,excluded.payload_json);

INSERT INTO document_search(tenant_id,doctype,name,title,content,modified_at)
VALUES('alu','Supplier Item','TIẾN ĐẠT:TP-RAYHOP','RHM8','TIẾN ĐẠT RHM8 TP-RAYHOP RAY HỘP TD U76','2026-07-30T16:30:00.000Z')
ON CONFLICT(tenant_id,doctype,name) DO UPDATE SET
  title=excluded.title,
  content=excluded.content,
  modified_at=excluded.modified_at
WHERE document_search.title<>excluded.title
   OR document_search.content<>excluded.content;

INSERT INTO documents
  (tenant_id,doc_key,doctype,name,owner,docstatus,status,version,created_at,modified_at,modified_by,payload_json)
VALUES
  ('alu','Material Specification:ĐM-RHU100','Material Specification','ĐM-RHU100','admin',0,'Draft',1,'2026-07-30T16:30:00.000Z','2026-07-30T16:30:00.000Z','admin','{"spec_code":"ĐM-RHU100","spec_name":"Định mức RAY HỘP TD U100","profile_system":"TIẾN ĐẠT","section_code":"RHU100","theoretical_kg_per_m":1.419,"note":"Định mức xác nhận: 1.419 kg/m. Chỉ lưu để đối chiếu và quy đổi đơn vị; không tự sinh số kg đặt mua.","disabled":false,"_migration_source":"alumdoor-item-standardization-2026-07-30"}')
ON CONFLICT(tenant_id,doc_key) DO UPDATE SET
  payload_json=json_patch(documents.payload_json,excluded.payload_json),
  modified_at=excluded.modified_at,
  modified_by=excluded.modified_by,
  version=documents.version+1
WHERE documents.payload_json<>json_patch(documents.payload_json,excluded.payload_json);

INSERT INTO document_search(tenant_id,doctype,name,title,content,modified_at)
VALUES('alu','Material Specification','ĐM-RHU100','Định mức RAY HỘP TD U100','ĐM-RHU100 TP-RAY HỘP TD U100 RHU100 1.419 kg/m','2026-07-30T16:30:00.000Z')
ON CONFLICT(tenant_id,doctype,name) DO UPDATE SET
  title=excluded.title,
  content=excluded.content,
  modified_at=excluded.modified_at
WHERE document_search.title<>excluded.title
   OR document_search.content<>excluded.content;

INSERT INTO documents
  (tenant_id,doc_key,doctype,name,owner,docstatus,status,version,created_at,modified_at,modified_by,payload_json)
VALUES
  ('alu','Item:TP-RAY HỘP TD U100','Item','TP-RAY HỘP TD U100','admin',0,'Draft',1,'2026-07-30T16:30:00.000Z','2026-07-30T16:30:00.000Z','admin','{"item_code":"TP-RAY HỘP TD U100","item_name":"RAY HỘP TD U100","item_group":"Ray và trục","item_nature":"Hàng tồn kho","material_stage":"Nguyên vật liệu","supply_type":"Mua ngoài","is_stock_item":true,"is_purchase_item":true,"is_sales_item":true,"include_item_in_manufacturing":true,"inventory_mode":"Nhôm cây/lá","measurement_profile":"Nhôm cây/lá","stock_uom":"Kg","default_purchase_uom":"Kg","default_sales_uom":"Mét","uom_conversions":[{"row_id":"UOM-MÉT","uom":"Mét","conversion_factor":1.419}],"material_specification":"ĐM-RHU100","valuation_method":"FIFO","has_batch_no":false,"has_serial_no":false,"allow_negative_stock":false,"description":"Vật tư nguyên tử; mua và tồn theo Kg. Mã NCC RHU100; nguồn data/trong-luong-nhom.json. Định mức kg/m chỉ là dữ liệu đối chiếu, không tự tính số lượng mua hoặc tồn.","disabled":false,"_migration_source":"alumdoor-item-standardization-2026-07-30"}')
ON CONFLICT(tenant_id,doc_key) DO UPDATE SET
  payload_json=json_patch(documents.payload_json,excluded.payload_json),
  modified_at=excluded.modified_at,
  modified_by=excluded.modified_by,
  version=documents.version+1
WHERE documents.payload_json<>json_patch(documents.payload_json,excluded.payload_json);

INSERT INTO document_search(tenant_id,doctype,name,title,content,modified_at)
VALUES('alu','Item','TP-RAY HỘP TD U100','RAY HỘP TD U100','TP-RAY HỘP TD U100 RAY HỘP TD U100 Ray và trục Kg RHU100','2026-07-30T16:30:00.000Z')
ON CONFLICT(tenant_id,doctype,name) DO UPDATE SET
  title=excluded.title,
  content=excluded.content,
  modified_at=excluded.modified_at
WHERE document_search.title<>excluded.title
   OR document_search.content<>excluded.content;

INSERT INTO documents
  (tenant_id,doc_key,doctype,name,owner,docstatus,status,version,created_at,modified_at,modified_by,payload_json)
VALUES
  ('alu','Supplier Item:TIẾN ĐẠT:TP-RAY HỘP TD U100','Supplier Item','TIẾN ĐẠT:TP-RAY HỘP TD U100','admin',0,'Draft',1,'2026-07-30T16:30:00.000Z','2026-07-30T16:30:00.000Z','admin','{"supplier":"TIẾN ĐẠT","item_code":"TP-RAY HỘP TD U100","supplier_item_code":"RHU100","preferred":true,"note":"Mã Tiến Đạt đối chiếu từ dữ liệu nhập thực tế; không kèm công thức đặt hàng.","disabled":false,"_migration_source":"alumdoor-item-standardization-2026-07-30"}')
ON CONFLICT(tenant_id,doc_key) DO UPDATE SET
  payload_json=json_patch(documents.payload_json,excluded.payload_json),
  modified_at=excluded.modified_at,
  modified_by=excluded.modified_by,
  version=documents.version+1
WHERE documents.payload_json<>json_patch(documents.payload_json,excluded.payload_json);

INSERT INTO document_search(tenant_id,doctype,name,title,content,modified_at)
VALUES('alu','Supplier Item','TIẾN ĐẠT:TP-RAY HỘP TD U100','RHU100','TIẾN ĐẠT RHU100 TP-RAY HỘP TD U100 RAY HỘP TD U100','2026-07-30T16:30:00.000Z')
ON CONFLICT(tenant_id,doctype,name) DO UPDATE SET
  title=excluded.title,
  content=excluded.content,
  modified_at=excluded.modified_at
WHERE document_search.title<>excluded.title
   OR document_search.content<>excluded.content;

INSERT INTO documents
  (tenant_id,doc_key,doctype,name,owner,docstatus,status,version,created_at,modified_at,modified_by,payload_json)
VALUES
  ('alu','Material Specification:ĐM-TD87A1','Material Specification','ĐM-TD87A1','admin',0,'Draft',1,'2026-07-30T16:30:00.000Z','2026-07-30T16:30:00.000Z','admin','{"spec_code":"ĐM-TD87A1","spec_name":"Định mức RAY ĐƠN TD U76","profile_system":"TIẾN ĐẠT","section_code":"TD87A1","theoretical_kg_per_m":0.635,"note":"Định mức xác nhận: 0.635 kg/m. Chỉ lưu để đối chiếu và quy đổi đơn vị; không tự sinh số kg đặt mua.","disabled":false,"_migration_source":"alumdoor-item-standardization-2026-07-30"}')
ON CONFLICT(tenant_id,doc_key) DO UPDATE SET
  payload_json=json_patch(documents.payload_json,excluded.payload_json),
  modified_at=excluded.modified_at,
  modified_by=excluded.modified_by,
  version=documents.version+1
WHERE documents.payload_json<>json_patch(documents.payload_json,excluded.payload_json);

INSERT INTO document_search(tenant_id,doctype,name,title,content,modified_at)
VALUES('alu','Material Specification','ĐM-TD87A1','Định mức RAY ĐƠN TD U76','ĐM-TD87A1 TP-TD87A1 GS TD87A1 0.635 kg/m','2026-07-30T16:30:00.000Z')
ON CONFLICT(tenant_id,doctype,name) DO UPDATE SET
  title=excluded.title,
  content=excluded.content,
  modified_at=excluded.modified_at
WHERE document_search.title<>excluded.title
   OR document_search.content<>excluded.content;

INSERT INTO documents
  (tenant_id,doc_key,doctype,name,owner,docstatus,status,version,created_at,modified_at,modified_by,payload_json)
VALUES
  ('alu','Item:TP-TD87A1 GS','Item','TP-TD87A1 GS','admin',0,'Draft',1,'2026-07-30T16:30:00.000Z','2026-07-30T16:30:00.000Z','admin','{"item_code":"TP-TD87A1 GS","item_name":"RAY ĐƠN TD U76","item_group":"Ray và trục","item_nature":"Hàng tồn kho","material_stage":"Nguyên vật liệu","supply_type":"Mua ngoài","is_stock_item":true,"is_purchase_item":true,"is_sales_item":true,"include_item_in_manufacturing":true,"inventory_mode":"Nhôm cây/lá","measurement_profile":"Nhôm cây/lá","stock_uom":"Kg","default_purchase_uom":"Kg","default_sales_uom":"Mét","uom_conversions":[{"row_id":"UOM-MÉT","uom":"Mét","conversion_factor":0.635}],"material_specification":"ĐM-TD87A1","valuation_method":"FIFO","has_batch_no":false,"has_serial_no":false,"allow_negative_stock":false,"description":"Vật tư nguyên tử; mua và tồn theo Kg. Mã NCC TD87A1; nguồn data/trong-luong-nhom.json. Định mức kg/m chỉ là dữ liệu đối chiếu, không tự tính số lượng mua hoặc tồn.","disabled":false,"_migration_source":"alumdoor-item-standardization-2026-07-30"}')
ON CONFLICT(tenant_id,doc_key) DO UPDATE SET
  payload_json=json_patch(documents.payload_json,excluded.payload_json),
  modified_at=excluded.modified_at,
  modified_by=excluded.modified_by,
  version=documents.version+1
WHERE documents.payload_json<>json_patch(documents.payload_json,excluded.payload_json);

INSERT INTO document_search(tenant_id,doctype,name,title,content,modified_at)
VALUES('alu','Item','TP-TD87A1 GS','RAY ĐƠN TD U76','TP-TD87A1 GS RAY ĐƠN TD U76 Ray và trục Kg TD87A1','2026-07-30T16:30:00.000Z')
ON CONFLICT(tenant_id,doctype,name) DO UPDATE SET
  title=excluded.title,
  content=excluded.content,
  modified_at=excluded.modified_at
WHERE document_search.title<>excluded.title
   OR document_search.content<>excluded.content;

INSERT INTO documents
  (tenant_id,doc_key,doctype,name,owner,docstatus,status,version,created_at,modified_at,modified_by,payload_json)
VALUES
  ('alu','Supplier Item:TIẾN ĐẠT:TP-TD87A1 GS','Supplier Item','TIẾN ĐẠT:TP-TD87A1 GS','admin',0,'Draft',1,'2026-07-30T16:30:00.000Z','2026-07-30T16:30:00.000Z','admin','{"supplier":"TIẾN ĐẠT","item_code":"TP-TD87A1 GS","supplier_item_code":"TD87A1","preferred":true,"note":"Mã Tiến Đạt đối chiếu từ dữ liệu nhập thực tế; không kèm công thức đặt hàng.","disabled":false,"_migration_source":"alumdoor-item-standardization-2026-07-30"}')
ON CONFLICT(tenant_id,doc_key) DO UPDATE SET
  payload_json=json_patch(documents.payload_json,excluded.payload_json),
  modified_at=excluded.modified_at,
  modified_by=excluded.modified_by,
  version=documents.version+1
WHERE documents.payload_json<>json_patch(documents.payload_json,excluded.payload_json);

INSERT INTO document_search(tenant_id,doctype,name,title,content,modified_at)
VALUES('alu','Supplier Item','TIẾN ĐẠT:TP-TD87A1 GS','TD87A1','TIẾN ĐẠT TD87A1 TP-TD87A1 GS RAY ĐƠN TD U76','2026-07-30T16:30:00.000Z')
ON CONFLICT(tenant_id,doctype,name) DO UPDATE SET
  title=excluded.title,
  content=excluded.content,
  modified_at=excluded.modified_at
WHERE document_search.title<>excluded.title
   OR document_search.content<>excluded.content;

INSERT INTO documents
  (tenant_id,doc_key,doctype,name,owner,docstatus,status,version,created_at,modified_at,modified_by,payload_json)
VALUES
  ('alu','Material Specification:ĐM-RHM8(2.4MM)','Material Specification','ĐM-RHM8(2.4MM)','admin',0,'Draft',1,'2026-07-30T16:30:00.000Z','2026-07-30T16:30:00.000Z','admin','{"spec_code":"ĐM-RHM8(2.4MM)","spec_name":"Định mức RAY HỘP U76 2.4MM","profile_system":"TIẾN ĐẠT","section_code":"RHM8(2.4MM)","theoretical_kg_per_m":1.872,"note":"Định mức xác nhận: 1.872 kg/m. Chỉ lưu để đối chiếu và quy đổi đơn vị; không tự sinh số kg đặt mua.","disabled":false,"_migration_source":"alumdoor-item-standardization-2026-07-30"}')
ON CONFLICT(tenant_id,doc_key) DO UPDATE SET
  payload_json=json_patch(documents.payload_json,excluded.payload_json),
  modified_at=excluded.modified_at,
  modified_by=excluded.modified_by,
  version=documents.version+1
WHERE documents.payload_json<>json_patch(documents.payload_json,excluded.payload_json);

INSERT INTO document_search(tenant_id,doctype,name,title,content,modified_at)
VALUES('alu','Material Specification','ĐM-RHM8(2.4MM)','Định mức RAY HỘP U76 2.4MM','ĐM-RHM8(2.4MM) RHM8(2.4MM) RHM8(2.4MM) 1.872 kg/m','2026-07-30T16:30:00.000Z')
ON CONFLICT(tenant_id,doctype,name) DO UPDATE SET
  title=excluded.title,
  content=excluded.content,
  modified_at=excluded.modified_at
WHERE document_search.title<>excluded.title
   OR document_search.content<>excluded.content;

INSERT INTO documents
  (tenant_id,doc_key,doctype,name,owner,docstatus,status,version,created_at,modified_at,modified_by,payload_json)
VALUES
  ('alu','Item:RHM8(2.4MM)','Item','RHM8(2.4MM)','admin',0,'Draft',1,'2026-07-30T16:30:00.000Z','2026-07-30T16:30:00.000Z','admin','{"item_code":"RHM8(2.4MM)","item_name":"RAY HỘP U76 2.4MM","item_group":"Ray và trục","item_nature":"Hàng tồn kho","material_stage":"Nguyên vật liệu","supply_type":"Mua ngoài","is_stock_item":true,"is_purchase_item":true,"is_sales_item":false,"include_item_in_manufacturing":true,"inventory_mode":"Nhôm cây/lá","measurement_profile":"Nhôm cây/lá","stock_uom":"Kg","default_purchase_uom":"Kg","material_specification":"ĐM-RHM8(2.4MM)","valuation_method":"FIFO","has_batch_no":false,"has_serial_no":false,"allow_negative_stock":false,"description":"Vật tư nguyên tử; mua và tồn theo Kg. Mã NCC RHM8(2.4MM); nguồn data/trong-luong-nhom.json. Định mức kg/m chỉ là dữ liệu đối chiếu, không tự tính số lượng mua hoặc tồn.","disabled":false,"_migration_source":"alumdoor-item-standardization-2026-07-30"}')
ON CONFLICT(tenant_id,doc_key) DO UPDATE SET
  payload_json=json_patch(documents.payload_json,excluded.payload_json),
  modified_at=excluded.modified_at,
  modified_by=excluded.modified_by,
  version=documents.version+1
WHERE documents.payload_json<>json_patch(documents.payload_json,excluded.payload_json);

INSERT INTO document_search(tenant_id,doctype,name,title,content,modified_at)
VALUES('alu','Item','RHM8(2.4MM)','RAY HỘP U76 2.4MM','RHM8(2.4MM) RAY HỘP U76 2.4MM Ray và trục Kg RHM8(2.4MM)','2026-07-30T16:30:00.000Z')
ON CONFLICT(tenant_id,doctype,name) DO UPDATE SET
  title=excluded.title,
  content=excluded.content,
  modified_at=excluded.modified_at
WHERE document_search.title<>excluded.title
   OR document_search.content<>excluded.content;

INSERT INTO documents
  (tenant_id,doc_key,doctype,name,owner,docstatus,status,version,created_at,modified_at,modified_by,payload_json)
VALUES
  ('alu','Supplier Item:TIẾN ĐẠT:RHM8(2.4MM)','Supplier Item','TIẾN ĐẠT:RHM8(2.4MM)','admin',0,'Draft',1,'2026-07-30T16:30:00.000Z','2026-07-30T16:30:00.000Z','admin','{"supplier":"TIẾN ĐẠT","item_code":"RHM8(2.4MM)","supplier_item_code":"RHM8(2.4MM)","preferred":true,"note":"Mã Tiến Đạt đối chiếu từ dữ liệu nhập thực tế; không kèm công thức đặt hàng.","disabled":false,"_migration_source":"alumdoor-item-standardization-2026-07-30"}')
ON CONFLICT(tenant_id,doc_key) DO UPDATE SET
  payload_json=json_patch(documents.payload_json,excluded.payload_json),
  modified_at=excluded.modified_at,
  modified_by=excluded.modified_by,
  version=documents.version+1
WHERE documents.payload_json<>json_patch(documents.payload_json,excluded.payload_json);

INSERT INTO document_search(tenant_id,doctype,name,title,content,modified_at)
VALUES('alu','Supplier Item','TIẾN ĐẠT:RHM8(2.4MM)','RHM8(2.4MM)','TIẾN ĐẠT RHM8(2.4MM) RHM8(2.4MM) RAY HỘP U76 2.4MM','2026-07-30T16:30:00.000Z')
ON CONFLICT(tenant_id,doctype,name) DO UPDATE SET
  title=excluded.title,
  content=excluded.content,
  modified_at=excluded.modified_at
WHERE document_search.title<>excluded.title
   OR document_search.content<>excluded.content;

INSERT INTO documents
  (tenant_id,doc_key,doctype,name,owner,docstatus,status,version,created_at,modified_at,modified_by,payload_json)
VALUES
  ('alu','Material Specification:ĐM-CQ-VM111','Material Specification','ĐM-CQ-VM111','admin',0,'Draft',1,'2026-07-30T16:30:00.000Z','2026-07-30T16:30:00.000Z','admin','{"spec_code":"ĐM-CQ-VM111","spec_name":"Định mức THANH ĐÁY ÚC MÓC CONG","profile_system":"TIẾN ĐẠT","section_code":"CQ-VM111","theoretical_kg_per_m":0.576,"note":"Định mức xác nhận: 0.576 kg/m. Chỉ lưu để đối chiếu và quy đổi đơn vị; không tự sinh số kg đặt mua.","disabled":false,"_migration_source":"alumdoor-item-standardization-2026-07-30"}')
ON CONFLICT(tenant_id,doc_key) DO UPDATE SET
  payload_json=json_patch(documents.payload_json,excluded.payload_json),
  modified_at=excluded.modified_at,
  modified_by=excluded.modified_by,
  version=documents.version+1
WHERE documents.payload_json<>json_patch(documents.payload_json,excluded.payload_json);

INSERT INTO document_search(tenant_id,doctype,name,title,content,modified_at)
VALUES('alu','Material Specification','ĐM-CQ-VM111','Định mức THANH ĐÁY ÚC MÓC CONG','ĐM-CQ-VM111 CQ-VM111 CQ-VM111 0.576 kg/m','2026-07-30T16:30:00.000Z')
ON CONFLICT(tenant_id,doctype,name) DO UPDATE SET
  title=excluded.title,
  content=excluded.content,
  modified_at=excluded.modified_at
WHERE document_search.title<>excluded.title
   OR document_search.content<>excluded.content;

INSERT INTO documents
  (tenant_id,doc_key,doctype,name,owner,docstatus,status,version,created_at,modified_at,modified_by,payload_json)
VALUES
  ('alu','Item:CQ-VM111','Item','CQ-VM111','admin',0,'Draft',1,'2026-07-30T16:30:00.000Z','2026-07-30T16:30:00.000Z','admin','{"item_code":"CQ-VM111","item_name":"THANH ĐÁY ÚC MÓC CONG","item_group":"Nan/lá cửa","item_nature":"Hàng tồn kho","material_stage":"Nguyên vật liệu","supply_type":"Mua ngoài","is_stock_item":true,"is_purchase_item":true,"is_sales_item":false,"include_item_in_manufacturing":true,"inventory_mode":"Nhôm cây/lá","measurement_profile":"Nhôm cây/lá","stock_uom":"Kg","default_purchase_uom":"Kg","material_specification":"ĐM-CQ-VM111","valuation_method":"FIFO","has_batch_no":false,"has_serial_no":false,"allow_negative_stock":false,"description":"Vật tư nguyên tử; mua và tồn theo Kg. Mã NCC CQ-VM111; nguồn data/trong-luong-nhom.json. Định mức kg/m chỉ là dữ liệu đối chiếu, không tự tính số lượng mua hoặc tồn.","disabled":false,"_migration_source":"alumdoor-item-standardization-2026-07-30"}')
ON CONFLICT(tenant_id,doc_key) DO UPDATE SET
  payload_json=json_patch(documents.payload_json,excluded.payload_json),
  modified_at=excluded.modified_at,
  modified_by=excluded.modified_by,
  version=documents.version+1
WHERE documents.payload_json<>json_patch(documents.payload_json,excluded.payload_json);

INSERT INTO document_search(tenant_id,doctype,name,title,content,modified_at)
VALUES('alu','Item','CQ-VM111','THANH ĐÁY ÚC MÓC CONG','CQ-VM111 THANH ĐÁY ÚC MÓC CONG Nan/lá cửa Kg CQ-VM111','2026-07-30T16:30:00.000Z')
ON CONFLICT(tenant_id,doctype,name) DO UPDATE SET
  title=excluded.title,
  content=excluded.content,
  modified_at=excluded.modified_at
WHERE document_search.title<>excluded.title
   OR document_search.content<>excluded.content;

INSERT INTO documents
  (tenant_id,doc_key,doctype,name,owner,docstatus,status,version,created_at,modified_at,modified_by,payload_json)
VALUES
  ('alu','Supplier Item:TIẾN ĐẠT:CQ-VM111','Supplier Item','TIẾN ĐẠT:CQ-VM111','admin',0,'Draft',1,'2026-07-30T16:30:00.000Z','2026-07-30T16:30:00.000Z','admin','{"supplier":"TIẾN ĐẠT","item_code":"CQ-VM111","supplier_item_code":"CQ-VM111","preferred":true,"note":"Mã Tiến Đạt đối chiếu từ dữ liệu nhập thực tế; không kèm công thức đặt hàng.","disabled":false,"_migration_source":"alumdoor-item-standardization-2026-07-30"}')
ON CONFLICT(tenant_id,doc_key) DO UPDATE SET
  payload_json=json_patch(documents.payload_json,excluded.payload_json),
  modified_at=excluded.modified_at,
  modified_by=excluded.modified_by,
  version=documents.version+1
WHERE documents.payload_json<>json_patch(documents.payload_json,excluded.payload_json);

INSERT INTO document_search(tenant_id,doctype,name,title,content,modified_at)
VALUES('alu','Supplier Item','TIẾN ĐẠT:CQ-VM111','CQ-VM111','TIẾN ĐẠT CQ-VM111 CQ-VM111 THANH ĐÁY ÚC MÓC CONG','2026-07-30T16:30:00.000Z')
ON CONFLICT(tenant_id,doctype,name) DO UPDATE SET
  title=excluded.title,
  content=excluded.content,
  modified_at=excluded.modified_at
WHERE document_search.title<>excluded.title
   OR document_search.content<>excluded.content;

INSERT INTO documents
  (tenant_id,doc_key,doctype,name,owner,docstatus,status,version,created_at,modified_at,modified_by,payload_json)
VALUES
  ('alu','Material Specification:ĐM-TDU26','Material Specification','ĐM-TDU26','admin',0,'Draft',1,'2026-07-30T16:30:00.000Z','2026-07-30T16:30:00.000Z','admin','{"spec_code":"ĐM-TDU26","spec_name":"Định mức THANH ĐÁY U76 TỰ DỪNG ALUM","profile_system":"TIẾN ĐẠT","section_code":"TDU26","theoretical_kg_per_m":0.408,"note":"Định mức xác nhận: 0.408 kg/m. Chỉ lưu để đối chiếu và quy đổi đơn vị; không tự sinh số kg đặt mua.","disabled":false,"_migration_source":"alumdoor-item-standardization-2026-07-30"}')
ON CONFLICT(tenant_id,doc_key) DO UPDATE SET
  payload_json=json_patch(documents.payload_json,excluded.payload_json),
  modified_at=excluded.modified_at,
  modified_by=excluded.modified_by,
  version=documents.version+1
WHERE documents.payload_json<>json_patch(documents.payload_json,excluded.payload_json);

INSERT INTO document_search(tenant_id,doctype,name,title,content,modified_at)
VALUES('alu','Material Specification','ĐM-TDU26','Định mức THANH ĐÁY U76 TỰ DỪNG ALUM','ĐM-TDU26 TDU26 TDU26 0.408 kg/m','2026-07-30T16:30:00.000Z')
ON CONFLICT(tenant_id,doctype,name) DO UPDATE SET
  title=excluded.title,
  content=excluded.content,
  modified_at=excluded.modified_at
WHERE document_search.title<>excluded.title
   OR document_search.content<>excluded.content;

INSERT INTO documents
  (tenant_id,doc_key,doctype,name,owner,docstatus,status,version,created_at,modified_at,modified_by,payload_json)
VALUES
  ('alu','Item:TDU26','Item','TDU26','admin',0,'Draft',1,'2026-07-30T16:30:00.000Z','2026-07-30T16:30:00.000Z','admin','{"item_code":"TDU26","item_name":"THANH ĐÁY U76 TỰ DỪNG ALUM","item_group":"Nan/lá cửa","item_nature":"Hàng tồn kho","material_stage":"Nguyên vật liệu","supply_type":"Mua ngoài","is_stock_item":true,"is_purchase_item":true,"is_sales_item":false,"include_item_in_manufacturing":true,"inventory_mode":"Nhôm cây/lá","measurement_profile":"Nhôm cây/lá","stock_uom":"Kg","default_purchase_uom":"Kg","material_specification":"ĐM-TDU26","valuation_method":"FIFO","has_batch_no":false,"has_serial_no":false,"allow_negative_stock":false,"description":"Vật tư nguyên tử; mua và tồn theo Kg. Mã NCC TDU26; nguồn data/trong-luong-nhom.json. Định mức kg/m chỉ là dữ liệu đối chiếu, không tự tính số lượng mua hoặc tồn.","disabled":false,"_migration_source":"alumdoor-item-standardization-2026-07-30"}')
ON CONFLICT(tenant_id,doc_key) DO UPDATE SET
  payload_json=json_patch(documents.payload_json,excluded.payload_json),
  modified_at=excluded.modified_at,
  modified_by=excluded.modified_by,
  version=documents.version+1
WHERE documents.payload_json<>json_patch(documents.payload_json,excluded.payload_json);

INSERT INTO document_search(tenant_id,doctype,name,title,content,modified_at)
VALUES('alu','Item','TDU26','THANH ĐÁY U76 TỰ DỪNG ALUM','TDU26 THANH ĐÁY U76 TỰ DỪNG ALUM Nan/lá cửa Kg TDU26','2026-07-30T16:30:00.000Z')
ON CONFLICT(tenant_id,doctype,name) DO UPDATE SET
  title=excluded.title,
  content=excluded.content,
  modified_at=excluded.modified_at
WHERE document_search.title<>excluded.title
   OR document_search.content<>excluded.content;

INSERT INTO documents
  (tenant_id,doc_key,doctype,name,owner,docstatus,status,version,created_at,modified_at,modified_by,payload_json)
VALUES
  ('alu','Supplier Item:TIẾN ĐẠT:TDU26','Supplier Item','TIẾN ĐẠT:TDU26','admin',0,'Draft',1,'2026-07-30T16:30:00.000Z','2026-07-30T16:30:00.000Z','admin','{"supplier":"TIẾN ĐẠT","item_code":"TDU26","supplier_item_code":"TDU26","preferred":true,"note":"Mã Tiến Đạt đối chiếu từ dữ liệu nhập thực tế; không kèm công thức đặt hàng.","disabled":false,"_migration_source":"alumdoor-item-standardization-2026-07-30"}')
ON CONFLICT(tenant_id,doc_key) DO UPDATE SET
  payload_json=json_patch(documents.payload_json,excluded.payload_json),
  modified_at=excluded.modified_at,
  modified_by=excluded.modified_by,
  version=documents.version+1
WHERE documents.payload_json<>json_patch(documents.payload_json,excluded.payload_json);

INSERT INTO document_search(tenant_id,doctype,name,title,content,modified_at)
VALUES('alu','Supplier Item','TIẾN ĐẠT:TDU26','TDU26','TIẾN ĐẠT TDU26 TDU26 THANH ĐÁY U76 TỰ DỪNG ALUM','2026-07-30T16:30:00.000Z')
ON CONFLICT(tenant_id,doctype,name) DO UPDATE SET
  title=excluded.title,
  content=excluded.content,
  modified_at=excluded.modified_at
WHERE document_search.title<>excluded.title
   OR document_search.content<>excluded.content;

INSERT INTO documents
  (tenant_id,doc_key,doctype,name,owner,docstatus,status,version,created_at,modified_at,modified_by,payload_json)
VALUES
  ('alu','Material Specification:ĐM-AL-YST','Material Specification','ĐM-AL-YST','admin',0,'Draft',1,'2026-07-30T16:30:00.000Z','2026-07-30T16:30:00.000Z','admin','{"spec_code":"ĐM-AL-YST","spec_name":"Định mức THANH ĐÁY LƯ ĐÀI LOAN SIÊU TRƯỜNG","profile_system":"TIẾN ĐẠT","section_code":"AL-YST","theoretical_kg_per_m":0.301,"note":"Định mức xác nhận: 0.301 kg/m. Chỉ lưu để đối chiếu và quy đổi đơn vị; không tự sinh số kg đặt mua.","disabled":false,"_migration_source":"alumdoor-item-standardization-2026-07-30"}')
ON CONFLICT(tenant_id,doc_key) DO UPDATE SET
  payload_json=json_patch(documents.payload_json,excluded.payload_json),
  modified_at=excluded.modified_at,
  modified_by=excluded.modified_by,
  version=documents.version+1
WHERE documents.payload_json<>json_patch(documents.payload_json,excluded.payload_json);

INSERT INTO document_search(tenant_id,doctype,name,title,content,modified_at)
VALUES('alu','Material Specification','ĐM-AL-YST','Định mức THANH ĐÁY LƯ ĐÀI LOAN SIÊU TRƯỜNG','ĐM-AL-YST AL-YST AL-YST 0.301 kg/m','2026-07-30T16:30:00.000Z')
ON CONFLICT(tenant_id,doctype,name) DO UPDATE SET
  title=excluded.title,
  content=excluded.content,
  modified_at=excluded.modified_at
WHERE document_search.title<>excluded.title
   OR document_search.content<>excluded.content;

INSERT INTO documents
  (tenant_id,doc_key,doctype,name,owner,docstatus,status,version,created_at,modified_at,modified_by,payload_json)
VALUES
  ('alu','Item:AL-YST','Item','AL-YST','admin',0,'Draft',1,'2026-07-30T16:30:00.000Z','2026-07-30T16:30:00.000Z','admin','{"item_code":"AL-YST","item_name":"THANH ĐÁY LƯ ĐÀI LOAN SIÊU TRƯỜNG","item_group":"Nan/lá cửa","item_nature":"Hàng tồn kho","material_stage":"Nguyên vật liệu","supply_type":"Mua ngoài","is_stock_item":true,"is_purchase_item":true,"is_sales_item":false,"include_item_in_manufacturing":true,"inventory_mode":"Nhôm cây/lá","measurement_profile":"Nhôm cây/lá","stock_uom":"Kg","default_purchase_uom":"Kg","material_specification":"ĐM-AL-YST","valuation_method":"FIFO","has_batch_no":false,"has_serial_no":false,"allow_negative_stock":false,"description":"Vật tư nguyên tử; mua và tồn theo Kg. Mã NCC AL-YST; nguồn data/trong-luong-nhom.json. Định mức kg/m chỉ là dữ liệu đối chiếu, không tự tính số lượng mua hoặc tồn.","disabled":false,"_migration_source":"alumdoor-item-standardization-2026-07-30"}')
ON CONFLICT(tenant_id,doc_key) DO UPDATE SET
  payload_json=json_patch(documents.payload_json,excluded.payload_json),
  modified_at=excluded.modified_at,
  modified_by=excluded.modified_by,
  version=documents.version+1
WHERE documents.payload_json<>json_patch(documents.payload_json,excluded.payload_json);

INSERT INTO document_search(tenant_id,doctype,name,title,content,modified_at)
VALUES('alu','Item','AL-YST','THANH ĐÁY LƯ ĐÀI LOAN SIÊU TRƯỜNG','AL-YST THANH ĐÁY LƯ ĐÀI LOAN SIÊU TRƯỜNG Nan/lá cửa Kg AL-YST','2026-07-30T16:30:00.000Z')
ON CONFLICT(tenant_id,doctype,name) DO UPDATE SET
  title=excluded.title,
  content=excluded.content,
  modified_at=excluded.modified_at
WHERE document_search.title<>excluded.title
   OR document_search.content<>excluded.content;

INSERT INTO documents
  (tenant_id,doc_key,doctype,name,owner,docstatus,status,version,created_at,modified_at,modified_by,payload_json)
VALUES
  ('alu','Supplier Item:TIẾN ĐẠT:AL-YST','Supplier Item','TIẾN ĐẠT:AL-YST','admin',0,'Draft',1,'2026-07-30T16:30:00.000Z','2026-07-30T16:30:00.000Z','admin','{"supplier":"TIẾN ĐẠT","item_code":"AL-YST","supplier_item_code":"AL-YST","preferred":true,"note":"Mã Tiến Đạt đối chiếu từ dữ liệu nhập thực tế; không kèm công thức đặt hàng.","disabled":false,"_migration_source":"alumdoor-item-standardization-2026-07-30"}')
ON CONFLICT(tenant_id,doc_key) DO UPDATE SET
  payload_json=json_patch(documents.payload_json,excluded.payload_json),
  modified_at=excluded.modified_at,
  modified_by=excluded.modified_by,
  version=documents.version+1
WHERE documents.payload_json<>json_patch(documents.payload_json,excluded.payload_json);

INSERT INTO document_search(tenant_id,doctype,name,title,content,modified_at)
VALUES('alu','Supplier Item','TIẾN ĐẠT:AL-YST','AL-YST','TIẾN ĐẠT AL-YST AL-YST THANH ĐÁY LƯ ĐÀI LOAN SIÊU TRƯỜNG','2026-07-30T16:30:00.000Z')
ON CONFLICT(tenant_id,doctype,name) DO UPDATE SET
  title=excluded.title,
  content=excluded.content,
  modified_at=excluded.modified_at
WHERE document_search.title<>excluded.title
   OR document_search.content<>excluded.content;

INSERT INTO documents
  (tenant_id,doc_key,doctype,name,owner,docstatus,status,version,created_at,modified_at,modified_by,payload_json)
VALUES
  ('alu','Material Specification:ĐM-RON-DD','Material Specification','ĐM-RON-DD','admin',0,'Draft',1,'2026-07-30T16:30:00.000Z','2026-07-30T16:30:00.000Z','admin','{"spec_code":"ĐM-RON-DD","spec_name":"Định mức RON ĐÁY ĐỨC","profile_system":"Alumdoor","section_code":"RON-DD","theoretical_kg_per_m":0.117,"note":"Định mức xác nhận: 0.117 kg/m. Chỉ lưu để đối chiếu và quy đổi đơn vị; không tự sinh số kg đặt mua.","disabled":false,"_migration_source":"alumdoor-item-standardization-2026-07-30"}')
ON CONFLICT(tenant_id,doc_key) DO UPDATE SET
  payload_json=json_patch(documents.payload_json,excluded.payload_json),
  modified_at=excluded.modified_at,
  modified_by=excluded.modified_by,
  version=documents.version+1
WHERE documents.payload_json<>json_patch(documents.payload_json,excluded.payload_json);

INSERT INTO document_search(tenant_id,doctype,name,title,content,modified_at)
VALUES('alu','Material Specification','ĐM-RON-DD','Định mức RON ĐÁY ĐỨC','ĐM-RON-DD RON-DD  0.117 kg/m','2026-07-30T16:30:00.000Z')
ON CONFLICT(tenant_id,doctype,name) DO UPDATE SET
  title=excluded.title,
  content=excluded.content,
  modified_at=excluded.modified_at
WHERE document_search.title<>excluded.title
   OR document_search.content<>excluded.content;

INSERT INTO documents
  (tenant_id,doc_key,doctype,name,owner,docstatus,status,version,created_at,modified_at,modified_by,payload_json)
VALUES
  ('alu','Item:RON-DD','Item','RON-DD','admin',0,'Draft',1,'2026-07-30T16:30:00.000Z','2026-07-30T16:30:00.000Z','admin','{"item_code":"RON-DD","item_name":"RON ĐÁY ĐỨC","item_group":"Phụ kiện","item_nature":"Hàng tồn kho","material_stage":"Nguyên vật liệu","supply_type":"Mua ngoài","is_stock_item":true,"is_purchase_item":true,"is_sales_item":true,"include_item_in_manufacturing":true,"inventory_mode":"Hàng thường","measurement_profile":"Hàng thường","stock_uom":"Kg","default_purchase_uom":"Kg","default_sales_uom":"Mét","uom_conversions":[{"row_id":"UOM-MÉT","uom":"Mét","conversion_factor":0.117}],"material_specification":"ĐM-RON-DD","valuation_method":"FIFO","has_batch_no":false,"has_serial_no":false,"allow_negative_stock":false,"description":"Vật tư nguyên tử; mua và tồn theo Kg. Nguồn alumdoor-uom-correction-2026-07-28.sql. Định mức kg/m chỉ là dữ liệu đối chiếu, không tự tính số lượng mua hoặc tồn.","disabled":false,"_migration_source":"alumdoor-item-standardization-2026-07-30"}')
ON CONFLICT(tenant_id,doc_key) DO UPDATE SET
  payload_json=json_patch(documents.payload_json,excluded.payload_json),
  modified_at=excluded.modified_at,
  modified_by=excluded.modified_by,
  version=documents.version+1
WHERE documents.payload_json<>json_patch(documents.payload_json,excluded.payload_json);

INSERT INTO document_search(tenant_id,doctype,name,title,content,modified_at)
VALUES('alu','Item','RON-DD','RON ĐÁY ĐỨC','RON-DD RON ĐÁY ĐỨC Phụ kiện Kg ','2026-07-30T16:30:00.000Z')
ON CONFLICT(tenant_id,doctype,name) DO UPDATE SET
  title=excluded.title,
  content=excluded.content,
  modified_at=excluded.modified_at
WHERE document_search.title<>excluded.title
   OR document_search.content<>excluded.content;

INSERT INTO documents
  (tenant_id,doc_key,doctype,name,owner,docstatus,status,version,created_at,modified_at,modified_by,payload_json)
VALUES
  ('alu','Material Specification:ĐM-RNHUA-DR','Material Specification','ĐM-RNHUA-DR','admin',0,'Draft',1,'2026-07-30T16:30:00.000Z','2026-07-30T16:30:00.000Z','admin','{"spec_code":"ĐM-RNHUA-DR","spec_name":"Định mức RON NHỰA","profile_system":"Alumdoor","section_code":"RNHUA-DR","theoretical_kg_per_m":0.263,"note":"Định mức xác nhận: 0.263 kg/m. Chỉ lưu để đối chiếu và quy đổi đơn vị; không tự sinh số kg đặt mua.","disabled":false,"_migration_source":"alumdoor-item-standardization-2026-07-30"}')
ON CONFLICT(tenant_id,doc_key) DO UPDATE SET
  payload_json=json_patch(documents.payload_json,excluded.payload_json),
  modified_at=excluded.modified_at,
  modified_by=excluded.modified_by,
  version=documents.version+1
WHERE documents.payload_json<>json_patch(documents.payload_json,excluded.payload_json);

INSERT INTO document_search(tenant_id,doctype,name,title,content,modified_at)
VALUES('alu','Material Specification','ĐM-RNHUA-DR','Định mức RON NHỰA','ĐM-RNHUA-DR RNHUA-DR  0.263 kg/m','2026-07-30T16:30:00.000Z')
ON CONFLICT(tenant_id,doctype,name) DO UPDATE SET
  title=excluded.title,
  content=excluded.content,
  modified_at=excluded.modified_at
WHERE document_search.title<>excluded.title
   OR document_search.content<>excluded.content;

INSERT INTO documents
  (tenant_id,doc_key,doctype,name,owner,docstatus,status,version,created_at,modified_at,modified_by,payload_json)
VALUES
  ('alu','Item:RNHUA-DR','Item','RNHUA-DR','admin',0,'Draft',1,'2026-07-30T16:30:00.000Z','2026-07-30T16:30:00.000Z','admin','{"item_code":"RNHUA-DR","item_name":"RON NHỰA","item_group":"Phụ kiện","item_nature":"Hàng tồn kho","material_stage":"Nguyên vật liệu","supply_type":"Mua ngoài","is_stock_item":true,"is_purchase_item":true,"is_sales_item":true,"include_item_in_manufacturing":true,"inventory_mode":"Hàng thường","measurement_profile":"Hàng thường","stock_uom":"Kg","default_purchase_uom":"Kg","default_sales_uom":"Mét","uom_conversions":[{"row_id":"UOM-MÉT","uom":"Mét","conversion_factor":0.263}],"material_specification":"ĐM-RNHUA-DR","valuation_method":"FIFO","has_batch_no":false,"has_serial_no":false,"allow_negative_stock":false,"description":"Vật tư nguyên tử; mua và tồn theo Kg. Nguồn BRD Q8: chốt định mức ron nhựa 0,263 kg/m. Định mức kg/m chỉ là dữ liệu đối chiếu, không tự tính số lượng mua hoặc tồn.","disabled":false,"_migration_source":"alumdoor-item-standardization-2026-07-30"}')
ON CONFLICT(tenant_id,doc_key) DO UPDATE SET
  payload_json=json_patch(documents.payload_json,excluded.payload_json),
  modified_at=excluded.modified_at,
  modified_by=excluded.modified_by,
  version=documents.version+1
WHERE documents.payload_json<>json_patch(documents.payload_json,excluded.payload_json);

INSERT INTO document_search(tenant_id,doctype,name,title,content,modified_at)
VALUES('alu','Item','RNHUA-DR','RON NHỰA','RNHUA-DR RON NHỰA Phụ kiện Kg ','2026-07-30T16:30:00.000Z')
ON CONFLICT(tenant_id,doctype,name) DO UPDATE SET
  title=excluded.title,
  content=excluded.content,
  modified_at=excluded.modified_at
WHERE document_search.title<>excluded.title
   OR document_search.content<>excluded.content;

INSERT INTO documents
  (tenant_id,doc_key,doctype,name,owner,docstatus,status,version,created_at,modified_at,modified_by,payload_json)
VALUES
  ('alu','Material Specification:ĐM-RNINOX-DR','Material Specification','ĐM-RNINOX-DR','admin',0,'Draft',1,'2026-07-30T16:30:00.000Z','2026-07-30T16:30:00.000Z','admin','{"spec_code":"ĐM-RNINOX-DR","spec_name":"Định mức RON INOX","profile_system":"Alumdoor","section_code":"RNINOX-DR","theoretical_kg_per_m":0.124,"note":"Định mức xác nhận: 0.124 kg/m. Chỉ lưu để đối chiếu và quy đổi đơn vị; không tự sinh số kg đặt mua.","disabled":false,"_migration_source":"alumdoor-item-standardization-2026-07-30"}')
ON CONFLICT(tenant_id,doc_key) DO UPDATE SET
  payload_json=json_patch(documents.payload_json,excluded.payload_json),
  modified_at=excluded.modified_at,
  modified_by=excluded.modified_by,
  version=documents.version+1
WHERE documents.payload_json<>json_patch(documents.payload_json,excluded.payload_json);

INSERT INTO document_search(tenant_id,doctype,name,title,content,modified_at)
VALUES('alu','Material Specification','ĐM-RNINOX-DR','Định mức RON INOX','ĐM-RNINOX-DR RNINOX-DR  0.124 kg/m','2026-07-30T16:30:00.000Z')
ON CONFLICT(tenant_id,doctype,name) DO UPDATE SET
  title=excluded.title,
  content=excluded.content,
  modified_at=excluded.modified_at
WHERE document_search.title<>excluded.title
   OR document_search.content<>excluded.content;

INSERT INTO documents
  (tenant_id,doc_key,doctype,name,owner,docstatus,status,version,created_at,modified_at,modified_by,payload_json)
VALUES
  ('alu','Item:RNINOX-DR','Item','RNINOX-DR','admin',0,'Draft',1,'2026-07-30T16:30:00.000Z','2026-07-30T16:30:00.000Z','admin','{"item_code":"RNINOX-DR","item_name":"RON INOX","item_group":"Phụ kiện","item_nature":"Hàng tồn kho","material_stage":"Nguyên vật liệu","supply_type":"Mua ngoài","is_stock_item":true,"is_purchase_item":true,"is_sales_item":true,"include_item_in_manufacturing":true,"inventory_mode":"Hàng thường","measurement_profile":"Hàng thường","stock_uom":"Kg","default_purchase_uom":"Kg","default_sales_uom":"Mét","uom_conversions":[{"row_id":"UOM-MÉT","uom":"Mét","conversion_factor":0.124}],"material_specification":"ĐM-RNINOX-DR","valuation_method":"FIFO","has_batch_no":false,"has_serial_no":false,"allow_negative_stock":false,"description":"Vật tư nguyên tử; mua và tồn theo Kg. Nguồn BRD: chốt định mức ron inox 0,124 kg/m. Định mức kg/m chỉ là dữ liệu đối chiếu, không tự tính số lượng mua hoặc tồn.","disabled":false,"_migration_source":"alumdoor-item-standardization-2026-07-30"}')
ON CONFLICT(tenant_id,doc_key) DO UPDATE SET
  payload_json=json_patch(documents.payload_json,excluded.payload_json),
  modified_at=excluded.modified_at,
  modified_by=excluded.modified_by,
  version=documents.version+1
WHERE documents.payload_json<>json_patch(documents.payload_json,excluded.payload_json);

INSERT INTO document_search(tenant_id,doctype,name,title,content,modified_at)
VALUES('alu','Item','RNINOX-DR','RON INOX','RNINOX-DR RON INOX Phụ kiện Kg ','2026-07-30T16:30:00.000Z')
ON CONFLICT(tenant_id,doctype,name) DO UPDATE SET
  title=excluded.title,
  content=excluded.content,
  modified_at=excluded.modified_at
WHERE document_search.title<>excluded.title
   OR document_search.content<>excluded.content;

INSERT INTO documents
  (tenant_id,doc_key,doctype,name,owner,docstatus,status,version,created_at,modified_at,modified_by,payload_json)
VALUES
  ('alu','Material Specification:ĐM-TRỤC 114_1.8LY','Material Specification','ĐM-TRỤC 114_1.8LY','admin',0,'Draft',1,'2026-07-30T16:30:00.000Z','2026-07-30T16:30:00.000Z','admin','{"spec_code":"ĐM-TRỤC 114_1.8LY","spec_name":"Định mức TRỤC 114_1.8LY","profile_system":"Alumdoor","section_code":"TRỤC 114_1.8LY","theoretical_kg_per_m":4.4,"note":"Định mức xác nhận: 4.4 kg/m. Chỉ lưu để đối chiếu và quy đổi đơn vị; không tự sinh số kg đặt mua.","disabled":false,"_migration_source":"alumdoor-item-standardization-2026-07-30"}')
ON CONFLICT(tenant_id,doc_key) DO UPDATE SET
  payload_json=json_patch(documents.payload_json,excluded.payload_json),
  modified_at=excluded.modified_at,
  modified_by=excluded.modified_by,
  version=documents.version+1
WHERE documents.payload_json<>json_patch(documents.payload_json,excluded.payload_json);

INSERT INTO document_search(tenant_id,doctype,name,title,content,modified_at)
VALUES('alu','Material Specification','ĐM-TRỤC 114_1.8LY','Định mức TRỤC 114_1.8LY','ĐM-TRỤC 114_1.8LY TRỤC 114_1.8LY  4.4 kg/m','2026-07-30T16:30:00.000Z')
ON CONFLICT(tenant_id,doctype,name) DO UPDATE SET
  title=excluded.title,
  content=excluded.content,
  modified_at=excluded.modified_at
WHERE document_search.title<>excluded.title
   OR document_search.content<>excluded.content;

INSERT INTO documents
  (tenant_id,doc_key,doctype,name,owner,docstatus,status,version,created_at,modified_at,modified_by,payload_json)
VALUES
  ('alu','Item:TRỤC 114_1.8LY','Item','TRỤC 114_1.8LY','admin',0,'Draft',1,'2026-07-30T16:30:00.000Z','2026-07-30T16:30:00.000Z','admin','{"item_code":"TRỤC 114_1.8LY","item_name":"TRỤC 114_1.8LY","item_group":"Ray và trục","item_nature":"Hàng tồn kho","material_stage":"Nguyên vật liệu","supply_type":"Mua ngoài","is_stock_item":true,"is_purchase_item":true,"is_sales_item":true,"include_item_in_manufacturing":true,"inventory_mode":"Nhôm cây/lá","measurement_profile":"Nhôm cây/lá","stock_uom":"Kg","default_purchase_uom":"Kg","default_sales_uom":"Mét","uom_conversions":[{"row_id":"UOM-MÉT","uom":"Mét","conversion_factor":4.4}],"material_specification":"ĐM-TRỤC 114_1.8LY","valuation_method":"FIFO","has_batch_no":false,"has_serial_no":false,"allow_negative_stock":false,"description":"Vật tư nguyên tử; mua và tồn theo Kg. Nguồn alumdoor-uom-correction-2026-07-28.sql. Định mức kg/m chỉ là dữ liệu đối chiếu, không tự tính số lượng mua hoặc tồn.","disabled":false,"_migration_source":"alumdoor-item-standardization-2026-07-30"}')
ON CONFLICT(tenant_id,doc_key) DO UPDATE SET
  payload_json=json_patch(documents.payload_json,excluded.payload_json),
  modified_at=excluded.modified_at,
  modified_by=excluded.modified_by,
  version=documents.version+1
WHERE documents.payload_json<>json_patch(documents.payload_json,excluded.payload_json);

INSERT INTO document_search(tenant_id,doctype,name,title,content,modified_at)
VALUES('alu','Item','TRỤC 114_1.8LY','TRỤC 114_1.8LY','TRỤC 114_1.8LY TRỤC 114_1.8LY Ray và trục Kg ','2026-07-30T16:30:00.000Z')
ON CONFLICT(tenant_id,doctype,name) DO UPDATE SET
  title=excluded.title,
  content=excluded.content,
  modified_at=excluded.modified_at
WHERE document_search.title<>excluded.title
   OR document_search.content<>excluded.content;

INSERT INTO documents
  (tenant_id,doc_key,doctype,name,owner,docstatus,status,version,created_at,modified_at,modified_by,payload_json)
VALUES
  ('alu','Material Specification:ĐM-TRỤC 114_2.1LY','Material Specification','ĐM-TRỤC 114_2.1LY','admin',0,'Draft',1,'2026-07-30T16:30:00.000Z','2026-07-30T16:30:00.000Z','admin','{"spec_code":"ĐM-TRỤC 114_2.1LY","spec_name":"Định mức TRỤC 114_2.1LY","profile_system":"Alumdoor","section_code":"TRỤC 114_2.1LY","theoretical_kg_per_m":4.7,"note":"Định mức xác nhận: 4.7 kg/m. Chỉ lưu để đối chiếu và quy đổi đơn vị; không tự sinh số kg đặt mua.","disabled":false,"_migration_source":"alumdoor-item-standardization-2026-07-30"}')
ON CONFLICT(tenant_id,doc_key) DO UPDATE SET
  payload_json=json_patch(documents.payload_json,excluded.payload_json),
  modified_at=excluded.modified_at,
  modified_by=excluded.modified_by,
  version=documents.version+1
WHERE documents.payload_json<>json_patch(documents.payload_json,excluded.payload_json);

INSERT INTO document_search(tenant_id,doctype,name,title,content,modified_at)
VALUES('alu','Material Specification','ĐM-TRỤC 114_2.1LY','Định mức TRỤC 114_2.1LY','ĐM-TRỤC 114_2.1LY TRỤC 114_2.1LY  4.7 kg/m','2026-07-30T16:30:00.000Z')
ON CONFLICT(tenant_id,doctype,name) DO UPDATE SET
  title=excluded.title,
  content=excluded.content,
  modified_at=excluded.modified_at
WHERE document_search.title<>excluded.title
   OR document_search.content<>excluded.content;

INSERT INTO documents
  (tenant_id,doc_key,doctype,name,owner,docstatus,status,version,created_at,modified_at,modified_by,payload_json)
VALUES
  ('alu','Item:TRỤC 114_2.1LY','Item','TRỤC 114_2.1LY','admin',0,'Draft',1,'2026-07-30T16:30:00.000Z','2026-07-30T16:30:00.000Z','admin','{"item_code":"TRỤC 114_2.1LY","item_name":"TRỤC 114_2.1LY","item_group":"Ray và trục","item_nature":"Hàng tồn kho","material_stage":"Nguyên vật liệu","supply_type":"Mua ngoài","is_stock_item":true,"is_purchase_item":true,"is_sales_item":true,"include_item_in_manufacturing":true,"inventory_mode":"Nhôm cây/lá","measurement_profile":"Nhôm cây/lá","stock_uom":"Kg","default_purchase_uom":"Kg","default_sales_uom":"Mét","uom_conversions":[{"row_id":"UOM-MÉT","uom":"Mét","conversion_factor":4.7}],"material_specification":"ĐM-TRỤC 114_2.1LY","valuation_method":"FIFO","has_batch_no":false,"has_serial_no":false,"allow_negative_stock":false,"description":"Vật tư nguyên tử; mua và tồn theo Kg. Nguồn alumdoor-uom-correction-2026-07-28.sql. Định mức kg/m chỉ là dữ liệu đối chiếu, không tự tính số lượng mua hoặc tồn.","disabled":false,"_migration_source":"alumdoor-item-standardization-2026-07-30"}')
ON CONFLICT(tenant_id,doc_key) DO UPDATE SET
  payload_json=json_patch(documents.payload_json,excluded.payload_json),
  modified_at=excluded.modified_at,
  modified_by=excluded.modified_by,
  version=documents.version+1
WHERE documents.payload_json<>json_patch(documents.payload_json,excluded.payload_json);

INSERT INTO document_search(tenant_id,doctype,name,title,content,modified_at)
VALUES('alu','Item','TRỤC 114_2.1LY','TRỤC 114_2.1LY','TRỤC 114_2.1LY TRỤC 114_2.1LY Ray và trục Kg ','2026-07-30T16:30:00.000Z')
ON CONFLICT(tenant_id,doctype,name) DO UPDATE SET
  title=excluded.title,
  content=excluded.content,
  modified_at=excluded.modified_at
WHERE document_search.title<>excluded.title
   OR document_search.content<>excluded.content;

UPDATE documents
SET payload_json=json_set(payload_json,'$.uom','Mét'),
    modified_at='2026-07-30T16:30:00.000Z',
    modified_by='admin',
    version=version+1
WHERE tenant_id='alu'
  AND doctype='Item Price'
  AND json_extract(payload_json,'$.item_code') IN ('TP-TD325', 'TP-TD326', 'TP-TD327', 'TP-A282', 'TP-RAYHOP', 'TP-RAY HỘP TD U100', 'TP-TD87A1 GS', 'RON-DD', 'RNHUA-DR', 'RNINOX-DR', 'TRỤC 114_1.8LY', 'TRỤC 114_2.1LY')
  AND COALESCE(json_extract(payload_json,'$.uom'),'')<>'Mét';

DELETE FROM versions
WHERE tenant_id='alu'
  AND doc_key IN (
    SELECT doc_key FROM documents
    WHERE tenant_id='alu'
      AND (
        (doctype='Item' AND name='RONNHUA_INOX')
        OR (doctype='Item Price' AND json_extract(payload_json,'$.item_code')='RONNHUA_INOX')
      )
  );

DELETE FROM document_comments
WHERE tenant_id='alu'
  AND (
    (doctype='Item' AND name='RONNHUA_INOX')
    OR (doctype='Item Price' AND name IN (
      SELECT name FROM documents
      WHERE tenant_id='alu'
        AND doctype='Item Price'
        AND json_extract(payload_json,'$.item_code')='RONNHUA_INOX'
    ))
  );

DELETE FROM document_shares
WHERE tenant_id='alu'
  AND (
    (doctype='Item' AND name='RONNHUA_INOX')
    OR (doctype='Item Price' AND name IN (
      SELECT name FROM documents
      WHERE tenant_id='alu'
        AND doctype='Item Price'
        AND json_extract(payload_json,'$.item_code')='RONNHUA_INOX'
    ))
  );

DELETE FROM document_tags
WHERE tenant_id='alu'
  AND (
    (doctype='Item' AND name='RONNHUA_INOX')
    OR (doctype='Item Price' AND name IN (
      SELECT name FROM documents
      WHERE tenant_id='alu'
        AND doctype='Item Price'
        AND json_extract(payload_json,'$.item_code')='RONNHUA_INOX'
    ))
  );

DELETE FROM assignments
WHERE tenant_id='alu'
  AND (
    (doctype='Item' AND name='RONNHUA_INOX')
    OR (doctype='Item Price' AND name IN (
      SELECT name FROM documents
      WHERE tenant_id='alu'
        AND doctype='Item Price'
        AND json_extract(payload_json,'$.item_code')='RONNHUA_INOX'
    ))
  );

DELETE FROM files
WHERE tenant_id='alu'
  AND (
    (attached_to_doctype='Item' AND attached_to_name='RONNHUA_INOX')
    OR (attached_to_doctype='Item Price' AND attached_to_name IN (
      SELECT name FROM documents
      WHERE tenant_id='alu'
        AND doctype='Item Price'
        AND json_extract(payload_json,'$.item_code')='RONNHUA_INOX'
    ))
  );

DELETE FROM document_search
WHERE tenant_id='alu'
  AND (
    (doctype='Item' AND name='RONNHUA_INOX')
    OR (doctype='Item Price' AND name IN (
      SELECT name FROM documents
      WHERE tenant_id='alu'
        AND doctype='Item Price'
        AND json_extract(payload_json,'$.item_code')='RONNHUA_INOX'
    ))
  );

DELETE FROM documents
WHERE tenant_id='alu'
  AND doctype='Item Price'
  AND json_extract(payload_json,'$.item_code')='RONNHUA_INOX';

DELETE FROM documents
WHERE tenant_id='alu'
  AND doctype='Item'
  AND name='RONNHUA_INOX';

DELETE FROM versions
WHERE tenant_id='alu'
  AND doc_key IN (
    SELECT doc_key FROM documents
    WHERE tenant_id='alu'
      AND (
        (doctype='Item' AND name='TP-BO3LADAY')
        OR (doctype='Item Price' AND json_extract(payload_json,'$.item_code')='TP-BO3LADAY')
      )
  );

DELETE FROM document_comments
WHERE tenant_id='alu'
  AND (
    (doctype='Item' AND name='TP-BO3LADAY')
    OR (doctype='Item Price' AND name IN (
      SELECT name FROM documents
      WHERE tenant_id='alu'
        AND doctype='Item Price'
        AND json_extract(payload_json,'$.item_code')='TP-BO3LADAY'
    ))
  );

DELETE FROM document_shares
WHERE tenant_id='alu'
  AND (
    (doctype='Item' AND name='TP-BO3LADAY')
    OR (doctype='Item Price' AND name IN (
      SELECT name FROM documents
      WHERE tenant_id='alu'
        AND doctype='Item Price'
        AND json_extract(payload_json,'$.item_code')='TP-BO3LADAY'
    ))
  );

DELETE FROM document_tags
WHERE tenant_id='alu'
  AND (
    (doctype='Item' AND name='TP-BO3LADAY')
    OR (doctype='Item Price' AND name IN (
      SELECT name FROM documents
      WHERE tenant_id='alu'
        AND doctype='Item Price'
        AND json_extract(payload_json,'$.item_code')='TP-BO3LADAY'
    ))
  );

DELETE FROM assignments
WHERE tenant_id='alu'
  AND (
    (doctype='Item' AND name='TP-BO3LADAY')
    OR (doctype='Item Price' AND name IN (
      SELECT name FROM documents
      WHERE tenant_id='alu'
        AND doctype='Item Price'
        AND json_extract(payload_json,'$.item_code')='TP-BO3LADAY'
    ))
  );

DELETE FROM files
WHERE tenant_id='alu'
  AND (
    (attached_to_doctype='Item' AND attached_to_name='TP-BO3LADAY')
    OR (attached_to_doctype='Item Price' AND attached_to_name IN (
      SELECT name FROM documents
      WHERE tenant_id='alu'
        AND doctype='Item Price'
        AND json_extract(payload_json,'$.item_code')='TP-BO3LADAY'
    ))
  );

DELETE FROM document_search
WHERE tenant_id='alu'
  AND (
    (doctype='Item' AND name='TP-BO3LADAY')
    OR (doctype='Item Price' AND name IN (
      SELECT name FROM documents
      WHERE tenant_id='alu'
        AND doctype='Item Price'
        AND json_extract(payload_json,'$.item_code')='TP-BO3LADAY'
    ))
  );

DELETE FROM documents
WHERE tenant_id='alu'
  AND doctype='Item Price'
  AND json_extract(payload_json,'$.item_code')='TP-BO3LADAY';

DELETE FROM documents
WHERE tenant_id='alu'
  AND doctype='Item'
  AND name='TP-BO3LADAY';

INSERT INTO documents
  (tenant_id,doc_key,doctype,name,owner,docstatus,status,version,created_at,modified_at,modified_by,payload_json)
SELECT
  tenant_id,
  'Aluminium Lot:' || name || '-TD325',
  'Aluminium Lot',
  name || '-TD325',
  owner,
  docstatus,
  status,
  1,
  created_at,
  '2026-07-30T16:30:00.000Z',
  'admin',
  json_set(
    payload_json,
    '$.profile','TP-TD325',
    '$.legacy_parent_lot',name,
    '$.legacy_component_split',json('true'),
    '$.note','Tách từ lô bộ cũ; 1 bộ = 1 cái TP-TD325. ĐVT nhập/tồn của mặt hàng vẫn là Kg.',
    '$._migration_source','alumdoor-item-standardization-2026-07-30'
  )
FROM documents
WHERE tenant_id='alu'
  AND doctype='Aluminium Lot'
  AND json_extract(payload_json,'$.profile')='BỘ BA LÁ ĐÁY + LÁ ĐẦU'
ON CONFLICT(tenant_id,doc_key) DO UPDATE SET
  payload_json=excluded.payload_json,
  modified_at=excluded.modified_at,
  modified_by=excluded.modified_by,
  version=documents.version+1
WHERE documents.payload_json<>excluded.payload_json;

INSERT INTO document_search(tenant_id,doctype,name,title,content,modified_at)
SELECT
  tenant_id,
  'Aluminium Lot',
  name || '-TD325',
  'TP-TD325' || ' · ' || COALESCE(json_extract(payload_json,'$.colour'),'') || ' · ' || COALESCE(json_extract(payload_json,'$.width_m'),'') || ' m',
  'TP-TD325' || ' ' || COALESCE(json_extract(payload_json,'$.colour'),'') || ' '
    || COALESCE(json_extract(payload_json,'$.generation'),'') || ' '
    || COALESCE(json_extract(payload_json,'$.width_m'),'') || ' '
    || COALESCE(json_extract(payload_json,'$.warehouse'),'') || ' '
    || COALESCE(json_extract(payload_json,'$.quality_status'),''),
  '2026-07-30T16:30:00.000Z'
FROM documents
WHERE tenant_id='alu'
  AND doctype='Aluminium Lot'
  AND json_extract(payload_json,'$.profile')='BỘ BA LÁ ĐÁY + LÁ ĐẦU'
ON CONFLICT(tenant_id,doctype,name) DO UPDATE SET
  title=excluded.title,
  content=excluded.content,
  modified_at=excluded.modified_at
WHERE document_search.title<>excluded.title
   OR document_search.content<>excluded.content;

INSERT INTO documents
  (tenant_id,doc_key,doctype,name,owner,docstatus,status,version,created_at,modified_at,modified_by,payload_json)
SELECT
  tenant_id,
  'Aluminium Lot:' || name || '-TD326',
  'Aluminium Lot',
  name || '-TD326',
  owner,
  docstatus,
  status,
  1,
  created_at,
  '2026-07-30T16:30:00.000Z',
  'admin',
  json_set(
    payload_json,
    '$.profile','TP-TD326',
    '$.legacy_parent_lot',name,
    '$.legacy_component_split',json('true'),
    '$.note','Tách từ lô bộ cũ; 1 bộ = 1 cái TP-TD326. ĐVT nhập/tồn của mặt hàng vẫn là Kg.',
    '$._migration_source','alumdoor-item-standardization-2026-07-30'
  )
FROM documents
WHERE tenant_id='alu'
  AND doctype='Aluminium Lot'
  AND json_extract(payload_json,'$.profile')='BỘ BA LÁ ĐÁY + LÁ ĐẦU'
ON CONFLICT(tenant_id,doc_key) DO UPDATE SET
  payload_json=excluded.payload_json,
  modified_at=excluded.modified_at,
  modified_by=excluded.modified_by,
  version=documents.version+1
WHERE documents.payload_json<>excluded.payload_json;

INSERT INTO document_search(tenant_id,doctype,name,title,content,modified_at)
SELECT
  tenant_id,
  'Aluminium Lot',
  name || '-TD326',
  'TP-TD326' || ' · ' || COALESCE(json_extract(payload_json,'$.colour'),'') || ' · ' || COALESCE(json_extract(payload_json,'$.width_m'),'') || ' m',
  'TP-TD326' || ' ' || COALESCE(json_extract(payload_json,'$.colour'),'') || ' '
    || COALESCE(json_extract(payload_json,'$.generation'),'') || ' '
    || COALESCE(json_extract(payload_json,'$.width_m'),'') || ' '
    || COALESCE(json_extract(payload_json,'$.warehouse'),'') || ' '
    || COALESCE(json_extract(payload_json,'$.quality_status'),''),
  '2026-07-30T16:30:00.000Z'
FROM documents
WHERE tenant_id='alu'
  AND doctype='Aluminium Lot'
  AND json_extract(payload_json,'$.profile')='BỘ BA LÁ ĐÁY + LÁ ĐẦU'
ON CONFLICT(tenant_id,doctype,name) DO UPDATE SET
  title=excluded.title,
  content=excluded.content,
  modified_at=excluded.modified_at
WHERE document_search.title<>excluded.title
   OR document_search.content<>excluded.content;

INSERT INTO documents
  (tenant_id,doc_key,doctype,name,owner,docstatus,status,version,created_at,modified_at,modified_by,payload_json)
SELECT
  tenant_id,
  'Aluminium Lot:' || name || '-TD327',
  'Aluminium Lot',
  name || '-TD327',
  owner,
  docstatus,
  status,
  1,
  created_at,
  '2026-07-30T16:30:00.000Z',
  'admin',
  json_set(
    payload_json,
    '$.profile','TP-TD327',
    '$.legacy_parent_lot',name,
    '$.legacy_component_split',json('true'),
    '$.note','Tách từ lô bộ cũ; 1 bộ = 1 cái TP-TD327. ĐVT nhập/tồn của mặt hàng vẫn là Kg.',
    '$._migration_source','alumdoor-item-standardization-2026-07-30'
  )
FROM documents
WHERE tenant_id='alu'
  AND doctype='Aluminium Lot'
  AND json_extract(payload_json,'$.profile')='BỘ BA LÁ ĐÁY + LÁ ĐẦU'
ON CONFLICT(tenant_id,doc_key) DO UPDATE SET
  payload_json=excluded.payload_json,
  modified_at=excluded.modified_at,
  modified_by=excluded.modified_by,
  version=documents.version+1
WHERE documents.payload_json<>excluded.payload_json;

INSERT INTO document_search(tenant_id,doctype,name,title,content,modified_at)
SELECT
  tenant_id,
  'Aluminium Lot',
  name || '-TD327',
  'TP-TD327' || ' · ' || COALESCE(json_extract(payload_json,'$.colour'),'') || ' · ' || COALESCE(json_extract(payload_json,'$.width_m'),'') || ' m',
  'TP-TD327' || ' ' || COALESCE(json_extract(payload_json,'$.colour'),'') || ' '
    || COALESCE(json_extract(payload_json,'$.generation'),'') || ' '
    || COALESCE(json_extract(payload_json,'$.width_m'),'') || ' '
    || COALESCE(json_extract(payload_json,'$.warehouse'),'') || ' '
    || COALESCE(json_extract(payload_json,'$.quality_status'),''),
  '2026-07-30T16:30:00.000Z'
FROM documents
WHERE tenant_id='alu'
  AND doctype='Aluminium Lot'
  AND json_extract(payload_json,'$.profile')='BỘ BA LÁ ĐÁY + LÁ ĐẦU'
ON CONFLICT(tenant_id,doctype,name) DO UPDATE SET
  title=excluded.title,
  content=excluded.content,
  modified_at=excluded.modified_at
WHERE document_search.title<>excluded.title
   OR document_search.content<>excluded.content;

INSERT INTO documents
  (tenant_id,doc_key,doctype,name,owner,docstatus,status,version,created_at,modified_at,modified_by,payload_json)
SELECT
  tenant_id,
  'Aluminium Lot:' || name || '-A282',
  'Aluminium Lot',
  name || '-A282',
  owner,
  docstatus,
  status,
  1,
  created_at,
  '2026-07-30T16:30:00.000Z',
  'admin',
  json_set(
    payload_json,
    '$.profile','TP-A282',
    '$.legacy_parent_lot',name,
    '$.legacy_component_split',json('true'),
    '$.note','Tách từ lô bộ cũ; 1 bộ = 1 cái TP-A282. ĐVT nhập/tồn của mặt hàng vẫn là Kg.',
    '$._migration_source','alumdoor-item-standardization-2026-07-30'
  )
FROM documents
WHERE tenant_id='alu'
  AND doctype='Aluminium Lot'
  AND json_extract(payload_json,'$.profile')='BỘ BA LÁ ĐÁY + LÁ ĐẦU'
ON CONFLICT(tenant_id,doc_key) DO UPDATE SET
  payload_json=excluded.payload_json,
  modified_at=excluded.modified_at,
  modified_by=excluded.modified_by,
  version=documents.version+1
WHERE documents.payload_json<>excluded.payload_json;

INSERT INTO document_search(tenant_id,doctype,name,title,content,modified_at)
SELECT
  tenant_id,
  'Aluminium Lot',
  name || '-A282',
  'TP-A282' || ' · ' || COALESCE(json_extract(payload_json,'$.colour'),'') || ' · ' || COALESCE(json_extract(payload_json,'$.width_m'),'') || ' m',
  'TP-A282' || ' ' || COALESCE(json_extract(payload_json,'$.colour'),'') || ' '
    || COALESCE(json_extract(payload_json,'$.generation'),'') || ' '
    || COALESCE(json_extract(payload_json,'$.width_m'),'') || ' '
    || COALESCE(json_extract(payload_json,'$.warehouse'),'') || ' '
    || COALESCE(json_extract(payload_json,'$.quality_status'),''),
  '2026-07-30T16:30:00.000Z'
FROM documents
WHERE tenant_id='alu'
  AND doctype='Aluminium Lot'
  AND json_extract(payload_json,'$.profile')='BỘ BA LÁ ĐÁY + LÁ ĐẦU'
ON CONFLICT(tenant_id,doctype,name) DO UPDATE SET
  title=excluded.title,
  content=excluded.content,
  modified_at=excluded.modified_at
WHERE document_search.title<>excluded.title
   OR document_search.content<>excluded.content;

DELETE FROM versions
WHERE tenant_id='alu'
  AND doc_key IN (
    SELECT doc_key FROM documents
    WHERE tenant_id='alu'
      AND doctype='Aluminium Lot'
      AND json_extract(payload_json,'$.profile')='BỘ BA LÁ ĐÁY + LÁ ĐẦU'
  );

DELETE FROM document_comments
WHERE tenant_id='alu'
  AND doctype='Aluminium Lot'
  AND name IN (
    SELECT name FROM documents
    WHERE tenant_id='alu'
      AND doctype='Aluminium Lot'
      AND json_extract(payload_json,'$.profile')='BỘ BA LÁ ĐÁY + LÁ ĐẦU'
  );

DELETE FROM document_shares
WHERE tenant_id='alu'
  AND doctype='Aluminium Lot'
  AND name IN (
    SELECT name FROM documents
    WHERE tenant_id='alu'
      AND doctype='Aluminium Lot'
      AND json_extract(payload_json,'$.profile')='BỘ BA LÁ ĐÁY + LÁ ĐẦU'
  );

DELETE FROM document_tags
WHERE tenant_id='alu'
  AND doctype='Aluminium Lot'
  AND name IN (
    SELECT name FROM documents
    WHERE tenant_id='alu'
      AND doctype='Aluminium Lot'
      AND json_extract(payload_json,'$.profile')='BỘ BA LÁ ĐÁY + LÁ ĐẦU'
  );

DELETE FROM assignments
WHERE tenant_id='alu'
  AND doctype='Aluminium Lot'
  AND name IN (
    SELECT name FROM documents
    WHERE tenant_id='alu'
      AND doctype='Aluminium Lot'
      AND json_extract(payload_json,'$.profile')='BỘ BA LÁ ĐÁY + LÁ ĐẦU'
  );

DELETE FROM files
WHERE tenant_id='alu'
  AND attached_to_doctype='Aluminium Lot'
  AND attached_to_name IN (
    SELECT name FROM documents
    WHERE tenant_id='alu'
      AND doctype='Aluminium Lot'
      AND json_extract(payload_json,'$.profile')='BỘ BA LÁ ĐÁY + LÁ ĐẦU'
  );

DELETE FROM document_search
WHERE tenant_id='alu'
  AND doctype='Aluminium Lot'
  AND name IN (
    SELECT name FROM documents
    WHERE tenant_id='alu'
      AND doctype='Aluminium Lot'
      AND json_extract(payload_json,'$.profile')='BỘ BA LÁ ĐÁY + LÁ ĐẦU'
  );

DELETE FROM documents
WHERE tenant_id='alu'
  AND doctype='Aluminium Lot'
  AND json_extract(payload_json,'$.profile')='BỘ BA LÁ ĐÁY + LÁ ĐẦU';

DELETE FROM versions
WHERE tenant_id='alu'
  AND doc_key IN (
    SELECT doc_key FROM documents
    WHERE tenant_id='alu'
      AND (
        (doctype='Item' AND name='BỘ BA LÁ ĐÁY + LÁ ĐẦU')
        OR (doctype='Item Price' AND json_extract(payload_json,'$.item_code')='BỘ BA LÁ ĐÁY + LÁ ĐẦU')
      )
  );

DELETE FROM document_comments
WHERE tenant_id='alu'
  AND (
    (doctype='Item' AND name='BỘ BA LÁ ĐÁY + LÁ ĐẦU')
    OR (doctype='Item Price' AND name IN (
      SELECT name FROM documents
      WHERE tenant_id='alu'
        AND doctype='Item Price'
        AND json_extract(payload_json,'$.item_code')='BỘ BA LÁ ĐÁY + LÁ ĐẦU'
    ))
  );

DELETE FROM document_shares
WHERE tenant_id='alu'
  AND (
    (doctype='Item' AND name='BỘ BA LÁ ĐÁY + LÁ ĐẦU')
    OR (doctype='Item Price' AND name IN (
      SELECT name FROM documents
      WHERE tenant_id='alu'
        AND doctype='Item Price'
        AND json_extract(payload_json,'$.item_code')='BỘ BA LÁ ĐÁY + LÁ ĐẦU'
    ))
  );

DELETE FROM document_tags
WHERE tenant_id='alu'
  AND (
    (doctype='Item' AND name='BỘ BA LÁ ĐÁY + LÁ ĐẦU')
    OR (doctype='Item Price' AND name IN (
      SELECT name FROM documents
      WHERE tenant_id='alu'
        AND doctype='Item Price'
        AND json_extract(payload_json,'$.item_code')='BỘ BA LÁ ĐÁY + LÁ ĐẦU'
    ))
  );

DELETE FROM assignments
WHERE tenant_id='alu'
  AND (
    (doctype='Item' AND name='BỘ BA LÁ ĐÁY + LÁ ĐẦU')
    OR (doctype='Item Price' AND name IN (
      SELECT name FROM documents
      WHERE tenant_id='alu'
        AND doctype='Item Price'
        AND json_extract(payload_json,'$.item_code')='BỘ BA LÁ ĐÁY + LÁ ĐẦU'
    ))
  );

DELETE FROM files
WHERE tenant_id='alu'
  AND (
    (attached_to_doctype='Item' AND attached_to_name='BỘ BA LÁ ĐÁY + LÁ ĐẦU')
    OR (attached_to_doctype='Item Price' AND attached_to_name IN (
      SELECT name FROM documents
      WHERE tenant_id='alu'
        AND doctype='Item Price'
        AND json_extract(payload_json,'$.item_code')='BỘ BA LÁ ĐÁY + LÁ ĐẦU'
    ))
  );

DELETE FROM document_search
WHERE tenant_id='alu'
  AND (
    (doctype='Item' AND name='BỘ BA LÁ ĐÁY + LÁ ĐẦU')
    OR (doctype='Item Price' AND name IN (
      SELECT name FROM documents
      WHERE tenant_id='alu'
        AND doctype='Item Price'
        AND json_extract(payload_json,'$.item_code')='BỘ BA LÁ ĐÁY + LÁ ĐẦU'
    ))
  );

DELETE FROM documents
WHERE tenant_id='alu'
  AND doctype='Item Price'
  AND json_extract(payload_json,'$.item_code')='BỘ BA LÁ ĐÁY + LÁ ĐẦU';

DELETE FROM documents
WHERE tenant_id='alu'
  AND doctype='Item'
  AND name='BỘ BA LÁ ĐÁY + LÁ ĐẦU';
