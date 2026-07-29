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

writeFileSync(OUT, JSON.stringify(brief, null, 1) + "\n", "utf8");
console.log(log.map((l) => "  " + l).join("\n"));
console.log(`\nĐã ghi ${OUT}`);
console.log(`doctypes=${brief.doctypes.length} version=${brief.version}`);
