"""Replay the complete tenant migration chain in synthetic local SQLite."""
import sqlite3
from pathlib import Path

root = Path(__file__).resolve().parents[1]
db = sqlite3.connect(":memory:")
db.execute("PRAGMA foreign_keys=ON")
migrations = sorted((root / "migrations/tenant").glob("*.sql"))
for migration in migrations:
    try:
        db.executescript(migration.read_text())
    except sqlite3.DatabaseError as error:
        raise RuntimeError(f"Migration replay failed: {migration.name}: {error}") from error
assert db.execute("PRAGMA foreign_key_check").fetchall() == []
assert db.execute("PRAGMA integrity_check").fetchone() == ("ok",)
print(f"R8 full tenant migration chain: PASS ({len(migrations)} migrations)")
