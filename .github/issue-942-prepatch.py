import json
import subprocess
from pathlib import Path

root = Path(__file__).resolve().parents[1]
path = root / "server/briefs/alumdoor.json"
source = json.loads(path.read_text(encoding="utf-8"))
raw = subprocess.check_output(
    ["git", "show", "d6427f435fb300f72f790a67f640114d6453cad4:server/briefs/alumdoor-v2.json"],
    cwd=root,
    text=True,
    encoding="utf-8",
)
snapshot = json.loads(raw)
cut_item = next(x for x in snapshot["doctypes"] if x["name"] == "Cut Order Item")
source["doctypes"] = [x for x in source["doctypes"] if x["name"] != "Cut Order Item"]
source["doctypes"].append(cut_item)
path.write_text(json.dumps(source, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print("restored Cut Order Item source doctype from d6427f4 (creation lineage cbc1dae + latest source_batch_no)")
