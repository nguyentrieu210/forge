#!/usr/bin/env python3
"""Migration 0010-0011 rehearsal: user store, role grants, amend chain, customisation.

Runs migrations 0001-0011 in order against a fresh database, then exercises the
guards that only exist in SQL. A guard that is only enforced in TypeScript is not
a guard: the aggregate Durable Object is not the sole writer over a database
lifetime (imports, migrations and future app workers also write), so these
invariants are asserted at the storage layer.
"""
import sqlite3
from pathlib import Path

root = Path(__file__).resolve().parents[1]
connection = sqlite3.connect(":memory:")
connection.execute("PRAGMA foreign_keys=ON")
for index in range(1, 12):
    migration = next(iter(sorted((root / "migrations/tenant").glob(f"{index:04d}_*.sql"))))
    connection.executescript(migration.read_text(encoding="utf-8"))

DOC_COLUMNS = "tenant_id,doc_key,doctype,name,owner,docstatus,status,version,created_at,modified_at,payload_json"
NOW = "2026-07-26T12:00:00.000Z"


def insert_document(name, docstatus, *, amended_from=None, doctype="Sales Order"):
    if amended_from is None:
        connection.execute(
            f"INSERT INTO documents({DOC_COLUMNS}) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
            ("demo", f"{doctype}:{name}", doctype, name, "Administrator", docstatus, "X", 1, NOW, NOW, "{}"),
        )
    else:
        connection.execute(
            f"INSERT INTO documents({DOC_COLUMNS},amended_from) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
            ("demo", f"{doctype}:{name}", doctype, name, "Administrator", docstatus, "X", 1, NOW, NOW, "{}", amended_from),
        )


def expect_abort(message, callable_):
    try:
        callable_()
    except sqlite3.IntegrityError as error:
        assert message in str(error), f"expected {message}, got {error}"
        connection.rollback()
        return
    raise AssertionError(f"expected {message} to abort")


# ---- new document columns ---------------------------------------------------
columns = {row[1] for row in connection.execute("PRAGMA table_info(documents)")}
assert "modified_by" in columns, "documents must record who wrote last"
assert "amended_from" in columns, "documents must record the amend chain"

insert_document("SO-1", 1)
connection.execute("UPDATE documents SET modified_by=? WHERE tenant_id=? AND name=?", ("editor@example.com", "demo", "SO-1"))
assert connection.execute("SELECT modified_by FROM documents WHERE name='SO-1'").fetchone()[0] == "editor@example.com"

# ---- role grants must reference a real, enabled role -----------------------
connection.execute("INSERT INTO users(tenant_id,user_id,created_at,modified_at) VALUES(?,?,?,?)", ("demo", "u1@example.com", NOW, NOW))
connection.execute("INSERT INTO roles(tenant_id,role,modified_at) VALUES(?,?,?)", ("demo", "Sales User", NOW))
connection.execute("INSERT INTO roles(tenant_id,role,disabled,modified_at) VALUES(?,?,?,?)", ("demo", "Retired Role", 1, NOW))
connection.commit()

connection.execute("INSERT INTO user_roles(tenant_id,user_id,role) VALUES(?,?,?)", ("demo", "u1@example.com", "Sales User"))
connection.commit()

# A typo must not create a grant that silently matches no DocPerm.
expect_abort("ROLE_NOT_FOUND", lambda: connection.execute(
    "INSERT INTO user_roles(tenant_id,user_id,role) VALUES(?,?,?)", ("demo", "u1@example.com", "Sales Usr")))
expect_abort("ROLE_DISABLED", lambda: connection.execute(
    "INSERT INTO user_roles(tenant_id,user_id,role) VALUES(?,?,?)", ("demo", "u1@example.com", "Retired Role")))

# Deleting the user withdraws every grant rather than leaving orphans behind.
connection.execute("DELETE FROM users WHERE tenant_id='demo' AND user_id='u1@example.com'")
assert connection.execute("SELECT COUNT(*) FROM user_roles WHERE tenant_id='demo'").fetchone()[0] == 0
connection.commit()

# ---- amend chain -----------------------------------------------------------
insert_document("SO-LIVE", 1)
insert_document("SO-DEAD", 2)
connection.commit()

# Amending a live document would duplicate an active voucher.
expect_abort("AMEND_SOURCE_NOT_CANCELLED", lambda: insert_document("SO-LIVE-1", 0, amended_from="SO-LIVE"))
# Amending something that never existed.
expect_abort("AMEND_SOURCE_NOT_CANCELLED", lambda: insert_document("SO-GHOST-1", 0, amended_from="SO-GHOST"))

insert_document("SO-DEAD-1", 0, amended_from="SO-DEAD")
connection.commit()

# A second amendment of the same source would fork the chain into two successors
# that each believe they are authoritative.
expect_abort("AMEND_SOURCE_ALREADY_AMENDED", lambda: insert_document("SO-DEAD-2", 0, amended_from="SO-DEAD"))

# The same source name under a different doctype is a different document.
insert_document("PO-DEAD", 2, doctype="Purchase Order")
insert_document("PO-DEAD-1", 0, amended_from="PO-DEAD", doctype="Purchase Order")
connection.commit()

# ---- search index follows its document -------------------------------------
connection.execute(
    "INSERT INTO document_search(tenant_id,doctype,name,title,content,modified_at) VALUES(?,?,?,?,?,?)",
    ("demo", "Sales Order", "SO-1", "SO-1", "acme corporation", NOW),
)
connection.commit()
connection.execute("DELETE FROM documents WHERE tenant_id='demo' AND doctype='Sales Order' AND name='SO-1'")
assert connection.execute("SELECT COUNT(*) FROM document_search WHERE name='SO-1'").fetchone()[0] == 0, \
    "a deleted document must not leave a searchable ghost"

# A search row for a document that does not exist must be impossible.
expect_abort("FOREIGN KEY", lambda: connection.execute(
    "INSERT INTO document_search(tenant_id,doctype,name,title,content,modified_at) VALUES(?,?,?,?,?,?)",
    ("demo", "Sales Order", "SO-NOPE", "", "", NOW)))

# ---- translations ----------------------------------------------------------
connection.execute(
    "INSERT INTO translations(tenant_id,language,source_text,translated_text,modified_at) VALUES(?,?,?,?,?)",
    ("demo", "vi", "Sales Order", "Đơn bán hàng", NOW),
)
connection.commit()
assert connection.execute(
    "SELECT translated_text FROM translations WHERE tenant_id='demo' AND language='vi' AND source_text='Sales Order'"
).fetchone()[0] == "Đơn bán hàng"

# ---- customisation overlay (0011) ------------------------------------------
connection.execute(
    "INSERT INTO custom_fields(tenant_id,name,dt,fieldname,metadata_json,insert_after,modified_by,modified_at)"
    " VALUES(?,?,?,?,?,?,?,?)",
    ("demo", "Sales Order-po_no", "Sales Order", "po_no",
     '{"fieldname":"po_no","fieldtype":"Data","label":"PO No"}', "customer", "Administrator", NOW),
)
connection.commit()

# Two custom fields claiming the same fieldname would make the effective schema
# depend on row order.
expect_abort("UNIQUE", lambda: connection.execute(
    "INSERT INTO custom_fields(tenant_id,name,dt,fieldname,metadata_json,modified_by,modified_at)"
    " VALUES(?,?,?,?,?,?,?)",
    ("demo", "Sales Order-po_no-copy", "Sales Order", "po_no", "{}", "Administrator", NOW)))

# Field metadata must be valid JSON, or the merge would fail on every read.
expect_abort("CHECK", lambda: connection.execute(
    "INSERT INTO custom_fields(tenant_id,name,dt,fieldname,metadata_json,modified_by,modified_at)"
    " VALUES(?,?,?,?,?,?,?)",
    ("demo", "Sales Order-bad", "Sales Order", "bad", "not json", "Administrator", NOW)))

connection.execute(
    "INSERT INTO property_setters(tenant_id,name,doc_type,doctype_or_field,field_name,property,property_type,value,modified_by,modified_at)"
    " VALUES(?,?,?,?,?,?,?,?,?,?)",
    ("demo", "Sales Order-customer-label", "Sales Order", "DocField", "customer", "label", "Data", "Khach hang", "Administrator", NOW),
)
connection.execute(
    "INSERT INTO property_setters(tenant_id,name,doc_type,doctype_or_field,field_name,property,property_type,value,modified_by,modified_at)"
    " VALUES(?,?,?,?,?,?,?,?,?,?)",
    ("demo", "Sales Order-main-title_field", "Sales Order", "DocType", "", "title_field", "Data", "customer", "Administrator", NOW),
)
connection.commit()

# A setter with the wrong shape would apply to nothing and look like a
# customisation that silently does not work.
expect_abort("PROPERTY_SETTER_FIELD_REQUIRED", lambda: connection.execute(
    "INSERT INTO property_setters(tenant_id,name,doc_type,doctype_or_field,field_name,property,property_type,value,modified_by,modified_at)"
    " VALUES(?,?,?,?,?,?,?,?,?,?)",
    ("demo", "bad-1", "Sales Order", "DocField", "", "label", "Data", "x", "Administrator", NOW)))
expect_abort("PROPERTY_SETTER_FIELD_NOT_ALLOWED", lambda: connection.execute(
    "INSERT INTO property_setters(tenant_id,name,doc_type,doctype_or_field,field_name,property,property_type,value,modified_by,modified_at)"
    " VALUES(?,?,?,?,?,?,?,?,?,?)",
    ("demo", "bad-2", "Sales Order", "DocType", "customer", "title_field", "Data", "x", "Administrator", NOW)))

# Two setters for the same target property: the winner would depend on scan order.
expect_abort("UNIQUE", lambda: connection.execute(
    "INSERT INTO property_setters(tenant_id,name,doc_type,doctype_or_field,field_name,property,property_type,value,modified_by,modified_at)"
    " VALUES(?,?,?,?,?,?,?,?,?,?)",
    ("demo", "other-name", "Sales Order", "DocField", "customer", "label", "Data", "Other", "Administrator", NOW)))

connection.execute(
    "INSERT INTO customization_revisions(tenant_id,doctype,revision,modified_at) VALUES(?,?,1,?)"
    " ON CONFLICT(tenant_id,doctype) DO UPDATE SET revision=revision+1",
    ("demo", "Sales Order", NOW),
)
connection.execute(
    "INSERT INTO customization_revisions(tenant_id,doctype,revision,modified_at) VALUES(?,?,1,?)"
    " ON CONFLICT(tenant_id,doctype) DO UPDATE SET revision=revision+1",
    ("demo", "Sales Order", NOW),
)
connection.commit()
assert connection.execute(
    "SELECT revision FROM customization_revisions WHERE tenant_id='demo' AND doctype='Sales Order'"
).fetchone()[0] == 2, "each customisation write must advance the effective-schema revision"

print("FRAPPE_COMPAT_MIGRATION_0010_0011_DRY_RUN_PASS")
