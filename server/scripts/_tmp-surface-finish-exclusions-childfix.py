from pathlib import Path
import json


def replace_exact(value):
    if isinstance(value, str):
        return "item_code" if value == "item_group" else value
    if isinstance(value, list):
        return [replace_exact(v) for v in value]
    if isinstance(value, dict):
        return {k: replace_exact(v) for k, v in value.items()}
    return value

for relative in ["server/briefs/alumdoor.json", "server/briefs/alumdoor-v2.json"]:
    path = Path(relative)
    brief = json.loads(path.read_text(encoding="utf-8"))
    child = next(d for d in brief["doctypes"] if d["name"] == "Surface Finish Excluded Item")
    child = replace_exact(child)
    child["name"] = "Surface Finish Excluded Item"
    child["label"] = "Mặt hàng loại trừ (Bề mặt)"
    child["title"] = "item_code"
    child["fields"] = ["item_code:Link(Item)! Mặt hàng"]
    idx = next(i for i, d in enumerate(brief["doctypes"]) if d["name"] == "Surface Finish Excluded Item")
    brief["doctypes"][idx] = child
    path.write_text(json.dumps(brief, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

print("PATCH_CHILD_OK")
