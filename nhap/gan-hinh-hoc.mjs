/**
 * GẮN `Item.geometry_profile` cho các mã cửa tính theo m².
 *
 * BÀI TOÁN
 * `sales-item-context.ts` đọc `item.geometry_profile` THẲNG trên Item (dòng ~698,
 * `normalizedText(item.geometry_profile)`) — không tự suy qua `item_group`. 51/227 mã có
 * `inventory_mode = "Thành phẩm theo m2"`, và 0/51 có `geometry_profile`. Script này gắn nốt
 * mắt xích đó bằng chính hai nguồn đã có sẵn trong D1, KHÔNG bịa luật mới:
 *
 *   ① `Cutting Policy.door_type → Cutting Policy.geometry_profile`  (ưu tiên — đây là chỗ
 *      công thức cắt thật sự sống, do `nhap/dung-cong-thuc-cua.mjs` dựng ngày 20/08).
 *   ② `item_group ∈ Geometry Profile.item_groups`                   (dự phòng khi ① không
 *      khớp — vd. `door_type` để trống, hoặc mang một nhãn không trùng tên chính sách nào).
 *
 * Nếu ① và ② cùng khớp mà RA HAI geometry profile khác nhau, hoặc cả hai đều không khớp được
 * cái nào — KHÔNG đoán, liệt kê riêng để chủ xưởng quyết.
 *
 * CẢNH BÁO CƠ CHẾ — ĐỌC TRƯỚC KHI CHẠY --that
 * Trường `geometry_profile` hiện KHÔNG có trong metadata của doctype Item (đã kiểm tra
 * `doctype_definitions` cả tenant `demo` lẫn `__standard__` — 35 trường, không trường nào tên
 * `geometry_profile`). Sao lưu `nhap/.sao-luu/d1-truoc-XOA-geometry_profile-2026-08-20T18-09-43-912Z.sqlite`
 * cho thấy trường này CÓ tồn tại lúc revision 13 (ngay sau khi `xep-lai-o-hinh-hoc.mjs` xếp nó
 * cạnh `door_type`), rồi bị một thao tác khác xoá khỏi metadata 2 phút sau, đưa revision lên 14
 * — là trạng thái hiện tại. Không rõ script nào đã xoá (không còn file trong `nhap/`, không có
 * commit git nào ghi lại — D1 không nằm trong git).
 *
 * Hệ quả: ghi `payload_json.geometry_profile` bằng SQL thẳng (như script này làm) vẫn ĐỌC ĐƯỢC
 * bình thường ở `sales-item-context.ts` (đọc JSON trực tiếp, không qua metadata). NHƯNG
 * `generic-controller.ts` → `normalizeDocument()` có đoạn xử lý riêng cho "trường đã bị rút
 * khỏi metadata mà tài liệu cũ còn mang giá trị": chấp nhận giá trị CŨ không đổi rồi ÂM THẦM BỎ
 * nó ra khỏi tài liệu chuẩn hoá mới. Nói cách khác: mở một trong 51 mã này trên giao diện rồi
 * bấm Lưu (kể cả không đụng gì đến hình học) sẽ xoá sạch `geometry_profile` vừa gắn, đưa hệ
 * thống về lại 0/51 — không có lỗi nào hiện ra khi việc đó xảy ra.
 *
 * Script này KHÔNG tự thêm lại trường vào metadata (đó là đổi cấu trúc doctype, không phải
 * việc của script gắn dữ liệu, và không nằm trong việc được giao). Ghi dữ liệu xong, muốn nó
 * SỐNG QUA LƯỢT LƯU TIẾP THEO thì phải thêm `geometry_profile` trở lại `Item.fields` trong
 * `doctype_definitions` — mẫu định nghĩa đúng (Link → Geometry Profile, đặt cạnh
 * `measurement_profile` trong khu "Đơn vị và theo dõi") đã có sẵn ở
 * `server/briefs/alumdoor-v2.json` dòng ~5233.
 *
 * Runtime PHẢI TẮT.  CHẠY:  node nhap/gan-hinh-hoc.mjs [--that]
 */
import { DatabaseSync } from "node:sqlite";
import { copyFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const GOC = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const D1 = resolve(GOC, "server/apps/tenant-worker/.wrangler/state/v3/d1/miniflare-D1DatabaseObject/0f70e06fc007ec84591c21ca1daaf09474ca2074a0d42ba21eb2a3fcdbb2cdf8.sqlite");
const THAT = process.argv.includes("--that");
const TENANT = "demo";

const db = new DatabaseSync(D1, THAT ? {} : { readOnly: true });

const layDoc = (doctype) => db.prepare("SELECT name, payload_json FROM documents WHERE tenant_id=? AND doctype=?").all(TENANT, doctype)
  .map((r) => ({ name: r.name, payload: JSON.parse(r.payload_json) }));

// ── ① Cutting Policy: door_type → geometry_profile ───────────────────────────────────────
const chinhSach = layDoc("Cutting Policy");
const theoLoaiCua = new Map();
for (const cs of chinhSach) {
  const loai = cs.payload.door_type, gp = cs.payload.geometry_profile;
  if (!loai || !gp) continue;
  if (theoLoaiCua.has(loai) && theoLoaiCua.get(loai) !== gp) {
    throw new Error(`Cutting Policy mâu thuẫn ngay trong danh mục: door_type "${loai}" trỏ cả ${theoLoaiCua.get(loai)} lẫn ${gp} — sửa danh mục trước khi chạy script này.`);
  }
  theoLoaiCua.set(loai, gp);
}

// ── ② Geometry Profile: item_group → geometry_profile (mỗi nhóm hàng chỉ được khai 1 nơi) ──
const boHinhHoc = layDoc("Geometry Profile");
const tenGpHopLe = new Set(boHinhHoc.map((g) => g.name));
const theoNhomHang = new Map();
const nhomHangTrungLap = new Set();
for (const gp of boHinhHoc) {
  for (const ig of gp.payload.item_groups ?? []) {
    const nhom = ig.item_group;
    if (!nhom) continue;
    if (theoNhomHang.has(nhom) && theoNhomHang.get(nhom) !== gp.name) nhomHangTrungLap.add(nhom);
    theoNhomHang.set(nhom, gp.name);
  }
}

if (nhomHangTrungLap.size) {
  console.log("⚠ nhóm hàng được khai trong NHIỀU Geometry Profile — bỏ đường item_group cho các nhóm này:");
  for (const n of nhomHangTrungLap) console.log(`   ${n}`);
  console.log("");
}

// ── ③ Mặt hàng cần gắn: is_sales_item + Thành phẩm theo m2 ───────────────────────────────
const laTrue = (v) => v === true || v === 1 || v === "1";
const items = layDoc("Item").filter((it) => laTrue(it.payload.is_sales_item) && it.payload.inventory_mode === "Thành phẩm theo m2");

const ganDuoc = [], mauThuan = [], khongKhop = [], gpKhongTonTai = [];
for (const it of items) {
  const loai = it.payload.door_type, nhom = it.payload.item_group;
  const quaLoaiCua = loai ? theoLoaiCua.get(loai) : undefined;
  const quaNhomHang = nhom && !nhomHangTrungLap.has(nhom) ? theoNhomHang.get(nhom) : undefined;

  if (quaLoaiCua && quaNhomHang && quaLoaiCua !== quaNhomHang) {
    mauThuan.push({ ma: it.name, door_type: loai, item_group: nhom, quaLoaiCua, quaNhomHang });
    continue;
  }
  const ket = quaLoaiCua ?? quaNhomHang;
  if (!ket) {
    khongKhop.push({ ma: it.name, door_type: loai || "(trống)", item_group: nhom || "(trống)" });
    continue;
  }
  if (!tenGpHopLe.has(ket)) {
    gpKhongTonTai.push({ ma: it.name, gp: ket });
    continue;
  }
  const nguon = quaLoaiCua ? "door_type → Cutting Policy" : "item_group → Geometry Profile (door_type không khớp chính sách nào)";
  const daDung = it.payload.geometry_profile === ket;
  ganDuoc.push({ ma: it.name, item: it, gp: ket, nguon, daDung });
}

// ── báo cáo ────────────────────────────────────────────────────────────────────────────
console.log(`${THAT ? "GHI THẬT" : "chạy thử (thêm --that để ghi)"}\n`);
console.log(`Tổng mã "Thành phẩm theo m2": ${items.length}`);
console.log(`Gắn được: ${ganDuoc.length}  |  Mâu thuẫn hai đường: ${mauThuan.length}  |  Không khớp cái nào: ${khongKhop.length}  |  GP không tồn tại: ${gpKhongTonTai.length}\n`);

const theoGp = new Map();
for (const g of ganDuoc) theoGp.set(g.gp, (theoGp.get(g.gp) ?? 0) + 1);
console.log("── theo Geometry Profile ──");
for (const [gp, n] of [...theoGp].sort()) console.log(`   ${gp.padEnd(20)}${n} mã`);

const quaItemGroupFallback = ganDuoc.filter((g) => g.nguon.startsWith("item_group"));
if (quaItemGroupFallback.length) {
  console.log(`\n── khớp qua item_group (door_type không khớp Cutting Policy nào) — ${quaItemGroupFallback.length} mã ──`);
  for (const g of quaItemGroupFallback) {
    console.log(`   ${g.ma.padEnd(28)}door_type=${JSON.stringify(g.item?.payload.door_type ?? "")}  item_group=${g.item.payload.item_group}  → ${g.gp}`);
  }
}

console.log("\n── danh sách đầy đủ mã gắn được ──");
for (const g of ganDuoc) {
  console.log(`   ${g.ma.padEnd(28)}${g.gp.padEnd(20)}${g.daDung ? "(đã đúng, bỏ qua)" : ""}`);
}

if (mauThuan.length) {
  console.log("\n── MÂU THUẪN — hai đường ra hai geometry profile khác nhau, CẦN CHỦ XƯỞNG QUYẾT ──");
  for (const m of mauThuan) console.log(`   ${m.ma.padEnd(28)}door_type=${m.door_type} → ${m.quaLoaiCua}   |   item_group=${m.item_group} → ${m.quaNhomHang}`);
}
if (khongKhop.length) {
  console.log("\n── KHÔNG KHỚP CÁI NÀO — CẦN CHỦ XƯỞNG QUYẾT ──");
  for (const k of khongKhop) console.log(`   ${k.ma.padEnd(28)}door_type=${k.door_type}   item_group=${k.item_group}`);
}
if (gpKhongTonTai.length) {
  console.log("\n── Cutting Policy trỏ tới Geometry Profile không tồn tại ──");
  for (const g of gpKhongTonTai) console.log(`   ${g.ma.padEnd(28)}→ ${g.gp}`);
}

console.log(`
⚠ NHẮC LẠI: trường \`geometry_profile\` hiện KHÔNG có trong metadata Item (xem chú thích đầu
  file). Ghi xong, giá trị chỉ sống được tới lượt người dùng đầu tiên mở mã đó trên giao diện và
  bấm Lưu — lúc đó \`generic-controller.ts\` sẽ âm thầm loại nó ra vì không còn là trường khai
  báo. Cần thêm lại trường vào \`doctype_definitions\` (định nghĩa mẫu ở
  server/briefs/alumdoor-v2.json ~dòng 5233) để việc gắn này bền qua các lượt lưu sau.`);

const canGhi = ganDuoc.filter((g) => !g.daDung);
if (!THAT) {
  console.log(`\n(chạy thử — ${canGhi.length} mã sẽ được ghi nếu thêm --that; ${ganDuoc.length - canGhi.length} mã đã đúng sẵn)`);
  db.close();
  process.exit(0);
}

if (!canGhi.length) {
  console.log("\nKhông có gì để ghi (mọi mã đã đúng sẵn).");
  db.close();
  process.exit(0);
}

mkdirSync(resolve(GOC, "nhap/.sao-luu"), { recursive: true });
const duongSaoLuu = resolve(GOC, "nhap/.sao-luu", `d1-truoc-GAN-HINH-HOC-${new Date().toISOString().replace(/[:.]/g, "-")}.sqlite`);
copyFileSync(D1, duongSaoLuu);

const capNhat = db.prepare("UPDATE documents SET payload_json=?, modified_at=?, modified_by=?, version=version+1 WHERE tenant_id=? AND doctype='Item' AND name=?");
const luc = new Date().toISOString();
db.exec("BEGIN");
try {
  for (const g of canGhi) {
    const payloadMoi = { ...g.item.payload, geometry_profile: g.gp };
    capNhat.run(JSON.stringify(payloadMoi), luc, "gan-hinh-hoc", TENANT, g.ma);
  }
  db.exec("COMMIT");
} catch (loi) {
  db.exec("ROLLBACK");
  db.close();
  throw loi;
}
db.close();
console.log(`\n✓ đã ghi ${canGhi.length} mã. Sao lưu: ${duongSaoLuu}`);
