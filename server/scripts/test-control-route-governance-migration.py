#!/usr/bin/env python3
import sqlite3
from pathlib import Path

root = Path(__file__).resolve().parents[1]
connection = sqlite3.connect(":memory:")
connection.executescript((root / "migrations/control/0001_control_plane.sql").read_text())
connection.executescript((root / "migrations/control/0005_control_route_governance.sql").read_text())

connection.execute(
    "INSERT INTO tenant_routes(route_key,tenant_id,worker_name,status,plan,routing_version,modified_at) VALUES(?,?,?,?,?,?,?)",
    ("demo.example.com", "demo", "tenant-demo", "active", "pro", 1, "2026-08-03T00:00:00.000Z"),
)
connection.execute(
    """INSERT INTO control_route_audit_events(
       event_id,trace_id,actor_key,action,tenant_id,route_key,reason,before_json,after_json,created_at
       ) VALUES(?,?,?,?,?,?,?,?,?,?)""",
    (
        "audit-1",
        "trace-1",
        "control-token",
        "route.create",
        "demo",
        "demo.example.com",
        "tenant provisioning workflow",
        None,
        '{"tenant_id":"demo","status":"active"}',
        "2026-08-03T00:00:00.000Z",
    ),
)
connection.commit()

row = connection.execute(
    "SELECT action,reason,json_extract(after_json,'$.tenant_id') FROM control_route_audit_events WHERE event_id='audit-1'"
).fetchone()
assert row == ("route.create", "tenant provisioning workflow", "demo"), row

for statement in [
    "UPDATE control_route_audit_events SET reason='rewritten' WHERE event_id='audit-1'",
    "DELETE FROM control_route_audit_events WHERE event_id='audit-1'",
]:
    try:
        connection.execute(statement)
        raise AssertionError("immutable audit mutation unexpectedly succeeded")
    except sqlite3.DatabaseError as error:
        assert "CONTROL_AUDIT_IMMUTABLE" in str(error), error

try:
    connection.execute(
        """INSERT INTO control_route_audit_events(
           event_id,trace_id,actor_key,action,tenant_id,route_key,reason,before_json,after_json,created_at
           ) VALUES(?,?,?,?,?,?,?,?,?,?)""",
        (
            "audit-invalid",
            "trace-2",
            "control-token",
            "route.destroy",
            "demo",
            "demo.example.com",
            "invalid action",
            None,
            "{}",
            "2026-08-03T00:01:00.000Z",
        ),
    )
    raise AssertionError("invalid audit action unexpectedly succeeded")
except sqlite3.DatabaseError as error:
    assert "CHECK constraint failed" in str(error), error

assert connection.execute(
    "SELECT 1 FROM sqlite_master WHERE type='index' AND name='idx_control_route_audit_tenant_created'"
).fetchone()

print("control route governance migration: PASS")
