/**
 * DỰNG nhóm NAN/LÁ CỬA + tách phần phụ kiện lẫn trong đó.
 *
 * NGUỒN THẬT là sheet ĐM của `MS LIÊN BS.xlsx`, nên một mặt hàng xuất hiện nhiều lần dưới
 * NHIỀU VAI TRÒ — `sellable_product` (bán), `stock_item` (tồn), `bom_reference` (tiêu hao trong
 * định mức của từng sản phẩm). Tiền tố `TP-` và `NVL-` là hai vai trò của CÙNG một món, không
 * phải hai món:
 *      TP-BO 1VIS AL75   bán  ĐVT CON        }  một cái bọ:
 *      NVL-BO1VIS-AL75   tồn  ĐVT KG         }  mua Kg · bán Con
 * Gộp lại đúng bằng mô hình mua/tồn/bán, y hệt 7 cái bọ đã có sẵn trong kho.
 *
 * TIỀN TỐ THEO VẬT LIỆU, không theo nhóm hàng. Nhóm "Nan/lá cửa" trộn nhôm · tôn · inox · sắt,
 * nên một tiền tố nhóm sẽ nói sai về 3/4 số mã. Vật liệu thì mã nào cũng nói đúng thứ nó là.
 *
 * MÀU KHÔNG VÀO MÃ. Nguồn tách `NVL-RHM8-GS` / `-VK` / `-THÔ` thành ba mã cho cùng một cây ray;
 * màu là chiều của LÔ, không phải của mặt hàng.
 *
 * CHẠY:  node nhap/dung-nan-la-cua.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const THU_MUC = dirname(fileURLToPath(import.meta.url));
const GOC = resolve(THU_MUC, "..");
const NGUON = "alumdoor-nan-la-cua-2026-08-20";

const db = new DatabaseSync(resolve(GOC, "server/apps/tenant-worker/.wrangler/state/v3/d1/miniflare-D1DatabaseObject/0f70e06fc007ec84591c21ca1daaf09474ca2074a0d42ba21eb2a3fcdbb2cdf8.sqlite"), { readOnly: true });
const daCo = db.prepare("SELECT payload_json FROM documents WHERE tenant_id='demo' AND doctype='Item'")
  .all().map((r) => JSON.parse(r.payload_json));
db.close();

const chuan = (s) => String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .replace(/[đĐ]/g, "d").toUpperCase().replace(/[^A-Z0-9]/g, "");
const tenDaCo = new Map(daCo.map((x) => [chuan(x.item_name), x]));

const bg = JSON.parse(readFileSync(resolve(THU_MUC, "du-lieu/06-hang-hoa.json"), "utf8"))
  .ban_ghi.filter((x) => x.payload?.item_group === "Nan/lá cửa");

/** Vật liệu suy từ TÊN + MÃ — quyết định cả tiền tố lẫn bộ theo dõi. */
function vatLieu(ten, ma) {
  /**
   * CHUẨN HOÁ NFC TRƯỚC KHI SO.
   *
   * Tên trong nguồn dùng dấu TỔ HỢP: "BỌ" là B + O + dấu nặng rời, không phải ký tự Ọ liền.
   * So thẳng bằng /BỌ/ (dạng liền) thì trượt sạch — và cái bọ bị nhận nhầm thành thanh nhôm
   * vì tên nó có chứa mã nhôm ("BỌ 1VIS AL75"). Hỏng im lặng, phân loại sai mà không báo gì.
   */
  const t = `${ten} ${ma}`.normalize("NFC").toUpperCase();
  const co = (tu) => new RegExp("(^|[ _-])" + tu + "([ _-]|$)").test(t);
  if (co("BỌ")) return "BO";                    // cái kẹp — PHỤ KIỆN, không phải nan lá
  if (co("BÁT")) return "BAT";                  // cũng phụ kiện
  if (co("V4") || co("V5")) return "V4";        // trước TON: mã "NVL-V4-KEM-TOLE75" có chữ TOLE
  if (/INOX/.test(t)) return "INOX";
  if (/TÔN|TON-|TOLE/.test(t)) return "TON";
  if (/AL\d|ALVIP|VIPST|AL70|AL75/.test(t)) return "NHOM";
  return "LA";                                   // lá Tiến Đạt: A282, TD325/326/327, BỘ BA LÁ ĐÁY
}

/** Bọ và bát là PHỤ KIỆN, không phải nan lá — chủ xưởng chốt 20/08/2026. */
const LA_PHU_KIEN = new Set(["BO", "BAT"]);

/**
 * BA TẦNG — chủ xưởng mô tả 20/08/2026:
 *   ① NGUYÊN VẬT LIỆU (mua)      tôn cuộn · nhôm cây · ray · trục
 *   ② NAN/LÁ CỬA (tự sản xuất)   cán/cắt ra từ ①, BÁN ĐƯỢC
 *   ③ BỘ CỬA (tự sản xuất)       ghép từ ②, BÁN ĐƯỢC
 * Bán được ở cả ② lẫn ③ — đó là lý do có cả "lá trọn bộ" lẫn "cửa trọn bộ".
 *
 * NAN/LÁ TÍNH THEO M2, không Mét không Kg — chủ xưởng chốt. Lá là một mặt phẳng dài × rộng;
 * đo bằng mét thì mất chiều rộng, đo bằng kg thì mất cả hai. Và khách mua cửa theo m².
 *
 * Nguồn cũ khai lá là "Mua ngoài" hết — sai, vì lá là thứ xưởng LÀM RA. Khai sai chỗ này thì
 * không có định mức sản xuất nào chạy được: hệ thống tưởng lá cũng đi mua như tôn.
 */
const NHOM_NVL = "Tôn & nhôm cây";
/** Là nan/lá (tầng ②) nếu tên bắt đầu bằng LÁ — trừ "LÁ YẾM (TÔN LÁ YẾM)" vốn là tôn nguyên liệu. */
const laNanLa = (ten) => {
  /**
   * SO SÁNH KHÔNG DẤU, không so chữ có dấu trực tiếp.
   *
   * Chữ "LÁ" tồn tại ở hai dạng Unicode trông y hệt nhau — liền (U+00C1) và tách (A + dấu sắc).
   * Dữ liệu dùng dạng liền, mã nguồn này bị ghi ở dạng tách, nên phép so trượt sạch mà nhìn
   * bằng mắt không thấy sai chỗ nào. Bỏ dấu trước khi so là hết phụ thuộc vào dạng lưu.
   */
  const t = String(ten).normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[Đđ]/g, "D").toUpperCase();
  if (/TON LA YEM|\(TON/.test(t)) return false;   // tôn nguyên liệu, dù tên có chữ "lá"
  if (/MAU/.test(t)) return false;                // lá mẫu cho khách xem, không phải hàng sản xuất
  return /^(TP\s+)?LA(\s|$)/.test(t);
};

/**
 * NHÔM CÂY TỒN THEO **CÂY**, MUA THEO **KG** — chủ xưởng chốt 29/07/2026, nhắc lại 20/08/2026.
 *
 * Bằng chứng nằm ngay trong sổ tồn gốc `data/ton-nhom.xlsx`: mỗi mã nhôm có một sheet riêng,
 * và cột đếm là **SỐ LÁ**, không phải kg. Thợ ra kho đếm lá chứ không cân.
 *
 * TÔN thì KHÔNG có sheet nào trong sổ đó — tôn là cuộn, cân theo Kg. Nên không quét cả nhóm:
 * lấy đúng danh sách mã có mặt trong sổ tồn, đó mới là bằng chứng chứ không phải suy đoán.
 */
const DEM_LA = new Set([
  "AL75", "AL70 - 1 LỚP", "AL70 - 2 LỚP", "AL70 1.5MM", "VIPST500", "VIPST700", "AL50",
  "AL652", "AL752", "AL552", "AL501", "AL548", "AL503", "AL71", "AL595", "ALVIP50",
].map((x) => x.replace(/[^A-Z0-9]/gi, "").toUpperCase()));
/** Sổ gốc ghi `VIPST500`, danh mục ghi `ALVIPST500` — bỏ tiền tố AL rồi so, nếu không sót 2 mã. */
const demTheoLa = (ten) => {
  const k = String(ten).replace(/[^A-Z0-9]/gi, "").toUpperCase();
  return DEM_LA.has(k) || DEM_LA.has(k.replace(/^AL(?=VIPST)/, ""));
};

/**
 * QUYẾT ĐỊNH CỦA CHỦ XƯỞNG 20/08/2026 — ghi thành dữ liệu, không nhét rải rác trong luật.
 * Mỗi dòng ở đây là một câu trả lời cụ thể, đọc lại là biết vì sao mã đó khác nguồn.
 */
const CHU_XUONG = {
  /** Hai cái bát cùng tên trong nguồn, thật ra cho HAI LOẠI CỬA khác nhau — như vụ ĐINH TÁN. */
  "NVL-BAT-MV": { ten: "BÁT MẮT VÕNG (BẮT VÀO LÁ YẾM)" },
  "NVL-BAT-SN": { ten: "BÁT SONG NGANG (BẮT VÀO LÁ YẾM)" },
  /** Lá mẫu để KHÁCH XEM, không phải hàng bán. */
  "NVL-LAMAU-PHE": { ten: "LÁ MẪU ĐỨC (MẪU CHO KHÁCH XEM)", ban: false },
  /** BỘ BA LÁ ĐÁY = đáy lớn + trung gian + yếm, ba cái đã có mã riêng → bỏ, không dựng mã bộ. */
  "TP-BO3LADAY": { bo: true },
  /**
   * LÁ ĐẦU và BA LÁ ĐÁY tính theo MÉT, không m² — chúng có BẢN CỐ ĐỊNH.
   * Bản đã cố định thì mét dài đủ xác định diện tích; bắt khai thêm chiều rộng là bắt gõ lại
   * một con số không bao giờ đổi. Lá cán từ tôn thì ngược lại, bản thay đổi nên phải theo m².
   */
  "TP-A282":  { dvt: "Mét" },
  "TP-TD325": { dvt: "Mét" },
  "TP-TD326": { dvt: "Mét" },
  "TP-TD327": { dvt: "Mét" },
};
/** Cặp bọ nguồn viết lệch chữ (AL548 / 548) nên không tự ghép được; chủ xưởng xác nhận là MỘT. */
const GHEP_TAY = { "NVL-BO2VIS-AL50-VIP50-548-ST500": "TP-BO-2VIS-AL50-VIP50-AL548-ST500" };

/**
 * GỘP THEO THÂN MÃ, KHÔNG THEO TÊN.
 *
 * Gộp theo tên là sai: nguồn có hai cái BÁT cùng tên "BÁT (DÙNG BẮT VÀO LÁ YẾM)" mà thật ra là
 * bát mắt võng và bát song ngang — y như hai cái ĐINH TÁN đã phải tách ra. Và hai mã tôn kẽm
 * 1LY khác KHỔ (K124 / K175) cũng trùng tên.
 *
 * Chỉ gộp khi bỏ tiền tố TP-/NVL- xong thân mã GIỐNG HỆT — đó mới đúng là một món ghi hai vai trò.
 */
const thanMa = (ten) => chuan(String(ten).replace(/^(TP|NVL|HH)[-_ ]/, ""));
const theoTen = new Map();
for (const r of bg) {
  const k = thanMa(GHEP_TAY[r.name] ?? r.name);
  if (!theoTen.has(k)) theoTen.set(k, []);
  theoTen.get(k).push(r);
}

const moi = [], daTonTai = [], gopLai = [], boDi = [];
for (const [k, ds] of theoTen) {
  const yc = ds.map((x) => CHU_XUONG[x.name]).find(Boolean) ?? {};
  if (yc.bo) { boDi.push(ds[0].payload.item_name); continue; }
  const p0 = { ...ds[0].payload, ...(yc.ten ? { item_name: yc.ten } : {}) };
  const vl = vatLieu(p0.item_name, ds.map((x) => x.name).join(" "));
  const phuKien = LA_PHU_KIEN.has(vl);

  /** Vai trò BÁN cho ĐVT bán; vai trò TỒN cho ĐVT tồn & mua. Nguồn tách đôi, ta ghép lại. */
  const ban = ds.find((x) => x.payload.is_sales_item === 1 && x.payload.default_sales_uom);
  const ton = ds.find((x) => String(x.name).startsWith("NVL")) ?? ds[0];
  const tonKho = ton.payload.stock_uom;
  const demLa = !phuKien && demTheoLa(p0.item_name);
  const nanLa = !phuKien && laNanLa(p0.item_name);
  const uomBan = ban?.payload.default_sales_uom ?? p0.default_sales_uom ?? "";

  /** So theo TÊN với kho hiện tại — khoá gộp là thân mã nên không dùng lại được ở đây. */
  const tenK = chuan(p0.item_name);
  if (tenDaCo.has(tenK)) { daTonTai.push({ ten: p0.item_name, ma: tenDaCo.get(tenK).item_code }); continue; }
  if (ds.length > 1) gopLai.push({ ten: p0.item_name, tu: ds.map((x) => x.name), thanh: `${tonKho}→${uomBan || "(không bán)"}` });

  /** Giữ dấu phân cách thành `_` — `TON_UC38DK598` không ai đọc nổi, `TON_UC_3_8D_K598` thì đọc được. */
  const goc = (ds.find((x) => String(x.name).startsWith("NVL")) ?? ds[0]).name;
  const than = String(goc).replace(/^(TP|NVL|HH)[-_ ]/, "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[đĐ]/g, "D")
    .toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "")
    .replace(/^((TON|NHOM|LA|BO|BAT|V4|INOX)_?)+/, "");        // vật liệu đã ở tiền tố, không lặp lại
  const ma = phuKien ? `PKC_${vl}_${than}` : `${vl}_${than}`;

  moi.push({
    name: ma,
    payload: {
      item_code: ma, item_name: p0.item_name,
      item_group: phuKien ? "Phụ kiện chung" : (nanLa ? "Nan/lá cửa" : NHOM_NVL),
      item_nature: p0.item_nature,
      material_stage: nanLa ? "Bán thành phẩm" : p0.material_stage,
      supply_type: nanLa ? "Tự sản xuất" : "Mua ngoài",
      is_stock_item: true, is_purchase_item: !nanLa,
      is_sales_item: yc.ban === false ? false : (nanLa || Boolean(uomBan)),
      include_item_in_manufacturing: true,
      measurement_profile: nanLa ? (yc.dvt === "Mét" ? "Hàng thường" : "Tấm/Kính") : ((tonKho === "Kg" && !phuKien) ? "Nhôm cây/lá" : "Hàng thường"),
      stock_uom: nanLa ? (yc.dvt ?? "m2") : (demLa ? "Cây" : tonKho),
      ...(nanLa ? {} : { default_purchase_uom: demLa ? "Kg" : (ton.payload.default_purchase_uom ?? tonKho) }),
      ...(demLa ? {
        /** Cân thực tế: cây nào cũng khác cân, số lá và số kg là hai quan sát độc lập. */
        has_catch_weight: true, has_batch_no: true, weight_uom: "Kg", allow_negative_stock: false,
      } : {}),
      ...(nanLa ? { default_sales_uom: yc.dvt ?? "m2" } : (uomBan ? { default_sales_uom: uomBan } : {})),
      disabled: false, _migration_source: NGUON, _ma_cu: ds.map((x) => x.name).join(" + "),
    },
    title: p0.item_name, content: `${ma} ${p0.item_name}`,
  });
}

writeFileSync(resolve(THU_MUC, "du-lieu/14-nan-la-cua.json"), JSON.stringify({
  doctype: "Item", so_ban_ghi: moi.length, nguon: "06-hang-hoa.json nhóm Nan/lá cửa, gộp theo vai trò",
  ban_ghi: moi,
}, null, 1), "utf8");

console.log(`${bg.length} dòng nguồn → ${theoTen.size} tên hàng → ${moi.length} mã mới\n`);
console.log(`đã có sẵn trong kho, bỏ qua: ${daTonTai.length}`);
for (const d of daTonTai) console.log(`   ${String(d.ten).padEnd(34)}→ ${d.ma}`);
console.log(`\ngộp nhiều vai trò thành một mã: ${gopLai.length}`);
for (const g of gopLai) console.log(`   ${String(g.ten).padEnd(34)}${g.thanh.padEnd(14)}← ${g.tu.join(" + ")}`);
const theoNhom = {};
for (const r of moi) {
  const k = `${r.payload.item_group} · ${r.payload.measurement_profile} · ${r.payload.stock_uom}/${r.payload.default_purchase_uom}/${r.payload.default_sales_uom ?? "-"}`;
  (theoNhom[k] ??= []).push(r.name);
}
console.log("");
for (const [k, v] of Object.entries(theoNhom).sort((a, b) => b[1].length - a[1].length)) {
  console.log(`▌ ${String(v.length).padStart(2)} mã — ${k}`);
  console.log(`     ${v.slice(0, 5).join(", ")}${v.length > 5 ? ` … +${v.length - 5}` : ""}`);
}
