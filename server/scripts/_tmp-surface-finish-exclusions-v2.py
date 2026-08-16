from pathlib import Path
from copy import deepcopy
import json

path = Path("server/briefs/alumdoor-v2.json")
brief = json.loads(path.read_text(encoding="utf-8"))
surface = next(d for d in brief["doctypes"] if d["name"] == "Surface Finish")

def fieldname(field):
    return field.split(":", 1)[0].strip() if isinstance(field, str) else field.get("fieldname", "")

names = [fieldname(f) for f in surface["fields"]]
if "excluded_groups" not in names:
    at = names.index("applies_to_all_groups") + 1
    surface["fields"][at:at] = [
        {
            "fieldname": "excluded_groups",
            "fieldtype": "Table",
            "options": "Surface Finish Excluded Group",
            "label": "Nhóm SP loại trừ",
            "description": "Loại cả nhóm và mọi nhóm con, dù nhóm cha đang nằm trong phạm vi áp dụng.",
        },
        {
            "fieldname": "excluded_items",
            "fieldtype": "Table",
            "options": "Surface Finish Excluded Item",
            "label": "Mặt hàng loại trừ",
            "description": "Loại từng Item cụ thể, dù Item thuộc Nhóm SP đang được áp dụng.",
        },
    ]

by_name = {d["name"]: d for d in brief["doctypes"]}
scope = by_name["Surface Finish Scope"]
if "Surface Finish Excluded Group" not in by_name:
    d = deepcopy(scope)
    d["name"] = "Surface Finish Excluded Group"
    d["label"] = "Nhóm SP loại trừ (Bề mặt)"
    brief["doctypes"].append(d)
if "Surface Finish Excluded Item" not in by_name:
    d = deepcopy(scope)
    d["name"] = "Surface Finish Excluded Item"
    d["label"] = "Mặt hàng loại trừ (Bề mặt)"
    d["title"] = "item_code"
    d["fields"] = ["item_code:Link(Item)! Mặt hàng"]
    brief["doctypes"].append(d)

path.write_text(json.dumps(brief, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print("PATCH_V2_OK")
