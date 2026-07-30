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
brief.version = "2.0.5";
brief.locale.dateFormat = "dd/mm/yyyy"; // Q11 — chủ xưởng chốt gạch chéo
// Nỗi đau #1 của BRD: người mở app phải thấy ngay tồn KHẢ DỤNG theo khổ, không phải tự lấy tồn tổng
// rồi trừ các phiếu giữ bằng tay. Báo cáo này nằm ở query engine nền tảng vì nó đọc cùng sổ kho.
brief.links.unshift({
  report: "Tồn nhôm theo khổ",
  label: "Tồn nhôm theo khổ",
  permission: "Item",
  icon: "ruler",
  group: "Kho",
});
brief.navigation.items.unshift("report:Tồn nhôm theo khổ");
brief.home = "report:Tồn nhôm theo khổ";
note(`header: version 2.0.1 · dateFormat dd/mm/yyyy · home = Tồn nhôm theo khổ`);

// Các chứng từ V2 có controller sổ kho chuyên biệt, nhưng app hook vẫn cần khai để lớp validator
// ngành kiểm các Link/màu/quy cách trước khi lệnh đi vào kernel.
brief.validators.push(
  { doctype: "Cut Order", actions: ["create", "save", "submit", "cancel"] },
  { doctype: "Stock Reservation", actions: ["create", "save"] },
  { doctype: "Stock Reconciliation", actions: ["create", "save", "submit"] },
);

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
replaceField(pri, "color", {
  fieldname: "color",
  fieldtype: "Link",
  options: "Item Color",
  label: "Màu",
  depends_on: "eval:doc.inventory_mode == 'Nhôm cây/lá' || doc.inventory_mode == 'Tấm/Kính' || doc.inventory_mode == 'Thành phẩm theo m2'",
  mandatory_depends_on: "eval:doc.inventory_mode == 'Nhôm cây/lá' || doc.inventory_mode == 'Thành phẩm theo m2'",
});
replaceField(pri, "set_count", {
  fieldname: "set_count",
  fieldtype: "Int",
  label: "Số cái/bộ",
  default: 1,
  depends_on: "eval:doc.inventory_mode == 'Tấm/Kính' || doc.inventory_mode == 'Thành phẩm theo m2'",
  mandatory_depends_on: "eval:doc.inventory_mode == 'Tấm/Kính' || doc.inventory_mode == 'Thành phẩm theo m2'",
  non_negative: true,
  description: "Số tấm hoặc số bộ cửa thực nhận. Dùng cùng Cao × Rộng để tính tổng diện tích thực.",
});
replaceField(pri, "actual_weight_kg", {
  "//": "QĐ-2: với hàng catch weight đây là số lượng tồn thứ hai; với cửa/tấm đây là số cân để đối chiếu TL kg/m².",
  fieldname: "actual_weight_kg",
  fieldtype: "Float",
  label: "Tổng kg thực cân",
  depends_on: "eval:doc.inventory_mode == 'Nhôm cây/lá' || doc.inventory_mode == 'Tấm/Kính' || doc.inventory_mode == 'Thành phẩm theo m2'",
  mandatory_depends_on: "eval:doc.inventory_mode == 'Nhôm cây/lá'",
  non_negative: true,
  description: "Nhôm cây/lá: số kg thực nhận đi vào sổ kho. Cửa/tấm: số kg cân để đối chiếu TL thực theo m²; không bắt buộc nếu NCC không cân.",
});
replaceField(pri, "actual_kg_per_m", {
  fieldname: "actual_kg_per_m",
  fieldtype: "Float",
  label: "TL thực (kg/m)",
  read_only: true,
  depends_on: "eval:doc.inventory_mode == 'Nhôm cây/lá'",
  description: "Nhôm cây/lá: Tổng kg ÷ (chiều dài một cây × số cây/lá). Chỉ để đối chiếu, không nhập tay.",
});
addAfter(pri, "actual_kg_per_m", {
  "//": "TL theo diện tích thật, tách riêng khỏi kg/m của nhôm để không trộn hai đơn vị.",
  fieldname: "actual_kg_per_sqm",
  fieldtype: "Float",
  label: "TL thực (kg/m²)",
  read_only: true,
  depends_on: "eval:(doc.inventory_mode == 'Tấm/Kính' || doc.inventory_mode == 'Thành phẩm theo m2') && doc.actual_weight_kg > 0",
  description: "Tự tính = Tổng kg thực cân ÷ (Cao × Rộng × Số cái/bộ). Cao và Rộng nhập theo mét; kết quả chỉ để đối chiếu.",
});
pri.list = [
  "item_code", "color",
  "height_m", "width_m", "set_count",
  "length_m", "uom", "qty", "qty_bundle", "qty_bar",
  "actual_weight_kg", "actual_kg_per_m", "actual_kg_per_sqm",
  "rate", "amount", "so_no", "note",
];
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
    fieldtype: "Select",
    options: "Có\nKhông",
    label: "Dập",
    required: true,
    default: "Không",
    depends_on: "eval:doc.inventory_mode == 'Nhôm cây/lá'",
    description: "Bắt buộc chọn rõ Có hoặc Không; lưu cùng lô nhận để đối chiếu giá nhà cung cấp.",
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
      {
        "//": "Mỗi dòng có lô mẹ và kho đầu thừa riêng; đặt trên đầu phiếu làm mất quan hệ khi cắt nhiều mã/kho.",
        fieldname: "offcut_bundle",
        fieldtype: "Link",
        options: "Serial and Batch Bundle",
        label: "Bundle nhập đầu thừa",
        read_only: true,
      },
      "item_code:Link(Item)! Mã nhôm",
      { fieldname: "source_warehouse", fieldtype: "Link", options: "Warehouse", label: "Kho lô mẹ", read_only: true },
      "source_length_m:Float! Khổ cây (m)",
      "cut_width_m:Float! Rộng cắt lá (m)",
      "sheets_cut:Float! Số lá cắt",
      "cuts_count:Int Số nhát cắt",
      "kerf_total_m:Float~- Tổng kerf (m)",
      "kg_consumed:Float Kg tiêu hao",
      "kg_weighed:Float Kg cân thật lúc xuất",
      "offcut_length_m:Float~- Đầu thừa (m)",
      "scrap_m:Float Phế bỏ hẳn (m)",
      { fieldname: "stock_value_consumed_minor", fieldtype: "Int", label: "Giá trị lô đã trừ (minor)", hidden: true, read_only: true },
      { fieldname: "offcut_stock_value_minor", fieldtype: "Int", label: "Giá trị đầu thừa (minor)", hidden: true, read_only: true },
      { fieldname: "cut_product_value_minor", fieldtype: "Int", label: "Giá trị phần đã cắt (minor)", hidden: true, read_only: true },
      { fieldname: "kg_consumed_micros", fieldtype: "Int", label: "Kg tiêu hao (micros)", hidden: true, read_only: true },
      { fieldname: "offcut_weight_micros", fieldtype: "Int", label: "Kg đầu thừa (micros)", hidden: true, read_only: true },
      { fieldname: "cut_product_weight_micros", fieldtype: "Int", label: "Kg phần đã cắt (micros)", hidden: true, read_only: true },
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
      "source_doctype:Select(Work Order,Sales Order,Cut Order)! Giữ cho",
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
      { fieldname: "batch_no", fieldtype: "Link", options: "Batch", label: "Lô chụp sổ", read_only: true },
      "serial_and_batch_bundle:Link(Serial and Batch Bundle) Lô đếm được",
      "book_qty:Float~- Số sổ (chụp lúc chốt)",
      "book_weight_kg:Float~- Kg theo sổ",
      "counted_qty:Float! Số đếm thực tế",
      "counted_weight_kg:Float Kg cân thực tế",
      "variance_qty:Float~- Chênh lệch",
      "variance_weight_kg:Float~- Chênh kg",
      { fieldname: "book_qty_micros", fieldtype: "Int", label: "Số sổ (micros)", hidden: true, read_only: true },
      { fieldname: "book_weight_micros", fieldtype: "Int", label: "Kg sổ (micros)", hidden: true, read_only: true },
      { fieldname: "book_stock_value_minor", fieldtype: "Int", label: "Giá trị sổ (minor)", hidden: true, read_only: true },
      { fieldname: "variance_qty_micros", fieldtype: "Int", label: "Chênh SL (micros)", hidden: true, read_only: true },
      { fieldname: "variance_weight_micros", fieldtype: "Int", label: "Chênh kg (micros)", hidden: true, read_only: true },
      "valuation_rate:Currency Đơn giá điều chỉnh (khi lô chưa có giá)",
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

// ══════════ XOÁ THẬT quyển sổ thứ hai ══════════
// Trước đây em mới bỏ `Aluminium Lot` / `Aluminium Cut` khỏi NAVIGATION rồi tưởng xong.
// Bỏ khỏi menu ≠ bỏ khỏi hệ thống: doctype vẫn khai ⇒ bảng vẫn tạo, validator vẫn chạy,
// API vẫn nhận ghi. Quyển sổ thứ hai vẫn sống, chỉ là không có cửa vào.
const dropDoctypes = (...names) => {
  const gone = new Set(names);
  const before = brief.doctypes.length;
  brief.doctypes = brief.doctypes.filter((d) => !gone.has(d.name));
  brief.validators = (brief.validators ?? []).filter((v) => !gone.has(v.doctype));
  note(`XOÁ doctype: ${names.join(", ")} (${before} → ${brief.doctypes.length}) + validator kèm theo`);
};
dropDoctypes("Aluminium Lot", "Aluminium Cut");

// ══════════ ACTION V2 ══════════
// Compiler bắt buộc `permission` trỏ doctype CÓ KHAI, nên xoá 2 doctype trên là ba action cắt
// gãy ngay lúc compile — đúng cái ta muốn: không thể quên đổi.
const action = (n) => {
  const a = brief.actions.find((x) => x.name === n);
  if (!a) throw new Error(`không thấy action ${n}`);
  return a;
};
const cut = action("cat-nhom");
cut.permission = "Cut Order";
// Bản cũ: `voucher_no:Data!` — số chứng từ gõ tay, không trỏ đâu cả. Giờ action nhận PHIẾU thật.
cut.fields = [
  "cut_order:Link(Cut Order)! Phiếu cắt (nháp)",
];
delete cut.preview;
delete cut.resultTable;
cut.description =
  "Ghi sổ phiếu cắt nháp đã được đề xuất trước đó: trừ đúng lô mẹ, nhập lô đầu thừa và dùng các phiếu giữ chỗ gắn với lệnh. Cắt xong không nối lại được.";
for (const name of ["hoan-cat", "tra-hang"]) {
  const a = action(name);
  a.permission = "Cut Order";
  a.fields = [
    "cut_order:Link(Cut Order)! Phiếu cắt",
    "reason:Link(Lý do huỷ)! Lý do",
    "note:Small Text Diễn giải",
  ];
}
action("hoan-cat").description =
  "Chỉ dùng khi ghi nhầm: đảo nguyên trạng bút toán cắt và đầu thừa, không tính lại theo giá bình quân và không tạo phiếu cắt ngược.";
action("tra-hang").description =
  "Hàng đã cắt không thể nối lại thành lô mẹ. Tạo lô mới đúng chiều dài đã cắt và nhập bằng Phiếu kho, giữ nguyên dấu vết lô cha.";
const doc = action("doc-anh-chung-tu");
doc.permission = "Purchase Receipt"; // V2 nhận hàng là nhánh MVP, không phải đơn mua
doc.description = "AI đọc ảnh chứng từ và chỉ dựng bản NHÁP. Không bao giờ tự ghi sổ — người vẫn phải bấm duyệt.";
action("tinh-cong-thuc-cua").fields.splice(4, 0, "ray_type:Select(Ray thường,Ray âm,Ray nghiêng) Loại ray");

brief.actions.push(
  {
    "//": "Xem trước rồi mới ra phiếu — máy KHÔNG tự ghi sổ. Ra bản nháp, người bấm Cắt sau.",
    name: "de-xuat-lo-cat",
    label: "Đề xuất lô cắt",
    icon: "list-checks",
    group: "Kho",
    permission: "Cut Order",
    description: "Tìm lô đủ dài mà phế ít nhất theo mã · màu · tình trạng · khổ tối thiểu. Bỏ qua lô đang bị giữ chỗ.",
    fields: [
      "item_code:Link(Item)! Mã nhôm",
      "color:Link(Item Color) Màu (bỏ trống = mọi màu)",
      "condition:Select(Thô,Đã sơn,Lỗi) Tình trạng",
      "warehouse:Link(Warehouse)! Kho",
      "cutting_policy:Link(Cutting Policy)! Công thức cửa",
      "cut_width_m:Float! Rộng cắt lá (m)",
      "sheets:Float! Số lá cần",
      "include_offcut:Check!=(1) Xét cả kho đầu thừa",
    ],
    preview: "alumdoor.cut.propose | Xem đề xuất",
    commit: "alumdoor.cut.draft | Tạo phiếu cắt nháp",
    resultTable: "picks",
  },
  {
    "//": "Giữ chỗ theo QUY CÁCH, không khoá lô cụ thể — khoá lô là phá cơ chế chọn lô tối ưu lúc cắt.",
    name: "giu-cho",
    label: "Giữ chỗ nhôm",
    icon: "bookmark",
    group: "Kho",
    permission: "Stock Reservation",
    description: "Trừ vào tồn KHẢ DỤNG, không đụng tồn thực và không sinh bút toán. Hết hạn thì tự nhả.",
    fields: [
      "item_code:Link(Item)! Mã nhôm",
      "color:Link(Item Color) Màu",
      "condition:Select(Thô,Đã sơn,Lỗi) Tình trạng",
      "warehouse:Link(Warehouse)! Kho",
      "min_length_m:Float! Khổ tối thiểu (m)",
      "qty_reserved:Float! Số cây giữ",
      "source_doctype:Select(Sales Order,Work Order,Cut Order) Giữ cho chứng từ",
      "source_name:Data Số chứng từ",
      "expires_at:Datetime! Hết hạn giữ",
    ],
    commit: "alumdoor.reserve.create | Giữ chỗ",
  },
  {
    name: "nha-giu-cho",
    label: "Nhả giữ chỗ",
    icon: "bookmark-x",
    group: "Kho",
    permission: "Stock Reservation",
    description: "Trả lại tồn khả dụng. Nhả nhầm thì giữ lại được, nên không cần cảnh báo nặng.",
    fields: ["reservation:Link(Stock Reservation)! Phiếu giữ chỗ", "released_reason:Small Text! Lý do nhả"],
    commit: "alumdoor.reserve.release | Nhả",
  },
  {
    "//": "Chụp sổ TRƯỚC khi đếm. Chốt xong mà còn nhập/xuất thì phần đó là chênh lệch GIẢ — nên snapshot_at là mốc so, không phải lúc bấm duyệt.",
    name: "chot-so-so-kiem-ke",
    label: "Chốt số sổ để kiểm kê",
    icon: "camera",
    group: "Kho",
    permission: "Stock Reconciliation",
    description: "Chụp tồn sổ tại thời điểm bấm và điền vào phiếu. KHÔNG ghi bút toán nào.",
    fields: [
      "warehouse:Link(Warehouse)! Kho",
      "scope:Select(Toàn kho,Theo nhóm hàng,Một mặt hàng)!=(Toàn kho) Phạm vi",
      "item_group:Link(Item Group) Nhóm hàng",
      "item_code:Link(Item) Mặt hàng",
      // Người đếm lấy từ danh tính đã ký của chính người bấm; không nhận tên do client gửi.
    ],
    commit: "alumdoor.recon.snapshot | Chốt số sổ",
    resultTable: "lines",
  },
  {
    "//": "Chỉ Chủ xưởng. Bút toán điều chỉnh ghi tại `snapshot_at`, không phải lúc bấm — nếu không thì mọi phát sinh giữa hai mốc bị tính nhầm thành lệch.",
    name: "duyet-kiem-ke",
    label: "Duyệt kiểm kê",
    icon: "check-check",
    group: "Kho",
    permission: "Stock Reconciliation",
    description: "Ghi bút toán điều chỉnh cho phần chênh lệch. Mỗi dòng lệch phải có nguyên nhân mới duyệt được.",
    fields: ["reconciliation:Link(Stock Reconciliation)! Phiếu kiểm kê"],
    commit:
      "alumdoor.recon.post | Ghi sổ điều chỉnh | Bút toán điều chỉnh ghi vào ngày chốt số sổ và không sửa được — tiếp tục?",
  },
  {
    "//": "Chỉ đọc dữ liệu người gọi đã được phép mở. Nền tảng ghi ai_logs cho mọi câu trả lời thành công.",
    name: "hoi-ai",
    label: "Hỏi trợ lý",
    icon: "sparkles",
    group: "Báo cáo",
    permission: "Item",
    permissionAction: "read",
    description: "Trợ lý chỉ trả lời từ bối cảnh được cung cấp, không tự ghi chứng từ và không đoán số còn thiếu.",
    fields: [
      "question:Small Text! Câu hỏi",
      "context_doctype:Data Loại chứng từ làm bối cảnh",
      "context_name:Data Số chứng từ làm bối cảnh",
    ],
    commit: "alumdoor.ai.ask | Hỏi",
  },
  {
    name: "khoa-ky",
    label: "Khoá kỳ",
    icon: "lock-keyhole",
    group: "Cài đặt",
    permission: "Cutting Policy",
    description: "Chỉ Chủ xưởng. Chặn mọi bút toán kho có ngày nhỏ hơn hoặc bằng ngày khoá; mỗi lần đổi đều có nhật ký.",
    fields: [
      "company:Data! Công ty",
      "lock_date:Date! Khoá đến hết ngày",
      "reason:Small Text! Lý do",
    ],
    commit: "alumdoor.period.lock | Khoá kỳ | Sau khi khoá, chứng từ trong kỳ chỉ có thể ghi khi mở lại — tiếp tục?",
  },
  {
    name: "mo-ky",
    label: "Mở kỳ",
    icon: "lock-keyhole-open",
    group: "Cài đặt",
    permission: "Cutting Policy",
    description: "Chỉ Chủ xưởng. Mở lại kỳ đã khoá; bắt buộc ghi lý do và lưu nhật ký người thực hiện.",
    fields: [
      "company:Data! Công ty",
      "reason:Small Text! Lý do mở kỳ",
    ],
    commit: "alumdoor.period.unlock | Mở kỳ | Chứng từ quá khứ sẽ có thể ghi lại — tiếp tục?",
  },
);
note(`actions: ${brief.actions.length} (3 action cắt trỏ lại Cut Order, +8 mới)`);

// Khoá/mở kỳ đi qua method nền tảng và bảng `accounting_period_locks`; không dựng doctype bóng.

// ══════════ BÁO CÁO V2 ══════════
// `reports` của brief chỉ đọc doctype do app sở hữu. Báo cáo "Tồn nhôm theo khổ" đọc Batch + sổ kho
// nên đã được dựng thành platform report/view ở migration 0025 và đưa vào app bằng `links` phía trên.
// Không khai lại Batch hay sổ kho thành bảng của app.
brief.reports.push(
  {
    name: "Nhập kho theo nhà cung cấp",
    doctype: "Purchase Receipt",
    columns: ["supplier:Link(Supplier) Nhà cung cấp", "count(name):Int Số phiếu", "sum(total_qty):Float Tổng cây"],
    groupBy: "supplier",
    orderBy: "sum(total_qty) desc",
    filters: ["supplier", "posting_at"],
    icon: "truck",
    group: "Báo cáo",
  },
  {
    "//": "Nỗi đau #1 đo được: cân thực lệch cân lý thuyết bao nhiêu, theo từng mã. Không có bảng này thì 'nhôm thiếu ký' mãi là cảm giác.",
    name: "Lệch cân khi nhập",
    doctype: "Purchase Receipt Item",
    columns: [
      "item_code:Link(Item) Mã nhôm",
      "count(name):Int Số dòng",
      "sum(theoretical_kg):Float Kg lý thuyết",
      "sum(actual_weight_kg):Float Kg thực cân",
      "avg(weight_variance_pct):Float Lệch bình quân (%)",
    ],
    groupBy: "item_code",
    orderBy: "avg(weight_variance_pct) asc",
    filters: ["item_code", "warehouse"],
    icon: "scale",
    group: "Báo cáo",
  },
  {
    name: "Hao hụt khi cắt",
    doctype: "Cut Order Item",
    columns: [
      "item_code:Link(Item) Mã nhôm",
      "count(name):Int Số lần cắt",
      "sum(kg_consumed):Float Kg tiêu hao",
      "sum(kerf_total_m):Float Mạch cưa (m)",
      "sum(scrap_m):Float Phế (m)",
      "sum(offcut_length_m):Float Đầu thừa thu lại (m)",
    ],
    groupBy: "item_code",
    orderBy: "sum(scrap_m) desc",
    filters: ["item_code"],
    icon: "scissors",
    group: "Báo cáo",
  },
  {
    "//": "Giữ chỗ quên nhả làm tồn khả dụng tụt dần KHÔNG LÝ DO — hỏng im lặng, cùng họ với nỗi đau #2 nhưng ngược chiều.",
    name: "Giữ chỗ đang treo",
    doctype: "Stock Reservation",
    columns: [
      // `warehouse` chỉ là BỘ LỌC, không phải cột: gộp theo item_code thì cột không gộp là
      // câu SQL sai — compiler chặn đúng.
      "item_code:Link(Item) Mã nhôm",
      "count(name):Int Số phiếu giữ",
      "sum(qty_reserved):Float Cây đang giữ",
    ],
    groupBy: "item_code",
    orderBy: "sum(qty_reserved) desc",
    filters: ["item_code", "warehouse", "state", "expires_at"],
    icon: "bookmark",
    group: "Báo cáo",
  },
  {
    name: "Chênh lệch kiểm kê",
    doctype: "Stock Reconciliation Item",
    columns: [
      // Gộp theo NGUYÊN NHÂN, không theo mã: câu hỏi đáng tiền là "mất vì cái gì", không phải
      // "mất ở mã nào". Mã vẫn lọc được.
      "variance_reason:Link(Nguyên nhân chênh lệch) Nguyên nhân",
      "count(name):Int Số dòng lệch",
      "sum(variance_qty):Float Lệch cây",
      "sum(variance_weight_kg):Float Lệch kg",
    ],
    groupBy: "variance_reason",
    orderBy: "sum(variance_weight_kg) asc",
    filters: ["item_code", "variance_reason"],
    icon: "clipboard-check",
    group: "Báo cáo",
  },
);
note(`reports: ${brief.reports.length} (+5 báo cáo kho)`);

brief.prints.push({
  "//": "Đơn đặt hàng/nhập hàng A4 ngang gửi nhà cung cấp, đúng thứ tự cột khách đã chốt.",
  name: "Đơn nhập hàng ALUMDOOR",
  doctype: "Purchase Order",
  default: true,
  css: [
    "@page{size:A4 landscape;margin:10mm}",
    "*{box-sizing:border-box} body{font-family:'Segoe UI',Arial,sans-serif;font-size:10px;color:#111;margin:0;padding:0}",
    ".head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #9b1c1c;padding-bottom:8px;margin-bottom:10px}",
    ".brand{font-size:20px;font-weight:800;color:#9b1c1c}.sub{font-size:9px;color:#555;line-height:1.45;margin-top:2px}",
    ".title{font-size:18px;font-weight:800;text-transform:uppercase;text-align:right}.no{text-align:right;line-height:1.55;margin-top:3px}",
    ".meta{display:grid;grid-template-columns:1.2fr 1fr 1fr;gap:5px 18px;margin:9px 0 11px}.meta b{display:inline-block;min-width:92px;color:#555}",
    "table{width:100%;border-collapse:collapse;table-layout:fixed}th,td{border:1px solid #aaa;padding:4px 3px;vertical-align:middle}",
    "th{background:#f1f1f1;font-size:8px;text-transform:uppercase;text-align:center;line-height:1.25}",
    ".n{text-align:right;font-variant-numeric:tabular-nums}.c{text-align:center}.code{font-weight:700;word-break:break-word}.small{font-size:8px;color:#555}",
    ".total{display:flex;justify-content:flex-end;gap:18px;margin-top:9px;font-size:13px;font-weight:800}.total span:last-child{min-width:150px;text-align:right;color:#9b1c1c}",
    ".sign{display:flex;justify-content:space-between;text-align:center;margin-top:25px}.sign div{width:30%}.sign b{display:block;margin-bottom:45px;font-size:10px}",
    ".note{margin-top:8px;white-space:pre-wrap;color:#444}",
  ],
  html: [
    "<div class=\"head\"><div><div class=\"brand\">ALUMDOOR</div><div class=\"sub\">Đơn hàng vật tư / nhôm sản xuất</div></div>",
    "<div><div class=\"title\">Đơn đặt hàng</div><div class=\"no\">Số: {{ name }}<br>Ngày đặt: {{ transaction_date | date }}<br>Ngày giao dự kiến: {{ schedule_date | date }}</div></div></div>",
    "<div class=\"meta\"><div><b>Nhà cung cấp</b>{{ supplier }}</div><div><b>Mức độ</b>{{ priority }}</div><div><b>Tiền tệ</b>{{ currency }}</div>",
    "<div><b>Công ty</b>{{ company }}</div><div><b>Theo báo giá</b>{{ supplier_quotation }}</div></div>",
    "<table><thead><tr>",
    "<th style=\"width:24px\">STT</th><th style=\"width:105px\">Mã hàng</th><th style=\"width:48px\">Kích thước (m)</th><th style=\"width:54px\">Trọng lượng (kg/m)</th><th style=\"width:38px\">SL bó</th><th style=\"width:42px\">Số cây/lá</th><th style=\"width:54px\">Số kg barem</th><th style=\"width:50px\">Số lượng</th><th style=\"width:34px\">ĐVT</th><th style=\"width:62px\">Đơn giá</th><th style=\"width:72px\">Thành tiền</th><th style=\"width:50px\">Màu</th><th style=\"width:38px\">Dập</th><th style=\"width:55px\">Số SO NCC</th><th>Ghi chú</th>",
    "</tr></thead><tbody>",
    "{{#each items}}<tr><td class=\"c\">{{ _index }}</td><td><div class=\"code\">{{ item_code }}</div><div class=\"small\">{{ item_name }}</div></td><td class=\"n\">{{ length_m | number }}</td><td class=\"n\">{{ theoretical_kg_per_m | number }}</td><td class=\"n\">{{ qty_bundle | number }}</td><td class=\"n\">{{ qty_bar | number }}</td><td class=\"n\">{{ theoretical_kg | number }}</td><td class=\"n\">{{ qty | number }}</td><td class=\"c\">{{ uom }}</td><td class=\"n\">{{ rate | money }}</td><td class=\"n\">{{ amount | money }}</td><td class=\"c\">{{ color }}</td><td class=\"c\">{{ is_stamped }}</td><td class=\"c\">{{ so_no }}</td><td>{{ note }}</td></tr>{{/each}}",
    "</tbody></table>",
    "<div class=\"total\"><span>Tổng tiền</span><span>{{ grand_total | money }} {{ currency }}</span></div>",
    "<div class=\"sign\"><div><b>Người lập đơn</b>(ký, ghi rõ họ tên)</div><div><b>Người duyệt</b>(ký, ghi rõ họ tên)</div><div><b>Nhà cung cấp xác nhận</b>(ký, ghi rõ họ tên)</div></div>",
  ],
});
note("prints: + Đơn nhập hàng A4 ngang cho Purchase Order");

brief.prints.push({
  "//": "Biên bản kiểm kê A4: số chứng từ, QR, mọi dòng chênh lệch và ba khu ký.",
  name: "Biên bản kiểm kê kho ALUMDOOR",
  doctype: "Stock Reconciliation",
  default: true,
  css: [
    "*{box-sizing:border-box} body{font-family:'Segoe UI',Arial,sans-serif;font-size:12px;color:#111;margin:0;padding:22px}",
    ".head{display:flex;justify-content:space-between;border-bottom:2px solid #9b1c1c;padding-bottom:10px;margin-bottom:14px}",
    ".brand{font-size:21px;font-weight:800;color:#9b1c1c}.title{font-size:17px;font-weight:800;text-transform:uppercase;text-align:right}",
    ".meta{display:grid;grid-template-columns:1fr 1fr;gap:5px 24px;margin:12px 0}.meta b{display:inline-block;min-width:120px;color:#555}",
    "table{width:100%;border-collapse:collapse}th,td{border:1px solid #bbb;padding:5px 6px}th{background:#f2f2f2;font-size:10px;text-transform:uppercase}",
    ".n{text-align:right;font-variant-numeric:tabular-nums}.qr{width:74px;height:74px;margin-left:14px}",
    ".sign{display:flex;justify-content:space-between;text-align:center;margin-top:34px}.sign div{width:31%}.sign b{display:block;margin-bottom:55px}",
    ".note{margin-top:12px;white-space:pre-wrap;color:#444}",
  ],
  html: [
    "<div class=\"head\"><div><div class=\"brand\">ALUMDOOR</div><div>Biên bản kiểm kê tài sản tồn kho</div></div>",
    "<div style=\"display:flex\"><div><div class=\"title\">Biên bản kiểm kê kho</div><div>Số: {{ name }}</div></div><img class=\"qr\" alt=\"QR {{ name }}\" src=\"{{ name | qrcode }}\"></div></div>",
    "<div class=\"meta\"><div><b>Kho kiểm kê</b>{{ warehouse }}</div><div><b>Thời điểm chốt</b>{{ snapshot_at | date }}</div>",
    "<div><b>Người đếm</b>{{ counted_by }}</div><div><b>Người chứng kiến</b>{{ witnessed_by }}</div></div>",
    "<table><thead><tr><th>#</th><th>Mã hàng / lô</th><th class=\"n\">Sổ</th><th class=\"n\">Đếm</th><th class=\"n\">Chênh</th><th class=\"n\">Kg chênh</th><th>Nguyên nhân / diễn giải</th></tr></thead><tbody>",
    "{{#each items}}<tr><td>{{ _index }}</td><td>{{ item_code }}<br>{{ batch_no }}</td><td class=\"n\">{{ book_qty | number }}</td><td class=\"n\">{{ counted_qty | number }}</td><td class=\"n\">{{ variance_qty | number }}</td><td class=\"n\">{{ variance_weight_kg | number }}</td><td>{{ variance_reason }}<br>{{ variance_note }}</td></tr>{{/each}}",
    "</tbody></table><div class=\"note\">Ghi chú: {{ note }}</div>",
    "<div class=\"sign\"><div><b>Người đếm</b>(ký, ghi rõ họ tên)</div><div><b>Người chứng kiến</b>(ký, ghi rõ họ tên)</div><div><b>Thủ trưởng đơn vị</b>(ký, đóng dấu)</div></div>",
  ],
});
note("prints: + Biên bản kiểm kê A4 có QR và ba khu chữ ký");

// ══════════ CỔNG 4 — FIXTURE PHẢI THEO KỊP FIELD ══════════
// Dry-run KHÔNG bắt được nhóm này: nó biên dịch cấu trúc, không chạy validator dữ liệu.
// Ba lỗ dưới đây chỉ lộ lúc cài thật vào tenant.
const fixture = (type, name) => {
  const f = brief.fixtures.find((x) => x.type === type && x.name === name);
  if (!f) throw new Error(`không thấy fixture ${type}/${name}`);
  return f;
};

// ── G1. Chủ xưởng chốt lại ngày 30/07: nhôm nhập và tồn theo KG ──
// Số cây/lá, số bó và chiều dài là quy cách vật lý để tính barem và theo dõi nhà máy giao;
// không thay thế số lượng giao dịch. `qty` của đơn mua là kg barem, `qty` của phiếu nhập là
// số lượng thực nhận theo ĐVT mua. Vì vậy profile nhôm phải giữ stock_uom = Kg.
fixture("Measurement Profile", "Nhôm cây/lá").data.stock_uom = "Kg";
note('G1 · Measurement Profile "Nhôm cây/lá": nhập/tồn Kg; cây/lá là số lượng phụ');

// ── G2. `leaf_formula` BẮT BUỘC mà không fixture nào khai ──
// Thêm 9 trường chia lá vào Cutting Policy nhưng để nguyên 7 fixture bản cũ.
const LEAF = {
  "Cửa Đức — công thức chuẩn": { leaf_formula: "Kiểu Đức", leaf_height_deduction_m: 0.13, ray_type: "U75" },
  "Cửa Đức — đại lý": { leaf_formula: "Kiểu Đức", leaf_height_deduction_m: 0.13, ray_type: "U75" },
  "Cửa Đức — khách lẻ": { leaf_formula: "Kiểu Đức", leaf_height_deduction_m: 0.13, ray_type: "U75" },
  // Chủ xưởng chốt 30/07: 0,13 CHỈ cho cửa Đức, "nhiều cái không trừ" ⇒ các dòng khác ĐỂ TRỐNG.
  "Cửa Úc — công thức chuẩn": {
    leaf_formula: "Kiểu Úc",
    leaf_divisor_source: "Hằng số của chính sách",
    leaf_divisor_const: 0.465,
  },
  "Cửa Lưới — công thức chuẩn": { leaf_formula: "Kiểu Đài Loan Lưới" },
  "Cửa Đài Loan — công thức chuẩn": { leaf_formula: "Kiểu Đài Loan Lưới" },
  // Chủ xưởng 30/07: "cứ lấy giống cửa Đức, sửa được sau" — TẠM, không phải số đo.
  "Cửa Siêu Trường — công thức chuẩn": { leaf_formula: "Kiểu Đức" },
};
for (const [name, patch] of Object.entries(LEAF)) Object.assign(fixture("Cutting Policy", name).data, patch);
note(`G2 · Cutting Policy: seed leaf_formula cho ${Object.keys(LEAF).length}/7 chính sách (trường BẮT BUỘC, trước đó trống)`);

// ── G3. Không có kho đầu thừa thì nhánh cắt không có chỗ nhập lại ──
// Mỗi kho chính có đúng một kho đầu thừa con để việc chọn kho không mơ hồ khi có nhiều địa điểm.
fixture("Warehouse", "K36").data.stock_role = "Kho chính";
fixture("Warehouse", "K12").data.stock_role = "Kho chính";
brief.fixtures.push(
  {
    "//": "Đầu thừa của K36. Tách kho để tồn khả dụng kho chính không bị đầu thừa làm nhiễu.",
    type: "Warehouse",
    name: "K36-DT",
    data: {
      warehouse_name: "K36-DT",
      parent_warehouse: "K36",
      is_group: false,
      address: "Kho đầu thừa K36",
      stock_role: "Kho đầu thừa",
      disabled: false,
    },
  },
  {
    "//": "Đầu thừa của K12; cùng quy tắc nhưng không trộn vị trí vật lý với K36.",
    type: "Warehouse",
    name: "K12-DT",
    data: {
      warehouse_name: "K12-DT",
      parent_warehouse: "K12",
      is_group: false,
      address: "Kho đầu thừa K12",
      stock_role: "Kho đầu thừa",
      disabled: false,
    },
  },
  {
    "//": "Ngắn hơn ngưỡng, hoặc lá lỗi — bán theo kg, không quay lại sản xuất.",
    type: "Warehouse",
    name: "K0",
    data: {
      warehouse_name: "K0",
      parent_warehouse: "Kho Alumdoor",
      is_group: false,
      address: "Kho phế",
      stock_role: "Kho phế",
      disabled: false,
    },
  },
);
note("G3 · Warehouse: K36/K12 khai stock_role + mỗi kho có một kho đầu thừa con · K0 (phế)");

// ══════════ CHỐT CHẶN — không để G2 xảy ra lần nữa ══════════
// G2 lọt được vì thêm trường bắt buộc mà quên fixture, và dry-run KHÔNG bắt (nó biên dịch cấu
// trúc, không chạy validator dữ liệu). Sửa tay một lần thì lần sau vẫn lọt ⇒ viết thành luật
// chạy được, ngay trong máy sinh brief.
{
  const byName = new Map(brief.doctypes.map((d) => [d.name, d]));
  // Cắt phần KIỂU khỏi phần NHÃN. Không được `split(" ")[0]`: options của Select có dấu cách
  // ("Select(Kiểu Đức,Kiểu Úc,…)!") nên cắt theo dấu cách đầu tiên sẽ nuốt mất dấu `!` và
  // trường bắt buộc bị đọc thành không bắt buộc. Lần viết đầu em sai đúng chỗ này — chốt chặn
  // báo "không thiếu cái nào" trong khi cố tình bỏ `leaf_formula` của Cửa Úc. Chốt chặn hỏng
  // còn tệ hơn không có: nó phát tín hiệu xanh.
  const typeSpec = (s) => {
    let depth = 0;
    for (let i = 0; i < s.length; i++) {
      if (s[i] === "(") depth++;
      else if (s[i] === ")") depth--;
      else if (s[i] === " " && depth === 0) return s.slice(0, i);
    }
    return s;
  };
  const spec = (f) => {
    if (typeof f !== "string") return { name: f.fieldname, required: !!f.required, hasDefault: "default" in f };
    const colon = f.indexOf(":");
    const name = (colon < 0 ? f : f.slice(0, colon)).trim();
    const type = colon < 0 ? "" : typeSpec(f.slice(colon + 1));
    return { name, required: type.includes("!"), hasDefault: /=\(/.test(type) };
  };
  const holes = [];
  for (const fx of brief.fixtures) {
    const dt = byName.get(fx.type);
    if (!dt) continue; // doctype nền tảng — không tự kiểm được, đừng giả vờ là có
    for (const f of dt.fields ?? []) {
      const s = spec(f);
      if (s.required && !s.hasDefault && !(s.name in fx.data)) holes.push(`${fx.type}/${fx.name} thiếu "${s.name}"`);
    }
  }
  if (holes.length) {
    console.error(`\nFIXTURE THIẾU TRƯỜNG BẮT BUỘC (${holes.length}) — dry-run sẽ vẫn PASS, cài thật mới hỏng:`);
    for (const h of holes) console.error("  " + h);
    process.exit(1);
  }
  note(`chốt chặn: ${brief.fixtures.length} fixture, không cái nào thiếu trường bắt buộc`);
}

writeFileSync(OUT, JSON.stringify(brief, null, 1) + "\n", "utf8");
console.log(log.map((l) => "  " + l).join("\n"));
console.log(`\nĐã ghi ${OUT}`);
console.log(`doctypes=${brief.doctypes.length} version=${brief.version}`);
