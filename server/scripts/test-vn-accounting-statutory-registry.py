#!/usr/bin/env python3
"""SQLite regression for WS01 statutory registry migrations 0048-0049."""

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
    "0048_vn_accounting_statutory_foundation.sql",
    "0049_vn_accounting_statutory_registry_integrity.sql",
):
    db.executescript((root / "migrations/tenant" / migration).read_text(encoding="utf-8"))


def insert(doctype, name, payload, docstatus=1, tenant="demo"):
    db.execute(
        "INSERT INTO documents VALUES(?,?,?,?,?,?,?,?,?,?,?)",
        (
            tenant,
            f"{doctype}:{name}",
            doctype,
            name,
            "qa@example.test",
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


def expect_rejected(marker, fn):
    try:
        fn()
    except sqlite3.IntegrityError as error:
        assert marker in str(error), (marker, str(error))
        db.rollback()
    else:
        raise AssertionError(f"expected rejection: {marker}")


sha = "a" * 64
accounting_rule = {
    "rule_code": "TT99-2026",
    "rule_version": "2026.1",
    "rule_name": "TT99 accounting",
    "rule_type": "Accounting",
    "document_no": "99/2025/TT-BTC",
    "regime_code": "TT99",
    "taxpayer_segment": "Enterprise",
    "effective_from": "2026-01-01",
    "effective_to": "2026-12-31",
    "source_url": "https://official.example/tt99",
    "source_file_hash": sha,
    "rule_json": "{}",
}
insert("VN Legal Rule", "TT99-2026", accounting_rule)
db.commit()

vat_rule = {
    **accounting_rule,
    "rule_code": "VAT-2026",
    "rule_name": "VAT 2026",
    "rule_type": "VAT",
    "regime_code": "Tax-specific",
    "document_no": "VAT-2026",
}
insert("VN Legal Rule", "VAT-2026", vat_rule)
db.commit()

voucher = {
    "form_code": "PC",
    "label": "Phiếu chi",
    "company": "Kairo",
    "legal_rule": "TT99-2026",
    "document_type": "Payment Entry",
    "template_version": "1",
    "template_json": "{\"sections\":[]}",
    "required_fields_json": "[\"company\"]",
    "effective_from": "2026-01-01",
    "effective_to": "2026-12-31",
    "test_evidence_json": "{\"fixture\":\"PC-01\",\"passed\":true}",
}
insert("TT99 Voucher Form", "VOUCHER-1", voucher)
db.commit()

expect_rejected("TT99_REGISTRY_OVERLAP", lambda: insert(
    "TT99 Voucher Form", "VOUCHER-OVERLAP", {**voucher, "effective_from": "2026-06-01"}
))
expect_rejected("TT99_REGISTRY_IMMUTABLE", lambda: update_payload(
    "TT99 Voucher Form", "VOUCHER-1", {**voucher, "label": "Changed"}
))
expect_rejected("TT99_VOUCHER_SCHEMA_INVALID", lambda: insert(
    "TT99 Voucher Form", "VOUCHER-BAD-JSON", {**voucher, "form_code": "PT", "template_json": "{"}, docstatus=0
))
expect_rejected("TT99_REGISTRY_TEST_EVIDENCE_REQUIRED", lambda: insert(
    "TT99 Book Form", "BOOK-NO-EVIDENCE", {
        "book_code": "S01", "label": "Sổ", "company": "Kairo", "legal_rule": "TT99-2026",
        "source_ledger": "GL", "template_version": "1", "columns_json": "[]", "grouping_json": "{}",
        "filter_schema_json": "{}", "effective_from": "2026-01-01", "effective_to": "2026-12-31",
        "test_evidence_json": "{}",
    }
))
expect_rejected("TT99_REGISTRY_LEGAL_RULE_REQUIRED", lambda: insert(
    "TT99 Financial Statement Template", "FS-BAD-RULE", {
        "statement_code": "B01", "label": "BCTC", "company": "Kairo", "legal_rule": "VAT-2026",
        "statement_type": "Balance Sheet", "template_version": "1", "lines_json": "[]",
        "comparative_policy": "PriorYear", "currency_policy": "Company", "rounding_digits": 0,
        "effective_from": "2026-01-01", "effective_to": "2026-12-31",
        "test_evidence_json": "{\"passed\":true}",
    }
))

tax = {
    "ruleset_code": "VAT-KAIRO-2026",
    "rule_name": "VAT Kairo 2026",
    "company": "Kairo",
    "rule_type": "VAT",
    "taxpayer_segment": "Enterprise",
    "effective_from": "2026-01-01",
    "effective_to": "2026-12-31",
    "expression_json": "{\"version\":1}",
    "test_vectors_json": "[{\"input\":100,\"expected\":10}]",
    "legal_rule": "VAT-2026",
    "source_hash": sha,
}
insert("VN Tax Ruleset", "VAT-KAIRO-2026", tax)
db.commit()
expect_rejected("VN_TAX_RULESET_OVERLAP", lambda: insert(
    "VN Tax Ruleset", "VAT-KAIRO-OVERLAP", {**tax, "ruleset_code": "VAT-KAIRO-OVERLAP", "effective_from": "2026-04-01"}
))
expect_rejected("VN_TAX_RULESET_IMMUTABLE", lambda: update_payload(
    "VN Tax Ruleset", "VAT-KAIRO-2026", {**tax, "rule_name": "Changed"}
))
expect_rejected("VN_TAX_RULESET_EVIDENCE_REQUIRED", lambda: insert(
    "VN Tax Ruleset", "VAT-NO-VECTORS", {**tax, "ruleset_code": "VAT-NO-VECTORS", "company": "Other", "test_vectors_json": "[]"}
))
expect_rejected("VN_TAX_RULESET_LEGAL_RULE_REQUIRED", lambda: insert(
    "VN Tax Ruleset", "CIT-WRONG-RULE", {**tax, "ruleset_code": "CIT-WRONG-RULE", "company": "Other", "rule_type": "CIT"}
))

# Same definitions in another tenant are isolated, provided that tenant has its own legal evidence.
insert("VN Legal Rule", "TT99-2026", accounting_rule, tenant="other")
insert("TT99 Voucher Form", "VOUCHER-1", voucher, tenant="other")
db.commit()

print("VN_ACCOUNTING_STATUTORY_REGISTRY_0048_0049_PASS")
