/**
 * XEM TRƯỚC mã chuẩn hoá — CHỈ IN RA, không ghi gì.
 *
 * KHUÔN:  <LOẠI>-<MÁC>-<DÀY>[-K<KHỔ>][-<MÀU>][-<BIẾN THỂ>]
 *
 * LOẠI nói thứ nó LÀ GÌ, nhìn tiền tố là biết mua hay bán:
 *   NVL-TON   cuộn tôn nguyên liệu, tính Kg
 *   NVL-RAY   ray sắt
 *   TP-LA     lá đã cán — thành phẩm, KHÔNG kèm ray/trục
 *   TP-CUA    cửa trọn bộ — lá + ray + trục + V4
 * "Trọn bộ / tách món" nằm luôn trong tiền tố, không cần đuôi TRONBO nữa.
 *
 * DÀY dùng TÊN GỌI THƯƠNG MẠI (6D, 8D, 1LY), không dùng số đo thật.
 *   Vì mã là để người gọi nhau, không phải để đo. Số đo thật đã có ô riêng
 *   (`Material Specification.thickness_mm`). Quan trọng hơn: chọn tên gọi thì MÃ VÀ TÊN
 *   HÀNG NÓI CÙNG MỘT THỨ — chấm dứt cả lớp lỗi "mã ghi 5.2D, tên ghi 6D".
 *
 * KHỔ giữ nguyên token thô (124/175/598) vì chưa biết mm hay cm — đơn vị là việc của quy cách.
 */

import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const GOC = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const db = new DatabaseSync(resolve(GOC, "server/apps/tenant-worker/.wrangler/state/v3/d1/miniflare-D1DatabaseObject/0f70e06fc007ec84591c21ca1daaf09474ca2074a0d42ba21eb2a3fcdbb2cdf8.sqlite"), { readOnly: true });
const it = db.prepare("SELECT name,payload_json FROM documents WHERE tenant_id='demo' AND doctype='Item'")
  .all().map((r) => ({ ma: r.name, ...JSON.parse(r.payload_json) }));
db.close();

/** Độ dày viết một kiểu duy nhất: 6D · 8D · 1LY · 1.2LY. `1LY2` là cách viết khác của 1.2LY. */
const chuanDay = (s) => {
  if (!s) return null;
  let m = s.match(/(\d+)LY(\d)/i);            if (m) return `${m[1]}.${m[2]}LY`;
  m = s.match(/(\d+(?:[.,]\d+)?)\s*LY/i);     if (m) return `${m[1].replace(",", ".")}LY`;
  m = s.match(/(\d+(?:[.,]\d+)?)D(?![A-Za-zÀ-ỹ])/); if (m) return `${m[1].replace(",", ".")}D`;
  return null;
};

const MAC = (x) => {
  if (/LADLINOX/i.test(x.ma)) return "INOX";
  if (/TOLE0\.\d+x598/i.test(x.ma)) return "UC";
  if (/-(XNVK|XNXLC|GUKU|TRXLC)$/.test(x.ma)) return "DLM";   // có màu ⇒ tôn đã mạ màu
  // Cửa ĐL đi từ tôn MÀU: định mức của TP-CUADL6D ăn NVL-TON-DL5.2Dx124-XN* (ĐM.md dòng 1262).
  if (/CUADL/i.test(x.ma)) return "DLM";
  if (/TON-DL|TOLEKEM|TON-ST/i.test(x.ma)) return "DLK";
  return null;
};

const mau = (ma) => (ma.match(/-(XNVK|XNXLC|GUKU|TRXLC)$/) || [])[1] ?? null;
const kho = (ma) => (ma.match(/x(\d{3})/i) || [])[1] ?? null;

function maMoi(x) {
  // Ray sắt: phân biệt bằng khẩu độ U70/U100 và có ron hay không, KHÔNG phải bằng độ dày tôn.
  if (/^NVL-TOLE1\.\d+[xX]\d{3}/.test(x.ma)) {
    const u = (x.item_name.match(/U(\d+)/) || [])[1];
    const ly = (x.ma.match(/x(\d+(?:\.\d+)?)ly/i) || [])[1];
    const ron = /KHÔNG RON/i.test(x.item_name) ? "KRON" : "RON";
    const td = /TỰ DỪNG/i.test(x.item_name) ? "-TD" : "";
    return u ? `NVL-RAY-U${u}${ly ? `-${ly}LY` : ""}-${ron}${td}` : null;
  }

  const mac = MAC(x);
  if (!mac) return null;

  // Nguyên liệu hay thành phẩm KHÔNG đọc từ tiền tố cũ (tiền tố cũ sai 94 chỗ), mà đọc từ
  // `material_stage` + ĐVT tồn — hai trường đã khai đủ 438/438.
  const laThanhPham = x.material_stage === "Thành phẩm" || x.stock_uom === "m2";
  const tronBo = /TRONBO/i.test(x.ma) || /TRỌN BỘ/i.test(x.item_name);
  const loai = !laThanhPham ? "NVL-TON" : tronBo ? "TP-CUA" : "TP-LA";

  // Thành phẩm lấy độ dày từ TÊN (tên gọi thương mại), nguyên liệu cũng vậy — một hệ duy nhất.
  const day = chuanDay(x.item_name) ?? chuanDay(x.ma.replace(/x\d{3}/i, ""));
  if (!day) return null;

  const k = kho(x.ma), c = mau(x.ma);
  return [loai, mac, day, k ? `K${k}` : null, c].filter(Boolean).join("-");
}

const rows = [];
for (const x of it) {
  const m = maMoi(x);
  if (m) rows.push({ cu: x.ma, moi: m, ten: x.item_name, stage: x.material_stage, uom: x.stock_uom });
}

const dem = new Map();
for (const r of rows) dem.set(r.moi, (dem.get(r.moi) ?? 0) + 1);

console.log(`${rows.length} mã trong họ vật liệu / lá / cửa / ray được chuẩn hoá\n`);
const nhom = {};
for (const r of rows.sort((a, b) => a.moi.localeCompare(b.moi))) {
  const k = r.moi.split("-").slice(0, 2).join("-");
  (nhom[k] = nhom[k] ?? []).push(r);
}
for (const [k, v] of Object.entries(nhom)) {
  console.log(`── ${k} (${v.length}) ──`);
  for (const r of v) console.log(`   ${r.cu.padEnd(30)} →  ${r.moi.padEnd(30)} ${dem.get(r.moi) > 1 ? "⚠ TRÙNG" : ""}`);
}
const trung = [...dem].filter(([, n]) => n > 1);
console.log(`\nmã mới bị trùng: ${trung.length ? trung.map(([m, n]) => `${m} (${n})`).join(", ") : "0"}`);
const bo = it.filter((x) => !maMoi(x));
console.log(`không đụng tới: ${bo.length} mã (motor, phụ kiện, điều khiển…)`);
