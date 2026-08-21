/**
 * ĐƯA 33 mã RAY & TRỤC về TỒN KG — chủ xưởng chốt 20/08/2026.
 *
 * ĐÁNH ĐỔI, nói trước:
 *   Tồn Kg thì KHÔNG trả lời được "trục nào còn mấy cây, cây nào dài bao nhiêu". Tầng cắt đếm
 *   bằng cây (`qty_bar`, `Math.floor`), nên nó ngừng dùng được cho nhóm này. Bù lại, hệ số quy
 *   đổi Mét→Kg CHÍNH LÀ kg/m — thứ đã có sẵn cho 23/33 mã, nên nhóm này bán mét được ngay.
 *
 * PHẢI ĐỔI BỘ THEO DÕI: bộ `Ống/trục` sinh ra `inventory_mode = "Nhôm cây/lá"`, mà hợp đồng của
 * chế độ đó đòi `stock_uom` là Cây/Lá/Đoạn. Giữ bộ cũ mà đổi sang Kg là khoá chết 33 mã.
 *
 * Dùng bộ RIÊNG "Ray và trục" (chủ xưởng chốt) thay vì mượn bộ `Cuộn`: cả hai đều cho tồn Kg, nhưng `Cuộn` giữ
 * `track_dimension_lot` nên lô vẫn ghi được màu · tình trạng · chiều dài. Mất tầng CẮT, không
 * mất tầng LÔ. `Hàng thường` thì mất cả hai.
 *
 * Runtime phải BẬT (đi qua API). Sau khi chạy phải chạy lại `bat-inventory-mode.mjs`.
 * CHẠY:  node nhap/ray-truc-ve-ton-kg.mjs [--that]
 */
const GOC = process.env.ALUMDOOR_API || "http://127.0.0.1:8799";
const THAT = process.argv.includes("--that");

let cookie = "", csrf = "";
async function goi(d, { method = "GET", body } = {}) {
  const res = await fetch(`${GOC}${d}`, {
    method,
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}), ...(csrf ? { "x-frappe-csrf-token": csrf } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const c = res.headers.get("set-cookie"); if (c?.startsWith("sid=")) cookie = c.split(";")[0];
  const n = res.headers.get("x-frappe-csrf-token"); if (n) csrf = n;
  const t = await res.text(); let j; try { j = JSON.parse(t); } catch { j = { raw: t }; }
  return { ok: res.ok, status: res.status, json: j };
}

const dn = await goi("/api/method/login", { method: "POST", body: { usr: "dev@example.com", pwd: "local-dev-password-1" } });
if (!dn.ok) throw new Error(`Đăng nhập hỏng: ${JSON.stringify(dn.json)}`);

const ds = await goi(`/api/resource/Item?filters=${encodeURIComponent(JSON.stringify([["item_group", "=", "Ray và trục"]]))}&limit_page_length=2000&fields=${encodeURIComponent('["name"]')}`);
const ma = (ds.json.data ?? []).map((r) => r.name);

/** Quy cách → kg/m, để lấp thẳng vào hệ số quy đổi Mét→Kg. */
const specs = await goi(`/api/resource/Material Specification?limit_page_length=2000&fields=${encodeURIComponent('["name","theoretical_kg_per_m"]')}`);
const kgm = new Map((specs.json.data ?? []).map((s) => [s.name, s.theoretical_kg_per_m]));

console.log(`${THAT ? "GHI THẬT" : "chạy thử (thêm --that để ghi)"} · ${ma.length} mã\n`);

let doi = 0, coHeSo = 0, hong = 0;
for (const m of ma) {
  const g = await goi(`/api/resource/Item/${encodeURIComponent(m)}`);
  if (!g.ok) { console.log(`  ✗ ${m.padEnd(26)} không đọc được (${g.status})`); hong += 1; continue; }
  const d = g.json.data;
  const kg = kgm.get(d.material_specification);

  /** Một dòng quy đổi Mét; hệ số = kg/m nếu quy cách đã có số, còn không thì để trống. */
  const cu = d.uom_conversions ?? [];
  const quyDoi = [
    ...cu.filter((c) => c.uom !== "Mét" && c.uom !== "Kg" && c.uom !== "Cây"),
    {
      ...(cu.find((c) => c.uom === "Mét") ?? {}),
      uom: "Mét",
      conversion_factor: kg && kg > 0 ? kg : 0,
      ...(kg && kg > 0 ? { note: `1 Mét = ${kg} Kg, lấy từ Kg/m lý thuyết của ${d.material_specification}` } : {}),
    },
  ];

  const moi = {
    ...d,
    stock_uom: "Kg", default_purchase_uom: "Kg", default_sales_uom: "Mét",
    measurement_profile: "Ray và trục",
    /** Cân thực tế và theo dõi lô KHÔNG còn nghĩa khi tồn đã là Kg — tắt để không khai thừa. */
    has_catch_weight: false, has_batch_no: false,
    uom_conversions: quyDoi,
  };
  if (!THAT) {
    console.log(`  → ${m.padEnd(26)}tồn ${String(d.stock_uom).padEnd(4)}→ Kg   hệ số Mét ${kg && kg > 0 ? kg : "(trống)"}`);
    doi += 1; if (kg > 0) coHeSo += 1; continue;
  }
  const p = await goi(`/api/resource/Item/${encodeURIComponent(m)}`, { method: "PUT", body: moi });
  if (!p.ok) { console.log(`  ✗ ${m.padEnd(26)}${p.status} ${String(p.json?.message ?? "").slice(0, 90)}`); hong += 1; continue; }
  const r = p.json.data;
  const hs = (r.uom_conversions ?? []).find((c) => c.uom === "Mét")?.conversion_factor;
  console.log(`  ✓ ${m.padEnd(26)}mua ${r.default_purchase_uom} · tồn ${r.stock_uom} · bán ${r.default_sales_uom} · 1 Mét = ${hs || "(trống)"} Kg`);
  doi += 1; if (hs > 0) coHeSo += 1;
}
console.log(`\nđổi ${doi} · có hệ số quy đổi ${coHeSo}/${doi} · hỏng ${hong}`);
