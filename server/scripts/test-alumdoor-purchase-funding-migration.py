#!/usr/bin/env python3
import json
import sqlite3
from pathlib import Path

root = Path(__file__).resolve().parents[1]
migration = root / "migrations/tenant/0043_alumdoor_purchase_funding.sql"

connection = sqlite3.connect(":memory:")
connection.execute("CREATE TABLE installed_apps (tenant_id TEXT NOT NULL, app_id TEXT NOT NULL)")
connection.execute(
    """CREATE TABLE doctype_definitions (
      tenant_id TEXT NOT NULL,
      doctype TEXT NOT NULL,
      revision INTEGER NOT NULL DEFAULT 1,
      metadata_json TEXT NOT NULL,
      modified_by TEXT,
      modified_at TEXT,
      PRIMARY KEY (tenant_id, doctype)
    )"""
)

material_request = {
    "name": "Material Request",
    "module": "Alumdoor",
    "fields": [
        {"fieldname": "material_request_type", "fieldtype": "Select", "options": "Purchase\nMaterial Transfer"},
        {"fieldname": "note", "fieldtype": "Small Text"},
    ],
    "permissions": [{"role": "Chủ xưởng", "read": True, "write": True, "create": True, "submit": True}],
}
payment_entry = {
    "name": "Payment Entry",
    "module": "Alumdoor",
    "fields": [
        {"fieldname": "party_type", "fieldtype": "Select", "options": "Customer\nSupplier"},
        {"fieldname": "reference_no", "fieldtype": "Data"},
    ],
    "permissions": [{"role": "Chủ xưởng", "read": True, "write": True, "create": True}],
}

for tenant in ("alu", "other"):
    connection.execute(
        "INSERT INTO doctype_definitions(tenant_id,doctype,metadata_json) VALUES(?,?,?)",
        (tenant, "Material Request", json.dumps(material_request, ensure_ascii=False)),
    )
    connection.execute(
        "INSERT INTO doctype_definitions(tenant_id,doctype,metadata_json) VALUES(?,?,?)",
        (tenant, "Payment Entry", json.dumps(payment_entry, ensure_ascii=False)),
    )
connection.execute("INSERT INTO installed_apps(tenant_id,app_id) VALUES('alu','alumdoor')")
connection.execute("INSERT INTO installed_apps(tenant_id,app_id) VALUES('other','another-app')")
connection.commit()

sql = migration.read_text(encoding="utf-8")
connection.executescript(sql)
connection.executescript(sql)  # restore/retry safety: must remain idempotent


def meta(tenant: str, doctype: str):
    row = connection.execute(
        "SELECT metadata_json FROM doctype_definitions WHERE tenant_id=? AND doctype=?",
        (tenant, doctype),
    ).fetchone()
    assert row, (tenant, doctype)
    return json.loads(row[0])


mr = meta("alu", "Material Request")
field_names = [field.get("fieldname") for field in mr["fields"]]
for expected in [
    "purchase_funding_employee",
    "purchase_funding_amount",
    "purchase_funding_method",
    "purchase_funding_bank_name",
    "purchase_funding_bank_last4",
]:
    assert field_names.count(expected) == 1, (expected, field_names)
assert "bank_account_no" not in field_names
funding_method = next(field for field in mr["fields"] if field.get("fieldname") == "purchase_funding_method")
assert funding_method["options"].splitlines() == ["Tiền mặt", "Tài khoản ngân hàng"]
employee_perms = [permission for permission in mr["permissions"] if permission.get("role") == "Employee"]
assert len(employee_perms) == 1
assert employee_perms[0].get("create") is True
assert not employee_perms[0].get("submit", False)

pe = meta("alu", "Payment Entry")
party_type = next(field for field in pe["fields"] if field.get("fieldname") == "party_type")
assert party_type["options"].splitlines() == ["Customer", "Supplier", "Employee"]
reference_no = next(field for field in pe["fields"] if field.get("fieldname") == "reference_no")
assert reference_no.get("in_standard_filter") is True
owner = next(permission for permission in pe["permissions"] if permission.get("role") == "Chủ xưởng")
assert owner.get("submit") is True
assert owner.get("cancel") is True

# A tenant without Alumdoor must not receive this vertical's metadata changes.
other_mr = meta("other", "Material Request")
assert all(not str(field.get("fieldname", "")).startswith("purchase_funding_") for field in other_mr["fields"])
other_pe = meta("other", "Payment Entry")
other_party = next(field for field in other_pe["fields"] if field.get("fieldname") == "party_type")
assert other_party["options"] == "Customer\nSupplier"

print("ALUMDOOR_PURCHASE_FUNDING_MIGRATION_OK")
