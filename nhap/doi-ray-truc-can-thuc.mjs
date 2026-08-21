/**
 * ĐỔI 33 mã RAY & TRỤC sang mô hình "cân thực tế": MUA Kg · TỒN CÂY · BÁN Mét.
 *
 * VÌ SAO TỒN CÂY chứ không phải Kg như chốt trước: tầng cắt đếm bằng cây (`qty_bar`,
 * `Math.floor(số lượng)`). Không ai lập kế hoạch cắt từ một con số kilogram, và "trục nào còn
 * bao nhiêu" là câu mà tổng kg không trả lời được. Tiền vẫn theo Kg — hai con số đi song song
 * trên cùng một dòng chứng từ, đó chính là ý nghĩa của "cân thực tế".
 *
 * GIỮ BỘ THEO DÕI `Ống/trục`, không chuyển sang `Nhôm cây/lá`:
 *   · hợp đồng kiểm `stock_uom` TRÊN MẶT HÀNG, còn `stock_uom` trên bộ chỉ là ĐỀ XUẤT
 *   · bộ `Nhôm cây/lá` BẮT BUỘC khai màu — trục thép, ray sắt không có màu
 *   · bộ `Ống/trục` vẫn cho `inventory_mode = Nhôm cây/lá`, tức vẫn bật đủ luật nhôm
 *
 * HỆ SỐ QUY ĐỔI Mét→Cây ĐỂ TRỐNG: nó là 1 ÷ chiều dài cây, mà chiều dài cây chuẩn chủ xưởng
 * chưa đọc vào. Đoán một con số ở đây là làm sai sổ tồn, im lặng.
 *
 * CHẠY:  node nhap/doi-ray-truc-can-thuc.mjs [--that]
 */

const GOC = process.env.ALUMDOOR_API || "http://127.0.0.1:8799";
const THAT = process.argv.includes("--that");

let cookie = "", csrf = "";
async function goi(d, { method = "GET", body } = {}) {
  const res = await fetch(`${GOC}${d}`, { method, headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}), ...(csrf ? { "x-frappe-csrf-token": csrf } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const c = res.headers.get("set-cookie"); if (c?.startsWith("sid=")) cookie = c.split(";")[0];
  const n = res.headers.get("x-frappe-csrf-token"); if (n) csrf = n;
  const t = await res.text(); let j; try { j = JSON.parse(t); } catch { j = { raw: t }; }
  return { ok: res.ok, status: res.status, json: j };
}
const dn = await goi("/api/method/login", { method: "POST", body: { usr: process.env.FORGE_ADMIN_USER || "dev@example.com", pwd: process.env.FORGE_ADMIN_PASSWORD || "local-dev-password-1" } });
if (!dn.ok) throw new Error(`Đăng nhập hỏng: ${JSON.stringify(dn.json)}`);

const ds = await goi(`/api/resource/Item?filters=${encodeURIComponent(JSON.stringify([["item_group", "=", "Ray và trục"]]))}&limit_page_length=2000&fields=${encodeURIComponent('["name"]')}`);
const ma = (ds.json?.data ?? []).map((r) => r.name);
console.log(`${THAT ? "GHI THẬT" : "chạy thử (thêm --that để ghi)"} · ${ma.length} mã\n`);

let doi = 0, yen = 0, hong = 0;
for (const m of ma) {
  const g = await goi(`/api/resource/Item/${encodeURIComponent(m)}`);
  if (!g.ok) { console.log(`  ✗ ${m.padEnd(26)} không đọc được (${g.status})`); hong += 1; continue; }
  const d = g.json.data ?? {};

  /**
   * Giữ mọi dòng quy đổi chủ xưởng tự thêm; chỉ đảm bảo có đúng một dòng Mét, không dòng Cây.
   *
   * HỆ SỐ Mét PHẢI VỀ 0, KHÔNG ĐƯỢC KẾ THỪA SỐ CŨ. Bản trước viết
   * `conversion_factor: cu.find(...)?.conversion_factor ?? 0`, tức GIỮ LẠI con số đang có — mà
   * con số đang có sinh ra với nghĩa "1 Mét = 1,083 KG" (Kg/m lý thuyết, do `dien-kg-tren-met.mjs`
   * ghi khi đơn vị tồn còn là Kg). Đổi đơn vị tồn sang CÂY xong, đúng con số ấy được đọc thành
   * "1 Mét = 1,083 CÂY": số giữ nguyên, đơn vị đổi nghĩa, sổ tồn sai ~6,5 lần và KHÔNG có lỗi
   * nào nổ ra. Đo ngày 21/08/2026 trên bản chép D1 cổng 8810: cả 22 mã có Kg/m đều dính.
   *
   * Chính đầu tệp này đã chốt "hệ số Mét→Cây ĐỂ TRỐNG" — đây là làm cho mã khớp lời chốt đó.
   */
  const cu = d.uom_conversions ?? [];
  const quyDoi = [
    ...cu.filter((c) => c.uom !== "Mét" && c.uom !== "Cây" && c.uom !== "Kg"),
    { ...(cu.find((c) => c.uom === "Mét") ?? {}), uom: "Mét", conversion_factor: 0 },
  ];

  const moi = {
    ...d,
    stock_uom: "Cây",
    default_purchase_uom: "Kg",
    default_sales_uom: "Mét",
    measurement_profile: "Ống/trục",
    has_catch_weight: true,
    has_batch_no: true,
    weight_uom: "Kg",
    allow_negative_stock: false,
    uom_conversions: quyDoi,
  };
  const khac = ["stock_uom", "default_purchase_uom", "default_sales_uom", "measurement_profile", "has_catch_weight", "has_batch_no", "weight_uom"]
    .filter((k) => d[k] !== moi[k]);
  const quyDoiDaSach = cu.length === quyDoi.length
    && cu.every((c) => c.uom === "Mét" && Number(c.conversion_factor ?? 0) === 0);
  if (!khac.length && quyDoiDaSach) { yen += 1; continue; }
  if (!THAT) { console.log(`  → ${m.padEnd(26)} tồn ${String(d.stock_uom).padEnd(5)}→ Cây · bộ ${String(d.measurement_profile).padEnd(12)}→ Ống/trục · bật cân thực tế`); doi += 1; continue; }

  const p = await goi(`/api/resource/Item/${encodeURIComponent(m)}`, { method: "PUT", body: moi });
  if (!p.ok) { console.log(`  ✗ ${m.padEnd(26)} ${p.status} ${p.json?.message ?? JSON.stringify(p.json).slice(0, 220)}`); hong += 1; continue; }
  const r = p.json.data;
  console.log(`  ✓ ${m.padEnd(26)} mua ${r.default_purchase_uom} · tồn ${r.stock_uom} · bán ${r.default_sales_uom} · cân thực tế ${r.has_catch_weight ? "bật" : "TẮT"} · lô ${r.has_batch_no ? "bật" : "TẮT"}`);
  doi += 1;
}
console.log(`\nđổi ${doi} · đã đúng sẵn ${yen} · hỏng ${hong}`);
