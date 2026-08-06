-- Expose the System Settings authority that the Forge boot path already reads from
-- master_records. This is a platform Single DocType: apps may consume the effective
-- defaults, but they do not own or duplicate them.

INSERT OR IGNORE INTO doctype_definitions (
  tenant_id,
  doctype,
  module,
  is_custom,
  is_submittable,
  is_child,
  revision,
  metadata_json,
  disabled,
  modified_by,
  modified_at
) VALUES (
  '__standard__',
  'System Settings',
  'Setup',
  0,
  0,
  0,
  1,
  '{"name":"System Settings","label":"Cài đặt hệ thống","module":"Setup","is_single":true,"track_changes":true,"fields":[{"fieldname":"currency","label":"Tiền tệ mặc định","fieldtype":"Link","options":"Currency","description":"Tiền tệ fallback dùng khi chứng từ hoặc công ty chưa cung cấp ngữ cảnh tiền tệ cụ thể."},{"fieldname":"date_format","label":"Định dạng ngày","fieldtype":"Select","options":"dd-mm-yyyy\ndd/mm/yyyy\nmm-dd-yyyy\nmm/dd/yyyy\nyyyy-mm-dd","default":"dd-mm-yyyy"},{"fieldname":"number_format","label":"Định dạng số","fieldtype":"Select","options":"#,###.##\n#.###,##\n# ###,##\n#,###.###","default":"#,###.##"},{"fieldname":"time_zone","label":"Múi giờ","fieldtype":"Data","default":"Asia/Ho_Chi_Minh"}],"permissions":[{"role":"System Manager","read":true,"write":true,"create":true,"report":true,"export":true}]}',
  0,
  'migration:0117_standard_system_settings',
  '2026-08-06T00:00:00.000Z'
);

-- Existing tenant databases need the same metadata immediately; INSERT OR IGNORE keeps
-- any tenant-owned definition intact. The value document itself stays in master_records
-- and is never overwritten by this migration.
INSERT OR IGNORE INTO doctype_definitions (
  tenant_id,
  doctype,
  module,
  is_custom,
  is_submittable,
  is_child,
  revision,
  metadata_json,
  disabled,
  modified_by,
  modified_at
)
SELECT
  tenant.tenant_id,
  standard.doctype,
  standard.module,
  standard.is_custom,
  standard.is_submittable,
  standard.is_child,
  standard.revision,
  standard.metadata_json,
  standard.disabled,
  'migration:0117_standard_system_settings',
  '2026-08-06T00:00:00.000Z'
FROM (
  SELECT DISTINCT tenant_id
  FROM doctype_definitions
  WHERE tenant_id <> '__standard__'
) AS tenant
JOIN doctype_definitions AS standard
  ON standard.tenant_id='__standard__' AND standard.doctype='System Settings';
