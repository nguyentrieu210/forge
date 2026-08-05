#!/usr/bin/env python3
from pathlib import Path
import sqlite3

ROOT = Path(__file__).resolve().parents[1]
MIGRATIONS = ROOT / "migrations" / "control"

conn = sqlite3.connect(":memory:")
for name in ["0001_control_plane.sql", "0003_security_generation_v2.sql"]:
    conn.executescript((MIGRATIONS / name).read_text(encoding="utf-8"))

columns = {
    row[1] for row in conn.execute("PRAGMA table_info(tenant_security_profiles)").fetchall()
}
assert columns == {
    "tenant_id", "generation", "key_id", "worker_name", "source_sha", "created_at", "modified_at"
}, columns

provider_columns = {
    row[1] for row in conn.execute("PRAGMA table_info(provider_authority)").fetchall()
}
assert provider_columns == {"authority_key", "account_id", "modified_at"}, provider_columns

conn.execute(
    "INSERT INTO tenant_security_profiles VALUES(?,?,?,?,?,?,?)",
    ("thuy", 2, "k2", "cloudforge-tenant-thuy", "a" * 40, "2026-08-05T00:00:00Z", "2026-08-05T00:00:00Z"),
)
try:
    conn.execute(
        "INSERT INTO tenant_security_profiles VALUES(?,?,?,?,?,?,?)",
        ("bad", 3, "k3", "cloudforge-tenant-bad", "b" * 40, "2026-08-05T00:00:00Z", "2026-08-05T00:00:00Z"),
    )
    raise AssertionError("generation CHECK accepted generation=3")
except sqlite3.IntegrityError:
    pass

conn.execute(
    "INSERT INTO provider_authority VALUES(?,?,?)",
    ("cloudflare-account", "0" * 32, "2026-08-05T00:00:00Z"),
)
assert conn.execute("SELECT COUNT(*) FROM tenant_security_profiles").fetchone()[0] == 1
assert conn.execute("SELECT COUNT(*) FROM provider_authority").fetchone()[0] == 1
print("SECURITY_V2_MIGRATION_PASS")
