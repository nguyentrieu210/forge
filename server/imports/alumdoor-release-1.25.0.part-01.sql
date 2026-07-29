-- Alumdoor 1.25.0: full compiler-normalized metadata release.
-- Equivalent data shape to AppInstaller.install; generated at statement boundaries.

INSERT INTO roles(tenant_id,role,desk_access,is_standard,modified_at)
SELECT 'alu','Chủ xưởng',1,0,'2026-07-29T11:26:41.071Z'
WHERE EXISTS (
    SELECT 1 FROM installed_apps
    WHERE tenant_id='alu' AND app_id='alumdoor'
      AND content_hash<>'d937da97d83226f626629c4963493ee00b0e8ccdad3a06085d4ef1168ec85476'
  )
ON CONFLICT(tenant_id,role) DO NOTHING;

INSERT INTO roles(tenant_id,role,desk_access,is_standard,modified_at)
SELECT 'alu','Kinh doanh',1,0,'2026-07-29T11:26:41.071Z'
WHERE EXISTS (
    SELECT 1 FROM installed_apps
    WHERE tenant_id='alu' AND app_id='alumdoor'
      AND content_hash<>'d937da97d83226f626629c4963493ee00b0e8ccdad3a06085d4ef1168ec85476'
  )
ON CONFLICT(tenant_id,role) DO NOTHING;

INSERT INTO roles(tenant_id,role,desk_access,is_standard,modified_at)
SELECT 'alu','Thủ kho',1,0,'2026-07-29T11:26:41.071Z'
WHERE EXISTS (
    SELECT 1 FROM installed_apps
    WHERE tenant_id='alu' AND app_id='alumdoor'
      AND content_hash<>'d937da97d83226f626629c4963493ee00b0e8ccdad3a06085d4ef1168ec85476'
  )
ON CONFLICT(tenant_id,role) DO NOTHING;

INSERT INTO roles(tenant_id,role,desk_access,is_standard,modified_at)
SELECT 'alu','Kế toán',1,0,'2026-07-29T11:26:41.071Z'
WHERE EXISTS (
    SELECT 1 FROM installed_apps
    WHERE tenant_id='alu' AND app_id='alumdoor'
      AND content_hash<>'d937da97d83226f626629c4963493ee00b0e8ccdad3a06085d4ef1168ec85476'
  )
ON CONFLICT(tenant_id,role) DO NOTHING;

INSERT INTO roles(tenant_id,role,desk_access,is_standard,modified_at)
SELECT 'alu','Sản xuất',1,0,'2026-07-29T11:26:41.071Z'
WHERE EXISTS (
    SELECT 1 FROM installed_apps
    WHERE tenant_id='alu' AND app_id='alumdoor'
      AND content_hash<>'d937da97d83226f626629c4963493ee00b0e8ccdad3a06085d4ef1168ec85476'
  )
ON CONFLICT(tenant_id,role) DO NOTHING;

INSERT INTO doctype_definitions(
  tenant_id,doctype,module,is_custom,is_submittable,is_child,revision,
  metadata_json,disabled,modified_by,modified_at
)
SELECT
  'alu','UOM','Alumdoor',
  0,0,0,
  COALESCE((SELECT revision+1 FROM doctype_definitions WHERE tenant_id='alu' AND doctype='UOM'),1),
  json_set(
    json('{"name":"UOM","label":"Đơn vị tính","module":"Alumdoor","custom":false,"is_child":false,"is_tree":false,"is_single":false,"is_submittable":false,"track_changes":true,"track_seen":false,"allow_rename":false,"autoname":"field:uom_name","title_field":"uom_name","sort_order":"DESC","search_fields":["uom_name"],"fields":[{"fieldname":"uom_name","label":"Tên đơn vị","fieldtype":"Data","required":true,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":true,"in_list_view":true,"in_standard_filter":false,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":1},{"fieldname":"must_be_whole_number","label":"Chỉ nhận số nguyên","fieldtype":"Check","required":false,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"in_list_view":true,"in_standard_filter":false,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":2},{"fieldname":"disabled","label":"Ngừng dùng","fieldtype":"Check","required":false,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"in_list_view":true,"in_standard_filter":false,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":3}],"permissions":[{"role":"Chủ xưởng","read":true,"write":true,"create":true,"submit":false,"cancel":false,"amend":false,"print":true,"email":true,"report":true,"import":false,"export":true,"share":false,"if_owner":false,"permlevel":0},{"role":"Thủ kho","read":true,"write":true,"create":true,"submit":false,"cancel":false,"amend":false,"print":true,"email":true,"report":true,"import":false,"export":true,"share":false,"if_owner":false,"permlevel":0},{"role":"Kế toán","read":true,"write":false,"create":false,"submit":false,"cancel":false,"amend":false,"print":true,"email":true,"report":true,"import":false,"export":true,"share":false,"if_owner":false,"permlevel":0},{"role":"Sản xuất","read":true,"write":false,"create":false,"submit":false,"cancel":false,"amend":false,"print":true,"email":true,"report":true,"import":false,"export":true,"share":false,"if_owner":false,"permlevel":0},{"role":"Kinh doanh","read":true,"write":false,"create":false,"submit":false,"cancel":false,"amend":false,"print":true,"email":true,"report":true,"import":false,"export":true,"share":false,"if_owner":false,"permlevel":0},{"role":"System Manager","read":true,"write":true,"create":true,"submit":true,"cancel":true,"amend":true,"print":true,"email":true,"report":true,"import":false,"export":true,"share":false,"if_owner":false,"permlevel":0}],"revision":1}'),
    '$.revision',
    COALESCE((SELECT revision+1 FROM doctype_definitions WHERE tenant_id='alu' AND doctype='UOM'),1)
  ),
  0,'admin','2026-07-29T11:26:41.071Z'
WHERE EXISTS (
    SELECT 1 FROM installed_apps
    WHERE tenant_id='alu' AND app_id='alumdoor'
      AND content_hash<>'d937da97d83226f626629c4963493ee00b0e8ccdad3a06085d4ef1168ec85476'
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
  'alu','Item Group','Alumdoor',
  0,0,0,
  COALESCE((SELECT revision+1 FROM doctype_definitions WHERE tenant_id='alu' AND doctype='Item Group'),1),
  json_set(
    json('{"name":"Item Group","label":"Nhóm hàng","module":"Alumdoor","custom":false,"is_child":false,"is_tree":true,"is_single":false,"is_submittable":false,"track_changes":true,"track_seen":false,"allow_rename":false,"autoname":"field:item_group_name","title_field":"item_group_name","sort_order":"DESC","search_fields":["item_group_name"],"fields":[{"fieldname":"item_group_name","label":"Tên nhóm","fieldtype":"Data","required":true,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":true,"in_list_view":true,"in_standard_filter":false,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":1},{"fieldname":"parent_item_group","label":"Nhóm cha","fieldtype":"Link","options":"Item Group","required":false,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"in_list_view":true,"in_standard_filter":true,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":2},{"fieldname":"is_group","label":"Là nhóm chứa","fieldtype":"Check","required":false,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"in_list_view":true,"in_standard_filter":false,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":3},{"fieldname":"default_inventory_account","label":"TK tồn kho mặc định","fieldtype":"Link","options":"Account","required":false,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"in_list_view":false,"in_standard_filter":false,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":4},{"fieldname":"default_cogs_account","label":"TK giá vốn mặc định","fieldtype":"Link","options":"Account","required":false,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"in_list_view":false,"in_standard_filter":false,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":5},{"fieldname":"default_income_account","label":"TK doanh thu mặc định","fieldtype":"Link","options":"Account","required":false,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"in_list_view":false,"in_standard_filter":false,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":6},{"fieldname":"default_expense_account","label":"TK chi phí mặc định","fieldtype":"Link","options":"Account","required":false,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"in_list_view":false,"in_standard_filter":false,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":7},{"fieldname":"disabled","label":"Ngừng dùng","fieldtype":"Check","required":false,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"in_list_view":true,"in_standard_filter":false,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":8}],"permissions":[{"role":"Chủ xưởng","read":true,"write":true,"create":true,"submit":false,"cancel":false,"amend":false,"print":true,"email":true,"report":true,"import":false,"export":true,"share":false,"if_owner":false,"permlevel":0},{"role":"Thủ kho","read":true,"write":false,"create":false,"submit":false,"cancel":false,"amend":false,"print":true,"email":true,"report":true,"import":false,"export":true,"share":false,"if_owner":false,"permlevel":0},{"role":"Kế toán","read":true,"write":false,"create":false,"submit":false,"cancel":false,"amend":false,"print":true,"email":true,"report":true,"import":false,"export":true,"share":false,"if_owner":false,"permlevel":0},{"role":"Sản xuất","read":true,"write":false,"create":false,"submit":false,"cancel":false,"amend":false,"print":true,"email":true,"report":true,"import":false,"export":true,"share":false,"if_owner":false,"permlevel":0},{"role":"Kinh doanh","read":true,"write":false,"create":false,"submit":false,"cancel":false,"amend":false,"print":true,"email":true,"report":true,"import":false,"export":true,"share":false,"if_owner":false,"permlevel":0},{"role":"System Manager","read":true,"write":true,"create":true,"submit":true,"cancel":true,"amend":true,"print":true,"email":true,"report":true,"import":false,"export":true,"share":false,"if_owner":false,"permlevel":0}],"revision":1}'),
    '$.revision',
    COALESCE((SELECT revision+1 FROM doctype_definitions WHERE tenant_id='alu' AND doctype='Item Group'),1)
  ),
  0,'admin','2026-07-29T11:26:41.071Z'
WHERE EXISTS (
    SELECT 1 FROM installed_apps
    WHERE tenant_id='alu' AND app_id='alumdoor'
      AND content_hash<>'d937da97d83226f626629c4963493ee00b0e8ccdad3a06085d4ef1168ec85476'
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
  'alu','Brand','Alumdoor',
  0,0,0,
  COALESCE((SELECT revision+1 FROM doctype_definitions WHERE tenant_id='alu' AND doctype='Brand'),1),
  json_set(
    json('{"name":"Brand","label":"Thương hiệu","module":"Alumdoor","custom":false,"is_child":false,"is_tree":false,"is_single":false,"is_submittable":false,"track_changes":true,"track_seen":false,"allow_rename":false,"autoname":"field:brand_name","title_field":"brand_name","sort_order":"DESC","search_fields":["brand_name"],"fields":[{"fieldname":"brand_name","label":"Tên thương hiệu","fieldtype":"Data","required":true,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":true,"in_list_view":true,"in_standard_filter":false,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":1},{"fieldname":"country","label":"Quốc gia","fieldtype":"Data","required":false,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"in_list_view":true,"in_standard_filter":false,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":2},{"fieldname":"website","label":"Website","fieldtype":"Data","required":false,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"in_list_view":false,"in_standard_filter":false,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":3},{"fieldname":"note","label":"Ghi chú","fieldtype":"Small Text","required":false,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"in_list_view":false,"in_standard_filter":false,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":4},{"fieldname":"disabled","label":"Ngừng dùng","fieldtype":"Check","required":false,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"in_list_view":true,"in_standard_filter":false,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":5}],"permissions":[{"role":"Chủ xưởng","read":true,"write":true,"create":true,"submit":false,"cancel":false,"amend":false,"print":true,"email":true,"report":true,"import":false,"export":true,"share":false,"if_owner":false,"permlevel":0},{"role":"Thủ kho","read":true,"write":false,"create":false,"submit":false,"cancel":false,"amend":false,"print":true,"email":true,"report":true,"import":false,"export":true,"share":false,"if_owner":false,"permlevel":0},{"role":"Kế toán","read":true,"write":false,"create":false,"submit":false,"cancel":false,"amend":false,"print":true,"email":true,"report":true,"import":false,"export":true,"share":false,"if_owner":false,"permlevel":0},{"role":"Sản xuất","read":true,"write":false,"create":false,"submit":false,"cancel":false,"amend":false,"print":true,"email":true,"report":true,"import":false,"export":true,"share":false,"if_owner":false,"permlevel":0},{"role":"Kinh doanh","read":true,"write":false,"create":false,"submit":false,"cancel":false,"amend":false,"print":true,"email":true,"report":true,"import":false,"export":true,"share":false,"if_owner":false,"permlevel":0},{"role":"System Manager","read":true,"write":true,"create":true,"submit":true,"cancel":true,"amend":true,"print":true,"email":true,"report":true,"import":false,"export":true,"share":false,"if_owner":false,"permlevel":0}],"revision":1}'),
    '$.revision',
    COALESCE((SELECT revision+1 FROM doctype_definitions WHERE tenant_id='alu' AND doctype='Brand'),1)
  ),
  0,'admin','2026-07-29T11:26:41.071Z'
WHERE EXISTS (
    SELECT 1 FROM installed_apps
    WHERE tenant_id='alu' AND app_id='alumdoor'
      AND content_hash<>'d937da97d83226f626629c4963493ee00b0e8ccdad3a06085d4ef1168ec85476'
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
  'alu','Manufacturer','Alumdoor',
  0,0,0,
  COALESCE((SELECT revision+1 FROM doctype_definitions WHERE tenant_id='alu' AND doctype='Manufacturer'),1),
  json_set(
    json('{"name":"Manufacturer","label":"Nhà sản xuất","module":"Alumdoor","custom":false,"is_child":false,"is_tree":false,"is_single":false,"is_submittable":false,"track_changes":true,"track_seen":false,"allow_rename":false,"autoname":"field:manufacturer_name","title_field":"manufacturer_name","sort_order":"DESC","search_fields":["manufacturer_name"],"fields":[{"fieldname":"manufacturer_name","label":"Tên nhà sản xuất","fieldtype":"Data","required":true,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":true,"in_list_view":true,"in_standard_filter":false,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":1},{"fieldname":"country","label":"Quốc gia","fieldtype":"Data","required":false,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"in_list_view":true,"in_standard_filter":false,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":2},{"fieldname":"website","label":"Website","fieldtype":"Data","required":false,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"in_list_view":false,"in_standard_filter":false,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":3},{"fieldname":"note","label":"Ghi chú","fieldtype":"Small Text","required":false,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"in_list_view":false,"in_standard_filter":false,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":4},{"fieldname":"disabled","label":"Ngừng dùng","fieldtype":"Check","required":false,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"in_list_view":true,"in_standard_filter":false,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":5}],"permissions":[{"role":"Chủ xưởng","read":true,"write":true,"create":true,"submit":false,"cancel":false,"amend":false,"print":true,"email":true,"report":true,"import":false,"export":true,"share":false,"if_owner":false,"permlevel":0},{"role":"Thủ kho","read":true,"write":false,"create":false,"submit":false,"cancel":false,"amend":false,"print":true,"email":true,"report":true,"import":false,"export":true,"share":false,"if_owner":false,"permlevel":0},{"role":"Kế toán","read":true,"write":false,"create":false,"submit":false,"cancel":false,"amend":false,"print":true,"email":true,"report":true,"import":false,"export":true,"share":false,"if_owner":false,"permlevel":0},{"role":"Sản xuất","read":true,"write":false,"create":false,"submit":false,"cancel":false,"amend":false,"print":true,"email":true,"report":true,"import":false,"export":true,"share":false,"if_owner":false,"permlevel":0},{"role":"Kinh doanh","read":true,"write":false,"create":false,"submit":false,"cancel":false,"amend":false,"print":true,"email":true,"report":true,"import":false,"export":true,"share":false,"if_owner":false,"permlevel":0},{"role":"System Manager","read":true,"write":true,"create":true,"submit":true,"cancel":true,"amend":true,"print":true,"email":true,"report":true,"import":false,"export":true,"share":false,"if_owner":false,"permlevel":0}],"revision":1}'),
    '$.revision',
    COALESCE((SELECT revision+1 FROM doctype_definitions WHERE tenant_id='alu' AND doctype='Manufacturer'),1)
  ),
  0,'admin','2026-07-29T11:26:41.071Z'
WHERE EXISTS (
    SELECT 1 FROM installed_apps
    WHERE tenant_id='alu' AND app_id='alumdoor'
      AND content_hash<>'d937da97d83226f626629c4963493ee00b0e8ccdad3a06085d4ef1168ec85476'
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
  'alu','Item Color','Alumdoor',
  0,0,0,
  COALESCE((SELECT revision+1 FROM doctype_definitions WHERE tenant_id='alu' AND doctype='Item Color'),1),
  json_set(
    json('{"name":"Item Color","label":"Màu vật tư","module":"Alumdoor","custom":false,"is_child":false,"is_tree":false,"is_single":false,"is_submittable":false,"track_changes":true,"track_seen":false,"allow_rename":false,"autoname":"field:color_code","title_field":"color_name","sort_order":"DESC","search_fields":["color_code","color_name"],"fields":[{"fieldname":"color_code","label":"Mã màu","fieldtype":"Data","required":true,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":true,"in_list_view":true,"in_standard_filter":false,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":1},{"fieldname":"color_name","label":"Tên màu","fieldtype":"Data","required":true,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"in_list_view":true,"in_standard_filter":false,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":2},{"fieldname":"finish","label":"Bề mặt","fieldtype":"Select","options":"Thô\nSơn tĩnh điện\nAnode\nVân gỗ\nMạ\nKhác","required":false,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"in_list_view":true,"in_standard_filter":true,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":3},{"fieldname":"supplier_color_code","label":"Mã màu nhà cung cấp","fieldtype":"Data","required":false,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"in_list_view":false,"in_standard_filter":false,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":4},{"fieldname":"disabled","label":"Ngừng dùng","fieldtype":"Check","required":false,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"in_list_view":true,"in_standard_filter":false,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":5}],"permissions":[{"role":"Chủ xưởng","read":true,"write":true,"create":true,"submit":false,"cancel":false,"amend":false,"print":true,"email":true,"report":true,"import":false,"export":true,"share":false,"if_owner":false,"permlevel":0},{"role":"Thủ kho","read":true,"write":true,"create":true,"submit":false,"cancel":false,"amend":false,"print":true,"email":true,"report":true,"import":false,"export":true,"share":false,"if_owner":false,"permlevel":0},{"role":"Kế toán","read":true,"write":false,"create":false,"submit":false,"cancel":false,"amend":false,"print":true,"email":true,"report":true,"import":false,"export":true,"share":false,"if_owner":false,"permlevel":0},{"role":"Sản xuất","read":true,"write":false,"create":false,"submit":false,"cancel":false,"amend":false,"print":true,"email":true,"report":true,"import":false,"export":true,"share":false,"if_owner":false,"permlevel":0},{"role":"Kinh doanh","read":true,"write":false,"create":false,"submit":false,"cancel":false,"amend":false,"print":true,"email":true,"report":true,"import":false,"export":true,"share":false,"if_owner":false,"permlevel":0},{"role":"System Manager","read":true,"write":true,"create":true,"submit":true,"cancel":true,"amend":true,"print":true,"email":true,"report":true,"import":false,"export":true,"share":false,"if_owner":false,"permlevel":0}],"revision":1}'),
    '$.revision',
    COALESCE((SELECT revision+1 FROM doctype_definitions WHERE tenant_id='alu' AND doctype='Item Color'),1)
  ),
  0,'admin','2026-07-29T11:26:41.071Z'
WHERE EXISTS (
    SELECT 1 FROM installed_apps
    WHERE tenant_id='alu' AND app_id='alumdoor'
      AND content_hash<>'d937da97d83226f626629c4963493ee00b0e8ccdad3a06085d4ef1168ec85476'
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
  'alu','Item Allowed Color','Alumdoor',
  0,0,1,
  COALESCE((SELECT revision+1 FROM doctype_definitions WHERE tenant_id='alu' AND doctype='Item Allowed Color'),1),
  json_set(
    json('{"name":"Item Allowed Color","label":"Màu áp dụng cho mặt hàng","module":"Alumdoor","custom":false,"is_child":true,"is_tree":false,"is_single":false,"is_submittable":false,"track_changes":true,"track_seen":false,"allow_rename":false,"autoname":"autoincrement","title_field":"color","sort_order":"DESC","fields":[{"fieldname":"color","label":"Mã màu","fieldtype":"Link","options":"Item Color","required":true,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"in_list_view":true,"in_standard_filter":true,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":1},{"fieldname":"note","label":"Ghi chú áp dụng","fieldtype":"Data","required":false,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"in_list_view":true,"in_standard_filter":false,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":2}],"permissions":[{"role":"Chủ xưởng","read":true,"write":true,"create":true,"submit":false,"cancel":false,"amend":false,"print":true,"email":true,"report":true,"import":false,"export":true,"share":false,"if_owner":false,"permlevel":0},{"role":"Thủ kho","read":true,"write":true,"create":true,"submit":false,"cancel":false,"amend":false,"print":true,"email":true,"report":true,"import":false,"export":true,"share":false,"if_owner":false,"permlevel":0},{"role":"Kế toán","read":true,"write":false,"create":false,"submit":false,"cancel":false,"amend":false,"print":true,"email":true,"report":true,"import":false,"export":true,"share":false,"if_owner":false,"permlevel":0},{"role":"Sản xuất","read":true,"write":false,"create":false,"submit":false,"cancel":false,"amend":false,"print":true,"email":true,"report":true,"import":false,"export":true,"share":false,"if_owner":false,"permlevel":0},{"role":"Kinh doanh","read":true,"write":false,"create":false,"submit":false,"cancel":false,"amend":false,"print":true,"email":true,"report":true,"import":false,"export":true,"share":false,"if_owner":false,"permlevel":0},{"role":"System Manager","read":true,"write":true,"create":true,"submit":true,"cancel":true,"amend":true,"print":true,"email":true,"report":true,"import":false,"export":true,"share":false,"if_owner":false,"permlevel":0}],"revision":1}'),
    '$.revision',
    COALESCE((SELECT revision+1 FROM doctype_definitions WHERE tenant_id='alu' AND doctype='Item Allowed Color'),1)
  ),
  0,'admin','2026-07-29T11:26:41.071Z'
WHERE EXISTS (
    SELECT 1 FROM installed_apps
    WHERE tenant_id='alu' AND app_id='alumdoor'
      AND content_hash<>'d937da97d83226f626629c4963493ee00b0e8ccdad3a06085d4ef1168ec85476'
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
  'alu','Material Grade','Alumdoor',
  0,0,0,
  COALESCE((SELECT revision+1 FROM doctype_definitions WHERE tenant_id='alu' AND doctype='Material Grade'),1),
  json_set(
    json('{"name":"Material Grade","label":"Mác vật liệu","module":"Alumdoor","custom":false,"is_child":false,"is_tree":false,"is_single":false,"is_submittable":false,"track_changes":true,"track_seen":false,"allow_rename":false,"autoname":"field:grade_code","title_field":"grade_name","sort_order":"DESC","search_fields":["grade_code","grade_name"],"fields":[{"fieldname":"grade_code","label":"Mã mác","fieldtype":"Data","required":true,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":true,"in_list_view":true,"in_standard_filter":false,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":1},{"fieldname":"grade_name","label":"Tên mác","fieldtype":"Data","required":true,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"in_list_view":true,"in_standard_filter":false,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":2},{"fieldname":"material_family","label":"Họ vật liệu","fieldtype":"Select","options":"Nhôm\nThép\nInox\nKính\nNhựa\nGỗ\nCao su\nKhác","required":true,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"in_list_view":true,"in_standard_filter":true,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":3},{"fieldname":"density_kg_m3","label":"Khối lượng riêng (kg/m3)","fieldtype":"Float","required":false,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"in_list_view":false,"in_standard_filter":false,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":4},{"fieldname":"note","label":"Tiêu chuẩn / ghi chú","fieldtype":"Small Text","required":false,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"in_list_view":false,"in_standard_filter":false,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":5},{"fieldname":"disabled","label":"Ngừng dùng","fieldtype":"Check","required":false,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"in_list_view":true,"in_standard_filter":false,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":6}],"permissions":[{"role":"Chủ xưởng","read":true,"write":true,"create":true,"submit":false,"cancel":false,"amend":false,"print":true,"email":true,"report":true,"import":false,"export":true,"share":false,"if_owner":false,"permlevel":0},{"role":"Thủ kho","read":true,"write":false,"create":false,"submit":false,"cancel":false,"amend":false,"print":true,"email":true,"report":true,"import":false,"export":true,"share":false,"if_owner":false,"permlevel":0},{"role":"Kế toán","read":true,"write":false,"create":false,"submit":false,"cancel":false,"amend":false,"print":true,"email":true,"report":true,"import":false,"export":true,"share":false,"if_owner":false,"permlevel":0},{"role":"Sản xuất","read":true,"write":true,"create":true,"submit":false,"cancel":false,"amend":false,"print":true,"email":true,"report":true,"import":false,"export":true,"share":false,"if_owner":false,"permlevel":0},{"role":"Kinh doanh","read":true,"write":false,"create":false,"submit":false,"cancel":false,"amend":false,"print":true,"email":true,"report":true,"import":false,"export":true,"share":false,"if_owner":false,"permlevel":0},{"role":"System Manager","read":true,"write":true,"create":true,"submit":true,"cancel":true,"amend":true,"print":true,"email":true,"report":true,"import":false,"export":true,"share":false,"if_owner":false,"permlevel":0}],"revision":1}'),
    '$.revision',
    COALESCE((SELECT revision+1 FROM doctype_definitions WHERE tenant_id='alu' AND doctype='Material Grade'),1)
  ),
  0,'admin','2026-07-29T11:26:41.071Z'
WHERE EXISTS (
    SELECT 1 FROM installed_apps
    WHERE tenant_id='alu' AND app_id='alumdoor'
      AND content_hash<>'d937da97d83226f626629c4963493ee00b0e8ccdad3a06085d4ef1168ec85476'
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
  'alu','Material Specification','Alumdoor',
  0,0,0,
  COALESCE((SELECT revision+1 FROM doctype_definitions WHERE tenant_id='alu' AND doctype='Material Specification'),1),
  json_set(
    json('{"name":"Material Specification","label":"Quy cách kỹ thuật vật tư","module":"Alumdoor","custom":false,"is_child":false,"is_tree":false,"is_single":false,"is_submittable":false,"track_changes":true,"track_seen":false,"allow_rename":false,"autoname":"field:spec_code","title_field":"spec_name","sort_order":"DESC","search_fields":["spec_code","spec_name","profile_system"],"fields":[{"fieldname":"spec_code","label":"Mã quy cách","fieldtype":"Data","required":true,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":true,"in_list_view":true,"in_standard_filter":false,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":1},{"fieldname":"spec_name","label":"Tên quy cách","fieldtype":"Data","required":true,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"in_list_view":true,"in_standard_filter":false,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":2},{"fieldname":"material_grade","label":"Mác vật liệu","fieldtype":"Link","options":"Material Grade","required":false,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"in_list_view":true,"in_standard_filter":true,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":3},{"fieldname":"profile_system","label":"Hệ / dòng profile","fieldtype":"Data","required":false,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"in_list_view":false,"in_standard_filter":false,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":4},{"fieldname":"section_code","label":"Mã tiết diện","fieldtype":"Data","required":false,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"in_list_view":false,"in_standard_filter":false,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":5},{"fieldname":"theoretical_kg_per_m","label":"Kg/m lý thuyết","fieldtype":"Float","required":false,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"in_list_view":true,"in_standard_filter":false,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":6},{"fieldname":"standard_length_m","label":"Chiều dài chuẩn (m)","fieldtype":"Float","required":false,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"in_list_view":true,"in_standard_filter":false,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":7},{"fieldname":"width_mm","label":"Khổ rộng (mm)","fieldtype":"Float","required":false,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"in_list_view":false,"in_standard_filter":false,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":8},{"fieldname":"thickness_mm","label":"Độ dày (mm)","fieldtype":"Float","required":false,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"in_list_view":false,"in_standard_filter":false,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":9},{"fieldname":"scrap_threshold_m","label":"Ngưỡng phế liệu (m)","fieldtype":"Float","required":false,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"in_list_view":false,"in_standard_filter":false,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":10},{"fieldname":"drawing","label":"Bản vẽ kỹ thuật","fieldtype":"Attach","required":false,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"in_list_view":false,"in_standard_filter":false,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":11},{"fieldname":"note","label":"Ghi chú","fieldtype":"Small Text","required":false,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"in_list_view":false,"in_standard_filter":false,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":12},{"fieldname":"disabled","label":"Ngừng dùng","fieldtype":"Check","required":false,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"in_list_view":false,"in_standard_filter":false,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":13}],"permissions":[{"role":"Chủ xưởng","read":true,"write":true,"create":true,"submit":false,"cancel":false,"amend":false,"print":true,"email":true,"report":true,"import":false,"export":true,"share":false,"if_owner":false,"permlevel":0},{"role":"Thủ kho","read":true,"write":false,"create":false,"submit":false,"cancel":false,"amend":false,"print":true,"email":true,"report":true,"import":false,"export":true,"share":false,"if_owner":false,"permlevel":0},{"role":"Kế toán","read":true,"write":false,"create":false,"submit":false,"cancel":false,"amend":false,"print":true,"email":true,"report":true,"import":false,"export":true,"share":false,"if_owner":false,"permlevel":0},{"role":"Sản xuất","read":true,"write":true,"create":true,"submit":false,"cancel":false,"amend":false,"print":true,"email":true,"report":true,"import":false,"export":true,"share":false,"if_owner":false,"permlevel":0},{"role":"Kinh doanh","read":true,"write":false,"create":false,"submit":false,"cancel":false,"amend":false,"print":true,"email":true,"report":true,"import":false,"export":true,"share":false,"if_owner":false,"permlevel":0},{"role":"System Manager","read":true,"write":true,"create":true,"submit":true,"cancel":true,"amend":true,"print":true,"email":true,"report":true,"import":false,"export":true,"share":false,"if_owner":false,"permlevel":0}],"revision":1}'),
    '$.revision',
    COALESCE((SELECT revision+1 FROM doctype_definitions WHERE tenant_id='alu' AND doctype='Material Specification'),1)
  ),
  0,'admin','2026-07-29T11:26:41.071Z'
WHERE EXISTS (
    SELECT 1 FROM installed_apps
    WHERE tenant_id='alu' AND app_id='alumdoor'
      AND content_hash<>'d937da97d83226f626629c4963493ee00b0e8ccdad3a06085d4ef1168ec85476'
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
  'alu','Item Attribute Value','Alumdoor',
  0,0,1,
  COALESCE((SELECT revision+1 FROM doctype_definitions WHERE tenant_id='alu' AND doctype='Item Attribute Value'),1),
  json_set(
    json('{"name":"Item Attribute Value","label":"Giá trị thuộc tính","module":"Alumdoor","custom":false,"is_child":true,"is_tree":false,"is_single":false,"is_submittable":false,"track_changes":true,"track_seen":false,"allow_rename":false,"autoname":"autoincrement","title_field":"attribute_value","sort_order":"DESC","fields":[{"fieldname":"attribute_value","label":"Giá trị","fieldtype":"Data","required":true,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"in_list_view":true,"in_standard_filter":false,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":1},{"fieldname":"abbr","label":"Viết tắt","fieldtype":"Data","required":false,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"in_list_view":true,"in_standard_filter":false,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":2},{"fieldname":"numeric_value","label":"Giá trị số","fieldtype":"Float","required":false,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"in_list_view":false,"in_standard_filter":false,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":3},{"fieldname":"disabled","label":"Ngừng dùng","fieldtype":"Check","required":false,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"in_list_view":true,"in_standard_filter":false,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":4}],"permissions":[{"role":"Chủ xưởng","read":true,"write":true,"create":true,"submit":false,"cancel":false,"amend":false,"print":true,"email":true,"report":true,"import":false,"export":true,"share":false,"if_owner":false,"permlevel":0},{"role":"Thủ kho","read":true,"write":false,"create":false,"submit":false,"cancel":false,"amend":false,"print":true,"email":true,"report":true,"import":false,"export":true,"share":false,"if_owner":false,"permlevel":0},{"role":"Sản xuất","read":true,"write":false,"create":false,"submit":false,"cancel":false,"amend":false,"print":true,"email":true,"report":true,"import":false,"export":true,"share":false,"if_owner":false,"permlevel":0},{"role":"Kinh doanh","read":true,"write":false,"create":false,"submit":false,"cancel":false,"amend":false,"print":true,"email":true,"report":true,"import":false,"export":true,"share":false,"if_owner":false,"permlevel":0},{"role":"System Manager","read":true,"write":true,"create":true,"submit":true,"cancel":true,"amend":true,"print":true,"email":true,"report":true,"import":false,"export":true,"share":false,"if_owner":false,"permlevel":0}],"revision":1}'),
    '$.revision',
    COALESCE((SELECT revision+1 FROM doctype_definitions WHERE tenant_id='alu' AND doctype='Item Attribute Value'),1)
  ),
  0,'admin','2026-07-29T11:26:41.071Z'
WHERE EXISTS (
    SELECT 1 FROM installed_apps
    WHERE tenant_id='alu' AND app_id='alumdoor'
      AND content_hash<>'d937da97d83226f626629c4963493ee00b0e8ccdad3a06085d4ef1168ec85476'
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
  'alu','Item Attribute','Alumdoor',
  0,0,0,
  COALESCE((SELECT revision+1 FROM doctype_definitions WHERE tenant_id='alu' AND doctype='Item Attribute'),1),
  json_set(
    json('{"name":"Item Attribute","label":"Thuộc tính mặt hàng","module":"Alumdoor","custom":false,"is_child":false,"is_tree":false,"is_single":false,"is_submittable":false,"track_changes":true,"track_seen":false,"allow_rename":false,"autoname":"field:attribute_name","title_field":"attribute_name","sort_order":"DESC","search_fields":["attribute_name"],"fields":[{"fieldname":"attribute_name","label":"Tên thuộc tính","fieldtype":"Data","required":true,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":true,"in_list_view":true,"in_standard_filter":false,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":1},{"fieldname":"numeric_values","label":"Giá trị dạng số","fieldtype":"Check","required":false,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"in_list_view":true,"in_standard_filter":false,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":2},{"fieldname":"from_value","label":"Từ","fieldtype":"Float","required":false,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"in_list_view":false,"in_standard_filter":false,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":3},{"fieldname":"to_value","label":"Đến","fieldtype":"Float","required":false,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"in_list_view":false,"in_standard_filter":false,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":4},{"fieldname":"increment","label":"Bước tăng","fieldtype":"Float","required":false,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"in_list_view":false,"in_standard_filter":false,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":5},{"fieldname":"attribute_values","label":"Danh sách giá trị","fieldtype":"Table","options":"Item Attribute Value","required":false,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"in_list_view":false,"in_standard_filter":false,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":6},{"fieldname":"disabled","label":"Ngừng dùng","fieldtype":"Check","required":false,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"in_list_view":true,"in_standard_filter":false,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":7}],"permissions":[{"role":"Chủ xưởng","read":true,"write":true,"create":true,"submit":false,"cancel":false,"amend":false,"print":true,"email":true,"report":true,"import":false,"export":true,"share":false,"if_owner":false,"permlevel":0},{"role":"Thủ kho","read":true,"write":false,"create":false,"submit":false,"cancel":false,"amend":false,"print":true,"email":true,"report":true,"import":false,"export":true,"share":false,"if_owner":false,"permlevel":0},{"role":"Sản xuất","read":true,"write":true,"create":true,"submit":false,"cancel":false,"amend":false,"print":true,"email":true,"report":true,"import":false,"export":true,"share":false,"if_owner":false,"permlevel":0},{"role":"Kinh doanh","read":true,"write":false,"create":false,"submit":false,"cancel":false,"amend":false,"print":true,"email":true,"report":true,"import":false,"export":true,"share":false,"if_owner":false,"permlevel":0},{"role":"System Manager","read":true,"write":true,"create":true,"submit":true,"cancel":true,"amend":true,"print":true,"email":true,"report":true,"import":false,"export":true,"share":false,"if_owner":false,"permlevel":0}],"revision":1}'),
    '$.revision',
    COALESCE((SELECT revision+1 FROM doctype_definitions WHERE tenant_id='alu' AND doctype='Item Attribute'),1)
  ),
  0,'admin','2026-07-29T11:26:41.071Z'
WHERE EXISTS (
    SELECT 1 FROM installed_apps
    WHERE tenant_id='alu' AND app_id='alumdoor'
      AND content_hash<>'d937da97d83226f626629c4963493ee00b0e8ccdad3a06085d4ef1168ec85476'
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
  'alu','Item Variant Attribute','Alumdoor',
  0,0,1,
  COALESCE((SELECT revision+1 FROM doctype_definitions WHERE tenant_id='alu' AND doctype='Item Variant Attribute'),1),
  json_set(
    json('{"name":"Item Variant Attribute","label":"Thuộc tính biến thể","module":"Alumdoor","custom":false,"is_child":true,"is_tree":false,"is_single":false,"is_submittable":false,"track_changes":true,"track_seen":false,"allow_rename":false,"autoname":"autoincrement","title_field":"attribute","sort_order":"DESC","fields":[{"fieldname":"attribute","label":"Thuộc tính","fieldtype":"Link","options":"Item Attribute","required":true,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"in_list_view":true,"in_standard_filter":true,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":1},{"fieldname":"attribute_value","label":"Giá trị","fieldtype":"Data","required":true,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"in_list_view":true,"in_standard_filter":false,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":2}],"permissions":[{"role":"Chủ xưởng","read":true,"write":true,"create":true,"submit":false,"cancel":false,"amend":false,"print":true,"email":true,"report":true,"import":false,"export":true,"share":false,"if_owner":false,"permlevel":0},{"role":"Thủ kho","read":true,"write":true,"create":true,"submit":false,"cancel":false,"amend":false,"print":true,"email":true,"report":true,"import":false,"export":true,"share":false,"if_owner":false,"permlevel":0},{"role":"Sản xuất","read":true,"write":true,"create":true,"submit":false,"cancel":false,"amend":false,"print":true,"email":true,"report":true,"import":false,"export":true,"share":false,"if_owner":false,"permlevel":0},{"role":"Kinh doanh","read":true,"write":false,"create":false,"submit":false,"cancel":false,"amend":false,"print":true,"email":true,"report":true,"import":false,"export":true,"share":false,"if_owner":false,"permlevel":0},{"role":"System Manager","read":true,"write":true,"create":true,"submit":true,"cancel":true,"amend":true,"print":true,"email":true,"report":true,"import":false,"export":true,"share":false,"if_owner":false,"permlevel":0}],"revision":1}'),
    '$.revision',
    COALESCE((SELECT revision+1 FROM doctype_definitions WHERE tenant_id='alu' AND doctype='Item Variant Attribute'),1)
  ),
  0,'admin','2026-07-29T11:26:41.071Z'
WHERE EXISTS (
    SELECT 1 FROM installed_apps
    WHERE tenant_id='alu' AND app_id='alumdoor'
      AND content_hash<>'d937da97d83226f626629c4963493ee00b0e8ccdad3a06085d4ef1168ec85476'
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
  'alu','Item Barcode','Alumdoor',
  0,0,1,
  COALESCE((SELECT revision+1 FROM doctype_definitions WHERE tenant_id='alu' AND doctype='Item Barcode'),1),
  json_set(
    json('{"name":"Item Barcode","label":"Mã vạch mặt hàng","module":"Alumdoor","custom":false,"is_child":true,"is_tree":false,"is_single":false,"is_submittable":false,"track_changes":true,"track_seen":false,"allow_rename":false,"autoname":"autoincrement","title_field":"barcode","sort_order":"DESC","fields":[{"fieldname":"barcode","label":"Mã vạch","fieldtype":"Data","required":true,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":true,"in_list_view":true,"in_standard_filter":false,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":1},{"fieldname":"barcode_type","label":"Loại mã","fieldtype":"Select","options":"EAN-13\nEAN-8\nUPC-A\nCode 128\nQR\nKhác","required":false,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"in_list_view":true,"in_standard_filter":true,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":2},{"fieldname":"uom","label":"Đơn vị áp dụng","fieldtype":"Link","options":"UOM","required":false,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"in_list_view":true,"in_standard_filter":true,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":3}],"permissions":[{"role":"Chủ xưởng","read":true,"write":true,"create":true,"submit":false,"cancel":false,"amend":false,"print":true,"email":true,"report":true,"import":false,"export":true,"share":false,"if_owner":false,"permlevel":0},{"role":"Thủ kho","read":true,"write":true,"create":true,"submit":false,"cancel":false,"amend":false,"print":true,"email":true,"report":true,"import":false,"export":true,"share":false,"if_owner":false,"permlevel":0},{"role":"Kế toán","read":true,"write":false,"create":false,"submit":false,"cancel":false,"amend":false,"print":true,"email":true,"report":true,"import":false,"export":true,"share":false,"if_owner":false,"permlevel":0},{"role":"Kinh doanh","read":true,"write":false,"create":false,"submit":false,"cancel":false,"amend":false,"print":true,"email":true,"report":true,"import":false,"export":true,"share":false,"if_owner":false,"permlevel":0},{"role":"System Manager","read":true,"write":true,"create":true,"submit":true,"cancel":true,"amend":true,"print":true,"email":true,"report":true,"import":false,"export":true,"share":false,"if_owner":false,"permlevel":0}],"revision":1}'),
    '$.revision',
    COALESCE((SELECT revision+1 FROM doctype_definitions WHERE tenant_id='alu' AND doctype='Item Barcode'),1)
  ),
  0,'admin','2026-07-29T11:26:41.071Z'
WHERE EXISTS (
    SELECT 1 FROM installed_apps
    WHERE tenant_id='alu' AND app_id='alumdoor'
      AND content_hash<>'d937da97d83226f626629c4963493ee00b0e8ccdad3a06085d4ef1168ec85476'
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
  'alu','Item Default','Alumdoor',
  0,0,1,
  COALESCE((SELECT revision+1 FROM doctype_definitions WHERE tenant_id='alu' AND doctype='Item Default'),1),
  json_set(
    json('{"name":"Item Default","label":"Mặc định theo công ty","module":"Alumdoor","custom":false,"is_child":true,"is_tree":false,"is_single":false,"is_submittable":false,"track_changes":true,"track_seen":false,"allow_rename":false,"autoname":"autoincrement","title_field":"company","sort_order":"DESC","fields":[{"fieldname":"company","label":"Công ty","fieldtype":"Link","options":"Company","required":true,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"in_list_view":true,"in_standard_filter":true,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":1},{"fieldname":"default_warehouse","label":"Kho mặc định","fieldtype":"Link","options":"Warehouse","required":false,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"in_list_view":true,"in_standard_filter":true,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":2},{"fieldname":"inventory_account","label":"Tài khoản tồn kho","fieldtype":"Link","options":"Account","required":false,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"in_list_view":true,"in_standard_filter":true,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":3},{"fieldname":"income_account","label":"Tài khoản doanh thu","fieldtype":"Link","options":"Account","required":false,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"in_list_view":true,"in_standard_filter":true,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":4},{"fieldname":"expense_account","label":"Tài khoản chi phí / giá vốn","fieldtype":"Link","options":"Account","required":false,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"in_list_view":true,"in_standard_filter":true,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":5}],"permissions":[{"role":"Chủ xưởng","read":true,"write":true,"create":true,"submit":false,"cancel":false,"amend":false,"print":true,"email":true,"report":true,"import":false,"export":true,"share":false,"if_owner":false,"permlevel":0},{"role":"Kế toán","read":true,"write":true,"create":true,"submit":false,"cancel":false,"amend":false,"print":true,"email":true,"report":true,"import":false,"export":true,"share":false,"if_owner":false,"permlevel":0},{"role":"Thủ kho","read":true,"write":false,"create":false,"submit":false,"cancel":false,"amend":false,"print":true,"email":true,"report":true,"import":false,"export":true,"share":false,"if_owner":false,"permlevel":0},{"role":"Kinh doanh","read":true,"write":false,"create":false,"submit":false,"cancel":false,"amend":false,"print":true,"email":true,"report":true,"import":false,"export":true,"share":false,"if_owner":false,"permlevel":0},{"role":"System Manager","read":true,"write":true,"create":true,"submit":true,"cancel":true,"amend":true,"print":true,"email":true,"report":true,"import":false,"export":true,"share":false,"if_owner":false,"permlevel":0}],"revision":1}'),
    '$.revision',
    COALESCE((SELECT revision+1 FROM doctype_definitions WHERE tenant_id='alu' AND doctype='Item Default'),1)
  ),
  0,'admin','2026-07-29T11:26:41.071Z'
WHERE EXISTS (
    SELECT 1 FROM installed_apps
    WHERE tenant_id='alu' AND app_id='alumdoor'
      AND content_hash<>'d937da97d83226f626629c4963493ee00b0e8ccdad3a06085d4ef1168ec85476'
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
  'alu','Item Reorder','Alumdoor',
  0,0,1,
  COALESCE((SELECT revision+1 FROM doctype_definitions WHERE tenant_id='alu' AND doctype='Item Reorder'),1),
  json_set(
    json('{"name":"Item Reorder","label":"Mức tồn và đặt hàng","module":"Alumdoor","custom":false,"is_child":true,"is_tree":false,"is_single":false,"is_submittable":false,"track_changes":true,"track_seen":false,"allow_rename":false,"autoname":"autoincrement","title_field":"warehouse","sort_order":"DESC","fields":[{"fieldname":"warehouse","label":"Kho","fieldtype":"Link","options":"Warehouse","required":true,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"in_list_view":true,"in_standard_filter":true,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":1},{"fieldname":"safety_stock","label":"Tồn an toàn","fieldtype":"Float","required":false,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"in_list_view":true,"in_standard_filter":false,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":2},{"fieldname":"reorder_level","label":"Điểm đặt hàng","fieldtype":"Float","required":false,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"in_list_view":true,"in_standard_filter":false,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":3},{"fieldname":"reorder_qty","label":"Số lượng đặt đề xuất","fieldtype":"Float","required":false,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"in_list_view":true,"in_standard_filter":false,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":4},{"fieldname":"lead_time_days","label":"Thời gian cung ứng (ngày)","fieldtype":"Int","required":false,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"in_list_view":true,"in_standard_filter":false,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":5}],"permissions":[{"role":"Chủ xưởng","read":true,"write":true,"create":true,"submit":false,"cancel":false,"amend":false,"print":true,"email":true,"report":true,"import":false,"export":true,"share":false,"if_owner":false,"permlevel":0},{"role":"Thủ kho","read":true,"write":true,"create":true,"submit":false,"cancel":false,"amend":false,"print":true,"email":true,"report":true,"import":false,"export":true,"share":false,"if_owner":false,"permlevel":0},{"role":"Kế toán","read":true,"write":false,"create":false,"submit":false,"cancel":false,"amend":false,"print":true,"email":true,"report":true,"import":false,"export":true,"share":false,"if_owner":false,"permlevel":0},{"role":"Sản xuất","read":true,"write":false,"create":false,"submit":false,"cancel":false,"amend":false,"print":true,"email":true,"report":true,"import":false,"export":true,"share":false,"if_owner":false,"permlevel":0},{"role":"System Manager","read":true,"write":true,"create":true,"submit":true,"cancel":true,"amend":true,"print":true,"email":true,"report":true,"import":false,"export":true,"share":false,"if_owner":false,"permlevel":0}],"revision":1}'),
    '$.revision',
    COALESCE((SELECT revision+1 FROM doctype_definitions WHERE tenant_id='alu' AND doctype='Item Reorder'),1)
  ),
  0,'admin','2026-07-29T11:26:41.071Z'
WHERE EXISTS (
    SELECT 1 FROM installed_apps
    WHERE tenant_id='alu' AND app_id='alumdoor'
      AND content_hash<>'d937da97d83226f626629c4963493ee00b0e8ccdad3a06085d4ef1168ec85476'
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
  'alu','Supplier Item','Alumdoor',
  0,0,0,
  COALESCE((SELECT revision+1 FROM doctype_definitions WHERE tenant_id='alu' AND doctype='Supplier Item'),1),
  json_set(
    json('{"name":"Supplier Item","label":"Mã hàng nhà cung cấp","module":"Alumdoor","custom":false,"is_child":false,"is_tree":false,"is_single":false,"is_submittable":false,"track_changes":true,"track_seen":false,"allow_rename":false,"autoname":"format:{supplier}:{item_code}","title_field":"supplier_item_code","sort_order":"DESC","search_fields":["supplier_item_code"],"fields":[{"fieldname":"supplier","label":"Nhà cung cấp","fieldtype":"Link","options":"Supplier","required":true,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"in_list_view":true,"in_standard_filter":true,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":1},{"fieldname":"item_code","label":"Mặt hàng","fieldtype":"Link","options":"Item","required":true,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"in_list_view":true,"in_standard_filter":true,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":2},{"fieldname":"supplier_item_code","label":"Mã của nhà cung cấp","fieldtype":"Data","required":true,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"in_list_view":true,"in_standard_filter":false,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":3},{"fieldname":"preferred","label":"Nhà cung cấp ưu tiên","fieldtype":"Check","required":false,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"in_list_view":true,"in_standard_filter":false,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":4},{"fieldname":"minimum_order_qty","label":"Số lượng mua tối thiểu","fieldtype":"Float","required":false,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"in_list_view":false,"in_standard_filter":false,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":5},{"fieldname":"lead_time_days","label":"Thời gian giao (ngày)","fieldtype":"Int","required":false,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"in_list_view":true,"in_standard_filter":false,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":6},{"fieldname":"last_purchase_rate","label":"Giá mua gần nhất","fieldtype":"Currency","required":false,"read_only":false,"hidden":true,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"in_list_view":false,"in_standard_filter":false,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":7},{"fieldname":"note","label":"Ghi chú","fieldtype":"Small Text","required":false,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"in_list_view":false,"in_standard_filter":false,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":8},{"fieldname":"disabled","label":"Ngừng dùng","fieldtype":"Check","required":false,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"in_list_view":true,"in_standard_filter":false,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":9}],"permissions":[{"role":"Chủ xưởng","read":true,"write":true,"create":true,"submit":false,"cancel":false,"amend":false,"print":true,"email":true,"report":true,"import":false,"export":true,"share":false,"if_owner":false,"permlevel":0},{"role":"Kế toán","read":true,"write":true,"create":true,"submit":false,"cancel":false,"amend":false,"print":true,"email":true,"report":true,"import":false,"export":true,"share":false,"if_owner":false,"permlevel":0},{"role":"Thủ kho","read":true,"write":false,"create":false,"submit":false,"cancel":false,"amend":false,"print":true,"email":true,"report":true,"import":false,"export":true,"share":false,"if_owner":false,"permlevel":0},{"role":"Sản xuất","read":true,"write":false,"create":false,"submit":false,"cancel":false,"amend":false,"print":true,"email":true,"report":true,"import":false,"export":true,"share":false,"if_owner":false,"permlevel":0},{"role":"Kinh doanh","read":true,"write":false,"create":false,"submit":false,"cancel":false,"amend":false,"print":true,"email":true,"report":true,"import":false,"export":true,"share":false,"if_owner":false,"permlevel":0},{"role":"System Manager","read":true,"write":true,"create":true,"submit":true,"cancel":true,"amend":true,"print":true,"email":true,"report":true,"import":false,"export":true,"share":false,"if_owner":false,"permlevel":0}],"revision":1}'),
    '$.revision',
    COALESCE((SELECT revision+1 FROM doctype_definitions WHERE tenant_id='alu' AND doctype='Supplier Item'),1)
  ),
  0,'admin','2026-07-29T11:26:41.071Z'
WHERE EXISTS (
    SELECT 1 FROM installed_apps
    WHERE tenant_id='alu' AND app_id='alumdoor'
      AND content_hash<>'d937da97d83226f626629c4963493ee00b0e8ccdad3a06085d4ef1168ec85476'
  )
ON CONFLICT(tenant_id,doctype) DO UPDATE SET
  module=excluded.module,is_custom=excluded.is_custom,is_submittable=excluded.is_submittable,
  is_child=excluded.is_child,revision=excluded.revision,metadata_json=excluded.metadata_json,
  disabled=0,modified_by=excluded.modified_by,modified_at=excluded.modified_at;
