#!/usr/bin/env python3
"""Verify migration 0117 generic Item Price variant and adjustment-rule metadata."""

import json
import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MIGRATION = ROOT / "migrations/tenant/0117_pricing_variants_adjustment_rules.sql"


def metadata(name: str, revision: int = 4):
    return json.dumps(
        {
            "name": name,
            "module": "Selling",
            "revision": revision,
            "fields": [
                {"fieldname": "price_list", "label": "Price List", "fieldtype": "Data"},
                {"fieldname": "item_code", "label": "Item", "fieldtype": "Link", "options": "Item"},
                {"fieldname": "uom", "label": "UOM", "fieldtype": "Link", "options": "UOM"},
                {"fieldname": "rate", "label": "Rate", "fieldtype": "Currency"},
            ],
        },
        separators=(",", ":"),
        ensure_ascii=False,
    )


db = sqlite3.connect(":memory:")
db.executescript(
    """
    CREATE TABLE doctype_definitions (
      tenant_id TEXT NOT NULL,
      doctype TEXT NOT NULL,
      module TEXT NOT NULL,
      is_custom INTEGER NOT NULL,
      is_submittable INTEGER NOT NULL,
      is_child INTEGER NOT NULL,
      revision INTEGER NOT NULL,
      metadata_json TEXT NOT NULL CHECK(json_valid(metadata_json)),
      disabled INTEGER NOT NULL,
      modified_by TEXT NOT NULL,
      modified_at TEXT NOT NULL,
      PRIMARY KEY(tenant_id, doctype)
    );
    """
)

for tenant_id in ("demo", "__standard__", "tenant-a"):
    db.execute(
        "INSERT INTO doctype_definitions VALUES(?,?,?,?,?,?,?,?,?,?,?)",
        (
            tenant_id,
            "Item Price",
            "Selling",
            0,
            0,
            0,
            4,
            metadata("Item Price"),
            0,
            "seed",
            "2026-08-10T00:00:00.000Z",
        ),
    )

migration_sql = MIGRATION.read_text(encoding="utf-8")
assert "NO_RAIL" not in migration_sql
assert "WITH_RAIL" not in migration_sql
assert "AlumDoor" not in migration_sql

# Migration must be safe under deploy retry.
db.executescript(migration_sql)
db.executescript(migration_sql)

for tenant_id in ("demo", "__standard__", "tenant-a"):
    revision, raw = db.execute(
        "SELECT revision,metadata_json FROM doctype_definitions WHERE tenant_id=? AND doctype='Item Price'",
        (tenant_id,),
    ).fetchone()
    item_price = json.loads(raw)
    variants = [field for field in item_price["fields"] if field["fieldname"] == "price_variant"]
    assert revision == 5, (tenant_id, revision)
    assert item_price["revision"] == 5
    assert len(variants) == 1
    assert variants[0]["default"] == "STANDARD"
    assert variants[0]["fieldtype"] == "Data"

    rule_row = db.execute(
        "SELECT is_child,metadata_json FROM doctype_definitions WHERE tenant_id=? AND doctype='Sales Adjustment Rule'",
        (tenant_id,),
    ).fetchone()
    assert rule_row is not None
    assert rule_row[0] == 0
    rule = json.loads(rule_row[1])
    fields = {field["fieldname"]: field for field in rule["fields"]}
    assert fields["basis"]["options"].splitlines() == ["FIXED", "AREA_SQM", "LENGTH_M", "SET_COUNT"]
    assert fields["conditions"]["options"] == "Sales Adjustment Condition"
    sales_user = next(permission for permission in rule["permissions"] if permission["role"] == "Sales User")
    assert sales_user["read"] is True
    assert sales_user["write"] is False
    assert sales_user["create"] is False

    condition_row = db.execute(
        "SELECT is_child,metadata_json FROM doctype_definitions WHERE tenant_id=? AND doctype='Sales Adjustment Condition'",
        (tenant_id,),
    ).fetchone()
    assert condition_row is not None
    assert condition_row[0] == 1
    condition = json.loads(condition_row[1])
    condition_fields = {field["fieldname"]: field for field in condition["fields"]}
    assert condition_fields["operator"]["options"].splitlines() == [
        "eq", "neq", "in", "not_in", "lt", "lte", "gt", "gte"
    ]
    assert condition_fields["value"]["fieldtype"] == "JSON"
    assert condition_fields["values"]["fieldtype"] == "JSON"

print("PRICING_VARIANT_ADJUSTMENT_MIGRATION_PASS")
