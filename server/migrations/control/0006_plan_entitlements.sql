-- WS11 / T01-009..011: explicit, versioned SaaS plan entitlements.
--
-- No rows are seeded here. Forge has plan names but no repository-approved commercial
-- limits, so absence means legacy/unmanaged behavior until a reviewed rule is created.
CREATE TABLE IF NOT EXISTS control_plan_entitlements (
  plan TEXT NOT NULL CHECK(plan IN ('free','pro','enterprise')),
  entitlement_key TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('feature','quota')),
  enabled INTEGER,
  quota_limit INTEGER,
  quota_unit TEXT,
  version INTEGER NOT NULL DEFAULT 1 CHECK(version>=1),
  modified_at TEXT NOT NULL,
  modified_by TEXT NOT NULL,
  PRIMARY KEY(plan,entitlement_key),
  CHECK(
    (kind='feature' AND enabled IN (0,1) AND quota_limit IS NULL AND quota_unit IS NULL)
    OR
    (kind='quota' AND enabled IS NULL AND quota_limit IS NOT NULL AND quota_limit>=0
      AND quota_unit IS NOT NULL AND length(trim(quota_unit))>0)
  )
);

CREATE TABLE IF NOT EXISTS control_plan_entitlement_audit (
  event_id TEXT PRIMARY KEY,
  plan TEXT NOT NULL CHECK(plan IN ('free','pro','enterprise')),
  entitlement_key TEXT NOT NULL,
  action TEXT NOT NULL CHECK(action IN ('entitlement.create','entitlement.update','entitlement.remove')),
  actor_key TEXT NOT NULL,
  reason TEXT NOT NULL CHECK(length(trim(reason))>0),
  before_json TEXT,
  after_json TEXT,
  trace_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  CHECK(before_json IS NULL OR json_valid(before_json)),
  CHECK(after_json IS NULL OR json_valid(after_json))
);

CREATE INDEX IF NOT EXISTS idx_control_plan_entitlement_audit_lookup
  ON control_plan_entitlement_audit(plan,entitlement_key,created_at DESC,event_id DESC);

CREATE TRIGGER IF NOT EXISTS control_plan_entitlement_audit_no_update
BEFORE UPDATE ON control_plan_entitlement_audit
BEGIN
  SELECT RAISE(ABORT, 'PLAN_ENTITLEMENT_AUDIT_IMMUTABLE');
END;

CREATE TRIGGER IF NOT EXISTS control_plan_entitlement_audit_no_delete
BEFORE DELETE ON control_plan_entitlement_audit
BEGIN
  SELECT RAISE(ABORT, 'PLAN_ENTITLEMENT_AUDIT_IMMUTABLE');
END;
