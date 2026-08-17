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
print("patched apply script: Cut Order Item remains generator-owned; source_batch_no comes from d6427f4")
