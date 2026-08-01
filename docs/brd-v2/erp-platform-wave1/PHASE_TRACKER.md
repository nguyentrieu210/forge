# Theo dõi pha — ERP Platform Wave 1

Luồng áp dụng: **B — tính năng lớn trên app/nền tảng có sẵn**. PWA, service worker, Web Push và hàng đợi offline không thuộc phạm vi theo quyết định của chủ dự án.

| Pha/cổng | Trạng thái | Bằng chứng |
|---|---|---|
| Pha 1 — khảo sát và nghiên cứu | Hoàn tất | Workbook 1.000 điểm; nhật ký nguồn và khảo sát codebase trong hồ sơ Pha 1. |
| Cổng 1 — duyệt định hướng | Đã duyệt | Chủ dự án chốt nền tảng ERP tổng quát, không giới hạn xưởng nhôm. |
| Pha 2 — BRD 360° | Hoàn tất | `ERP_PLATFORM_WAVE1.md`, Entity/Flow/API catalog và 12 Screen Spec Card. |
| Cổng 2 — duyệt BRD | Đã duyệt | PR #152 đã squash-merge vào `main`, commit `13f91492`. |
| Pha 3 — thiết kế kỹ thuật | Hoàn tất | `technical/`, `field-ledgers/`, `docs/meta/doctype-meta.json`; Meta validator PASS, link/ledger/diff checks xanh. |
| Cổng 3 — duyệt thiết kế | Đã duyệt | Chủ dự án duyệt ngày 2026-08-01; PR #153 squash-merge vào `main`, commit `d4e89691`. |
| Pha 4 — chuẩn bị nhánh build | Hoàn tất | Nhánh `feat/erp-platform-wave1-g03-20260801`; baseline `pnpm.cmd run verify` PASS. |
| Cổng 4 — duyệt nhánh build | Đã duyệt | Chủ dự án duyệt triển khai và tiếp tục ngày 2026-08-01. |
| Pha 5 — build | Đang thực hiện | G03 đã hoàn thành; thứ tự tiếp theo G01 → G02 → G11. |
| Pha 6 — verify/QA | Đang thực hiện | G03 đã qua verify tổng, test quyền/SoD/delegation/audit và QA giao diện desktop/mobile; kế toán oracle thuộc G01. |
| Pha 7 — PR/release/deploy | Đang thực hiện | G03 đang ở bước PR/merge; Cloudflare production chỉ thực hiện sau G01, G02 và G11, kèm backup/canary/smoke. |

## Checklist luồng B

- [x] Khảo sát app hiện có, context, cấu trúc, migration và app registry.
- [x] BRD đầy đủ entity, flow, quyền, màn hình, phạm vi và giả định.
- [x] User duyệt Cổng 2.
- [x] Mở nhánh thiết kế từ `origin/main`, không viết thẳng vào `main`.
- [x] Field Ledger 9 cột cho mọi logical DocType/bảng vật lý thuộc Wave 1.
- [x] State machine cho mọi entity có trạng thái nghiệp vụ.
- [x] DocType Meta package chạy validator PASS.
- [x] Compatibility Matrix L0–L5 có bằng chứng và phần thiếu rõ ràng.
- [x] API, middleware, quyền server, audit, idempotency và optimistic lock được khóa.
- [x] Migration/rollback/backup/reconcile được thiết kế, chưa thực thi.
- [x] Scorecard Cổng 3 toàn xanh và user duyệt; PR thiết kế đã merge.
- [x] Mở nhánh build G03 từ `origin/main` sau Cổng 3.
- [x] Chạy baseline verify trên nhánh build: PASS; chỉ có cảnh báo tooling không chặn.
- [x] G03 build theo Field Ledger + Meta: organization scope, role policy, SoD, approval, delegation và audit.
- [x] G03 verify tổng: 781/781 server, 138/138 tenant Worker, 3/3 query Worker; typecheck và toàn bộ client build PASS.
- [x] G03 QA giao diện desktop/mobile cho trung tâm quyền, hộp duyệt và nhật ký kiểm toán.
- [ ] G01, G02 và G11 hoàn tất theo Field Ledger + Meta.
- [ ] Verify Wave 1 đầy đủ trước release; không deploy production khi gate đỏ.
