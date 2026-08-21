/**
 * DỰNG DỮ LIỆU NHẬP cho nhóm RAY VÀ TRỤC — sinh file, chưa nhập.
 *
 * Luật chủ xưởng đã chốt:
 *   · tiền tố theo nhóm: `RT_`
 *   · KHÁC CHỮ LÀ KHÁC MÃ — giữ hết mọi biến thể độ dày (2.4LY, 2.5mm, 4.0mm, 5LY…), không gộp
 *   · ĐVT MUA = ĐVT TỒN = cách nhà cung cấp bán; ĐVT BÁN = ĐVT trong định mức
 *   · hệ số quy đổi ĐỂ TRỐNG toàn bộ
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const THU_MUC = dirname(fileURLToPath(import.meta.url));
const GOC = resolve(THU_MUC, "..");

const boDau = (s) => s
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .replace(/đ/g, "d").replace(/Đ/g, "D")
  .replace(/[&+()/,]+/g, "-");
const than = (ma) => boDau(ma)
  .replace(/^(TP|NVL|HH|LK)[-_]/i, "")
  .replace(/[\s_-]+/g, "_").replace(/_{2,}/g, "_").replace(/^_+|_+$/g, "").toUpperCase();

/** ĐVT dùng trong định mức, theo mã cũ. Dạng "KG/X" ⇒ bán theo X. */
const dm = new Map();
for (const d of readFileSync(resolve(GOC, "apps/alumdoor/docs/nguon/ms-lien/ĐM.md"), "utf8").split("\n")) {
  const ma = (d.match(/\[3\]\s+([^·\n]+)/) || [])[1];
  const dv = (d.match(/\[5\]\s+([^·\n]+)/) || [])[1];
  if (!ma || !dv) continue;
  if (!dm.has(ma.trim())) dm.set(ma.trim(), new Set());
  dm.get(ma.trim()).add(dv.trim().toUpperCase());
}
const CHUAN = { "CÁI": "Cái", "BỘ": "Bộ", "CẶP": "Cặp", "CON": "Con", "KG": "Kg", "M": "Mét", "M2": "m2", "CÂY": "Cây", "CUỘN": "Cuộn" };
function banTheoDinhMuc(maCu) {
  const ds = dm.get(maCu);
  if (!ds) return null;
  for (const u of ds) { const m = u.match(/^KG\/(.+)$/); if (m) return CHUAN[m[1].trim()] ?? null; }
  for (const u of ds) if (CHUAN[u]) return CHUAN[u];
  return null;
}

const nguon = JSON.parse(readFileSync(resolve(THU_MUC, "du-lieu/06-hang-hoa.json"), "utf8")).ban_ghi
  .filter((r) => r.payload.item_group === "Ray và trục");

/**
 * Thân mã rút gọn có thể đụng nhau (`RNHUA-DR` và `NVL-RNHUA-DR` cùng ra `RNHUA_DR`).
 * Chủ xưởng chốt KHÔNG GỘP, nên mã đụng phải giữ nguyên thân CŨ ĐẦY ĐỦ — kể cả tiền tố loại —
 * chứ không thêm đuôi số vô nghĩa.
 */
const thanDay = (ma) => boDau(ma).replace(/[\s_-]+/g, "_").replace(/_{2,}/g, "_").replace(/^_+|_+$/g, "").toUpperCase();
const demGon = {};
for (const r of nguon) { const g = than(r.name); demGon[g] = (demGon[g] ?? 0) + 1; }

const banGhi = nguon.map((r) => {
  const p = r.payload;
  const g = than(r.name);
  const ma = `RT_${demGon[g] > 1 ? thanDay(r.name) : g}`;
  // MUA = TỒN theo danh mục gốc; BÁN theo định mức, không có thì bằng ĐVT tồn.
  const ton = p.stock_uom;
  const ban = banTheoDinhMuc(r.name) ?? (p.default_sales_uom || ton);
  return {
    name: ma,
    payload: {
      item_code: ma, item_name: p.item_name, item_group: "Ray và trục",
      item_nature: p.item_nature ?? "Hàng tồn kho",
      material_stage: p.material_stage ?? "Nguyên vật liệu",
      supply_type: p.supply_type ?? "Mua ngoài",
      is_stock_item: Boolean(p.is_stock_item), is_purchase_item: Boolean(p.is_purchase_item),
      is_sales_item: Boolean(p.is_sales_item), include_item_in_manufacturing: Boolean(p.include_item_in_manufacturing),
      measurement_profile: p.measurement_profile ?? "Hàng thường",
      stock_uom: ton, default_purchase_uom: ton, default_sales_uom: ban,
      uom_conversions: ban !== ton ? [{ uom: ban, conversion_factor: 0, note: "Chưa có hệ số — xưởng cân rồi điền" }] : [],
      disabled: Boolean(p.disabled),
    },
    _cu: r.name,
  };
});

const dem = {}; for (const r of banGhi) dem[r.name] = (dem[r.name] ?? 0) + 1;
const dung = Object.entries(dem).filter(([, n]) => n > 1);

writeFileSync(resolve(THU_MUC, "du-lieu/12-ray-truc.json"),
  JSON.stringify({ doctype: "Item", trich_luc_luc: new Date().toISOString(),
    nguon: "06-hang-hoa.json nhóm 'Ray và trục'; mã RT_ + ASCII; ĐVT bán lấy từ ĐM.md; hệ số để trống",
    so_ban_ghi: banGhi.length, ban_ghi: banGhi.map(({ _cu, ...r }) => r) }, null, 1), "utf8");

console.log(`${banGhi.length} mã · mã đụng nhau: ${dung.length ? dung.map(([m, n]) => `${m}(${n})`).join(", ") : "0"}`);
console.log("\nmã mới".padEnd(34) + "tên hàng".padEnd(36) + "tồn=mua  bán");
for (const r of banGhi.sort((a, b) => a.name.localeCompare(b.name))) {
  const p = r.payload;
  console.log(`  ${r.name.padEnd(32)}${String(p.item_name).slice(0, 34).padEnd(36)}${String(p.stock_uom).padEnd(9)}${p.default_sales_uom}`);
}
