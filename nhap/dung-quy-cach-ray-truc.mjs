/**
 * DỰNG QUY CÁCH KỸ THUẬT cho họ RAY & TRỤC, rồi gắn vào từng mặt hàng.
 *
 * MỤC ĐÍCH THẬT: ô `Kg/m lý thuyết`.
 * 33 mã ray-trục đang có 33 dòng quy đổi Mét↔Kg bỏ trống. Khai hệ số trên TỪNG MẶT HÀNG là khai
 * lại cùng một con số nhiều lần — trục 114 dày 1.8ly nặng bao nhiêu kg mỗi mét là thuộc tính của
 * CÂY THÉP, không phải của mã hàng. Khai một lần ở quy cách thì mọi mã dùng chung quy cách đó
 * đều có, và sửa một chỗ là sửa hết.
 *
 * KHÔNG bịa số: `thickness_mm` đọc được từ tên nên điền; `theoretical_kg_per_m` để TRỐNG chờ
 * chủ xưởng — đó chính là thứ duy nhất còn thiếu.
 *
 * Sinh file; nhập bằng `node nhap/chay.mjs 09` (tầng 09 đọc du-lieu/09-*.json).
 */

import { DatabaseSync } from "node:sqlite";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const THU_MUC = dirname(fileURLToPath(import.meta.url));
const GOC = resolve(THU_MUC, "..");
const NGUON = "alumdoor-quy-cach-ray-truc-2026-08-20";

const db = new DatabaseSync(resolve(GOC, "server/apps/tenant-worker/.wrangler/state/v3/d1/miniflare-D1DatabaseObject/0f70e06fc007ec84591c21ca1daaf09474ca2074a0d42ba21eb2a3fcdbb2cdf8.sqlite"), { readOnly: true });
const items = db.prepare("SELECT payload_json FROM documents WHERE tenant_id='demo' AND doctype='Item'")
  .all().map((r) => JSON.parse(r.payload_json)).filter((x) => x.item_group === "Ray và trục");
db.close();

/** Mác vật liệu suy từ TÊN, vì tên nói chất liệu còn mã thì không. */
function mac(ten) {
  if (/INOX/i.test(ten)) return { ma: "INOX", ten: "Inox", ho: "Thép không gỉ" };
  if (/NHÔM/i.test(ten)) return { ma: "NHOM", ten: "Nhôm", ho: "Hợp kim nhôm" };
  if (/LÔNG/i.test(ten)) return { ma: "LONG", ten: "Sợi lông", ho: "Sợi tổng hợp" };
  if (/RON NHỰA/i.test(ten)) return { ma: "NHUA", ten: "Nhựa", ho: "Nhựa" };
  return { ma: "THEP", ten: "Thép", ho: "Thép các bon" };
}

/** `1.8LY`/`2.5 mm` → mm. `LY` = milimét trong cách gọi của xưởng. */
function doDay(s) {
  let m = s.match(/(\d+(?:[.,]\d+)?)\s*LY/i);
  if (m) return Number(m[1].replace(",", "."));
  m = s.match(/(\d+(?:[.,]\d+)?)\s*mm/i);
  if (m) return Number(m[1].replace(",", "."));
  return null;
}

/** Cỡ: trục theo PHI, ray theo khẩu độ U. */
function co(ten, ma) {
  let m = `${ten} ${ma}`.match(/U\s*(\d{2,3})/i);
  if (m) return { kieu: "RAY", co: `U${m[1]}` };
  m = `${ten} ${ma}`.match(/(?:TRỤC|TRUC|PHI|ỐNG KẼM|ONGKEM)\D{0,6}(\d{2,3})/i);
  if (m) return { kieu: "TRUC", co: `PHI${m[1]}` };
  m = ten.match(/(\d)P\b/);
  if (m) return { kieu: "RAY", co: `${m[1]}P` };
  /**
   * Ron và ray nhôm không có phi hay khẩu độ — nhưng vẫn cần quy cách, vì chúng cũng bán
   * Mét↔Kg nên vẫn phải có `Kg/m lý thuyết`. Khoá chúng theo VỊ TRÍ LẮP (đáy ray / cạnh ray):
   * đó mới là thứ phân biệt hai sợi ron cùng chất liệu.
   */
  if (/RON|LÔNG/i.test(ten)) {
    const viTri = /ĐÁY/i.test(ten) ? "DAY" : /CẠNH/i.test(ten) ? "CANH" : "KHAC";
    return { kieu: "RON", co: viTri };
  }
  if (/RAY/i.test(ten)) return { kieu: "RAY", co: "THUONG" };
  return null;
}

/** Mã cỡ → chữ đọc được. Cỡ dùng làm khoá phải sạch (không dấu), tên thì phải đọc được. */
const TEN_CO = { DAY: "đáy ray", CANH: "cạnh ray", KHAC: "", THUONG: "" };

const specs = new Map();
const ganVao = [];
for (const x of items) {
  const c = co(x.item_name, x.item_code);
  if (!c) { ganVao.push({ ma: x.item_code, ten: x.item_name, spec: null }); continue; }
  const mc = mac(x.item_name);
  const day = doDay(`${x.item_name} ${x.item_code}`);
  const specCode = `QC-${c.kieu}-${mc.ma}-${c.co}${day ? `-${String(day).replace(".", "_")}` : ""}`;
  if (!specs.has(specCode)) {
    specs.set(specCode, {
      name: specCode,
      payload: {
        spec_code: specCode,
        spec_name: `${({ TRUC: "Trục", RAY: "Ray", RON: "Ron" })[c.kieu]} ${mc.ten.toLowerCase()} ${TEN_CO[c.co] ?? c.co}${day ? ` dày ${day} mm` : ""}`.replace(/\s+/g, " ").trim(),
        material_grade: mc.ma,
        spec_type: c.kieu === "TRUC" ? "Ống/trục" : "Vật tư tuyến tính",
        item_group: "Ray và trục",
        section_code: c.co,
        ...(day ? { thickness_mm: day } : {}), // bỏ hẳn key nếu không đọc được, để ô trống chứ không lưu null
        note: "Kg/m lý thuyết CHƯA có — đây là con số cho ra hệ số quy đổi Mét↔Kg của mọi mã dùng quy cách này.",
        disabled: false,
        _migration_source: NGUON,
      },
      title: `${({ TRUC: "Trục", RAY: "Ray", RON: "Ron" })[c.kieu]} ${c.co}`,
      content: `${specCode} ${c.co} ${mc.ten}`,
      _ma: [],
    });
  }
  specs.get(specCode)._ma.push(x.item_code);
  ganVao.push({ ma: x.item_code, ten: x.item_name, spec: specCode });
}

const macDung = [...new Set([...specs.values()].map((s) => s.payload.material_grade))];
const TEN_MAC = { THEP: ["Thép", "Thép"], INOX: ["Inox", "Inox"], NHOM: ["Nhôm", "Nhôm"], NHUA: ["Nhựa", "Nhựa"], LONG: ["Sợi lông", "Khác"] }; // họ vật liệu PHẢI nằm trong Select của doctype

writeFileSync(resolve(THU_MUC, "du-lieu/13-mac-ray-truc.json"), JSON.stringify({
  doctype: "Material Grade", so_ban_ghi: macDung.length,
  nguon: "suy từ tên hàng nhóm Ray và trục",
  ban_ghi: macDung.map((m) => ({
    name: m,
    payload: { grade_code: m, grade_name: TEN_MAC[m][0], material_family: TEN_MAC[m][1], disabled: false, _migration_source: NGUON },
    title: TEN_MAC[m][0], content: `${m} ${TEN_MAC[m][0]}`,
  })),
}, null, 1), "utf8");

writeFileSync(resolve(THU_MUC, "du-lieu/13-quy-cach-ray-truc.json"), JSON.stringify({
  doctype: "Material Specification", so_ban_ghi: specs.size,
  nguon: "suy từ tên + mã hàng nhóm Ray và trục; Kg/m để trống chờ xưởng",
  ban_ghi: [...specs.values()].map(({ _ma, ...r }) => r),
}, null, 1), "utf8");

writeFileSync(resolve(THU_MUC, "du-lieu/13-gan-quy-cach.json"), JSON.stringify(ganVao, null, 1), "utf8");

console.log(`${items.length} mã ray-trục → ${specs.size} quy cách · ${macDung.length} mác (${macDung.join(", ")})`);
console.log(`không suy được quy cách: ${ganVao.filter((g) => !g.spec).length} mã`);
for (const g of ganVao.filter((g) => !g.spec)) console.log(`   · ${g.ma.padEnd(26)}${g.ten}`);
console.log("\nquy cách".padEnd(34) + "độ dày".padStart(8) + "   mã dùng");
for (const s of [...specs.values()].sort((a, b) => a.name.localeCompare(b.name))) {
  console.log(`  ${s.name.padEnd(32)}${String(s.payload.thickness_mm ?? "—").padStart(6)} mm   ${s._ma.join(", ")}`);
}
