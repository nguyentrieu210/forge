/**
 * DỰNG 7 nhóm CỬA — tầng ③ của dây chuyền, thứ khách trả tiền.
 *
 * BA ĐIỂM CHÍNH, đều lấy từ nguồn chứ không suy:
 *
 * ① CỬA tồn theo BỘ, bán theo M2. Cả 59 dòng nguồn đều khai vậy, và bộ theo dõi
 *   "Thành phẩm theo m2" dựng sẵn đúng cặp đó (ĐVT tồn Bộ, bán theo diện tích). Code cũng có
 *   nhánh riêng `dynamicSquareMetreToSet` cho đúng tổ hợp m2-bán / Bộ-tồn.
 *
 * ② MÀU KHÔNG CÓ TRONG MÃ — kiểm 58 mã: 0 mã chứa VK/GS/MSK/THO. Bảng giá ĐM cho ba màu của
 *   cùng một cửa CÙNG MỘT GIÁ (AL501N: VK, GS, MSK đều 1.471.000). Màu là chiều của lô.
 *
 * ③ 11 MÃ THẬT RA LÀ LÁ, không phải cửa — tên bắt đầu bằng "LÁ". Chúng thuộc tầng ② (bán thành
 *   phẩm, tự sản xuất) nên chuyển sang nhóm Nan/lá cửa và tính theo m2 như 12 mã lá đã có.
 *   Ba trong số đó mang mã `TP-CUA-*` nhưng tên là "LÁ ... TRỌN BỘ": đó là BỘ LÁ bán trọn gói,
 *   vẫn là lá chứ không phải cửa hoàn chỉnh.
 *
 * CHẠY:  node nhap/dung-cua.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const THU_MUC = dirname(fileURLToPath(import.meta.url));
const NGUON = "alumdoor-cua-2026-08-20";

const bg = JSON.parse(readFileSync(resolve(THU_MUC, "du-lieu/06-hang-hoa.json"), "utf8"))
  .ban_ghi.filter((x) => /^Cửa/.test(x.payload?.item_group ?? ""));

/** Bỏ dấu để so — chữ có dấu tồn tại ở hai dạng Unicode nhìn giống hệt nhau. */
const kd = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "")
  .replace(/[đĐ]/g, "D").toUpperCase();

/** Tên bắt đầu bằng LÁ thì đó là lá, dù mã có ghi CUA. */
const laLa = (ten) => /^(TP\s+)?LA(\s|$)/.test(kd(ten).replace(/\s+/g, " ").trim());

/** Tiền tố nhóm cửa → mã. */
const TIEN_TO = {
  "Cửa CN Đức": "CDUC", "Cửa tấm liền Úc": "CUC", "Cửa Đài Loan": "CDL",
  "Cửa Đài Loan Inox": "CDLI", "Cửa Siêu Trường": "CST", "Cửa Lưới": "CLUOI",
  "Cửa kéo Đài Loan": "CKDL",
};

/**
 * BẮN BƯỚM không phải cửa — kho đã có `PKC_BANBUOM_FE` và `PKC_BANBUOM_INOX`.
 * Nó là công bắn bướm lên lá, `QUY CÁCH.xlsx` xếp nó là TUỲ CHỌN trên cửa ("có bắn bướm thì
 * Rộng cắt lá = Rộng pbray trừ 0,035"), không phải một loại cửa. Nhập vào nhóm Cửa là đẻ mã trùng.
 */
const BO_QUA = /BẮN BƯỚM/i;

/**
 * CHỈ GỘP BA CẶP CHỦ XƯỞNG ĐÃ XÁC NHẬN — khoá theo MÃ NGUỒN, không theo tên.
 *
 * Gộp theo tên là sai và đã sai thật: nguồn có hai "CỬA LƯỚI SN PHI 19 TÁCH MÓN" mà một cái là
 * INOX, và hai "LÁ ĐÀI LOAN 1.2LY" khác KHỔ (K175). Trùng tên không có nghĩa trùng hàng — đúng
 * bài học từ vụ ĐINH TÁN và tôn kẽm 1LY.
 */
const GOP = {
  "TD-AL595": "TP-TD-AL595",
  "TP-TD-AL652": "TP-TD-AL652N",
  "TP-TD-AL501NTHO": "TP-TD-AL501N",
};

/** Tên trùng mà KHÔNG được gộp thì phải tự phân biệt — thêm chữ vào tên, không đổi mã. */
const RO_TEN = {
  "TP-LUOI-SNPHI19-INOX-TM": "CỬA LƯỚI SN PHI 19 INOX TÁCH MÓN",
  "TP-LA-DLK-1.2LY-K175": "LÁ ĐÀI LOAN 1.2LY K175",
  "TP-LA-DLK-1.2LY": "LÁ ĐÀI LOAN 1.2LY K124",
};

/**
 * GỘP THEO TÊN HÀNG trong nhóm cửa — chủ xưởng chốt 20/08/2026.
 *
 * Nguồn ghi cùng một cửa dưới nhiều mã: `TD-AL595` với `TP-TD-AL595`, `TP-TD-AL652N` với
 * `TP-TD-AL652`, `TP-TD-AL501N` với `TP-TD-AL501NTHO`. Bảng giá xác nhận chúng là MỘT: ba dòng
 * AL595 đều 1.095.000, ba dòng AL652 đều 1.548.000.
 *
 * Chữ `N` gõ lúc có lúc không, còn `THO`/`VK`/`GS` là MÀU và TÌNH TRẠNG — hai chiều của LÔ, không
 * phải của mặt hàng. Sổ tồn nhôm cũng chỉ có một sheet cho mỗi biên dạng, không có sheet N riêng.
 *
 * Khi gộp thì giữ mã CÓ chữ N, vì đó là dạng mã cửa dùng nhiều hơn.
 */
/**
 * Lọc dòng bị gộp NGAY TỪ ĐẦU, không gộp giữa vòng lặp.
 *
 * Gộp giữa vòng lặp phụ thuộc THỨ TỰ: `TD-AL595` đứng trước `TP-TD-AL595` trong nguồn, nên lúc
 * xử lý cái trước thì cái sau chưa tồn tại để gộp vào — kết quả là hai dòng cùng ra một mã.
 * Lọc trước thì thứ tự không còn ảnh hưởng.
 */
const coTrongNguon = new Set(bg.map((r) => r.name));
const boGop = new Set(Object.entries(GOP).filter(([, dich]) => coTrongNguon.has(dich)).map(([nguon]) => nguon));

const seen = new Map();
const cua = [], la = [], boQua = [], gop = [];
for (const r of bg) {
  if (boGop.has(r.name)) { gop.push({ ten: r.payload.item_name, giu: GOP[r.name], bo: r.name }); continue; }
  const p = r.payload;
  if (BO_QUA.test(p.item_name)) { boQua.push({ ten: p.item_name, cu: r.name, vi: "bắn bướm — đã có ở Phụ kiện chung" }); continue; }

  const than = String(r.name).replace(/^(TP|HH|NVL)[-_ ]/, "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[đĐ]/g, "D")
    .toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  const laMotLa = laLa(p.item_name);
  /** "LÁ ... TRỌN BỘ" là BỘ LÁ bán trọn gói — khác mã, khác giá với lá tách món. Giữ riêng. */
  const tronBo = /TRỌN BỘ/i.test(p.item_name);
  let ma = laMotLa
    ? `LA_${than.replace(/^(LA|CUA)_/, "")}${tronBo ? "_TRONBO" : ""}`
    : `${TIEN_TO[p.item_group] ?? "CUA"}_${than.replace(/^CUA_/, "")}`;

  const ban = {
    name: ma,
    payload: {
      item_code: ma, item_name: RO_TEN[r.name] ?? p.item_name,
      item_group: laMotLa ? "Nan/lá cửa" : p.item_group,
      /** Chủ xưởng chốt: KHÔNG có dịch vụ, toàn bộ là hàng tồn kho. */
      item_nature: "Hàng tồn kho",
      material_stage: laMotLa ? "Bán thành phẩm" : "Thành phẩm",
      supply_type: "Tự sản xuất",
      is_stock_item: true,
      is_purchase_item: false,
      is_sales_item: true,
      include_item_in_manufacturing: true,
      measurement_profile: laMotLa ? "Tấm/Kính" : "Thành phẩm theo m2",
      stock_uom: laMotLa ? "m2" : "Bộ",
      default_sales_uom: "m2",
      disabled: false, _migration_source: NGUON, _ma_cu: r.name,
    },
    title: p.item_name, content: `${ma} ${p.item_name}`,
  };
  seen.set(r.name, { ma, than, cu: r.name, ban });
  (laMotLa ? la : cua).push(ban);
}

const tatCa = [...cua, ...la];
writeFileSync(resolve(THU_MUC, "du-lieu/20-cua.json"), JSON.stringify({
  doctype: "Item", so_ban_ghi: tatCa.length, nguon: NGUON, ban_ghi: tatCa,
}, null, 1), "utf8");

console.log(`${bg.length} dòng nguồn → ${tatCa.length} mã  (${cua.length} cửa · ${la.length} lá)\n`);
if (gop.length) {
  console.log(`gộp ${gop.length} cặp cùng tên:`);
  for (const g of gop) console.log(`   ${String(g.ten).padEnd(26)}bỏ mã nguồn ${String(g.bo).padEnd(22)}→ gộp vào ${g.giu}`);
  console.log("");
}
if (boQua.length) {
  console.log(`không nhập ${boQua.length}:`);
  for (const b of boQua) console.log(`   ${String(b.ten).padEnd(30)}${b.cu.padEnd(22)}${b.vi}`);
  console.log("");
}
const theoNhom = {};
for (const r of tatCa) (theoNhom[r.payload.item_group] ??= []).push(r);
for (const [nh, ds] of Object.entries(theoNhom)) {
  const p0 = ds[0].payload;
  console.log(`▌ ${nh}  —  ${ds.length} mã   [tồn ${p0.stock_uom} · bán ${p0.default_sales_uom} · ${p0.material_stage} · ${p0.supply_type}]`);
  for (const r of ds) console.log(`     ${r.name.padEnd(28)}${r.payload.item_name}`);
}
