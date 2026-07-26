/**
 * Lọc nhanh theo khoảng thời gian — hôm nay / tuần / tháng / quý / năm.
 *
 * Vì sao cần: bộ lọc chuẩn chỉ cho chọn TỪNG NGÀY một, nên muốn xem "nhập hàng tháng này" phải
 * tự tính ngày đầu tháng, ngày cuối tháng rồi gõ vào hai ô. Ngày nào cũng làm vài lần thì đó là
 * thao tác thừa thuần tuý — và gõ sai một chữ số là ra bộ số liệu hoàn toàn khác mà không biết.
 *
 * Thuần hàm, không React: dễ kiểm và dùng chung được cho cả list lẫn báo cáo.
 */

export type DateRangeKey =
  | "today" | "yesterday" | "this_week" | "this_month" | "last_month"
  | "this_quarter" | "this_year" | "last_year";

export interface DateRange {
  from: string; // yyyy-mm-dd
  to: string;   // yyyy-mm-dd
}

/** yyyy-mm-dd theo giờ ĐỊA PHƯƠNG. `toISOString()` quy về UTC nên ở VN (UTC+7) sẽ lùi mất một
 *  ngày với mọi thời điểm trước 07:00 — chứng từ lập buổi sáng bị rơi ra ngoài khoảng lọc. */
function ymd(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function resolveDateRange(key: DateRangeKey, now = new Date()): DateRange {
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();

  switch (key) {
    case "today":
      return { from: ymd(now), to: ymd(now) };

    case "yesterday": {
      const x = new Date(y, m, d - 1);
      return { from: ymd(x), to: ymd(x) };
    }

    case "this_week": {
      // Tuần bắt đầu THỨ HAI (chuẩn VN), không phải Chủ nhật như mặc định của JS.
      const dow = (now.getDay() + 6) % 7; // 0 = thứ hai
      return { from: ymd(new Date(y, m, d - dow)), to: ymd(new Date(y, m, d - dow + 6)) };
    }

    case "this_month":
      // new Date(y, m+1, 0) = ngày cuối THÁNG m — tự đúng cả tháng 28/29/30/31.
      return { from: ymd(new Date(y, m, 1)), to: ymd(new Date(y, m + 1, 0)) };

    case "last_month":
      return { from: ymd(new Date(y, m - 1, 1)), to: ymd(new Date(y, m, 0)) };

    case "this_quarter": {
      const q = Math.floor(m / 3) * 3;
      return { from: ymd(new Date(y, q, 1)), to: ymd(new Date(y, q + 3, 0)) };
    }

    case "this_year":
      return { from: ymd(new Date(y, 0, 1)), to: ymd(new Date(y, 11, 31)) };

    case "last_year":
      return { from: ymd(new Date(y - 1, 0, 1)), to: ymd(new Date(y - 1, 11, 31)) };
  }
}

export const DATE_RANGE_LABELS: Array<{ key: DateRangeKey; labelKey: string }> = [
  { key: "today", labelKey: "range.today" },
  { key: "yesterday", labelKey: "range.yesterday" },
  { key: "this_week", labelKey: "range.this_week" },
  { key: "this_month", labelKey: "range.this_month" },
  { key: "last_month", labelKey: "range.last_month" },
  { key: "this_quarter", labelKey: "range.this_quarter" },
  { key: "this_year", labelKey: "range.this_year" },
  { key: "last_year", labelKey: "range.last_year" },
];

/**
 * Field ngày CHÍNH của một doctype — chỗ để áp khoảng lọc.
 * Ưu tiên ngày ghi sổ (thứ quyết định tồn kho) rồi mới tới ngày lập chứng từ.
 */
export function primaryDateField(fieldnames: string[]): string | undefined {
  const prefer = ["posting_date", "transaction_date", "schedule_date", "date", "creation"];
  return prefer.find((f) => fieldnames.includes(f));
}
