import type { JsonObject } from "../../contracts/src/index.js";

export interface PricingContext {
  itemCode: string;
  qtyMicros: number;
  postingDate: string;
  priceList: string;
  documentCurrency: string;
  uom?: string;
  /** Missing/blank remains STANDARD for backward compatibility. */
  priceVariant?: string;
  /** Existing callers keep legacy behavior unless commercial composition asks for raw price. */
  applyPricingRules?: boolean;
  partyType?: "Customer" | "Supplier";
  party?: string;
  customerGroup?: string;
  supplierGroup?: string;
  /**
   * Diện tích tính tiền của dòng, m². Chỉ cần khi mặt hàng có thang giá theo bậc.
   *
   * Có mặt hàng bán theo BẬC DIỆN TÍCH: cùng một cửa, 3–4 m² là 590.000/m² còn trên 10 m² là
   * 520.000/m². Trước đây thang đó được biểu diễn bằng tám MÃ HÀNG khác nhau; nay là một mặt
   * hàng với tám dòng `Item Price` gắn `area_tier`.
   *
   * Bỏ trống thì chỉ những dòng giá không gắn bậc mới khớp — dòng có bậc bị loại. Như vậy một
   * caller cũ chưa biết truyền diện tích sẽ KHÔNG âm thầm lấy nhầm bậc; nó hoặc lấy đúng giá
   * chung, hoặc không tìm thấy giá và báo lỗi.
   *
   * ĐƠN VỊ: diện tích MỘT BỘ, không phải diện tích cả dòng. Tên trường giữ nguyên vì nó đã nằm
   * trong hợp đồng của bốn chỗ gọi, nhưng cận bậc (`min_area_sqm`) là của một bộ — brief ghi
   * thẳng "Diện tích tối thiểu tính tiền cho một bộ". Truyền diện tích cả dòng thì mọi dòng
   * nhiều bộ tụt xuống bậc rẻ hơn; dùng `areaTierBasisSqm(line)` để lấy đúng số.
   */
  billableAreaSqm?: number;
}

export interface ResolvedPrice extends JsonObject {
  rate_minor: number;
  rate: string;
  currency: string;
  currency_scale: number;
  item_price: string;
  price_variant: string;
  pricing_rule?: string;
  discount_percentage?: string;
}
