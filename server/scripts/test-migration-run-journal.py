#!/usr/bin/env python3
"""Targeted SQLite regression for tenant migration 0043 migration journal."""

import json
import sqlite3
from pathlib import Path

root = Path(__file__).resolve().parents[1]
db = sqlite3.connect(":memory:")
db.execute("PRAGMA foreign_keys = ON")

# 0043 only depends on the core mutation receipt table; replay the canonical core first.
db.executescript((root / "migrations/tenant/0001_core.sql").read_text(encoding="utf-8"))
db.executescript((root / "migrations/tenant/0043_migration_run_journal.sql").read_text(encoding="utf-8"))

NOW = "2026-08-03T12:00:00Z"
TENANT = "demo"
RUN = "migration-" + "a" * 40
HASH_A = "a" * 64
HASH_B = "b" * 64


def run_row():
    return (
        TENANT, RUN, RUN, "cutover-1", "erpnext-prod", "erpnext", HASH_A,
        "Customer", "update", "name", json.dumps({"name": "name"}), "applying",
        "Administrator", NOW, NOW, None,
    )


db.execute(
    """INSERT INTO migration_runs(
      tenant_id,run_id,plan_id,manifest_id,source_id,source_kind,source_fingerprint,target_doctype,
      duplicate_policy,key_field,mapping_json,state,started_by,created_at,modified_at,completed_at
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
    run_row(),
)

# Stable source identity + staged target identity before command execution.
db.execute(
    """INSERT INTO migration_row_receipts(
      tenant_id,run_id,row_key,source_row_number,row_fingerprint,target_doctype,target_name,
      intended_action,status,command_id,command_payload_hash,document_json,error_text,attempt_count,
      created_at,modified_at,staging_purged_at
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
    (
        TENANT, RUN, "CUST-1", 2, HASH_B, "Customer", "CUST-1", "update", "reserved",
        None, None, json.dumps({"customer_name": "ACME"}), None, 0, NOW, NOW, None,
    ),
)

# Applying without a command identity must fail at the database boundary.
try:
    db.execute(
        """INSERT INTO migration_row_receipts(
          tenant_id,run_id,row_key,source_row_number,row_fingerprint,target_doctype,target_name,
          intended_action,status,created_at,modified_at
        ) VALUES(?,?,?,?,?,?,?,?,?,?,?)""",
        (TENANT, RUN, "CUST-2", 3, "c" * 64, "Customer", "CUST-2", "update", "applying", NOW, NOW),
    )
except sqlite3.IntegrityError:
    db.rollback()
else:
    raise AssertionError("applying row without command_id should be rejected")

# Reserve -> applying stores the exact kernel command identity.
COMMAND = "frappe-" + "d" * 40
db.execute(
    """UPDATE migration_row_receipts
       SET status='applying', command_id=?, command_payload_hash=?, attempt_count=attempt_count+1
       WHERE tenant_id=? AND run_id=? AND row_key=?""",
    (COMMAND, "e" * 64, TENANT, RUN, "CUST-1"),
)
row = db.execute(
    "SELECT status,command_id,attempt_count FROM migration_row_receipts WHERE tenant_id=? AND run_id=? AND row_key=?",
    (TENANT, RUN, "CUST-1"),
).fetchone()
assert row == ("applying", COMMAND, 1), row

# Kernel receipt and migration journal intentionally coexist; recovery links them by command_id.
db.execute(
    """INSERT INTO mutation_receipts(
      tenant_id,command_id,actor_user_id,doctype,name,aggregate_version,payload_hash,committed_at,result_json
    ) VALUES(?,?,?,?,?,?,?,?,?)""",
    (TENANT, COMMAND, "Administrator", "Customer", "CUST-1", 1, "e" * 64, NOW, json.dumps({"name": "CUST-1"})),
)
receipt = db.execute(
    """SELECT m.target_doctype,m.target_name,r.doctype,r.name,r.payload_hash
       FROM migration_row_receipts m
       JOIN mutation_receipts r ON r.tenant_id=m.tenant_id AND r.command_id=m.command_id
       WHERE m.tenant_id=? AND m.run_id=? AND m.row_key=?""",
    (TENANT, RUN, "CUST-1"),
).fetchone()
assert receipt == ("Customer", "CUST-1", "Customer", "CUST-1", "e" * 64), receipt

# Incremental checkpoint stores exact source and adapter, not a lossy source-kind alias.
db.execute(
    """INSERT INTO migration_checkpoints(
      tenant_id,run_id,source_id,adapter,sequence,cursor,batch_fingerprint,high_watermark,created_at
    ) VALUES(?,?,?,?,?,?,?,?,?)""",
    (TENANT, RUN, "erpnext-prod", "erpnext-rest-v1", 1, "cursor-1", "f" * 64, NOW, NOW),
)
checkpoint = db.execute(
    "SELECT source_id,adapter,sequence FROM migration_checkpoints WHERE tenant_id=? AND run_id=?",
    (TENANT, RUN),
).fetchone()
assert checkpoint == ("erpnext-prod", "erpnext-rest-v1", 1), checkpoint

# One command cannot be claimed by two migration rows in the same tenant.
try:
    db.execute(
        """INSERT INTO migration_row_receipts(
          tenant_id,run_id,row_key,source_row_number,row_fingerprint,target_doctype,target_name,
          intended_action,status,command_id,command_payload_hash,document_json,attempt_count,created_at,modified_at
        ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        (
            TENANT, RUN, "CUST-3", 4, "1" * 64, "Customer", "CUST-3", "update", "applying",
            COMMAND, "2" * 64, json.dumps({"customer_name": "Other"}), 1, NOW, NOW,
        ),
    )
except sqlite3.IntegrityError:
    db.rollback()
else:
    raise AssertionError("duplicate command_id should be rejected")

# Tenant isolation allows another tenant to use the same logical run/row/command names.
OTHER = "other"
db.execute(
    """INSERT INTO migration_runs(
      tenant_id,run_id,plan_id,manifest_id,source_id,source_kind,source_fingerprint,target_doctype,
      duplicate_policy,key_field,mapping_json,state,started_by,created_at,modified_at,completed_at
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
    (
        OTHER, RUN, RUN, None, "erpnext-prod", "erpnext", HASH_A, "Customer", "update", "name",
        json.dumps({"name": "name"}), "draft", "Administrator", NOW, NOW, None,
    ),
)

db.commit()
print("migration run journal regression PASS")
