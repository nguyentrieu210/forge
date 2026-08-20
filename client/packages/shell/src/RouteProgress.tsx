/** @jsxImportSource react */

/**
 * Dải tiến trình khi đang tải một màn.
 *
 * Đặt trong `fallback` của `<Suspense>`: nó xuất hiện đúng lúc chunk màn hình đang tải và
 * biến mất ngay khi tải xong — không hẹn giờ, không đoán. Đó là điểm khác quan trọng so với
 * nprogress của vben, vốn tự nhích một phần trăm bịa ra.
 *
 * Toàn bộ hình dạng nằm ở `.mf-route-progress` trong styles.css.
 */
export function RouteProgress({ label = "Đang tải màn hình" }: { label?: string }) {
  return (
    <div className="mf-route-progress" role="progressbar" aria-busy="true" aria-label={label}>
      <span className="sr-only">{label}</span>
    </div>
  );
}
