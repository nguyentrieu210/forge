#!/usr/bin/env python3
"""Acceptance checks for WS15 collaboration identity/lifecycle migration 0049."""

import sqlite3
from pathlib import Path

root = Path(__file__).resolve().parents[1]
migration = (root / "migrations/tenant/0049_ws15_collaboration_integrity.sql").read_text(encoding="utf-8")


def base_db():
    db = sqlite3.connect(":memory:")
    db.execute(
        """CREATE TABLE users(
          tenant_id TEXT NOT NULL,
          user_id TEXT NOT NULL,
          full_name TEXT NOT NULL DEFAULT '',
          email TEXT NOT NULL DEFAULT '',
          enabled INTEGER NOT NULL DEFAULT 1,
          user_type TEXT NOT NULL DEFAULT 'System User',
          password_hash TEXT NOT NULL DEFAULT '',
          session_epoch INTEGER NOT NULL DEFAULT 1,
          language TEXT NOT NULL DEFAULT '',
          time_zone TEXT NOT NULL DEFAULT '',
          last_login_at TEXT,
          created_at TEXT NOT NULL,
          modified_at TEXT NOT NULL,
          PRIMARY KEY(tenant_id,user_id)
        )"""
    )
    db.execute(
        """CREATE TABLE assignments(
          tenant_id TEXT NOT NULL,
          assignment_id TEXT NOT NULL,
          doctype TEXT NOT NULL,
          name TEXT NOT NULL,
          assigned_to TEXT NOT NULL,
          description TEXT,
          status TEXT NOT NULL,
          priority TEXT,
          due_date TEXT,
          owner TEXT NOT NULL,
          created_at TEXT NOT NULL,
          modified_at TEXT NOT NULL,
          PRIMARY KEY(tenant_id,assignment_id)
        )"""
    )
    db.execute(
        """CREATE TABLE document_shares(
          tenant_id TEXT NOT NULL,
          doctype TEXT NOT NULL,
          name TEXT NOT NULL,
          user TEXT NOT NULL,
          can_read INTEGER NOT NULL DEFAULT 1,
          can_write INTEGER NOT NULL DEFAULT 0,
          can_share INTEGER NOT NULL DEFAULT 0,
          submitted_by TEXT NOT NULL,
          created_at TEXT NOT NULL,
          PRIMARY KEY(tenant_id,doctype,name,user)
        )"""
    )
    return db


def add_user(db, user, *, enabled=1, user_type="System User", tenant="demo"):
    db.execute(
        """INSERT INTO users(
          tenant_id,user_id,enabled,user_type,created_at,modified_at
        ) VALUES(?,?,?,?,?,?)""",
        (tenant, user, enabled, user_type, "2026-08-03T00:00:00Z", "2026-08-03T00:00:00Z"),
    )


def add_assignment(db, assignment_id, user, *, status="Open", tenant="demo", name="PO-0001"):
    db.execute(
        """INSERT INTO assignments(
          tenant_id,assignment_id,doctype,name,assigned_to,status,owner,created_at,modified_at
        ) VALUES(?,?,?,?,?,?,?,?,?)""",
        (tenant, assignment_id, "Purchase Order", name, user, status, "manager@example.test",
         "2026-08-03T00:00:00Z", "2026-08-03T00:00:00Z"),
    )


def add_share(db, user, *, name="PO-0001"):
    db.execute(
        """INSERT INTO document_shares(
          tenant_id,doctype,name,user,submitted_by,created_at
        ) VALUES('demo','Purchase Order',?,?, 'manager@example.test','2026-08-03T00:00:00Z')""",
        (name, user),
    )


def assert_integrity_error(action, expected):
    try:
        action()
    except sqlite3.IntegrityError as exc:
        assert expected in str(exc), (expected, str(exc))
    else:
        raise AssertionError(f"expected IntegrityError containing {expected}")


# Existing duplicate Open rows must block rollout instead of being silently rewritten.
preexisting = base_db()
add_user(preexisting, "buyer@example.test")
add_assignment(preexisting, "A-1", "buyer@example.test")
add_assignment(preexisting, "A-2", "buyer@example.test")
assert_integrity_error(lambda: preexisting.executescript(migration), "DUPLICATE_OPEN_ASSIGNMENT")

# Existing ghost live state must also block rollout. The migration validates legacy rows
# through its no-op UPDATE preflight rather than grandfathering invalid assignments/shares.
preexisting_ghost = base_db()
add_user(preexisting_ghost, "buyer@example.test")
add_assignment(preexisting_ghost, "A-GHOST", "missing@example.test")
assert_integrity_error(lambda: preexisting_ghost.executescript(migration), "ASSIGNEE_NOT_FOUND")

preexisting_share = base_db()
add_user(preexisting_share, "buyer@example.test")
add_share(preexisting_share, "missing@example.test")
assert_integrity_error(lambda: preexisting_share.executescript(migration), "SHARE_USER_NOT_FOUND")

# Clean tenant: apply migration and exercise guards.
db = base_db()
add_user(db, "buyer@example.test")
add_user(db, "disabled@example.test", enabled=0)
add_user(db, "portal@example.test", user_type="Website User")
add_user(db, "other-tenant@example.test", tenant="other")
db.executescript(migration)

add_assignment(db, "A-1", "buyer@example.test")
assert_integrity_error(lambda: add_assignment(db, "A-2", "buyer@example.test"), "DUPLICATE_OPEN_ASSIGNMENT")
assert_integrity_error(lambda: add_assignment(db, "A-3", "missing@example.test"), "ASSIGNEE_NOT_FOUND")
assert_integrity_error(lambda: add_assignment(db, "A-4", "disabled@example.test"), "ASSIGNEE_NOT_ACTIVE_SYSTEM_USER")
assert_integrity_error(lambda: add_assignment(db, "A-5", "portal@example.test"), "ASSIGNEE_NOT_ACTIVE_SYSTEM_USER")
assert_integrity_error(lambda: add_assignment(db, "A-6", "other-tenant@example.test"), "ASSIGNEE_NOT_FOUND")

# History is preserved: a disabled system user may remain on non-open historical rows.
add_assignment(db, "A-HISTORY", "disabled@example.test", status="Cancelled")

# Cancelling the live assignment frees the same user to be assigned again later.
db.execute("UPDATE assignments SET status='Cancelled' WHERE tenant_id='demo' AND assignment_id='A-1'")
add_assignment(db, "A-7", "buyer@example.test")

# Re-opening historical work for a disabled user is forbidden.
assert_integrity_error(
    lambda: db.execute("UPDATE assignments SET status='Open' WHERE tenant_id='demo' AND assignment_id='A-HISTORY'"),
    "ASSIGNEE_NOT_ACTIVE_SYSTEM_USER",
)

# Shares are current access relationships, therefore targets must be active System Users.
add_share(db, "buyer@example.test")
assert_integrity_error(lambda: add_share(db, "disabled@example.test", name="PO-0002"), "SHARE_USER_NOT_ACTIVE_SYSTEM_USER")
assert_integrity_error(lambda: add_share(db, "missing@example.test", name="PO-0003"), "SHARE_USER_NOT_FOUND")
assert_integrity_error(lambda: add_share(db, "portal@example.test", name="PO-0004"), "SHARE_USER_NOT_ACTIVE_SYSTEM_USER")

print("WS15_COLLABORATION_INTEGRITY_0049_PASS")
