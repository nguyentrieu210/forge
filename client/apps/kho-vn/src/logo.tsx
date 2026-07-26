/** @jsxImportSource react */
/**
 * Logo app — CÙNG một hình với favicon ở index.html.
 *
 * Vì sao phải trùng: trước đây thanh bên hiện chữ cái đầu của tên app trên nền cam, còn tab trình
 * duyệt hiện icon khác hẳn. Cùng một phần mềm mà hai chỗ hai hình thì người dùng không nhận ra
 * đâu là tab của mình khi mở nhiều tab — thứ họ tìm bằng mắt chính là cái icon đó.
 *
 * Vẽ bằng SVG nội tuyến (không phải file ảnh): nét ở mọi kích thước, đổi màu theo brand được, và
 * không thêm một request mạng nào — app này phải nhẹ để chạy trên sóng yếu giữa kho.
 */
export function KhoLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} role="img" aria-label="Quản lý kho">
      <rect width="32" height="32" rx="7" className="fill-primary" />
      {/* mái + thân kho + cửa cuốn ở giữa */}
      <path d="M6 14.5 16 8l10 6.5V25a1 1 0 0 1-1 1h-5v-7h-8v7H7a1 1 0 0 1-1-1z" className="fill-primary-foreground" />
    </svg>
  );
}
