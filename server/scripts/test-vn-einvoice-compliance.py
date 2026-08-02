#!/usr/bin/env python3
"""SQLite regression for WS01 VN tax DSL + e-invoice compliance migrations 0050-0051."""

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
base_meta = {
    "name": "E-Invoice Submission",
    "module": "Accounts",
    "is_submittable": True,
    "fields": [
        {"fieldname": "source_doctype", "fieldtype": "Select"},
        {"fieldname": "source_name", "fieldtype": "Dynamic Link"},
        {"fieldname": "regional_profile", "fieldtype": "Link"},
        {"fieldname": "posting_at", "fieldtype": "Datetime"},
    ],
    "permissions": [{"role": "Accounts Manager", "read": True, "write": True, "create": True, "submit": True}],
}
db.execute(
    "INSERT INTO doctype_definitions VALUES(?,?,?,?,?,?,?,?,?,?,?)",
    ("demo", "E-Invoice Submission", "Accounts", 0, 1, 0, 1, json.dumps(base_meta), 0, "seed", "2026-08-01"),
)
for migration in (
    "0048_vn_accounting_statutory_foundation.sql",
    "0049_vn_accounting_statutory_registry_integrity.sql",
    "0050_vn_einvoice_compliance_evidence.sql",
    "0051_vn_tax_ruleset_dsl_integrity.sql",
):
    db.executescript((root / "migrations/tenant" / migration).read_text(encoding="utf-8"))


def insert(doctype, name, payload, docstatus=1, tenant="demo"):
    db.execute(
        "INSERT INTO documents VALUES(?,?,?,?,?,?,?,?,?,?,?)",
        (
            tenant, f"{doctype}:{name}", doctype, name, "qa@example.test", docstatus,
            "Submitted" if docstatus == 1 else "Draft", 1,
            "2026-08-03T00:00:00Z", "2026-08-03T00:00:00Z", json.dumps(payload),
        ),
    )


def update_payload(doctype, name, payload, tenant="demo"):
    db.execute(
        "UPDATE documents SET payload_json=?, version=version+1 WHERE tenant_id=? AND doc_key=?",
        (json.dumps(payload), tenant, f"{doctype}:{name}"),
    )


def expect_rejected(marker, fn):
    try:
        fn()
    except sqlite3.IntegrityError as error:
        assert marker in str(error), (marker, str(error))
        db.rollback()
    else:
        raise AssertionError(f"expected rejection: {marker}")


metadata = json.loads(db.execute(
    "SELECT metadata_json FROM doctype_definitions WHERE tenant_id='demo' AND doctype='E-Invoice Submission'"
).fetchone()[0])
field_names = {field["fieldname"] for field in metadata["fields"]}
for required in {
    "operation_type", "prior_submission", "legal_rule", "tax_ruleset", "payload_hash",
    "signature_reference", "tax_authority_reference", "response_evidence_json",
}:
    assert required in field_names, required
roles = {permission["role"] for permission in metadata["permissions"]}
assert {"Tax Specialist", "Chief Accountant", "Internal Auditor"}.issubset(roles)

sha = "b" * 64
legal = {
    "rule_code": "EINV-2026", "rule_version": "1", "rule_name": "E-Invoice 2026",
    "rule_type": "E-Invoice", "document_no": "EINV-2026", "regime_code": "Tax-specific",
    "taxpayer_segment": "Enterprise", "effective_from": "2026-01-01", "effective_to": "2026-12-31",
    "source_url": "https://official.example/einvoice", "source_file_hash": sha, "rule_json": "{}",
}
insert("VN Legal Rule", "EINV-2026", legal)
db.commit()

tax_ruleset = {
    "ruleset_code": "EINV-KAIRO-2026", "rule_name": "E-Invoice Kairo", "company": "Kairo",
    "rule_type": "E-Invoice", "taxpayer_segment": "Enterprise", "schema_version": 1,
    "effective_from": "2026-01-01", "effective_to": "2026-12-31",
    "expression_json": "{\"version\":1,\"outputs\":{\"valid_minor\":{\"op\":\"const\",\"value\":0}}}",
    "test_vectors_json": "[{\"inputs\":{},\"expected\":{\"valid_minor\":0}}]",
    "legal_rule": "EINV-2026", "source_hash": sha,
}
expect_rejected("VN_TAX_RULESET_SCHEMA_VERSION_UNSUPPORTED", lambda: insert(
    "VN Tax Ruleset", "EINV-BAD-SCHEMA", {**tax_ruleset, "ruleset_code": "EINV-BAD-SCHEMA", "schema_version": 2}
))
expect_rejected("VN_TAX_RULESET_EXPRESSION_VERSION_UNSUPPORTED", lambda: insert(
    "VN Tax Ruleset", "EINV-BAD-EXPR", {**tax_ruleset, "ruleset_code": "EINV-BAD-EXPR", "expression_json": "{\"version\":2,\"outputs\":{}}"}
))
insert("VN Tax Ruleset", "EINV-KAIRO-2026", tax_ruleset)
db.commit()

base_submission = {
    "source_doctype": "Sales Invoice", "source_name": "SI-001", "regional_profile": "VN",
    "posting_at": "2026-08-03T08:00:00Z", "company": "Kairo", "provider": "ProviderA",
    "submission_status": "Queued", "operation_type": "Original", "legal_rule": "EINV-2026",
    "tax_ruleset": "EINV-KAIRO-2026",
}
expect_rejected("VN_EINVOICE_LEGAL_RULE_REQUIRED", lambda: insert(
    "E-Invoice Submission", "EINV-NO-RULE", {**base_submission, "legal_rule": "MISSING"}
))
expect_rejected("VN_EINVOICE_RULESET_REQUIRED", lambda: insert(
    "E-Invoice Submission", "EINV-NO-RULESET", {**base_submission, "tax_ruleset": "MISSING"}
))
insert("E-Invoice Submission", "EINV-001", base_submission)
db.commit()

expect_rejected("VN_EINVOICE_ORIGINAL_HAS_PRIOR", lambda: insert(
    "E-Invoice Submission", "EINV-BAD-ORIGINAL", {**base_submission, "source_name": "SI-002", "prior_submission": "EINV-001"}
))
expect_rejected("VN_EINVOICE_PRIOR_SUBMISSION_REQUIRED", lambda: insert(
    "E-Invoice Submission", "EINV-NO-PRIOR", {**base_submission, "source_doctype": "Credit Note", "source_name": "CN-001", "operation_type": "Adjustment"}
))

adjustment = {
    **base_submission,
    "source_doctype": "Credit Note", "source_name": "CN-001", "operation_type": "Adjustment",
    "prior_submission": "EINV-001",
}
insert("E-Invoice Submission", "EINV-ADJ-001", adjustment)
db.commit()

expect_rejected("VN_EINVOICE_RESPONSE_EVIDENCE_REQUIRED", lambda: update_payload(
    "E-Invoice Submission", "EINV-001", {**base_submission, "submission_status": "Accepted"}
))
accepted = {
    **base_submission,
    "submission_status": "Accepted",
    "payload_hash": "c" * 64,
    "response_evidence_json": "{\"provider_status\":\"accepted\",\"received_at\":\"2026-08-03T08:01:00Z\"}",
    "external_reference": "EXT-001",
    "tax_authority_reference": "TAX-001",
}
update_payload("E-Invoice Submission", "EINV-001", accepted)
db.commit()

# A second tenant cannot reuse demo legal evidence.
expect_rejected("VN_EINVOICE_LEGAL_RULE_REQUIRED", lambda: insert(
    "E-Invoice Submission", "EINV-OTHER", {**base_submission, "source_name": "SI-OTHER"}, tenant="other"
))

assert db.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
print("VN_TAX_DSL_0051_AND_EINVOICE_0050_PASS")
