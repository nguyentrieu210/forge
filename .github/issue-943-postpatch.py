from pathlib import Path

root = Path(__file__).resolve().parents[1]
path = root / "server/tests/sales-production-flow.test.mjs"
s = path.read_text(encoding="utf-8")

source_line = 'const brief = JSON.parse(await readFile(new URL("../briefs/alumdoor.json", import.meta.url), "utf8"));\n'
generated_line = 'const generatedBrief = JSON.parse(await readFile(new URL("../briefs/alumdoor-v2.json", import.meta.url), "utf8"));\n'
if generated_line not in s:
    if source_line not in s:
        raise RuntimeError("brief load anchor drift")
    s = s.replace(source_line, source_line + generated_line, 1)

helper = '''function generatedDoctype(name) {
  const value = generatedBrief.doctypes.find((entry) => entry.name === name);
  assert.ok(value, `missing generated doctype ${name}`);
  return value;
}

'''
anchor = '''function fieldNames(meta) {
'''
if helper not in s:
    if anchor not in s:
        raise RuntimeError("fieldNames anchor drift")
    s = s.replace(anchor, helper + anchor, 1)

s = s.replace(
    'const salesLine = fieldNames(doctype("Sales Order Item"));',
    'const salesLine = fieldNames(generatedDoctype("Sales Order Item"));',
)
s = s.replace(
    'const requestLine = doctype("Production Request Item");',
    'const requestLine = generatedDoctype("Production Request Item");',
)
s = s.replace(
    'fieldNames(doctype("Work Order"))',
    'fieldNames(generatedDoctype("Work Order"))',
)

path.write_text(s, encoding="utf-8")
print("issue-943 postpatch PASS: V2-derived metadata assertions use generated brief")
