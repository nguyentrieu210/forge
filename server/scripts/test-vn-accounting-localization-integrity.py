#!/usr/bin/env python3
"""Regression checks for VN accounting localization migrations 0043-0044."""

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

for migration in (
    "0043_vn_accounting_localization_integrity.sql",
    "0044_vn_accounting_localization_json_update_guard.sql",
):
    db.executescript((root / "migrations/tenant" / migration).read_text(encoding="utf-8"))


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


def update_payload(doctype, name, payload, tenant="demo"):
    db.execute(
        "UPDATE documents SET payload_json=?, version=version+1 WHERE tenant_id=? AND doc_key=?",
        (json.dumps(payload), tenant, f"{doctype}:{name}"),
    )


def submit(doctype, name, tenant="demo"):
    db.execute(
        "UPDATE documents SET docstatus=1, status='Submitted', version=version+1 WHERE tenant_id=? AND doc_key=?",
        (tenant, f"{doctype}:{name}"),
    )


def expect_rejected(marker, fn):
    try:
        fn()
    except sqlite3.IntegrityError as error:
        assert marker in str(error), (marker, str(error))
        db.rollback()
    else:
        raise AssertionError(f"expected database rejection: {marker}")


# TT99 account mapping: one published mapping per source account/effective interval.
insert("TT99 Account Map", "MAP-111", 1, {
    "company": "ALUMDOOR",
    "source_account": "1110 - Cash",
    "statutory_account_code": "111",
    "statutory_account_name": "Tiền mặt",
    "target_account": "111 - Tiền mặt",
    "effective_from": "2026-01-01",
    "effective_to": "2026-12-31",
    "test_evidence_json": "{}",
})
db.commit()
expect_rejected("TT99_ACCOUNT_MAP_OVERLAP", lambda: insert("TT99 Account Map", "MAP-111-B", 1, {
    "company": "ALUMDOOR",
    "source_account": "1110 - Cash",
    "statutory_account_code": "111",
    "statutory_account_name": "Tiền mặt",
    "target_account": "111 - Tiền mặt",
    "effective_from": "2026-06-01",
    "effective_to": "2027-05-31",
    "test_evidence_json": "{}",
}))

expect_rejected("ACCOUNTING_LOCALIZATION_INVALID_RANGE", lambda: insert("TT99 Book Form", "SO-BAD", 0, {
    "book_code": "S03b-DN",
    "effective_from": "2026-12-31",
    "effective_to": "2026-01-01",
    "columns_json": "[]",
    "grouping_json": "{}",
    "filter_schema_json": "{}",
    "test_evidence_json": "{}",
}))

# JSON must stay valid even when a draft is edited after creation.
insert("Tax Ruleset", "VAT-DRAFT", 0, {
    "rule_type": "VAT",
    "scope_key": "default",
    "effective_from": "2026-01-01",
    "scope_json": "{}",
    "expression_json": "{}",
    "fixtures_json": "[]",
    "test_evidence_json": "{}",
})
db.commit()
expect_rejected("TAX_RULESET_INVALID_JSON", lambda: update_payload("Tax Ruleset", "VAT-DRAFT", {
    "rule_type": "VAT",
    "scope_key": "default",
    "effective_from": "2026-01-01",
    "scope_json": "{bad",
    "expression_json": "{}",
    "fixtures_json": "[]",
    "test_evidence_json": "{}",
}))

# Publishing a tax ruleset requires deterministic hash + green fixtures.
expect_rejected("TAX_RULESET_UNVERIFIED", lambda: submit("Tax Ruleset", "VAT-DRAFT"))
update_payload("Tax Ruleset", "VAT-DRAFT", {
    "rule_type": "VAT",
    "scope_key": "default",
    "effective_from": "2026-01-01",
    "effective_to": "2026-12-31",
    "scope_json": "{}",
    "expression_json": "{}",
    "fixtures_json": "[]",
    "test_evidence_json": "{\"pass\":true}",
    "test_passed": 1,
    "ruleset_hash": "sha256:vat-2026",
})
submit("Tax Ruleset", "VAT-DRAFT")
db.commit()

expect_rejected("TAX_RULESET_OVERLAP", lambda: insert("Tax Ruleset", "VAT-OVERLAP", 1, {
    "rule_type": "VAT",
    "scope_key": "default",
    "effective_from": "2026-06-01",
    "effective_to": "2027-05-31",
    "scope_json": "{}",
    "expression_json": "{}",
    "fixtures_json": "[]",
    "test_evidence_json": "{\"pass\":true}",
    "test_passed": 1,
    "ruleset_hash": "sha256:vat-overlap",
}))

# Transition cannot be applied with exceptions or without a deterministic map hash.
insert("TT99 Transition Map", "TR-DRAFT", 0, {
    "company": "ALUMDOOR",
    "fiscal_year_start": "2026-01-01",
    "preview_result_json": "{}",
    "balance_check_json": "{}",
    "exception_count": 1,
})
db.commit()
expect_rejected("TT99_TRANSITION_NOT_READY", lambda: submit("TT99 Transition Map", "TR-DRAFT"))

# E-invoice numbers are unique per company/provider/series while live.
insert("E-Invoice Document", "EI-1", 0, {
    "company": "ALUMDOOR",
    "provider": "demo-provider",
    "invoice_series": "1C26TAA",
    "invoice_number": "00000001",
})
db.commit()
expect_rejected("EINVOICE_DUPLICATE_NUMBER", lambda: insert("E-Invoice Document", "EI-2", 0, {
    "company": "ALUMDOOR",
    "provider": "demo-provider",
    "invoice_series": "1C26TAA",
    "invoice_number": "00000001",
}))
expect_rejected("EINVOICE_EVIDENCE_MISSING", lambda: submit("E-Invoice Document", "EI-1"))

print("VN_ACCOUNTING_LOCALIZATION_0043_0044_PASS")
