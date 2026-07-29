/**
 * Dẫn xuất brief V2 từ brief hiện hành thay vì gõ lại 62 doctype.
 *
 * Vì sao dẫn xuất chứ không viết mới: bản cũ có nhiều thứ ĐÚNG mà V2 giữ nguyên
 * (`purchase_order` trên dòng, `link_filters` ô chọn mặt hàng, 4 trường read-only ghi lại
 * công thức đã áp, `orderOf()`...). Gõ lại là cơ hội đánh rơi chúng — đúng lỗi đã sinh ra
 * quyển sổ thứ hai: brief cũ khai đè `Stock Entry Detail` rồi làm mất `serial_and_batch_bundle`.
 *
 * Đợt này CHỈ làm nhánh NHẬP theo ưu tiên chủ xưởng ("cho cái nhập là được").
 * Nguồn: docs/brd-v2/TECHNICAL_DESIGN.md §4 (Item), §5.1 (Measurement Profile), §6 (Purchase Receipt).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(here, "../briefs/alumdoor.json");
const OUT = resolve(here, "../briefs/alumdoor-v2.json");

const brief = JSON.parse(readFileSync(SRC, "utf8"));
const log = [];
const note = (m) => log.push(m);

/** Tên field của một mục trong mảng `fields` — mục có thể là chuỗi rút gọn hoặc object. */
const nameOf = (f) => (typeof f === "string" ? f.split(":")[0].trim() : f.fieldname);
const doctype = (n) => {
  const d = brief.doctypes.find?.((x) => x.name === n) ?? brief.doctypes[n];
  if (!d) throw new Error(`Không thấy doctype ${n} trong brief nguồn`);
  return d;
};
const dropFields = (dt, names) => {
  const before = dt.fields.length;
  dt.fields = dt.fields.filter((f) => !names.includes(nameOf(f)));
  note(`${dt.name}: bỏ ${before - dt.fields.length} trường (${names.join(", ")})`);
};
const addAfter = (dt, anchor, ...items) => {
  const i = dt.fields.findIndex((f) => nameOf(f) === anchor);
  if (i < 0) throw new Error(`${dt.name}: không thấy neo "${anchor}"`);
  dt.fields.splice(i + 1, 0, ...items);
  note(`${dt.name}: thêm ${items.length} trường sau "${anchor}"`);
};
const replaceField = (dt, name, next) => {
  const i = dt.fields.findIndex((f) => nameOf(f) === name);
  if (i < 0) throw new Error(`${dt.name}: không thấy trường "${name}"`);
  dt.fields[i] = next;
  note(`${dt.name}: thay "${name}"`);
};

// ─────────────────────────── HEADER ───────────────────────────
brief.version = "2.0.0";
brief.locale.dateFormat = "dd/mm/yyyy"; // Q11 — chủ xưởng chốt gạch chéo
// Đích cuối là `report:Tồn nhôm theo khổ` (nỗi đau #1 chỉ định màn chính, BRD §7.1) — nhưng
// báo cáo đó chưa dựng ở đợt này, và compiler ĐÚNG khi từ chối `home` trỏ vào nav key không có.
// Đợt "nhánh nhập" trỏ tạm vào Phiếu nhập mua: đúng ưu tiên chủ xưởng, và là thứ đã tồn tại.
brief.home = "Purchase Receipt";
note(`header: version 2.0.0 · dateFormat dd/mm/yyyy · home = Tồn nhôm theo khổ`);

// ─────────────────────────── ITEM ───────────────────────────
const item = doctype("Item");

// QĐ-3 — khai tử biến thể. Để im là chờ người sau dùng cho màu:
// 1 mã × 24 màu × n khổ là mớ 477 mã quay lại.
dropFields(item, ["variant_of", "variant_attributes"]);

// "Luật viết hai lần rồi trôi dạt": inventory_mode khai ở CẢ Item lẫn Measurement Profile
// thì có thể mâu thuẫn (Item ghi "Nhôm cây/lá", profile ghi "Hàng thường") và không nhân nào xử được.
//
// NHƯNG xoá thẳng là gãy: ~5 trường khác (`purchase_kg_per_m2`, `min_area_sqm`, `door_type`,
// các trường quy cách trên dòng chứng từ) đều có `depends_on: doc.inventory_mode`, và `list`
// của Item cũng liệt nó. Compiler bắt đúng chỗ này.
//
// Cách đúng: giữ trường nhưng biến thành GƯƠNG — read_only + fetch_from. Một nguồn sự thật
// (Measurement Profile), một bản sao chỉ-đọc để depends_on và bộ lọc dùng. Không phải hai nguồn.
replaceField(item, "inventory_mode", {
  "//": "GƯƠNG của Measurement Profile.inventory_mode — KHÔNG sửa tay được. Nguồn sự thật là bộ quy cách.",
  fieldname: "inventory_mode",
  fieldtype: "Data",
  label: "Kiểu quản lý tồn",
  read_only: true,
  fetch_from: "measurement_profile.inventory_mode",
  in_standard_filter: true,
});
replaceField(item, "measurement_profile", {
  "//": "NGUỒN DUY NHẤT của inventory_mode sau V2. Hàng thường vẫn phải trỏ vào profile 'Hàng thường'.",
  fieldname: "measurement_profile",
  fieldtype: "Link",
  options: "Measurement Profile",
  label: "Bộ quy cách",
  required: true,
});

// QĐ-2 catch weight: nhôm ĐẾM bằng Cây/Lá, TÍNH TIỀN bằng Kg. Hai đơn vị ngang hàng.
addAfter(item, "stock_uom",
  {
    "//": "Bật = mọi dòng sổ mang HAI con số: actual_qty_micros và actual_weight_micros.",
    fieldname: "has_catch_weight",
    fieldtype: "Check",
    label: "Cân theo kiện (catch weight)",
  },
  {
    fieldname: "weight_uom",
    fieldtype: "Link",
    options: "UOM",
    label: "Đơn vị khối lượng",
    default: "Kg",
    depends_on: "eval:doc.has_catch_weight",
    mandatory_depends_on: "eval:doc.has_catch_weight",
  },
);

// Hệ số quy đổi TĨNH không diễn tả được nhôm: 1 cây = khổ × kg/m, mà khổ đổi từng lô
// (đo thật 6,57 → 8,61 m/cây). Hệ số thật bắt tại dòng phiếu nhập.
replaceField(item, "uom_conversions", {
  "//": "CẤM khai cho mặt hàng catch weight — xem docs/brd-v2/brd-entities/item.md §2.2.",
  fieldname: "uom_conversions",
  fieldtype: "Table",
  options: "UOM Conversion",
  label: "Đơn vị quy đổi khác",
  depends_on: "eval:!doc.has_catch_weight && (doc.default_purchase_uom != doc.stock_uom || doc.default_sales_uom != doc.stock_uom)",
  description: "Chỉ khai khi đơn vị mua/bán khác đơn vị tồn. Mặt hàng cân theo kiện KHÔNG dùng bảng này.",
});

// Nhóm SP thứ 6 — có trong tờ đối chiếu (CỬA ĐỨC KÉO TAY AL70, CỬA ÚC KT/MTN)
// và 25.7 QUY TRÌNH.docx cho nó công thức RIÊNG.
replaceField(item, "door_type", {
  fieldname: "door_type",
  fieldtype: "Select",
  options: "Cửa Đức\nCửa Úc\nCửa Lưới\nCửa Đài Loan\nCửa Siêu Trường\nCửa tấm liền Úc",
  label: "Loại cửa áp công thức",
  depends_on: "eval:doc.measurement_profile",
  description: "Chọn cho thành phẩm cửa. Quyết định công thức số lá và hằng số trừ khi cắt.",
});

// Nhân hỗ trợ 2 phương pháp (valuation.ts:6) nhưng brief cũ chỉ cho chọn 1.
// Và normalizeValuationMethod:18 biến mọi giá trị lạ thành FIFO trong im lặng — M4 sẽ vá.
replaceField(item, "valuation_method", {
  fieldname: "valuation_method",
  fieldtype: "Select",
  options: "FIFO\nBình quân di động",
  label: "Phương pháp giá vốn",
  default: "FIFO",
  description: "TT99/2025 cho phép mỗi nhóm hàng một phương pháp. Đổi giữa chừng phải ghi audit — thông tư đòi nhất quán giữa các kỳ.",
});

// ────────────────── MEASUREMENT PROFILE ──────────────────
const profile = doctype("Measurement Profile");
addAfter(profile, "scrap_threshold_m",
  {
    "//": "Bề rộng lưỡi cắt. Cửa 51 lá là 51 nhát — bản cũ không tính, mất ~15 cm mỗi bộ.",
    fieldname: "kerf_mm",
    fieldtype: "Float",
    label: "Bề rộng lưỡi cắt (mm)",
    default: 3,
    description: "Chuẩn ngành 2–4 mm. Trừ kerf × số nhát khỏi chiều dài dùng được.",
  },
  {
    fieldname: "weight_tolerance_pct",
    fieldtype: "Float",
    label: "Ngưỡng cảnh báo lệch cân (%)",
    default: 13,
    description: "Lấy từ sai số đo thật 6,57→8,61 m/cây. Vượt ngưỡng thì cảnh báo lúc nhập, KHÔNG chặn.",
  },
);

// ────────────────── PURCHASE RECEIPT ──────────────────
const pr = doctype("Purchase Receipt");
addAfter(pr, "note",
  {
    "//": "media-capture: nhập kho là điểm chụp BẮT BUỘC. Ảnh gắn chứng từ đã chốt là bất biến.",
    fieldname: "goods_photo",
    fieldtype: "Attach Image",
    label: "Ảnh hàng nhận",
    required: true,
  },
  { fieldname: "supplier_note_photo", fieldtype: "Attach Image", label: "Ảnh phiếu giao của NCC" },
);

const pri = doctype("Purchase Receipt Item");
addAfter(pri, "warehouse",
  {
    "//": [
      "TÊN TRƯỜNG COPY ĐÚNG CỦA NỀN TẢNG (`Stock Entry Detail.serial_and_batch_bundle`).",
      "buildTrackedStockLines đọc đúng tên này (tracking.ts:29); đặt tên khác là app tự cắt",
      "đường nối tới cơ chế lô của nền tảng — chính là gốc của quyển sổ thứ hai ở bản cũ.",
    ],
    fieldname: "serial_and_batch_bundle",
    fieldtype: "Link",
    options: "Serial and Batch Bundle",
    label: "Lô nhận (Serial/Batch Bundle)",
  },
  {
    fieldname: "condition",
    fieldtype: "Select",
    options: "Thô\nĐã sơn\nLỗi",
    label: "Tình trạng",
    depends_on: "eval:doc.inventory_mode == 'Nhôm cây/lá'",
  },
  {
    "//": "Sơn và dập là HAI chiều độc lập — 'đã sơn + chưa dập' là tổ hợp có thật trong bảng giá NCC.",
    fieldname: "is_stamped",
    fieldtype: "Check",
    label: "Đã dập",
    depends_on: "eval:doc.inventory_mode == 'Nhôm cây/lá'",
  },
  {
    fieldname: "theoretical_kg",
    fieldtype: "Float",
    label: "Kg lý thuyết (barem)",
    read_only: true,
    depends_on: "eval:doc.inventory_mode == 'Nhôm cây/lá'",
    description: "khổ × kg/m của bộ quy cách × số cây. Dùng để đối chiếu cân, không vào sổ.",
  },
  {
    fieldname: "weight_variance_pct",
    fieldtype: "Float",
    label: "Lệch cân (%)",
    read_only: true,
    depends_on: "eval:doc.inventory_mode == 'Nhôm cây/lá'",
    description: "Vượt ngưỡng của bộ quy cách thì cảnh báo, KHÔNG chặn ghi sổ.",
  },
);

// ────────────────── BATCH (doctype NỀN TẢNG) ──────────────────
// KHÔNG dựng doctype lô riêng: nền tảng đã có `Batch` (module Stock, autoname field:batch_id).
// Bản cũ đẻ `Aluminium Lot` song song — chính là quyển sổ thứ hai. V2 phủ Custom Field lên `Batch`.
//
// Ba thứ CẤM đặt ở đây, ghi lại để người sau không thêm "cho tiện":
//   remaining_qty / sheet_count / remaining_kg  → số lượng LUÔN cộng từ sổ (QĐ-1)
//   warehouse (vị trí hiện tại)                 → lô nằm hai kho cùng lúc được; đọc từ sổ
//   bất kỳ trường giá vốn nào                   → Forge không có quyền theo TRƯỜNG; đặt lên đây
//                                                 là Sản xuất đọc được ⇒ thủng phân quyền im lặng
brief.customFields = {
  Batch: [
    "color:Link(Item Color) Màu",
    "condition:Select(Thô,Đã sơn,Lỗi) Tình trạng",
    "is_stamped:Check Đã dập",
    "length_m:Float Khổ (m)",
    "intake_kg:Float Kg thực cân lúc nhập",
    "received_warehouse:Link(Warehouse) Kho nhập ban đầu",
    "is_offcut:Check Là đầu thừa",
    "parent_batch:Link(Batch) Cắt ra từ lô",
    "cut_generation:Int Đời cắt",
    "intake_note:Small Text Nhập / ghi chú",
  ],
};
note(`customFields: Batch +${brief.customFields.Batch.length} trường (không dựng doctype lô riêng)`);

// ────────────────── WAREHOUSE ──────────────────
const wh = doctype("Warehouse");
// Dạng rút gọn của brief: `field:Select(a,b,c)=(mặc định) Nhãn` — khỏi escape xuống dòng.
// Chỉ 'Kho chính' vào tồn khả dụng; đầu thừa/phế/gia công bị LOẠI (chuẩn ngành cắt thanh).
addAfter(wh, "is_group",
  "stock_role:Select(Kho chính,Kho đầu thừa,Kho phế,Kho gửi gia công)=(Kho chính) Vai trò kho");
// `keeper` là Data tự do ⇒ không scope quyền hay gửi thông báo cho ai được.
replaceField(wh, "keeper", "keeper:Link(User) Thủ kho phụ trách");

// ────────────────── SUPPLIER ──────────────────
addAfter(doctype("Supplier"), "payment_terms",
  {
    "//": "Dung sai giao hàng ±5% theo sổ yêu cầu 30/07. Khai theo NCC vì mỗi bên một thói quen.",
    fieldname: "receipt_tolerance_pct",
    fieldtype: "Float",
    label: "Dung sai nhận hàng (%)",
    default: 5,
  },
);

// ────────────────── ITEM GROUP ──────────────────
addAfter(doctype("Item Group"), "default_expense_account",
  // TT99/2025 cho phép mỗi nhóm hàng một phương pháp giá. Không có trường này thì câu
  // "Item kế thừa phương pháp từ nhóm" trong ledger là nói suông.
  "default_valuation_method:Select(FIFO,Bình quân di động) Phương pháp giá vốn mặc định",
  "default_measurement_profile:Link(Measurement Profile) Bộ quy cách mặc định",
);

// ────────────────── CUTTING POLICY ──────────────────
// Bản cũ ĐÃ ĐÚNG 14 trường (2 *_width_basis, 2 *_cut_deduction_m, butterfly, 3 *_sales_basis,
// manual_pull, purchase_formula + 2 basis, priority, disabled) — GIỮ NGUYÊN HẾT.
// Thiếu đúng hai chiều: LOẠI RAY và CHIA LÁ.
const cp = doctype("Cutting Policy");

// Sheet GHI CHÚ cho hai bộ hằng số theo ray: Đức U75 `RCL=RPBR−0,08` vs U100 `−0,09`;
// ĐL+Lưới `RLL+0,11` vs `+0,17`. Một `retail_cut_deduction_m` không diễn tả được cả hai.
// `item_group` không thay được vì loại ray là lựa chọn của TỪNG ĐƠN, không phải thuộc tính nhóm hàng.
replaceField(cp, "door_type",
  "door_type:Select(Cửa Đức,Cửa Úc,Cửa Lưới,Cửa Đài Loan,Cửa Siêu Trường,Cửa tấm liền Úc)! Loại cửa");
addAfter(cp, "door_type",
  "ray_type:Select(U75,U100,Ray sắt U70,Không dùng ray)!=(U75) Loại ray");

// Phần CHIA LÁ — bản cũ không có ở đâu cả (xác nhận trong tài liệu phiên trước).
addAfter(cp, "butterfly_cut_deduction_m",
  "height_pb_offset_m:Float=(0.5) Cao phủ bì = cao lọt lòng cộng (m)",
  "leaf_formula:Select(Kiểu Đức,Kiểu Úc,Kiểu tấm liền Úc,Kiểu Đài Loan Lưới)! Dạng công thức chia lá",
  {
    "//": [
      "0,13 CHỈ cho Cửa Đức. Các dòng khác ĐỂ TRỐNG — chủ xưởng chốt 30/07: 'nhiều cái không trừ'.",
      "Đặt 0 cũng là ĐOÁN, không hơn gì đoán 0,13. Trống thì chặn chia lá dòng đó kèm câu hỏi.",
    ],
    fieldname: "leaf_height_deduction_m",
    fieldtype: "Float",
    label: "Trừ chiều cao trước khi chia (m)",
  },
  "leaf_divisor_source:Select(Bản lá của bộ quy cách,Hằng số của chính sách)!=(Bản lá của bộ quy cách) Ước số chia lấy từ",
  "leaf_divisor_const:Float Ước số chia (hằng số) — Úc 0,465 · tấm liền Úc 0,068",
  "leaf_rounding:Select(Ngưỡng trừ-một-lá,Nấc 0-0.3-0.7-1,Làm tròn xuống)!=(Ngưỡng trừ-một-lá) Cách làm tròn số lá",
  {
    "//": [
      "Chủ xưởng chốt 30/07: TRỪ MỘT LÁ TRƯỚC, LÀM TRÒN SAU, ngưỡng 0,6 trên phần thập phân.",
      "  raw = (CPB − leaf_height_deduction_m) ÷ divisor",
      "  after = raw − 1",
      "  số lá = frac(after) >= 0,6 ? ceil(after) : floor(after)",
      "Chính thứ tự 'trừ rồi mới tròn' giải thích vì sao 52,6 ra 52 chứ không ra 53.",
      "LƯU Ý: ghi chú 'ngưỡng 20,5' trong sheet GHI CHÚ là ngưỡng TUYỆT ĐỐI trên giá trị —",
      "luật 0,6 này thắng theo lời chủ xưởng. Đừng sửa ngược khi đọc lại sheet.",
    ],
    fieldname: "leaf_round_threshold",
    fieldtype: "Float",
    label: "Ngưỡng làm tròn (phần thập phân)",
    default: 0.6,
  },
  "leaf_variants:Table(Leaf Variant) Biến thể theo loại motor (cửa Úc)",
);

// Child doctype cho 3 biến thể motor của cửa Úc: (CPB ÷ 0,465) + k, k = 2 / 1,5 / 1,3.
brief.doctypes.push({
  "//": "Cửa Úc: số lá = (CPB ÷ ước số) + addend, addend đổi theo loại motor. Làm tròn về nấc 0/0.3/0.7/1.",
  name: "Leaf Variant",
  child: true,
  label: "Biến thể chia lá",
  group: "Danh mục",
  naming: "autoincrement",
  title: "variant_label",
  list: ["variant_label", "addend"],
  fields: [
    "variant_label:Data*! Biến thể",
    "addend:Float! Cộng thêm",
    "note:Data Ghi chú",
  ],
  permissions: { "Chủ xưởng": "rwc", "Kế toán": "r", "Sản xuất": "r", "Kinh doanh": "r" },
});
note("Cutting Policy: +9 trường (ray_type, chia lá) · +doctype con Leaf Variant");

// ────────────────── D1: rate_uom — CHỐNG ĐƠN VỊ NGẦM ──────────────────
// value = qty × rate ở controllers.ts:221. qty của nhôm là số CÂY, còn NCC báo giá đ/KG.
// Nhập 200 cây / 1.200 kg / 100.000 đ/kg => ghi 20tr thay vì 120tr. Sai 6 lần, sổ vẫn cân.
// Khai rate_uom để không còn đơn vị ngầm; nhân đọc nó mà quyết nhân với qty hay với khối lượng.
addAfter(pri, "rate",
  "rate_uom:Link(UOM) ĐVT của đơn giá — mặc định theo ĐVT khối lượng nếu hàng cân theo kiện");

// ────────────────── D6: 3 danh mục FK còn thiếu ──────────────────
brief.doctypes.push(
  {
    "//": "Chip lý do khi huỷ/đảo chứng từ. screen-catalog: bước LÙI bắt buộc chọn, không cho bỏ trống.",
    name: "Lý do huỷ",
    label: "Lý do huỷ",
    icon: "circle-slash",
    group: "Danh mục",
    naming: "field:reason_code",
    title: "reason_name",
    list: ["reason_code", "reason_name", "applies_to_doctype", "disabled"],
    search: ["reason_code", "reason_name"],
    fields: [
      "reason_code:Data*! Mã lý do",
      "reason_name:Data! Tên lý do",
      "applies_to_doctype:Select(Tất cả,Phiếu nhập,Phiếu xuất,Phiếu kho,Phiếu cắt,Kiểm kê)!=(Tất cả) Áp cho chứng từ",
      "sort_order:Int=(0) Thứ tự",
      "disabled:Check Ngừng dùng",
    ],
    permissions: { "Chủ xưởng": "rwc", "Thủ kho": "r", "Kế toán": "r", "Sản xuất": "r", "Kinh doanh": "r" },
  },
  {
    "//": "TT99/2025 đòi phân loại nguyên nhân RỒI MỚI hạch toán — nên đây là danh mục, không phải ô ghi chú.",
    name: "Nguyên nhân chênh lệch",
    label: "Nguyên nhân chênh lệch",
    icon: "scale",
    group: "Danh mục",
    naming: "field:reason_code",
    title: "reason_name",
    list: ["reason_code", "reason_name", "variance_kind", "disabled"],
    search: ["reason_code", "reason_name"],
    fields: [
      "reason_code:Data*! Mã nguyên nhân",
      "reason_name:Data! Tên nguyên nhân",
      "variance_kind:Select(Thừa,Thiếu,Cả hai)!=(Cả hai) Áp cho chênh lệch",
      "sort_order:Int=(0) Thứ tự",
      "disabled:Check Ngừng dùng",
    ],
    permissions: { "Chủ xưởng": "rwc", "Thủ kho": "r", "Kế toán": "r", "Sản xuất": "r", "Kinh doanh": "r" },
  },
  {
    "//": "Thay `applies_to` Small Text. Chuỗi tự do không so khớp với nhóm hàng được nên không ép được.",
    name: "Item Color Scope",
    child: true,
    label: "Nhóm SP áp dụng",
    group: "Danh mục",
    naming: "autoincrement",
    title: "item_group",
    list: ["item_group"],
    fields: ["item_group:Link(Item Group)! Nhóm hàng"],
    permissions: { "Chủ xưởng": "rwc", "Thủ kho": "r", "Kế toán": "r", "Sản xuất": "r", "Kinh doanh": "r" },
  },
);

// Bảng màu chủ xưởng gửi ĐÃ CÓ cột "Nhóm SP áp dụng" ⇒ dữ liệu để ép tồn tại (BRD Q10).
// Sơn tĩnh điện áp 6 nhóm; mạ màu CHỈ Cửa Úc và Đài Loan.
const ic = doctype("Item Color");
replaceField(ic, "applies_to", "applies_to_groups:Table(Item Color Scope) Nhóm SP áp dụng");
// `list` phải bỏ theo: Table không hiện được trên cột danh sách, và tên cũ đã biến mất.
// Compiler bắt đúng chỗ này — cùng họ lỗi với `Item.list` trỏ `inventory_mode` đã xoá.
ic.list = ic.list.filter((c) => c !== "applies_to");
note("D6: +3 danh mục (Lý do huỷ, Nguyên nhân chênh lệch, Item Color Scope) · applies_to → bảng con");

// ══════════════ 3 CHỨNG TỪ MỚI ══════════════
const perm = { "Chủ xưởng": "rwcsxa", "Thủ kho": "rwcsxa", "Sản xuất": "rwcsxa", "Kế toán": "r" };

brief.doctypes.push(
  {
    "//": [
      "Thay `Aluminium Cut`. Ban cũ thiếu 6 thứ: không ghi sổ kho, không kg tiêu hao, không kerf,",
      "không sinh đầu thừa, một phiếu chỉ một lô, voucher_no là Data tự do.",
      "HAI bundle ngược chiều — copy khuôn `Stock Entry` mục đích Manufacture (bundle trên DÒNG",
      "cho vật tư tiêu hao + bundle trên ĐẦU PHIẾU cho thành phẩm nhập kho).",
    ],
    name: "Cut Order",
    label: "Phiếu cắt nhôm",
    icon: "scissors",
    group: "Sản xuất",
    naming: "CN-.YYYY.-#####",
    // `name` la ten ban ghi tu sinh, KHONG phai field khai — compiler tu choi. Dung field that.
    title: "so_reference",
    submittable: true,
    list: ["cut_on", "cutting_policy", "customer", "cut_state"],
    search: ["so_reference", "customer"],
    fields: [
      "cut_on:Datetime!=(Now) Thời điểm cắt",
      "cutting_policy:Link(Cutting Policy)! Công thức cửa",
      "customer:Link(Customer) Khách hàng",
      "so_reference:Data Số chứng từ đơn hàng",
      "items:Table(Cut Order Item)! Dòng cắt",
      {
        "//": "Bundle Inward ở kho Đầu thừa. Nhân tạo, người dùng không chọn.",
        fieldname: "offcut_bundle",
        fieldtype: "Link",
        options: "Serial and Batch Bundle",
        label: "Lô đầu thừa sinh ra",
        read_only: true,
      },
      "cut_state:Select(Đã cắt,Đã hoàn cắt,Đã trả hàng)!=(Đã cắt) Trạng thái",
      "cancel_reason:Link(Lý do huỷ) Lý do hoàn/trả",
      "note:Small Text Ghi chú",
    ],
    permissions: perm,
  },
  {
    name: "Cut Order Item",
    child: true,
    label: "Dòng phiếu cắt",
    group: "Sản xuất",
    naming: "autoincrement",
    title: "item_code",
    list: ["item_code", "cut_width_m", "sheets_cut", "offcut_length_m"],
    fields: [
      "serial_and_batch_bundle:Link(Serial and Batch Bundle)! Lô đem cắt (bundle Outward)",
      "item_code:Link(Item)! Mã nhôm",
      "source_length_m:Float! Khổ cây (m)",
      "cut_width_m:Float! Rộng cắt lá (m)",
      "sheets_cut:Float! Số lá cắt",
      "cuts_count:Int Số nhát cắt",
      "kerf_total_m:Float~- Tổng kerf (m)",
      "kg_consumed:Float Kg tiêu hao",
      "kg_weighed:Float Kg cân thật lúc xuất",
      "offcut_length_m:Float~- Đầu thừa (m)",
      "scrap_m:Float Phế bỏ hẳn (m)",
      "note:Data Ghi chú",
    ],
    permissions: perm,
  },
  {
    "//": "Giữ chỗ theo (mã · màu · tình trạng · KHỔ TỐI THIỂU) — KHÔNG khoá lô cụ thể, vì khoá lô là phá cơ chế chọn lô tối ưu lúc cắt.",
    name: "Stock Reservation",
    label: "Giữ chỗ tồn",
    icon: "lock",
    group: "Kho",
    naming: "GC-.YYYY.-#####",
    title: "item_code",
    list: ["item_code", "color", "min_length_m", "qty_reserved", "state"],
    search: ["item_code", "source_name"],
    fields: [
      "item_code:Link(Item)! Mã nhôm",
      "color:Link(Item Color) Màu (trống = mọi màu)",
      "condition:Select(Thô,Đã sơn,Lỗi) Tình trạng (trống = mọi tình trạng)",
      "min_length_m:Float! Khổ tối thiểu (m)",
      "warehouse:Link(Warehouse) Kho (trống = mọi kho chính)",
      "qty_reserved:Float! Số lá giữ",
      "source_doctype:Select(Production Order,Sales Order,Cut Order)! Giữ cho",
      "source_name:Data! Số chứng từ nguồn",
      "reserved_at:Datetime!=(Now) Giữ lúc",
      "expires_at:Datetime Hết hạn",
      "state:Select(Đang giữ,Đã dùng,Đã nhả,Hết hạn)!=(Đang giữ) Trạng thái",
      "released_reason:Link(Lý do huỷ) Lý do nhả",
    ],
    permissions: { "Chủ xưởng": "rwcsxa", "Kế toán": "rwc", "Thủ kho": "r", "Sản xuất": "r", "Kinh doanh": "r" },
  },
  {
    "//": "CHỤP số sổ tại snapshot_at rồi mới đếm — nếu so với sổ lúc bấm ghi thì mọi giao dịch phát sinh giữa chừng thành chênh lệch giả.",
    name: "Stock Reconciliation",
    label: "Kiểm kê kho",
    icon: "clipboard-check",
    group: "Kho",
    naming: "KK-.YYYY.-####",
    title: "warehouse",
    submittable: true,
    list: ["warehouse", "snapshot_at", "counted_by", "recon_state"],
    search: ["warehouse"],
    fields: [
      "warehouse:Link(Warehouse)! Kho kiểm kê",
      "scope:Select(Toàn kho,Theo nhóm hàng,Theo mã hàng)!=(Toàn kho) Phạm vi",
      "item_group:Link(Item Group) Nhóm hàng",
      "item_code:Link(Item) Mã hàng",
      "snapshot_at:Datetime!=(Now) Thời điểm chốt số sổ",
      "counted_by:Link(User)! Người đếm",
      "witnessed_by:Link(User) Người chứng kiến",
      "items:Table(Stock Reconciliation Item)! Dòng đếm",
      // `status` la TEN BI CHIEM — kernel tu quan (documents.status). Ban cu dung `cut_state`
      // chinh vi ly do nay; dat ten rieng theo cung quy uoc.
      "recon_state:Select(Nháp,Đang đếm,Chờ duyệt,Đã ghi sổ,Đã huỷ)!=(Nháp) Trạng thái",
      "cancel_reason:Link(Lý do huỷ) Lý do huỷ",
      "note:Small Text Ghi chú",
    ],
    permissions: { "Chủ xưởng": "rwcsxa", "Thủ kho": "rwc", "Kế toán": "rwcs", "Sản xuất": "r", "Kinh doanh": "r" },
  },
  {
    name: "Stock Reconciliation Item",
    child: true,
    label: "Dòng kiểm kê",
    group: "Kho",
    naming: "autoincrement",
    title: "item_code",
    list: ["item_code", "book_qty", "counted_qty", "variance_qty", "variance_reason"],
    fields: [
      "item_code:Link(Item)! Mã hàng",
      "serial_and_batch_bundle:Link(Serial and Batch Bundle) Lô đếm được",
      "book_qty:Float~- Số sổ (chụp lúc chốt)",
      "book_weight_kg:Float~- Kg theo sổ",
      "counted_qty:Float! Số đếm thực tế",
      "counted_weight_kg:Float Kg cân thực tế",
      "variance_qty:Float~- Chênh lệch",
      "variance_weight_kg:Float~- Chênh kg",
      "variance_reason:Link(Nguyên nhân chênh lệch) Nguyên nhân",
      "variance_note:Data Diễn giải",
      "photo:Attach Image Ảnh hiện trạng",
    ],
    permissions: { "Chủ xưởng": "rwcsxa", "Thủ kho": "rwc", "Kế toán": "rwcs", "Sản xuất": "r", "Kinh doanh": "r" },
  },
);
note("+3 chứng từ (Cut Order, Stock Reservation, Stock Reconciliation) + 2 child");

// ────────────────── NAVIGATION V2 ──────────────────
// Bỏ Aluminium Lot / Aluminium Cut cũ, thêm 3 chứng từ mới + 3 danh mục của D6.
brief.navigation.items = brief.navigation.items
  .filter((k) => !["Aluminium Lot", "Aluminium Cut"].includes(k))
  .concat(["Cut Order", "Stock Reservation", "Stock Reconciliation",
           "Lý do huỷ", "Nguyên nhân chênh lệch"]);
note(`navigation: ${brief.navigation.items.length} mục`);

// ══════════ DELIVERY NOTE — Q8: xuất kho KHÔNG cần đơn bán ══════════
const dn = doctype("Delivery Note");
// Xưởng còn xuất mẫu, xuất đổi bảo hành, xuất nội bộ — không đơn bán nào cả.
replaceField(dn, "against_sales_order", "against_sales_order:Link(Sales Order) Theo đơn hàng (nếu có)");
// `install_address` fetch_from đơn bán ⇒ bỏ bắt buộc đơn mà giữ bắt buộc địa chỉ là chặn ở cửa sau.
replaceField(dn, "install_address", {
  fieldname: "install_address",
  fieldtype: "Small Text",
  label: "Địa chỉ lắp đặt",
  fetch_from: "against_sales_order.install_address",
});
replaceField(dn, "customer", {
  fieldname: "customer",
  fieldtype: "Link",
  options: "Customer",
  label: "Khách hàng",
  fetch_from: "against_sales_order.customer",
  mandatory_depends_on: "eval:doc.issue_purpose == 'Bán hàng'",
});
addAfter(dn, "customer",
  {
    "//": "Bỏ ràng buộc đơn bán rồi thì PHẢI biết xuất để làm gì — nếu không, phiếu không đơn thành lỗ hổng không ai giải thích được.",
    fieldname: "issue_purpose",
    fieldtype: "Select",
    options: "Bán hàng\nXuất mẫu\nĐổi bảo hành\nXuất nội bộ\nXuất gia công",
    label: "Mục đích xuất",
    required: true,
    default: "Bán hàng",
    in_standard_filter: true,
  },
);
const dni = doctype("Delivery Note Item");
addAfter(dni, "warehouse",
  "serial_and_batch_bundle:Link(Serial and Batch Bundle) Lô xuất (bundle Outward)",
  "weight_kg:Float Khối lượng xuất (kg)");

// ══════════ STOCK ENTRY — bundle + điều chỉnh tồn có lý do ══════════
const se = doctype("Stock Entry");
// screen-catalog Inventory: "Không sửa trực tiếp số tồn nếu đã có lịch sử; dùng phiếu điều chỉnh".
replaceField(se, "purpose",
  "purpose:Select(Material Receipt,Material Issue,Material Transfer,Manufacture,Điều chỉnh tồn)!=(Material Receipt) Loại phiếu");
addAfter(se, "purpose",
  {
    fieldname: "adjust_reason",
    fieldtype: "Link",
    options: "Nguyên nhân chênh lệch",
    label: "Nguyên nhân điều chỉnh",
    depends_on: "eval:doc.purpose == 'Điều chỉnh tồn'",
    mandatory_depends_on: "eval:doc.purpose == 'Điều chỉnh tồn'",
  },
);
const sei = doctype("Stock Entry Item");
// TÊN COPY ĐÚNG `Stock Entry Detail` của nền tảng. Brief cũ khai đè bằng `Stock Entry Item`
// rồi ĐÁNH RƠI chính trường này — đó là gốc của quyển sổ thứ hai.
addAfter(sei, "target_warehouse",
  "serial_and_batch_bundle:Link(Serial and Batch Bundle) Lô (bundle)",
  "weight_kg:Float Khối lượng (kg)");
note("Delivery Note + Stock Entry: bundle + weight_kg + issue_purpose + adjust_reason");

writeFileSync(OUT, JSON.stringify(brief, null, 1) + "\n", "utf8");
console.log(log.map((l) => "  " + l).join("\n"));
console.log(`\nĐã ghi ${OUT}`);
console.log(`doctypes=${brief.doctypes.length} version=${brief.version}`);
