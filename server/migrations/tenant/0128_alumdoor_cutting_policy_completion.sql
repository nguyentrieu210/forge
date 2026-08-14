-- Ensure every Alumdoor tenant has the canonical, data-driven door formulas used by
-- sales preview and production. These records belong to tenant configuration; the
-- Worker deliberately does not hard-code a fallback when configuration is absent.

WITH policy_seed(policy_name, search_content, payload_json) AS (
  VALUES
    (
      'Cửa Đức — công thức chuẩn',
      'Cửa Đức; Cửa CN Đức; U75; công thức đo và tính giá',
      json('{"policy_name":"Cửa Đức — công thức chuẩn","door_type":"Cửa Đức","dealer_width_basis":"Phủ bì nhựa","retail_width_basis":"Phủ bì ray","dealer_cut_deduction_m":0.02,"retail_cut_deduction_m":0.08,"dealer_split_sales_basis":"Phủ bì nhựa","dealer_full_sales_basis":"Phủ bì nhựa","retail_sales_basis":"Phủ bì ray","purchase_formula":"Kg thực tế","priority":0,"disabled":false,"note":"Sản xuất: đại lý PB nhựa − 0,02; lẻ PB ray − 0,08. Mua: kg thực tế × đơn giá.","leaf_divisor_source":"Bản lá của bộ quy cách","leaf_rounding":"Ngưỡng trừ-một-lá","leaf_round_threshold":0.6,"leaf_formula":"Kiểu Đức","leaf_height_deduction_m":0.13,"ray_type":"U75","_seed_source":"migration-0128-canonical-cutting-policy"}')
    ),
    (
      'Cửa Úc — công thức chuẩn',
      'Cửa Úc; PB ray; công thức đo và tính giá',
      json('{"policy_name":"Cửa Úc — công thức chuẩn","door_type":"Cửa Úc","dealer_width_basis":"Phủ bì ray","retail_width_basis":"Phủ bì ray","dealer_cut_deduction_m":0.03,"retail_cut_deduction_m":0.03,"dealer_split_sales_basis":"Phủ bì ray","dealer_full_sales_basis":"Phủ bì ray","retail_sales_basis":"Phủ bì ray","purchase_formula":"Barem kg/m2","purchase_height_basis":"Cao phủ bì","purchase_width_basis":"Rộng cắt lá","priority":0,"disabled":false,"note":"Rộng cắt = PB ray − 0,03. Mua: barem × Cao PB × Rộng cắt. Bán: Cao PB × PB ray.","leaf_height_deduction_m":0,"leaf_rounding":"Nấc 0-0.3-0.7-1","leaf_variants":[{"variant_label":"Motor trong","addend":2},{"variant_label":"Kéo tay","addend":2},{"variant_label":"Motor ngoài","addend":1.5},{"variant_label":"Motor ngoài tự dừng","addend":1.3}],"leaf_formula":"Kiểu Úc","leaf_divisor_source":"Hằng số của chính sách","leaf_divisor_const":0.465,"_seed_source":"migration-0128-canonical-cutting-policy"}')
    ),
    (
      'Cửa tấm liền Úc — công thức chuẩn',
      'Cửa tấm liền Úc; cửa Úc KT MTN; Đức kéo tay AL70; công thức đo và tính giá',
      json('{"policy_name":"Cửa tấm liền Úc — công thức chuẩn","door_type":"Cửa tấm liền Úc","dealer_width_basis":"Phủ bì ray","retail_width_basis":"Phủ bì ray","dealer_cut_deduction_m":0.03,"retail_cut_deduction_m":0.03,"dealer_split_sales_basis":"Phủ bì ray","dealer_full_sales_basis":"Phủ bì ray","retail_sales_basis":"Phủ bì ray","purchase_formula":"Kg thực tế","priority":0,"disabled":false,"note":"Bán theo Cao PB × PB ray. Chia lá tấm liền: (Cao PB − 0,13) ÷ 0,068.","leaf_height_deduction_m":0.13,"leaf_rounding":"Làm tròn xuống","leaf_formula":"Kiểu tấm liền Úc","leaf_divisor_source":"Hằng số của chính sách","leaf_divisor_const":0.068,"_seed_source":"migration-0128-canonical-cutting-policy"}')
    ),
    (
      'Cửa Lưới — công thức chuẩn',
      'Cửa Lưới; PB ray; rộng cắt lá; công thức đo và tính giá',
      json('{"policy_name":"Cửa Lưới — công thức chuẩn","door_type":"Cửa Lưới","dealer_width_basis":"Phủ bì ray","retail_width_basis":"Phủ bì ray","dealer_cut_deduction_m":0.03,"retail_cut_deduction_m":0.03,"butterfly_cut_deduction_m":0.035,"dealer_split_sales_basis":"Rộng cắt lá","dealer_full_sales_basis":"Phủ bì ray","retail_sales_basis":"Phủ bì ray","purchase_formula":"Barem kg/m2","purchase_height_basis":"Cao lưới","purchase_width_basis":"Rộng cắt lá","priority":0,"disabled":false,"note":"Đại lý tách món chỉ lấy lưới bán theo rộng cắt; trọn bộ và khách lẻ bán theo PB ray. Có bản bướm trừ 0,035.","leaf_formula":"Kiểu Đài Loan Lưới","_seed_source":"migration-0128-canonical-cutting-policy"}')
    ),
    (
      'Cửa Đài Loan — công thức chuẩn',
      'Cửa Đài Loan; cửa kéo Đài Loan; PB ray; công thức đo và tính giá',
      json('{"policy_name":"Cửa Đài Loan — công thức chuẩn","door_type":"Cửa Đài Loan","dealer_width_basis":"Phủ bì ray","retail_width_basis":"Phủ bì ray","dealer_cut_deduction_m":0.03,"retail_cut_deduction_m":0.03,"butterfly_cut_deduction_m":0.035,"dealer_split_sales_basis":"Rộng cắt lá","dealer_full_sales_basis":"Phủ bì ray","retail_sales_basis":"Phủ bì ray","manual_pull_sales_basis":"Phủ bì ray","purchase_formula":"Barem kg/m2","purchase_height_basis":"Cao lưới","purchase_width_basis":"Rộng cắt lá","priority":0,"disabled":false,"note":"Đại lý tách món bán theo rộng cắt; trọn bộ, kéo tay và khách lẻ bán theo PB ray. Có bản bướm trừ 0,035.","leaf_formula":"Kiểu Đài Loan Lưới","_seed_source":"migration-0128-canonical-cutting-policy"}')
    ),
    (
      'Cửa Siêu Trường — công thức chuẩn',
      'Cửa Siêu Trường; PB ray; rộng cắt lá; công thức đo và tính giá',
      json('{"policy_name":"Cửa Siêu Trường — công thức chuẩn","door_type":"Cửa Siêu Trường","dealer_width_basis":"Phủ bì ray","retail_width_basis":"Phủ bì ray","dealer_cut_deduction_m":0.03,"retail_cut_deduction_m":0.03,"butterfly_cut_deduction_m":0.035,"dealer_split_sales_basis":"Rộng cắt lá","dealer_full_sales_basis":"Rộng cắt lá","retail_sales_basis":"Phủ bì ray","purchase_formula":"Barem kg/m2","purchase_height_basis":"Cao lưới","purchase_width_basis":"Rộng cắt lá","priority":0,"disabled":false,"note":"Đại lý bán theo rộng cắt; khách lẻ bán theo PB ray. Có bản bướm trừ 0,035.","leaf_formula":"Kiểu Đức","_seed_source":"migration-0128-canonical-cutting-policy"}')
    )
), tenant_scope AS (
  SELECT DISTINCT tenant_id
  FROM documents
  WHERE doctype = 'Item'
    AND json_extract(payload_json, '$.inventory_mode') = 'Thành phẩm theo m2'
)
INSERT INTO documents(
  tenant_id, doc_key, doctype, name, owner, docstatus, status, version,
  created_at, modified_at, modified_by, payload_json
)
SELECT
  tenant_scope.tenant_id,
  'Cutting Policy:' || policy_seed.policy_name,
  'Cutting Policy',
  policy_seed.policy_name,
  'migration-0128',
  0,
  'Draft',
  1,
  '2026-08-13T00:00:00.000Z',
  '2026-08-13T00:00:00.000Z',
  'migration-0128',
  policy_seed.payload_json
FROM tenant_scope
CROSS JOIN policy_seed
WHERE 1 = 1
ON CONFLICT(tenant_id, doc_key) DO NOTHING;

WITH policy_seed(policy_name, search_content) AS (
  VALUES
    ('Cửa Đức — công thức chuẩn', 'Cửa Đức; Cửa CN Đức; U75; công thức đo và tính giá'),
    ('Cửa Úc — công thức chuẩn', 'Cửa Úc; PB ray; công thức đo và tính giá'),
    ('Cửa tấm liền Úc — công thức chuẩn', 'Cửa tấm liền Úc; cửa Úc KT MTN; Đức kéo tay AL70; công thức đo và tính giá'),
    ('Cửa Lưới — công thức chuẩn', 'Cửa Lưới; PB ray; rộng cắt lá; công thức đo và tính giá'),
    ('Cửa Đài Loan — công thức chuẩn', 'Cửa Đài Loan; cửa kéo Đài Loan; PB ray; công thức đo và tính giá'),
    ('Cửa Siêu Trường — công thức chuẩn', 'Cửa Siêu Trường; PB ray; rộng cắt lá; công thức đo và tính giá')
), tenant_scope AS (
  SELECT DISTINCT tenant_id
  FROM documents
  WHERE doctype = 'Item'
    AND json_extract(payload_json, '$.inventory_mode') = 'Thành phẩm theo m2'
)
INSERT INTO document_search(tenant_id, doctype, name, title, content, modified_at)
SELECT
  tenant_scope.tenant_id,
  'Cutting Policy',
  policy_seed.policy_name,
  policy_seed.policy_name,
  policy_seed.search_content,
  '2026-08-13T00:00:00.000Z'
FROM tenant_scope
CROSS JOIN policy_seed
WHERE 1 = 1
ON CONFLICT(tenant_id, doctype, name) DO UPDATE SET
  title = excluded.title,
  content = excluded.content,
  modified_at = excluded.modified_at;
