-- Alumdoor 1.18.1 metadata activation: Warehouse list -> tree.
-- Generated from the compiler-normalized app manifest.

UPDATE doctype_definitions
SET module = 'Alumdoor',
    is_custom = 0,
    is_submittable = 0,
    is_child = 0,
    revision = 25,
    metadata_json = '{"name":"Warehouse","label":"Kho","module":"Alumdoor","custom":false,"is_child":false,"is_tree":true,"is_single":false,"is_submittable":false,"track_changes":true,"track_seen":false,"allow_rename":false,"autoname":"field:warehouse_name","title_field":"warehouse_name","sort_order":"DESC","fields":[{"fieldname":"warehouse_name","label":"Tên kho","fieldtype":"Data","required":true,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":true,"in_list_view":true,"in_standard_filter":false,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":1},{"fieldname":"parent_warehouse","label":"Kho cha","fieldtype":"Link","options":"Warehouse","required":false,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"in_list_view":true,"in_standard_filter":true,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":2},{"fieldname":"is_group","label":"Là nhóm chứa","fieldtype":"Check","required":false,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"in_list_view":true,"in_standard_filter":false,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":3},{"fieldname":"address","label":"Địa chỉ","fieldtype":"Small Text","required":false,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"in_list_view":true,"in_standard_filter":false,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":4},{"fieldname":"keeper","label":"Thủ kho phụ trách","fieldtype":"Data","required":false,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"in_list_view":true,"in_standard_filter":false,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":5},{"fieldname":"disabled","label":"Ngừng dùng","fieldtype":"Check","required":false,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"in_list_view":false,"in_standard_filter":false,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":6}],"permissions":[{"role":"Chủ xưởng","read":true,"write":true,"create":true,"submit":false,"cancel":false,"amend":false,"print":true,"email":true,"report":true,"import":false,"export":true,"share":false,"if_owner":false,"permlevel":0},{"role":"Thủ kho","read":true,"write":true,"create":true,"submit":false,"cancel":false,"amend":false,"print":true,"email":true,"report":true,"import":false,"export":true,"share":false,"if_owner":false,"permlevel":0},{"role":"Kinh doanh","read":true,"write":false,"create":false,"submit":false,"cancel":false,"amend":false,"print":true,"email":true,"report":true,"import":false,"export":true,"share":false,"if_owner":false,"permlevel":0},{"role":"Kế toán","read":true,"write":false,"create":false,"submit":false,"cancel":false,"amend":false,"print":true,"email":true,"report":true,"import":false,"export":true,"share":false,"if_owner":false,"permlevel":0},{"role":"Sản xuất","read":true,"write":false,"create":false,"submit":false,"cancel":false,"amend":false,"print":true,"email":true,"report":true,"import":false,"export":true,"share":false,"if_owner":false,"permlevel":0},{"role":"System Manager","read":true,"write":true,"create":true,"submit":true,"cancel":true,"amend":true,"print":true,"email":true,"report":true,"import":false,"export":true,"share":false,"if_owner":false,"permlevel":0}],"revision":25}',
    disabled = 0,
    modified_by = 'admin',
    modified_at = '2026-07-28T12:30:00.000Z'
WHERE tenant_id = 'alu' AND doctype = 'Warehouse' AND revision < 25;

UPDATE installed_apps
SET version = '1.18.1',
    content_hash = 'a8886f3b18dcf3d67f7b24992c9f84b9ee029c7c58c581cd9b00a117a490c50f',
    manifest_json = json_set(
      manifest_json,
      '$.version', '1.18.1',
      '$.doctypes[' || (
        SELECT CAST(key AS TEXT)
        FROM json_each(installed_apps.manifest_json, '$.doctypes')
        WHERE json_extract(value, '$.name') = 'Warehouse'
        LIMIT 1
      ) || ']', json('{"name":"Warehouse","label":"Kho","module":"Alumdoor","custom":false,"is_child":false,"is_tree":true,"is_single":false,"is_submittable":false,"track_changes":true,"track_seen":false,"allow_rename":false,"autoname":"field:warehouse_name","title_field":"warehouse_name","sort_order":"DESC","fields":[{"fieldname":"warehouse_name","label":"Tên kho","fieldtype":"Data","required":true,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":true,"in_list_view":true,"in_standard_filter":false,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":1},{"fieldname":"parent_warehouse","label":"Kho cha","fieldtype":"Link","options":"Warehouse","required":false,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"in_list_view":true,"in_standard_filter":true,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":2},{"fieldname":"is_group","label":"Là nhóm chứa","fieldtype":"Check","required":false,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"in_list_view":true,"in_standard_filter":false,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":3},{"fieldname":"address","label":"Địa chỉ","fieldtype":"Small Text","required":false,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"in_list_view":true,"in_standard_filter":false,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":4},{"fieldname":"keeper","label":"Thủ kho phụ trách","fieldtype":"Data","required":false,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"in_list_view":true,"in_standard_filter":false,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":5},{"fieldname":"disabled","label":"Ngừng dùng","fieldtype":"Check","required":false,"read_only":false,"hidden":false,"list_only":false,"allow_on_submit":false,"no_copy":false,"unique":false,"in_list_view":false,"in_standard_filter":false,"search_index":false,"permlevel":0,"set_only_once":false,"non_negative":false,"not_nullable":false,"print_hide":false,"print_hide_if_no_value":false,"idx":6}],"permissions":[{"role":"Chủ xưởng","read":true,"write":true,"create":true,"submit":false,"cancel":false,"amend":false,"print":true,"email":true,"report":true,"import":false,"export":true,"share":false,"if_owner":false,"permlevel":0},{"role":"Thủ kho","read":true,"write":true,"create":true,"submit":false,"cancel":false,"amend":false,"print":true,"email":true,"report":true,"import":false,"export":true,"share":false,"if_owner":false,"permlevel":0},{"role":"Kinh doanh","read":true,"write":false,"create":false,"submit":false,"cancel":false,"amend":false,"print":true,"email":true,"report":true,"import":false,"export":true,"share":false,"if_owner":false,"permlevel":0},{"role":"Kế toán","read":true,"write":false,"create":false,"submit":false,"cancel":false,"amend":false,"print":true,"email":true,"report":true,"import":false,"export":true,"share":false,"if_owner":false,"permlevel":0},{"role":"Sản xuất","read":true,"write":false,"create":false,"submit":false,"cancel":false,"amend":false,"print":true,"email":true,"report":true,"import":false,"export":true,"share":false,"if_owner":false,"permlevel":0},{"role":"System Manager","read":true,"write":true,"create":true,"submit":true,"cancel":true,"amend":true,"print":true,"email":true,"report":true,"import":false,"export":true,"share":false,"if_owner":false,"permlevel":0}],"revision":1}')
    ),
    modified_at = '2026-07-28T12:30:00.000Z'
WHERE tenant_id = 'alu' AND app_id = 'alumdoor' AND version = '1.18.0';

WITH fixtures(name, data_json) AS (
  VALUES
    ('Kho Alumdoor', json_object(
      'warehouse_name', 'Kho Alumdoor',
      'is_group', json('true'),
      'disabled', json('false')
    )),
    ('K36', json_object(
      'warehouse_name', 'K36',
      'parent_warehouse', 'Kho Alumdoor',
      'is_group', json('false'),
      'address', 'Kho vật lý K36',
      'disabled', json('false')
    )),
    ('K12', json_object(
      'warehouse_name', 'K12',
      'parent_warehouse', 'Kho Alumdoor',
      'is_group', json('false'),
      'address', 'Kho vật lý K12',
      'disabled', json('false')
    ))
)
INSERT INTO master_records(tenant_id, record_type, name, disabled, data_json, modified_at)
SELECT 'alu', 'Warehouse', name, 0, data_json, '2026-07-28T12:30:00.000Z'
FROM fixtures
WHERE true
ON CONFLICT(tenant_id, record_type, name) DO UPDATE SET
  disabled = 0,
  data_json = excluded.data_json,
  modified_at = excluded.modified_at;

