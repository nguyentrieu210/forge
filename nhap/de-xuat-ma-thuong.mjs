/**
 * ĐỀ XUẤT MÃ cho các mặt hàng "Hàng thường" — CHỈ IN RA + ghi file để duyệt, KHÔNG import.
 *
 * LUẬT ĐẶT MÃ theo đúng cái chủ dự án đã chốt trên 5 mã đầu:
 *   NVL-CNHUA → VT_CNHUA        tiền tố cũ (TP- / NVL- / HH- / JG_ / LK-) bị thay bằng `VT_`
 *                                phần còn lại GIỮ NGUYÊN, chỉ viết hoa và gom dấu phân cách
 *
 * Không đổi phần thân mã vì đó là thứ xưởng đọc và gọi nhau hằng ngày; đổi nó là bắt mọi người
 * học lại một bảng từ vựng mới, đúng thứ đã làm mã cũ khó dùng.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const THU_MUC = dirname(fileURLToPath(import.meta.url));
const nguon = JSON.parse(readFileSync(resolve(THU_MUC, "du-lieu/06-hang-hoa.json"), "utf8"));

const DA_CO = new Set(["VT_CNHUA", "VT_BATFE", "VT_BULON12.12", "VT_CONTAN12", "VT_BACDAN"]);

/**
 * CHỈ cắt tiền tố LOẠI (`TP` thành phẩm · `NVL` nguyên vật liệu · `HH` hàng hoá · `LK` linh kiện).
 *
 * KHÔNG cắt `JG`, `RON`, `CROMATE`… — chúng trông giống tiền tố nhưng là HÃNG (`JG-BODK` = bộ
 * điều khiển hãng JG, còn có BOSTEC và CHTAIWAN) hoặc chính TÊN MÓN (`RON-DD` = ron đáy Đức).
 * Cắt nhầm thì `JG-BODK` thành `VT_BODK` — mất tên hãng, và đụng ngay mã của hãng khác.
 */
/**
 * MÃ CHỈ DÙNG A-Z 0-9 - _ (chủ dự án chốt 2026-08-20).
 *
 * Bỏ dấu tiếng Việt và các ký tự `& + ( )`: mã là thứ người ta gõ để tìm, mà gõ đúng dấu trên
 * mọi bàn phím / mọi máy quét là điều không đảm bảo được — `VT_CON-LĂN` và `VT_CON-LAN` là hai
 * chuỗi khác nhau với máy nhưng cùng một thứ với người. TÊN HÀNG vẫn giữ đủ dấu, vì tên là thứ
 * để đọc chứ không phải để gõ.
 */
const boDau = (s) => s
  .normalize("NFD").replace(/[̀-ͯ]/g, "")
  .replace(/đ/g, "d").replace(/Đ/g, "D")
  .replace(/[&+()/]+/g, "-");

const than = (ma) => boDau(ma)
  .replace(/^(TP|NVL|HH|LK)[-_]/i, "")
  .replace(/[\s_]+/g, "-")
  .replace(/-{2,}/g, "-")
  .replace(/^-+|-+$/g, "")
  .toUpperCase();

const thuong = nguon.ban_ghi
  .filter((r) => r.payload.measurement_profile === "Hàng thường")
  .map((r) => ({ cu: r.name, moi: `VT_${than(r.name)}`, p: r.payload }))
  .sort((a, b) => (a.p.item_group + a.moi).localeCompare(b.p.item_group + b.moi, "vi"));

const dem = new Map();
for (const x of thuong) dem.set(x.moi, (dem.get(x.moi) ?? 0) + 1);
const trung = [...dem].filter(([, n]) => n > 1);

const nhom = {};
for (const x of thuong) (nhom[x.p.item_group] ??= []).push(x);

const dong = [];
for (const [g, ds] of Object.entries(nhom)) {
  dong.push(`\n### ${g}  (${ds.length} mã)\n`);
  dong.push("| Mã mới | Tên hàng | ĐVT tồn | ĐVT mua | ĐVT bán | Mã cũ |");
  dong.push("|---|---|---|---|---|---|");
  for (const x of ds) {
    dong.push(`| ${x.moi} | ${x.p.item_name} | ${x.p.stock_uom} | ${x.p.default_purchase_uom ?? ""} | ${x.p.default_sales_uom ?? ""} | ${x.cu} |${dem.get(x.moi) > 1 ? " ⚠ TRÙNG" : ""}${x.p.disabled ? " · ngừng KD" : ""}`);
  }
}
writeFileSync(resolve(THU_MUC, "de-xuat-ma-thuong.md"),
  `# Đề xuất mã — ${thuong.length} mặt hàng "Hàng thường"\n\nLuật: tiền tố cũ → \`VT_\`, phần thân giữ nguyên.\n${dong.join("\n")}\n`, "utf8");

console.log(`${thuong.length} mặt hàng · ${Object.keys(nhom).length} nhóm (đều là nhóm con)`);
console.log(`mã mới bị trùng: ${trung.length ? trung.map(([m, n]) => `${m} (${n})`).join(", ") : "0"}`);
console.log(`đụng 5 mã đã nhập: ${thuong.filter((x) => DA_CO.has(x.moi)).map((x) => x.moi).join(", ") || "0"}`);
console.log(`ngừng kinh doanh: ${thuong.filter((x) => x.p.disabled).length}`);

for (const [g, ds] of Object.entries(nhom)) {
  console.log(`\n── ${g} (${ds.length}) ──`);
  for (const x of ds.slice(0, 6)) console.log(`   ${x.moi.padEnd(28)} ${String(x.p.item_name).padEnd(30)} ${x.p.stock_uom.padEnd(5)} ← ${x.cu}`);
  if (ds.length > 6) console.log(`   … còn ${ds.length - 6} mã`);
}
console.log(`\nDanh sách đầy đủ: nhap/de-xuat-ma-thuong.md`);
