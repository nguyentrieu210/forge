export const GEOMETRY_FIELD_ROLES = Object.freeze(["INPUT", "CALCULATED", "INFO"]);

// Evidence: QUY CÁCH (3).xlsx / CT TT-SX and ĐƠN GIÁ TRỌN BỘ.
// A Geometry Field is a named physical dimension. It owns no formula.
export const GEOMETRY_FIELDS = Object.freeze([
  Object.freeze({ code: "PB_CAO", name: "Cao phủ bì", uom: "Mét", axis: "HEIGHT" }),
  Object.freeze({ code: "PB_RAY_RONG", name: "Rộng phủ bì ray", uom: "Mét", axis: "WIDTH" }),
  Object.freeze({ code: "PB_NHUA_RONG", name: "Rộng phủ bì nhựa", uom: "Mét", axis: "WIDTH" }),
  Object.freeze({ code: "CAT_LA_RONG", name: "Rộng cắt lá", uom: "Mét", axis: "WIDTH" }),
  Object.freeze({ code: "LUOI_CAO", name: "Cao lưới", uom: "Mét", axis: "HEIGHT" }),
  Object.freeze({ code: "RAY_DAI", name: "Dài ray", uom: "Mét", axis: "LENGTH" }),
  Object.freeze({ code: "V4_DAI", name: "Dài V4/V5", uom: "Mét", axis: "LENGTH" }),
  Object.freeze({ code: "TRUC_DAI", name: "Dài trục", uom: "Mét", axis: "LENGTH" }),
]);

const row = (geometryField, role, { required = false, visible = true, editable = role === "INPUT", sequence } = {}) =>
  Object.freeze({ geometryField, role, required, visible, editable, sequence });

// Geometry Profile owns only which fields a door form exposes and each field's role.
// Cutting Policy later owns formulas between these codes.
export const GEOMETRY_PROFILES = Object.freeze([
  Object.freeze({
    code: "GP-CUA-DUC",
    name: "Cửa Đức",
    itemGroups: Object.freeze(["Cửa CN Đức"]),
    fields: Object.freeze([
      row("PB_CAO", "INPUT", { required: true, sequence: 10 }),
      row("PB_RAY_RONG", "INPUT", { required: true, sequence: 20 }),
      row("PB_NHUA_RONG", "INPUT", { required: false, sequence: 30 }),
      row("CAT_LA_RONG", "CALCULATED", { sequence: 40 }),
      row("RAY_DAI", "CALCULATED", { sequence: 50 }),
      row("TRUC_DAI", "CALCULATED", { sequence: 60 }),
    ]),
  }),
  Object.freeze({
    code: "GP-CUA-UC",
    name: "Cửa Úc",
    itemGroups: Object.freeze(["Cửa tấm liền Úc"]),
    fields: Object.freeze([
      row("PB_CAO", "INPUT", { required: true, sequence: 10 }),
      row("PB_RAY_RONG", "INPUT", { required: true, sequence: 20 }),
      row("CAT_LA_RONG", "CALCULATED", { sequence: 30 }),
      row("RAY_DAI", "CALCULATED", { sequence: 40 }),
      row("TRUC_DAI", "CALCULATED", { sequence: 50 }),
    ]),
  }),
  Object.freeze({
    code: "GP-CUA-LUOI",
    name: "Cửa Lưới",
    itemGroups: Object.freeze(["Cửa Lưới"]),
    fields: Object.freeze([
      row("PB_CAO", "INPUT", { required: true, sequence: 10 }),
      row("PB_RAY_RONG", "INPUT", { required: true, sequence: 20 }),
      row("LUOI_CAO", "INPUT", { required: false, sequence: 30 }),
      row("CAT_LA_RONG", "CALCULATED", { sequence: 40 }),
      row("RAY_DAI", "CALCULATED", { sequence: 50 }),
      row("V4_DAI", "CALCULATED", { sequence: 60 }),
      row("TRUC_DAI", "CALCULATED", { sequence: 70 }),
    ]),
  }),
  Object.freeze({
    code: "GP-CUA-DAI-LOAN",
    name: "Cửa Đài Loan",
    itemGroups: Object.freeze(["Cửa Đài Loan", "Cửa Đài Loan Inox"]),
    fields: Object.freeze([
      row("PB_CAO", "INPUT", { required: true, sequence: 10 }),
      row("PB_RAY_RONG", "INPUT", { required: true, sequence: 20 }),
      row("CAT_LA_RONG", "CALCULATED", { sequence: 30 }),
      row("RAY_DAI", "CALCULATED", { sequence: 40 }),
      row("V4_DAI", "CALCULATED", { sequence: 50 }),
      row("TRUC_DAI", "CALCULATED", { sequence: 60 }),
    ]),
  }),
  Object.freeze({
    code: "GP-CUA-SIEU-TRUONG",
    name: "Cửa Siêu Trường",
    itemGroups: Object.freeze(["Cửa Siêu Trường"]),
    fields: Object.freeze([
      row("PB_CAO", "INPUT", { required: true, sequence: 10 }),
      row("PB_RAY_RONG", "INPUT", { required: true, sequence: 20 }),
      row("CAT_LA_RONG", "CALCULATED", { sequence: 30 }),
    ]),
  }),
]);

export function geometryFieldByCode(code) {
  return GEOMETRY_FIELDS.find((field) => field.code === code) ?? null;
}

export function geometryProfileByCode(code) {
  return GEOMETRY_PROFILES.find((profile) => profile.code === code) ?? null;
}

export function assertGeometryCatalog() {
  const fieldCodes = new Set(GEOMETRY_FIELDS.map((field) => field.code));
  if (fieldCodes.size !== GEOMETRY_FIELDS.length) throw new Error("Geometry Field code bị trùng");
  const profileCodes = new Set(GEOMETRY_PROFILES.map((profile) => profile.code));
  if (profileCodes.size !== GEOMETRY_PROFILES.length) throw new Error("Geometry Profile code bị trùng");
  for (const profile of GEOMETRY_PROFILES) {
    const used = new Set();
    for (const field of profile.fields) {
      if (!fieldCodes.has(field.geometryField)) throw new Error(`${profile.code}: field không tồn tại ${field.geometryField}`);
      if (!GEOMETRY_FIELD_ROLES.includes(field.role)) throw new Error(`${profile.code}: role không hợp lệ ${field.role}`);
      if (used.has(field.geometryField)) throw new Error(`${profile.code}: field lặp ${field.geometryField}`);
      used.add(field.geometryField);
    }
  }
  return true;
}
