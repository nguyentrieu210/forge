#!/usr/bin/env python3
"""Acceptance checks for WS15 workplace/DMS/contract migrations 0050-0052."""

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
db.execute(
    """CREATE TABLE users(
      tenant_id TEXT NOT NULL,user_id TEXT NOT NULL,enabled INTEGER NOT NULL DEFAULT 1,
      user_type TEXT NOT NULL DEFAULT 'System User',PRIMARY KEY(tenant_id,user_id)
    )"""
)
db.execute("INSERT INTO users VALUES('demo','user@example.test',1,'System User')")
db.execute("INSERT INTO users VALUES('demo','other@example.test',1,'System User')")
db.execute("INSERT INTO users VALUES('demo','disabled@example.test',0,'System User')")
db.execute("INSERT INTO users VALUES('demo','portal@example.test',1,'Website User')")
for migration in (
    "0050_ws15_workplace_domain_integrity.sql",
    "0051_ws15_workplace_update_integrity.sql",
    "0052_ws15_workplace_actor_integrity.sql",
):
    db.executescript((root / "migrations/tenant" / migration).read_text(encoding="utf-8"))


def insert_doc(doctype, name, payload, *, docstatus=0, tenant="demo", owner="user@example.test"):
    db.execute(
        "INSERT INTO documents VALUES(?,?,?,?,?,?,?,?,?,?,?)",
        (tenant, f"{doctype}:{name}", doctype, name, owner, docstatus, "Draft", 1,
         "2026-08-03T00:00:00Z", "2026-08-03T00:00:00Z", json.dumps(payload)),
    )


def assert_integrity_error(action, expected):
    try:
        action()
    except sqlite3.IntegrityError as exc:
        assert expected in str(exc), (expected, str(exc))
    else:
        raise AssertionError(f"expected IntegrityError containing {expected}")


# Workplace temporal and actor guards.
insert_doc("Workplace Meeting", "MEET-1", {
    "organizer": "user@example.test",
    "start_at": "2026-08-03 08:00:00",
    "end_at": "2026-08-03 09:00:00",
})
assert_integrity_error(
    lambda: insert_doc("Workplace Meeting", "MEET-2", {
        "organizer": "user@example.test",
        "start_at": "2026-08-03 10:00:00",
        "end_at": "2026-08-03 09:00:00",
    }),
    "WORKPLACE_MEETING_END_BEFORE_START",
)
assert_integrity_error(
    lambda: insert_doc("Workplace Meeting", "MEET-IMPERSONATE", {
        "organizer": "other@example.test",
        "start_at": "2026-08-03 08:00:00",
        "end_at": "2026-08-03 09:00:00",
    }),
    "WORKPLACE_MEETING_ORGANIZER_MUST_MATCH_OWNER",
)
assert_integrity_error(
    lambda: insert_doc("Workplace Meeting", "MEET-DISABLED", {
        "organizer": "disabled@example.test",
        "start_at": "2026-08-03 08:00:00",
        "end_at": "2026-08-03 09:00:00",
    }, owner="disabled@example.test"),
    "WORKPLACE_MEETING_OWNER_INVALID",
)
insert_doc("Workplace Task", "TASK-1", {"start_date": "2026-08-03", "due_date": "2026-08-05", "assigned_to": "other@example.test"})
insert_doc("Workplace Task", "TASK-UNASSIGNED", {"start_date": "2026-08-03", "due_date": "2026-08-05"})
assert_integrity_error(
    lambda: insert_doc("Workplace Task", "TASK-2", {"start_date": "2026-08-05", "due_date": "2026-08-03"}),
    "WORKPLACE_TASK_DUE_BEFORE_START",
)
assert_integrity_error(
    lambda: insert_doc("Workplace Task", "TASK-3", {"assigned_to": "disabled@example.test"}),
    "WORKPLACE_TASK_ASSIGNEE_INVALID",
)
assert_integrity_error(
    lambda: insert_doc("Workplace Task", "TASK-4", {"assigned_to": "portal@example.test"}),
    "WORKPLACE_TASK_ASSIGNEE_INVALID",
)
insert_doc("Workplace Announcement", "NEWS-1", {"publish_from": "2026-08-03 08:00:00", "publish_until": "2026-08-04 08:00:00"})
assert_integrity_error(
    lambda: insert_doc("Workplace Announcement", "NEWS-2", {"publish_from": "2026-08-04 08:00:00", "publish_until": "2026-08-03 08:00:00"}),
    "ANNOUNCEMENT_END_BEFORE_START",
)
insert_doc("Internal Request", "IREQ-1", {"requester": "user@example.test"})
assert_integrity_error(
    lambda: insert_doc("Internal Request", "IREQ-2", {"requester": "other@example.test"}),
    "INTERNAL_REQUEST_REQUESTER_MUST_MATCH_OWNER",
)
assert_integrity_error(
    lambda: insert_doc("Internal Request", "IREQ-3", {"requester": "disabled@example.test"}, owner="disabled@example.test"),
    "INTERNAL_REQUEST_OWNER_INVALID",
)

# DMS lifecycle dates and retention bounds.
insert_doc("Retention Policy", "RET-1", {"retention_days": 365, "archive_after_days": 90})
assert_integrity_error(
    lambda: insert_doc("Retention Policy", "RET-2", {"retention_days": 30, "archive_after_days": 60}),
    "ARCHIVE_AFTER_RETENTION",
)
insert_doc("Managed Document", "DOC-1", {"effective_date": "2026-01-01", "expiry_date": "2026-12-31"})
assert_integrity_error(
    lambda: insert_doc("Managed Document", "DOC-2", {"effective_date": "2026-12-31", "expiry_date": "2026-01-01"}),
    "DOCUMENT_EXPIRY_BEFORE_EFFECTIVE",
)

# Contract lifecycle and references.
insert_doc("Contract", "CTR-1", {
    "effective_date": "2026-01-01", "end_date": "2026-12-31", "contract_value": 1000000,
    "renewal_notice_days": 30,
}, docstatus=1)
assert_integrity_error(
    lambda: insert_doc("Contract", "CTR-NEG", {"effective_date": "2026-01-01", "end_date": "2026-12-31", "contract_value": -1}),
    "CONTRACT_VALUE_NEGATIVE",
)
assert_integrity_error(
    lambda: insert_doc("Contract", "CTR-DATE", {"effective_date": "2026-12-31", "end_date": "2026-01-01"}),
    "CONTRACT_END_BEFORE_EFFECTIVE",
)
insert_doc("Contract Obligation", "OBL-1", {"contract": "CTR-1", "due_date": "2026-08-30", "owner_user": "other@example.test"})
assert_integrity_error(
    lambda: insert_doc("Contract Obligation", "OBL-X", {"contract": "MISSING", "due_date": "2026-08-30", "owner_user": "other@example.test"}),
    "CONTRACT_OBLIGATION_CONTRACT_NOT_FOUND",
)
assert_integrity_error(
    lambda: insert_doc("Contract Obligation", "OBL-BAD-OWNER", {"contract": "CTR-1", "due_date": "2026-08-30", "owner_user": "disabled@example.test"}),
    "CONTRACT_OBLIGATION_OWNER_INVALID",
)
insert_doc("Contract Amendment", "AMD-1", {"contract": "CTR-1", "effective_date": "2026-09-01"})
assert_integrity_error(
    lambda: insert_doc("Contract Amendment", "AMD-X", {"contract": "MISSING", "effective_date": "2026-09-01"}),
    "CONTRACT_AMENDMENT_REQUIRES_ACTIVE_CONTRACT",
)

# Update paths cannot bypass the same reference/temporal/actor rules.
assert_integrity_error(
    lambda: db.execute(
        "UPDATE documents SET payload_json=? WHERE tenant_id='demo' AND doctype='Contract Obligation' AND name='OBL-1'",
        (json.dumps({"contract": "MISSING", "due_date": "2026-08-30", "owner_user": "other@example.test"}),),
    ),
    "CONTRACT_OBLIGATION_CONTRACT_NOT_FOUND",
)
assert_integrity_error(
    lambda: db.execute(
        "UPDATE documents SET payload_json=? WHERE tenant_id='demo' AND doctype='Workplace Meeting' AND name='MEET-1'",
        (json.dumps({"organizer": "user@example.test", "start_at": "2026-08-03 10:00:00", "end_at": "2026-08-03 09:00:00"}),),
    ),
    "WORKPLACE_MEETING_END_BEFORE_START",
)
assert_integrity_error(
    lambda: db.execute(
        "UPDATE documents SET payload_json=? WHERE tenant_id='demo' AND doctype='Workplace Meeting' AND name='MEET-1'",
        (json.dumps({"organizer": "other@example.test", "start_at": "2026-08-03 08:00:00", "end_at": "2026-08-03 09:00:00"}),),
    ),
    "WORKPLACE_MEETING_ORGANIZER_MUST_MATCH_OWNER",
)
assert_integrity_error(
    lambda: db.execute(
        "UPDATE documents SET payload_json=? WHERE tenant_id='demo' AND doctype='Internal Request' AND name='IREQ-1'",
        (json.dumps({"requester": "other@example.test"}),),
    ),
    "INTERNAL_REQUEST_REQUESTER_MUST_MATCH_OWNER",
)

# One deterministic preference row per active owner/event; nobody edits another user's preference.
insert_doc("Notification Preference", "PREF-1", {"user_id": "user@example.test", "event_type": "submitted"})
assert_integrity_error(
    lambda: insert_doc("Notification Preference", "PREF-2", {"user_id": "user@example.test", "event_type": "submitted"}),
    "UNIQUE constraint failed",
)
assert_integrity_error(
    lambda: insert_doc("Notification Preference", "PREF-3", {"user_id": "disabled@example.test", "event_type": "saved"}, owner="disabled@example.test"),
    "NOTIFICATION_PREFERENCE_USER_INVALID",
)
assert_integrity_error(
    lambda: insert_doc("Notification Preference", "PREF-4", {"user_id": "other@example.test", "event_type": "saved"}),
    "NOTIFICATION_PREFERENCE_USER_MUST_MATCH_OWNER",
)

print("WS15_WORKPLACE_DOMAIN_0050_0052_PASS")
