export const GEOMETRY_FIELD_ROLES = Object.freeze(["INPUT", "CALCULATED", "INFO"]);

// Evidence: QUY CÁCH (3).xlsx / CT TT-SX, ĐƠN GIÁ TRỌN BỘ và
// docs/source-data/ALUMDOOR-QUY-DOI-LOT-LONG-PHU-BI.md.
//
// Geometry Field là danh mục tên kích thước. Nó KHÔNG sở hữu công thức. `runtimeFieldname`
// chỉ là binding sang field của operational runtime khi một geometry field có một ô tương ứng
// rõ ràng trên dòng bán. Các đại lượng chỉ tồn tại trong preview/cắt (RAY_DAI/V4_DAI/TRUC_DAI)
// cố ý để trống thay vì ép cả ba vào một field `length_m` và làm sai nghĩa.
export const GEOMETRY_FIELDS = Object.freeze([
  Object.freeze({ code: "LOT_LONG_CAO", name: "Cao lọt lòng", uom: "Mét", axis: "HEIGHT", runtimeFieldname: "" }),
  Object.freeze({ code: "LOT_LONG_RONG", name: "Rộng lọt lòng", uom: "Mét", axis: "WIDTH", runtimeFieldname: "" }),
  Object.freeze({ code: "PB_CAO", name: "Cao phủ bì", uom: "Mét", axis: "HEIGHT", runtimeFieldname: "height_m" }),
  Object.freeze({ code: "PB_RAY_RONG", name: "Rộng phủ bì ray", uom: "Mét", axis: "WIDTH", runtimeFieldname: "width_pb_ray_m" }),
  Object.freeze({ code: "PB_NHUA_RONG", name: "Rộng phủ bì nhựa", uom: "Mét", axis: "WIDTH", runtimeFieldname: "width_pb_nhua_m" }),
  Object.freeze({ code: "CAT_LA_RONG", name: "Rộng cắt lá", uom: "Mét", axis: "WIDTH", runtimeFieldname: "cut_width_m" }),
  Object.freeze({ code: "LUOI_CAO", name: "Cao lưới", uom: "Mét", axis: "HEIGHT", runtimeFieldname: "mesh_height_m" }),
  Object.freeze({ code: "RAY_DAI", name: "Dài ray", uom: "Mét", axis: "LENGTH", runtimeFieldname: "" }),
  Object.freeze({ code: "V4_DAI", name: "Dài V4/V5", uom: "Mét", axis: "LENGTH", runtimeFieldname: "" }),
  Object.freeze({ code: "TRUC_DAI", name: "Dài trục", uom: "Mét", axis: "LENGTH", runtimeFieldname: "" }),
  // Không phải kích thước dài, nên đi trục OTHER — trục này có sẵn trong lược đồ, không phải bịa thêm.
  //
  // Mã viết thường trong khi cả danh mục viết HOA là CÓ CHỦ ĐÍCH: đây là tên trường mà máy tính
  // giá dùng (`billable_area_sqm` trong ngữ cảnh tính giá), không phải một mã danh mục do người
  // đặt. Đổi cho "đồng bộ" là làm hỏng 11 quy tắc BOM đang trỏ vào nó.
  //
  // Vì sao phải khai: `BOM Rule.source_field` là Link(Geometry Field), và 11 quy tắc đã trỏ vào
  // `billable_area_sqm` từ trước — ví dụ "20 CÁI/M2" ⇒ `(billable_area_sqm) × 20`. Không khai thì
  // 11 link đó treo, mà link treo trong JSON thì không có gì chặn: audit 19/08 mới lôi ra được.
  Object.freeze({ code: "billable_area_sqm", name: "Diện tích tính tiền", uom: "m2", axis: "OTHER", runtimeFieldname: "billable_area_sqm" }),
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
      row("LOT_LONG_CAO", "INPUT", { required: false, sequence: 5 }),
      row("PB_CAO", "INPUT", { required: true, sequence: 10 }),
      row("LOT_LONG_RONG", "INPUT", { required: false, sequence: 15 }),
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
      row("LOT_LONG_CAO", "INPUT", { required: false, sequence: 5 }),
      row("PB_CAO", "INPUT", { required: true, sequence: 10 }),
      row("LOT_LONG_RONG", "INPUT", { required: false, sequence: 15 }),
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
      row("LOT_LONG_CAO", "INPUT", { required: false, sequence: 5 }),
      row("PB_CAO", "INPUT", { required: true, sequence: 10 }),
      row("LOT_LONG_RONG", "INPUT", { required: false, sequence: 15 }),
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
      row("LOT_LONG_CAO", "INPUT", { required: false, sequence: 5 }),
      row("PB_CAO", "INPUT", { required: true, sequence: 10 }),
      row("LOT_LONG_RONG", "INPUT", { required: false, sequence: 15 }),
      row("PB_RAY_RONG", "INPUT", { required: true, sequence: 20 }),
      row("LUOI_CAO", "INPUT", { required: false, sequence: 30 }),
      row("CAT_LA_RONG", "CALCULATED", { sequence: 40 }),
      row("RAY_DAI", "CALCULATED", { sequence: 50 }),
      row("V4_DAI", "CALCULATED", { sequence: 60 }),
      row("TRUC_DAI", "CALCULATED", { sequence: 70 }),
    ]),
  }),
  Object.freeze({
    code: "GP-CUA-SIEU-TRUONG",
    name: "Cửa Siêu Trường",
    itemGroups: Object.freeze(["Cửa Siêu Trường"]),
    fields: Object.freeze([
      row("LOT_LONG_CAO", "INPUT", { required: false, sequence: 5 }),
      row("PB_CAO", "INPUT", { required: true, sequence: 10 }),
      row("LOT_LONG_RONG", "INPUT", { required: false, sequence: 15 }),
      row("PB_RAY_RONG", "INPUT", { required: true, sequence: 20 }),
      row("LUOI_CAO", "INPUT", { required: false, sequence: 30 }),
      row("CAT_LA_RONG", "CALCULATED", { sequence: 40 }),
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

  const runtimeFieldnames = GEOMETRY_FIELDS.map((field) => field.runtimeFieldname).filter(Boolean);
  if (new Set(runtimeFieldnames).size !== runtimeFieldnames.length) throw new Error("Geometry Field runtime_fieldname bị trùng");
  for (const runtimeFieldname of runtimeFieldnames) {
    if (!/^[a-z][a-z0-9_]*$/.test(runtimeFieldname)) throw new Error(`runtime_fieldname không hợp lệ: ${runtimeFieldname}`);
  }

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
