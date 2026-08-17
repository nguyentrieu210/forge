from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def patch(path, old, new, *, count=1):
    p = ROOT / path
    s = p.read_text(encoding='utf-8')
    if old not in s:
        if new in s:
            return
        raise RuntimeError(f'pattern not found in {path}: {old[:100]!r}')
    s = s.replace(old, new, count)
    p.write_text(s, encoding='utf-8')

# ---------------------------------------------------------------------------
# Metadata generator: per-line ray input from canonical Cutting Policy catalog,
# plus read-only downstream trace fields. No geometry constants go into React.
# ---------------------------------------------------------------------------
GEN = 'server/scripts/build-alumdoor-v2-brief.mjs'
patch(GEN,
'''const ensureSalesLineField = (line, anchor, field) => {
  const existingIndex = line.fields.findIndex((candidate) => nameOf(candidate) === field.fieldname);
  if (existingIndex >= 0) {
    const current = parseField(line.fields[existingIndex], existingIndex, line.name);
    line.fields[existingIndex] = { ...current, ...field };
    return;
  }
  addAfter(line, anchor, field);
};
''',
'''const ensureSalesLineField = (line, anchor, field) => {
  const existingIndex = line.fields.findIndex((candidate) => nameOf(candidate) === field.fieldname);
  if (existingIndex >= 0) {
    const current = parseField(line.fields[existingIndex], existingIndex, line.name);
    line.fields[existingIndex] = { ...current, ...field };
    return;
  }
  addAfter(line, anchor, field);
};

const tamLienUcPolicy = CUTTING_POLICIES.find((entry) => entry.code === "CP-CUA-TAM-LIEN-UC");
if (!tamLienUcPolicy) throw new Error("Catalog thiếu CP-CUA-TAM-LIEN-UC");
const tamLienRayTypes = [...new Set(
  tamLienUcPolicy.rules.map((entry) => entry.conditions.ray_type).filter(Boolean),
)];
if (tamLienRayTypes.length < 2) throw new Error("CP-CUA-TAM-LIEN-UC chưa khai đủ lựa chọn ray theo dòng");
const tamLienRayOptions = `\n${tamLienRayTypes.join("\n")}`;
''')

patch(GEN,
'''ensureSalesLineField(doctype("Sales Order Item"), "set_count", {
  fieldname: "bom_actual_components", fieldtype: "Table", options: "BOM Actual Component", label: "Vật tư BOM thực tế",
  description: "Nhập số lượng THỰC TẾ CHO MỘT BỘ. Production tách từng bộ thành một line; thiếu slot mà BOM Template yêu cầu thì chặn sinh BOM.",
});
note("Sales Order Item: +BOM Actual Component theo một bộ");
''',
'''ensureSalesLineField(doctype("Sales Order Item"), "has_butterfly_bracket", {
  fieldname: "ray_type",
  fieldtype: "Select",
  options: tamLienRayOptions,
  label: "Loại ray",
  depends_on: "eval:doc.door_type == 'Cửa tấm liền Úc'",
  mandatory_depends_on: "eval:doc.door_type == 'Cửa tấm liền Úc'",
  description: "Chọn theo từng dòng đơn. Server dùng Cutting Policy/Geometry Profile đang áp để tính rộng cắt; không dùng số trừ hardcode trên UI.",
  surface: "expanded",
});
ensureSalesLineField(doctype("Sales Order Item"), "set_count", {
  fieldname: "bom_actual_components", fieldtype: "Table", options: "BOM Actual Component", label: "Vật tư BOM thực tế",
  description: "Nhập số lượng THỰC TẾ CHO MỘT BỘ. Production tách từng bộ thành một line; thiếu slot mà BOM Template yêu cầu thì chặn sinh BOM.",
});
note("Sales Order Item: +ray_type theo dòng + BOM Actual Component theo một bộ");
''')

# Add downstream ray trace at the final convergence boundary, after derived doctypes exist.
patch(GEN,
'''  const itemPrice = doctype("Item Price");
  const priceVariantIndex = itemPrice.fields.findIndex((entry) => nameOf(entry) === "price_variant");
''',
'''  const ensureRayTrace = (doctypeName, anchor) => {
    const target = doctype(doctypeName);
    const field = {
      fieldname: "ray_type",
      fieldtype: "Data",
      label: "Loại ray",
      read_only: true,
      depends_on: "eval:doc.door_type == 'Cửa tấm liền Úc'",
      surface: "expanded",
    };
    const index = target.fields.findIndex((entry) => nameOf(entry) === "ray_type");
    if (index >= 0) target.fields[index] = field;
    else {
      const anchorIndex = target.fields.findIndex((entry) => nameOf(entry) === anchor);
      target.fields.splice(anchorIndex >= 0 ? anchorIndex + 1 : target.fields.length, 0, field);
    }
  };
  ensureRayTrace("Production Request Item", "door_type");
  ensureRayTrace("Work Order", "door_type");

  const itemPrice = doctype("Item Price");
  const priceVariantIndex = itemPrice.fields.findIndex((entry) => nameOf(entry) === "price_variant");
''')

# ---------------------------------------------------------------------------
# Runtime authority: use DB Cutting Policy geometry rules + DB Geometry Profile
# for Cửa tấm liền Úc. Other door types remain on the legacy calculator.
# ---------------------------------------------------------------------------
CORE = 'server/apps-src/alumdoor-worker/src/sales-production-core.ts'
patch(CORE,
'''import { inspectProductionLineBomRequirements, previewProductionLineBom, resolveProductionLineBom } from "./bom-template-materializer.js";
''',
'''import { inspectProductionLineBomRequirements, previewProductionLineBom, resolveProductionLineBom } from "./bom-template-materializer.js";
import { evaluateGeometryRules, type GeometryPolicyRule } from "./geometry-policy.js";
''')

patch(CORE,
'''  leaf_variants?: Array<{ variant_label?: string; addend?: unknown }>;
  ray_type?: string;
}

interface ProductionStandard extends Json {
''',
'''  leaf_variants?: Array<{ variant_label?: string; addend?: unknown }>;
  ray_type?: string;
  geometry_profile?: string;
  geometry_rules?: GeometryPolicyRule[];
}

interface GeometryProfileDoc extends Json {
  name?: string;
  profile_code?: string;
  fields?: Array<{ geometry_field?: string; role?: string; required?: unknown; visible?: unknown; editable?: unknown; sequence?: unknown }>;
  disabled?: unknown;
}

interface ProductionStandard extends Json {
''')

patch(CORE,
'''  door_type: DoorType;
  department: string;
''',
'''  door_type: DoorType;
  ray_type?: string;
  department: string;
''')

patch(CORE,
'''  policies: RawPolicy[];
  standards: ProductionStandard[];
''',
'''  policies: RawPolicy[];
  geometry_profiles?: Map<string, GeometryProfileDoc>;
  standards: ProductionStandard[];
''')

patch(CORE,
'''    text(policy.leaf_round_threshold),
    JSON.stringify(policy.leaf_variants ?? []),
''',
'''    text(policy.leaf_round_threshold),
    text(policy.geometry_profile),
    JSON.stringify(policy.geometry_rules ?? []),
    JSON.stringify(policy.leaf_variants ?? []),
''')

patch(CORE,
'''function productionDepartment(doorType: DoorType): string {
  return doorType === "Cửa tấm liền Úc" ? "Cửa Úc" : doorType;
}

function selectBom''',
'''function productionDepartment(doorType: DoorType): string {
  return doorType === "Cửa tấm liền Úc" ? "Cửa Úc" : doorType;
}

function raySpecificGeometry(
  doorType: DoorType,
  chosen: { parsed: DoorFormulaPolicy; raw: RawPolicy },
  profile: GeometryProfileDoc | undefined,
  row: Json,
  customerGroup: CustomerGroup,
  width: number,
  height: number,
): { cut_width_m: number; ray_type: string; applied_rules: string[] } | null {
  if (doorType !== "Cửa tấm liền Úc") return null;
  const rayType = text(row.ray_type);
  if (!rayType) throw new Error("Cửa tấm liền Úc cần chọn Loại ray theo từng dòng (Ray sắt U70 hoặc Ray hộp/đơn U76).");
  const profileName = text(chosen.raw.geometry_profile);
  if (!profileName) throw new Error(`${chosen.parsed.policy_name}: chưa khai Geometry Profile.`);
  if (!profile || checked(profile.disabled)) throw new Error(`${chosen.parsed.policy_name}: không đọc được Geometry Profile đang hiệu lực ${profileName}.`);
  const rules = Array.isArray(chosen.raw.geometry_rules) ? chosen.raw.geometry_rules : [];
  if (!rules.length) throw new Error(`${chosen.parsed.policy_name}: chưa khai Geometry Rules.`);
  const supportedRayTypes = [...new Set(
    rules
      .filter((rule) => text(rule.target_field) === "CAT_LA_RONG")
      .map((rule) => text(rule.ray_type))
      .filter(Boolean),
  )];
  if (!supportedRayTypes.includes(rayType)) {
    throw new Error(`Loại ray ${rayType} không được ${chosen.parsed.policy_name} hỗ trợ. Cho phép: ${supportedRayTypes.join(", ")}.`);
  }
  const result = evaluateGeometryRules({
    profile: { fields: Array.isArray(profile.fields) ? profile.fields : [] },
    rules,
    inputs: { PB_CAO: height, PB_RAY_RONG: width },
    context: {
      customer_group: customerGroup,
      ray_type: rayType,
      has_butterfly_bracket: checked(row.has_butterfly_bracket),
    },
    required_targets: ["CAT_LA_RONG"],
  });
  const cutWidth = finitePositive(result.values.CAT_LA_RONG, "Rộng cắt lá theo Geometry Policy");
  return { cut_width_m: round(cutWidth), ray_type: rayType, applied_rules: result.applied_rules };
}

function selectBom''')

patch(CORE,
'''    const leaf = calculateLeafPlan(chosen.raw, row);
    const department = productionDepartment(doorType);
''',
'''    const geometry = raySpecificGeometry(
      doorType,
      chosen,
      input.geometry_profiles?.get(text(chosen.raw.geometry_profile)),
      row,
      customerGroup,
      width,
      height,
    );
    const liveCutWidth = geometry?.cut_width_m ?? finitePositive(formula.cut_width_m, "Rộng cắt lá");
    const leaf = calculateLeafPlan(chosen.raw, row);
    const department = productionDepartment(doorType);
''')

patch(CORE,
'''        cut_width_m: formula.cut_width_m,
        billable_area_sqm: billablePerSet,
''',
'''        cut_width_m: liveCutWidth,
        billable_area_sqm: billablePerSet,
''')
patch(CORE,
'''        ray_type: text(chosen.raw.ray_type) || null,
      };
''',
'''        ray_type: geometry?.ray_type ?? null,
        geometry_applied_rules: geometry?.applied_rules ?? [],
      };
''')
patch(CORE,
'''        door_type: doorType,
        department,
''',
'''        door_type: doorType,
        ...(geometry?.ray_type ? { ray_type: geometry.ray_type } : {}),
        department,
''')
patch(CORE,
'''        cut_width_m: round(Number(formula.cut_width_m)),
        billable_area_sqm: billablePerSet,
''',
'''        cut_width_m: round(liveCutWidth),
        billable_area_sqm: billablePerSet,
''')

patch(CORE,
'''      "priority", "disabled", "note", "ray_type", "leaf_formula", "leaf_height_deduction_m",
      "leaf_divisor_source", "leaf_divisor_const", "leaf_rounding", "leaf_round_threshold", "leaf_variants",
''',
'''      "priority", "disabled", "note", "ray_type", "geometry_profile", "geometry_rules", "leaf_formula", "leaf_height_deduction_m",
      "leaf_divisor_source", "leaf_divisor_const", "leaf_rounding", "leaf_round_threshold", "leaf_variants",
''')

patch(CORE,
'''  return {
    sales,
    items: new Map(itemRows),
    policies,
    standards,
''',
'''  const fullPolicies = await Promise.all(policies.map(async (policy) => {
    const name = text(policy.name);
    return name ? { ...policy, ...await readDoc<RawPolicy>(call, "Cutting Policy", name) } : policy;
  }));
  const geometryProfileNames = [...new Set(fullPolicies.map((policy) => text(policy.geometry_profile)).filter(Boolean))];
  const geometryProfiles = new Map(await Promise.all(geometryProfileNames.map(async (name) => [
    name,
    await readDoc<GeometryProfileDoc>(call, "Geometry Profile", name),
  ] as const)));
  return {
    sales,
    items: new Map(itemRows),
    policies: fullPolicies,
    geometry_profiles: geometryProfiles,
    standards,
''')

# Preview list may read summary fields, then selected policy is read fully before geometry evaluation.
patch(CORE,
'''        "priority", "disabled", "note", "ray_type", "leaf_formula", "leaf_height_deduction_m",
        "leaf_divisor_source", "leaf_divisor_const", "leaf_rounding", "leaf_round_threshold",
''',
'''        "priority", "disabled", "note", "ray_type", "geometry_profile", "leaf_formula", "leaf_height_deduction_m",
        "leaf_divisor_source", "leaf_divisor_const", "leaf_rounding", "leaf_round_threshold",
''')

patch(CORE,
'''    const chosen = choosePolicy(policies, doorType, text(item.item_group));
    const sets = positiveInteger(args.set_count ?? 1, "Số bộ");
''',
'''    const chosenSummary = choosePolicy(policies, doorType, text(item.item_group));
    const chosenRaw = text(chosenSummary.raw.name)
      ? { ...chosenSummary.raw, ...await readDoc<RawPolicy>(call, "Cutting Policy", text(chosenSummary.raw.name)) }
      : chosenSummary.raw;
    const chosen = { parsed: parseDoorPolicy(chosenRaw), raw: chosenRaw };
    const geometryProfile = doorType === "Cửa tấm liền Úc"
      ? await readDoc<GeometryProfileDoc>(call, "Geometry Profile", text(chosen.raw.geometry_profile))
      : undefined;
    const sets = positiveInteger(args.set_count ?? 1, "Số bộ");
''')

patch(CORE,
'''    let leaf: LeafPlan | null = null;
''',
'''    const geometry = raySpecificGeometry(
      doorType,
      chosen,
      geometryProfile,
      args,
      customerGroup,
      finitePositive(args.width_m, "Rộng"),
      finitePositive(args.height_m, "Cao"),
    );
    const liveCutWidth = geometry?.cut_width_m ?? finitePositive(formula.cut_width_m, "Rộng cắt lá");
    let leaf: LeafPlan | null = null;
''')

patch(CORE,
'''      ...formula,
      item_code: itemCode,
''',
'''      ...formula,
      cut_width_m: round(liveCutWidth),
      item_code: itemCode,
''')
patch(CORE,
'''      ray_type: text(chosen.raw.ray_type) || null,
''',
'''      ray_type: geometry?.ray_type ?? null,
      geometry_applied_rules: geometry?.applied_rules ?? [],
''')
patch(CORE,
'''      formula_explanation: `${formula.explanation}${leaf ? ` ${leaf.explanation}` : ""}`.trim(),
''',
'''      formula_explanation: `${formula.explanation}${geometry ? ` Hình học: ${geometry.applied_rules.join(", ")}.` : ""}${leaf ? ` ${leaf.explanation}` : ""}`.trim(),
''')

patch(CORE,
'''        door_type: line.door_type,
        cut_width_m: line.cut_width_m,
''',
'''        door_type: line.door_type,
        ...(line.ray_type ? { ray_type: line.ray_type } : {}),
        cut_width_m: line.cut_width_m,
''')

# ---------------------------------------------------------------------------
# Server-owned UI behavior: ray is required/visible only for tấm liền lines.
# ---------------------------------------------------------------------------
UI = 'server/apps-src/alumdoor-worker/src/ui-child-preview.ts'
patch(UI,
'''  for (const [name, value] of masterPlan) setIfField(patch, fields, name, value);

  const allowedColors = await allowedColorNamesForGroup(call, text(item.item_group), "sales");
''',
'''  for (const [name, value] of masterPlan) setIfField(patch, fields, name, value);
  const effectiveDoorType = text(context.door_type ?? item.door_type);
  if (effectiveDoorType === "Cửa tấm liền Úc") {
    fieldOverride(overrides, fields, "ray_type", {
      hidden: 0,
      reqd: 1,
      read_only: 0,
      label: "Loại ray",
      depends_on: null,
      mandatory_depends_on: null,
    });
  } else {
    clearIfField(clear, fields, "ray_type");
    fieldOverride(overrides, fields, "ray_type", {
      hidden: 1,
      reqd: 0,
      read_only: 1,
      depends_on: null,
      mandatory_depends_on: null,
    });
  }

  const allowedColors = await allowedColorNamesForGroup(call, text(item.item_group), "sales");
''')

# ---------------------------------------------------------------------------
# Client: generic spec editor knows ray_type is a Select, but allowed values stay metadata/server-owned.
# ---------------------------------------------------------------------------
MODEL = 'client/packages/views/src/app/vertical/alumdoor/sales-order-v2/model.ts'
patch(MODEL,
'''  leaf_variant?: string;
  has_butterfly_bracket?: number;
''',
'''  leaf_variant?: string;
  ray_type?: string;
  has_butterfly_bracket?: number;
''')
patch(MODEL,
'''  "leaf_variant",
  "has_butterfly_bracket",
''',
'''  "leaf_variant",
  "ray_type",
  "has_butterfly_bracket",
''')

TABLE = 'client/packages/views/src/app/vertical/alumdoor/sales-order-v2/AlumdoorSalesOrderLineTable.tsx'
patch(TABLE,
'''  leaf_variant: "Kiểu lá / motor",
  has_butterfly_bracket: "Bản bướm",
''',
'''  leaf_variant: "Kiểu lá / motor",
  ray_type: "Loại ray",
  has_butterfly_bracket: "Bản bướm",
''')
patch(TABLE,
'''fieldname === "has_butterfly_bracket" ? "Check" : fieldname === "leaf_variant" ? "Select" : fieldname === "motor_model" ? "Link" : "Float"''',
'''fieldname === "has_butterfly_bracket" ? "Check" : (fieldname === "leaf_variant" || fieldname === "ray_type") ? "Select" : fieldname === "motor_model" ? "Link" : "Float"''')

# ---------------------------------------------------------------------------
# Focused runtime tests: exact U70/U76 outputs, fail-closed ray validation,
# downstream propagation, and no React constants.
# ---------------------------------------------------------------------------
TEST = ROOT / 'server/tests/sales-production-flow.test.mjs'
s = TEST.read_text(encoding='utf-8')
marker = '''test("loại cửa thiếu số chia hoặc cách làm tròn bị chặn, không đoán", () => {'''
if 'Cửa tấm liền Úc dùng ray từng dòng làm authority rộng cắt' not in s:
    addition = r'''
function tamLienProductionInput(rayType) {
  const base = fixturePolicy("Cửa tấm liền Úc — công thức chuẩn");
  const policy = {
    ...base,
    geometry_profile: "GP-CUA-UC",
    geometry_rules: [
      { rule_code: "TLUC-RCL-U70", target_field: "CAT_LA_RONG", source_field: "PB_RAY_RONG", operator: "SUBTRACT", operand_m: 0.05, ray_type: "Ray sắt U70", priority: 10, sequence: 10 },
      { rule_code: "TLUC-RCL-U76", target_field: "CAT_LA_RONG", source_field: "PB_RAY_RONG", operator: "SUBTRACT", operand_m: 0.08, ray_type: "Ray hộp/đơn U76", priority: 10, sequence: 20 },
    ],
  };
  return {
    sales: {
      name: "DH-TLUC",
      docstatus: 1,
      customer_group: "Đại lý",
      delivery_date: "2026-08-10",
      items: [{
        row_id: "ROW-TLUC",
        item_code: "CUA-TLUC-TEST",
        inventory_mode: "Thành phẩm theo m2",
        width_m: 4,
        height_m: 2.856,
        set_count: 1,
        ray_type: rayType,
        single_layer_leaf_count: 4,
      }],
    },
    items: new Map([["CUA-TLUC-TEST", {
      item_code: "CUA-TLUC-TEST",
      item_group: "Cửa tấm liền Úc",
      door_type: "Cửa tấm liền Úc",
      inventory_mode: "Thành phẩm theo m2",
      stock_uom: "Bộ",
      min_area_sqm: 0,
    }]]),
    policies: [policy],
    geometry_profiles: new Map([["GP-CUA-UC", {
      name: "GP-CUA-UC",
      fields: [
        { geometry_field: "PB_CAO", role: "INPUT", required: true },
        { geometry_field: "PB_RAY_RONG", role: "INPUT", required: true },
        { geometry_field: "CAT_LA_RONG", role: "CALCULATED" },
      ],
    }]]),
    standards: [],
    boms: [{ name: "BOM-TLUC-1", item: "CUA-TLUC-TEST", docstatus: 1, bom_status: "Active", revision: 1 }],
    source_warehouse: "K36",
    target_warehouse: "K36-TP",
  };
}

test("Cửa tấm liền Úc dùng ray từng dòng làm authority rộng cắt", () => {
  const u70 = buildSalesProductionLines(tamLienProductionInput("Ray sắt U70"));
  const u76 = buildSalesProductionLines(tamLienProductionInput("Ray hộp/đơn U76"));
  assert.equal(u70[0].cut_width_m, 3.95);
  assert.equal(u76[0].cut_width_m, 3.92);
  assert.equal(u70[0].ray_type, "Ray sắt U70");
  assert.equal(u76[0].ray_type, "Ray hộp/đơn U76");
  assert.equal(JSON.parse(u70[0].formula_snapshot).ray_type, "Ray sắt U70");
  assert.deepEqual(JSON.parse(u70[0].formula_snapshot).geometry_applied_rules, ["TLUC-RCL-U70"]);
});

test("Cửa tấm liền Úc thiếu hoặc sai ray thì production fail closed", () => {
  assert.throws(() => buildSalesProductionLines(tamLienProductionInput(undefined)), /cần chọn Loại ray/);
  assert.throws(() => buildSalesProductionLines(tamLienProductionInput("U75")), /không được .* hỗ trợ/);
});

'''
    s = s.replace(marker, addition + marker, 1)

# Extend metadata contract assertions.
s = s.replace('''    "door_type", "leaf_variant", "leaf_divisor_m", "leaf_count", "single_layer_leaf_count",
''','''    "door_type", "ray_type", "leaf_variant", "leaf_divisor_m", "leaf_count", "single_layer_leaf_count",
''',1)
s = s.replace('''  assert.ok(fieldNames(requestLine).has("request_line_key"));
''','''  assert.ok(fieldNames(requestLine).has("request_line_key"));
  assert.ok(fieldNames(requestLine).has("ray_type"));
''',1)
s = s.replace('''  assert.ok(fieldNames(doctype("Work Order")).has("leaf_count"));
''','''  assert.ok(fieldNames(doctype("Work Order")).has("leaf_count"));
  assert.ok(fieldNames(doctype("Work Order")).has("ray_type"));
''',1)
if 'React must not own U70/U76 cut deductions' not in s:
    s += r'''

test("React must not own U70/U76 cut deductions", async () => {
  const model = await readFile(new URL("../../client/packages/views/src/app/vertical/alumdoor/sales-order-v2/model.ts", import.meta.url), "utf8");
  const table = await readFile(new URL("../../client/packages/views/src/app/vertical/alumdoor/sales-order-v2/AlumdoorSalesOrderLineTable.tsx", import.meta.url), "utf8");
  assert.match(model, /"ray_type"/);
  assert.match(table, /ray_type: "Loại ray"/);
  assert.doesNotMatch(model + table, /0\.05|0\.08/);
});
'''
TEST.write_text(s, encoding='utf-8')

print('issue-943 product patches staged')
