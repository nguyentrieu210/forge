#!/usr/bin/env python3
import sqlite3
from pathlib import Path

root = Path(__file__).resolve().parents[1]
connection = sqlite3.connect(":memory:")
connection.execute("PRAGMA foreign_keys=ON")
connection.executescript(
    """
    CREATE TABLE users (
      tenant_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      PRIMARY KEY (tenant_id,user_id)
    );
    INSERT INTO users(tenant_id,user_id) VALUES('tenant-a','user@example.com');
    """
)
connection.executescript((root / "migrations/tenant/0050_user_session_registry.sql").read_text())

connection.execute(
    """INSERT INTO user_sessions(
       tenant_id,session_id,user_id,issued_at,expires_at,last_seen_at
       ) VALUES(?,?,?,?,?,?)""",
    (
        "tenant-a",
        "abcdefghijklmnopqrstuvwx",
        "user@example.com",
        "2026-08-03T00:00:00.000Z",
        "2026-08-03T12:00:00.000Z",
        "2026-08-03T00:00:00.000Z",
    ),
)
connection.commit()

row = connection.execute(
    "SELECT user_id,revoked_at FROM user_sessions WHERE tenant_id='tenant-a' AND session_id='abcdefghijklmnopqrstuvwx'"
).fetchone()
assert row == ("user@example.com", None), row

try:
    connection.execute(
        "UPDATE user_sessions SET user_id='other@example.com' WHERE tenant_id='tenant-a' AND session_id='abcdefghijklmnopqrstuvwx'"
    )
    raise AssertionError("session identity mutation unexpectedly succeeded")
except sqlite3.DatabaseError as error:
    assert "SESSION_IDENTITY_IMMUTABLE" in str(error), error

try:
    connection.execute(
        """UPDATE user_sessions
              SET revoked_at='2026-08-03T01:00:00.000Z',revoked_by='user@example.com',revoke_reason='logout'
            WHERE tenant_id='tenant-a' AND session_id='abcdefghijklmnopqrstuvwx'"""
    )
    raise AssertionError("revocation without event id unexpectedly succeeded")
except sqlite3.IntegrityError as error:
    assert "CHECK constraint failed" in str(error), error

connection.execute(
    """UPDATE user_sessions
          SET revoked_at='2026-08-03T01:00:00.000Z',revoked_by='user@example.com',
              revoke_reason='logout',revocation_event_id='session-event-1'
        WHERE tenant_id='tenant-a' AND session_id='abcdefghijklmnopqrstuvwx'"""
)
connection.commit()

for statement in [
    "UPDATE user_sessions SET revoked_at=NULL WHERE tenant_id='tenant-a' AND session_id='abcdefghijklmnopqrstuvwx'",
    "UPDATE user_sessions SET revoke_reason='rewritten' WHERE tenant_id='tenant-a' AND session_id='abcdefghijklmnopqrstuvwx'",
    "UPDATE user_sessions SET revocation_event_id='session-event-2' WHERE tenant_id='tenant-a' AND session_id='abcdefghijklmnopqrstuvwx'",
]:
    try:
        connection.execute(statement)
        raise AssertionError("immutable revocation mutation unexpectedly succeeded")
    except sqlite3.DatabaseError as error:
        assert "SESSION_REVOCATION_IMMUTABLE" in str(error), error

try:
    connection.execute(
        """INSERT INTO user_sessions(
           tenant_id,session_id,user_id,issued_at,expires_at,last_seen_at
           ) VALUES('tenant-a','zyxwvutsrqponmlkjihgfedc','missing@example.com',
                    '2026-08-03T00:00:00.000Z','2026-08-03T12:00:00.000Z','2026-08-03T00:00:00.000Z')"""
    )
    raise AssertionError("orphan session unexpectedly succeeded")
except sqlite3.IntegrityError as error:
    assert "FOREIGN KEY" in str(error).upper(), error

assert connection.execute(
    "SELECT 1 FROM sqlite_master WHERE type='index' AND name='idx_user_sessions_user_active'"
).fetchone()

print("user session registry migration: PASS")
