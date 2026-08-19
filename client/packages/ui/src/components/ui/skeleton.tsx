import * as React from "react";
import { cn } from "../../lib/cn.js";

/**
 * Ô giữ chỗ khi đang tải.
 *
 * Dùng `--secondary` chứ KHÔNG phải `--muted`: nền vùng làm việc là `--background` (#f5f6f8),
 * còn `--muted` là #f8f9fb — chênh nhau khoảng 1%, nên trên đúng cái nền mà skeleton hay xuất
 * hiện nhất thì nó gần như vô hình. `styles.css` đã cố ý tách hai bậc bề mặt này (trước đây
 * chúng bằng nhau); skeleton chỉ đang lấy nhầm bậc.
 *
 * `--secondary` (#f1f3f5 sáng / #252a34 tối) là một bậc THẤY ĐƯỢC so với cả nền workspace lẫn
 * mặt card ở cả hai theme, nên ô giữ chỗ đọc ra là một vật thể chứ không phải một mảng trống.
 */
export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("animate-pulse rounded-md bg-secondary", className)} {...props} />;
}
