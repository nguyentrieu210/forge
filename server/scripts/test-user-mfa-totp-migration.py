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
connection.executescript((root / "migrations/tenant/0051_user_mfa_totp.sql").read_text())

envelope = '{"version":1,"algorithm":"AES-GCM","iv":"AA==","ciphertext":"AA=="}'
connection.execute(
    """INSERT INTO user_mfa_factors(
       tenant_id,user_id,factor_id,factor_type,status,secret_ciphertext,kek_id,created_at
       ) VALUES(?,?,?,?,?,?,?,?)""",
    (
        "tenant-a",
        "user@example.com",
        "mfa-1",
        "totp",
        "pending",
        envelope,
        "k1",
        "2026-08-03T00:00:00.000Z",
    ),
)
connection.commit()

try:
    connection.execute(
        """INSERT INTO user_mfa_factors(
           tenant_id,user_id,factor_id,factor_type,status,secret_ciphertext,kek_id,created_at
           ) VALUES('tenant-a','user@example.com','mfa-2','totp','pending',?,'k1','2026-08-03T00:01:00.000Z')""",
        (envelope,),
    )
    raise AssertionError("second current TOTP factor unexpectedly succeeded")
except sqlite3.IntegrityError as error:
    assert "UNIQUE" in str(error).upper(), error

try:
    connection.execute(
        "UPDATE user_mfa_factors SET status='enabled' WHERE tenant_id='tenant-a' AND factor_id='mfa-1'"
    )
    raise AssertionError("enable without immutable activation evidence unexpectedly succeeded")
except sqlite3.IntegrityError as error:
    assert "CHECK constraint failed" in str(error), error

connection.execute(
    """UPDATE user_mfa_factors
          SET status='enabled',confirmed_at='2026-08-03T00:02:00.000Z',activation_event_id='rbac-enable-1',last_used_step=10
        WHERE tenant_id='tenant-a' AND factor_id='mfa-1'"""
)
connection.execute(
    """INSERT INTO user_mfa_recovery_codes(
       tenant_id,user_id,factor_id,code_hash,created_at
       ) VALUES('tenant-a','user@example.com','mfa-1','hash-1','2026-08-03T00:02:00.000Z')"""
)
connection.commit()

try:
    connection.execute(
        "UPDATE user_mfa_factors SET status='pending' WHERE tenant_id='tenant-a' AND factor_id='mfa-1'"
    )
    raise AssertionError("enabled factor rewound to pending")
except sqlite3.DatabaseError as error:
    assert "MFA_STATUS_TRANSITION_INVALID" in str(error), error

connection.execute(
    """UPDATE user_mfa_recovery_codes
          SET used_at='2026-08-03T00:03:00.000Z',use_event_id='rbac-recovery-1'
        WHERE tenant_id='tenant-a' AND factor_id='mfa-1' AND code_hash='hash-1'"""
)
connection.commit()

for statement in [
    "UPDATE user_mfa_recovery_codes SET used_at=NULL WHERE tenant_id='tenant-a' AND factor_id='mfa-1' AND code_hash='hash-1'",
    "UPDATE user_mfa_recovery_codes SET use_event_id='other-event' WHERE tenant_id='tenant-a' AND factor_id='mfa-1' AND code_hash='hash-1'",
]:
    try:
        connection.execute(statement)
        raise AssertionError("recovery-code use mutation unexpectedly succeeded")
    except sqlite3.DatabaseError as error:
        assert "MFA_RECOVERY_USE_IMMUTABLE" in str(error), error

connection.execute(
    """UPDATE user_mfa_factors
          SET status='disabled',disabled_at='2026-08-03T00:04:00.000Z',disable_event_id='rbac-disable-1'
        WHERE tenant_id='tenant-a' AND factor_id='mfa-1'"""
)
connection.commit()

try:
    connection.execute(
        "UPDATE user_mfa_factors SET disabled_at='2026-08-03T00:05:00.000Z' WHERE tenant_id='tenant-a' AND factor_id='mfa-1'"
    )
    raise AssertionError("disabled MFA evidence unexpectedly rewrote")
except sqlite3.DatabaseError as error:
    assert "MFA_DISABLE_IMMUTABLE" in str(error), error

assert connection.execute(
    "SELECT status,activation_event_id,disable_event_id FROM user_mfa_factors WHERE factor_id='mfa-1'"
).fetchone() == ("disabled", "rbac-enable-1", "rbac-disable-1")

print("user MFA TOTP migration: PASS")
