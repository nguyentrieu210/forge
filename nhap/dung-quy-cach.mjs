/**
 * DỰNG DANH MỤC VẬT LIỆU — tách "chất gì / dày bao nhiêu / khổ nào" ra khỏi chuỗi mã.
 *
 * VÌ SAO TÁCH
 * Hôm nay độ dày được viết HAI LẦN: một lần trong mã, một lần trong tên. Chúng lệch nhau theo
 * hai quy luật đều tăm tắp — tôn Đài Loan lệch 0,08 mm (10 mã), tôn kẽm khổ 124 lệch 0,20 mm
 * (6 mã) — mà KHÔNG có dòng nào trong nguồn ghi phép trừ đó. Luật chỉ sống trong mã gõ tay:
 * không ai kiểm được, thêm mã mới là phải nhớ mà trừ.
 *
 * Tách ra thì hai con số thành hai Ô CÓ TÊN trong cùng một bản ghi:
 *   `Tên quy cách` = "6D"      ← xưởng gọi thế khi mua bán
 *   `Độ dày (mm)`  = 0,52      ← con số nằm trong mã
 * Vì sao chúng lệch thì ĐỂ TRỐNG. Mô hình không cần biết lý do: nếu có lý do thật thì hai ô
 * đều đúng, nếu là gõ sai thì sửa MỘT bản ghi thay vì lục 16 cái mã.
 *
 * CÁI GÌ KHÔNG ĐIỀN
 * `Khổ rộng (m)` để TRỐNG. Mã ghi `x124`, `x175`, `x598` — không có chỗ nào trong nguồn nói
 * đó là mm hay cm, mà đoán sai đơn vị thì sai gấp 10 lần và sai âm thầm. Ghi token thô vào
 * ghi chú, chờ chủ xưởng.
 *
 * CHẠY: node nhap/dung-quy-cach.mjs
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";


const THU_MUC = dirname(fileURLToPath(import.meta.url));
const GOC = resolve(THU_MUC, "..");
const NGUON_DI_TRU = "alumdoor-quy-cach-vat-lieu-2026-08-20";

/**
 * ĐỌC MÃ CŨ, GẮN VÀO MÃ MỚI.
 *
 * Độ dày THẬT (0,52 · 0,62 · 0,72 · 0,92) chỉ tồn tại trong mã CŨ. Mã chuẩn hoá dùng tên gọi
 * thương mại (6D · 7D · 8D · 1LY) nên con số đo được không còn ở đó nữa — danh mục này chính
 * là chỗ duy nhất giữ nó. Vì vậy phải suy từ `anh-xa-ma.json` (giữ cả hai đầu), KHÔNG suy từ
 * D1: đọc D1 sau khi đổi mã là mất sạch số đo thật.
 */
const anhXaMa = JSON.parse(readFileSync(resolve(THU_MUC, "du-lieu/anh-xa-ma.json"), "utf8"));
const truocGop = JSON.parse(readFileSync(resolve(THU_MUC, "du-lieu/06-hang-hoa.truoc-gop.json"), "utf8"));
const payloadCu = new Map(truocGop.ban_ghi.map((r) => [r.name, r.payload]));
const matHang = anhXaMa.anh_xa.map((r) => ({ ma: r.ma_cu, maMoi: r.ma_moi, ...(payloadCu.get(r.ma_cu) ?? {}) }));

/** MÁC VẬT LIỆU — chất gì. Suy từ mã + tên, cả hai phải đồng ý thì mới nhận. */
const MAC = [
  {
    ma: "TON-DL-MAU", ten: "Tôn màu Đài Loan", ho: "Thép mạ màu",
    nhan: (x) => /^NVL-TON-DL/.test(x.ma) && /-(XNVK|XNXLC|GUKU|TRXLC)$/.test(x.ma),
  },
  {
    ma: "TON-DL-KEM", ten: "Tôn kẽm Đài Loan", ho: "Thép mạ kẽm",
    nhan: (x) => (/^NVL-TON-DL/.test(x.ma) || /TOLEKEM/i.test(x.ma)) && !/-(XNVK|XNXLC|GUKU|TRXLC)$/.test(x.ma),
  },
  { ma: "TON-UC", ten: "Tôn Úc", ho: "Thép mạ màu", nhan: (x) => /^NVL-TOLE0\.\d+x598/.test(x.ma) },
  // CHỈ lá inox. `/INOX/` trần bắt cả lưới inox, ray inox, bản lề inox — không phải tôn tấm.
  { ma: "LA-INOX", ten: "Lá inox Đài Loan", ho: "Thép không gỉ", nhan: (x) => /^TP-LADLINOX/.test(x.ma) },
];

/** `D` = 1/10 mm, `LY` = 1 mm. Đây là quy ước nghề, không phải suy đoán từ dữ liệu. */
function doDayMm(chuoi) {
  const dai = chuoi.match(/(\d+(?:\.\d+)?)D-(\d+(?:\.\d+)?)D/i);
  if (dai) return { mm: null, tho: `${dai[1]}D-${dai[2]}D` };       // mã ghi cả một DẢI, không phải một số
  let m = chuoi.match(/(\d+(?:\.\d+)?)LY(\d)/i);                     // "1LY2" = 1,2 ly
  if (m) return { mm: parseFloat(`${m[1]}.${m[2]}`), tho: `${m[1]}LY${m[2]}` };
  m = chuoi.match(/(\d+(?:\.\d+)?)LY/i);
  if (m) return { mm: parseFloat(m[1]), tho: `${m[1]}LY` };
  m = chuoi.match(/(\d+(?:\.\d+)?)D(?![A-Za-z])/);
  if (m) return { mm: Math.round(parseFloat(m[1]) * 10) / 100, tho: `${m[1]}D` };
  m = chuoi.match(/TOLE(0\.\d+)x/i);                                 // tôn Úc ghi thẳng mm: TOLE0.35
  if (m) return { mm: parseFloat(m[1]), tho: `${m[1]}mm` };
  return { mm: null, tho: null };
}

const kho = (ma) => (ma.match(/x(\d{3})/) || [])[1] ?? null;

const quyCach = new Map();
const boQua = [];

for (const x of matHang) {
  const mac = MAC.find((m) => m.nhan(x));
  if (!mac) continue;

  // Tôn Úc ghi độ dày THẲNG bằng mm ngay trước khổ (`TOLE0.35x598`) nên phải đọc mã NGUYÊN,
  // cắt khổ trước là mất luôn độ dày.
  const day = /^NVL-TOLE0\./.test(x.ma) ? doDayMm(x.ma) : doDayMm(x.ma.replace(/x\d{3}/, ""));
  const k = kho(x.ma);
  if (day.mm === null && day.tho === null) { boQua.push(`${x.ma} — không đọc được độ dày`); continue; }

  const khoa = [mac.ma, day.tho, k].join("|");
  if (!quyCach.has(khoa)) {
    quyCach.set(khoa, { mac, day, kho: k, dung: [], tenThuongMai: new Set() });
  }
  const q = quyCach.get(khoa);
  q.dung.push(x.maMoi);
  // Tên thương mại = cách xưởng GỌI độ dày trong tên hàng. Đây chính là con số lệch với mã.
  const tm = doDayMm(x.item_name ?? "");
  if (tm.tho) q.tenThuongMai.add(tm.tho);
}

const banGhiMac = MAC
  .filter((m) => [...quyCach.values()].some((q) => q.mac.ma === m.ma))
  .map((m) => ({
    name: m.ma,
    payload: {
      grade_code: m.ma, grade_name: m.ten, material_family: m.ho,
      note: "Suy từ mã hàng + tên hàng, hai bên đồng ý. Khối lượng riêng chưa khai.",
      disabled: false, _migration_source: NGUON_DI_TRU,
    },
    title: m.ten,
    content: `${m.ma} ${m.ten} ${m.ho}`,
  }));

const banGhiQuyCach = [...quyCach.values()]
  .sort((a, b) => a.mac.ma.localeCompare(b.mac.ma) || (a.day.mm ?? 99) - (b.day.mm ?? 99))
  .map((q) => {
    const tm = [...q.tenThuongMai];
    const goi = tm.length === 1 ? tm[0] : q.day.tho;
    const spec = `QC-${q.mac.ma}-${q.day.tho}${q.kho ? `-K${q.kho}` : ""}`.replace(/\s+/g, "");
    const lech = q.day.mm !== null && tm.length === 1
      ? (doDayMm(tm[0]).mm ?? null) : null;
    const ghiChu = [
      q.kho ? `Khổ ghi trong mã: "${q.kho}" — CHƯA rõ mm hay cm, để trống ô Khổ rộng.` : null,
      lech !== null && Math.abs(lech - q.day.mm) > 0.001
        ? `Xưởng gọi "${goi}" (=${lech} mm) nhưng mã ghi ${q.day.mm} mm — lệch ${(lech - q.day.mm).toFixed(2)} mm. Lý do CHƯA biết; ghi cả hai, không sửa bên nào.`
        : null,
      q.day.mm === null ? `Mã ghi cả một DẢI "${q.day.tho}", không phải một độ dày.` : null,
      `Mặt hàng dùng: ${[...new Set(q.dung)].join(" · ")}`,
    ].filter(Boolean).join(" ");

    return {
      name: spec,
      payload: {
        spec_code: spec,
        spec_name: `${q.mac.ten} ${goi}${q.kho ? ` khổ ${q.kho}` : ""}`,
        material_grade: q.mac.ma,
        spec_type: "Cuộn",
        item_group: "Nan/lá cửa",
        thickness_mm: q.day.mm,
        note: ghiChu,
        disabled: false,
        _migration_source: NGUON_DI_TRU,
      },
      _ma_dung: [...new Set(q.dung)],
      title: `${q.mac.ten} ${goi}`,
      content: `${spec} ${q.mac.ten} ${goi} ${q.kho ?? ""}`.trim(),
    };
  });

const ra = (doctype, banGhi, nguon) => ({
  doctype, trich_luc_luc: new Date().toISOString(), nguon,
  so_ban_ghi: banGhi.length, ban_ghi: banGhi,
});

writeFileSync(resolve(THU_MUC, "du-lieu/09-mac-vat-lieu.json"),
  JSON.stringify(ra("Material Grade", banGhiMac, "suy từ mã + tên hàng trong D1"), null, 1), "utf8");
writeFileSync(resolve(THU_MUC, "du-lieu/09-quy-cach-vat-tu.json"),
  JSON.stringify(ra("Material Specification", banGhiQuyCach, "suy từ mã + tên hàng trong D1"), null, 1), "utf8");

console.log(`${banGhiMac.length} mác vật liệu · ${banGhiQuyCach.length} quy cách · phủ ${[...quyCach.values()].reduce((s, q) => s + q.dung.length, 0)} mặt hàng`);
for (const m of banGhiMac) {
  const q = banGhiQuyCach.filter((x) => x.payload.material_grade === m.name);
  console.log(`\n  ${m.payload.grade_name}  (${q.length} quy cách)`);
  for (const x of q) {
    const l = /lệch ([-\d.]+) mm/.exec(x.payload.note);
    console.log(`     ${String(x.payload.thickness_mm ?? "(dải)").padStart(6)} mm  gọi "${x.title.split(" ").pop()}"${l ? `   ← lệch ${l[1]} mm` : ""}   [${x._ma_dung.length} mã]`);
  }
}
if (boQua.length) console.log(`\nbỏ qua ${boQua.length}: ${boQua.join(", ")}`);
