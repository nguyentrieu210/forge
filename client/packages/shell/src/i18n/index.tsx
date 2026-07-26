/**
 * Re-export từ @metaforge/ui — i18n chuyển sang đó (Đợt 5) vì đó là package DUY NHẤT cả
 * shell LẪN views/controls đều đã phụ thuộc sẵn (xem @metaforge/ui/src/i18n/index.tsx).
 * Giữ file này để code cũ `import { useT } from "@metaforge/shell"` không phải sửa.
 */
export { I18nProvider, useI18n, useT, useLocale, type Locale } from "@metaforge/ui";
