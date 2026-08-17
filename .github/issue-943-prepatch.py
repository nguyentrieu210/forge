from pathlib import Path

root = Path(__file__).resolve().parents[1]
path = root / ".github/issue-943-apply.py"
s = path.read_text(encoding="utf-8")

# The apply script is Python that emits JavaScript. Keep JS escape sequences literal.
old = r'''const tamLienRayOptions = `\n${tamLienRayTypes.join("\n")}`;'''
new = r'''const tamLienRayOptions = `\\n${tamLienRayTypes.join("\\n")}`;'''
if old in s:
    s = s.replace(old, new, 1)
elif new not in s:
    raise RuntimeError("tamLienRayOptions escape pattern drift")

s = s.replace(
    'import { evaluateGeometryRules, type GeometryPolicyRule } from "./geometry-policy.js";',
    'import { evaluateGeometryRules, type GeometryPolicyRule, type GeometryProfileField } from "./geometry-policy.js";',
)
s = s.replace(
    'fields?: Array<{ geometry_field?: string; role?: string; required?: unknown; visible?: unknown; editable?: unknown; sequence?: unknown }>;',
    'fields?: GeometryProfileField[];',
)

# Geometry child rows come from readDoc(Cutting Policy), not list projections.
s = s.replace(
    '"priority", "disabled", "note", "ray_type", "geometry_profile", "geometry_rules", "leaf_formula", "leaf_height_deduction_m",',
    '"priority", "disabled", "note", "ray_type", "leaf_formula", "leaf_height_deduction_m",',
)
s = s.replace(
    '"priority", "disabled", "note", "ray_type", "geometry_profile", "leaf_formula", "leaf_height_deduction_m",',
    '"priority", "disabled", "note", "ray_type", "leaf_formula", "leaf_height_deduction_m",',
)

old = '''    const geometryProfile = doorType === "Cửa tấm liền Úc"\n      ? await readDoc<GeometryProfileDoc>(call, "Geometry Profile", text(chosen.raw.geometry_profile))\n      : undefined;'''
new = '''    const geometryProfileName = text(chosen.raw.geometry_profile);\n    if (doorType === "Cửa tấm liền Úc" && !geometryProfileName) {\n      throw new Error(`${chosen.parsed.policy_name}: chưa khai Geometry Profile.`);\n    }\n    const geometryProfile = doorType === "Cửa tấm liền Úc"\n      ? await readDoc<GeometryProfileDoc>(call, "Geometry Profile", geometryProfileName)\n      : undefined;'''
if old in s:
    s = s.replace(old, new, 1)
elif new not in s:
    raise RuntimeError("geometryProfile preview guard pattern drift")

path.write_text(s, encoding="utf-8")
print("issue-943 prepatch PASS")
