from pathlib import Path

root = Path(__file__).resolve().parents[1]
path = root / ".github/issue-943-apply.py"
s = path.read_text(encoding="utf-8")

# The apply script itself is Python. A single \n inside its triple-quoted replacement
# becomes a physical newline in generated JavaScript; keep the JS escape literal instead.
old = r'''const tamLienRayOptions = `\n${tamLienRayTypes.join("\n")}`;'''
new = r'''const tamLienRayOptions = `\\n${tamLienRayTypes.join("\\n")}`;'''
if old in s:
    s = s.replace(old, new, 1)
elif new not in s:
    raise RuntimeError("tamLienRayOptions escape pattern drift")

# Use the canonical geometry profile field type exported by the evaluator module.
s = s.replace(
    'import { evaluateGeometryRules, type GeometryPolicyRule } from "./geometry-policy.js";',
    'import { evaluateGeometryRules, type GeometryPolicyRule, type GeometryProfileField } from "./geometry-policy.js";',
)
s = s.replace(
    'fields?: Array<{ geometry_field?: string; role?: string; required?: unknown; visible?: unknown; editable?: unknown; sequence?: unknown }>;',
    'fields?: GeometryProfileField[];',
)

# Child table geometry_rules is read from the selected full Cutting Policy document, never
# from the list projection. This avoids relying on child-table expansion in list APIs.
s = s.replace(
    '"priority", "disabled", "note", "ray_type", "geometry_profile", "geometry_rules", "leaf_formula", "leaf_height_deduction_m",',
    '"priority", "disabled", "note", "ray_type", "leaf_formula", "leaf_height_deduction_m",',
)
s = s.replace(
    '"priority", "disabled", "note", "ray_type", "geometry_profile", "leaf_formula", "leaf_height_deduction_m",',
    '"priority", "disabled", "note", "ray_type", "leaf_formula", "leaf_height_deduction_m",',
)

# Fail with a business message before trying to fetch Geometry Profile with an empty name.
old = '''    const geometryProfile = doorType === "Cửa tấm liền Úc"\n      ? await readDoc<GeometryProfileDoc>(call, "Geometry Profile", text(chosen.raw.geometry_profile))\n      : undefined;'''
new = '''    const geometryProfileName = text(chosen.raw.geometry_profile);\n    if (doorType === "Cửa tấm liền Úc" && !geometryProfileName) {\n      throw new Error(`${chosen.parsed.policy_name}: chưa khai Geometry Profile.`);\n    }\n    const geometryProfile = doorType === "Cửa tấm liền Úc"\n      ? await readDoc<GeometryProfileDoc>(call, "Geometry Profile", geometryProfileName)\n      : undefined;'''
if old in s:
    s = s.replace(old, new, 1)
elif new not in s:
    raise RuntimeError("geometryProfile preview guard pattern drift")

# Append a final test rewrite after the main apply script has added its focused tests.
if "# issue-943 generated metadata assertion fix" not in s:
    s += r'''

# issue-943 generated metadata assertion fix
# ray_type / PR Item / Work Order ray fields are V2-derived metadata, so assert them against
# generated alumdoor-v2.json rather than the legacy source brief.
test_source = TEST.read_text(encoding="utf-8")
old = 'const brief = JSON.parse(await readFile(new URL("../briefs/alumdoor.json", import.meta.url), "utf8"));\n'
new = old + 'const generatedBrief = JSON.parse(await readFile(new URL("../briefs/alumdoor-v2.json", import.meta.url), "utf8"));\n'
if old in test_source and 'const generatedBrief =' not in test_source:
    test_source = test_source.replace(old, new, 1)
helper = '''\nfunction generatedDoctype(name) {\n  const value = generatedBrief.doctypes.find((entry) => entry.name === name);\n  assert.ok(value, `missing generated doctype ${name}`);\n  return value;\n}\n'''
anchor = '''function fieldNames(meta) {\n  return new Set(meta.fields.map((field) => typeof field === "string" ? field.split(":", 1)[0] : field.fieldname));\n}\n'''
if helper.strip() not in test_source:
    if anchor not in test_source:
        raise RuntimeError("sales-production test helper anchor drift")
    test_source = test_source.replace(anchor, anchor + helper, 1)
test_source = test_source.replace(
    'const salesLine = fieldNames(doctype("Sales Order Item"));',
    'const salesLine = fieldNames(generatedDoctype("Sales Order Item"));',
)
test_source = test_source.replace(
    'const requestLine = doctype("Production Request Item");',
    'const requestLine = generatedDoctype("Production Request Item");',
)
test_source = test_source.replace(
    'fieldNames(doctype("Work Order"))',
    'fieldNames(generatedDoctype("Work Order"))',
)
TEST.write_text(test_source, encoding="utf-8")
'''

path.write_text(s, encoding="utf-8")
print("issue-943 apply harness corrected: JS escape, canonical geometry types, full-doc rules, generated metadata assertions")
