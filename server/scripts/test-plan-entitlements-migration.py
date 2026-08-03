#!/usr/bin/env python3
import sqlite3
from pathlib import Path

root = Path(__file__).resolve().parents[1]
connection = sqlite3.connect(":memory:")
connection.executescript((root / "migrations/control/0006_plan_entitlements.sql").read_text())

connection.execute(
    """INSERT INTO control_plan_entitlements(
       plan,entitlement_key,kind,enabled,quota_limit,quota_unit,version,modified_at,modified_by
       ) VALUES('pro','apps.analytics','feature',1,NULL,NULL,1,'2026-08-03T00:00:00.000Z','operator')"""
)
connection.execute(
    """INSERT INTO control_plan_entitlements(
       plan,entitlement_key,kind,enabled,quota_limit,quota_unit,version,modified_at,modified_by
       ) VALUES('pro','users.active','quota',NULL,25,'users',1,'2026-08-03T00:00:00.000Z','operator')"""
)
connection.execute(
    """INSERT INTO control_plan_entitlement_audit(
       event_id,plan,entitlement_key,action,actor_key,reason,before_json,after_json,trace_id,created_at
       ) VALUES('evt-1','pro','users.active','entitlement.create','operator','approved plan rule',NULL,
                '{"limit":25}','trace-1','2026-08-03T00:00:00.000Z')"""
)
connection.commit()

for statement in [
    """INSERT INTO control_plan_entitlements(
       plan,entitlement_key,kind,enabled,quota_limit,quota_unit,version,modified_at,modified_by
       ) VALUES('free','broken.feature','feature',1,5,'users',1,'2026-08-03T00:00:00.000Z','operator')""",
    """INSERT INTO control_plan_entitlements(
       plan,entitlement_key,kind,enabled,quota_limit,quota_unit,version,modified_at,modified_by
       ) VALUES('free','broken.quota','quota',NULL,-1,'users',1,'2026-08-03T00:00:00.000Z','operator')""",
]:
    try:
        connection.execute(statement)
        raise AssertionError("invalid entitlement unexpectedly succeeded")
    except sqlite3.IntegrityError:
        pass

for statement in [
    "UPDATE control_plan_entitlement_audit SET reason='rewritten' WHERE event_id='evt-1'",
    "DELETE FROM control_plan_entitlement_audit WHERE event_id='evt-1'",
]:
    try:
        connection.execute(statement)
        raise AssertionError("immutable entitlement audit unexpectedly mutated")
    except sqlite3.DatabaseError as error:
        assert "PLAN_ENTITLEMENT_AUDIT_IMMUTABLE" in str(error), error

assert connection.execute(
    "SELECT kind,quota_limit,quota_unit FROM control_plan_entitlements WHERE plan='pro' AND entitlement_key='users.active'"
).fetchone() == ("quota", 25, "users")

print("plan entitlement governance migration: PASS")
