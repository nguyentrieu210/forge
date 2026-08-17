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

# Geometry child rows come from readDoc(Cutting Policy), not list projections.
s = s.replace(
    '"priority", "disabled", "note", "ray_type", "geometry_profile", "geometry_rules", "leaf_formula", "leaf_height_deduction_m",',
    '"priority", "disabled", "note", "ray_type", "leaf_formula", "leaf_height_deduction_m",',
)
s = s.replace(
    '"priority", "disabled", "note", "ray_type", "geometry_profile", "leaf_formula", "leaf_height_deduction_m",',
    '"priority", "disabled", "note", "ray_type", "leaf_formula", "leaf_height_deduction_m",',
)

# Match evaluateGeometryRules' actual API: policy/profile identity + profile_fields.
old = '''    profile: { fields: Array.isArray(profile.fields) ? profile.fields : [] },\n    rules,'''
new = '''    policy_name: chosen.parsed.policy_name,\n    geometry_profile: profileName,\n    profile_fields: Array.isArray(profile.fields) ? profile.fields : [],\n    rules,'''
if old in s:
    s = s.replace(old, new, 1)
elif new not in s:
    raise RuntimeError("geometry evaluator call pattern drift")

# Snapshot/lineage only needs deterministic applied rule codes; evaluator still owns full evidence.
old = 'return { cut_width_m: round(cutWidth), ray_type: rayType, applied_rules: result.applied_rules };'
new = 'return { cut_width_m: round(cutWidth), ray_type: rayType, applied_rules: result.applied_rules.map((entry) => entry.rule_code) };'
if old in s:
    s = s.replace(old, new, 1)
elif new not in s:
    raise RuntimeError("geometry applied-rules projection pattern drift")

# Fail with a business message before trying to fetch Geometry Profile with an empty name.
old = '''    const geometryProfile = doorType === "Cửa tấm liền Úc"\n      ? await readDoc<GeometryProfileDoc>(call, "Geometry Profile", text(chosen.raw.geometry_profile))\n      : undefined;'''
new = '''    const geometryProfileName = text(chosen.raw.geometry_profile);\n    if (doorType === "Cửa tấm liền Úc" && !geometryProfileName) {\n      throw new Error(`${chosen.parsed.policy_name}: chưa khai Geometry Profile.`);\n    }\n    const geometryProfile = doorType === "Cửa tấm liền Úc"\n      ? await readDoc<GeometryProfileDoc>(call, "Geometry Profile", geometryProfileName)\n      : undefined;'''
if old in s:
    s = s.replace(old, new, 1)
elif new not in s:
    raise RuntimeError("geometryProfile preview guard pattern drift")

path.write_text(s, encoding="utf-8")
print("issue-943 prepatch PASS: evaluator API aligned")
