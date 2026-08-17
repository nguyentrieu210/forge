import json
from pathlib import Path

root = Path(__file__).resolve().parents[1]
path = root / ".github/issue-942-apply.py"
s = path.read_text(encoding="utf-8")

# Cut Order Item and Cutting Policy geometry fields are V2-derived contracts owned by
# the generator/catalog layer, not by the legacy alumdoor.json source.
old = 'upsert_field(srcdt("Cut Order Item"), fld(dt(C, "Cut Order Item"), "source_batch_no"))\n'
if old in s:
    s = s.replace(old, "", 1)
old = 'for name in ["geometry_profile", "geometry_rules"]:\n    upsert_field(srcdt("Cutting Policy"), fld(dt(G, "Cutting Policy"), name))\n'
if old in s:
    s = s.replace(old, "", 1)

old = '  for (const fieldname of ["geometry_profile", "geometry_rules"])\n    upsertSourceField("Cutting Policy", fieldname);\n'
if old in s:
    s = s.replace(old, "", 1)

old = '  upsertSourceField("Cut Order Item", "source_batch_no");\n'
new = '''  {\n    // Cut Order Item is a V2-derived doctype created by this generator (cbc1dae).\n    // d6427f4 added the FIFO source-batch lineage directly to generated V2; keep\n    // that field in the generator rather than pretending the legacy source owns the child.\n    const target = doctype("Cut Order Item");\n    const value = {\n      fieldname: "source_batch_no",\n      label: "Lô nguồn FIFO",\n      fieldtype: "Link",\n      options: "Batch",\n      required: true,\n      read_only: true,\n      surface: "expanded",\n    };\n    const existing = target.fields.findIndex((entry) => nameOf(entry) === "source_batch_no");\n    if (existing >= 0) target.fields[existing] = value;\n    else {\n      const anchor = target.fields.findIndex((entry) => nameOf(entry) === "source_warehouse");\n      target.fields.splice(anchor >= 0 ? anchor + 1 : target.fields.length, 0, value);\n    }\n  }\n'''
if old in s:
    s = s.replace(old, new, 1)
elif 'd6427f4 added the FIFO source-batch lineage' not in s:
    raise RuntimeError('Cut Order Item generator convergence pattern drift')

old = '    if (Array.isArray(target.search)) target.search = target.search.filter((entry) => !["sales_option", "sales_mode"].includes(entry));\n'
new = '    if (Array.isArray(target.list)) target.list = target.list.filter((entry) => !["sales_option", "sales_mode"].includes(entry));\n    if (Array.isArray(target.search)) target.search = target.search.filter((entry) => !["sales_option", "sales_mode"].includes(entry));\n'
if old in s:
    s = s.replace(old, new, 1)
elif 'Array.isArray(target.list)' not in s:
    raise RuntimeError('deprecated list/search convergence pattern drift')

old = '    for (const f of dt.fields ?? []) assert.ok(!["sales_option", "sales_mode"].includes(nameOf(f)), `deprecated ${dt.name}.${nameOf(f)}`);\n'
new = '    for (const f of dt.fields ?? []) assert.ok(!["sales_option", "sales_mode"].includes(nameOf(f)), `deprecated ${dt.name}.${nameOf(f)}`);\n    for (const f of dt.list ?? []) assert.ok(!["sales_option", "sales_mode"].includes(f), `deprecated ${dt.name}.list:${f}`);\n    for (const f of dt.search ?? []) assert.ok(!["sales_option", "sales_mode"].includes(f), `deprecated ${dt.name}.search:${f}`);\n'
if old in s:
    s = s.replace(old, new, 1)
elif 'deprecated ${dt.name}.list' not in s:
    raise RuntimeError('reproducibility test list/search pattern drift')

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

print("patched apply script: generator-owned geometry/Cut Order fields preserved; customFields schema aligned; deprecated refs removed")
