-- Alumdoor employee purchase funding: keep Material Request as the procurement source
-- and extend Payment Entry only for approved employee bank advances.
-- Scope every metadata mutation to tenants where the Alumdoor app is installed.

-- Material Request funding fields. Append only when missing so the migration is idempotent
-- under restore drills and never overwrites a later customization of the same field.
UPDATE doctype_definitions
SET metadata_json = json_insert(
      metadata_json,
      '$.fields[#]', json_object(
        'fieldname','purchase_funding_employee','label','Nhân viên đề xuất','fieldtype','Link','options','Employee',
        'in_list_view',json('true'),'in_standard_filter',json('true')
      )
    ),
    revision = revision + 1,
    modified_by = 'migration:0043_alumdoor_purchase_funding',
    modified_at = CURRENT_TIMESTAMP
WHERE doctype='Material Request'
  AND tenant_id IN (SELECT tenant_id FROM installed_apps WHERE app_id='alumdoor')
  AND NOT EXISTS (
    SELECT 1 FROM json_each(doctype_definitions.metadata_json, '$.fields')
    WHERE json_extract(value, '$.fieldname')='purchase_funding_employee'
  );

UPDATE doctype_definitions
SET metadata_json = json_insert(
      metadata_json,
      '$.fields[#]', json_object(
        'fieldname','purchase_funding_amount','label','Số tiền đề xuất','fieldtype','Currency',
        'non_negative',json('true'),'in_list_view',json('true')
      )
    ),
    revision = revision + 1,
    modified_by = 'migration:0043_alumdoor_purchase_funding',
    modified_at = CURRENT_TIMESTAMP
WHERE doctype='Material Request'
  AND tenant_id IN (SELECT tenant_id FROM installed_apps WHERE app_id='alumdoor')
  AND NOT EXISTS (
    SELECT 1 FROM json_each(doctype_definitions.metadata_json, '$.fields')
    WHERE json_extract(value, '$.fieldname')='purchase_funding_amount'
  );

UPDATE doctype_definitions
SET metadata_json = json_insert(
      metadata_json,
      '$.fields[#]', json_object(
        'fieldname','purchase_funding_method','label','Nhận tiền bằng','fieldtype','Select',
        'options','Tiền mặt' || char(10) || 'Tài khoản ngân hàng','in_list_view',json('true'),'in_standard_filter',json('true')
      )
    ),
    revision = revision + 1,
    modified_by = 'migration:0043_alumdoor_purchase_funding',
    modified_at = CURRENT_TIMESTAMP
WHERE doctype='Material Request'
  AND tenant_id IN (SELECT tenant_id FROM installed_apps WHERE app_id='alumdoor')
  AND NOT EXISTS (
    SELECT 1 FROM json_each(doctype_definitions.metadata_json, '$.fields')
    WHERE json_extract(value, '$.fieldname')='purchase_funding_method'
  );

-- Only a safe snapshot is exposed to the proposal UI. The full account number remains
-- inside Employee.bank_account_no (permlevel 1) and is resolved by the server on payout.
UPDATE doctype_definitions
SET metadata_json = json_insert(
      metadata_json,
      '$.fields[#]', json_object(
        'fieldname','purchase_funding_bank_name','label','Ngân hàng nhận','fieldtype','Data','read_only',json('true')
      )
    ),
    revision = revision + 1,
    modified_by = 'migration:0043_alumdoor_purchase_funding',
    modified_at = CURRENT_TIMESTAMP
WHERE doctype='Material Request'
  AND tenant_id IN (SELECT tenant_id FROM installed_apps WHERE app_id='alumdoor')
  AND NOT EXISTS (
    SELECT 1 FROM json_each(doctype_definitions.metadata_json, '$.fields')
    WHERE json_extract(value, '$.fieldname')='purchase_funding_bank_name'
  );

UPDATE doctype_definitions
SET metadata_json = json_insert(
      metadata_json,
      '$.fields[#]', json_object(
        'fieldname','purchase_funding_bank_last4','label','4 số cuối tài khoản','fieldtype','Data','read_only',json('true')
      )
    ),
    revision = revision + 1,
    modified_by = 'migration:0043_alumdoor_purchase_funding',
    modified_at = CURRENT_TIMESTAMP
WHERE doctype='Material Request'
  AND tenant_id IN (SELECT tenant_id FROM installed_apps WHERE app_id='alumdoor')
  AND NOT EXISTS (
    SELECT 1 FROM json_each(doctype_definitions.metadata_json, '$.fields')
    WHERE json_extract(value, '$.fieldname')='purchase_funding_bank_last4'
  );

-- Alumdoor staff may create purchase requests but cannot approve them. The controller
-- independently enforces self-Employee and Chủ xưởng approval, so this UI/API permission
-- is not the business-rule boundary.
UPDATE doctype_definitions
SET metadata_json = json_insert(
      metadata_json,
      '$.permissions[#]', json_object('role','Employee','read',json('true'),'write',json('true'),'create',json('true'),'print',json('true'))
    ),
    revision = revision + 1,
    modified_by = 'migration:0043_alumdoor_purchase_funding',
    modified_at = CURRENT_TIMESTAMP
WHERE doctype='Material Request'
  AND tenant_id IN (SELECT tenant_id FROM installed_apps WHERE app_id='alumdoor')
  AND NOT EXISTS (
    SELECT 1 FROM json_each(doctype_definitions.metadata_json, '$.permissions')
    WHERE json_extract(value, '$.role')='Employee'
  );

-- Payment Entry already has an HRM-side contract for party_type=Employee. Add that
-- option to executable metadata so Select validation and Dynamic Link resolution agree.
UPDATE doctype_definitions
SET metadata_json = json_set(
      metadata_json,
      '$.fields[' || (
        SELECT key FROM json_each(doctype_definitions.metadata_json, '$.fields')
        WHERE json_extract(value, '$.fieldname')='party_type' LIMIT 1
      ) || '].options',
      'Customer' || char(10) || 'Supplier' || char(10) || 'Employee'
    ),
    revision = revision + 1,
    modified_by = 'migration:0043_alumdoor_purchase_funding',
    modified_at = CURRENT_TIMESTAMP
WHERE doctype='Payment Entry'
  AND tenant_id IN (SELECT tenant_id FROM installed_apps WHERE app_id='alumdoor')
  AND EXISTS (
    SELECT 1 FROM json_each(doctype_definitions.metadata_json, '$.fields')
    WHERE json_extract(value, '$.fieldname')='party_type'
  )
  AND instr(COALESCE((
    SELECT json_extract(value, '$.options') FROM json_each(doctype_definitions.metadata_json, '$.fields')
    WHERE json_extract(value, '$.fieldname')='party_type' LIMIT 1
  ), ''), 'Employee')=0;

-- Make source proposal lookup filterable for bank disbursement reconciliation.
UPDATE doctype_definitions
SET metadata_json = json_set(
      metadata_json,
      '$.fields[' || (
        SELECT key FROM json_each(doctype_definitions.metadata_json, '$.fields')
        WHERE json_extract(value, '$.fieldname')='reference_no' LIMIT 1
      ) || '].in_standard_filter',
      json('true')
    ),
    revision = revision + 1,
    modified_by = 'migration:0043_alumdoor_purchase_funding',
    modified_at = CURRENT_TIMESTAMP
WHERE doctype='Payment Entry'
  AND tenant_id IN (SELECT tenant_id FROM installed_apps WHERE app_id='alumdoor')
  AND EXISTS (
    SELECT 1 FROM json_each(doctype_definitions.metadata_json, '$.fields')
    WHERE json_extract(value, '$.fieldname')='reference_no'
  );

-- Chủ xưởng is the payout approver. Upgrade an existing permission row if present.
UPDATE doctype_definitions
SET metadata_json = json_set(
      metadata_json,
      '$.permissions[' || (
        SELECT key FROM json_each(doctype_definitions.metadata_json, '$.permissions')
        WHERE json_extract(value, '$.role')='Chủ xưởng' LIMIT 1
      ) || '].read', json('true'),
      '$.permissions[' || (
        SELECT key FROM json_each(doctype_definitions.metadata_json, '$.permissions')
        WHERE json_extract(value, '$.role')='Chủ xưởng' LIMIT 1
      ) || '].write', json('true'),
      '$.permissions[' || (
        SELECT key FROM json_each(doctype_definitions.metadata_json, '$.permissions')
        WHERE json_extract(value, '$.role')='Chủ xưởng' LIMIT 1
      ) || '].create', json('true'),
      '$.permissions[' || (
        SELECT key FROM json_each(doctype_definitions.metadata_json, '$.permissions')
        WHERE json_extract(value, '$.role')='Chủ xưởng' LIMIT 1
      ) || '].submit', json('true'),
      '$.permissions[' || (
        SELECT key FROM json_each(doctype_definitions.metadata_json, '$.permissions')
        WHERE json_extract(value, '$.role')='Chủ xưởng' LIMIT 1
      ) || '].cancel', json('true')
    ),
    revision = revision + 1,
    modified_by = 'migration:0043_alumdoor_purchase_funding',
    modified_at = CURRENT_TIMESTAMP
WHERE doctype='Payment Entry'
  AND tenant_id IN (SELECT tenant_id FROM installed_apps WHERE app_id='alumdoor')
  AND EXISTS (
    SELECT 1 FROM json_each(doctype_definitions.metadata_json, '$.permissions')
    WHERE json_extract(value, '$.role')='Chủ xưởng'
  );

-- Older Alumdoor metadata may have no Chủ xưởng Payment Entry row at all.
UPDATE doctype_definitions
SET metadata_json = json_insert(
      metadata_json,
      '$.permissions[#]', json_object(
        'role','Chủ xưởng','read',json('true'),'write',json('true'),'create',json('true'),
        'submit',json('true'),'cancel',json('true'),'print',json('true'),'report',json('true'),'export',json('true')
      )
    ),
    revision = revision + 1,
    modified_by = 'migration:0043_alumdoor_purchase_funding',
    modified_at = CURRENT_TIMESTAMP
WHERE doctype='Payment Entry'
  AND tenant_id IN (SELECT tenant_id FROM installed_apps WHERE app_id='alumdoor')
  AND NOT EXISTS (
    SELECT 1 FROM json_each(doctype_definitions.metadata_json, '$.permissions')
    WHERE json_extract(value, '$.role')='Chủ xưởng'
  );
