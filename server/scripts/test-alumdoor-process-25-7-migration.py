#!/usr/bin/env python3
"""Verify retry/concurrency guards for process 25.7."""

import json
import sqlite3
from pathlib import Path

root = Path(__file__).resolve().parents[1]
db = sqlite3.connect(":memory:")
db.execute("CREATE TABLE documents(tenant_id TEXT, doctype TEXT, name TEXT, docstatus INTEGER, payload_json TEXT)")
db.executescript((root / "migrations/tenant/0034_alumdoor_process_25_7.sql").read_text(encoding="utf-8"))


def insert(doctype, name, status, payload):
    db.execute("INSERT INTO documents VALUES(?,?,?,?,?)", ("demo", doctype, name, status, json.dumps(payload)))


insert("Delivery Note", "PXK-1", 0, {"delivery_batch_key": "2026-08-01:DH-1"})
try:
    insert("Delivery Note", "PXK-2", 0, {"delivery_batch_key": "2026-08-01:DH-1"})
except sqlite3.IntegrityError:
    pass
else:
    raise AssertionError("duplicate daily delivery batch was accepted")

insert("Debit Note", "GBN-1", 0, {"warranty_claim": "BH-1"})
try:
    insert("Debit Note", "GBN-2", 1, {"warranty_claim": "BH-1"})
except sqlite3.IntegrityError:
    pass
else:
    raise AssertionError("duplicate warranty debit note was accepted")

# Cancelled documents release the key for a replacement/amendment.
insert("Delivery Note", "PXK-CANCELLED", 2, {"delivery_batch_key": "2026-08-02:DH-2"})
insert("Delivery Note", "PXK-REPLACEMENT", 0, {"delivery_batch_key": "2026-08-02:DH-2"})

print("ALUMDOOR_PROCESS_25_7_MIGRATION_0034_PASS")
