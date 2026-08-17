import json
from pathlib import Path

root = Path(__file__).resolve().parents[1]
path = root / ".github/issue-942-apply.py"
s = path.read_text(encoding="utf-8")

old = 'upsert_field(srcdt("Cut Order Item"), fld(dt(C, "Cut Order Item"), "source_batch_no"))\n'
if old in s:
    s = s.replace(old, "", 1)

old = '  upsertSourceField("Cut Order Item", "source_batch_no");\n'
new = '''  {\n    // Cut Order Item is a V2-derived doctype created by this generator (cbc1dae).\n    // d6427f4 added the FIFO source-batch lineage directly to generated V2; keep\n    // that field in the generator rather than pretending the legacy source owns the child.\n    const target = doctype("Cut Order Item");\n    const value = {\n      fieldname: "source_batch_no",\n      label: "Lô nguồn FIFO",\n      fieldtype: "Link",\n      options: "Batch",\n      required: true,\n      read_only: true,\n      surface: "expanded",\n    };\n    const existing = target.fields.findIndex((entry) => nameOf(entry) === "source_batch_no");\n    if (existing >= 0) target.fields[existing] = value;\n    else {\n      const anchor = target.fields.findIndex((entry) => nameOf(entry) === "source_warehouse");\n      target.fields.splice(anchor >= 0 ? anchor + 1 : target.fields.length, 0, value);\n    }\n  }\n'''
if old in s:
    s = s.replace(old, new, 1)
elif 'd6427f4 added the FIFO source-batch lineage' not in s:
    raise RuntimeError('Cut Order Item generator convergence pattern drift')

path.write_text(s, encoding="utf-8")

# compileCustomFields already passes entry.field to parseField(), and parseField supports
# both shorthand strings and the canonical $defs.field object form. The JSON Schema was
# narrower than the compiler and rejected generator-added link_filters on custom fields.
schema_path = root / "server/briefs/brief.schema.json"
schema = json.loads(schema_path.read_text(encoding="utf-8"))
custom_entry = schema["properties"]["customFields"]["additionalProperties"]["items"]["oneOf"][1]
field_schema = custom_entry["properties"]["field"]
expected = {"type": "string", "minLength": 3}
if field_schema == expected:
    custom_entry["properties"]["field"] = {"$ref": "#/$defs/field"}
elif field_schema != {"$ref": "#/$defs/field"}:
    raise RuntimeError(f"customFields field schema drift: {field_schema!r}")
schema_path.write_text(json.dumps(schema, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

print("patched apply script: Cut Order Item remains generator-owned; customFields.field reuses canonical field schema")
