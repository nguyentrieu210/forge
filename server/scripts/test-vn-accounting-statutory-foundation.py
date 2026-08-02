#!/usr/bin/env python3
"""SQLite regression for WS01 VN statutory foundation migration 0043."""

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
db.executescript((root / "migrations/tenant/0043_vn_accounting_statutory_foundation.sql").read_text(encoding="utf-8"))


def insert(doctype, name, docstatus, payload, tenant="demo"):
    db.execute(
        "INSERT INTO documents VALUES(?,?,?,?,?,?,?,?,?,?,?)",
        (
            tenant,
            f"{doctype}:{name}",
            doctype,
            name,
            "qa",
            docstatus,
            "Submitted" if docstatus == 1 else "Draft",
            1,
            "2026-08-03T00:00:00Z",
            "2026-08-03T00:00:00Z",
            json.dumps(payload),
        ),
    )


def update(doctype, name, *, docstatus=None, payload=None, tenant="demo"):
    assignments = []
    values = []
    if docstatus is not None:
        assignments.extend(["docstatus=?", "status=?"])
        values.extend([docstatus, "Submitted" if docstatus == 1 else "Cancelled" if docstatus == 2 else "Draft"])
    if payload is not None:
        assignments.append("payload_json=?")
        values.append(json.dumps(payload))
    values.extend([tenant, f"{doctype}:{name}"])
    db.execute(
        f"UPDATE documents SET {', '.join(assignments)}, version=version+1 WHERE tenant_id=? AND doc_key=?",
        values,
    )


def delete(doctype, name, tenant="demo"):
    db.execute("DELETE FROM documents WHERE tenant_id=? AND doc_key=?", (tenant, f"{doctype}:{name}"))


def expect_rejected(marker, fn):
    try:
        fn()
    except sqlite3.IntegrityError as error:
        assert marker in str(error), (marker, str(error))
        db.rollback()
    else:
        raise AssertionError(f"expected database rejection: {marker}")


base_rule = {
    "rule_code": "TT99-2026-V1",
    "rule_version": "1",
    "rule_type": "Accounting",
    "document_no": "99/2025/TT-BTC",
    "regime_code": "TT99",
    "taxpayer_segment": "Enterprise",
    "effective_from": "2026-01-01",
    "effective_to": "",
    "source_url": "https://official.example/tt99",
    "source_file_hash": "sha256:tt99-v1",
    "rule_json": '{"regime":"TT99","version":1}',
}

# Invalid or unevidenced approved legal rules fail closed.
expect_rejected("VN_LEGAL_RULE_INVALID_RANGE", lambda: insert("VN Legal Rule", "RULE-BAD-RANGE", 1, {
    **base_rule, "rule_code": "BAD-RANGE", "effective_from": "2026-12-31", "effective_to": "2026-01-01"
}))
expect_rejected("VN_LEGAL_RULE_EVIDENCE_REQUIRED", lambda: insert("VN Legal Rule", "RULE-NO-HASH", 1, {
    **base_rule, "rule_code": "NO-HASH", "source_file_hash": ""
}))

insert("VN Legal Rule", "TT99-2026-V1", 1, base_rule)
db.commit()

# Same effective legal scope cannot overlap, but another tenant is independent.
expect_rejected("VN_LEGAL_RULE_OVERLAP", lambda: insert("VN Legal Rule", "TT99-2027-V1", 1, {
    **base_rule, "rule_code": "TT99-2027-V1", "effective_from": "2027-01-01"
}))
insert("VN Legal Rule", "TT99-2026-V1", 1, base_rule, tenant="other")
db.commit()

# Approved legal evidence is immutable and cannot be cancelled/deleted in place.
expect_rejected("VN_LEGAL_RULE_IMMUTABLE", lambda: update("VN Legal Rule", "TT99-2026-V1", payload={
    **base_rule, "rule_json": '{"regime":"TT99","version":2}'
}))
expect_rejected("VN_LEGAL_RULE_IMMUTABLE", lambda: update("VN Legal Rule", "TT99-2026-V1", docstatus=2))
expect_rejected("VN_LEGAL_RULE_IMMUTABLE", lambda: delete("VN Legal Rule", "TT99-2026-V1"))

base_map = {
    "company": "ACME",
    "source_account": "642-OLD",
    "target_account": "642",
    "source_regime": "TT200-legacy",
    "target_regime": "TT99",
    "effective_from": "2026-01-01",
    "effective_to": "",
    "legal_rule": "TT99-2026-V1",
    "mapping_reason": "Chuyển hệ thống tài khoản khi áp dụng TT99",
}

expect_rejected("TT99_ACCOUNT_MAP_TARGET_REQUIRED", lambda: insert("TT99 Account Map", "MAP-WRONG-TARGET", 1, {
    **base_map, "target_regime": "TT133"
}))
expect_rejected("TT99_ACCOUNT_MAP_LEGAL_RULE_REQUIRED", lambda: insert("TT99 Account Map", "MAP-NO-RULE", 1, {
    **base_map, "legal_rule": "MISSING"
}))

insert("TT99 Account Map", "MAP-642", 1, base_map)
db.commit()

# One source account has one approved mapping per company/effective interval.
expect_rejected("TT99_ACCOUNT_MAP_OVERLAP", lambda: insert("TT99 Account Map", "MAP-642-OVERLAP", 1, {
    **base_map, "effective_from": "2026-06-01"
}))
insert("TT99 Account Map", "MAP-641", 1, {**base_map, "source_account": "641-OLD"})
insert("TT99 Account Map", "MAP-642-OTHER-COMPANY", 1, {**base_map, "company": "OTHER"})
db.commit()

# Approved mappings are immutable evidence; revisions must be new versioned documents.
expect_rejected("TT99_ACCOUNT_MAP_IMMUTABLE", lambda: update("TT99 Account Map", "MAP-642", payload={
    **base_map, "target_account": "6421"
}))
expect_rejected("TT99_ACCOUNT_MAP_IMMUTABLE", lambda: delete("TT99 Account Map", "MAP-642"))

assert db.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
print("VN_ACCOUNTING_STATUTORY_FOUNDATION_0043_PASS")
