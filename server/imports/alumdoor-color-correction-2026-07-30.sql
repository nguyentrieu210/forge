-- Alumdoor canonical color catalogue correction.
-- Idempotent: upsert 24 canonical colors, normalize legacy lot links, then remove obsolete aliases.

INSERT INTO documents
  (tenant_id,doc_key,doctype,name,owner,docstatus,status,version,created_at,modified_at,modified_by,payload_json)
VALUES
  ('alu','Item Color:THÔ','Item Color','THÔ','admin',0,'Draft',1,'2026-07-30T00:00:00.000Z','2026-07-30T00:00:00.000Z','admin','{"color_code":"THÔ","color_name":"THÔ","finish":"Thô","applies_to_groups":[],"note":"Bảng màu chuẩn do chủ xưởng cung cấp ngày 2026-07-30.","disabled":false,"_migration_source":"alumdoor-color-catalog-2026-07-30"}'),
  ('alu','Item Color:CAFÉ','Item Color','CAFÉ','admin',0,'Draft',1,'2026-07-30T00:00:00.000Z','2026-07-30T00:00:00.000Z','admin','{"color_code":"CAFÉ","color_name":"CAFÉ","finish":"Sơn tĩnh điện","applies_to_groups":[{"row_id":"SCOPE-01","item_group":"Cửa CN Đức"},{"row_id":"SCOPE-02","item_group":"Cửa siêu trường"}],"note":"Màu STĐ áp toàn nhóm Cửa CN Đức/Cửa siêu trường; Cửa Úc, Đài Loan, Lưới và phụ kiện chỉ áp cho từng Item có STĐ/STD.","disabled":false,"_migration_source":"alumdoor-color-catalog-2026-07-30"}'),
  ('alu','Item Color:XANH NGỌC','Item Color','XANH NGỌC','admin',0,'Draft',1,'2026-07-30T00:00:00.000Z','2026-07-30T00:00:00.000Z','admin','{"color_code":"XANH NGỌC","color_name":"XANH NGỌC","finish":"Sơn tĩnh điện","applies_to_groups":[{"row_id":"SCOPE-01","item_group":"Cửa CN Đức"},{"row_id":"SCOPE-02","item_group":"Cửa siêu trường"}],"note":"Màu STĐ áp toàn nhóm Cửa CN Đức/Cửa siêu trường; Cửa Úc, Đài Loan, Lưới và phụ kiện chỉ áp cho từng Item có STĐ/STD.","disabled":false,"_migration_source":"alumdoor-color-catalog-2026-07-30"}'),
  ('alu','Item Color:MIDNIGHT BLUE','Item Color','MIDNIGHT BLUE','admin',0,'Draft',1,'2026-07-30T00:00:00.000Z','2026-07-30T00:00:00.000Z','admin','{"color_code":"MIDNIGHT BLUE","color_name":"MIDNIGHT BLUE","finish":"Sơn tĩnh điện","applies_to_groups":[{"row_id":"SCOPE-01","item_group":"Cửa CN Đức"},{"row_id":"SCOPE-02","item_group":"Cửa siêu trường"}],"note":"Màu STĐ áp toàn nhóm Cửa CN Đức/Cửa siêu trường; Cửa Úc, Đài Loan, Lưới và phụ kiện chỉ áp cho từng Item có STĐ/STD.","disabled":false,"_migration_source":"alumdoor-color-catalog-2026-07-30"}'),
  ('alu','Item Color:TRẮNG','Item Color','TRẮNG','admin',0,'Draft',1,'2026-07-30T00:00:00.000Z','2026-07-30T00:00:00.000Z','admin','{"color_code":"TRẮNG","color_name":"TRẮNG","finish":"Sơn tĩnh điện","applies_to_groups":[{"row_id":"SCOPE-01","item_group":"Cửa CN Đức"},{"row_id":"SCOPE-02","item_group":"Cửa siêu trường"}],"supplier_color_code":"9512","note":"Màu STĐ áp toàn nhóm Cửa CN Đức/Cửa siêu trường; Cửa Úc, Đài Loan, Lưới và phụ kiện chỉ áp cho từng Item có STĐ/STD.","disabled":false,"_migration_source":"alumdoor-color-catalog-2026-07-30"}'),
  ('alu','Item Color:XÁM MỜ','Item Color','XÁM MỜ','admin',0,'Draft',1,'2026-07-30T00:00:00.000Z','2026-07-30T00:00:00.000Z','admin','{"color_code":"XÁM MỜ","color_name":"XÁM MỜ","finish":"Sơn tĩnh điện","applies_to_groups":[{"row_id":"SCOPE-01","item_group":"Cửa CN Đức"},{"row_id":"SCOPE-02","item_group":"Cửa siêu trường"}],"note":"Màu STĐ áp toàn nhóm Cửa CN Đức/Cửa siêu trường; Cửa Úc, Đài Loan, Lưới và phụ kiện chỉ áp cho từng Item có STĐ/STD.","disabled":false,"_migration_source":"alumdoor-color-catalog-2026-07-30"}'),
  ('alu','Item Color:VÀNG KEM','Item Color','VÀNG KEM','admin',0,'Draft',1,'2026-07-30T00:00:00.000Z','2026-07-30T00:00:00.000Z','admin','{"color_code":"VÀNG KEM","color_name":"VÀNG KEM","finish":"Sơn tĩnh điện","applies_to_groups":[{"row_id":"SCOPE-01","item_group":"Cửa CN Đức"},{"row_id":"SCOPE-02","item_group":"Cửa siêu trường"}],"note":"Màu STĐ áp toàn nhóm Cửa CN Đức/Cửa siêu trường; Cửa Úc, Đài Loan, Lưới và phụ kiện chỉ áp cho từng Item có STĐ/STD.","disabled":false,"_migration_source":"alumdoor-color-catalog-2026-07-30"}'),
  ('alu','Item Color:GHI SẦN','Item Color','GHI SẦN','admin',0,'Draft',1,'2026-07-30T00:00:00.000Z','2026-07-30T00:00:00.000Z','admin','{"color_code":"GHI SẦN","color_name":"GHI SẦN","finish":"Sơn tĩnh điện","applies_to_groups":[{"row_id":"SCOPE-01","item_group":"Cửa CN Đức"},{"row_id":"SCOPE-02","item_group":"Cửa siêu trường"}],"note":"Màu STĐ áp toàn nhóm Cửa CN Đức/Cửa siêu trường; Cửa Úc, Đài Loan, Lưới và phụ kiện chỉ áp cho từng Item có STĐ/STD.","disabled":false,"_migration_source":"alumdoor-color-catalog-2026-07-30"}'),
  ('alu','Item Color:NÂU XINGFA','Item Color','NÂU XINGFA','admin',0,'Draft',1,'2026-07-30T00:00:00.000Z','2026-07-30T00:00:00.000Z','admin','{"color_code":"NÂU XINGFA","color_name":"NÂU XINGFA","finish":"Sơn tĩnh điện","applies_to_groups":[{"row_id":"SCOPE-01","item_group":"Cửa CN Đức"},{"row_id":"SCOPE-02","item_group":"Cửa siêu trường"}],"note":"Màu STĐ áp toàn nhóm Cửa CN Đức/Cửa siêu trường; Cửa Úc, Đài Loan, Lưới và phụ kiện chỉ áp cho từng Item có STĐ/STD.","disabled":false,"_migration_source":"alumdoor-color-catalog-2026-07-30"}'),
  ('alu','Item Color:XÁM XINGFA','Item Color','XÁM XINGFA','admin',0,'Draft',1,'2026-07-30T00:00:00.000Z','2026-07-30T00:00:00.000Z','admin','{"color_code":"XÁM XINGFA","color_name":"XÁM XINGFA","finish":"Sơn tĩnh điện","applies_to_groups":[{"row_id":"SCOPE-01","item_group":"Cửa CN Đức"},{"row_id":"SCOPE-02","item_group":"Cửa siêu trường"}],"note":"Màu STĐ áp toàn nhóm Cửa CN Đức/Cửa siêu trường; Cửa Úc, Đài Loan, Lưới và phụ kiện chỉ áp cho từng Item có STĐ/STD.","disabled":false,"_migration_source":"alumdoor-color-catalog-2026-07-30"}'),
  ('alu','Item Color:ĐEN XINGFA','Item Color','ĐEN XINGFA','admin',0,'Draft',1,'2026-07-30T00:00:00.000Z','2026-07-30T00:00:00.000Z','admin','{"color_code":"ĐEN XINGFA","color_name":"ĐEN XINGFA","finish":"Sơn tĩnh điện","applies_to_groups":[{"row_id":"SCOPE-01","item_group":"Cửa CN Đức"},{"row_id":"SCOPE-02","item_group":"Cửa siêu trường"}],"note":"Màu STĐ áp toàn nhóm Cửa CN Đức/Cửa siêu trường; Cửa Úc, Đài Loan, Lưới và phụ kiện chỉ áp cho từng Item có STĐ/STD.","disabled":false,"_migration_source":"alumdoor-color-catalog-2026-07-30"}'),
  ('alu','Item Color:VÀNG KEM BÓNG','Item Color','VÀNG KEM BÓNG','admin',0,'Draft',1,'2026-07-30T00:00:00.000Z','2026-07-30T00:00:00.000Z','admin','{"color_code":"VÀNG KEM BÓNG","color_name":"VÀNG KEM BÓNG","finish":"Sơn tĩnh điện","applies_to_groups":[{"row_id":"SCOPE-01","item_group":"Cửa CN Đức"},{"row_id":"SCOPE-02","item_group":"Cửa siêu trường"}],"note":"Màu STĐ áp toàn nhóm Cửa CN Đức/Cửa siêu trường; Cửa Úc, Đài Loan, Lưới và phụ kiện chỉ áp cho từng Item có STĐ/STD.","disabled":false,"_migration_source":"alumdoor-color-catalog-2026-07-30"}'),
  ('alu','Item Color:XANH NGỌC BÓNG','Item Color','XANH NGỌC BÓNG','admin',0,'Draft',1,'2026-07-30T00:00:00.000Z','2026-07-30T00:00:00.000Z','admin','{"color_code":"XANH NGỌC BÓNG","color_name":"XANH NGỌC BÓNG","finish":"Sơn tĩnh điện","applies_to_groups":[{"row_id":"SCOPE-01","item_group":"Cửa CN Đức"},{"row_id":"SCOPE-02","item_group":"Cửa siêu trường"}],"note":"Màu STĐ áp toàn nhóm Cửa CN Đức/Cửa siêu trường; Cửa Úc, Đài Loan, Lưới và phụ kiện chỉ áp cho từng Item có STĐ/STD.","disabled":false,"_migration_source":"alumdoor-color-catalog-2026-07-30"}'),
  ('alu','Item Color:XANH LÁ CÂY','Item Color','XANH LÁ CÂY','admin',0,'Draft',1,'2026-07-30T00:00:00.000Z','2026-07-30T00:00:00.000Z','admin','{"color_code":"XANH LÁ CÂY","color_name":"XANH LÁ CÂY","finish":"Sơn tĩnh điện","applies_to_groups":[{"row_id":"SCOPE-01","item_group":"Cửa CN Đức"},{"row_id":"SCOPE-02","item_group":"Cửa siêu trường"}],"note":"Màu STĐ áp toàn nhóm Cửa CN Đức/Cửa siêu trường; Cửa Úc, Đài Loan, Lưới và phụ kiện chỉ áp cho từng Item có STĐ/STD.","disabled":false,"_migration_source":"alumdoor-color-catalog-2026-07-30"}'),
  ('alu','Item Color:XÁM LÔNG CHUỘT','Item Color','XÁM LÔNG CHUỘT','admin',0,'Draft',1,'2026-07-30T00:00:00.000Z','2026-07-30T00:00:00.000Z','admin','{"color_code":"XÁM LÔNG CHUỘT","color_name":"XÁM LÔNG CHUỘT","finish":"Sơn tĩnh điện","applies_to_groups":[{"row_id":"SCOPE-01","item_group":"Cửa CN Đức"},{"row_id":"SCOPE-02","item_group":"Cửa siêu trường"}],"note":"Màu STĐ áp toàn nhóm Cửa CN Đức/Cửa siêu trường; Cửa Úc, Đài Loan, Lưới và phụ kiện chỉ áp cho từng Item có STĐ/STD.","disabled":false,"_migration_source":"alumdoor-color-catalog-2026-07-30"}'),
  ('alu','Item Color:CAM','Item Color','CAM','admin',0,'Draft',1,'2026-07-30T00:00:00.000Z','2026-07-30T00:00:00.000Z','admin','{"color_code":"CAM","color_name":"CAM","finish":"Sơn tĩnh điện","applies_to_groups":[{"row_id":"SCOPE-01","item_group":"Cửa CN Đức"},{"row_id":"SCOPE-02","item_group":"Cửa siêu trường"}],"note":"Màu STĐ áp toàn nhóm Cửa CN Đức/Cửa siêu trường; Cửa Úc, Đài Loan, Lưới và phụ kiện chỉ áp cho từng Item có STĐ/STD.","disabled":false,"_migration_source":"alumdoor-color-catalog-2026-07-30"}'),
  ('alu','Item Color:ĐỎ ĐÔ','Item Color','ĐỎ ĐÔ','admin',0,'Draft',1,'2026-07-30T00:00:00.000Z','2026-07-30T00:00:00.000Z','admin','{"color_code":"ĐỎ ĐÔ","color_name":"ĐỎ ĐÔ","finish":"Sơn tĩnh điện","applies_to_groups":[{"row_id":"SCOPE-01","item_group":"Cửa CN Đức"},{"row_id":"SCOPE-02","item_group":"Cửa siêu trường"}],"supplier_color_code":"4004","note":"Màu STĐ áp toàn nhóm Cửa CN Đức/Cửa siêu trường; Cửa Úc, Đài Loan, Lưới và phụ kiện chỉ áp cho từng Item có STĐ/STD.","disabled":false,"_migration_source":"alumdoor-color-catalog-2026-07-30"}'),
  ('alu','Item Color:KEM SỮA','Item Color','KEM SỮA','admin',0,'Draft',1,'2026-07-30T00:00:00.000Z','2026-07-30T00:00:00.000Z','admin','{"color_code":"KEM SỮA","color_name":"KEM SỮA","finish":"Sơn tĩnh điện","applies_to_groups":[{"row_id":"SCOPE-01","item_group":"Cửa CN Đức"},{"row_id":"SCOPE-02","item_group":"Cửa siêu trường"}],"note":"Màu STĐ áp toàn nhóm Cửa CN Đức/Cửa siêu trường; Cửa Úc, Đài Loan, Lưới và phụ kiện chỉ áp cho từng Item có STĐ/STD.","disabled":false,"_migration_source":"alumdoor-color-catalog-2026-07-30"}'),
  ('alu','Item Color:XANH DƯƠNG','Item Color','XANH DƯƠNG','admin',0,'Draft',1,'2026-07-30T00:00:00.000Z','2026-07-30T00:00:00.000Z','admin','{"color_code":"XANH DƯƠNG","color_name":"XANH DƯƠNG","finish":"Sơn tĩnh điện","applies_to_groups":[{"row_id":"SCOPE-01","item_group":"Cửa CN Đức"},{"row_id":"SCOPE-02","item_group":"Cửa siêu trường"}],"note":"Màu STĐ áp toàn nhóm Cửa CN Đức/Cửa siêu trường; Cửa Úc, Đài Loan, Lưới và phụ kiện chỉ áp cho từng Item có STĐ/STD.","disabled":false,"_migration_source":"alumdoor-color-catalog-2026-07-30"}'),
  ('alu','Item Color:XANH NGỌC - VÀNG KEM','Item Color','XANH NGỌC - VÀNG KEM','admin',0,'Draft',1,'2026-07-30T00:00:00.000Z','2026-07-30T00:00:00.000Z','admin','{"color_code":"XANH NGỌC - VÀNG KEM","color_name":"XANH NGỌC - VÀNG KEM","finish":"Mạ","applies_to_groups":[{"row_id":"SCOPE-01","item_group":"Cửa tấm liền Úc"},{"row_id":"SCOPE-02","item_group":"Cửa Đài Loan"}],"note":"Bảng màu chuẩn do chủ xưởng cung cấp ngày 2026-07-30.","disabled":false,"_migration_source":"alumdoor-color-catalog-2026-07-30"}'),
  ('alu','Item Color:XÁM - TRẮNG','Item Color','XÁM - TRẮNG','admin',0,'Draft',1,'2026-07-30T00:00:00.000Z','2026-07-30T00:00:00.000Z','admin','{"color_code":"XÁM - TRẮNG","color_name":"XÁM - TRẮNG","finish":"Mạ","applies_to_groups":[{"row_id":"SCOPE-01","item_group":"Cửa tấm liền Úc"}],"note":"Bảng màu chuẩn do chủ xưởng cung cấp ngày 2026-07-30.","disabled":false,"_migration_source":"alumdoor-color-catalog-2026-07-30"}'),
  ('alu','Item Color:GHI ÚC - KEM ÚC','Item Color','GHI ÚC - KEM ÚC','admin',0,'Draft',1,'2026-07-30T00:00:00.000Z','2026-07-30T00:00:00.000Z','admin','{"color_code":"GHI ÚC - KEM ÚC","color_name":"GHI ÚC - KEM ÚC","finish":"Mạ","applies_to_groups":[{"row_id":"SCOPE-01","item_group":"Cửa tấm liền Úc"}],"note":"Bảng màu chuẩn do chủ xưởng cung cấp ngày 2026-07-30.","disabled":false,"_migration_source":"alumdoor-color-catalog-2026-07-30"}'),
  ('alu','Item Color:XANH RÊU - CAFÉ','Item Color','XANH RÊU - CAFÉ','admin',0,'Draft',1,'2026-07-30T00:00:00.000Z','2026-07-30T00:00:00.000Z','admin','{"color_code":"XANH RÊU - CAFÉ","color_name":"XANH RÊU - CAFÉ","finish":"Mạ","applies_to_groups":[{"row_id":"SCOPE-01","item_group":"Cửa tấm liền Úc"}],"note":"Bảng màu chuẩn do chủ xưởng cung cấp ngày 2026-07-30.","disabled":false,"_migration_source":"alumdoor-color-catalog-2026-07-30"}'),
  ('alu','Item Color:XÁM - XANH NGỌC','Item Color','XÁM - XANH NGỌC','admin',0,'Draft',1,'2026-07-30T00:00:00.000Z','2026-07-30T00:00:00.000Z','admin','{"color_code":"XÁM - XANH NGỌC","color_name":"XÁM - XANH NGỌC","finish":"Mạ","applies_to_groups":[{"row_id":"SCOPE-01","item_group":"Cửa Đài Loan"}],"note":"Bảng màu chuẩn do chủ xưởng cung cấp ngày 2026-07-30.","disabled":false,"_migration_source":"alumdoor-color-catalog-2026-07-30"}')
ON CONFLICT(tenant_id,doc_key) DO UPDATE SET
  payload_json=excluded.payload_json,modified_at=excluded.modified_at,modified_by=excluded.modified_by,
  version=documents.version+1;

INSERT INTO document_search(tenant_id,doctype,name,title,content,modified_at)
VALUES
  ('alu','Item Color','THÔ','THÔ','THÔ THÔ Thô','2026-07-30T00:00:00.000Z'),
  ('alu','Item Color','CAFÉ','CAFÉ','CAFÉ CAFÉ Sơn tĩnh điện Cửa CN Đức Cửa siêu trường','2026-07-30T00:00:00.000Z'),
  ('alu','Item Color','XANH NGỌC','XANH NGỌC','XANH NGỌC XANH NGỌC Sơn tĩnh điện Cửa CN Đức Cửa siêu trường','2026-07-30T00:00:00.000Z'),
  ('alu','Item Color','MIDNIGHT BLUE','MIDNIGHT BLUE','MIDNIGHT BLUE MIDNIGHT BLUE Sơn tĩnh điện Cửa CN Đức Cửa siêu trường','2026-07-30T00:00:00.000Z'),
  ('alu','Item Color','TRẮNG','TRẮNG','TRẮNG TRẮNG Sơn tĩnh điện Cửa CN Đức Cửa siêu trường','2026-07-30T00:00:00.000Z'),
  ('alu','Item Color','XÁM MỜ','XÁM MỜ','XÁM MỜ XÁM MỜ Sơn tĩnh điện Cửa CN Đức Cửa siêu trường','2026-07-30T00:00:00.000Z'),
  ('alu','Item Color','VÀNG KEM','VÀNG KEM','VÀNG KEM VÀNG KEM Sơn tĩnh điện Cửa CN Đức Cửa siêu trường','2026-07-30T00:00:00.000Z'),
  ('alu','Item Color','GHI SẦN','GHI SẦN','GHI SẦN GHI SẦN Sơn tĩnh điện Cửa CN Đức Cửa siêu trường','2026-07-30T00:00:00.000Z'),
  ('alu','Item Color','NÂU XINGFA','NÂU XINGFA','NÂU XINGFA NÂU XINGFA Sơn tĩnh điện Cửa CN Đức Cửa siêu trường','2026-07-30T00:00:00.000Z'),
  ('alu','Item Color','XÁM XINGFA','XÁM XINGFA','XÁM XINGFA XÁM XINGFA Sơn tĩnh điện Cửa CN Đức Cửa siêu trường','2026-07-30T00:00:00.000Z'),
  ('alu','Item Color','ĐEN XINGFA','ĐEN XINGFA','ĐEN XINGFA ĐEN XINGFA Sơn tĩnh điện Cửa CN Đức Cửa siêu trường','2026-07-30T00:00:00.000Z'),
  ('alu','Item Color','VÀNG KEM BÓNG','VÀNG KEM BÓNG','VÀNG KEM BÓNG VÀNG KEM BÓNG Sơn tĩnh điện Cửa CN Đức Cửa siêu trường','2026-07-30T00:00:00.000Z'),
  ('alu','Item Color','XANH NGỌC BÓNG','XANH NGỌC BÓNG','XANH NGỌC BÓNG XANH NGỌC BÓNG Sơn tĩnh điện Cửa CN Đức Cửa siêu trường','2026-07-30T00:00:00.000Z'),
  ('alu','Item Color','XANH LÁ CÂY','XANH LÁ CÂY','XANH LÁ CÂY XANH LÁ CÂY Sơn tĩnh điện Cửa CN Đức Cửa siêu trường','2026-07-30T00:00:00.000Z'),
  ('alu','Item Color','XÁM LÔNG CHUỘT','XÁM LÔNG CHUỘT','XÁM LÔNG CHUỘT XÁM LÔNG CHUỘT Sơn tĩnh điện Cửa CN Đức Cửa siêu trường','2026-07-30T00:00:00.000Z'),
  ('alu','Item Color','CAM','CAM','CAM CAM Sơn tĩnh điện Cửa CN Đức Cửa siêu trường','2026-07-30T00:00:00.000Z'),
  ('alu','Item Color','ĐỎ ĐÔ','ĐỎ ĐÔ','ĐỎ ĐÔ ĐỎ ĐÔ Sơn tĩnh điện Cửa CN Đức Cửa siêu trường','2026-07-30T00:00:00.000Z'),
  ('alu','Item Color','KEM SỮA','KEM SỮA','KEM SỮA KEM SỮA Sơn tĩnh điện Cửa CN Đức Cửa siêu trường','2026-07-30T00:00:00.000Z'),
  ('alu','Item Color','XANH DƯƠNG','XANH DƯƠNG','XANH DƯƠNG XANH DƯƠNG Sơn tĩnh điện Cửa CN Đức Cửa siêu trường','2026-07-30T00:00:00.000Z'),
  ('alu','Item Color','XANH NGỌC - VÀNG KEM','XANH NGỌC - VÀNG KEM','XANH NGỌC - VÀNG KEM XANH NGỌC - VÀNG KEM Mạ Cửa tấm liền Úc Cửa Đài Loan','2026-07-30T00:00:00.000Z'),
  ('alu','Item Color','XÁM - TRẮNG','XÁM - TRẮNG','XÁM - TRẮNG XÁM - TRẮNG Mạ Cửa tấm liền Úc','2026-07-30T00:00:00.000Z'),
  ('alu','Item Color','GHI ÚC - KEM ÚC','GHI ÚC - KEM ÚC','GHI ÚC - KEM ÚC GHI ÚC - KEM ÚC Mạ Cửa tấm liền Úc','2026-07-30T00:00:00.000Z'),
  ('alu','Item Color','XANH RÊU - CAFÉ','XANH RÊU - CAFÉ','XANH RÊU - CAFÉ XANH RÊU - CAFÉ Mạ Cửa tấm liền Úc','2026-07-30T00:00:00.000Z'),
  ('alu','Item Color','XÁM - XANH NGỌC','XÁM - XANH NGỌC','XÁM - XANH NGỌC XÁM - XANH NGỌC Mạ Cửa Đài Loan','2026-07-30T00:00:00.000Z')
ON CONFLICT(tenant_id,doctype,name) DO UPDATE SET
  title=excluded.title,content=excluded.content,modified_at=excluded.modified_at;

UPDATE documents
SET payload_json=json_set(payload_json,'$.colour',CASE json_extract(payload_json,'$.colour') WHEN 'GS' THEN 'GHI SẦN' WHEN 'VK' THEN 'VÀNG KEM' WHEN 'CF' THEN 'CAFÉ' WHEN 'XF' THEN 'XÁM XINGFA' WHEN '4004' THEN 'ĐỎ ĐÔ' WHEN '9512 ( TRẮNG )' THEN 'TRẮNG' ELSE json_extract(payload_json,'$.colour') END),
    modified_at='2026-07-30T00:00:00.000Z',modified_by='admin',version=version+1
WHERE tenant_id='alu' AND doctype='Aluminium Lot'
  AND json_extract(payload_json,'$.colour') IN ('GS','VK','CF','XF','4004','9512 ( TRẮNG )');

UPDATE document_search
SET title=(SELECT json_extract(d.payload_json,'$.profile')||' · '||json_extract(d.payload_json,'$.colour')||' · '||json_extract(d.payload_json,'$.width_m')||' m'
           FROM documents d WHERE d.tenant_id=document_search.tenant_id AND d.doctype='Aluminium Lot' AND d.name=document_search.name),
    content=(SELECT json_extract(d.payload_json,'$.profile')||' '||json_extract(d.payload_json,'$.colour')||' '||json_extract(d.payload_json,'$.generation')||' '||json_extract(d.payload_json,'$.width_m')||' '||json_extract(d.payload_json,'$.warehouse')||' '||json_extract(d.payload_json,'$.quality_status')
             FROM documents d WHERE d.tenant_id=document_search.tenant_id AND d.doctype='Aluminium Lot' AND d.name=document_search.name),
    modified_at='2026-07-30T00:00:00.000Z'
WHERE tenant_id='alu' AND doctype='Aluminium Lot';

DELETE FROM document_search
WHERE tenant_id='alu' AND doctype='Item Color' AND name IN ('GS','VK','CF','XF','4004','9512 ( TRẮNG )');

DELETE FROM documents
WHERE tenant_id='alu' AND doctype='Item Color' AND name IN ('GS','VK','CF','XF','4004','9512 ( TRẮNG )');

-- Chiều chặn thật nằm trên Item.allowed_colors. Không dùng phạm vi nhóm rộng để cấp màu:
-- Cửa Úc/Đài Loan/Lưới/Phụ kiện chỉ được STĐ khi chính mã hàng ghi STĐ/STD.
UPDATE documents
SET payload_json=json_set(
      payload_json,
      '$.allowed_colors',
      CASE
        WHEN json_extract(payload_json,'$.inventory_mode')='Nhôm cây/lá'
          THEN json('[{"row_id":"COLOR-01","color":"THÔ"},{"row_id":"COLOR-02","color":"CAFÉ"},{"row_id":"COLOR-03","color":"XANH NGỌC"},{"row_id":"COLOR-04","color":"MIDNIGHT BLUE"},{"row_id":"COLOR-05","color":"TRẮNG"},{"row_id":"COLOR-06","color":"XÁM MỜ"},{"row_id":"COLOR-07","color":"VÀNG KEM"},{"row_id":"COLOR-08","color":"GHI SẦN"},{"row_id":"COLOR-09","color":"NÂU XINGFA"},{"row_id":"COLOR-10","color":"XÁM XINGFA"},{"row_id":"COLOR-11","color":"ĐEN XINGFA"},{"row_id":"COLOR-12","color":"VÀNG KEM BÓNG"},{"row_id":"COLOR-13","color":"XANH NGỌC BÓNG"},{"row_id":"COLOR-14","color":"XANH LÁ CÂY"},{"row_id":"COLOR-15","color":"XÁM LÔNG CHUỘT"},{"row_id":"COLOR-16","color":"CAM"},{"row_id":"COLOR-17","color":"ĐỎ ĐÔ"},{"row_id":"COLOR-18","color":"KEM SỮA"},{"row_id":"COLOR-19","color":"XANH DƯƠNG"}]')
        WHEN json_extract(payload_json,'$.item_group') IN ('Cửa CN Đức','Cửa siêu trường')
          OR json_extract(payload_json,'$.item_name') LIKE '%STĐ%'
          OR json_extract(payload_json,'$.item_name') LIKE '%STD%'
          OR json_extract(payload_json,'$.description') LIKE '%STĐ%'
          OR json_extract(payload_json,'$.description') LIKE '%STD%'
          OR json_extract(payload_json,'$.item_name') LIKE '%Sơn tĩnh điện%'
          OR json_extract(payload_json,'$.item_name') LIKE '%SƠN TĨNH ĐIỆN%'
          THEN json('[{"row_id":"COLOR-01","color":"CAFÉ"},{"row_id":"COLOR-02","color":"XANH NGỌC"},{"row_id":"COLOR-03","color":"MIDNIGHT BLUE"},{"row_id":"COLOR-04","color":"TRẮNG"},{"row_id":"COLOR-05","color":"XÁM MỜ"},{"row_id":"COLOR-06","color":"VÀNG KEM"},{"row_id":"COLOR-07","color":"GHI SẦN"},{"row_id":"COLOR-08","color":"NÂU XINGFA"},{"row_id":"COLOR-09","color":"XÁM XINGFA"},{"row_id":"COLOR-10","color":"ĐEN XINGFA"},{"row_id":"COLOR-11","color":"VÀNG KEM BÓNG"},{"row_id":"COLOR-12","color":"XANH NGỌC BÓNG"},{"row_id":"COLOR-13","color":"XANH LÁ CÂY"},{"row_id":"COLOR-14","color":"XÁM LÔNG CHUỘT"},{"row_id":"COLOR-15","color":"CAM"},{"row_id":"COLOR-16","color":"ĐỎ ĐÔ"},{"row_id":"COLOR-17","color":"KEM SỮA"},{"row_id":"COLOR-18","color":"XANH DƯƠNG"}]')
        WHEN json_extract(payload_json,'$.item_group')='Cửa tấm liền Úc'
          THEN json('[{"row_id":"COLOR-01","color":"XANH NGỌC - VÀNG KEM"},{"row_id":"COLOR-02","color":"XÁM - TRẮNG"},{"row_id":"COLOR-03","color":"GHI ÚC - KEM ÚC"},{"row_id":"COLOR-04","color":"XANH RÊU - CAFÉ"}]')
        WHEN json_extract(payload_json,'$.item_group')='Cửa Đài Loan'
          THEN json('[{"row_id":"COLOR-01","color":"XANH NGỌC - VÀNG KEM"},{"row_id":"COLOR-02","color":"XÁM - XANH NGỌC"}]')
        ELSE json('[]')
      END
    ),
    modified_at='2026-07-30T00:00:00.000Z',
    modified_by='admin',
    version=version+1
WHERE tenant_id='alu'
  AND doctype='Item'
  AND COALESCE(json_extract(payload_json,'$.disabled'),0)=0;
