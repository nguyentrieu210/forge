-- AlumDoor HR & Payroll Lite V2 integrity.
-- The product exposes one simple overtime policy: exactly 50,000 VND/hour.
-- These database guards keep retries idempotent and reject alternate write paths
-- that attempt to persist another V2 rate.

CREATE UNIQUE INDEX IF NOT EXISTS idx_employee_alu_lite_idempotency
ON documents(tenant_id, json_extract(payload_json,'$.alu_lite_idempotency_key'))
WHERE doctype='Employee'
  AND COALESCE(json_extract(payload_json,'$.alu_lite_idempotency_key'),'')<>'';

CREATE UNIQUE INDEX IF NOT EXISTS idx_pay_profile_alu_lite_idempotency
ON documents(tenant_id, json_extract(payload_json,'$.alu_lite_idempotency_key'))
WHERE doctype='AlumDoor Pay Profile'
  AND COALESCE(json_extract(payload_json,'$.alu_lite_idempotency_key'),'')<>'';

CREATE INDEX IF NOT EXISTS idx_employee_alu_lite_mobile
ON documents(tenant_id, json_extract(payload_json,'$.mobile'))
WHERE doctype='Employee'
  AND json_extract(payload_json,'$.alu_lite_managed')=1
  AND docstatus<>2;

CREATE TRIGGER IF NOT EXISTS alumdoor_hr_payroll_lite_v2_rate_insert_guard
BEFORE INSERT ON documents
WHEN NEW.doctype IN ('Payroll Entry','Salary Slip')
  AND json_extract(NEW.payload_json,'$.alu_lite_version')=2
  AND COALESCE(json_extract(NEW.payload_json,'$.alu_overtime_rate_vnd_per_hour'),-1)<>50000
BEGIN
  SELECT RAISE(ABORT,'INVALID_LIFECYCLE_TRANSITION: ALUMDOOR_LITE_OVERTIME_RATE_MUST_BE_50000');
END;

CREATE TRIGGER IF NOT EXISTS alumdoor_hr_payroll_lite_v2_rate_update_guard
BEFORE UPDATE OF payload_json ON documents
WHEN NEW.doctype IN ('Payroll Entry','Salary Slip')
  AND json_extract(NEW.payload_json,'$.alu_lite_version')=2
  AND COALESCE(json_extract(NEW.payload_json,'$.alu_overtime_rate_vnd_per_hour'),-1)<>50000
BEGIN
  SELECT RAISE(ABORT,'INVALID_LIFECYCLE_TRANSITION: ALUMDOOR_LITE_OVERTIME_RATE_MUST_BE_50000');
END;
