/**
 * ĐỔI MÃ THEO NHÓM HÀNG — bản nháp (`--that` mới ghi).
 *
 * Chủ xưởng chốt 2026-08-20:
 *   · tiền tố theo NHÓM HÀNG, không dùng `VT_` chung nữa
 *   · nhóm "Điều khiển & phụ kiện điện" TÁCH ĐÔI: bộ điều khiển → `DK_`, tay/hộp → `PKD_`
 *     ("bộ" đã là ĐVT nên không lặp lại trong mã)
 *   · KHÁC CHỮ LÀ KHÁC MÃ — tuyệt đối không gộp bản ghi nào
 *
 * Vì không được gộp, luật đặt mã phải tự đảm bảo KHÔNG ĐỤNG NHAU: khi thân mã rút gọn trùng
 * nhau, giữ nguyên thân mã CŨ (vốn đã phân biệt được) thay vì thêm đuôi số vô nghĩa.
 *
 * Đổi tên qua `frappe.client.rename_doc`, KHÔNG xoá-rồi-tạo: rename giữ nguyên bản ghi và tự
 * cập nhật `item_code` (autoname `field:item_code`). Xoá-rồi-tạo thì mất dữ liệu nếu lệnh tạo
 * hỏng, và còn dính sổ chống lặp lệnh.
 */

import { DatabaseSync } from "node:sqlite";
import { writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const THU_MUC = dirname(fileURLToPath(import.meta.url));
const GOC = resolve(THU_MUC, "..");
const API = "http://127.0.0.1:8799";
const THAT = process.argv.includes("--that");

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

const TIEN_TO = {
  "Linh kiện motor": "LKMT",
  "Phụ kiện chung": "PKC",
  "Motor": "MT",
  "Phụ kiện CN Đức": "PKDUC",
  "Phụ kiện cần sơn tĩnh điện": "PKS",
  "Bình lưu điện": "BLD",
  "Nan/lá cửa": "NLC",
  "Ray và trục": "RT",
};

/** Nhóm điều khiển tách đôi theo TÊN HÀNG, vì mã cũ viết loại theo ba kiểu khác nhau. */
function tienToDieuKhien(ten) {
  if (/TAY ĐIỀU KHIỂN|TAY ĐK/i.test(ten)) return "PKD_TAY";
  if (/HỘP ĐIỀU KHIỂN|HỘP ĐK/i.test(ten)) return "PKD_HOP";
  return "DK";
}

/** Bỏ token chỉ LOẠI đã nằm trong tiền tố. Chỉ dùng khi kết quả vẫn duy nhất. */
const BO_TOKEN = /(^|_)(BDK|BODK|BODIEUKHIEN|BDKDT|TAYDK|TDK|HDK|MTT|MT)(_|$)/gi;

const db = new DatabaseSync(resolve(GOC, "server/apps/tenant-worker/.wrangler/state/v3/d1/miniflare-D1DatabaseObject/0f70e06fc007ec84591c21ca1daaf09474ca2074a0d42ba21eb2a3fcdbb2cdf8.sqlite"), { readOnly: true });
const items = db.prepare("SELECT payload_json FROM documents WHERE tenant_id='demo' AND doctype='Item'")
  .all().map((r) => JSON.parse(r.payload_json));
db.close();

const gon = (s) => s.replace(BO_TOKEN, "$1$3").replace(/_{2,}/g, "_").replace(/^_+|_+$/g, "");

const dat = (x) => {
  const than = x.item_code.replace(/^VT_/, "");
  const tt = x.item_group === "Điều khiển & phụ kiện điện" ? tienToDieuKhien(x.item_name) : TIEN_TO[x.item_group];
  if (!tt) return null;
  return { tt, thanGon: gon(than) || than, thanDay: than };
};

// Vòng 1: thử thân RÚT GỌN. Vòng 2: mã nào đụng thì trả về thân ĐẦY ĐỦ.
const dem = new Map();
for (const x of items) { const d = dat(x); if (!d) continue; const m = `${d.tt}_${d.thanGon}`; dem.set(m, (dem.get(m) ?? 0) + 1); }

const bang = [];
for (const x of items) {
  const d = dat(x);
  if (!d) { bang.push({ cu: x.item_code, moi: x.item_code, nhom: x.item_group, ten: x.item_name, giuNguyen: true }); continue; }
  const gonMa = `${d.tt}_${d.thanGon}`;
  const moi = dem.get(gonMa) > 1 ? `${d.tt}_${d.thanDay}` : gonMa;
  bang.push({ cu: x.item_code, moi, nhom: x.item_group, ten: x.item_name });
}

const c2 = {};
for (const r of bang) c2[r.moi] = (c2[r.moi] ?? 0) + 1;
const dung = Object.entries(c2).filter(([, n]) => n > 1);

const theoNhom = {};
for (const r of bang) (theoNhom[r.nhom] ??= []).push(r);
const dong = [`# Đổi mã theo nhóm hàng — ${bang.length} mặt hàng\n`];
for (const [k, ds] of Object.entries(theoNhom)) {
  dong.push(`\n## ${k} (${ds.length})\n`, "| Mã cũ | Mã mới | Tên hàng |", "|---|---|---|");
  for (const r of ds.sort((a, b) => a.moi.localeCompare(b.moi))) dong.push(`| ${r.cu} | ${r.moi} | ${r.ten} |`);
}
writeFileSync(resolve(THU_MUC, "doi-ma-theo-nhom.md"), dong.join("\n"), "utf8");

console.log(`${bang.length} mặt hàng · đổi ${bang.filter((r) => r.cu !== r.moi).length} · giữ nguyên ${bang.filter((r) => r.cu === r.moi).length}`);
console.log(`mã mới ĐỤNG NHAU: ${dung.length ? dung.map(([m, n]) => `${m} (${n})`).join(", ") : "0"}`);
for (const [k, ds] of Object.entries(theoNhom)) {
  console.log(`\n── ${k} (${ds.length}) ──`);
  for (const r of ds.sort((a, b) => a.moi.localeCompare(b.moi)).slice(0, 5)) console.log(`   ${r.cu.padEnd(28)}→ ${r.moi}`);
  if (ds.length > 5) console.log(`   … còn ${ds.length - 5} mã`);
}
console.log(`\nDanh sách đầy đủ: nhap/doi-ma-theo-nhom.md`);

if (!THAT) { console.log("\n(BẢN NHÁP — thêm --that để đổi thật)"); process.exit(0); }
if (dung.length) { console.error("DỪNG: còn mã đụng nhau, không đổi."); process.exit(1); }

await goi("/api/method/login", { method: "POST", body: { usr: "dev@example.com", pwd: "local-dev-password-1" } });
let ok = 0, hong = 0;
for (const r of bang.filter((x) => x.cu !== x.moi)) {
  const kq = await goi("/api/method/frappe.client.rename_doc", {
    method: "POST", body: { doctype: "Item", old_name: r.cu, new_name: r.moi },
  });
  if (kq.ok) ok += 1;
  else { hong += 1; console.log(`  ✗ ${r.cu.padEnd(28)}→ ${r.moi}  (${kq.status}) ${kq.j?.message ?? ""}`); }
}
console.log(`\nđổi thành công ${ok} · hỏng ${hong}`);
