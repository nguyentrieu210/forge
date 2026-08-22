/**
 * GỘP CÁC MÃ CÙNG MỘT MÓN — chủ dự án chốt 2026-08-20, qua API.
 *
 * Mỗi cặp: giữ một mã, sửa ĐVT cho đúng chiều mua/bán, rồi XOÁ mã kia.
 * Xoá SAU khi sửa xong bản giữ lại — hỏng ở giữa thì vẫn còn đủ hai bản, không mất gì.
 *
 * `V4 KẼM` gộp vào `VT_V4` vì KẼM chỉ là MÀU, mà màu đã ghi theo LÔ lúc nhập kho — nguyên tắc
 * "màu không vào mã" đã áp cho họ tôn, giờ áp nốt chỗ này.
 */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

throw new Error(
  "ĐÃ KHÓA gop-ma-trung.mjs: script DELETE mã cũ và gán hệ số tạm 10. "
  + "Phải dùng canonical ledger + cascade + preflight zero conflict qua local runner.",
);

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

/** giữ · bỏ · ĐVT [tồn, mua, bán] · hệ số (0 = không cần) · tên mới (rỗng = giữ nguyên) */
const VIEC = [
  { giu: "VT_CONTAN12",            bo: "VT_CONTAN12.12",         dvt: null, ten: "" },
  { giu: "VT_PULY_140",            bo: "VT_PL140",               dvt: null, ten: "" },
  { giu: "VT_PULY_168",            bo: "VT_PL168",               dvt: null, ten: "" },
  { giu: "VT_BO_1VIS_503N_71_595", bo: "VT_BO1VIS_503N_71_595",  dvt: ["Kg", "Kg", "Con"], hs: 10, ten: "" },
  { giu: "VT_V4",                  bo: "VT_V4_KEM",              dvt: ["Kg", "Kg", "Mét"], hs: 10, ten: "" },
];
/** Hai loại đinh tán KHÁC nhau: MV = mắt võng, SN = song ngang. Tên phải nói ra điều đó. */
const DOI_TEN = [
  { ma: "VT_DINHTAN_MV", ten: "ĐINH TÁN MẮT VÕNG" },
  { ma: "VT_DINHTAN_SN", ten: "ĐINH TÁN SONG NGANG" },
];

await goi("/api/method/login", { method: "POST", body: { usr: "dev@example.com", pwd: "local-dev-password-1" } });
console.log("đăng nhập: dev@example.com\n");

const sua = async (ma, doi) => {
  const cu = await goi(`/api/resource/Item/${encodeURIComponent(ma)}`);
  if (!cu.ok) return { ok: false, j: cu.j, status: cu.status };
  const d = cu.j.data;
  return goi(`/api/resource/Item/${encodeURIComponent(ma)}`, { method: "PUT", body: { ...doi, modified: d.modified } });
};

for (const v of VIEC) {
  const doi = {};
  if (v.dvt) {
    doi.stock_uom = v.dvt[0]; doi.default_purchase_uom = v.dvt[1]; doi.default_sales_uom = v.dvt[2];
    doi.uom_conversions = [...new Set([v.dvt[1], v.dvt[2]])].filter((u) => u !== v.dvt[0])
      .map((u) => ({ uom: u, conversion_factor: v.hs, note: "Hệ số mặc định 10 — chờ số thật của xưởng" }));
  }
  if (v.ten) doi.item_name = v.ten;

  if (Object.keys(doi).length) {
    const r = await sua(v.giu, doi);
    if (!r.ok) { console.log(`  ✗ ${v.giu.padEnd(24)} sửa hỏng (${r.status}) ${r.j?.message ?? ""}`); continue; }
  }
  const x = await goi(`/api/resource/Item/${encodeURIComponent(v.bo)}`, { method: "DELETE" });
  const d = (await goi(`/api/resource/Item/${encodeURIComponent(v.giu)}`)).j?.data ?? {};
  const qd = (d.uom_conversions ?? []).map((c) => `${c.uom}×${c.conversion_factor}`).join(", ");
  console.log(`  ✓ ${v.giu.padEnd(24)} ${String(d.item_name).padEnd(22)} tồn ${String(d.stock_uom).padEnd(4)} mua ${String(d.default_purchase_uom).padEnd(4)} bán ${String(d.default_sales_uom).padEnd(4)}${qd ? ` · ${qd}` : ""}   ⌫ bỏ ${v.bo}${x.ok ? "" : ` (XOÁ HỎNG ${x.status})`}`);
}

console.log("");
for (const t of DOI_TEN) {
  const r = await sua(t.ma, { item_name: t.ten });
  console.log(`  ${r.ok ? "✓" : "✗"} ${t.ma.padEnd(24)} tên → "${t.ten}"${r.ok ? "" : ` (${r.status}) ${r.j?.message ?? ""}`}`);
}
