/**
 * ÁP ĐVT do 3 agent phân tích từ TÊN HÀNG — qua API.
 *
 * VÌ SAO PHẢI LÀM LẠI
 * Lượt trước tôi lấy NHÓM HÀNG làm căn cứ rồi quét cả nhóm sang Kg. Nhưng "Phụ kiện chung" chứa
 * lẫn bù lon (cân được) với tay điều khiển (không thể cân) — nhóm hàng nói mặt hàng NẰM Ở ĐÂU,
 * không nói nó ĐO BẰNG GÌ. Tên hàng mới nói điều đó, và tôi đã bỏ qua nó.
 *
 * ĐVT BÁN được GIỮ NGUYÊN khi nó cố ý khác ĐVT tồn (bán Cặp, bán Con) — đó là lựa chọn của chủ
 * xưởng, agent không được đụng. Chỉ khi ĐVT bán đang bằng ĐVT tồn thì nó đi theo.
 */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const THU_MUC = dirname(fileURLToPath(import.meta.url));
const GOC = "http://127.0.0.1:8799";
let cookie = "", csrf = "";
async function goi(duong, { method = "GET", body } = {}) {
  const res = await fetch(`${GOC}${duong}`, {
    method,
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}), ...(csrf ? { "x-frappe-csrf-token": csrf } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const sc = res.headers.get("set-cookie"); if (sc?.startsWith("sid=")) cookie = sc.split(";")[0];
  const n = res.headers.get("x-frappe-csrf-token"); if (n) csrf = n;
  const t = await res.text(); let j; try { j = JSON.parse(t); } catch { j = { raw: t }; }
  return { ok: res.ok, status: res.status, j };
}

const HOP_LE = new Set(["Cái", "Bộ", "Cặp", "Con", "Kg", "Mét", "m2", "Cuộn", "Cây", "Tấm", "Lá", "Sợi", "Thanh", "Thân", "Túi", "Hộp", "Bình", "Lít"]);

const deXuat = [];
for (const n of [1, 2, 3]) {
  const ds = JSON.parse(readFileSync(resolve(THU_MUC, `ket-qua-dvt-${n}.json`), "utf8"));
  for (const r of ds) deXuat.push(r);
}
console.log(`3 agent đề xuất ${deXuat.length} mã · cần đổi ${deXuat.filter((r) => r.doi).length}`);

const la = deXuat.filter((r) => !HOP_LE.has(r.dvt_dung));
if (la.length) { console.error(`ĐVT lạ: ${la.map((r) => `${r.ma}=${r.dvt_dung}`).join(", ")}`); process.exit(1); }

await goi("/api/method/login", { method: "POST", body: { usr: "dev@example.com", pwd: "local-dev-password-1" } });

let doi = 0, boQua = 0, hong = 0;
const bang = [];
for (const r of deXuat.filter((x) => x.doi)) {
  const g = await goi(`/api/resource/Item/${encodeURIComponent(r.ma)}`);
  if (!g.ok) { console.log(`  ✗ ${r.ma.padEnd(24)} không thấy mã (${g.status})`); hong += 1; continue; }
  const d = g.j.data;
  if (d.stock_uom === r.dvt_dung) { boQua += 1; continue; }

  // ĐVT bán đi theo CHỈ KHI nó đang bằng ĐVT tồn; bán Cặp/Con là chủ ý, giữ lại.
  const banTheo = d.default_sales_uom === d.stock_uom || !d.default_sales_uom;
  const banMoi = banTheo ? r.dvt_dung : d.default_sales_uom;
  const quyDoi = banMoi !== r.dvt_dung
    ? (d.uom_conversions ?? []).map((c) => ({ uom: c.uom, conversion_factor: c.conversion_factor, note: c.note ?? "" }))
    : [];

  const kq = await goi(`/api/resource/Item/${encodeURIComponent(r.ma)}`, {
    method: "PUT",
    body: { stock_uom: r.dvt_dung, default_purchase_uom: r.dvt_dung, default_sales_uom: banMoi, uom_conversions: quyDoi, modified: d.modified },
  });
  if (!kq.ok) { console.log(`  ✗ ${r.ma.padEnd(24)} (${kq.status}) ${kq.j?.message ?? ""}`); hong += 1; continue; }
  doi += 1;
  bang.push(`  ${r.ma.padEnd(26)}${String(d.item_name).slice(0, 30).padEnd(32)}${String(d.stock_uom).padEnd(5)}→ ${String(r.dvt_dung).padEnd(5)}${r.ly_do ?? ""}`);
}
console.log(bang.join("\n"));
console.log(`\nđổi ${doi} mã · đã đúng sẵn ${boQua} · hỏng ${hong}`);
