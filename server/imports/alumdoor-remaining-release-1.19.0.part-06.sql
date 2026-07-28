-- Alumdoor 1.19.0: full compiler-normalized metadata release.
-- Equivalent data shape to AppInstaller.install; generated at statement boundaries.

INSERT INTO doctype_definitions(
  tenant_id,doctype,module,is_custom,is_submittable,is_child,revision,
  metadata_json,disabled,modified_by,modified_at
)
SELECT
  'alu','Legacy Sales Order','Alumdoor',
  0,0,0,
  COALESCE((SELECT revision+1 FROM doctype_definitions WHERE tenant_id='alu' AND doctype='Legacy Sales Order'),1),
  json_set(
    json('{"name":"Legacy Sales Order","label":"Đơn hàng cũ","module":"Alumdoor","custom":false,"is_child":false,"is_tree":false,"is_single":false,"is_submittable":false,"track_changes":true,"track_seen":false,"allow_rename":false,"autoname":"field:legacy_voucher","title_field":"customer","sort_order":"DESC","search_fields":["legacy_voucher","customer","salesperson"],"fields":[{"fieldname":"legacy_voucher","label":"Số chứng từ cũ","fieldtype":"Data","required":true,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":true,"in_list_view":true,"in_standard_filter":false,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":1},{"fieldname":"record_type","label":"Loại dữ liệu","fieldtype":"Select","options":"Đơn hàng\nPhiếu xuất\nBảng tính tiền\nĐơn dự án","required":false,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"default":"Đơn hàng","in_list_view":true,"in_standard_filter":true,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":2},{"fieldname":"order_date","label":"Ngày đặt hàng","fieldtype":"Date","required":false,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"in_list_view":true,"in_standard_filter":false,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":3},{"fieldname":"customer","label":"Khách hàng","fieldtype":"Link","options":"Customer","required":true,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"in_list_view":true,"in_standard_filter":true,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":4},{"fieldname":"delivery_date","label":"Ngày giao hàng","fieldtype":"Date","required":false,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"in_list_view":true,"in_standard_filter":false,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":5},{"fieldname":"legacy_status","label":"Trạng thái nguồn","fieldtype":"Data","required":false,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"in_list_view":true,"in_standard_filter":false,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":6},{"fieldname":"salesperson","label":"Người phụ trách","fieldtype":"Data","required":false,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"in_list_view":true,"in_standard_filter":false,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":7},{"fieldname":"items","label":"Chi tiết nguồn","fieldtype":"Table","options":"Legacy Sales Order Item","required":true,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"in_list_view":false,"in_standard_filter":false,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":8},{"fieldname":"note","label":"Ghi chú","fieldtype":"Small Text","required":false,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"in_list_view":false,"in_standard_filter":false,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":9},{"fieldname":"source_workbook","label":"File nguồn","fieldtype":"Data","required":false,"read_only":false,"hidden":true,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"in_list_view":false,"in_standard_filter":false,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":10},{"fieldname":"source_sheet","label":"Sheet nguồn","fieldtype":"Data","required":false,"read_only":false,"hidden":true,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"in_list_view":false,"in_standard_filter":false,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":11}],"permissions":[{"role":"Chủ xưởng","read":true,"write":true,"create":true,"submit":false,"cancel":false,"amend":false,"print":true,"email":true,"report":true,"import":false,"export":true,"share":false,"if_owner":false,"permlevel":0},{"role":"Kinh doanh","read":true,"write":true,"create":true,"submit":false,"cancel":false,"amend":false,"print":true,"email":true,"report":true,"import":false,"export":true,"share":false,"if_owner":false,"permlevel":0},{"role":"Kế toán","read":true,"write":false,"create":false,"submit":false,"cancel":false,"amend":false,"print":true,"email":true,"report":true,"import":false,"export":true,"share":false,"if_owner":false,"permlevel":0},{"role":"Thủ kho","read":true,"write":false,"create":false,"submit":false,"cancel":false,"amend":false,"print":true,"email":true,"report":true,"import":false,"export":true,"share":false,"if_owner":false,"permlevel":0},{"role":"Sản xuất","read":true,"write":false,"create":false,"submit":false,"cancel":false,"amend":false,"print":true,"email":true,"report":true,"import":false,"export":true,"share":false,"if_owner":false,"permlevel":0},{"role":"System Manager","read":true,"write":true,"create":true,"submit":true,"cancel":true,"amend":true,"print":true,"email":true,"report":true,"import":false,"export":true,"share":false,"if_owner":false,"permlevel":0}],"revision":1}'),
    '$.revision',
    COALESCE((SELECT revision+1 FROM doctype_definitions WHERE tenant_id='alu' AND doctype='Legacy Sales Order'),1)
  ),
  0,'admin','2026-07-29T01:00:00.000Z'
WHERE EXISTS (
    SELECT 1 FROM installed_apps
    WHERE tenant_id='alu' AND app_id='alumdoor'
      AND version IN ('1.18.5', '1.19.0')
      AND content_hash<>'b1a2c6e95af2eef2eda92d4013132d0601e39ccb338f53ae0ed982a76f273ee8'
  )
ON CONFLICT(tenant_id,doctype) DO UPDATE SET
  module=excluded.module,is_custom=excluded.is_custom,is_submittable=excluded.is_submittable,
  is_child=excluded.is_child,revision=excluded.revision,metadata_json=excluded.metadata_json,
  disabled=0,modified_by=excluded.modified_by,modified_at=excluded.modified_at;

INSERT INTO doctype_definitions(
  tenant_id,doctype,module,is_custom,is_submittable,is_child,revision,
  metadata_json,disabled,modified_by,modified_at
)
SELECT
  'alu','Legacy Goods Intake','Alumdoor',
  0,0,0,
  COALESCE((SELECT revision+1 FROM doctype_definitions WHERE tenant_id='alu' AND doctype='Legacy Goods Intake'),1),
  json_set(
    json('{"name":"Legacy Goods Intake","label":"Nhật ký nhập cũ","module":"Alumdoor","custom":false,"is_child":false,"is_tree":false,"is_single":false,"is_submittable":false,"track_changes":true,"track_seen":false,"allow_rename":false,"autoname":"field:legacy_key","title_field":"source_party","sort_order":"DESC","search_fields":["source_party","item_description","note"],"fields":[{"fieldname":"legacy_key","label":"Khoá dòng cũ","fieldtype":"Data","required":true,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":true,"in_list_view":false,"in_standard_filter":false,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":1},{"fieldname":"intake_date","label":"Ngày nhập","fieldtype":"Date","required":false,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"in_list_view":true,"in_standard_filter":false,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":2},{"fieldname":"transaction_type","label":"Loại nghiệp vụ","fieldtype":"Select","options":"Mua vào\nKhách hoàn trả\nNhập khác","required":false,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"default":"Nhập khác","in_list_view":true,"in_standard_filter":true,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":3},{"fieldname":"source_party","label":"NCC / khách theo file","fieldtype":"Data","required":true,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"in_list_view":true,"in_standard_filter":false,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":4},{"fieldname":"supplier","label":"Nhà cung cấp đã ghép","fieldtype":"Link","options":"Supplier","required":false,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"in_list_view":false,"in_standard_filter":false,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":5},{"fieldname":"customer","label":"Khách hàng đã ghép","fieldtype":"Link","options":"Customer","required":false,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"in_list_view":false,"in_standard_filter":false,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":6},{"fieldname":"item_description","label":"Nội dung / sản phẩm","fieldtype":"Small Text","required":true,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"in_list_view":true,"in_standard_filter":false,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":7},{"fieldname":"item_code","label":"Mã hàng đã ghép","fieldtype":"Link","options":"Item","required":false,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"in_list_view":false,"in_standard_filter":false,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":8},{"fieldname":"color_text","label":"Màu","fieldtype":"Data","required":false,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"in_list_view":false,"in_standard_filter":false,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":9},{"fieldname":"dimension_text","label":"Kích thước","fieldtype":"Data","required":false,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"in_list_view":false,"in_standard_filter":false,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":10},{"fieldname":"qty","label":"Số lượng","fieldtype":"Float","required":false,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"in_list_view":true,"in_standard_filter":false,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":11},{"fieldname":"uom","label":"ĐVT","fieldtype":"Link","options":"UOM","required":false,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"in_list_view":true,"in_standard_filter":true,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":12},{"fieldname":"responsible","label":"Người phụ trách","fieldtype":"Data","required":false,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"in_list_view":false,"in_standard_filter":false,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":13},{"fieldname":"payment_method","label":"Hình thức thanh toán","fieldtype":"Data","required":false,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"in_list_view":false,"in_standard_filter":false,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":14},{"fieldname":"amount","label":"Số tiền","fieldtype":"Currency","required":false,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"in_list_view":true,"in_standard_filter":false,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":15},{"fieldname":"source_status","label":"Tình trạng nguồn","fieldtype":"Data","required":false,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"in_list_view":false,"in_standard_filter":false,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":16},{"fieldname":"note","label":"Ghi chú","fieldtype":"Small Text","required":false,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"in_list_view":false,"in_standard_filter":false,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":17},{"fieldname":"source_sheet","label":"Sheet nguồn","fieldtype":"Data","required":false,"read_only":false,"hidden":true,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"in_list_view":false,"in_standard_filter":false,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":18},{"fieldname":"source_row","label":"Dòng nguồn","fieldtype":"Int","required":false,"read_only":false,"hidden":true,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"in_list_view":false,"in_standard_filter":false,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":19}],"permissions":[{"role":"Chủ xưởng","read":true,"write":true,"create":true,"submit":false,"cancel":false,"amend":false,"print":true,"email":true,"report":true,"import":false,"export":true,"share":false,"if_owner":false,"permlevel":0},{"role":"Kế toán","read":true,"write":true,"create":true,"submit":false,"cancel":false,"amend":false,"print":true,"email":true,"report":true,"import":false,"export":true,"share":false,"if_owner":false,"permlevel":0},{"role":"Thủ kho","read":true,"write":true,"create":true,"submit":false,"cancel":false,"amend":false,"print":true,"email":true,"report":true,"import":false,"export":true,"share":false,"if_owner":false,"permlevel":0},{"role":"Kinh doanh","read":true,"write":false,"create":false,"submit":false,"cancel":false,"amend":false,"print":true,"email":true,"report":true,"import":false,"export":true,"share":false,"if_owner":false,"permlevel":0},{"role":"Sản xuất","read":true,"write":false,"create":false,"submit":false,"cancel":false,"amend":false,"print":true,"email":true,"report":true,"import":false,"export":true,"share":false,"if_owner":false,"permlevel":0},{"role":"System Manager","read":true,"write":true,"create":true,"submit":true,"cancel":true,"amend":true,"print":true,"email":true,"report":true,"import":false,"export":true,"share":false,"if_owner":false,"permlevel":0}],"revision":1}'),
    '$.revision',
    COALESCE((SELECT revision+1 FROM doctype_definitions WHERE tenant_id='alu' AND doctype='Legacy Goods Intake'),1)
  ),
  0,'admin','2026-07-29T01:00:00.000Z'
WHERE EXISTS (
    SELECT 1 FROM installed_apps
    WHERE tenant_id='alu' AND app_id='alumdoor'
      AND version IN ('1.18.5', '1.19.0')
      AND content_hash<>'b1a2c6e95af2eef2eda92d4013132d0601e39ccb338f53ae0ed982a76f273ee8'
  )
ON CONFLICT(tenant_id,doctype) DO UPDATE SET
  module=excluded.module,is_custom=excluded.is_custom,is_submittable=excluded.is_submittable,
  is_child=excluded.is_child,revision=excluded.revision,metadata_json=excluded.metadata_json,
  disabled=0,modified_by=excluded.modified_by,modified_at=excluded.modified_at;

INSERT INTO doctype_definitions(
  tenant_id,doctype,module,is_custom,is_submittable,is_child,revision,
  metadata_json,disabled,modified_by,modified_at
)
SELECT
  'alu','Warranty Claim','Alumdoor',
  0,0,0,
  COALESCE((SELECT revision+1 FROM doctype_definitions WHERE tenant_id='alu' AND doctype='Warranty Claim'),1),
  json_set(
    json('{"name":"Warranty Claim","label":"Bảo hành","module":"Alumdoor","custom":false,"is_child":false,"is_tree":false,"is_single":false,"is_submittable":false,"track_changes":true,"track_seen":false,"allow_rename":false,"autoname":"field:legacy_key","title_field":"customer","sort_order":"DESC","search_fields":["legacy_voucher","customer","supplier","item_description"],"fields":[{"fieldname":"legacy_key","label":"Khoá hồ sơ","fieldtype":"Data","required":true,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":true,"in_list_view":false,"in_standard_filter":false,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":1},{"fieldname":"legacy_voucher","label":"Số chứng từ cũ","fieldtype":"Data","required":false,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"in_list_view":false,"in_standard_filter":false,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":2},{"fieldname":"order_date","label":"Ngày đặt hàng","fieldtype":"Date","required":false,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"in_list_view":false,"in_standard_filter":false,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":3},{"fieldname":"received_fault_on","label":"Ngày nhận lỗi","fieldtype":"Date","required":false,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"in_list_view":true,"in_standard_filter":false,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":4},{"fieldname":"received_fault_qty","label":"SL nhận lỗi","fieldtype":"Float","required":false,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"in_list_view":false,"in_standard_filter":false,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":5},{"fieldname":"replacement_sent_on","label":"Ngày xuất đổi","fieldtype":"Date","required":false,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"in_list_view":false,"in_standard_filter":false,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":6},{"fieldname":"replacement_qty","label":"SL đã đổi","fieldtype":"Float","required":false,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"in_list_view":false,"in_standard_filter":false,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":7},{"fieldname":"warranty_sent_on","label":"Ngày gửi bảo hành","fieldtype":"Date","required":false,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"in_list_view":false,"in_standard_filter":false,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":8},{"fieldname":"warranty_sent_qty","label":"SL gửi NCC","fieldtype":"Float","required":false,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"in_list_view":false,"in_standard_filter":false,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":9},{"fieldname":"warranty_received_on","label":"Ngày nhận bảo hành","fieldtype":"Date","required":false,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"in_list_view":false,"in_standard_filter":false,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":10},{"fieldname":"warranty_received_qty","label":"SL nhận từ NCC","fieldtype":"Float","required":false,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"in_list_view":false,"in_standard_filter":false,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":11},{"fieldname":"supplier","label":"Nhà cung cấp","fieldtype":"Link","options":"Supplier","required":false,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"in_list_view":true,"in_standard_filter":true,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":12},{"fieldname":"customer","label":"Khách hàng","fieldtype":"Link","options":"Customer","required":false,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"in_list_view":true,"in_standard_filter":true,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":13},{"fieldname":"item_description","label":"Hàng lỗi / nội dung","fieldtype":"Small Text","required":true,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"in_list_view":true,"in_standard_filter":false,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":14},{"fieldname":"issue_cause","label":"Nguyên nhân","fieldtype":"Data","required":false,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"in_list_view":false,"in_standard_filter":false,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":15},{"fieldname":"customer_resolution","label":"Xử lý cho khách","fieldtype":"Data","required":false,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"in_list_view":false,"in_standard_filter":false,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":16},{"fieldname":"supplier_resolution","label":"Xử lý với NCC","fieldtype":"Data","required":false,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"in_list_view":false,"in_standard_filter":false,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":17},{"fieldname":"debt_offset_on","label":"Ngày trừ công nợ","fieldtype":"Date","required":false,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"in_list_view":false,"in_standard_filter":false,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":18},{"fieldname":"warranty_status","label":"Trạng thái","fieldtype":"Select","options":"Mới\nĐã đổi cho khách\nĐang gửi NCC\nĐã nhận từ NCC\nĐã đóng","required":false,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"default":"Mới","in_list_view":true,"in_standard_filter":true,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":19},{"fieldname":"note","label":"Ghi chú","fieldtype":"Small Text","required":false,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"in_list_view":false,"in_standard_filter":false,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":20},{"fieldname":"source_sheet","label":"Sheet nguồn","fieldtype":"Data","required":false,"read_only":false,"hidden":true,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"in_list_view":false,"in_standard_filter":false,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":21},{"fieldname":"source_row","label":"Dòng nguồn","fieldtype":"Int","required":false,"read_only":false,"hidden":true,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"in_list_view":false,"in_standard_filter":false,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":22}],"permissions":[{"role":"Chủ xưởng","read":true,"write":true,"create":true,"submit":false,"cancel":false,"amend":false,"print":true,"email":true,"report":true,"import":false,"export":true,"share":false,"if_owner":false,"permlevel":0},{"role":"Kinh doanh","read":true,"write":true,"create":true,"submit":false,"cancel":false,"amend":false,"print":true,"email":true,"report":true,"import":false,"export":true,"share":false,"if_owner":false,"permlevel":0},{"role":"Kế toán","read":true,"write":true,"create":true,"submit":false,"cancel":false,"amend":false,"print":true,"email":true,"report":true,"import":false,"export":true,"share":false,"if_owner":false,"permlevel":0},{"role":"Thủ kho","read":true,"write":true,"create":true,"submit":false,"cancel":false,"amend":false,"print":true,"email":true,"report":true,"import":false,"export":true,"share":false,"if_owner":false,"permlevel":0},{"role":"Sản xuất","read":true,"write":false,"create":false,"submit":false,"cancel":false,"amend":false,"print":true,"email":true,"report":true,"import":false,"export":true,"share":false,"if_owner":false,"permlevel":0},{"role":"System Manager","read":true,"write":true,"create":true,"submit":true,"cancel":true,"amend":true,"print":true,"email":true,"report":true,"import":false,"export":true,"share":false,"if_owner":false,"permlevel":0}],"revision":1}'),
    '$.revision',
    COALESCE((SELECT revision+1 FROM doctype_definitions WHERE tenant_id='alu' AND doctype='Warranty Claim'),1)
  ),
  0,'admin','2026-07-29T01:00:00.000Z'
WHERE EXISTS (
    SELECT 1 FROM installed_apps
    WHERE tenant_id='alu' AND app_id='alumdoor'
      AND version IN ('1.18.5', '1.19.0')
      AND content_hash<>'b1a2c6e95af2eef2eda92d4013132d0601e39ccb338f53ae0ed982a76f273ee8'
  )
ON CONFLICT(tenant_id,doctype) DO UPDATE SET
  module=excluded.module,is_custom=excluded.is_custom,is_submittable=excluded.is_submittable,
  is_child=excluded.is_child,revision=excluded.revision,metadata_json=excluded.metadata_json,
  disabled=0,modified_by=excluded.modified_by,modified_at=excluded.modified_at;

INSERT INTO doctype_definitions(
  tenant_id,doctype,module,is_custom,is_submittable,is_child,revision,
  metadata_json,disabled,modified_by,modified_at
)
SELECT
  'alu','Production Standard','Alumdoor',
  0,0,0,
  COALESCE((SELECT revision+1 FROM doctype_definitions WHERE tenant_id='alu' AND doctype='Production Standard'),1),
  json_set(
    json('{"name":"Production Standard","label":"Định mức công đoạn","module":"Alumdoor","custom":false,"is_child":false,"is_tree":false,"is_single":false,"is_submittable":false,"track_changes":true,"track_seen":false,"allow_rename":false,"autoname":"field:department","title_field":"department","sort_order":"DESC","fields":[{"fieldname":"department","label":"Bộ phận / công đoạn","fieldtype":"Data","required":true,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":true,"in_list_view":true,"in_standard_filter":false,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":1},{"fieldname":"standard_time","label":"Định mức thời gian","fieldtype":"Small Text","required":true,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"in_list_view":true,"in_standard_filter":false,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":2},{"fieldname":"note","label":"Ghi chú","fieldtype":"Small Text","required":false,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"in_list_view":false,"in_standard_filter":false,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":3},{"fieldname":"disabled","label":"Ngừng dùng","fieldtype":"Check","required":false,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"in_list_view":true,"in_standard_filter":false,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":4}],"permissions":[{"role":"Chủ xưởng","read":true,"write":true,"create":true,"submit":false,"cancel":false,"amend":false,"print":true,"email":true,"report":true,"import":false,"export":true,"share":false,"if_owner":false,"permlevel":0},{"role":"Sản xuất","read":true,"write":true,"create":true,"submit":false,"cancel":false,"amend":false,"print":true,"email":true,"report":true,"import":false,"export":true,"share":false,"if_owner":false,"permlevel":0},{"role":"Kinh doanh","read":true,"write":false,"create":false,"submit":false,"cancel":false,"amend":false,"print":true,"email":true,"report":true,"import":false,"export":true,"share":false,"if_owner":false,"permlevel":0},{"role":"Thủ kho","read":true,"write":false,"create":false,"submit":false,"cancel":false,"amend":false,"print":true,"email":true,"report":true,"import":false,"export":true,"share":false,"if_owner":false,"permlevel":0},{"role":"Kế toán","read":true,"write":false,"create":false,"submit":false,"cancel":false,"amend":false,"print":true,"email":true,"report":true,"import":false,"export":true,"share":false,"if_owner":false,"permlevel":0},{"role":"System Manager","read":true,"write":true,"create":true,"submit":true,"cancel":true,"amend":true,"print":true,"email":true,"report":true,"import":false,"export":true,"share":false,"if_owner":false,"permlevel":0}],"revision":1}'),
    '$.revision',
    COALESCE((SELECT revision+1 FROM doctype_definitions WHERE tenant_id='alu' AND doctype='Production Standard'),1)
  ),
  0,'admin','2026-07-29T01:00:00.000Z'
WHERE EXISTS (
    SELECT 1 FROM installed_apps
    WHERE tenant_id='alu' AND app_id='alumdoor'
      AND version IN ('1.18.5', '1.19.0')
      AND content_hash<>'b1a2c6e95af2eef2eda92d4013132d0601e39ccb338f53ae0ed982a76f273ee8'
  )
ON CONFLICT(tenant_id,doctype) DO UPDATE SET
  module=excluded.module,is_custom=excluded.is_custom,is_submittable=excluded.is_submittable,
  is_child=excluded.is_child,revision=excluded.revision,metadata_json=excluded.metadata_json,
  disabled=0,modified_by=excluded.modified_by,modified_at=excluded.modified_at;

INSERT INTO workflows(
  tenant_id,name,document_type,is_active,revision,workflow_json,modified_by,modified_at
)
SELECT
  'alu','Chốt báo giá','Quotation',1,
  COALESCE((SELECT revision+1 FROM workflows WHERE tenant_id='alu' AND name='Chốt báo giá'),1),
  json_set(
    json('{"name":"Chốt báo giá","document_type":"Quotation","state_field":"workflow_state","is_active":true,"states":[{"state":"Nháp","docstatus":0},{"state":"Đã gửi khách","docstatus":0},{"state":"Khách đồng ý","docstatus":1},{"state":"Khách từ chối","docstatus":2}],"transitions":[{"state":"Nháp","action":"Gửi khách","next_state":"Đã gửi khách","allowed_role":"Kinh doanh","allow_self_approval":false},{"state":"Đã gửi khách","action":"Sửa lại","next_state":"Nháp","allowed_role":"Kinh doanh","allow_self_approval":false},{"state":"Đã gửi khách","action":"Khách đồng ý","next_state":"Khách đồng ý","allowed_role":"Kinh doanh","allow_self_approval":true},{"state":"Đã gửi khách","action":"Khách từ chối","next_state":"Khách từ chối","allowed_role":"Kinh doanh","allow_self_approval":true}],"revision":1}'),
    '$.revision',
    COALESCE((SELECT revision+1 FROM workflows WHERE tenant_id='alu' AND name='Chốt báo giá'),1)
  ),
  'admin','2026-07-29T01:00:00.000Z'
WHERE EXISTS (
    SELECT 1 FROM installed_apps
    WHERE tenant_id='alu' AND app_id='alumdoor'
      AND version IN ('1.18.5', '1.19.0')
      AND content_hash<>'b1a2c6e95af2eef2eda92d4013132d0601e39ccb338f53ae0ed982a76f273ee8'
  )
ON CONFLICT(tenant_id,name) DO UPDATE SET
  document_type=excluded.document_type,is_active=excluded.is_active,revision=excluded.revision,
  workflow_json=excluded.workflow_json,modified_by=excluded.modified_by,modified_at=excluded.modified_at;

INSERT INTO print_formats(
  tenant_id,name,doc_type,is_default,disabled,revision,format_json,modified_by,modified_at
)
SELECT
  'alu','Hoá đơn ALUMDOOR','Sales Invoice',1,0,
  COALESCE((SELECT revision+1 FROM print_formats WHERE tenant_id='alu' AND name='Hoá đơn ALUMDOOR'),1),
  json_set(
    json('{"name":"Hoá đơn ALUMDOOR","doc_type":"Sales Invoice","format_type":"Standard","html":"<div class=\"head\">\n  <div><div class=\"brand\">ALUMDOOR</div>\n  <div class=\"sub\">Cửa cuốn công nghệ Đức / Úc<br>Xưởng 1: 12B đường số 2, P. Bình Hưng Hoà, Q. Bình Tân, TP.HCM<br>Xưởng 2: 36 đường số 7, P. Bình Hưng Hoà, Q. Bình Tân, TP.HCM</div></div>\n  <div><div class=\"title\">Hoá đơn bán hàng</div><div class=\"no\">Số: {{ name }}<br>Ngày: {{ posting_at | date }}</div></div>\n</div>\n<div class=\"grid\">\n  <div class=\"row\"><b>Khách hàng</b><span>{{ customer }}</span></div>\n  <div class=\"row\"><b>Hạn thanh toán</b><span>{{ due_date | date }}</span></div>\n  <div class=\"row\"><b>Theo đơn hàng</b><span>{{ against_sales_order }}</span></div>\n  <div class=\"row\"><b>Tiền tệ</b><span>{{ currency }}</span></div>\n</div>\n<table><thead><tr><th style=\"width:34px\">#</th><th>Mã hàng</th><th class=\"n\">Số lượng</th><th class=\"n\">Đơn giá</th><th class=\"n\">Thành tiền</th></tr></thead><tbody>\n{{#each items}}<tr><td>{{ _index }}</td><td>{{ item_code }}</td><td class=\"n\">{{ qty | number }}</td><td class=\"n\">{{ rate | money }}</td><td class=\"n\">{{ amount | money }}</td></tr>{{/each}}\n</tbody></table>\n<div class=\"tot\">\n  <div class=\"row\"><span>Tổng cộng</span><span>{{ grand_total | money }} ₫</span></div>\n  <div class=\"row big\"><span>Còn phải thu</span><span>{{ outstanding_amount | money }} ₫</span></div>\n</div>\n<div class=\"sign\"><div><b>Người mua hàng</b>(ký, ghi rõ họ tên)</div><div><b>Người lập phiếu</b>(ký, ghi rõ họ tên)</div><div><b>Đại diện ALUMDOOR</b>(ký, đóng dấu)</div></div>","css":"*{box-sizing:border-box} body{font-family:''Segoe UI'',Roboto,Arial,sans-serif;font-size:13px;color:#111;margin:0;padding:24px}\n.head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #c1121f;padding-bottom:12px;margin-bottom:16px}\n.brand{font-size:22px;font-weight:700;color:#c1121f;letter-spacing:.5px}\n.sub{font-size:11px;color:#555;margin-top:2px;line-height:1.5}\n.title{font-size:17px;font-weight:700;text-transform:uppercase;text-align:right}\n.no{font-size:12px;color:#555;text-align:right;margin-top:2px}\n.grid{display:grid;grid-template-columns:1fr 1fr;gap:6px 24px;margin-bottom:14px}\n.row{display:flex;gap:8px} .row b{min-width:110px;color:#555;font-weight:600}\ntable{width:100%;border-collapse:collapse;margin-top:8px} th,td{border:1px solid #ccc;padding:6px 8px}\nth{background:#f3f4f6;font-size:11px;text-transform:uppercase;letter-spacing:.3px;text-align:left}\ntd.n,th.n{text-align:right;font-variant-numeric:tabular-nums}\n.tot{margin-top:12px;margin-left:auto;width:290px}\n.tot .row{justify-content:space-between;padding:5px 0;border-bottom:1px dashed #ddd}\n.tot .big{font-size:16px;font-weight:700;color:#c1121f;border-bottom:none}\n.sign{display:flex;justify-content:space-between;margin-top:36px;text-align:center}\n.sign div{width:30%} .sign b{display:block;margin-bottom:52px;font-size:12px}\n.note{margin-top:14px;font-size:11px;color:#555;white-space:pre-wrap}","is_default":true,"disabled":false,"revision":1}'),
    '$.revision',
    COALESCE((SELECT revision+1 FROM print_formats WHERE tenant_id='alu' AND name='Hoá đơn ALUMDOOR'),1)
  ),
  'admin','2026-07-29T01:00:00.000Z'
WHERE EXISTS (
    SELECT 1 FROM installed_apps
    WHERE tenant_id='alu' AND app_id='alumdoor'
      AND version IN ('1.18.5', '1.19.0')
      AND content_hash<>'b1a2c6e95af2eef2eda92d4013132d0601e39ccb338f53ae0ed982a76f273ee8'
  )
ON CONFLICT(tenant_id,name) DO UPDATE SET
  doc_type=excluded.doc_type,is_default=excluded.is_default,disabled=excluded.disabled,
  revision=excluded.revision,format_json=excluded.format_json,
  modified_by=excluded.modified_by,modified_at=excluded.modified_at;

INSERT INTO print_formats(
  tenant_id,name,doc_type,is_default,disabled,revision,format_json,modified_by,modified_at
)
SELECT
  'alu','Phiếu sản xuất','Work Order',1,0,
  COALESCE((SELECT revision+1 FROM print_formats WHERE tenant_id='alu' AND name='Phiếu sản xuất'),1),
  json_set(
    json('{"name":"Phiếu sản xuất","doc_type":"Work Order","format_type":"Standard","html":"<div class=\"head\">\n  <div><div class=\"brand\">ALUMDOOR</div>\n  <div class=\"sub\">Cửa cuốn công nghệ Đức / Úc<br>Xưởng 1: 12B đường số 2, P. Bình Hưng Hoà, Q. Bình Tân, TP.HCM<br>Xưởng 2: 36 đường số 7, P. Bình Hưng Hoà, Q. Bình Tân, TP.HCM</div></div>\n  <div><div class=\"title\">Phiếu sản xuất</div><div class=\"no\">Số: {{ name }}<br>Hẹn giao: {{ planned_end_date | date }}</div></div>\n</div>\n<div class=\"grid\">\n  <div class=\"row\"><b>Thành phẩm</b><span>{{ production_item }}</span></div>\n  <div class=\"row\"><b>Theo đơn hàng</b><span>{{ against_sales_order }}</span></div>\n  <div class=\"row\"><b>Màu / mã sơn</b><span>{{ color }}</span></div>\n  <div class=\"row\"><b>Mô tơ</b><span>{{ motor_model }}</span></div>\n  <div class=\"row\"><b>Kho vật tư</b><span>{{ source_warehouse }}</span></div>\n  <div class=\"row\"><b>Kho nhập TP</b><span>{{ target_warehouse }}</span></div>\n</div>\n<div class=\"meas\"><div>RỘNG<div class=\"big\">{{ width_mm }} mm</div></div><div>CAO<div class=\"big\">{{ height_mm }} mm</div></div><div>SỐ BỘ<div class=\"big\">{{ set_count }}</div></div></div>\n<table><thead><tr><th style=\"width:34px\">#</th><th>Vật tư cần</th><th class=\"n\">Định mức</th><th>Kho xuất</th><th style=\"width:110px\">Thực xuất</th></tr></thead><tbody>\n{{#each required_items}}<tr><td>{{ _index }}</td><td>{{ item_code }}</td><td class=\"n\">{{ required_qty | number }}</td><td>{{ source_warehouse }}</td><td></td></tr>{{/each}}\n</tbody></table>\n<div class=\"note\">Địa chỉ lắp đặt: {{ install_address }}\nGhi chú xưởng: {{ note }}</div>\n<div class=\"sign\"><div><b>Tổ trưởng</b>(ký)</div><div><b>Thợ thực hiện</b>(ký)</div><div><b>KCS nghiệm thu</b>(ký)</div></div>","css":"*{box-sizing:border-box} body{font-family:''Segoe UI'',Roboto,Arial,sans-serif;font-size:13px;color:#111;margin:0;padding:24px}\n.head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #c1121f;padding-bottom:12px;margin-bottom:16px}\n.brand{font-size:22px;font-weight:700;color:#c1121f;letter-spacing:.5px}\n.sub{font-size:11px;color:#555;margin-top:2px;line-height:1.5}\n.title{font-size:17px;font-weight:700;text-transform:uppercase;text-align:right}\n.no{font-size:12px;color:#555;text-align:right;margin-top:2px}\n.grid{display:grid;grid-template-columns:1fr 1fr;gap:6px 24px;margin-bottom:14px}\n.row{display:flex;gap:8px} .row b{min-width:110px;color:#555;font-weight:600}\ntable{width:100%;border-collapse:collapse;margin-top:8px} th,td{border:1px solid #ccc;padding:6px 8px}\nth{background:#f3f4f6;font-size:11px;text-transform:uppercase;letter-spacing:.3px;text-align:left}\ntd.n,th.n{text-align:right;font-variant-numeric:tabular-nums}\n.tot{margin-top:12px;margin-left:auto;width:290px}\n.tot .row{justify-content:space-between;padding:5px 0;border-bottom:1px dashed #ddd}\n.tot .big{font-size:16px;font-weight:700;color:#c1121f;border-bottom:none}\n.sign{display:flex;justify-content:space-between;margin-top:36px;text-align:center}\n.sign div{width:30%} .sign b{display:block;margin-bottom:52px;font-size:12px}\n.note{margin-top:14px;font-size:11px;color:#555;white-space:pre-wrap}\n.big{font-size:26px;font-weight:800;letter-spacing:1px}\n.meas{background:#fff4f4;border:2px solid #c1121f;padding:12px;margin:12px 0;display:flex;gap:36px;justify-content:center;text-align:center}","is_default":true,"disabled":false,"revision":1}'),
    '$.revision',
    COALESCE((SELECT revision+1 FROM print_formats WHERE tenant_id='alu' AND name='Phiếu sản xuất'),1)
  ),
  'admin','2026-07-29T01:00:00.000Z'
WHERE EXISTS (
    SELECT 1 FROM installed_apps
    WHERE tenant_id='alu' AND app_id='alumdoor'
      AND version IN ('1.18.5', '1.19.0')
      AND content_hash<>'b1a2c6e95af2eef2eda92d4013132d0601e39ccb338f53ae0ed982a76f273ee8'
  )
ON CONFLICT(tenant_id,name) DO UPDATE SET
  doc_type=excluded.doc_type,is_default=excluded.is_default,disabled=excluded.disabled,
  revision=excluded.revision,format_json=excluded.format_json,
  modified_by=excluded.modified_by,modified_at=excluded.modified_at;

INSERT INTO print_formats(
  tenant_id,name,doc_type,is_default,disabled,revision,format_json,modified_by,modified_at
)
SELECT
  'alu','Báo giá ALUMDOOR','Quotation',1,0,
  COALESCE((SELECT revision+1 FROM print_formats WHERE tenant_id='alu' AND name='Báo giá ALUMDOOR'),1),
  json_set(
    json('{"name":"Báo giá ALUMDOOR","doc_type":"Quotation","format_type":"Standard","html":"<div class=\"head\">\n  <div><div class=\"brand\">ALUMDOOR</div>\n  <div class=\"sub\">Cửa cuốn công nghệ Đức / Úc<br>Xưởng 1: 12B đường số 2, P. Bình Hưng Hoà, Q. Bình Tân, TP.HCM<br>Xưởng 2: 36 đường số 7, P. Bình Hưng Hoà, Q. Bình Tân, TP.HCM</div></div>\n  <div><div class=\"title\">Báo giá</div><div class=\"no\">Số: {{ name }}<br>Ngày: {{ transaction_date | date }}</div></div>\n</div>\n<div class=\"grid\">\n  <div class=\"row\"><b>Khách hàng</b><span>{{ customer }}</span></div>\n  <div class=\"row\"><b>Người liên hệ</b><span>{{ contact_person }} {{ phone }}</span></div>\n  <div class=\"row\"><b>Công trình</b><span>{{ install_address }}</span></div>\n  <div class=\"row\"><b>Hiệu lực đến</b><span>{{ valid_till | date }}</span></div>\n</div>\n<table><thead><tr><th style=\"width:34px\">#</th><th>Hạng mục</th><th class=\"n\">Rộng</th><th class=\"n\">Cao</th><th class=\"n\">Bộ</th><th class=\"n\">Khối lượng</th><th class=\"n\">Đơn giá</th><th class=\"n\">Thành tiền</th></tr></thead><tbody>\n{{#each items}}<tr><td>{{ _index }}</td><td>{{ item_code }}<br><span class=\"sub\">{{ color }}</span></td><td class=\"n\">{{ width_mm }}</td><td class=\"n\">{{ height_mm }}</td><td class=\"n\">{{ set_count }}</td><td class=\"n\">{{ qty | number }}</td><td class=\"n\">{{ rate | money }}</td><td class=\"n\">{{ amount | money }}</td></tr>{{/each}}\n</tbody></table>\n<div class=\"tot\"><div class=\"row big\"><span>Tổng cộng</span><span>{{ grand_total | money }} ₫</span></div></div>\n<div class=\"note\">Thanh toán: {{ payment_terms }}\nBảo hành: {{ warranty_note }}\nGhi chú: {{ note }}</div>\n<div class=\"sign\"><div><b>Khách hàng xác nhận</b>(ký, ghi rõ họ tên)</div><div></div><div><b>Đại diện ALUMDOOR</b>(ký, đóng dấu)</div></div>","css":"*{box-sizing:border-box} body{font-family:''Segoe UI'',Roboto,Arial,sans-serif;font-size:13px;color:#111;margin:0;padding:24px}\n.head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #c1121f;padding-bottom:12px;margin-bottom:16px}\n.brand{font-size:22px;font-weight:700;color:#c1121f;letter-spacing:.5px}\n.sub{font-size:11px;color:#555;margin-top:2px;line-height:1.5}\n.title{font-size:17px;font-weight:700;text-transform:uppercase;text-align:right}\n.no{font-size:12px;color:#555;text-align:right;margin-top:2px}\n.grid{display:grid;grid-template-columns:1fr 1fr;gap:6px 24px;margin-bottom:14px}\n.row{display:flex;gap:8px} .row b{min-width:110px;color:#555;font-weight:600}\ntable{width:100%;border-collapse:collapse;margin-top:8px} th,td{border:1px solid #ccc;padding:6px 8px}\nth{background:#f3f4f6;font-size:11px;text-transform:uppercase;letter-spacing:.3px;text-align:left}\ntd.n,th.n{text-align:right;font-variant-numeric:tabular-nums}\n.tot{margin-top:12px;margin-left:auto;width:290px}\n.tot .row{justify-content:space-between;padding:5px 0;border-bottom:1px dashed #ddd}\n.tot .big{font-size:16px;font-weight:700;color:#c1121f;border-bottom:none}\n.sign{display:flex;justify-content:space-between;margin-top:36px;text-align:center}\n.sign div{width:30%} .sign b{display:block;margin-bottom:52px;font-size:12px}\n.note{margin-top:14px;font-size:11px;color:#555;white-space:pre-wrap}","is_default":true,"disabled":false,"revision":1}'),
    '$.revision',
    COALESCE((SELECT revision+1 FROM print_formats WHERE tenant_id='alu' AND name='Báo giá ALUMDOOR'),1)
  ),
  'admin','2026-07-29T01:00:00.000Z'
WHERE EXISTS (
    SELECT 1 FROM installed_apps
    WHERE tenant_id='alu' AND app_id='alumdoor'
      AND version IN ('1.18.5', '1.19.0')
      AND content_hash<>'b1a2c6e95af2eef2eda92d4013132d0601e39ccb338f53ae0ed982a76f273ee8'
  )
ON CONFLICT(tenant_id,name) DO UPDATE SET
  doc_type=excluded.doc_type,is_default=excluded.is_default,disabled=excluded.disabled,
  revision=excluded.revision,format_json=excluded.format_json,
  modified_by=excluded.modified_by,modified_at=excluded.modified_at;

INSERT INTO print_formats(
  tenant_id,name,doc_type,is_default,disabled,revision,format_json,modified_by,modified_at
)
SELECT
  'alu','Đơn mua hàng ALUMDOOR','Purchase Order',1,0,
  COALESCE((SELECT revision+1 FROM print_formats WHERE tenant_id='alu' AND name='Đơn mua hàng ALUMDOOR'),1),
  json_set(
    json('{"name":"Đơn mua hàng ALUMDOOR","doc_type":"Purchase Order","format_type":"Standard","html":"<div class=\"head\">\n  <div><div class=\"brand\">ALUMDOOR</div>\n  <div class=\"sub\">Cửa cuốn công nghệ Đức / Úc<br>Xưởng 1: 12B đường số 2, P. Bình Hưng Hoà, Q. Bình Tân, TP.HCM<br>Xưởng 2: 36 đường số 7, P. Bình Hưng Hoà, Q. Bình Tân, TP.HCM</div></div>\n  <div><div class=\"title\">Đơn đặt hàng</div><div class=\"no\">Số: {{ name }}<br>Ngày: {{ transaction_date | date }}</div></div>\n</div>\n<div class=\"grid\">\n  <div class=\"row\"><b>Nhà cung cấp</b><span>{{ supplier }}</span></div>\n  <div class=\"row\"><b>Ngày hẹn giao</b><span>{{ schedule_date | date }}</span></div>\n  <div class=\"row\"><b>Theo báo giá</b><span>{{ supplier_quotation }}</span></div>\n  <div class=\"row\"><b>Tiền tệ</b><span>{{ currency }}</span></div>\n</div>\n<table><thead><tr><th style=\"width:34px\">#</th><th>Mã hàng</th><th class=\"n\">Số lượng</th><th>ĐVT</th><th class=\"n\">Quy ra</th><th class=\"n\">Đơn giá</th><th class=\"n\">Thành tiền</th></tr></thead><tbody>\n{{#each items}}<tr><td>{{ _index }}</td><td>{{ item_code }}<br><span class=\"sub\">{{ note }}</span></td><td class=\"n\">{{ qty | number }}</td><td>{{ uom }}</td><td class=\"n\">{{ stock_qty | number }} {{ stock_uom }}</td><td class=\"n\">{{ rate | money }}</td><td class=\"n\">{{ amount | money }}</td></tr>{{/each}}\n</tbody></table>\n<div class=\"tot\"><div class=\"row big\"><span>Tổng cộng</span><span>{{ grand_total | money }} ₫</span></div></div>\n<div class=\"note\">Giao hàng tại: Xưởng 1 — 12B đường số 2, P. Bình Hưng Hoà, Q. Bình Tân, TP.HCM\nGhi chú: {{ note }}</div>\n<div class=\"sign\"><div><b>Nhà cung cấp xác nhận</b>(ký, đóng dấu)</div><div><b>Người lập đơn</b>(ký, ghi rõ họ tên)</div><div><b>Đại diện ALUMDOOR</b>(ký, đóng dấu)</div></div>","css":"*{box-sizing:border-box} body{font-family:''Segoe UI'',Roboto,Arial,sans-serif;font-size:13px;color:#111;margin:0;padding:24px}\n.head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #c1121f;padding-bottom:12px;margin-bottom:16px}\n.brand{font-size:22px;font-weight:700;color:#c1121f;letter-spacing:.5px}\n.sub{font-size:11px;color:#555;margin-top:2px;line-height:1.5}\n.title{font-size:17px;font-weight:700;text-transform:uppercase;text-align:right}\n.no{font-size:12px;color:#555;text-align:right;margin-top:2px}\n.grid{display:grid;grid-template-columns:1fr 1fr;gap:6px 24px;margin-bottom:14px}\n.row{display:flex;gap:8px} .row b{min-width:110px;color:#555;font-weight:600}\ntable{width:100%;border-collapse:collapse;margin-top:8px} th,td{border:1px solid #ccc;padding:6px 8px}\nth{background:#f3f4f6;font-size:11px;text-transform:uppercase;letter-spacing:.3px;text-align:left}\ntd.n,th.n{text-align:right;font-variant-numeric:tabular-nums}\n.tot{margin-top:12px;margin-left:auto;width:290px}\n.tot .row{justify-content:space-between;padding:5px 0;border-bottom:1px dashed #ddd}\n.tot .big{font-size:16px;font-weight:700;color:#c1121f;border-bottom:none}\n.sign{display:flex;justify-content:space-between;margin-top:36px;text-align:center}\n.sign div{width:30%} .sign b{display:block;margin-bottom:52px;font-size:12px}\n.note{margin-top:14px;font-size:11px;color:#555;white-space:pre-wrap}","is_default":true,"disabled":false,"revision":1}'),
    '$.revision',
    COALESCE((SELECT revision+1 FROM print_formats WHERE tenant_id='alu' AND name='Đơn mua hàng ALUMDOOR'),1)
  ),
  'admin','2026-07-29T01:00:00.000Z'
WHERE EXISTS (
    SELECT 1 FROM installed_apps
    WHERE tenant_id='alu' AND app_id='alumdoor'
      AND version IN ('1.18.5', '1.19.0')
      AND content_hash<>'b1a2c6e95af2eef2eda92d4013132d0601e39ccb338f53ae0ed982a76f273ee8'
  )
ON CONFLICT(tenant_id,name) DO UPDATE SET
  doc_type=excluded.doc_type,is_default=excluded.is_default,disabled=excluded.disabled,
  revision=excluded.revision,format_json=excluded.format_json,
  modified_by=excluded.modified_by,modified_at=excluded.modified_at;

INSERT INTO print_formats(
  tenant_id,name,doc_type,is_default,disabled,revision,format_json,modified_by,modified_at
)
SELECT
  'alu','Phiếu nhập kho ALUMDOOR','Purchase Receipt',1,0,
  COALESCE((SELECT revision+1 FROM print_formats WHERE tenant_id='alu' AND name='Phiếu nhập kho ALUMDOOR'),1),
  json_set(
    json('{"name":"Phiếu nhập kho ALUMDOOR","doc_type":"Purchase Receipt","format_type":"Standard","html":"<div class=\"head\">\n  <div><div class=\"brand\">ALUMDOOR</div>\n  <div class=\"sub\">Cửa cuốn công nghệ Đức / Úc<br>Xưởng 1: 12B đường số 2, P. Bình Hưng Hoà, Q. Bình Tân, TP.HCM</div></div>\n  <div><div class=\"title\">Phiếu nhập kho</div><div class=\"no\">Số: {{ name }}<br>Ngày: {{ posting_at | date }}</div></div>\n</div>\n<div class=\"grid\">\n  <div class=\"row\"><b>Nhà cung cấp</b><span>{{ supplier }}</span></div>\n  <div class=\"row\"><b>Số phiếu giao NCC</b><span>{{ supplier_invoice_no }}</span></div>\n  <div class=\"row\"><b>Đơn mua</b><span>{{ against_purchase_order }}</span></div>\n  <div class=\"row\"><b>Người giao</b><span>{{ driver }}</span></div>\n</div>\n<table><thead><tr><th style=\"width:34px\">#</th><th>Mã hàng</th><th class=\"n\">Thực nhận</th><th>ĐVT</th><th class=\"n\">Vào kho</th><th>Kho</th><th>Theo đơn</th></tr></thead><tbody>\n{{#each items}}<tr><td>{{ _index }}</td><td>{{ item_code }}</td><td class=\"n\">{{ qty | number }}</td><td>{{ uom }}</td><td class=\"n\">{{ stock_qty | number }} {{ stock_uom }}</td><td>{{ warehouse }}</td><td>{{ purchase_order }}</td></tr>{{/each}}\n</tbody></table>\n<div class=\"note\">Ghi chú: {{ note }}</div>\n<div class=\"sign\"><div><b>Người giao hàng</b>(ký, ghi rõ họ tên)</div><div><b>Thủ kho</b>(ký, ghi rõ họ tên)</div><div><b>Phụ trách xưởng</b>(ký)</div></div>","css":"*{box-sizing:border-box} body{font-family:''Segoe UI'',Roboto,Arial,sans-serif;font-size:13px;color:#111;margin:0;padding:24px}\n.head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #c1121f;padding-bottom:12px;margin-bottom:16px}\n.brand{font-size:22px;font-weight:700;color:#c1121f;letter-spacing:.5px}\n.sub{font-size:11px;color:#555;margin-top:2px;line-height:1.5}\n.title{font-size:17px;font-weight:700;text-transform:uppercase;text-align:right}\n.no{font-size:12px;color:#555;text-align:right;margin-top:2px}\n.grid{display:grid;grid-template-columns:1fr 1fr;gap:6px 24px;margin-bottom:14px}\n.row{display:flex;gap:8px} .row b{min-width:110px;color:#555;font-weight:600}\ntable{width:100%;border-collapse:collapse;margin-top:8px} th,td{border:1px solid #ccc;padding:6px 8px}\nth{background:#f3f4f6;font-size:11px;text-transform:uppercase;letter-spacing:.3px;text-align:left}\ntd.n,th.n{text-align:right;font-variant-numeric:tabular-nums}\n.sign{display:flex;justify-content:space-between;margin-top:36px;text-align:center}\n.sign div{width:30%} .sign b{display:block;margin-bottom:52px;font-size:12px}\n.note{margin-top:14px;font-size:11px;color:#555;white-space:pre-wrap}","is_default":true,"disabled":false,"revision":1}'),
    '$.revision',
    COALESCE((SELECT revision+1 FROM print_formats WHERE tenant_id='alu' AND name='Phiếu nhập kho ALUMDOOR'),1)
  ),
  'admin','2026-07-29T01:00:00.000Z'
WHERE EXISTS (
    SELECT 1 FROM installed_apps
    WHERE tenant_id='alu' AND app_id='alumdoor'
      AND version IN ('1.18.5', '1.19.0')
      AND content_hash<>'b1a2c6e95af2eef2eda92d4013132d0601e39ccb338f53ae0ed982a76f273ee8'
  )
ON CONFLICT(tenant_id,name) DO UPDATE SET
  doc_type=excluded.doc_type,is_default=excluded.is_default,disabled=excluded.disabled,
  revision=excluded.revision,format_json=excluded.format_json,
  modified_by=excluded.modified_by,modified_at=excluded.modified_at;

INSERT INTO print_formats(
  tenant_id,name,doc_type,is_default,disabled,revision,format_json,modified_by,modified_at
)
SELECT
  'alu','Yêu cầu báo giá ALUMDOOR','Request for Quotation',1,0,
  COALESCE((SELECT revision+1 FROM print_formats WHERE tenant_id='alu' AND name='Yêu cầu báo giá ALUMDOOR'),1),
  json_set(
    json('{"name":"Yêu cầu báo giá ALUMDOOR","doc_type":"Request for Quotation","format_type":"Standard","html":"<div class=\"head\">\n  <div><div class=\"brand\">ALUMDOOR</div>\n  <div class=\"sub\">Cửa cuốn công nghệ Đức / Úc<br>Xưởng 1: 12B đường số 2, P. Bình Hưng Hoà, Q. Bình Tân, TP.HCM</div></div>\n  <div><div class=\"title\">Yêu cầu báo giá</div><div class=\"no\">Số: {{ name }}<br>Ngày: {{ transaction_date | date }}</div></div>\n</div>\n<div class=\"grid\">\n  <div class=\"row\"><b>Hạn trả lời</b><span>{{ response_by | date }}</span></div>\n  <div class=\"row\"><b>Theo yêu cầu VT</b><span>{{ material_request }}</span></div>\n</div>\n<p class=\"sub\">Kính gửi Quý nhà cung cấp — ALUMDOOR đề nghị báo giá cho các mặt hàng dưới đây. Xin điền đơn giá và số ngày giao vào hai cột để trống.</p>\n<table><thead><tr><th style=\"width:34px\">#</th><th>Mã hàng</th><th class=\"n\">Số lượng</th><th>ĐVT</th><th class=\"n\">Cần trước</th><th class=\"n\">Đơn giá NCC chào</th><th class=\"n\">Số ngày giao</th></tr></thead><tbody>\n{{#each items}}<tr><td>{{ _index }}</td><td>{{ item_code }}<br><span class=\"sub\">{{ note }}</span></td><td class=\"n\">{{ qty | number }}</td><td>{{ uom }}</td><td class=\"n\">{{ schedule_date | date }}</td><td class=\"fill\"></td><td class=\"fill\"></td></tr>{{/each}}\n</tbody></table>\n<div class=\"note\">Điều kiện mong muốn: {{ note }}\nGiao hàng tại: Xưởng 1 — 12B đường số 2, P. Bình Hưng Hoà, Q. Bình Tân, TP.HCM</div>\n<div class=\"sign\"><div><b>Nhà cung cấp báo giá</b>(ký, ghi rõ họ tên, đóng dấu)</div><div><b>Người lập yêu cầu</b>(ký, ghi rõ họ tên)</div></div>","css":"*{box-sizing:border-box} body{font-family:''Segoe UI'',Roboto,Arial,sans-serif;font-size:13px;color:#111;margin:0;padding:24px}\n.head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #c1121f;padding-bottom:12px;margin-bottom:16px}\n.brand{font-size:22px;font-weight:700;color:#c1121f;letter-spacing:.5px}\n.sub{font-size:11px;color:#555;margin-top:2px;line-height:1.5}\n.title{font-size:17px;font-weight:700;text-transform:uppercase;text-align:right}\n.no{font-size:12px;color:#555;text-align:right;margin-top:2px}\n.grid{display:grid;grid-template-columns:1fr 1fr;gap:6px 24px;margin-bottom:14px}\n.row{display:flex;gap:8px} .row b{min-width:110px;color:#555;font-weight:600}\ntable{width:100%;border-collapse:collapse;margin-top:8px} th,td{border:1px solid #ccc;padding:6px 8px}\nth{background:#f3f4f6;font-size:11px;text-transform:uppercase;letter-spacing:.3px;text-align:left}\ntd.n,th.n{text-align:right;font-variant-numeric:tabular-nums}\ntd.fill{background:#fffbe6;min-width:110px}\n.sign{display:flex;justify-content:space-between;margin-top:36px;text-align:center}\n.sign div{width:45%} .sign b{display:block;margin-bottom:52px;font-size:12px}\n.note{margin-top:14px;font-size:11px;color:#555;white-space:pre-wrap}","is_default":true,"disabled":false,"revision":1}'),
    '$.revision',
    COALESCE((SELECT revision+1 FROM print_formats WHERE tenant_id='alu' AND name='Yêu cầu báo giá ALUMDOOR'),1)
  ),
  'admin','2026-07-29T01:00:00.000Z'
WHERE EXISTS (
    SELECT 1 FROM installed_apps
    WHERE tenant_id='alu' AND app_id='alumdoor'
      AND version IN ('1.18.5', '1.19.0')
      AND content_hash<>'b1a2c6e95af2eef2eda92d4013132d0601e39ccb338f53ae0ed982a76f273ee8'
  )
ON CONFLICT(tenant_id,name) DO UPDATE SET
  doc_type=excluded.doc_type,is_default=excluded.is_default,disabled=excluded.disabled,
  revision=excluded.revision,format_json=excluded.format_json,
  modified_by=excluded.modified_by,modified_at=excluded.modified_at;

INSERT INTO master_records(tenant_id,record_type,name,disabled,data_json,modified_at)
SELECT 'alu','Company','ALUMDOOR',0,
       '{"label":"ALUMDOOR — Cửa cuốn công nghệ Đức/Úc","abbr":"AD","default_currency":"VND","default_inventory_account":"Hàng tồn kho","default_cogs_account":"Giá vốn hàng bán"}','2026-07-29T01:00:00.000Z'
WHERE EXISTS (
    SELECT 1 FROM installed_apps
    WHERE tenant_id='alu' AND app_id='alumdoor'
      AND version IN ('1.18.5', '1.19.0')
      AND content_hash<>'b1a2c6e95af2eef2eda92d4013132d0601e39ccb338f53ae0ed982a76f273ee8'
  )
ON CONFLICT(tenant_id,record_type,name) DO UPDATE SET
  data_json=excluded.data_json,modified_at=excluded.modified_at;

INSERT INTO master_records(tenant_id,record_type,name,disabled,data_json,modified_at)
SELECT 'alu','Currency','VND',0,
       '{"currency_scale":0}','2026-07-29T01:00:00.000Z'
WHERE EXISTS (
    SELECT 1 FROM installed_apps
    WHERE tenant_id='alu' AND app_id='alumdoor'
      AND version IN ('1.18.5', '1.19.0')
      AND content_hash<>'b1a2c6e95af2eef2eda92d4013132d0601e39ccb338f53ae0ed982a76f273ee8'
  )
ON CONFLICT(tenant_id,record_type,name) DO UPDATE SET
  data_json=excluded.data_json,modified_at=excluded.modified_at;

INSERT INTO master_records(tenant_id,record_type,name,disabled,data_json,modified_at)
SELECT 'alu','UOM','Cái',0,
       '{"uom_name":"Cái","must_be_whole_number":true}','2026-07-29T01:00:00.000Z'
WHERE EXISTS (
    SELECT 1 FROM installed_apps
    WHERE tenant_id='alu' AND app_id='alumdoor'
      AND version IN ('1.18.5', '1.19.0')
      AND content_hash<>'b1a2c6e95af2eef2eda92d4013132d0601e39ccb338f53ae0ed982a76f273ee8'
  )
ON CONFLICT(tenant_id,record_type,name) DO UPDATE SET
  data_json=excluded.data_json,modified_at=excluded.modified_at;

INSERT INTO master_records(tenant_id,record_type,name,disabled,data_json,modified_at)
SELECT 'alu','UOM','Bộ',0,
       '{"uom_name":"Bộ","must_be_whole_number":true}','2026-07-29T01:00:00.000Z'
WHERE EXISTS (
    SELECT 1 FROM installed_apps
    WHERE tenant_id='alu' AND app_id='alumdoor'
      AND version IN ('1.18.5', '1.19.0')
      AND content_hash<>'b1a2c6e95af2eef2eda92d4013132d0601e39ccb338f53ae0ed982a76f273ee8'
  )
ON CONFLICT(tenant_id,record_type,name) DO UPDATE SET
  data_json=excluded.data_json,modified_at=excluded.modified_at;

INSERT INTO master_records(tenant_id,record_type,name,disabled,data_json,modified_at)
SELECT 'alu','UOM','Kg',0,
       '{"uom_name":"Kg"}','2026-07-29T01:00:00.000Z'
WHERE EXISTS (
    SELECT 1 FROM installed_apps
    WHERE tenant_id='alu' AND app_id='alumdoor'
      AND version IN ('1.18.5', '1.19.0')
      AND content_hash<>'b1a2c6e95af2eef2eda92d4013132d0601e39ccb338f53ae0ed982a76f273ee8'
  )
ON CONFLICT(tenant_id,record_type,name) DO UPDATE SET
  data_json=excluded.data_json,modified_at=excluded.modified_at;

INSERT INTO master_records(tenant_id,record_type,name,disabled,data_json,modified_at)
SELECT 'alu','UOM','Mét',0,
       '{"uom_name":"Mét"}','2026-07-29T01:00:00.000Z'
WHERE EXISTS (
    SELECT 1 FROM installed_apps
    WHERE tenant_id='alu' AND app_id='alumdoor'
      AND version IN ('1.18.5', '1.19.0')
      AND content_hash<>'b1a2c6e95af2eef2eda92d4013132d0601e39ccb338f53ae0ed982a76f273ee8'
  )
ON CONFLICT(tenant_id,record_type,name) DO UPDATE SET
  data_json=excluded.data_json,modified_at=excluded.modified_at;

INSERT INTO master_records(tenant_id,record_type,name,disabled,data_json,modified_at)
SELECT 'alu','UOM','m2',0,
       '{"uom_name":"m2"}','2026-07-29T01:00:00.000Z'
WHERE EXISTS (
    SELECT 1 FROM installed_apps
    WHERE tenant_id='alu' AND app_id='alumdoor'
      AND version IN ('1.18.5', '1.19.0')
      AND content_hash<>'b1a2c6e95af2eef2eda92d4013132d0601e39ccb338f53ae0ed982a76f273ee8'
  )
ON CONFLICT(tenant_id,record_type,name) DO UPDATE SET
  data_json=excluded.data_json,modified_at=excluded.modified_at;

INSERT INTO master_records(tenant_id,record_type,name,disabled,data_json,modified_at)
SELECT 'alu','UOM','Cây',0,
       '{"uom_name":"Cây","must_be_whole_number":true}','2026-07-29T01:00:00.000Z'
WHERE EXISTS (
    SELECT 1 FROM installed_apps
    WHERE tenant_id='alu' AND app_id='alumdoor'
      AND version IN ('1.18.5', '1.19.0')
      AND content_hash<>'b1a2c6e95af2eef2eda92d4013132d0601e39ccb338f53ae0ed982a76f273ee8'
  )
ON CONFLICT(tenant_id,record_type,name) DO UPDATE SET
  data_json=excluded.data_json,modified_at=excluded.modified_at;

INSERT INTO master_records(tenant_id,record_type,name,disabled,data_json,modified_at)
SELECT 'alu','UOM','Thanh',0,
       '{"uom_name":"Thanh","must_be_whole_number":true}','2026-07-29T01:00:00.000Z'
WHERE EXISTS (
    SELECT 1 FROM installed_apps
    WHERE tenant_id='alu' AND app_id='alumdoor'
      AND version IN ('1.18.5', '1.19.0')
      AND content_hash<>'b1a2c6e95af2eef2eda92d4013132d0601e39ccb338f53ae0ed982a76f273ee8'
  )
ON CONFLICT(tenant_id,record_type,name) DO UPDATE SET
  data_json=excluded.data_json,modified_at=excluded.modified_at;

INSERT INTO master_records(tenant_id,record_type,name,disabled,data_json,modified_at)
SELECT 'alu','UOM','Sợi',0,
       '{"uom_name":"Sợi","must_be_whole_number":true}','2026-07-29T01:00:00.000Z'
WHERE EXISTS (
    SELECT 1 FROM installed_apps
    WHERE tenant_id='alu' AND app_id='alumdoor'
      AND version IN ('1.18.5', '1.19.0')
      AND content_hash<>'b1a2c6e95af2eef2eda92d4013132d0601e39ccb338f53ae0ed982a76f273ee8'
  )
ON CONFLICT(tenant_id,record_type,name) DO UPDATE SET
  data_json=excluded.data_json,modified_at=excluded.modified_at;

INSERT INTO master_records(tenant_id,record_type,name,disabled,data_json,modified_at)
SELECT 'alu','UOM','Cuộn',0,
       '{"uom_name":"Cuộn","must_be_whole_number":true}','2026-07-29T01:00:00.000Z'
WHERE EXISTS (
    SELECT 1 FROM installed_apps
    WHERE tenant_id='alu' AND app_id='alumdoor'
      AND version IN ('1.18.5', '1.19.0')
      AND content_hash<>'b1a2c6e95af2eef2eda92d4013132d0601e39ccb338f53ae0ed982a76f273ee8'
  )
ON CONFLICT(tenant_id,record_type,name) DO UPDATE SET
  data_json=excluded.data_json,modified_at=excluded.modified_at;

INSERT INTO master_records(tenant_id,record_type,name,disabled,data_json,modified_at)
SELECT 'alu','UOM','Tấm',0,
       '{"uom_name":"Tấm","must_be_whole_number":true}','2026-07-29T01:00:00.000Z'
WHERE EXISTS (
    SELECT 1 FROM installed_apps
    WHERE tenant_id='alu' AND app_id='alumdoor'
      AND version IN ('1.18.5', '1.19.0')
      AND content_hash<>'b1a2c6e95af2eef2eda92d4013132d0601e39ccb338f53ae0ed982a76f273ee8'
  )
ON CONFLICT(tenant_id,record_type,name) DO UPDATE SET
  data_json=excluded.data_json,modified_at=excluded.modified_at;

INSERT INTO master_records(tenant_id,record_type,name,disabled,data_json,modified_at)
SELECT 'alu','UOM','Túi',0,
       '{"uom_name":"Túi","must_be_whole_number":true}','2026-07-29T01:00:00.000Z'
WHERE EXISTS (
    SELECT 1 FROM installed_apps
    WHERE tenant_id='alu' AND app_id='alumdoor'
      AND version IN ('1.18.5', '1.19.0')
      AND content_hash<>'b1a2c6e95af2eef2eda92d4013132d0601e39ccb338f53ae0ed982a76f273ee8'
  )
ON CONFLICT(tenant_id,record_type,name) DO UPDATE SET
  data_json=excluded.data_json,modified_at=excluded.modified_at;

INSERT INTO master_records(tenant_id,record_type,name,disabled,data_json,modified_at)
SELECT 'alu','UOM','Hộp',0,
       '{"uom_name":"Hộp","must_be_whole_number":true}','2026-07-29T01:00:00.000Z'
WHERE EXISTS (
    SELECT 1 FROM installed_apps
    WHERE tenant_id='alu' AND app_id='alumdoor'
      AND version IN ('1.18.5', '1.19.0')
      AND content_hash<>'b1a2c6e95af2eef2eda92d4013132d0601e39ccb338f53ae0ed982a76f273ee8'
  )
ON CONFLICT(tenant_id,record_type,name) DO UPDATE SET
  data_json=excluded.data_json,modified_at=excluded.modified_at;

INSERT INTO master_records(tenant_id,record_type,name,disabled,data_json,modified_at)
SELECT 'alu','UOM','Bình',0,
       '{"uom_name":"Bình","must_be_whole_number":true}','2026-07-29T01:00:00.000Z'
WHERE EXISTS (
    SELECT 1 FROM installed_apps
    WHERE tenant_id='alu' AND app_id='alumdoor'
      AND version IN ('1.18.5', '1.19.0')
      AND content_hash<>'b1a2c6e95af2eef2eda92d4013132d0601e39ccb338f53ae0ed982a76f273ee8'
  )
ON CONFLICT(tenant_id,record_type,name) DO UPDATE SET
  data_json=excluded.data_json,modified_at=excluded.modified_at;

INSERT INTO master_records(tenant_id,record_type,name,disabled,data_json,modified_at)
SELECT 'alu','UOM','Lít',0,
       '{"uom_name":"Lít"}','2026-07-29T01:00:00.000Z'
WHERE EXISTS (
    SELECT 1 FROM installed_apps
    WHERE tenant_id='alu' AND app_id='alumdoor'
      AND version IN ('1.18.5', '1.19.0')
      AND content_hash<>'b1a2c6e95af2eef2eda92d4013132d0601e39ccb338f53ae0ed982a76f273ee8'
  )
ON CONFLICT(tenant_id,record_type,name) DO UPDATE SET
  data_json=excluded.data_json,modified_at=excluded.modified_at;

INSERT INTO master_records(tenant_id,record_type,name,disabled,data_json,modified_at)
SELECT 'alu','Item Group','Tất cả mặt hàng',0,
       '{"item_group_name":"Tất cả mặt hàng","is_group":true}','2026-07-29T01:00:00.000Z'
WHERE EXISTS (
    SELECT 1 FROM installed_apps
    WHERE tenant_id='alu' AND app_id='alumdoor'
      AND version IN ('1.18.5', '1.19.0')
      AND content_hash<>'b1a2c6e95af2eef2eda92d4013132d0601e39ccb338f53ae0ed982a76f273ee8'
  )
ON CONFLICT(tenant_id,record_type,name) DO UPDATE SET
  data_json=excluded.data_json,modified_at=excluded.modified_at;

INSERT INTO master_records(tenant_id,record_type,name,disabled,data_json,modified_at)
SELECT 'alu','Item Group','Thành phẩm',0,
       '{"item_group_name":"Thành phẩm","parent_item_group":"Tất cả mặt hàng","is_group":true}','2026-07-29T01:00:00.000Z'
WHERE EXISTS (
    SELECT 1 FROM installed_apps
    WHERE tenant_id='alu' AND app_id='alumdoor'
      AND version IN ('1.18.5', '1.19.0')
      AND content_hash<>'b1a2c6e95af2eef2eda92d4013132d0601e39ccb338f53ae0ed982a76f273ee8'
  )
ON CONFLICT(tenant_id,record_type,name) DO UPDATE SET
  data_json=excluded.data_json,modified_at=excluded.modified_at;

INSERT INTO master_records(tenant_id,record_type,name,disabled,data_json,modified_at)
SELECT 'alu','Item Group','Nguyên vật liệu',0,
       '{"item_group_name":"Nguyên vật liệu","parent_item_group":"Tất cả mặt hàng","is_group":true}','2026-07-29T01:00:00.000Z'
WHERE EXISTS (
    SELECT 1 FROM installed_apps
    WHERE tenant_id='alu' AND app_id='alumdoor'
      AND version IN ('1.18.5', '1.19.0')
      AND content_hash<>'b1a2c6e95af2eef2eda92d4013132d0601e39ccb338f53ae0ed982a76f273ee8'
  )
ON CONFLICT(tenant_id,record_type,name) DO UPDATE SET
  data_json=excluded.data_json,modified_at=excluded.modified_at;

INSERT INTO master_records(tenant_id,record_type,name,disabled,data_json,modified_at)
SELECT 'alu','Item Group','Linh kiện & thiết bị',0,
       '{"item_group_name":"Linh kiện & thiết bị","parent_item_group":"Tất cả mặt hàng","is_group":true}','2026-07-29T01:00:00.000Z'
WHERE EXISTS (
    SELECT 1 FROM installed_apps
    WHERE tenant_id='alu' AND app_id='alumdoor'
      AND version IN ('1.18.5', '1.19.0')
      AND content_hash<>'b1a2c6e95af2eef2eda92d4013132d0601e39ccb338f53ae0ed982a76f273ee8'
  )
ON CONFLICT(tenant_id,record_type,name) DO UPDATE SET
  data_json=excluded.data_json,modified_at=excluded.modified_at;

INSERT INTO master_records(tenant_id,record_type,name,disabled,data_json,modified_at)
SELECT 'alu','Item Group','Dịch vụ',0,
       '{"item_group_name":"Dịch vụ","parent_item_group":"Tất cả mặt hàng"}','2026-07-29T01:00:00.000Z'
WHERE EXISTS (
    SELECT 1 FROM installed_apps
    WHERE tenant_id='alu' AND app_id='alumdoor'
      AND version IN ('1.18.5', '1.19.0')
      AND content_hash<>'b1a2c6e95af2eef2eda92d4013132d0601e39ccb338f53ae0ed982a76f273ee8'
  )
ON CONFLICT(tenant_id,record_type,name) DO UPDATE SET
  data_json=excluded.data_json,modified_at=excluded.modified_at;

INSERT INTO master_records(tenant_id,record_type,name,disabled,data_json,modified_at)
SELECT 'alu','Item Group','Cửa cuốn',0,
       '{"item_group_name":"Cửa cuốn","parent_item_group":"Thành phẩm"}','2026-07-29T01:00:00.000Z'
WHERE EXISTS (
    SELECT 1 FROM installed_apps
    WHERE tenant_id='alu' AND app_id='alumdoor'
      AND version IN ('1.18.5', '1.19.0')
      AND content_hash<>'b1a2c6e95af2eef2eda92d4013132d0601e39ccb338f53ae0ed982a76f273ee8'
  )
ON CONFLICT(tenant_id,record_type,name) DO UPDATE SET
  data_json=excluded.data_json,modified_at=excluded.modified_at;

INSERT INTO master_records(tenant_id,record_type,name,disabled,data_json,modified_at)
SELECT 'alu','Item Group','Cửa nhôm kính',0,
       '{"item_group_name":"Cửa nhôm kính","parent_item_group":"Thành phẩm"}','2026-07-29T01:00:00.000Z'
WHERE EXISTS (
    SELECT 1 FROM installed_apps
    WHERE tenant_id='alu' AND app_id='alumdoor'
      AND version IN ('1.18.5', '1.19.0')
      AND content_hash<>'b1a2c6e95af2eef2eda92d4013132d0601e39ccb338f53ae0ed982a76f273ee8'
  )
ON CONFLICT(tenant_id,record_type,name) DO UPDATE SET
  data_json=excluded.data_json,modified_at=excluded.modified_at;

INSERT INTO master_records(tenant_id,record_type,name,disabled,data_json,modified_at)
SELECT 'alu','Item Group','Nan/lá cửa',0,
       '{"item_group_name":"Nan/lá cửa","parent_item_group":"Nguyên vật liệu"}','2026-07-29T01:00:00.000Z'
WHERE EXISTS (
    SELECT 1 FROM installed_apps
    WHERE tenant_id='alu' AND app_id='alumdoor'
      AND version IN ('1.18.5', '1.19.0')
      AND content_hash<>'b1a2c6e95af2eef2eda92d4013132d0601e39ccb338f53ae0ed982a76f273ee8'
  )
ON CONFLICT(tenant_id,record_type,name) DO UPDATE SET
  data_json=excluded.data_json,modified_at=excluded.modified_at;

INSERT INTO master_records(tenant_id,record_type,name,disabled,data_json,modified_at)
SELECT 'alu','Item Group','Mô tơ',0,
       '{"item_group_name":"Mô tơ","parent_item_group":"Linh kiện & thiết bị"}','2026-07-29T01:00:00.000Z'
WHERE EXISTS (
    SELECT 1 FROM installed_apps
    WHERE tenant_id='alu' AND app_id='alumdoor'
      AND version IN ('1.18.5', '1.19.0')
      AND content_hash<>'b1a2c6e95af2eef2eda92d4013132d0601e39ccb338f53ae0ed982a76f273ee8'
  )
ON CONFLICT(tenant_id,record_type,name) DO UPDATE SET
  data_json=excluded.data_json,modified_at=excluded.modified_at;

INSERT INTO master_records(tenant_id,record_type,name,disabled,data_json,modified_at)
SELECT 'alu','Item Group','Ray và trục',0,
       '{"item_group_name":"Ray và trục","parent_item_group":"Nguyên vật liệu"}','2026-07-29T01:00:00.000Z'
WHERE EXISTS (
    SELECT 1 FROM installed_apps
    WHERE tenant_id='alu' AND app_id='alumdoor'
      AND version IN ('1.18.5', '1.19.0')
      AND content_hash<>'b1a2c6e95af2eef2eda92d4013132d0601e39ccb338f53ae0ed982a76f273ee8'
  )
ON CONFLICT(tenant_id,record_type,name) DO UPDATE SET
  data_json=excluded.data_json,modified_at=excluded.modified_at;

INSERT INTO master_records(tenant_id,record_type,name,disabled,data_json,modified_at)
SELECT 'alu','Item Group','Phụ kiện',0,
       '{"item_group_name":"Phụ kiện","parent_item_group":"Linh kiện & thiết bị"}','2026-07-29T01:00:00.000Z'
WHERE EXISTS (
    SELECT 1 FROM installed_apps
    WHERE tenant_id='alu' AND app_id='alumdoor'
      AND version IN ('1.18.5', '1.19.0')
      AND content_hash<>'b1a2c6e95af2eef2eda92d4013132d0601e39ccb338f53ae0ed982a76f273ee8'
  )
ON CONFLICT(tenant_id,record_type,name) DO UPDATE SET
  data_json=excluded.data_json,modified_at=excluded.modified_at;

INSERT INTO master_records(tenant_id,record_type,name,disabled,data_json,modified_at)
SELECT 'alu','Item Group','Remote và điều khiển',0,
       '{"item_group_name":"Remote và điều khiển","parent_item_group":"Linh kiện & thiết bị"}','2026-07-29T01:00:00.000Z'
WHERE EXISTS (
    SELECT 1 FROM installed_apps
    WHERE tenant_id='alu' AND app_id='alumdoor'
      AND version IN ('1.18.5', '1.19.0')
      AND content_hash<>'b1a2c6e95af2eef2eda92d4013132d0601e39ccb338f53ae0ed982a76f273ee8'
  )
ON CONFLICT(tenant_id,record_type,name) DO UPDATE SET
  data_json=excluded.data_json,modified_at=excluded.modified_at;

INSERT INTO master_records(tenant_id,record_type,name,disabled,data_json,modified_at)
SELECT 'alu','Item Group','Bộ lưu điện',0,
       '{"item_group_name":"Bộ lưu điện","parent_item_group":"Linh kiện & thiết bị"}','2026-07-29T01:00:00.000Z'
WHERE EXISTS (
    SELECT 1 FROM installed_apps
    WHERE tenant_id='alu' AND app_id='alumdoor'
      AND version IN ('1.18.5', '1.19.0')
      AND content_hash<>'b1a2c6e95af2eef2eda92d4013132d0601e39ccb338f53ae0ed982a76f273ee8'
  )
ON CONFLICT(tenant_id,record_type,name) DO UPDATE SET
  data_json=excluded.data_json,modified_at=excluded.modified_at;

INSERT INTO master_records(tenant_id,record_type,name,disabled,data_json,modified_at)
SELECT 'alu','Warehouse','Kho Alumdoor',0,
       '{"warehouse_name":"Kho Alumdoor","is_group":true,"disabled":false}','2026-07-29T01:00:00.000Z'
WHERE EXISTS (
    SELECT 1 FROM installed_apps
    WHERE tenant_id='alu' AND app_id='alumdoor'
      AND version IN ('1.18.5', '1.19.0')
      AND content_hash<>'b1a2c6e95af2eef2eda92d4013132d0601e39ccb338f53ae0ed982a76f273ee8'
  )
ON CONFLICT(tenant_id,record_type,name) DO UPDATE SET
  data_json=excluded.data_json,modified_at=excluded.modified_at;

INSERT INTO master_records(tenant_id,record_type,name,disabled,data_json,modified_at)
SELECT 'alu','Warehouse','K36',0,
       '{"warehouse_name":"K36","parent_warehouse":"Kho Alumdoor","is_group":false,"address":"Kho vật lý K36","disabled":false}','2026-07-29T01:00:00.000Z'
WHERE EXISTS (
    SELECT 1 FROM installed_apps
    WHERE tenant_id='alu' AND app_id='alumdoor'
      AND version IN ('1.18.5', '1.19.0')
      AND content_hash<>'b1a2c6e95af2eef2eda92d4013132d0601e39ccb338f53ae0ed982a76f273ee8'
  )
ON CONFLICT(tenant_id,record_type,name) DO UPDATE SET
  data_json=excluded.data_json,modified_at=excluded.modified_at;
