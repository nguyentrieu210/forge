/**
 * Đặt ĐVT = Bộ cho ba họ chủ xưởng chốt: BÌNH LƯU ĐIỆN/UPS · BẠC ĐẠN · PHÍM ÂM TƯỜNG.
 *
 * DANH SÁCH MẶT HÀNG LẤY TỪ D1, KHÔNG LẤY TỪ API.
 * `/api/resource/Item?limit_page_length=500` bị server chặn ở 100 bản ghi và KHÔNG báo gì —
 * nó trả về 100 dòng như thể đó là tất cả. Mọi lượt quét trước dùng danh sách đó chỉ chạm 100 mã
 * đầu, 166 mã còn lại im lặng bị bỏ sót. Đọc D1 thì có đủ; ghi vẫn qua API để app tự kiểm.
 */

import { DatabaseSync } from "node:sqlite";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const GOC_REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
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

const db = new DatabaseSync(resolve(GOC_REPO, "server/apps/tenant-worker/.wrangler/state/v3/d1/miniflare-D1DatabaseObject/0f70e06fc007ec84591c21ca1daaf09474ca2074a0d42ba21eb2a3fcdbb2cdf8.sqlite"), { readOnly: true });
const items = db.prepare("SELECT payload_json FROM documents WHERE tenant_id='demo' AND doctype='Item'")
  .all().map((r) => JSON.parse(r.payload_json));
db.close();
console.log(`đọc từ D1: ${items.length} mặt hàng (API chỉ trả 100)`);

// `DÂY ĐIỆN PHÍM ÂM TƯỜNG` là DÂY, bán theo mét — không phải cái phím. Loại ra.
const HO = [
  ["BÌNH LƯU ĐIỆN / UPS", (x) => /UPS|BÌNH LƯU ĐIỆN/i.test(`${x.item_code} ${x.item_name}`)],
  ["BẠC ĐẠN", (x) => /BACDAN|BDN|BẠC ĐẠN/i.test(`${x.item_code} ${x.item_name}`)],
  ["PHÍM ÂM TƯỜNG", (x) => /PATCD|PAT_|PHÍM ÂM TƯỜNG/i.test(`${x.item_code} ${x.item_name}`) && !/DÂY ĐIỆN|DAYDIEN/i.test(`${x.item_code} ${x.item_name}`)],
];

await goi("/api/method/login", { method: "POST", body: { usr: "dev@example.com", pwd: "local-dev-password-1" } });

const daLam = new Set();
for (const [ten, loc] of HO) {
  const ds = items.filter(loc).filter((x) => !daLam.has(x.item_code));
  console.log(`\n══ ${ten}  (${ds.length} mã) ══`);
  for (const x of ds) {
    daLam.add(x.item_code);
    const g = await goi(`/api/resource/Item/${encodeURIComponent(x.item_code)}`);
    if (!g.ok) { console.log(`  ✗ ${x.item_code.padEnd(26)} không đọc được (${g.status})`); continue; }
    const d = g.j.data;
    const daBo = d.stock_uom === "Bộ" && d.default_purchase_uom === "Bộ" && d.default_sales_uom === "Bộ" && !(d.uom_conversions ?? []).length;
    if (daBo) { console.log(`  = ${x.item_code.padEnd(26)}${String(x.item_name).slice(0, 32).padEnd(34)}đã là Bộ`); continue; }
    const r = await goi(`/api/resource/Item/${encodeURIComponent(x.item_code)}`, {
      method: "PUT",
      body: { stock_uom: "Bộ", default_purchase_uom: "Bộ", default_sales_uom: "Bộ", uom_conversions: [], modified: d.modified },
    });
    console.log(`  ${r.ok ? "✓" : "✗"} ${x.item_code.padEnd(26)}${String(x.item_name).slice(0, 32).padEnd(34)}${d.stock_uom} → Bộ${r.ok ? "" : `  ${r.j?.message ?? ""}`}`);
  }
}
console.log(`\nđã xử lý ${daLam.size} mã`);
