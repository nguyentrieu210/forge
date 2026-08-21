/**
 * GẮN quy cách kỹ thuật vào từng mặt hàng, qua API.
 *
 * Chỉ đụng đúng một ô `material_specification`. PUT mang theo nguyên payload cũ cộng ô mới —
 * không dựng lại bản ghi từ tệp nguồn, vì mọi thứ chủ xưởng đã sửa tay trên app (ĐVT, ảnh,
 * dòng quy đổi) phải sống sót. Bản ghi trên app là bản đúng, tệp nguồn chỉ là bản gợi ý.
 *
 * CHẠY:  node nhap/gan-quy-cach.mjs [--that]     (không cờ = chạy thử, không ghi)
 */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const THU_MUC = dirname(fileURLToPath(import.meta.url));
const GOC = process.env.ALUMDOOR_API || "http://127.0.0.1:8799";
const THAT = process.argv.includes("--that");

let cookie = "", csrf = "";
async function goi(duong, { method = "GET", body } = {}) {
  const res = await fetch(`${GOC}${duong}`, {
    method,
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}), ...(csrf ? { "x-frappe-csrf-token": csrf } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const dat = res.headers.get("set-cookie");
  if (dat?.startsWith("sid=")) cookie = dat.split(";")[0];
  const nonce = res.headers.get("x-frappe-csrf-token");
  if (nonce) csrf = nonce;
  const chu = await res.text();
  let json; try { json = JSON.parse(chu); } catch { json = { raw: chu }; }
  return { ok: res.ok, status: res.status, json };
}

const dn = await goi("/api/method/login", { method: "POST", body: { usr: process.env.FORGE_ADMIN_USER || "dev@example.com", pwd: process.env.FORGE_ADMIN_PASSWORD || "local-dev-password-1" } });
if (!dn.ok) throw new Error(`Đăng nhập hỏng: ${JSON.stringify(dn.json)}`);

const gan = JSON.parse(readFileSync(resolve(THU_MUC, "du-lieu/13-gan-quy-cach.json"), "utf8"));
console.log(`${THAT ? "GHI THẬT" : "chạy thử (thêm --that để ghi)"} · ${gan.length} mã\n`);

let xong = 0, boQua = 0, hong = 0;
for (const g of gan) {
  if (!g.spec) { console.log(`  – ${g.ma.padEnd(26)} không có quy cách`); boQua += 1; continue; }
  const hienCo = await goi(`/api/resource/Item/${encodeURIComponent(g.ma)}`);
  if (!hienCo.ok) { console.log(`  ✗ ${g.ma.padEnd(26)} không đọc được (${hienCo.status})`); hong += 1; continue; }
  const d = hienCo.json?.data ?? {};
  if (d.material_specification === g.spec) { console.log(`  = ${g.ma.padEnd(26)} đã đúng`); boQua += 1; continue; }
  if (!THAT) { console.log(`  → ${g.ma.padEnd(26)} ${String(d.material_specification ?? "(trống)").padEnd(26)} ⇒ ${g.spec}`); xong += 1; continue; }
  const sua = await goi(`/api/resource/Item/${encodeURIComponent(g.ma)}`, {
    method: "PUT",
    body: { ...d, material_specification: g.spec },
  });
  if (!sua.ok) { console.log(`  ✗ ${g.ma.padEnd(26)} ${sua.status} ${sua.json?.message ?? JSON.stringify(sua.json).slice(0, 200)}`); hong += 1; continue; }
  console.log(`  ✓ ${g.ma.padEnd(26)} ${g.spec}`);
  xong += 1;
}
console.log(`\ngắn ${xong} · bỏ qua ${boQua} · hỏng ${hong}`);
