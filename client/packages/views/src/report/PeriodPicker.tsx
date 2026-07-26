/** @jsxImportSource react */
/**
 * Chọn KỲ BÁO CÁO — hai ô ngày + vài nút kỳ dựng sẵn.
 *
 * Mọi biểu kế toán đều mở đầu bằng đúng thao tác này, và kỳ hay dùng chỉ có vài cái (tháng này,
 * tháng trước, quý, năm). Bắt người dùng tự gõ ngày đầu và ngày cuối tháng mỗi lần là thao tác
 * thừa thuần tuý — gõ sai một chữ số là ra bộ số hoàn toàn khác mà không có gì báo.
 *
 * Nhãn lấy từ bộ dịch sẵn của bộ lọc danh sách ([[date-range]]), không đặt lại chuỗi mới.
 */
import { Button, Input, useT } from "@metaforge/ui";
import { resolveDateRange, DATE_RANGE_LABELS, type DateRangeKey } from "../list/date-range.js";

const MAC_DINH: DateRangeKey[] = ["this_month", "last_month", "this_quarter", "this_year"];

export interface PeriodPickerProps {
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
  /** kỳ dựng sẵn muốn hiện; mặc định tháng này / tháng trước / quý này / năm nay */
  presets?: DateRangeKey[];
  /** nhãn hai ô ngày — mặc định tiếng Việt vì đây là màn báo cáo kế toán */
  labelFrom?: string;
  labelTo?: string;
}

export function PeriodPicker({ from, to, onChange, presets = MAC_DINH, labelFrom = "Từ ngày", labelTo = "Đến ngày" }: PeriodPickerProps) {
  const t = useT();
  return (
    <>
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        {labelFrom}
        {/* max/min chéo nhau: chặn ngay việc chọn kỳ ngược (đến ngày < từ ngày) — báo cáo kỳ ngược
            không lỗi mà trả về bảng rỗng, người dùng tưởng không có dữ liệu. */}
        <Input type="date" value={from} max={to} onChange={(e) => onChange(e.target.value, to)} className="h-8 w-36" />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        {labelTo}
        <Input type="date" value={to} min={from} onChange={(e) => onChange(from, e.target.value)} className="h-8 w-36" />
      </label>
      <div className="flex flex-wrap gap-1">
        {presets.map((key) => {
          const r = resolveDateRange(key);
          const dangChon = r.from === from && r.to === to;
          const nhan = DATE_RANGE_LABELS.find((x) => x.key === key)?.labelKey;
          return (
            <Button
              key={key}
              size="sm"
              variant={dangChon ? "secondary" : "ghost"}
              className="h-8"
              aria-pressed={dangChon}
              onClick={() => onChange(r.from, r.to)}
            >
              {nhan ? t(nhan) : key}
            </Button>
          );
        })}
      </div>
    </>
  );
}
