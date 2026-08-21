/**
 * Chạy các tầng theo thứ tự phụ thuộc.
 *
 *   node nhap/chay.mjs           → chạy hết
 *   node nhap/chay.mjs 06        → chỉ tầng 06
 *   node nhap/chay.mjs 01 02 05  → các tầng được nêu, theo đúng thứ tự đã khai ở đây
 *
 * DỪNG NGAY Ở TẦNG ĐẦU TIÊN HỎNG. Chạy tiếp sau khi một tầng nền hỏng chỉ tạo thêm tham chiếu
 * treo trên nền đã thủng — và lúc báo cáo thì không còn phân biệt được lỗi gốc với lỗi kéo theo.
 */

import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const THU_MUC = dirname(fileURLToPath(import.meta.url));

const TANG = [
  ["01", "01-nhom-hang.mjs", "Nhóm hàng"],
  ["02", "02-dvt.mjs", "Đơn vị tính"],
  ["03", "03-be-mat.mjs", "Bề mặt"],
  ["04", "04-mau-sac.mjs", "Màu sắc"],
  ["05", "05-quy-cach-do.mjs", "Quy cách đo"],
  ["06", "06-hang-hoa.mjs", "Hàng hoá"],
  ["07", "07-bac-dien-tich.mjs", "Bậc diện tích"],
  ["08", "08-bang-gia.mjs", "Bảng giá"],
  ["09", "09-quy-cach-vat-lieu.mjs", "Quy cách vật liệu"],
  ["10", "10-vat-tu-tay.mjs", "Vật tư nhập tay"],
];

const chon = process.argv.slice(2);
const canChay = chon.length ? TANG.filter(([so]) => chon.includes(so)) : TANG;

if (chon.length && canChay.length !== chon.length) {
  const co = TANG.map(([so]) => so);
  throw new Error(`Tầng không có: ${chon.filter((s) => !co.includes(s)).join(", ")} (có: ${co.join(", ")})`);
}

const xong = [];
for (const [so, tep, nhan] of canChay) {
  console.log(`\n═══ ${so} · ${nhan} ═══`);
  const kq = spawnSync(process.execPath, [resolve(THU_MUC, tep)], { stdio: "inherit" });
  if (kq.status !== 0) {
    console.error(`\nDỪNG: tầng ${so} (${nhan}) hỏng. Các tầng sau không chạy.`);
    console.error(`Đã xong trước đó: ${xong.length ? xong.join(", ") : "(chưa tầng nào)"}`);
    process.exit(kq.status ?? 1);
  }
  xong.push(so);
}

console.log(`\n═══ XONG ${xong.length}/${canChay.length} tầng: ${xong.join(", ")} ═══`);
