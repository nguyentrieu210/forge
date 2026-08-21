/**
 * RÀ SOÁT + VÁ bảng quy đổi cho TOÀN BỘ mặt hàng.
 *
 * LUẬT (chủ xưởng chốt 2026-08-20):
 *   · ĐVT tồn = ĐVT mua.
 *   · Mọi ĐVT khác ĐVT tồn (mua hoặc bán) PHẢI có một dòng trong bảng quy đổi.
 *   · CHỈ THÊM, KHÔNG XOÁ dòng thừa. Bảng quy đổi là nơi khai MỌI đơn vị bán được, không chỉ
 *     đơn vị bán mặc định — chủ xưởng nói rõ "sau này có thể bán nhiều ĐVT". Bát khoá âm nền bán
 *     cả Cái lẫn Cặp; xoá dòng Cặp chỉ vì nó không phải đơn vị mặc định là làm mất khai báo thật.
 *   · Hệ số ĐỂ TRỐNG hết — số trong định mức đã được xác nhận là SAI, tuyệt đối không lấy.
 *
 * Danh sách đọc từ D1. KHÔNG dùng `/api/resource/Item` để liệt kê: nó chặn ở 100 bản ghi và
 * không báo gì, nên mọi lượt quét trước qua đường đó chỉ chạm 100 mã đầu.
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

await goi("/api/method/login", { method: "POST", body: { usr: "dev@example.com", pwd: "local-dev-password-1" } });

let them = 0, xoaSo = 0, lechMua = 0, hong = 0;
for (const x of items) {
  const ton = x.stock_uom;
  const mua = x.default_purchase_uom || ton;
  const ban = x.default_sales_uom || ton;
  if (mua !== ton) lechMua += 1;

  const can = [...new Set([mua, ban])].filter((u) => u && u !== ton).sort();
  const dang = (x.uom_conversions ?? []);
  const dangUom = [...new Set(dang.map((z) => z.uom))].sort();
  const coSo = dang.some((z) => Number(z.conversion_factor) !== 0);
  const thieu = can.filter((u) => !dangUom.includes(u));

  if (!thieu.length && !coSo) continue;

  const g = await goi(`/api/resource/Item/${encodeURIComponent(x.item_code)}`);
  if (!g.ok) { hong += 1; continue; }
  // Giữ nguyên mọi dòng đang có (kể cả đơn vị bán thêm), chỉ bổ sung dòng thiếu và xoá hệ số.
  const moi = [...new Set([...dangUom, ...can])]
    .map((u) => ({ uom: u, conversion_factor: 0, note: "Chưa có hệ số — xưởng cân rồi điền" }));
  const r = await goi(`/api/resource/Item/${encodeURIComponent(x.item_code)}`, {
    method: "PUT", body: { uom_conversions: moi, modified: g.j.data.modified },
  });
  if (!r.ok) { hong += 1; console.log(`  ✗ ${x.item_code.padEnd(26)} ${r.j?.message ?? ""}`); continue; }
  if (thieu.length) { them += 1; console.log(`  + ${x.item_code.padEnd(26)}${String(x.item_name).slice(0, 26).padEnd(28)}thêm quy đổi: ${thieu.join(", ")}`); }
  if (coSo) { xoaSo += 1; console.log(`  ~ ${x.item_code.padEnd(26)}${String(x.item_name).slice(0, 26).padEnd(28)}xoá hệ số, để trống`); }
}
console.log(`
${items.length} mặt hàng · thêm ${them} dòng quy đổi · xoá ${xoaSo} hệ số · hỏng ${hong}`);
console.log(`ĐVT mua khác ĐVT tồn: ${lechMua} mã (phải bằng 0)`);
