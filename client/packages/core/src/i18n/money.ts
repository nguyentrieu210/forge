/**
 * Một luật định dạng tiền, một nơi giữ.
 *
 * Trước đây mười màn tự viết `money()` riêng, và chúng đã trôi dạt thành BỐN kiểu hiển thị
 * khác nhau cho cùng một con số:
 *
 *   1.234.567 ₫   (chấm công)          1.234.567₫   (storefront, website)
 *   1.234.567 đ   (lưới mua hàng)      1.234.567    (đơn bán, tạo đơn mua)
 *
 * cộng với cách xử lý giá trị hỏng mỗi nơi một khác (0, "—", hay trả nguyên chuỗi gốc).
 *
 * Module này gom LUẬT (locale vi-VN, không phần thập phân, cách xử lý số không hợp lệ) về
 * một chỗ, còn KIỂU hiển thị thì khai rõ ra bằng `MoneyStyle` — để bốn kiểu kia hiện thành
 * một danh sách nhìn thấy được, thay vì nằm rải rác trong mười hàm trùng tên.
 *
 * Thống nhất về một kiểu là quyết định giao diện, không phải quyết định kỹ thuật.
 */

export type MoneyStyle =
  /** `1.234.567` — chỉ số, không ký hiệu. */
  | "plain"
  /** `1.234.567 ₫` — ký hiệu đồng, có khoảng trắng. */
  | "dong"
  /** `1.234.567₫` — ký hiệu đồng, sát số. */
  | "dong-tight"
  /** `1.234.567 đ` — chữ "đ" thường. */
  | "dong-lower"
  /** Theo `Intl` với mã tiền tệ, mặc định VND. */
  | "currency";

export interface MoneyOptions {
  /** Kiểu hiển thị. Mặc định `plain`. */
  style?: MoneyStyle;
  /** Mã tiền tệ cho kiểu `currency`. Mặc định `VND`. */
  currency?: string;
  /** Trả về khi giá trị không phải số hữu hạn. Mặc định `—`. */
  invalid?: string;
}

const GROUPED = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 });

function currencyFormatter(currency: string): Intl.NumberFormat {
  try {
    return new Intl.NumberFormat("vi-VN", { style: "currency", currency, maximumFractionDigits: 0 });
  } catch {
    // Mã tiền lạ: Intl ném lỗi thay vì trả về gì đó đọc được.
    return GROUPED;
  }
}

export function formatMoney(value: unknown, options: MoneyOptions = {}): string {
  const { style = "plain", currency = "VND", invalid = "—" } = options;
  const amount = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(amount)) return invalid;
  if (style === "currency") {
    const code = currency || "VND";
    const formatted = currencyFormatter(code).format(amount);
    return formatted === GROUPED.format(amount) && code !== "VND" ? `${formatted} ${code}` : formatted;
  }
  const grouped = GROUPED.format(amount);
  if (style === "plain") return grouped;
  if (style === "dong") return `${grouped} ₫`;
  if (style === "dong-tight") return `${grouped}₫`;
  return `${grouped} đ`;
}
