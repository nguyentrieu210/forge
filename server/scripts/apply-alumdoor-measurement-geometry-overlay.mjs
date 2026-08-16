#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { GEOMETRY_FIELDS, GEOMETRY_PROFILES, assertGeometryCatalog } from "./lib/alumdoor-geometry-catalog.mjs";
import { MEASUREMENT_PROFILES, measurementProfilePayload } from "./lib/alumdoor-measurement-profile-catalog.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
const briefPath = resolve(root, "server/briefs/alumdoor-v2.json");
const builderPath = resolve(root, "server/scripts/build-alumdoor-v2-brief.mjs");
const itemBuilderPath = resolve(root, "server/scripts/build-alumdoor-item-only-import.mjs");
const write = process.argv.includes("--write");
const TARGET_VERSION = "2.3.0";

assertGeometryCatalog();

const fieldName = (field) => typeof field === "string" ? field.split(":", 1)[0].trim() : field?.fieldname;

function geometryDoctypes() {
  const permissions = { "Chủ xưởng": "rwc", "Kinh doanh": "r", "Sản xuất": "r", "Kế toán": "r" };
  return [
    {
      name: "Geometry Field",
      label: "Trường hình học",
      group: "Danh mục",
      naming: "field:field_code",
      title: "field_name",
      list: ["field_code", "field_name", "uom", "axis", "disabled"],
      search: ["field_code", "field_name"],
      fields: [
        { fieldname: "field_code", fieldtype: "Data", label: "Mã trường", required: true },
        { fieldname: "field_name", fieldtype: "Data", label: "Tên trường", required: true },
        { fieldname: "uom", fieldtype: "Link", options: "UOM", label: "Đơn vị", required: true },
        { fieldname: "axis", fieldtype: "Select", options: "WIDTH\nHEIGHT\nLENGTH\nOTHER", optionLabels: { WIDTH: "Chiều rộng", HEIGHT: "Chiều cao", LENGTH: "Chiều dài", OTHER: "Khác" }, label: "Trục đo", required: true },
        { fieldname: "note", fieldtype: "Small Text", label: "Ghi chú" },
        { fieldname: "disabled", fieldtype: "Check", label: "Ngừng dùng", default: false },
      ],
      permissions,
    },
    {
      name: "Geometry Profile Scope",
      child: true,
      label: "Nhóm hàng của bộ quy cách hình học",
      group: "Danh mục",
      naming: "autoincrement",
      fields: [
        { fieldname: "item_group", fieldtype: "Link", options: "Item Group", label: "Nhóm hàng", required: true },
      ],
      permissions,
    },
    {
      name: "Geometry Profile Field",
      child: true,
      label: "Trường của bộ quy cách hình học",
      group: "Danh mục",
      naming: "autoincrement",
      fields: [
        { fieldname: "geometry_field", fieldtype: "Link", options: "Geometry Field", label: "Trường", required: true },
        { fieldname: "role", fieldtype: "Select", options: "INPUT\nCALCULATED\nINFO", optionLabels: { INPUT: "Nhập liệu", CALCULATED: "Tự tính", INFO: "Thông tin" }, label: "Vai trò", required: true },
        { fieldname: "required", fieldtype: "Check", label: "Bắt buộc", default: false },
        { fieldname: "visible", fieldtype: "Check", label: "Hiện trên form", default: true },
        { fieldname: "editable", fieldtype: "Check", label: "Cho nhập", default: false },
        { fieldname: "sequence", fieldtype: "Int", label: "Thứ tự", default: 0 },
      ],
      permissions,
    },
    {
      name: "Geometry Profile",
      label: "Bộ quy cách hình học",
      group: "Danh mục",
      naming: "field:profile_code",
      title: "profile_name",
      list: ["profile_code", "profile_name", "disabled"],
      search: ["profile_code", "profile_name"],
      fields: [
        { fieldname: "profile_code", fieldtype: "Data", label: "Mã bộ quy cách", required: true },
        { fieldname: "profile_name", fieldtype: "Data", label: "Tên bộ quy cách", required: true },
        { fieldname: "item_groups", fieldtype: "Table", options: "Geometry Profile Scope", label: "Nhóm hàng áp dụng" },
        { fieldname: "fields", fieldtype: "Table", options: "Geometry Profile Field", label: "Trường hiển thị", required: true },
        { fieldname: "note", fieldtype: "Small Text", label: "Ghi chú" },
        { fieldname: "disabled", fieldtype: "Check", label: "Ngừng dùng", default: false },
      ],
      permissions,
    },
  ];
}

function geometryFixtures() {
  return [
    ...GEOMETRY_FIELDS.map((field) => ({
      type: "Geometry Field",
      name: field.code,
      data: {
        field_code: field.code,
        field_name: field.name,
        uom: field.uom,
        axis: field.axis,
        disabled: false,
        _migration_source: "alumdoor-geometry-master-2026-08-16",
      },
    })),
    ...GEOMETRY_PROFILES.map((profile) => ({
      type: "Geometry Profile",
      name: profile.code,
      data: {
        profile_code: profile.code,
        profile_name: profile.name,
        item_groups: profile.itemGroups.map((itemGroup, index) => ({ row_id: `GROUP-${index + 1}`, item_group: itemGroup })),
        fields: profile.fields.map((field, index) => ({
          row_id: `FIELD-${index + 1}`,
          geometry_field: field.geometryField,
          role: field.role,
          required: field.required,
          visible: field.visible,
          editable: field.editable,
          sequence: field.sequence,
        })),
        disabled: false,
        _migration_source: "alumdoor-geometry-master-2026-08-16",
      },
    })),
  ];
}

function patchBrief(brief) {
  brief.version = TARGET_VERSION;
  const owned = new Set(["Geometry Field", "Geometry Profile Scope", "Geometry Profile Field", "Geometry Profile"]);
  brief.doctypes = (brief.doctypes ?? []).filter((dt) => !owned.has(dt.name));
  brief.doctypes.push(...geometryDoctypes());

  const measurement = brief.doctypes.find((dt) => dt.name === "Measurement Profile");
  if (!measurement) throw new Error("Measurement Profile doctype missing");
  const movedOut = new Set(["theoretical_kg_per_m", "effective_width_m", "kerf_mm", "scrap_threshold_m"]);
  measurement.fields = (measurement.fields ?? []).filter((field) => !movedOut.has(fieldName(field)));

  const item = brief.doctypes.find((dt) => dt.name === "Item");
  if (!item) throw new Error("Item doctype missing");
  if (!(item.fields ?? []).some((field) => fieldName(field) === "geometry_profile")) {
    const index = item.fields.findIndex((field) => fieldName(field) === "measurement_profile");
    const geometryField = { fieldname: "geometry_profile", fieldtype: "Link", options: "Geometry Profile", label: "Bộ quy cách hình học" };
    if (index >= 0) item.fields.splice(index + 1, 0, geometryField);
    else item.fields.push(geometryField);
  }

  const replaceTypes = new Set(["Measurement Profile", "Geometry Field", "Geometry Profile"]);
  brief.fixtures = (brief.fixtures ?? []).filter((fixture) => !replaceTypes.has(fixture.type));
  brief.fixtures.push(
    ...MEASUREMENT_PROFILES.map((profile) => ({ type: "Measurement Profile", name: profile.name, data: measurementProfilePayload(profile) })),
    ...geometryFixtures(),
  );

  brief.navigation ??= {};
  brief.navigation.items ??= [];
  for (const name of ["Geometry Field", "Geometry Profile"]) if (!brief.navigation.items.includes(name)) brief.navigation.items.push(name);
  return brief;
}

function replaceOnce(text, before, after, label) {
  const count = text.split(before).length - 1;
  if (count !== 1) throw new Error(`${label}: expected exactly one match, got ${count}`);
  return text.replace(before, after);
}

function patchItemBuilder(text) {
  text = replaceOnce(text, '  const stockUom = kgTarget\n    ? "Kg"\n    : old?.["Đơn vị TỒN KHO"]', '  const stockUom = kgTarget\n    ? "Cây"\n    : inventoryMode === "Thành phẩm theo m2"\n      ? "Bộ"\n      : old?.["Đơn vị TỒN KHO"]', "stock UOM invariant");
  text = replaceOnce(text, '      default_purchase_uom: stockUom,', '      default_purchase_uom: kgTarget ? "Kg" : stockUom,', "purchase UOM invariant");
  const conversion = /    \.\.\.\(kgTarget && salesUom === "Mét"[\s\S]*?      : \{\}\),/;
  if (!conversion.test(text)) throw new Error("kg/m uom conversion block not found");
  text = text.replace(conversion, '    ...(kgTarget ? { uom_conversions: [] } : {}),');
  text = replaceOnce(text, '    has_batch_no: false,\n    has_serial_no: false,', '    has_batch_no: Boolean(kgTarget),\n    has_serial_no: false,\n    ...(kgTarget ? {\n      has_catch_weight: true,\n      weight_uom: "Kg",\n      purchase_stock_qty_field: "qty_bar",\n      purchase_allocation_qty_field: "qty_bar",\n      purchase_allocation_uom: "Cây",\n    } : {}),', "aluminum tracking invariant");
  return text;
}

const builderImports = 'import { parseField } from "./lib/compile-brief.mjs";';
const builderExtraImports = `${builderImports}\nimport { GEOMETRY_FIELDS, GEOMETRY_PROFILES } from "./lib/alumdoor-geometry-catalog.mjs";\nimport { MEASUREMENT_PROFILES, measurementProfilePayload } from "./lib/alumdoor-measurement-profile-catalog.mjs";`;
const builderAnchor = '// ══════════ CHỐT CHẶN — không để G2 xảy ra lần nữa ══════════';
const builderBlock = `// ── MEASUREMENT + GEOMETRY MASTER AUTHORITY ──\n{\n  const geometryOwned = new Set(["Geometry Field", "Geometry Profile Scope", "Geometry Profile Field", "Geometry Profile"]);\n  brief.doctypes = brief.doctypes.filter((dt) => !geometryOwned.has(dt.name));\n  brief.doctypes.push(...${geometryDoctypes.toString()}());\n  const measurement = doctype("Measurement Profile");\n  const movedOut = new Set(["theoretical_kg_per_m", "effective_width_m", "kerf_mm", "scrap_threshold_m"]);\n  measurement.fields = measurement.fields.filter((field) => !movedOut.has(nameOf(field)));\n  const itemMaster = doctype("Item");\n  if (!itemMaster.fields.some((field) => nameOf(field) === "geometry_profile")) {\n    const i = itemMaster.fields.findIndex((field) => nameOf(field) === "measurement_profile");\n    const field = { fieldname: "geometry_profile", fieldtype: "Link", options: "Geometry Profile", label: "Bộ quy cách hình học" };\n    if (i >= 0) itemMaster.fields.splice(i + 1, 0, field); else itemMaster.fields.push(field);\n  }\n  const replaceTypes = new Set(["Measurement Profile", "Geometry Field", "Geometry Profile"]);\n  brief.fixtures = brief.fixtures.filter((fixture) => !replaceTypes.has(fixture.type));\n  brief.fixtures.push(\n    ...MEASUREMENT_PROFILES.map((profile) => ({ type: "Measurement Profile", name: profile.name, data: measurementProfilePayload(profile) })),\n    ...GEOMETRY_FIELDS.map((field) => ({ type: "Geometry Field", name: field.code, data: { field_code: field.code, field_name: field.name, uom: field.uom, axis: field.axis, disabled: false, _migration_source: "alumdoor-geometry-master-2026-08-16" } })),\n    ...GEOMETRY_PROFILES.map((profile) => ({ type: "Geometry Profile", name: profile.code, data: { profile_code: profile.code, profile_name: profile.name, item_groups: profile.itemGroups.map((item_group, index) => ({ row_id: \`GROUP-\${index + 1}\`, item_group })), fields: profile.fields.map((field, index) => ({ row_id: \`FIELD-\${index + 1}\`, geometry_field: field.geometryField, role: field.role, required: field.required, visible: field.visible, editable: field.editable, sequence: field.sequence })), disabled: false, _migration_source: "alumdoor-geometry-master-2026-08-16" } })),\n  );\n  for (const name of ["Geometry Field", "Geometry Profile"]) if (!brief.navigation.items.includes(name)) brief.navigation.items.push(name);\n}\nnote("MASTER · Measurement Profile chỉ đo/tồn; Geometry Field/Profile sở hữu trường hình học");\n\n`;

function patchBuilder(text) {
  text = text.replace(/brief\.version = "[^"]+";/, `brief.version = "${TARGET_VERSION}";`);
  if (!text.includes('alumdoor-geometry-catalog.mjs')) text = replaceOnce(text, builderImports, builderExtraImports, "builder imports");
  if (!text.includes('MASTER · Measurement Profile chỉ đo/tồn')) text = replaceOnce(text, builderAnchor, builderBlock + builderAnchor, "builder geometry block");
  return text;
}

const currentBrief = JSON.parse(readFileSync(briefPath, "utf8"));
const nextBrief = patchBrief(currentBrief);
const currentBuilder = readFileSync(builderPath, "utf8");
const nextBuilder = patchBuilder(currentBuilder);
const currentItemBuilder = readFileSync(itemBuilderPath, "utf8");
const nextItemBuilder = patchItemBuilder(currentItemBuilder);

if (write) {
  writeFileSync(briefPath, JSON.stringify(nextBrief, null, 2) + "\n", "utf8");
  writeFileSync(builderPath, nextBuilder, "utf8");
  writeFileSync(itemBuilderPath, nextItemBuilder, "utf8");
  console.log(`ALUMDOOR_MEASUREMENT_GEOMETRY_WRITTEN version=${TARGET_VERSION} fields=${GEOMETRY_FIELDS.length} profiles=${GEOMETRY_PROFILES.length}`);
} else {
  console.log(JSON.stringify({ version: TARGET_VERSION, measurementProfiles: MEASUREMENT_PROFILES.length, geometryFields: GEOMETRY_FIELDS.length, geometryProfiles: GEOMETRY_PROFILES.length }));
}
