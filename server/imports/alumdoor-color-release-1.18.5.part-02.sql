-- Alumdoor 1.18.5: canonical color policy from Item through buying, stock, selling and production.
-- Generated from the compiler-normalized manifest. Existing Item and transaction documents are untouched.

INSERT INTO doctype_definitions(
  tenant_id,doctype,module,is_custom,is_submittable,is_child,revision,
  metadata_json,disabled,modified_by,modified_at
)
SELECT
  'alu',
  'Sales Order Item',
  'Alumdoor',
  0,
  0,
  1,
  COALESCE((
    SELECT revision + 1 FROM doctype_definitions
    WHERE tenant_id='alu' AND doctype='Sales Order Item'
  ), 1),
  json_set(
    json('{"name":"Sales Order Item","label":"Dòng đơn hàng","module":"Alumdoor","custom":false,"is_child":true,"is_tree":false,"is_single":false,"is_submittable":false,"track_changes":true,"track_seen":false,"allow_rename":false,"autoname":"autoincrement","title_field":"item_code","sort_order":"DESC","fields":[{"fieldname":"item_code","label":"Mã hàng","fieldtype":"Link","options":"Item","required":true,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"in_list_view":true,"in_standard_filter":true,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":1},{"fieldname":"width_mm","label":"Rộng (mm)","fieldtype":"Int","required":false,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"in_list_view":true,"in_standard_filter":false,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":2},{"fieldname":"height_mm","label":"Cao (mm)","fieldtype":"Int","required":false,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"in_list_view":true,"in_standard_filter":false,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":3},{"fieldname":"set_count","label":"Số bộ","fieldtype":"Int","required":false,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"default":"1","in_list_view":true,"in_standard_filter":false,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":4},{"fieldname":"qty","label":"SL","fieldtype":"Float","required":true,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"in_list_view":true,"in_standard_filter":false,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":5},{"fieldname":"rate","label":"Đơn giá","fieldtype":"Currency","required":true,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"in_list_view":true,"in_standard_filter":false,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":6},{"fieldname":"amount","label":"Thành tiền","fieldtype":"Currency","required":false,"read_only":true,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"in_list_view":true,"in_standard_filter":false,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":7},{"fieldname":"color","label":"Màu / mã sơn","fieldtype":"Link","options":"Item Color","required":false,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"in_list_view":false,"in_standard_filter":false,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":8},{"fieldname":"motor_model","label":"Mô tơ kèm theo","fieldtype":"Link","options":"Item","required":false,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"in_list_view":false,"in_standard_filter":false,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":9},{"fieldname":"accessories","label":"Phụ kiện kèm theo","fieldtype":"Small Text","required":false,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"in_list_view":false,"in_standard_filter":false,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":10},{"fieldname":"install_note","label":"Ghi chú lắp đặt","fieldtype":"Small Text","required":false,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"in_list_view":false,"in_standard_filter":false,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":11},{"fieldname":"warehouse","label":"Kho xuất","fieldtype":"Link","options":"Warehouse","required":false,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"in_list_view":false,"in_standard_filter":false,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":12},{"fieldname":"delivered_qty","label":"Đã giao","fieldtype":"Float","required":false,"read_only":true,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"in_list_view":false,"in_standard_filter":false,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":13}],"permissions":[{"role":"Chủ xưởng","read":true,"write":true,"create":true,"submit":false,"cancel":false,"amend":false,"print":true,"email":true,"report":true,"import":false,"export":true,"share":false,"if_owner":false,"permlevel":0},{"role":"Kinh doanh","read":true,"write":true,"create":true,"submit":false,"cancel":false,"amend":false,"print":true,"email":true,"report":true,"import":false,"export":true,"share":false,"if_owner":false,"permlevel":0},{"role":"Thủ kho","read":true,"write":false,"create":false,"submit":false,"cancel":false,"amend":false,"print":true,"email":true,"report":true,"import":false,"export":true,"share":false,"if_owner":false,"permlevel":0},{"role":"Kế toán","read":true,"write":false,"create":false,"submit":false,"cancel":false,"amend":false,"print":true,"email":true,"report":true,"import":false,"export":true,"share":false,"if_owner":false,"permlevel":0},{"role":"System Manager","read":true,"write":true,"create":true,"submit":true,"cancel":true,"amend":true,"print":true,"email":true,"report":true,"import":false,"export":true,"share":false,"if_owner":false,"permlevel":0}],"revision":1}'),
    '$.revision',
    COALESCE((
      SELECT revision + 1 FROM doctype_definitions
      WHERE tenant_id='alu' AND doctype='Sales Order Item'
    ), 1)
  ),
  0,
  'admin',
  '2026-07-29T00:30:00.000Z'
WHERE EXISTS (
    SELECT 1 FROM installed_apps
    WHERE tenant_id='alu' AND app_id='alumdoor' AND version IN ('1.18.4', '1.18.5')
  )
ON CONFLICT(tenant_id,doctype) DO UPDATE SET
  module=excluded.module,
  is_custom=excluded.is_custom,
  is_submittable=excluded.is_submittable,
  is_child=excluded.is_child,
  revision=excluded.revision,
  metadata_json=excluded.metadata_json,
  disabled=0,
  modified_by=excluded.modified_by,
  modified_at=excluded.modified_at;

INSERT INTO doctype_definitions(
  tenant_id,doctype,module,is_custom,is_submittable,is_child,revision,
  metadata_json,disabled,modified_by,modified_at
)
SELECT
  'alu',
  'Aluminium Lot',
  'Alumdoor',
  0,
  0,
  0,
  COALESCE((
    SELECT revision + 1 FROM doctype_definitions
    WHERE tenant_id='alu' AND doctype='Aluminium Lot'
  ), 1),
  json_set(
    json('{"name":"Aluminium Lot","label":"Lô nhôm tồn","module":"Alumdoor","custom":false,"is_child":false,"is_tree":false,"is_single":false,"is_submittable":false,"track_changes":true,"track_seen":false,"allow_rename":false,"autoname":"LN-.######","title_field":"profile","sort_order":"DESC","search_fields":["profile","colour"],"fields":[{"fieldname":"profile","label":"Mã nhôm","fieldtype":"Link","options":"Item","required":true,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"in_list_view":true,"in_standard_filter":true,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":1},{"fieldname":"colour","label":"Màu","fieldtype":"Link","options":"Item Color","required":true,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"in_list_view":true,"in_standard_filter":true,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":2},{"fieldname":"generation","label":"Đời sản phẩm","fieldtype":"Select","options":"MỚI\nCŨ\nTĐ","required":false,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"default":"MỚI","in_list_view":true,"in_standard_filter":true,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":3},{"fieldname":"width_m","label":"Khổ (m)","fieldtype":"Float","required":true,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"in_list_view":true,"in_standard_filter":false,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":4},{"fieldname":"sheet_count","label":"Số lá","fieldtype":"Float","required":true,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"in_list_view":true,"in_standard_filter":false,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":5},{"fieldname":"warehouse","label":"Kho","fieldtype":"Link","options":"Warehouse","required":true,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"in_list_view":true,"in_standard_filter":true,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":6},{"fieldname":"received_on","label":"Ngày nhập nhôm","fieldtype":"Date","required":false,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"in_list_view":false,"in_standard_filter":false,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":7},{"fieldname":"returned_on","label":"Ngày nhập lại","fieldtype":"Date","required":false,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"in_list_view":false,"in_standard_filter":false,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":8},{"fieldname":"stock_state","label":"Theo dõi tồn","fieldtype":"Select","options":"TỒN\nHẾT","required":false,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"default":"TỒN","in_list_view":true,"in_standard_filter":true,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":9},{"fieldname":"scrap_note","label":"Lá lẻ / phế","fieldtype":"Data","required":false,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"in_list_view":false,"in_standard_filter":false,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":10},{"fieldname":"note","label":"Ghi chú","fieldtype":"Small Text","required":false,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"in_list_view":false,"in_standard_filter":false,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":11}],"permissions":[{"role":"Chủ xưởng","read":true,"write":true,"create":true,"submit":false,"cancel":false,"amend":false,"print":true,"email":true,"report":true,"import":false,"export":true,"share":false,"if_owner":false,"permlevel":0},{"role":"Thủ kho","read":true,"write":true,"create":true,"submit":false,"cancel":false,"amend":false,"print":true,"email":true,"report":true,"import":false,"export":true,"share":false,"if_owner":false,"permlevel":0},{"role":"Sản xuất","read":true,"write":false,"create":false,"submit":false,"cancel":false,"amend":false,"print":true,"email":true,"report":true,"import":false,"export":true,"share":false,"if_owner":false,"permlevel":0},{"role":"Kinh doanh","read":true,"write":false,"create":false,"submit":false,"cancel":false,"amend":false,"print":true,"email":true,"report":true,"import":false,"export":true,"share":false,"if_owner":false,"permlevel":0},{"role":"Kế toán","read":true,"write":false,"create":false,"submit":false,"cancel":false,"amend":false,"print":true,"email":true,"report":true,"import":false,"export":true,"share":false,"if_owner":false,"permlevel":0},{"role":"System Manager","read":true,"write":true,"create":true,"submit":true,"cancel":true,"amend":true,"print":true,"email":true,"report":true,"import":false,"export":true,"share":false,"if_owner":false,"permlevel":0}],"revision":1}'),
    '$.revision',
    COALESCE((
      SELECT revision + 1 FROM doctype_definitions
      WHERE tenant_id='alu' AND doctype='Aluminium Lot'
    ), 1)
  ),
  0,
  'admin',
  '2026-07-29T00:30:00.000Z'
WHERE EXISTS (
    SELECT 1 FROM installed_apps
    WHERE tenant_id='alu' AND app_id='alumdoor' AND version IN ('1.18.4', '1.18.5')
  )
ON CONFLICT(tenant_id,doctype) DO UPDATE SET
  module=excluded.module,
  is_custom=excluded.is_custom,
  is_submittable=excluded.is_submittable,
  is_child=excluded.is_child,
  revision=excluded.revision,
  metadata_json=excluded.metadata_json,
  disabled=0,
  modified_by=excluded.modified_by,
  modified_at=excluded.modified_at;

INSERT INTO doctype_definitions(
  tenant_id,doctype,module,is_custom,is_submittable,is_child,revision,
  metadata_json,disabled,modified_by,modified_at
)
SELECT
  'alu',
  'Work Order',
  'Alumdoor',
  0,
  1,
  0,
  COALESCE((
    SELECT revision + 1 FROM doctype_definitions
    WHERE tenant_id='alu' AND doctype='Work Order'
  ), 1),
  json_set(
    json('{"name":"Work Order","label":"Lệnh sản xuất","module":"Alumdoor","custom":false,"is_child":false,"is_tree":false,"is_single":false,"is_submittable":true,"track_changes":true,"track_seen":false,"allow_rename":false,"autoname":"LSX-.YYYY.-####","title_field":"production_item","sort_order":"DESC","fields":[{"fieldname":"production_item","label":"Thành phẩm","fieldtype":"Link","options":"Item","required":true,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"in_list_view":true,"in_standard_filter":true,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":1},{"fieldname":"bom_no","label":"Định mức áp dụng","fieldtype":"Link","options":"Bill of Materials","required":true,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"in_list_view":true,"in_standard_filter":true,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":2},{"fieldname":"company","label":"Công ty","fieldtype":"Link","options":"Company","required":true,"read_only":false,"hidden":true,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"default":"ALUMDOOR","in_list_view":false,"in_standard_filter":false,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":3},{"fieldname":"qty","label":"Số lượng cần sản xuất","fieldtype":"Float","required":true,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"default":"1","in_list_view":true,"in_standard_filter":false,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":4},{"fieldname":"produced_qty","label":"Đã sản xuất","fieldtype":"Float","required":false,"read_only":true,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"in_list_view":true,"in_standard_filter":false,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":5},{"fieldname":"produced_percentage","label":"Tiến độ (%)","fieldtype":"Percent","required":false,"read_only":true,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"in_list_view":true,"in_standard_filter":false,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":6},{"fieldname":"width_mm","label":"Rộng (mm)","fieldtype":"Int","required":true,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"in_list_view":false,"in_standard_filter":false,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":7},{"fieldname":"height_mm","label":"Cao (mm)","fieldtype":"Int","required":true,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"in_list_view":false,"in_standard_filter":false,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":8},{"fieldname":"set_count","label":"Số bộ","fieldtype":"Int","required":false,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"default":"1","in_list_view":false,"in_standard_filter":false,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":9},{"fieldname":"color","label":"Màu / mã sơn","fieldtype":"Link","options":"Item Color","required":false,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"in_list_view":false,"in_standard_filter":false,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":10},{"fieldname":"motor_model","label":"Mô tơ","fieldtype":"Link","options":"Item","required":false,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"in_list_view":false,"in_standard_filter":false,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":11},{"fieldname":"source_warehouse","label":"Kho nguyên vật liệu","fieldtype":"Link","options":"Warehouse","required":true,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"in_list_view":false,"in_standard_filter":false,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":12},{"fieldname":"target_warehouse","label":"Kho nhập thành phẩm","fieldtype":"Link","options":"Warehouse","required":true,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"in_list_view":false,"in_standard_filter":false,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":13},{"fieldname":"against_sales_order","label":"Theo đơn hàng","fieldtype":"Link","options":"Sales Order","required":false,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"in_list_view":false,"in_standard_filter":false,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":14},{"fieldname":"planned_start_date","label":"Ngày bắt đầu","fieldtype":"Date","required":false,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"in_list_view":false,"in_standard_filter":false,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":15},{"fieldname":"planned_end_date","label":"Ngày hẹn giao","fieldtype":"Date","required":false,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"in_list_view":true,"in_standard_filter":false,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":16},{"fieldname":"install_address","label":"Địa chỉ lắp đặt","fieldtype":"Small Text","required":false,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"in_list_view":false,"in_standard_filter":false,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":17},{"fieldname":"note","label":"Ghi chú xưởng","fieldtype":"Small Text","required":false,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"in_list_view":false,"in_standard_filter":false,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":18}],"permissions":[{"role":"Chủ xưởng","read":true,"write":true,"create":true,"submit":false,"cancel":false,"amend":false,"print":true,"email":true,"report":true,"import":false,"export":true,"share":false,"if_owner":false,"permlevel":0},{"role":"Sản xuất","read":true,"write":true,"create":true,"submit":false,"cancel":false,"amend":false,"print":true,"email":true,"report":true,"import":false,"export":true,"share":false,"if_owner":false,"permlevel":0},{"role":"Kinh doanh","read":true,"write":false,"create":false,"submit":false,"cancel":false,"amend":false,"print":true,"email":true,"report":true,"import":false,"export":true,"share":false,"if_owner":false,"permlevel":0},{"role":"Thủ kho","read":true,"write":false,"create":false,"submit":false,"cancel":false,"amend":false,"print":true,"email":true,"report":true,"import":false,"export":true,"share":false,"if_owner":false,"permlevel":0},{"role":"Kế toán","read":true,"write":false,"create":false,"submit":false,"cancel":false,"amend":false,"print":true,"email":true,"report":true,"import":false,"export":true,"share":false,"if_owner":false,"permlevel":0},{"role":"System Manager","read":true,"write":true,"create":true,"submit":true,"cancel":true,"amend":true,"print":true,"email":true,"report":true,"import":false,"export":true,"share":false,"if_owner":false,"permlevel":0}],"revision":1}'),
    '$.revision',
    COALESCE((
      SELECT revision + 1 FROM doctype_definitions
      WHERE tenant_id='alu' AND doctype='Work Order'
    ), 1)
  ),
  0,
  'admin',
  '2026-07-29T00:30:00.000Z'
WHERE EXISTS (
    SELECT 1 FROM installed_apps
    WHERE tenant_id='alu' AND app_id='alumdoor' AND version IN ('1.18.4', '1.18.5')
  )
ON CONFLICT(tenant_id,doctype) DO UPDATE SET
  module=excluded.module,
  is_custom=excluded.is_custom,
  is_submittable=excluded.is_submittable,
  is_child=excluded.is_child,
  revision=excluded.revision,
  metadata_json=excluded.metadata_json,
  disabled=0,
  modified_by=excluded.modified_by,
  modified_at=excluded.modified_at;

INSERT INTO app_objects(tenant_id,app_id,object_type,object_name,object_scope)
SELECT 'alu','alumdoor','DocType','Item Allowed Color',''
WHERE EXISTS (
    SELECT 1 FROM installed_apps
    WHERE tenant_id='alu' AND app_id='alumdoor' AND version IN ('1.18.4', '1.18.5')
  )
ON CONFLICT(tenant_id,object_type,object_scope,object_name) DO UPDATE SET app_id=excluded.app_id;

UPDATE installed_apps
SET manifest_json = CASE
      WHEN EXISTS (
        SELECT 1 FROM json_each(installed_apps.manifest_json, '$.doctypes')
        WHERE json_extract(value, '$.name')='Item Allowed Color'
      )
      THEN json_set(
        manifest_json,
        '$.doctypes[' || (
          SELECT CAST(key AS TEXT)
          FROM json_each(installed_apps.manifest_json, '$.doctypes')
          WHERE json_extract(value, '$.name')='Item Allowed Color'
          LIMIT 1
        ) || ']',
        json('{"name":"Item Allowed Color","label":"Màu áp dụng cho mặt hàng","module":"Alumdoor","custom":false,"is_child":true,"is_tree":false,"is_single":false,"is_submittable":false,"track_changes":true,"track_seen":false,"allow_rename":false,"autoname":"autoincrement","title_field":"color","sort_order":"DESC","fields":[{"fieldname":"color","label":"Mã màu","fieldtype":"Link","options":"Item Color","required":true,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"in_list_view":true,"in_standard_filter":true,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":1},{"fieldname":"note","label":"Ghi chú áp dụng","fieldtype":"Data","required":false,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"in_list_view":true,"in_standard_filter":false,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":2}],"permissions":[{"role":"Chủ xưởng","read":true,"write":true,"create":true,"submit":false,"cancel":false,"amend":false,"print":true,"email":true,"report":true,"import":false,"export":true,"share":false,"if_owner":false,"permlevel":0},{"role":"Thủ kho","read":true,"write":true,"create":true,"submit":false,"cancel":false,"amend":false,"print":true,"email":true,"report":true,"import":false,"export":true,"share":false,"if_owner":false,"permlevel":0},{"role":"Kế toán","read":true,"write":false,"create":false,"submit":false,"cancel":false,"amend":false,"print":true,"email":true,"report":true,"import":false,"export":true,"share":false,"if_owner":false,"permlevel":0},{"role":"Sản xuất","read":true,"write":false,"create":false,"submit":false,"cancel":false,"amend":false,"print":true,"email":true,"report":true,"import":false,"export":true,"share":false,"if_owner":false,"permlevel":0},{"role":"Kinh doanh","read":true,"write":false,"create":false,"submit":false,"cancel":false,"amend":false,"print":true,"email":true,"report":true,"import":false,"export":true,"share":false,"if_owner":false,"permlevel":0},{"role":"System Manager","read":true,"write":true,"create":true,"submit":true,"cancel":true,"amend":true,"print":true,"email":true,"report":true,"import":false,"export":true,"share":false,"if_owner":false,"permlevel":0}],"revision":1}')
      )
      ELSE json_insert(manifest_json, '$.doctypes[#]', json('{"name":"Item Allowed Color","label":"Màu áp dụng cho mặt hàng","module":"Alumdoor","custom":false,"is_child":true,"is_tree":false,"is_single":false,"is_submittable":false,"track_changes":true,"track_seen":false,"allow_rename":false,"autoname":"autoincrement","title_field":"color","sort_order":"DESC","fields":[{"fieldname":"color","label":"Mã màu","fieldtype":"Link","options":"Item Color","required":true,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"in_list_view":true,"in_standard_filter":true,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":1},{"fieldname":"note","label":"Ghi chú áp dụng","fieldtype":"Data","required":false,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"in_list_view":true,"in_standard_filter":false,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":2}],"permissions":[{"role":"Chủ xưởng","read":true,"write":true,"create":true,"submit":false,"cancel":false,"amend":false,"print":true,"email":true,"report":true,"import":false,"export":true,"share":false,"if_owner":false,"permlevel":0},{"role":"Thủ kho","read":true,"write":true,"create":true,"submit":false,"cancel":false,"amend":false,"print":true,"email":true,"report":true,"import":false,"export":true,"share":false,"if_owner":false,"permlevel":0},{"role":"Kế toán","read":true,"write":false,"create":false,"submit":false,"cancel":false,"amend":false,"print":true,"email":true,"report":true,"import":false,"export":true,"share":false,"if_owner":false,"permlevel":0},{"role":"Sản xuất","read":true,"write":false,"create":false,"submit":false,"cancel":false,"amend":false,"print":true,"email":true,"report":true,"import":false,"export":true,"share":false,"if_owner":false,"permlevel":0},{"role":"Kinh doanh","read":true,"write":false,"create":false,"submit":false,"cancel":false,"amend":false,"print":true,"email":true,"report":true,"import":false,"export":true,"share":false,"if_owner":false,"permlevel":0},{"role":"System Manager","read":true,"write":true,"create":true,"submit":true,"cancel":true,"amend":true,"print":true,"email":true,"report":true,"import":false,"export":true,"share":false,"if_owner":false,"permlevel":0}],"revision":1}'))
    END,
    modified_at='2026-07-29T00:30:00.000Z'
WHERE tenant_id='alu'
  AND app_id='alumdoor'
  AND version IN ('1.18.4', '1.18.5');
