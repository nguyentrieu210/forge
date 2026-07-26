/**
 * Style dùng chung cho MỌI control nhập liệu (Input/Textarea/Select/Checkbox/Switch/…).
 *
 * Lý do gom về một chỗ: trước đây mỗi primitive tự viết một bộ, dẫn tới 4 kiểu focus khác nhau
 * (`ring-[3px] ring-ring/25` · `ring-2 ring-ring` · `focus:` thay vì `focus-visible:` · không có
 * gì cả), 2 chiều cao lệch nhau (Input 34px vs Select 36px — đứng cạnh nhau là so le), và
 * shadow lúc có lúc không. Sửa ở đây là sửa cho tất cả.
 */

/** Vòng focus chuẩn — ĐẶC (không phải glow mờ 25%) + offset, chỉ hiện khi dùng bàn phím. */
export const focusRing =
  "outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

/**
 * Chiều cao/viền/nền/chữ chung cho control 1 dòng.
 * `text-base md:text-[13px]`: dưới 16px, Safari iOS TỰ PHÓNG TO trang khi focus vào ô nhập và
 * không thu lại — nên trên màn hình nhỏ dùng 16px, từ md trở lên mới về 13px cho đúng mật độ dày.
 */
export const controlBase =
  "h-8 rounded-md border border-input bg-background text-base md:text-[13px] transition-colors " +
  "disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-muted " +
  "aria-[invalid=true]:border-destructive aria-[invalid=true]:border-[1.5px]";
