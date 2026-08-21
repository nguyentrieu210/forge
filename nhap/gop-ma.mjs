/**
 * GỘP MÃ — rút màu, bề mặt, bậc kích thước và MSK ra khỏi mã hàng.
 *
 * VÌ SAO LÀM TRƯỚC KHI NHẬP, KHÔNG PHẢI SAU
 * Gộp mã sau khi mã đã vào D1 kèm giá/định mức/lịch sử là migration không lùi được: phải dời
 * giá, dời định mức, dời lịch sử bán, rồi mới cho mã cũ nghỉ hưu. Hiện D1 chưa có mặt hàng nào
 * nên gộp chỉ là phép biến đổi lúc dựng — cửa sổ này đóng lại ngay khi tầng 06 chạy lần đầu.
 *
 * CÁI GÌ RA, CÁI GÌ Ở LẠI
 * Tiêu chí không phải "rút hết thuộc tính", mà là: thuộc tính này có làm đổi THỨ ĐANG NẰM
 * TRONG KHO không.
 *
 *   RA   màu (XN-VK, GS, VK…)   cùng một thanh nhôm, sơn xong đổi màu — Paint Job lo việc đó
 *   RA   bề mặt (THÔ, STĐ)      là thuộc tính của chính bản ghi màu, không phải trục riêng
 *   RA   bậc kích thước         thuộc dòng giá, không thuộc mặt hàng
 *   RA   MSK                    "các màu được phép trừ màu đã khai giá" — một phép trừ,
 *                               không phải một màu; thuộc chính sách giá
 *   Ở LẠI  TRỌN BỘ / TÁCH MÓN   giao 5 cấu phần khác giao 1 cấu phần: hai thứ khác nhau
 *   Ở LẠI  độ dày, khẩu độ      mua riêng, tồn riêng, giá riêng
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { maChuan } from "./lib/ma-chuan.mjs";

const THU_MUC = dirname(fileURLToPath(import.meta.url));
const vao = resolve(THU_MUC, "du-lieu/06-hang-hoa.truoc-gop.json");

/**
 * Mỗi màu ghi hai cách trở lên trong nguồn. Chuẩn hoá ở ĐÂY chứ không sửa nguồn: nguồn là bản
 * ghi lịch sử của xưởng, còn đây là chỗ dịch sang tên trong danh mục.
 *
 * XLC = XÁM LÔNG CHUỘT theo nguồn (T5.2026 dòng 106/117 viết cùng một khuôn câu, một bên tắt
 * một bên đủ; Trang tính29 dòng 6 giải mã TRXLC). Nếu xưởng gọi XLC là xanh lá cây thì sửa ở
 * dòng này, đừng để hai nghĩa cùng sống.
 */
const MAU_DON = {
  XN: "XANH NGỌC", VK: "VÀNG KEM", XLC: "XÁM LÔNG CHUỘT", XR: "XANH RÊU",
  CF: "CAFÉ", CAFE: "CAFÉ", GU: "GHI ÚC", KU: "KEM ÚC", TR: "TRẮNG", "TRẮNG": "TRẮNG",
  GS: "GHI SẦN",
};

/** Màu mạ hai mặt là MỘT màu trong danh mục (quy-cach/MS.md: 5 dòng "Mạ màu"), không phải hai. */
const MAU_GHEP = {
  "VÀNG KEM+XANH NGỌC": "XANH NGỌC - VÀNG KEM",
  "TRẮNG+XÁM LÔNG CHUỘT": "XÁM - TRẮNG",
  "GHI ÚC+KEM ÚC": "GHI ÚC - KEM ÚC",
  "CAFÉ+XANH RÊU": "XANH RÊU - CAFÉ",
  "XANH NGỌC+XÁM LÔNG CHUỘT": "XÁM - XANH NGỌC",
};

const BE_MAT = { STD: "THÔ_KHONG", "STĐ": "SƠN TĨNH ĐIỆN", THO: "THÔ", "THÔ": "THÔ" };
// STD và STĐ là một chữ mất dấu; cả hai đều là sơn tĩnh điện.
BE_MAT.STD = "SƠN TĨNH ĐIỆN";

const nguon = JSON.parse(readFileSync(vao, "utf8"));

const anhXa = [];
const gom = new Map();

for (const r of nguon.ban_ghi) {
  const maCu = r.payload.item_code;
  let c = maCu;
  let cachBan = null, bac = null, msk = false;
  const mau = [], beMat = [];

  c = c.replace(/[_\s]*-?\s*(TRONBO|TACHMON)\b/gi, (_m, g) => { cachBan = g.toUpperCase(); return ""; });
  c = c.replace(/_?(>\d+m²|<\d+m²|\d+-\d+m²)/gi, (_m, g) => { bac = g; return ""; });
  c = c.replace(/[_\s-]MSK\b/gi, () => { msk = true; return ""; });

  c = c.split(/[-_\s]+/).filter((t) => {
    const k = t.trim().toUpperCase();
    if (MAU_DON[k]) { mau.push(MAU_DON[k]); return false; }
    if (BE_MAT[k]) { beMat.push(BE_MAT[k]); return false; }
    return t.trim() !== "";
  }).join("-");

  if (cachBan) c += "-" + cachBan;
  const maMoi = c.replace(/-+/g, "-").replace(/^-|-$/g, "");

  // Hai màu đứng cạnh nhau trong mã = một màu mạ, tra bảng ghép. Sắp xếp trước khi tra vì
  // nguồn viết cả GU-KU lẫn KU-GU cho cùng một thứ.
  let mauCuoi = null;
  if (mau.length === 2) mauCuoi = MAU_GHEP[[...mau].sort().join("+")] ?? mau.join(" + ");
  else if (mau.length === 1) mauCuoi = mau[0];
  if (!mauCuoi && beMat.includes("THÔ")) mauCuoi = "THÔ";

  anhXa.push({ ma_cu: maCu, ma_moi: maMoi, mau: mauCuoi, be_mat: beMat[0] ?? null, bac, msk });

  if (!gom.has(maMoi)) gom.set(maMoi, []);
  gom.get(maMoi).push(r);
}

// Nhiều mã cũ về một mã mới thì mọi trường CÒN LẠI phải khớp — nếu không, phép gộp đang trộn
// hai thứ khác nhau và phải dừng, không phải chọn bừa một bản.
const TRUONG_PHAI_KHOP = ["item_group", "stock_uom", "default_purchase_uom", "default_sales_uom",
  "measurement_profile", "item_nature", "material_stage", "supply_type"];
const lech = [];
const banGhiMoi = [];

/**
 * TRẢ LẠI DẤU cho những tên xưởng gõ dính liền không dấu.
 *
 * Đây KHÔNG phải lỗi của bộ nhập: nguồn `ĐM.md` viết đúng như vậy ở cột tên. Nhưng chính nguồn
 * cũng tự giải mã ở dòng 550 — `Daydien_phimamtuongcoday` / `NVL_Daydien_PATCD` đứng cạnh
 * `PHÍM ÂM TƯỜNG CÓ DÂY` viết đủ dấu. Nên đây là chép lại nghĩa nguồn đã nói, không phải đoán.
 *
 * Sửa ở ĐÂY chứ không sửa tay trong D1: sửa tay thì lần nhập lại sau đè mất, mà giữa hai lần
 * thì không ai biết tên trên màn hình đến từ nguồn hay từ người.
 *
 * `Bacdannhao` là chủ xưởng gọi tên ngày 2026-08-20: BẠC ĐẠN. Nguồn viết dính ở CẢ hai cột nên
 * không có gì đối chiếu — cái này tin người, không tin file.
 */
const TRA_LAI_DAU = [
  // Dây điện của phím âm tường — đặt TRƯỚC luật phím để không ra "DÂY ĐIỆN PHÍM ÂM TƯỜNG CÓ DÂY".
  [/daydien[-_\s]*phi?mamtuongcoday/gi, "DÂY ĐIỆN PHÍM ÂM TƯỜNG"],
  [/phi?mamtuongcoday/gi, "PHÍM ÂM TƯỜNG CÓ DÂY"],
  // "YHTAIWAN LacYHTW300-400-500KG": hãng đã đứng đầu tên rồi, "YHTW" lặp lại là thừa.
  [/lacyhtw(?=\d)/gi, "LẮC "],
  [/daydien/gi, "DÂY ĐIỆN"],
  [/bacdannhao/gi, "BẠC ĐẠN"],
];

for (const [maMoi, nhom] of gom) {
  const dau = nhom[0];
  for (const f of TRUONG_PHAI_KHOP) {
    const gt = new Set(nhom.map((x) => x.payload[f] ?? ""));
    if (gt.size > 1) lech.push({ ma_moi: maMoi, truong: f, gia_tri: [...gt], ma_cu: nhom.map((x) => x.payload.item_code) });
  }
  // Tên hàng phải sạch đúng những trục đã rút khỏi mã. Tên là thứ người dùng NHÌN THẤY, nên để
  // sót màu trong tên thì gộp mã xong màn hình vẫn hiện bốn dòng "CỬA ĐL6D" trông y hệt nhau.
  //
  // Cắt theo dấu phân cách thật (`-`, `_`, khoảng trắng) chứ KHÔNG dùng `\b`: trong regex dấu
  // gạch dưới là ký tự chữ, nên `\bVK\b` trượt "VK_TRỌN BỘ" — đúng cái bẫy làm bẩn tên lần đầu.
  const donTen = (t) => TRA_LAI_DAU.reduce((v, [tim, thay]) => v.replace(tim, thay), (t ?? ""))
    .replace(/(>\s*\d+m²|<\s*\d+m²|\d+\s*-\s*\d+\s*m²)/gi, "")
    .replace(/(^|[-_\s])(XN|VK|XLC|XR|CF|CAFE|GU|KU|TR|GS|STD|STĐ|THO|THÔ|MSK)(?=$|[-_\s])/gi, "$1")
    .replace(/_+/g, " ")
    .replace(/\s*-\s*-\s*/g, " ")
    .replace(/(^|\s)-(?=\s|$)/g, "$1")
    .replace(/\s{2,}/g, " ")
    .replace(/^[\s-]+|[\s-]+$/g, "");
  const ten = [...new Set(nhom.map((x) => donTen(x.payload.item_name)))]
    .sort((a, b) => a.length - b.length)[0];

  const hs = nhom.flatMap((x) => x.payload.uom_conversions ?? []);
  const hsGop = [...new Map(hs.map((x) => [x.uom ?? x.to_uom, x])).values()];

  banGhiMoi.push({
    name: maMoi,
    payload: { ...dau.payload, item_code: maMoi, item_name: ten || dau.payload.item_name, uom_conversions: hsGop },
    title: ten || dau.title,
    content: `${maMoi} ${ten} ${dau.payload.item_group} ${dau.payload.stock_uom}`,
  });
}

/**
 * BƯỚC HAI — ĐẶT MÃ CHUẨN cho họ vật liệu / lá / cửa / ray.
 *
 * Chạy SAU khi gộp: gộp lo "hai mã có phải một thứ không", đặt mã lo "thứ đó nên tên gì".
 * Trộn hai việc vào một vòng thì không phân biệt được va chạm nào do gộp, va chạm nào do khuôn.
 *
 * Mã mới ĐỤNG NHAU là TÍN HIỆU, không phải lỗi: khuôn chỉ ghép lại những gì thật sự cùng loại,
 * cùng mác, cùng độ dày, cùng khổ, cùng màu — nên đụng nhau nghĩa là hai bản ghi vốn tả cùng một
 * thứ. Gộp tiếp, và báo ra để người còn kiểm được.
 */
const doiMa = new Map();
for (const r of banGhiMoi) {
  const m = maChuan({ ma: r.name, ...r.payload });
  if (m && m !== r.name) doiMa.set(r.name, m);
}

const vaCham = new Map();
const sauDatMa = [];
for (const r of banGhiMoi) {
  const ten = doiMa.get(r.name) ?? r.name;
  const da = sauDatMa.find((x) => x.name === ten);
  if (da) {
    // Giữ bản ghi ĐẦU, chỉ nhặt thêm quy đổi ĐVT của bản trùng — phần còn lại đã giống nhau.
    const hs = [...(da.payload.uom_conversions ?? []), ...(r.payload.uom_conversions ?? [])];
    da.payload.uom_conversions = [...new Map(hs.map((x) => [x.uom ?? x.to_uom, x])).values()];
    vaCham.set(ten, [...(vaCham.get(ten) ?? [da._maCu]), r.name]);
    continue;
  }
  sauDatMa.push({ ...r, name: ten, _maCu: r.name, payload: { ...r.payload, item_code: ten } });
}

for (const x of anhXa) if (doiMa.has(x.ma_moi)) x.ma_moi = doiMa.get(x.ma_moi);

banGhiMoi.length = 0;
// `_maCu` chỉ dùng để báo cáo va chạm, không được lọt vào file nguồn của tầng 06.
banGhiMoi.push(...sauDatMa.map(({ _maCu, ...r }) => r));

const ra = { ...nguon, so_ban_ghi: banGhiMoi.length, gop_ma: { tu: nguon.ban_ghi.length, con: banGhiMoi.length, luc: new Date().toISOString() }, ban_ghi: banGhiMoi };
writeFileSync(resolve(THU_MUC, "du-lieu/06-hang-hoa.json"), JSON.stringify(ra, null, 1), "utf8");
writeFileSync(resolve(THU_MUC, "du-lieu/anh-xa-ma.json"), JSON.stringify({ format: "alumdoor-anh-xa-ma/v1", tu: nguon.ban_ghi.length, con: banGhiMoi.length, lech, anh_xa: anhXa }, null, 1), "utf8");

console.log(`
đặt mã chuẩn: ${doiMa.size} mã đổi khuôn · ${vaCham.size} mã mới đụng nhau → gộp tiếp`);
for (const [ten, cu] of vaCham) console.log(`   ${ten}  ←  ${cu.join("  +  ")}`);

const doi = anhXa.filter((x) => x.ma_cu !== x.ma_moi);
console.log(`${nguon.ban_ghi.length} mã → ${banGhiMoi.length} mã gốc  (${doi.length} mã đổi tên, ${nguon.ban_ghi.length - banGhiMoi.length} mã gộp mất đi)`);
console.log(`  màu rút ra : ${anhXa.filter((x) => x.mau).length} mã`);
console.log(`  bậc rút ra : ${anhXa.filter((x) => x.bac).length} mã`);
console.log(`  MSK rút ra : ${anhXa.filter((x) => x.msk).length} mã`);
console.log(`  trường lệch khi gộp: ${lech.length}`);
for (const x of lech.slice(0, 10)) console.log(`   · ${x.ma_moi} · ${x.truong} = ${x.gia_tri.join(" | ")}`);
const mauDung = new Map();
for (const x of anhXa) if (x.mau) mauDung.set(x.mau, (mauDung.get(x.mau) ?? 0) + 1);
console.log(`\nmàu rút ra (${mauDung.size} giá trị):`);
for (const [m, n] of [...mauDung].sort((a, b) => b[1] - a[1])) console.log(`   ${String(n).padStart(4)}  ${m}`);
