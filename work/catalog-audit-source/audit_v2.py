from __future__ import annotations

import json
import sqlite3
from collections import Counter
from pathlib import Path


ROOT = Path(r"C:\alumdoor")
DB = ROOT / r"server\apps\tenant-worker\.wrangler\state\v3\d1\miniflare-D1DatabaseObject\0f70e06fc007ec84591c21ca1daaf09474ca2074a0d42ba21eb2a3fcdbb2cdf8.sqlite"


def main() -> None:
    con = sqlite3.connect(f"file:{DB.as_posix()}?mode=ro", uri=True)
    con.row_factory = sqlite3.Row
    objects = con.execute(
        "SELECT name, type, sql FROM sqlite_master WHERE type IN ('table','view') ORDER BY type,name"
    ).fetchall()
    result = []
    for obj in objects:
        name = obj["name"]
        entry = {"name": name, "type": obj["type"], "sql": obj["sql"]}
        if obj["type"] == "table" and not name.startswith("sqlite_"):
            try:
                entry["count"] = con.execute(f'SELECT COUNT(*) FROM "{name}"').fetchone()[0]
                entry["columns"] = [dict(row) for row in con.execute(f'PRAGMA table_info("{name}")')]
            except sqlite3.Error as exc:
                entry["error"] = str(exc)
        result.append(entry)
    doctype_counts = [dict(row) for row in con.execute(
        "SELECT tenant_id, doctype, COUNT(*) AS count FROM documents GROUP BY tenant_id, doctype ORDER BY tenant_id, doctype"
    )]
    master_counts = [dict(row) for row in con.execute(
        "SELECT tenant_id, record_type, COUNT(*) AS count FROM master_records GROUP BY tenant_id, record_type ORDER BY tenant_id, record_type"
    )]
    child_counts = [dict(row) for row in con.execute(
        "SELECT tenant_id, child_doctype, fieldname, COUNT(*) AS count FROM document_children GROUP BY tenant_id, child_doctype, fieldname ORDER BY tenant_id, child_doctype, fieldname"
    )]
    relevant_tokens = (
        "item", "uom", "color", "colour", "surface", "finish", "price", "bom", "bill of material",
        "supplier", "customer", "warehouse", "batch", "serial", "stock", "alumdoor", "geometry", "conversion",
    )
    relevant_doctypes = sorted({
        row["doctype"] for row in doctype_counts
        if any(token in row["doctype"].casefold() for token in relevant_tokens)
    })
    relevant_docs = {}
    for doctype in relevant_doctypes:
        rows = con.execute(
            "SELECT tenant_id,name,docstatus,status,payload_json,modified_at FROM documents WHERE doctype=? ORDER BY name",
            (doctype,),
        ).fetchall()
        converted = []
        for row in rows:
            payload = json.loads(row["payload_json"])
            converted.append({
                "tenant_id": row["tenant_id"],
                "name": row["name"],
                "docstatus": row["docstatus"],
                "status": row["status"],
                "modified_at": row["modified_at"],
                "payload": payload,
            })
        relevant_docs[doctype] = converted

    output = ROOT / r"work\catalog-audit-source\d1_schema.json"
    output.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    summary_output = ROOT / r"work\catalog-audit-source\d1_relevant.json"
    summary_output.write_text(json.dumps({
        "database": str(DB),
        "doctype_counts": doctype_counts,
        "master_counts": master_counts,
        "child_counts": child_counts,
        "relevant_doctypes": relevant_docs,
    }, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"schema_output": str(output), "relevant_output": str(summary_output), "objects": len(result)}, ensure_ascii=False))
    con.close()


if __name__ == "__main__":
    main()
