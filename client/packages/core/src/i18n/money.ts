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
 * Đợt gom luật trước giữ nguyên cả bốn kiểu để không đổi giao diện, và ghi rằng thống nhất
 * chúng là quyết định giao diện. **Nay đã quyết**, và không phải bằng cách chọn một kiểu
 * thắng — mà bằng một luật theo NGỮ CẢNH:
 *
 *   - trong bảng/lưới dày, tiêu đề cột đã mang đơn vị  → `plain`  (`1.234.567`)
 *   - số tiền đứng một mình, không ai nói hộ đơn vị    → `dong`   (`1.234.567 ₫`)
 *   - tiền không chắc là VND                            → `currency`
 *
 * Hai kiểu còn lại chỉ là dấu vết trôi dạt và đã bỏ: `dong-tight` (`1.234.567₫`) chỉ khác
 * `dong` một dấu cách, `dong-lower` (`1.234.567 đ`) chỉ khác một chữ. Không ngữ cảnh nào cần
 * tới chúng — hai nơi đang dùng đều rơi gọn vào luật trên.
 */

export type MoneyStyle =
  /**
   * `1.234.567` — chỉ số, không ký hiệu.
   *
   * Dùng trong BẢNG/LƯỚI dày, nơi tiêu đề cột đã mang đơn vị (lưới mua hàng ghi sẵn
   * "Đơn giá (VNĐ)"). Lặp ký hiệu ở từng ô chỉ làm loãng cột số.
   */
  | "plain"
  /**
   * `1.234.567 ₫` — ký hiệu đồng, có khoảng trắng.
   *
   * Dùng cho số tiền ĐỨNG MỘT MÌNH: giá sản phẩm, tổng giỏ hàng, con số tóm tắt — nơi
   * không có tiêu đề cột nào nói hộ đơn vị.
   */
  | "dong"
  /** Theo `Intl` với mã tiền tệ. Dùng khi tiền không chắc là VND. */
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
  // `Number(null)` và `Number("")` đều ra 0, còn `Number(undefined)` ra NaN. Mười bản `money()`
  // cũ đều thừa hưởng bất đối xứng đó, nên "không có số" hiện ra thành **0 đồng** ở chỗ này và
  // thành "—" ở chỗ kia. Trong ERP thì 0 là một giá trị nghiệp vụ THẬT (đã trả đủ, số dư bằng
  // không); dựng nó lên từ chỗ trống là nói dối dữ liệu. Nay cả ba đều là "chưa có số"; số 0
  // khai tường minh vẫn in ra 0.
  if (value === null || value === undefined) return invalid;
  if (typeof value === "string" && value.trim() === "") return invalid;
  const amount = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(amount)) return invalid;
  if (style === "currency") {
    const code = currency || "VND";
    const formatted = currencyFormatter(code).format(amount);
    return formatted === GROUPED.format(amount) && code !== "VND" ? `${formatted} ${code}` : formatted;
  }
  const grouped = GROUPED.format(amount);
  return style === "dong" ? `${grouped} ₫` : grouped;
}
