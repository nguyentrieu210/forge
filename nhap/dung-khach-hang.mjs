/**
 * KHÁCH HÀNG và NHÀ CUNG CẤP từ sheet DANH MỤC của `MS LIÊN BS.xlsx`.
 *
 * Cột `KH/NCC` phân loại sẵn: KH (253) · KH LẺ (5) · NCC (8) · NV (1) · để trống (120).
 *
 * NHÓM GIÁ suy từ cột đó, và đây là ô BẮT BUỘC trên khách hàng:
 *    "KH LẺ"  → Lẻ        · "KH" → Đại lý
 * Cách đọc này khớp với cách xưởng làm ăn: khách thường xuyên là ĐẠI LÝ, còn bán lẻ là ngoại lệ
 * nên mới phải ghi rõ chữ "LẺ". Năm dòng KH LẺ đều có chữ "KHÁCH LẺ" trong chính tên.
 *
 * 120 DÒNG ĐỂ TRỐNG LOẠI thì KHÔNG nhập — không biết đại lý hay lẻ mà nhóm giá là ô bắt buộc,
 * đoán sai là tính sai tiền cho 120 khách. Ghi ra tệp riêng để chủ xưởng phân loại.
 *
 * `NV` là nhân viên, không phải khách — bỏ.
 *
 * CHẠY:  node nhap/dung-khach-hang.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const THU_MUC = dirname(fileURLToPath(import.meta.url));
const NGUON = "alumdoor-khach-hang-2026-08-20";

const dong = JSON.parse(readFileSync(resolve(THU_MUC, "du-lieu/25-khach-tho.json"), "utf8")).dong;

/** Nhóm nhà cung cấp suy từ TÊN — vận tải/logistics là chuyển, tôn/nhôm là vật liệu. */
const nhomNCC = (ten) => {
  const t = ten.toUpperCase();
  if (/VẬN TẢI|LOGISTIC/.test(t)) return "Vận chuyển";
  if (/TÔN|NHÔM/.test(t)) return "Nhôm";
  if (/SƠN/.test(t)) return "Sơn";
  if (/BỌ|PHỤ KIỆN/.test(t)) return "Phụ kiện";
  return "Khác";
};

const khach = [], ncc = [], chuaRo = [];
for (const d of dong) {
  const loai = d.loai.toUpperCase();
  if (loai === "NV") continue;
  if (!loai) { chuaRo.push(d); continue; }

  if (loai === "NCC") {
    ncc.push({
      name: d.ten,
      payload: {
        supplier_name: d.ten, supplier_group: nhomNCC(d.ten),
        ...(d.phu_trach ? { contact_person: d.phu_trach } : {}),
        /**
         * Dung sai nhận hàng: code để sẵn mặc định 5% riêng cho Tiến Đạt, nên khai đúng con số
         * đó cho họ và để trống cho nhà cung cấp khác — trống nghĩa là 0, tức nhận đủ mới tính.
         */
        ...(/TIẾN ĐẠT/i.test(d.ten) ? { receipt_tolerance_pct: 5 } : {}),
        note: `Nhập từ sheet DANH MỤC, cột KH/NCC = "${d.loai}".`,
        disabled: false, _migration_source: NGUON,
      },
      title: d.ten, content: d.ten,
    });
    continue;
  }

  khach.push({
    name: d.ten,
    payload: {
      customer_name: d.ten,
      price_group: loai.includes("LẺ") ? "Lẻ" : "Đại lý",
      ...(d.phu_trach ? { contact_person: d.phu_trach } : {}),
      note: `Nhập từ sheet DANH MỤC, cột KH/NCC = "${d.loai}", người phụ trách "${d.phu_trach}".`,
      disabled: false, _migration_source: NGUON,
    },
    title: d.ten, content: d.ten,
  });
}

writeFileSync(resolve(THU_MUC, "du-lieu/25-khach-hang.json"), JSON.stringify({
  doctype: "Customer", so_ban_ghi: khach.length, nguon: NGUON, ban_ghi: khach,
}, null, 1), "utf8");
writeFileSync(resolve(THU_MUC, "du-lieu/25-nha-cung-cap.json"), JSON.stringify({
  doctype: "Supplier", so_ban_ghi: ncc.length, nguon: NGUON, ban_ghi: ncc,
}, null, 1), "utf8");
writeFileSync(resolve(THU_MUC, "du-lieu/25-chua-ro-loai.json"), JSON.stringify({
  ghi_chu: "Sheet DANH MỤC để TRỐNG cột KH/NCC cho những dòng này. Nhóm giá (Đại lý / Lẻ) là ô bắt buộc và quyết định cách tính tiền, nên KHÔNG đoán. Chủ xưởng phân loại rồi nhập sau.",
  so_dong: chuaRo.length, dong: chuaRo,
}, null, 1), "utf8");

const nhom = {};
for (const k of khach) nhom[k.payload.price_group] = (nhom[k.payload.price_group] ?? 0) + 1;
console.log(`${dong.length} dòng nguồn\n`);
console.log(`  khách hàng     ${String(khach.length).padStart(4)}   ${Object.entries(nhom).map(([k, v]) => `${k}=${v}`).join(" · ")}`);
console.log(`  nhà cung cấp   ${String(ncc.length).padStart(4)}   ${[...new Set(ncc.map((n) => n.payload.supplier_group))].join(" · ")}`);
console.log(`  chưa rõ loại   ${String(chuaRo.length).padStart(4)}   KHÔNG nhập → du-lieu/25-chua-ro-loai.json`);
console.log(`  nhân viên         1   bỏ`);
console.log("\n8 nhà cung cấp:");
for (const n of ncc) console.log(`   ${n.name.padEnd(36)}${n.payload.supplier_group.padEnd(12)}${n.payload.contact_person ?? ""}${n.payload.receipt_tolerance_pct ? `   dung sai ${n.payload.receipt_tolerance_pct}%` : ""}`);
