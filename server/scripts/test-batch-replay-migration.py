#!/usr/bin/env python3
from pathlib import Path
import sqlite3

ROOT = Path(__file__).resolve().parents[1]
MIGRATION = ROOT / "migrations" / "tenant" / "0110_batch_replay_claims.sql"


def main() -> None:
    sql = MIGRATION.read_text(encoding="utf-8")
    db = sqlite3.connect(":memory:")
    db.executescript(sql)
    db.executescript(sql)  # migration replay must be idempotent

    now = "2026-08-04T00:00:00.000Z"
    first = db.execute(
        """INSERT OR IGNORE INTO batch_replay_claims(
             tenant_id,idempotency_key,request_hash,status,result_json,created_at,updated_at
           ) VALUES(?,?,?,?,?,?,?)""",
        ("tenant-a", "idem-1", "hash-1", "in_flight", None, now, now),
    )
    assert first.rowcount == 1

    duplicate = db.execute(
        """INSERT OR IGNORE INTO batch_replay_claims(
             tenant_id,idempotency_key,request_hash,status,result_json,created_at,updated_at
           ) VALUES(?,?,?,?,?,?,?)""",
        ("tenant-a", "idem-1", "hash-other", "in_flight", None, now, now),
    )
    assert duplicate.rowcount == 0
    row = db.execute(
        "SELECT request_hash,status FROM batch_replay_claims WHERE tenant_id=? AND idempotency_key=?",
        ("tenant-a", "idem-1"),
    ).fetchone()
    assert row == ("hash-1", "in_flight")

    db.execute(
        """UPDATE batch_replay_claims
           SET status='completed',result_json=?,updated_at=?
           WHERE tenant_id=? AND idempotency_key=? AND request_hash=? AND status='in_flight'""",
        ('{"ok":true}', now, "tenant-a", "idem-1", "hash-1"),
    )
    completed = db.execute(
        "SELECT status,result_json FROM batch_replay_claims WHERE tenant_id=? AND idempotency_key=?",
        ("tenant-a", "idem-1"),
    ).fetchone()
    assert completed == ("completed", '{"ok":true}')

    try:
        db.execute(
            """INSERT INTO batch_replay_claims(
                 tenant_id,idempotency_key,request_hash,status,result_json,created_at,updated_at
               ) VALUES(?,?,?,?,?,?,?)""",
            ("tenant-a", "idem-invalid", "hash-x", "completed", None, now, now),
        )
    except sqlite3.IntegrityError:
        pass
    else:
        raise AssertionError("completed replay claim without result_json must fail")

    print("WS09 batch replay migration: PASS")


if __name__ == "__main__":
    main()
