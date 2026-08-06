-- Core operational defaults used by the shared BusinessContext and generic forms.
--
-- This is a platform Single DocType, not an Alumdoor setting. Applications may expose it
-- in their Settings navigation, but Company / Currency / Warehouse / Fiscal Year / Cost
-- Center / Price List remain the canonical master authorities.

INSERT OR IGNORE INTO doctype_definitions (
  tenant_id, doctype, module, is_custom, is_submittable, is_child, revision,
  metadata_json, disabled, modified_by, modified_at
) VALUES (
  '__standard__',
  'Global Defaults',
  'Setup',
  0,
  0,
  0,
  1,
  '{"name":"Global Defaults","label":"Mặc định vận hành","module":"Setup","is_single":true,"track_changes":true,"revision":1,"fields":[{"fieldname":"default_company","label":"Công ty mặc định","fieldtype":"Link","options":"Company","description":"Phạm vi công ty dùng khi người dùng chưa chọn công ty riêng."},{"fieldname":"default_currency","label":"Tiền tệ mặc định","fieldtype":"Link","options":"Currency","description":"Fallback khi công ty đang chọn chưa khai tiền tệ mặc định."},{"fieldname":"default_warehouse","label":"Kho mặc định","fieldtype":"Link","options":"Warehouse","description":"Kho khởi tạo cho người dùng chưa có phạm vi kho đã lưu."},{"fieldname":"default_fiscal_year","label":"Năm tài chính mặc định","fieldtype":"Link","options":"Fiscal Year"},{"fieldname":"default_cost_center","label":"Trung tâm chi phí mặc định","fieldtype":"Link","options":"Cost Center"},{"fieldname":"default_selling_price_list","label":"Bảng giá bán mặc định","fieldtype":"Link","options":"Price List"},{"fieldname":"default_buying_price_list","label":"Bảng giá mua mặc định","fieldtype":"Link","options":"Price List"}],"permissions":[{"role":"System Manager","read":true,"write":true,"create":true,"report":true,"export":true,"share":true}]}',
  0,
  'migration:0117_core_global_defaults',
  '2026-08-06T00:00:00.000Z'
);

-- Existing tenants must see the same platform setting immediately; new tenants receive
-- it from __standard__ through provisionStandardCatalog(). INSERT OR IGNORE never replaces
-- a tenant-owned metadata revision.
INSERT OR IGNORE INTO doctype_definitions (
  tenant_id, doctype, module, is_custom, is_submittable, is_child, revision,
  metadata_json, disabled, modified_by, modified_at
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
  'migration:0117_core_global_defaults',
  '2026-08-06T00:00:00.000Z'
FROM (
  SELECT DISTINCT tenant_id
  FROM doctype_definitions
  WHERE tenant_id <> '__standard__'
) AS tenant
JOIN doctype_definitions AS standard
  ON standard.tenant_id='__standard__' AND standard.doctype='Global Defaults';
