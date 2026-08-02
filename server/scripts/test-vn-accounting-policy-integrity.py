#!/usr/bin/env python3
"""SQLite regression for VN Accounting Policy 0056 + TT99 binding 0057."""

import json
import sqlite3
from pathlib import Path

root = Path(__file__).resolve().parents[1]
db = sqlite3.connect(":memory:")
db.execute(
    """CREATE TABLE master_records(
      tenant_id TEXT NOT NULL,
      record_type TEXT NOT NULL,
      name TEXT NOT NULL,
      disabled INTEGER NOT NULL DEFAULT 0,
      data_json TEXT NOT NULL,
      modified_at TEXT NOT NULL,
      PRIMARY KEY(tenant_id, record_type, name)
    )"""
)
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
    "0056_vn_accounting_policy_integrity.sql",
    "0057_tt99_account_company_policy_binding.sql",
):
    db.executescript((root / "migrations/tenant" / migration).read_text(encoding="utf-8"))


def master(kind, name, data, disabled=0, tenant="demo"):
    db.execute(
        "INSERT INTO master_records VALUES(?,?,?,?,?,?)",
        (tenant, kind, name, disabled, json.dumps(data), "2026-08-03T00:00:00Z"),
    )


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
        "UPDATE documents SET payload_json=?,version=version+1 WHERE tenant_id=? AND doc_key=?",
        (json.dumps(payload), tenant, f"{doctype}:{name}"),
    )


def update_submit(doctype, name, payload, tenant="demo"):
    db.execute(
        "UPDATE documents SET docstatus=1,status='Submitted',payload_json=?,version=version+1 WHERE tenant_id=? AND doc_key=?",
        (json.dumps(payload), tenant, f"{doctype}:{name}"),
    )


def expect(marker, fn):
    try:
        fn()
    except sqlite3.IntegrityError as error:
        assert marker in str(error), (marker, str(error))
        db.rollback()
    else:
        raise AssertionError(f"expected rejection: {marker}")


master("Company", "Kairo", {"default_currency": "VND"})
master("Company", "Other", {"default_currency": "USD"})
master("Currency", "VND", {"currency_scale": 0})
master("Currency", "USD", {"currency_scale": 2})
for account in ("156-KAIRO", "632-KAIRO", "811-KAIRO", "3318-KAIRO", "421-KAIRO", "111-LEGACY", "112-TT99"):
    master("Account", account, {"company": "Kairo", "is_group": 0})
master("Account", "112-OTHER", {"company": "Other", "is_group": 0})
master("Account", "GROUP-KAIRO", {"company": "Kairo", "is_group": 1})
db.commit()

sha = "a" * 64
legal = {
    "rule_code": "TT99-2026", "rule_version": "1", "rule_name": "TT99 2026",
    "rule_type": "Accounting", "document_no": "99/2025/TT-BTC", "regime_code": "TT99",
    "taxpayer_segment": "Enterprise", "effective_from": "2026-01-01", "effective_to": "",
    "source_url": "https://official.example/tt99", "source_file_hash": sha, "rule_json": "{}",
}
insert("VN Legal Rule", "TT99-2026", legal)
db.commit()

policy = {
    "company": "Kairo", "policy_version": "2026.1", "regime_code": "TT99", "legal_rule": "TT99-2026",
    "legal_document_no": "99/2025/TT-BTC", "fiscal_year_start": "2026-01-01",
    "effective_from": "2026-01-01", "effective_to": "", "accounting_currency": "VND",
    "legal_report_currency": "VND", "inventory_account": "156-KAIRO", "cogs_account": "632-KAIRO",
    "stock_adjustment_account": "811-KAIRO", "stock_received_not_billed_account": "3318-KAIRO",
    "retained_earnings_account": "421-KAIRO", "vat_method": "Khấu trừ",
    "branch_accounting_model": "Phụ thuộc", "internal_regulation_file": "/files/accounting-policy.pdf",
    "source_url": "https://official.example/tt99", "source_file_hash": sha,
    "workflow_state": "Đã phê duyệt",
}
insert("VN Accounting Policy", "POL-1", policy)
db.commit()

expect("VN_ACCOUNTING_POLICY_COMPANY_CURRENCY_MISMATCH", lambda: insert(
    "VN Accounting Policy", "POL-CURRENCY", {**policy, "policy_version": "bad-currency", "accounting_currency": "USD"}
))
expect("VN_ACCOUNTING_POLICY_ACCOUNT_COMPANY_MISMATCH", lambda: insert(
    "VN Accounting Policy", "POL-ACCOUNT", {**policy, "policy_version": "bad-account", "retained_earnings_account": "112-OTHER"}
))
expect("VN_ACCOUNTING_POLICY_ACCOUNTS_REQUIRED", lambda: insert(
    "VN Accounting Policy", "POL-DUP-ACCOUNT", {**policy, "policy_version": "dup-account", "cogs_account": "156-KAIRO"}
))
expect("VN_ACCOUNTING_POLICY_OVERLAP", lambda: insert(
    "VN Accounting Policy", "POL-OVERLAP", {**policy, "policy_version": "2026.2", "effective_from": "2026-07-01"}
))

# Submitted policy cannot be silently edited.
expect("VN_ACCOUNTING_POLICY_IMMUTABLE", lambda: update_payload(
    "VN Accounting Policy", "POL-1", {**policy, "cogs_account": "811-KAIRO"}
))

# Controlled retirement: set effective_to once while all other payload fields stay unchanged.
retired = {**policy, "effective_to": "2026-06-30"}
update_payload("VN Accounting Policy", "POL-1", retired)
db.commit()
expect("VN_ACCOUNTING_POLICY_IMMUTABLE", lambda: update_payload(
    "VN Accounting Policy", "POL-1", {**retired, "effective_to": "2026-06-29"}
))

# Workflow may then mark the finite version expired, without changing accounting fields.
expired = {**retired, "workflow_state": "Hết hiệu lực"}
update_payload("VN Accounting Policy", "POL-1", expired)
db.commit()

# A new non-overlapping version can now be approved.
policy2 = {**policy, "policy_version": "2026.2", "effective_from": "2026-07-01", "workflow_state": "Đã phê duyệt"}
insert("VN Accounting Policy", "POL-2", policy2)
db.commit()

# Duplicate version per company is rejected even outside overlap semantics.
expect("VN_ACCOUNTING_POLICY_VERSION_DUPLICATE", lambda: insert(
    "VN Accounting Policy", "POL-DUP-VERSION", {**policy2, "effective_from": "2027-01-01", "policy_version": "2026.2"}
))

# TT99 mapping must bind to same-company accounts and exact active policy/legal rule.
map_ok = {
    "company": "Kairo", "source_account": "111-LEGACY", "target_account": "112-TT99",
    "source_regime": "TT200-legacy", "target_regime": "TT99", "effective_from": "2026-07-01",
    "effective_to": "", "legal_rule": "TT99-2026", "mapping_reason": "Approved transition",
    "workflow_state": "Đã phê duyệt",
}
insert("TT99 Account Map", "MAP-OK", map_ok)
db.commit()

expect("TT99_ACCOUNT_MAP_SOURCE_TARGET_SAME", lambda: insert(
    "TT99 Account Map", "MAP-SAME", {**map_ok, "source_account": "112-TT99", "target_account": "112-TT99"}
))
expect("TT99_ACCOUNT_MAP_TARGET_COMPANY_MISMATCH", lambda: insert(
    "TT99 Account Map", "MAP-OTHER", {**map_ok, "target_account": "112-OTHER"}
))
expect("TT99_ACCOUNT_MAP_POLICY_REQUIRED", lambda: insert(
    "TT99 Account Map", "MAP-OLD-PERIOD", {**map_ok, "effective_from": "2026-01-01", "effective_to": "2026-12-31"}
))

# Draft -> submit path gets the same company/policy gate.
draft_map = {**map_ok, "target_account": "112-OTHER", "effective_from": "2026-08-01"}
insert("TT99 Account Map", "MAP-DRAFT", draft_map, docstatus=0)
db.commit()
expect("TT99_ACCOUNT_MAP_TARGET_COMPANY_MISMATCH", lambda: update_submit("TT99 Account Map", "MAP-DRAFT", draft_map))

assert db.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
print("VN_ACCOUNTING_POLICY_0056_0057_PASS")
