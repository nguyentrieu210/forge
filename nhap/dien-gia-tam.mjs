/**
 * GIÁ TẠM cho các mã bán được (`is_sales_item=1`) hiện KHÔNG có bất kỳ đơn giá nào.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * BỐI CẢNH — 21/08/2026
 * ─────────────────────────────────────────────────────────────────────────────
 * Đo trên D1 cục bộ: 16 mã bán được không có một dòng `Item Price` nào (không STANDARD, không
 * biến thể) — tức bán hàng bị chặn cứng "chưa khai đơn giá" ở những mã này. Chủ xưởng chốt: tự
 * điền giá tạm 100.000đ để bán hàng không bị chặn, NHƯNG số này là số BỊA, không phải giá thật.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * VÌ SAO `price_variant` KHÔNG PHẢI "STANDARD" — luật chi phối cả đợt hội tụ
 * ─────────────────────────────────────────────────────────────────────────────
 * `docs/ALUMDOOR-DANH-MUC-HOI-TU-20260819.md`: "thà từ chối và báo lỗi còn hơn tính ra một con
 * số sai trong im lặng." Nếu dòng giá tạm này mang `price_variant: "STANDARD"`, nó KHÔNG PHÂN
 * BIỆT ĐƯỢC với 218 mã đã có giá thật — người bán mở màn `sales-item-context.ts` sẽ thấy đúng
 * một con số, chốt đơn ở giá bịa mà không hề biết đó là giá tạm. Đó chính là "tính ra một con số
 * sai trong im lặng" mà luật cấm.
 *
 * Nên biến thể ở đây là `TAM_CHUA_CHOT` (Tạm — Chưa Chốt): bất kỳ ai đọc trường `item_price`
 * (chứa tên bản ghi, tên bản ghi chứa `price_variant`) trên `price_explain.item_price` hay đọc
 * `price_explain.note` khi có từ hai cách bán trở lên đều thấy ngay một mã lạ, không phải
 * `STANDARD` quen mắt — tự nó nói "đây là giá tạm, không phải giá đã chốt".
 *
 * `area_tier` giữ nguyên sentinel `MOI-DIEN-TICH` (không để trống — xem field `area_tier` của
 * doctype `Item Price` trong `server/briefs/alumdoor-v2.json`: để trống là `resolveAutoname`
 * ném lỗi vì đây là một khoá bắt buộc trong `naming`).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * AN TOÀN — mặc định CHỈ chạy thử
 * ─────────────────────────────────────────────────────────────────────────────
 * `lib/d1.mjs` không tự phân biệt chạy thử/ghi thật (các tầng `0X-*.mjs` ghi thẳng, không hỏi).
 * Script này thêm cờ riêng theo tinh thần "mặc định an toàn, ghi thật phải xin": không có `--that`
 * thì chỉ MỞ D1 Ở CHẾ ĐỘ READ-ONLY, không sao lưu, không mở phiên ghi, không đụng file D1.
 *
 * CHẠY:  node nhap/dien-gia-tam.mjs            (chạy thử, không đụng D1)
 *        node nhap/dien-gia-tam.mjs --that      (ghi thật — tạo phiên, sao lưu, ghi 'Item Price')
 */

import { DatabaseSync } from "node:sqlite";
import { moPhienGhi, ghiLo, dongPhien, inBaoCao, kiemThamChieu, DUONG_D1, TENANT } from "./lib/d1.mjs";
import { ALUMDOOR_PRICE_LIST, ALL_AREA_TIER, itemPriceName } from "../server/scripts/build-alumdoor-pricing-payload.mjs";

const THAT = process.argv.includes("--that");
const GIA_TAM = 100000;

/**
 * Biến thể giá TẠM — cố ý không phải `"STANDARD"` và không phải bất kỳ biến thể thật nào đang
 * chạy (`STANDARD`/`TRON_BO`/`TACH_MON`/`TANG_RAY`/`CHI_LA`/`KEO_TAY`/`MOTOR_NGOAI`). Đặt tên để
 * tự lộ diện khi đọc trên màn bán hàng, không lẫn vào như một giá đã chốt.
 */
const BIEN_THE_TAM = "TAM_CHUA_CHOT";

const clean = (v) => String(v ?? "").normalize("NFC").trim();

/**
 * Quét D1 để tìm mã bán được (`is_sales_item=1`) chưa có BẤT KỲ `Item Price` nào — đọc thật,
 * không hardcode danh sách, để script này còn đúng nếu danh mục đổi trước lúc `--that` chạy.
 *
 * ĐVT lấy đúng luật mà `Item Price.uom` dùng (`fetch_from: item_code.default_sales_uom`, xem
 * `build-alumdoor-pricing-payload.mjs::itemPriceDocument`): `default_sales_uom`, hụt thì mới
 * lùi về `stock_uom`. Không suy đoán ĐVT nào khác.
 */
function timMaThieuGia(db) {
  const items = db.prepare("SELECT name, payload_json FROM documents WHERE tenant_id=? AND doctype='Item'").all(TENANT);
  const daCoGia = new Set(
    db.prepare("SELECT payload_json FROM documents WHERE tenant_id=? AND doctype='Item Price'").all(TENANT)
      .map((r) => JSON.parse(r.payload_json).item_code)
      .filter(Boolean),
  );

  return items
    .map((r) => ({ name: r.name, payload: JSON.parse(r.payload_json) }))
    .filter((it) => {
      const banDuoc = it.payload.is_sales_item === true || it.payload.is_sales_item === 1;
      const maHang = clean(it.payload.item_code) || it.name;
      return banDuoc && !daCoGia.has(maHang);
    })
    .map((it) => ({
      item_code: clean(it.payload.item_code) || it.name,
      item_name: clean(it.payload.item_name),
      item_group: clean(it.payload.item_group),
      uom: clean(it.payload.default_sales_uom) || clean(it.payload.stock_uom),
      disabled: !!it.payload.disabled,
    }))
    .sort((a, b) => a.item_code.localeCompare(b.item_code));
}

function xayDungBanGhi(danhSach) {
  return danhSach.map((it) => {
    if (!it.uom) {
      throw new Error(`${it.item_code}: không có ĐVT bán (default_sales_uom và stock_uom đều trống) — không đoán được, dừng lại`);
    }
    const name = itemPriceName(ALUMDOOR_PRICE_LIST, it.item_code, it.uom, BIEN_THE_TAM, ALL_AREA_TIER);
    return {
      name,
      payload: {
        price_list: ALUMDOOR_PRICE_LIST,
        item_code: it.item_code,
        uom: it.uom,
        area_tier: ALL_AREA_TIER,
        price_variant: BIEN_THE_TAM,
        rate: GIA_TAM,
        currency: "VND",
        disabled: 0,
      },
      title: `${it.item_code} — GIÁ TẠM ${GIA_TAM.toLocaleString("vi-VN")}đ (CHƯA CHỐT)`,
      content: `${it.item_code} ${it.item_name} giá tạm chưa chốt ${it.item_group}`.trim(),
    };
  });
}

function inDanhSach(danhSach, banGhi) {
  console.log(`${THAT ? "GHI THẬT" : "chạy thử (thêm --that để ghi thật)"} · ${banGhi.length} mã cần giá tạm\n`);
  for (let i = 0; i < danhSach.length; i += 1) {
    const it = danhSach[i];
    const b = banGhi[i];
    console.log(
      `  → ${it.item_code.padEnd(28)} ${it.uom.padEnd(6)} nhóm=${it.item_group.padEnd(28)}`
      + `${it.disabled ? " [disabled]" : ""}\n      ${b.name}`,
    );
  }
}

if (!THAT) {
  const db = new DatabaseSync(DUONG_D1, { readOnly: true });
  try {
    const danhSach = timMaThieuGia(db);
    const banGhi = xayDungBanGhi(danhSach);
    inDanhSach(danhSach, banGhi);
    console.log(`\nBIEN_THE_TAM=${BIEN_THE_TAM} rate=${GIA_TAM} price_list=${ALUMDOOR_PRICE_LIST} area_tier=${ALL_AREA_TIER}`);
    console.log("DRY_RUN=OK — không đụng D1 (mở read-only, không sao lưu, không mở phiên ghi)");
  } finally {
    db.close();
  }
} else {
  const phien = await moPhienGhi({ tang: "gia-tam" });
  try {
    const danhSach = timMaThieuGia(phien.db);
    const banGhi = xayDungBanGhi(danhSach);
    inDanhSach(danhSach, banGhi);

    kiemThamChieu(phien, "Item", banGhi.map((b) => b.payload.item_code), "Giá tạm");
    kiemThamChieu(phien, "UOM", banGhi.map((b) => b.payload.uom), "Giá tạm");
    kiemThamChieu(phien, "Bậc diện tích", banGhi.map((b) => b.payload.area_tier), "Giá tạm");
    kiemThamChieu(phien, "Price List", [ALUMDOOR_PRICE_LIST], "Giá tạm");

    const kq = ghiLo(phien, "Item Price", banGhi);
    inBaoCao("gia-tam", kq, phien);
  } finally {
    dongPhien(phien);
  }
}
