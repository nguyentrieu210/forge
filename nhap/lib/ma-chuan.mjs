/**
 * ĐẶT MÃ CHUẨN cho họ vật liệu / lá / cửa / ray.
 *
 * KHUÔN:  <LOẠI>-<MÁC>-<DÀY>[-K<KHỔ>][-<MÀU>][-<BIẾN THỂ>]
 *
 * LOẠI nói thứ nó LÀ GÌ — nhìn tiền tố là biết mua hay bán:
 *   NVL-TON   cuộn tôn nguyên liệu, tính Kg
 *   NVL-RAY   ray sắt
 *   TP-LA     lá đã cán — thành phẩm, KHÔNG kèm ray/trục
 *   TP-CUA    cửa trọn bộ — lá + ray + trục + V4
 * "Trọn bộ / tách món" nằm luôn trong tiền tố, bỏ được đuôi `TRONBO`.
 *
 * DÀY dùng TÊN GỌI THƯƠNG MẠI (6D, 8D, 1LY) chứ không dùng số đo thật.
 * Mã là để người gọi nhau, không phải để đo — số đo thật đã có ô riêng
 * `Material Specification.thickness_mm`. Quan trọng hơn: chọn tên gọi thì MÃ VÀ TÊN HÀNG NÓI
 * CÙNG MỘT THỨ, chấm dứt cả lớp lỗi "mã ghi 5.2D còn tên ghi 6D".
 *
 * KHỔ giữ token thô (124/175/598) vì chưa biết mm hay cm — đơn vị là việc của quy cách.
 *
 * MÀU KHÔNG VÀO MÃ. Tôn màu dùng bộ theo dõi "Nhôm cây/lá" với `require_color = true` và
 * `track_dimension_lot = true`, và `document-validation.ts` BẮT khai màu lúc nhập kho — nghĩa là
 * màu đã được ghi theo LÔ. Nhét thêm vào mã là ghi lần thứ hai cùng một sự thật, đúng cái bệnh
 * đã đẻ ra vụ độ dày lệch 0,08. Đo thêm cho chắc: hai màu XNVK/XNXLC cùng giá 280.000/Kg, cùng
 * độ dày, cùng khổ, cùng mác — không tầng nào cần chúng là hai mã.
 *
 * `TOLE` bị bỏ hẳn: nó chỉ là chữ "tôn" viết kiểu Pháp (tôle), mà xưởng đã dùng nó lẫn lộn cho
 * cuộn tôn, cho ray, và cho lá thành phẩm.
 *
 * Trả `null` nghĩa là mã KHÔNG thuộc họ này — giữ nguyên mã cũ, đừng ép vào khuôn.
 */

/** Độ dày viết một kiểu duy nhất: 6D · 8D · 1LY · 1.2LY. `1LY2` là cách viết khác của 1.2LY. */
const chuanDay = (s) => {
  if (!s) return null;
  let m = s.match(/(\d+)LY(\d)/i);            if (m) return `${m[1]}.${m[2]}LY`;
  m = s.match(/(\d+(?:[.,]\d+)?)\s*LY/i);     if (m) return `${m[1].replace(",", ".")}LY`;
  m = s.match(/(\d+(?:[.,]\d+)?)D(?![A-Za-zÀ-ỹ])/); if (m) return `${m[1].replace(",", ".")}D`;
  return null;
};

const MAC = (x) => {
  if (/LADLINOX/i.test(x.ma)) return "INOX";
  if (/TOLE0\.\d+x598/i.test(x.ma)) return "UC";
  if (/-(XNVK|XNXLC|GUKU|TRXLC)$/.test(x.ma)) return "DLM";   // có màu ⇒ tôn đã mạ màu
  // Cửa ĐL đi từ tôn MÀU: định mức của TP-CUADL6D ăn NVL-TON-DL5.2Dx124-XN* (ĐM.md dòng 1262).
  if (/CUADL/i.test(x.ma)) return "DLM";
  if (/TON-DL|TOLEKEM|TON-ST/i.test(x.ma)) return "DLK";
  return null;
};

const mau = (ma) => (ma.match(/-(XNVK|XNXLC|GUKU|TRXLC)$/) || [])[1] ?? null;
const kho = (ma) => (ma.match(/x(\d{3})/i) || [])[1] ?? null;

function maMoi(x) {
  // Ray sắt: phân biệt bằng khẩu độ U70/U100 và có ron hay không, KHÔNG phải bằng độ dày tôn.
  if (/^NVL-TOLE1\.\d+[xX]\d{3}/.test(x.ma)) {
    const u = (x.item_name.match(/U(\d+)/) || [])[1];
    const ly = (x.ma.match(/x(\d+(?:\.\d+)?)ly/i) || [])[1];
    const ron = /KHÔNG RON/i.test(x.item_name) ? "KRON" : "RON";
    const td = /TỰ DỪNG/i.test(x.item_name) ? "-TD" : "";
    return u ? `NVL-RAY-U${u}${ly ? `-${ly}LY` : ""}-${ron}${td}` : null;
  }

  const mac = MAC(x);
  if (!mac) return null;

  // Nguyên liệu hay thành phẩm KHÔNG đọc từ tiền tố cũ (tiền tố cũ sai 94 chỗ), mà đọc từ
  // `material_stage` + ĐVT tồn — hai trường đã khai đủ 438/438.
  const laThanhPham = x.material_stage === "Thành phẩm" || x.stock_uom === "m2";
  const tronBo = /TRONBO/i.test(x.ma) || /TRỌN BỘ/i.test(x.item_name);
  const loai = !laThanhPham ? "NVL-TON" : tronBo ? "TP-CUA" : "TP-LA";

  // Thành phẩm lấy độ dày từ TÊN (tên gọi thương mại), nguyên liệu cũng vậy — một hệ duy nhất.
  const day = chuanDay(x.item_name) ?? chuanDay(x.ma.replace(/x\d{3}/i, ""));
  if (!day) return null;

  const k = kho(x.ma);
  return [loai, mac, day, k ? `K${k}` : null].filter(Boolean).join("-");
}


export function maChuan(x) {
  return maMoi(x);
}
