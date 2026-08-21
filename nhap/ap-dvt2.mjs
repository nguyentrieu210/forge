/**
 * ÁP ĐVT: hai mã chủ xưởng vừa chốt + 29 mã agent lấy được từ ĐỊNH MỨC.
 *
 * KHÔNG áp 25 mã agent chỉ ĐOÁN TỪ TÊN — hai lượt agent cãi nhau đúng ở nhóm đó, vì thông tin
 * không nằm trong dữ liệu. Chờ chủ xưởng.
 *
 * BẢO VỆ những mã chủ xưởng đã tự chốt bằng tay: agent không được đè lên. Ví dụ agent muốn đưa
 * bạc đạn về Kg theo `KG/CÁI` trong ĐM, trong khi chủ xưởng đã nói rõ bạc đạn mua theo bộ —
 * `KG/CÁI` ở đó là CÂN NẶNG một cái, không phải đơn vị mua.
 *
 * Danh sách mặt hàng đọc từ D1, KHÔNG từ API (API chặn ở 100 bản ghi và không báo).
 */

import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const THU_MUC = dirname(fileURLToPath(import.meta.url));
const API = "http://127.0.0.1:8799";
let cookie = "", csrf = "";
async function goi(duong, { method = "GET", body } = {}) {
  const res = await fetch(`${API}${duong}`, {
    method,
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}), ...(csrf ? { "x-frappe-csrf-token": csrf } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const sc = res.headers.get("set-cookie"); if (sc?.startsWith("sid=")) cookie = sc.split(";")[0];
  const n = res.headers.get("x-frappe-csrf-token"); if (n) csrf = n;
  const t = await res.text(); let j; try { j = JSON.parse(t); } catch { j = { raw: t }; }
  return { ok: res.ok, status: res.status, j };
}
const TRONG = (u) => ({ uom: u, conversion_factor: 0, note: "Chưa có hệ số — điền sau khi xưởng cân" });

/** Chủ xưởng đã tự chốt — agent KHÔNG được đè. */
const KHOA = (ma, ten) => /UPS|BÌNH LƯU ĐIỆN/i.test(`${ma} ${ten}`)
  || /BACDAN|BDN|BẠC ĐẠN/i.test(`${ma} ${ten}`)
  || (/PATCD|PAT_|PHÍM ÂM TƯỜNG/i.test(`${ma} ${ten}`) && !/DÂY ĐIỆN|DAYDIEN/i.test(`${ma} ${ten}`))
  // `CHOT_TAY` cũng phải nằm trong khoá, nếu không lượt agent chạy sau sẽ đè lên lời chủ xưởng
  // vừa nói ở lượt trước — đã xảy ra với BỌ MẮT VÕNG (chốt bán Con, agent đè thành bán m2).
  || ["VT_BKAN", "VT_BOLSN", "VT_HOPKEM_1.2LY", "VT_BULON12.12", "VT_CONTAN12", "VT_CNHUA", "VT_BATSAT",
      "VT_BOMV", "VT_BANGKT_5P"].includes(ma);

/** Chủ xưởng đọc trực tiếp 2026-08-20. */
const CHOT_TAY = [
  { ma: "VT_BOMV", ton: "Kg", ban: "Con", ly: "bọ mắt võng: mua cân, bán theo con" },
  { ma: "VT_BANGKT_5P", ton: "Kg", ban: "Cuộn", ly: "băng keo trong: mua cân, bán theo cuộn" },
];

let deXuat = [];
for (const n of [1, 2, 3]) deXuat = deXuat.concat(JSON.parse(readFileSync(resolve(THU_MUC, `kq2-dvt-${n}.json`), "utf8")));

const db = new DatabaseSync(resolve(THU_MUC, "..", "server/apps/tenant-worker/.wrangler/state/v3/d1/miniflare-D1DatabaseObject/0f70e06fc007ec84591c21ca1daaf09474ca2074a0d42ba21eb2a3fcdbb2cdf8.sqlite"), { readOnly: true });
const hienTai = new Map(db.prepare("SELECT payload_json FROM documents WHERE tenant_id='demo' AND doctype='Item'")
  .all().map((r) => { const p = JSON.parse(r.payload_json); return [p.item_code, p]; }));
db.close();

await goi("/api/method/login", { method: "POST", body: { usr: "dev@example.com", pwd: "local-dev-password-1" } });

const dat = async (ma, ton, ban, ly, nhan) => {
  const g = await goi(`/api/resource/Item/${encodeURIComponent(ma)}`);
  if (!g.ok) { console.log(`  ✗ ${ma.padEnd(24)} không đọc được`); return false; }
  const d = g.j.data;
  if (d.stock_uom === ton && d.default_purchase_uom === ton && d.default_sales_uom === ban) return null;
  const r = await goi(`/api/resource/Item/${encodeURIComponent(ma)}`, {
    method: "PUT",
    body: { stock_uom: ton, default_purchase_uom: ton, default_sales_uom: ban, uom_conversions: ban === ton ? [] : [TRONG(ban)], modified: d.modified },
  });
  console.log(`  ${r.ok ? "✓" : "✗"} ${ma.padEnd(24)}${String(d.item_name).slice(0, 26).padEnd(28)}${d.stock_uom}/${d.default_sales_uom} → ${ton}/${ban}   ${nhan}${r.ok ? "" : `  ${r.j?.message ?? ""}`}`);
  return r.ok;
};

console.log("══ chủ xưởng chốt trực tiếp ══");
for (const v of CHOT_TAY) await dat(v.ma, v.ton, v.ban, v.ly, v.ly);

console.log("\n══ agent lấy từ ĐỊNH MỨC ══");
let ok = 0, boQua = 0, khoa = 0;
for (const r of deXuat.filter((x) => x.doi && x.nguon === "dinh_muc")) {
  const c = hienTai.get(r.ma);
  if (!c) continue;
  if (KHOA(r.ma, c.item_name)) { khoa += 1; continue; }
  const kq = await dat(r.ma, r.ton, r.ban, r.ly_do ?? "", r.ly_do ?? "");
  if (kq === true) ok += 1; else if (kq === null) boQua += 1;
}
console.log(`\náp ${ok} mã · đã đúng sẵn ${boQua} · giữ nguyên vì chủ xưởng đã chốt tay ${khoa}`);
console.log(`CHƯA áp ${deXuat.filter((x) => x.doi && x.nguon !== "dinh_muc").length} mã agent chỉ đoán từ tên — chờ chủ xưởng.`);
