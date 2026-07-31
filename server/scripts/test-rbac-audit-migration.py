#!/usr/bin/env python3
"""Executable invariants for migration 0030_rbac_audit.sql."""

from pathlib import Path
import sqlite3

ROOT = Path(__file__).resolve().parents[1]
MIGRATION = ROOT / "migrations" / "tenant" / "0030_rbac_audit.sql"


def main() -> None:
    db = sqlite3.connect(":memory:")
    db.executescript("""
      CREATE TABLE users(
        tenant_id TEXT NOT NULL,user_id TEXT NOT NULL,enabled INTEGER NOT NULL DEFAULT 1,
        PRIMARY KEY(tenant_id,user_id)
      );
      CREATE TABLE roles(
        tenant_id TEXT NOT NULL,role TEXT NOT NULL,disabled INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY(tenant_id,role)
      );
      CREATE TABLE user_roles(
        tenant_id TEXT NOT NULL,user_id TEXT NOT NULL,role TEXT NOT NULL,
        PRIMARY KEY(tenant_id,user_id,role)
      );
    """)
    sql = MIGRATION.read_text(encoding="utf-8")
    db.executescript(sql)
    db.executescript(sql)  # migrations must be idempotent for recovery/drills

    db.execute(
        """INSERT INTO rbac_audit_events(
             tenant_id,event_id,event_type,actor_user_id,target_user_id,
             before_json,after_json,reason,source,trace_id,created_at
           ) VALUES(?,?,?,?,?,?,?,?,?,?,?)""",
        (
            "tenant-a", "evt-1", "roles.replace", "admin@example.com", "user@example.com",
            '{"roles":["Stock User"]}', '{"roles":["Stock Manager"]}',
            "promotion", "metaforge.api.set_user_roles", "trace-1", "2026-07-31T00:00:00.000Z",
        ),
    )

    indexes = {row[1] for row in db.execute("PRAGMA index_list('rbac_audit_events')")}
    assert "rbac_audit_events_tenant_time" in indexes
    assert "rbac_audit_events_target_time" in indexes

    for statement in (
        "UPDATE rbac_audit_events SET reason='changed' WHERE tenant_id='tenant-a' AND event_id='evt-1'",
        "DELETE FROM rbac_audit_events WHERE tenant_id='tenant-a' AND event_id='evt-1'",
    ):
        try:
            db.execute(statement)
        except sqlite3.IntegrityError as error:
            assert "RBAC_AUDIT_APPEND_ONLY" in str(error)
        else:
            raise AssertionError("RBAC audit row was mutable")

    try:
        db.execute(
            """INSERT INTO rbac_audit_events(
                 tenant_id,event_id,event_type,actor_user_id,before_json,after_json,source,trace_id,created_at
               ) VALUES('tenant-a','evt-2','bad','admin','{','null','test','trace','now')"""
        )
    except sqlite3.IntegrityError:
        pass
    else:
        raise AssertionError("Invalid audit JSON was accepted")

    db.execute("INSERT INTO roles VALUES('tenant-a','System Manager',0)")
    db.execute("INSERT INTO users VALUES('tenant-a','admin@example.com',1)")
    db.execute("INSERT INTO user_roles VALUES('tenant-a','admin@example.com','System Manager')")
    for statement in (
        "UPDATE users SET enabled=0 WHERE tenant_id='tenant-a' AND user_id='admin@example.com'",
        "DELETE FROM user_roles WHERE tenant_id='tenant-a' AND user_id='admin@example.com' AND role='System Manager'",
    ):
        try:
            db.execute(statement)
        except sqlite3.IntegrityError as error:
            assert "RBAC_LAST_ADMIN_REQUIRED" in str(error)
        else:
            raise AssertionError("Database allowed removal of the final tenant administrator")

    db.execute("INSERT INTO users VALUES('tenant-a','admin-2@example.com',1)")
    db.execute("INSERT INTO user_roles VALUES('tenant-a','admin-2@example.com','System Manager')")
    db.execute("DELETE FROM user_roles WHERE tenant_id='tenant-a' AND user_id='admin@example.com' AND role='System Manager'")

    print("rbac audit migration invariants: PASS")


if __name__ == "__main__":
    main()
