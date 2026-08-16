import fs from "node:fs";
import { CUTTING_POLICIES, cuttingPolicyFixtureData } from "./lib/alumdoor-cutting-policy-catalog.mjs";

function once(path, before, after, label) {
  let text = fs.readFileSync(path, "utf8");
  const count = text.split(before).length - 1;
  if (count !== 1) throw new Error(`${label}: expected 1 match, got ${count}`);
  fs.writeFileSync(path, text.replace(before, after), "utf8");
}

const builder = "server/scripts/build-alumdoor-v2-brief.mjs";
once(builder,
  'import { GEOMETRY_FIELDS, GEOMETRY_PROFILES } from "./lib/alumdoor-geometry-catalog.mjs";\n',
  'import { GEOMETRY_FIELDS, GEOMETRY_PROFILES } from "./lib/alumdoor-geometry-catalog.mjs";\nimport { CUTTING_POLICIES, cuttingPolicyFixtureData } from "./lib/alumdoor-cutting-policy-catalog.mjs";\n',
  "catalog import");
once(builder, 'brief.version = "2.3.0";', 'brief.version = "2.4.0";', "version");
once(builder,
  '  "ray_type:Select(U75,U100,Ray sắt U70,Không dùng ray)!=(U75) Loại ray");',
  '  "ray_type:Select(U75,U100,Ray hộp/đơn U76,Ray sắt U70,Không dùng ray)!=(U75) Loại ray");\naddAfter(cp, "ray_type",\n  "geometry_profile:Link(Geometry Profile)! Bộ quy cách hình học",\n  "geometry_rules:Table(Cutting Policy Rule) Quy tắc hình học");',
  "geometry parent fields");
once(builder,
  'note("Cutting Policy: +9 trường (ray_type, chia lá) · +doctype con Leaf Variant");',
  `note("Cutting Policy: +9 trường (ray_type, chia lá) · +doctype con Leaf Variant");\n\nbrief.doctypes.push({\n  name: "Cutting Policy Rule", child: true, label: "Quy tắc hình học", group: "Sản xuất", naming: "autoincrement",\n  fields: [\n    "rule_code:Data*! Mã quy tắc",\n    "target_field:Link(Geometry Field)! Trường kết quả",\n    "source_field:Link(Geometry Field)! Trường nguồn",\n    "operator:Select(COPY,SUBTRACT,ADD)!=(SUBTRACT) Phép tính",\n    "operand_m:Float=(0) Giá trị cộng/trừ (m)",\n    { fieldname: "customer_group", fieldtype: "Select", options: "\\nĐại lý\\nLẻ", label: "Nhóm khách" },\n    { fieldname: "ray_type", fieldtype: "Select", options: "\\nU75\\nU100\\nRay hộp/đơn U76\\nRay sắt U70\\nKhông dùng ray", label: "Loại ray" },\n    "has_butterfly_bracket:Check Có bắn bướm",\n    "priority:Int=(0) Ưu tiên",\n    "sequence:Int=(10) Thứ tự",\n    "note:Small Text Ghi chú nguồn",\n  ],\n  permissions: { "Chủ xưởng": "rwc", "Kinh doanh": "r", "Sản xuất": "r" },\n});\nfor (const policy of CUTTING_POLICIES) {\n  const fixture = brief.fixtures.find((entry) => entry.type === "Cutting Policy" && entry.name === policy.name);\n  if (!fixture) throw new Error(\`Cutting Policy fixture missing: \${policy.name}\`);\n  Object.assign(fixture.data, cuttingPolicyFixtureData(policy));\n}\nnote(\`Cutting Policy: gắn Geometry Profile + \${CUTTING_POLICIES.reduce((sum, policy) => sum + policy.rules.length, 0)} geometry rules canonical\`);`,
  "child schema");

const briefPath = "server/briefs/alumdoor-v2.json";
const brief = JSON.parse(fs.readFileSync(briefPath, "utf8"));
brief.version = "2.4.0";
const doctypes = Array.isArray(brief.doctypes) ? brief.doctypes : Object.values(brief.doctypes);
const cp = doctypes.find((entry) => entry.name === "Cutting Policy");
if (!cp) throw new Error("static brief missing Cutting Policy");
const fieldName = (field) => typeof field === "string" ? field.split(":", 1)[0] : field.fieldname;
const rayIndex = cp.fields.findIndex((field) => fieldName(field) === "ray_type");
if (rayIndex < 0) throw new Error("static brief missing ray_type");
if (typeof cp.fields[rayIndex] === "string") {
  cp.fields[rayIndex] = cp.fields[rayIndex].replace("Ray sắt U70", "Ray hộp/đơn U76,Ray sắt U70");
} else if (!String(cp.fields[rayIndex].options ?? "").includes("Ray hộp/đơn U76")) {
  cp.fields[rayIndex].options = String(cp.fields[rayIndex].options ?? "").replace("Ray sắt U70", "Ray hộp/đơn U76\nRay sắt U70");
}
let insertAt = rayIndex + 1;
for (const addition of [
  { fieldname: "geometry_profile", fieldtype: "Link", options: "Geometry Profile", label: "Bộ quy cách hình học", required: true },
  { fieldname: "geometry_rules", fieldtype: "Table", options: "Cutting Policy Rule", label: "Quy tắc hình học" },
]) {
  if (!cp.fields.some((field) => fieldName(field) === addition.fieldname)) cp.fields.splice(insertAt++, 0, addition);
}
if (!doctypes.some((entry) => entry.name === "Cutting Policy Rule")) {
  doctypes.push({
    name: "Cutting Policy Rule", child: true, label: "Quy tắc hình học", group: "Sản xuất", naming: "autoincrement",
    fields: [
      { fieldname: "rule_code", fieldtype: "Data", label: "Mã quy tắc", required: true },
      { fieldname: "target_field", fieldtype: "Link", options: "Geometry Field", label: "Trường kết quả", required: true },
      { fieldname: "source_field", fieldtype: "Link", options: "Geometry Field", label: "Trường nguồn", required: true },
      { fieldname: "operator", fieldtype: "Select", options: "COPY\nSUBTRACT\nADD", label: "Phép tính", required: true, default: "SUBTRACT" },
      { fieldname: "operand_m", fieldtype: "Float", label: "Giá trị cộng/trừ (m)", default: 0 },
      { fieldname: "customer_group", fieldtype: "Select", options: "\nĐại lý\nLẻ", label: "Nhóm khách" },
      { fieldname: "ray_type", fieldtype: "Select", options: "\nU75\nU100\nRay hộp/đơn U76\nRay sắt U70\nKhông dùng ray", label: "Loại ray" },
      { fieldname: "has_butterfly_bracket", fieldtype: "Check", label: "Có bắn bướm" },
      { fieldname: "priority", fieldtype: "Int", label: "Ưu tiên", default: 0 },
      { fieldname: "sequence", fieldtype: "Int", label: "Thứ tự", default: 10 },
      { fieldname: "note", fieldtype: "Small Text", label: "Ghi chú nguồn" },
    ],
    permissions: { "Chủ xưởng": "rwc", "Kinh doanh": "r", "Sản xuất": "r" },
  });
}
for (const policy of CUTTING_POLICIES) {
  const fixture = brief.fixtures.find((entry) => entry.type === "Cutting Policy" && entry.name === policy.name);
  if (!fixture) throw new Error(`static fixture missing ${policy.name}`);
  Object.assign(fixture.data, cuttingPolicyFixtureData(policy));
}
fs.writeFileSync(briefPath, `${JSON.stringify(brief, null, 2)}\n`, "utf8");

const testPath = "server/tests/alumdoor-cutting-policy-geometry.test.mjs";
let testText = fs.readFileSync(testPath, "utf8");
testText = testText.replace('["đơn giá", "giá bán", "xốp", "ron đáy", "kg/m2", "quantity", "bom"]', '["đơn giá", "giá bán", "xốp", "ron đáy", "kg/m2", "quantity"]');
fs.writeFileSync(testPath, testText, "utf8");
