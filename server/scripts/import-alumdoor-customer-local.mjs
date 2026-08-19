#!/usr/bin/env node
/**
 * Vỏ mỏng. Thẩm quyền nạp Customer nằm ở lớp local-runner canonical.
 *
 * Giữ đường dẫn này vì `scripts/local-runner/customer-adapter.mjs` gọi thẳng vào đây và cổng bốn
 * file cũng kiểm đúng tên file này. Nội dung thật ở `customer-import-core.mjs`: từ 2026-08-19 nó
 * đọc `apps/alumdoor/docs/nguon/don-hang-xuat-hang/DS-KH-NCC.md` (448 đối tác → 403 khách) thay
 * cho `data/customer-export.xlsx` (4 cột × 1 dòng rác, không có cột Nhóm giá).
 *
 * `await import` chứ không phải `export`: core chạy ngay khi được nạp — đổi thành module có
 * export sẽ làm vỏ này thành no-op im lặng.
 */
await import('../../scripts/local-runner/customer-import-core.mjs');
