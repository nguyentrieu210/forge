import json
import sqlite3
import unicodedata
from collections import defaultdict
from pathlib import Path

ROOT = Path(r"C:\alumdoor")
DB = ROOT / r"server\apps\tenant-worker\.wrangler\state\v3\d1\miniflare-D1DatabaseObject\0f70e06fc007ec84591c21ca1daaf09474ca2074a0d42ba21eb2a3fcdbb2cdf8.sqlite"


def norm(value):
    raw = unicodedata.normalize("NFD", str(value or "").upper())
    return "".join(ch for ch in raw if unicodedata.category(ch) != "Mn" and ch.isalnum())


brief = json.loads((ROOT / "server/briefs/alumdoor-v2.json").read_text(encoding="utf-8"))
legacy = json.loads((ROOT / "local-imports/alumdoor-item-master-payload.json").read_text(encoding="utf-8"))["items"]
legacy_by_code = {row["item_code"]: row for row in legacy}

connection = sqlite3.connect(f"file:{DB.as_posix()}?mode=ro", uri=True)
current_rows = [json.loads(payload) for _, payload in connection.execute(
    "SELECT name,payload_json FROM documents WHERE tenant_id=? AND doctype=?",
    ("demo", "Item"),
)]
connection.close()

current_by_code = {row["item_code"]: row for row in current_rows}
current_by_name = defaultdict(list)
for row in current_rows:
    current_by_name[norm(row.get("item_name"))].append(row["item_code"])


def walk(value):
    if isinstance(value, str):
        stripped = value.strip()
        if stripped.startswith(("[", "{")):
            try:
                yield from walk(json.loads(stripped))
            except json.JSONDecodeError:
                pass
        yield value
    elif isinstance(value, list):
        for item in value:
            yield from walk(item)
    elif isinstance(value, dict):
        for item in value.values():
            yield from walk(item)


target_types = {"BOM Template", "Ngưỡng chọn Motor"}
refs = sorted({
    value
    for fixture in brief.get("fixtures", [])
    if fixture.get("type") in target_types
    for value in walk(fixture.get("data", {}))
    if value in legacy_by_code or value.startswith(("TP-", "NVL-", "MOTO-", "PIN-"))
})

for code in refs:
    if code in current_by_code:
        print(f"EXACT\t{code}\t{code}")
        continue
    old = legacy_by_code.get(code)
    candidates = current_by_name.get(norm(old.get("item_name"))) if old else []
    state = "UNIQUE" if len(candidates) == 1 else "AMBIG" if candidates else "MISSING"
    print(f"{state}\t{code}\t{old.get('item_name') if old else ''}\t{'|'.join(candidates)}")
