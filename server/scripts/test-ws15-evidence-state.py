#!/usr/bin/env python3
"""Acceptance checks for WS15 evidence-backed OCR/signature states (0109)."""

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
      payload_json TEXT NOT NULL CHECK(json_valid(payload_json)),
      PRIMARY KEY(tenant_id,doc_key),
      UNIQUE(tenant_id,doctype,name)
    )"""
)
db.executescript((root / "migrations/tenant/0109_ws15_evidence_state_integrity.sql").read_text(encoding="utf-8"))


def insert_doc(doctype, name, payload):
    db.execute(
        "INSERT INTO documents VALUES(?,?,?,?,?,?,?,?,?,?,?)",
        (
            "demo", f"{doctype}:{name}", doctype, name, "manager@example.test", 0, "Draft", 1,
            "2026-08-03T00:00:00Z", "2026-08-03T00:00:00Z", json.dumps(payload),
        ),
    )


def assert_integrity_error(action, expected):
    try:
        action()
    except sqlite3.IntegrityError as exc:
        assert expected in str(exc), (expected, str(exc))
    else:
        raise AssertionError(f"expected IntegrityError containing {expected}")


# OCR Ready is an evidence claim, not a UI badge.
assert_integrity_error(
    lambda: insert_doc("Managed Document", "DOC-OCR-BAD", {"ocr_status": "Ready", "ocr_text": ""}),
    "MANAGED_DOCUMENT_OCR_READY_WITHOUT_TEXT",
)
insert_doc("Managed Document", "DOC-OCR-OK", {"ocr_status": "Ready", "ocr_text": "Nội dung đã trích xuất"})

# Managed-document Signed requires provider reference + signer + timestamp.
assert_integrity_error(
    lambda: insert_doc("Managed Document", "DOC-SIGN-NOREF", {
        "signature_status": "Signed", "signed_by": "Nguyen A", "signed_at": "2026-08-03 09:00:00",
    }),
    "MANAGED_DOCUMENT_SIGNED_WITHOUT_REFERENCE",
)
assert_integrity_error(
    lambda: insert_doc("Managed Document", "DOC-SIGN-NOSIGNER", {
        "signature_status": "Signed", "signature_reference": "sig-1", "signed_at": "2026-08-03 09:00:00",
    }),
    "MANAGED_DOCUMENT_SIGNED_WITHOUT_SIGNER",
)
assert_integrity_error(
    lambda: insert_doc("Managed Document", "DOC-SIGN-NOTIME", {
        "signature_status": "Signed", "signature_reference": "sig-1", "signed_by": "Nguyen A",
    }),
    "MANAGED_DOCUMENT_SIGNED_WITHOUT_TIMESTAMP",
)
insert_doc("Managed Document", "DOC-SIGN-OK", {
    "signature_status": "Signed",
    "signature_reference": "sig-1",
    "signed_by": "Nguyen A",
    "signed_at": "2026-08-03 09:00:00",
})

# Contract signing may be backed by a manually uploaded signed file OR provider reference.
assert_integrity_error(
    lambda: insert_doc("Contract", "CTR-SIGN-BAD", {"signature_status": "Signed"}),
    "CONTRACT_SIGNED_WITHOUT_EVIDENCE",
)
insert_doc("Contract", "CTR-SIGN-FILE", {"signature_status": "Signed", "signed_file": "/files/contract-signed.pdf"})
insert_doc("Contract", "CTR-SIGN-REF", {"signature_status": "Signed", "signature_reference": "provider-sign-1"})

# Update paths cannot manufacture evidence-free success states either.
insert_doc("Managed Document", "DOC-PENDING", {"ocr_status": "Pending", "signature_status": "Pending"})
assert_integrity_error(
    lambda: db.execute(
        "UPDATE documents SET payload_json=? WHERE tenant_id='demo' AND doctype='Managed Document' AND name='DOC-PENDING'",
        (json.dumps({"ocr_status": "Ready", "ocr_text": ""}),),
    ),
    "MANAGED_DOCUMENT_OCR_READY_WITHOUT_TEXT",
)
insert_doc("Contract", "CTR-PENDING", {"signature_status": "Pending"})
assert_integrity_error(
    lambda: db.execute(
        "UPDATE documents SET payload_json=? WHERE tenant_id='demo' AND doctype='Contract' AND name='CTR-PENDING'",
        (json.dumps({"signature_status": "Signed"}),),
    ),
    "CONTRACT_SIGNED_WITHOUT_EVIDENCE",
)

print("WS15_EVIDENCE_STATE_0109_PASS")
