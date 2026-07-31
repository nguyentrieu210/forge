#!/usr/bin/env python3
import json
import sqlite3
from pathlib import Path

root = Path(__file__).resolve().parents[1]
connection = sqlite3.connect(":memory:")
connection.execute("PRAGMA foreign_keys=ON")

for migration in [
    root / "migrations/tenant/0001_core.sql",
    root / "migrations/tenant/0004_frappe_platform.sql",
    root / "migrations/tenant/0005_erp_core.sql",
]:
    connection.executescript(migration.read_text(encoding="utf-8"))

# Simulate an already-provisioned real tenant before the append-only migration runs.
connection.execute(
    """INSERT INTO doctype_definitions(
       tenant_id,doctype,module,is_custom,is_submittable,is_child,revision,
       metadata_json,disabled,modified_by,modified_at)
       SELECT 'alu',doctype,module,is_custom,is_submittable,is_child,revision,
              metadata_json,disabled,modified_by,modified_at
       FROM doctype_definitions
       WHERE tenant_id='__standard__' AND doctype='Purchase Order'"""
)
connection.executescript(
    (root / "migrations/tenant/0031_purchase_allocation_control_metadata.sql").read_text(encoding="utf-8")
)

for tenant in ("demo", "__standard__", "alu"):
    rows = connection.execute(
        """SELECT doctype,is_submittable,metadata_json
           FROM doctype_definitions
           WHERE tenant_id=? AND doctype IN ('Purchase Settlement','Purchase Allocation Override')
           ORDER BY doctype""",
        (tenant,),
    ).fetchall()
    assert len(rows) == 2, (tenant, rows)
    for doctype, is_submittable, metadata_json in rows:
        assert is_submittable == 1, (tenant, doctype)
        metadata = json.loads(metadata_json)
        assert metadata["is_submittable"] is True
        fields = {field["fieldname"]: field for field in metadata["fields"]}
        assert fields["reason"]["required"] is True
        permissions = {permission["role"]: permission for permission in metadata["permissions"]}
        assert permissions["System Manager"]["create"] is True
        assert permissions["System Manager"]["submit"] is True
        if doctype == "Purchase Settlement":
            assert fields["queue_key"]["hidden"] is True
            assert fields["window_id"]["hidden"] is True
            assert "Kế toán" in permissions
        else:
            assert fields["source_allocation_entry_id"]["hidden"] is True
            assert fields["target_purchase_order"]["options"] == "Purchase Order"
            assert "Kế toán" not in permissions

for tenant in ("demo", "__standard__", "alu"):
    roles = {
        row[0]
        for row in connection.execute(
            "SELECT role FROM roles WHERE tenant_id=?",
            (tenant,),
        ).fetchall()
    }
    assert {"System Manager", "Purchase Manager", "Stock Manager", "Chủ xưởng", "Kế toán"}.issubset(roles), tenant

# Append-only reruns stay idempotent.
connection.executescript(
    (root / "migrations/tenant/0031_purchase_allocation_control_metadata.sql").read_text(encoding="utf-8")
)
assert connection.execute(
    "SELECT COUNT(*) FROM doctype_definitions WHERE tenant_id='alu' AND doctype IN ('Purchase Settlement','Purchase Allocation Override')"
).fetchone()[0] == 2

print("purchase allocation control metadata migration: ok")
