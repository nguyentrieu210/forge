#!/usr/bin/env python3
"""SQLite regression for VN VAT account mapping migration 0055."""

import json
import sqlite3
from pathlib import Path

root = Path(__file__).resolve().parents[1]
db = sqlite3.connect(":memory:")
db.execute(
    """CREATE TABLE documents(
      tenant_id TEXT NOT NULL,
      doc_key TEXT NOT NULL,
      doctype TEXT NOT NULL,
      name TEXT NOT NULL,
      owner TEXT NOT NULL,
      docstatus INTEGER NOT NULL,
      status TEXT NOT NULL,
      version INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      modified_at TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      PRIMARY KEY(tenant_id, doc_key),
      UNIQUE(tenant_id, doctype, name)
    )"""
)
db.execute(
    """CREATE TABLE doctype_definitions(
      tenant_id TEXT NOT NULL,
      doctype TEXT NOT NULL,
      module TEXT NOT NULL,
      is_custom INTEGER NOT NULL,
      is_submittable INTEGER NOT NULL,
      is_child INTEGER NOT NULL,
      revision INTEGER NOT NULL,
      metadata_json TEXT NOT NULL,
      disabled INTEGER NOT NULL,
      modified_by TEXT NOT NULL,
      modified_at TEXT NOT NULL,
      PRIMARY KEY(tenant_id, doctype)
    )"""
)
seed_meta = {
    "name": "VN Tax Ruleset",
    "module": "Accounts",
    "is_submittable": True,
    "fields": [
        {"fieldname": "ruleset_code", "fieldtype": "Data"},
        {"fieldname": "rule_type", "fieldtype": "Select"},
        {"fieldname": "workflow_state", "fieldtype": "Data"},
    ],
    "permissions": [],
}
db.execute(
    "INSERT INTO doctype_definitions VALUES(?,?,?,?,?,?,?,?,?,?,?)",
    ("demo", "VN Tax Ruleset", "Accounts", 0, 1, 0, 1, json.dumps(seed_meta), 0, "seed", "2026-08-03T00:00:00Z"),
)
migration = (root / "migrations/tenant/0055_vn_vat_dataset_mapping.sql").read_text(encoding="utf-8")
db.executescript(migration)
# Replay must not duplicate the field and trigger recreation must remain safe.
db.executescript(migration)

meta = json.loads(db.execute(
    "SELECT metadata_json FROM doctype_definitions WHERE tenant_id='demo' AND doctype='VN Tax Ruleset'"
).fetchone()[0])
assert sum(1 for field in meta["fields"] if field.get("fieldname") == "tax_accounts_json") == 1


def insert(name, mapping, rule_type="VAT", docstatus=1):
    payload = {
        "ruleset_code": name,
        "rule_type": rule_type,
        "tax_accounts_json": mapping,
    }
    db.execute(
        "INSERT INTO documents VALUES(?,?,?,?,?,?,?,?,?,?,?)",
        ("demo", f"VN Tax Ruleset:{name}", "VN Tax Ruleset", name, "qa", docstatus,
         "Submitted" if docstatus == 1 else "Draft", 1, "2026-08-03", "2026-08-03", json.dumps(payload)),
    )
    return payload


def update_submit(name, payload):
    db.execute(
        "UPDATE documents SET docstatus=1,status='Submitted',payload_json=?,version=version+1 WHERE tenant_id='demo' AND doc_key=?",
        (json.dumps(payload), f"VN Tax Ruleset:{name}"),
    )


def expect(marker, fn):
    try:
        fn()
    except sqlite3.IntegrityError as error:
        assert marker in str(error), (marker, str(error))
        db.rollback()
    else:
        raise AssertionError(f"expected rejection: {marker}")


expect("VN_VAT_ACCOUNT_MAPPING_INVALID", lambda: insert("VAT-BAD-JSON", "{"))
expect("VN_VAT_ACCOUNT_MAPPING_INVALID", lambda: insert("VAT-MISSING-ARRAY", json.dumps({"input_vat": []})))
expect("VN_VAT_ACCOUNT_MAPPING_EMPTY", lambda: insert("VAT-EMPTY", json.dumps({"input_vat": [], "output_vat": []})))
expect("VN_VAT_ACCOUNT_MAPPING_AMBIGUOUS", lambda: insert(
    "VAT-AMBIGUOUS", json.dumps({"input_vat": ["1331"], "output_vat": ["1331"]})
))

valid_mapping = json.dumps({"input_vat": ["1331-KAIRO"], "output_vat": ["33311-KAIRO"]})
insert("VAT-OK", valid_mapping)
db.commit()

# Non-VAT rulesets are not forced to carry VAT account mapping.
insert("CIT-OK", "{}", rule_type="CIT")
db.commit()

# Real form flow is draft -> submit UPDATE and must enforce the same gate.
draft = insert("VAT-DRAFT", "{}", docstatus=0)
db.commit()
draft["tax_accounts_json"] = json.dumps({"input_vat": [], "output_vat": []})
expect("VN_VAT_ACCOUNT_MAPPING_EMPTY", lambda: update_submit("VAT-DRAFT", draft))

draft["tax_accounts_json"] = valid_mapping
update_submit("VAT-DRAFT", draft)
db.commit()

assert db.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
print("VN_VAT_ACCOUNT_MAPPING_0055_PASS")
