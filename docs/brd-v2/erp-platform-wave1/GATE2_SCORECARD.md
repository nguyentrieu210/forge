# Cổng 2 — Scorecard BRD ERP Platform Wave 1

Ngày tự chấm: 2026-08-01
Phạm vi: G03 Organization & SoD, G01 VN Accounting, G02 HR & Payroll, G11 Operational Readiness
Kết luận: **11/11 tiêu chí xanh; sẵn sàng xin người dùng duyệt Cổng 2.**

| # | Tiêu chí | Trạng thái | Bằng chứng |
|---|---|---|---|
| 1 | 11 mục BRD đúng thứ tự | ✅ | `ERP_PLATFORM_WAVE1.md` mục 0–10. |
| 2 | Phạm vi/assumption/open question rõ, không âm thầm cắt roadmap | ✅ | Mục 0, 2, 8; A06 giữ toàn bộ backlog 1000 điểm. |
| 3 | Actors và quyền theo endpoint đủ, server là authority | ✅ | Mục 3, 6; `API_PERMISSION_MATRIX.md` với test 401/403/scope/mask/SoD. |
| 4 | Entities >10 đã tách catalog; mỗi entity có field/constraint/validate/quyền/ý nghĩa | ✅ | `ENTITY_CATALOG.md`, 33 entity/artifact; chuẩn hệ thống ghi riêng. |
| 5 | DocType Registry & View Policy phủ entity/artifact | ✅ | Cuối `ENTITY_CATALOG.md`; Pha 3 sinh meta/ledger chi tiết. |
| 6 | Flows >10 đã tách; actor-by-actor và nhánh lỗi | ✅ | `FLOW_CATALOG.md`, 12 luồng, mỗi luồng có bảng bước và error branches. |
| 7 | Screens >8 đã tách từng file; đủ Khối 1–6 | ✅ | `screens/W01` đến `W12`, 12/12 thẻ. |
| 8 | Mỗi màn có desktop/mobile riêng, 13 nghiệp vụ Khối 2b và 7 trạng thái | ✅ | 12/12 thẻ; bảng 13 dòng + bảng 7 trạng thái trong từng file. |
| 9 | Kế toán Việt Nam có version/effectivity/trace/close/reversal/legal sign-off | ✅ | W05–W08, F04–F08, entity G01 và API accounting. |
| 10 | PWA bị loại đúng quyết định; mobile responsive vẫn hoàn chỉnh | ✅ | A07/A08, mục 8 và trạng thái mạng của 12 thẻ; không service worker/offline queue/Web Push. |
| 11 | Không có mục treo hoặc nghiệp vụ giả; giới hạn parity và gate bằng chứng rõ | ✅ | Mục 0/8/9; W12; release không xanh thì không deploy. |

## Kiểm tra tự động trước xin duyệt

- Kiểm đủ 12 file screen, mỗi file có `Khối 1`, `Khối 2`, `Khối 2b`, `Khối 3`, `Khối 4`, `Khối 5`, `Khối 6`.
- Kiểm mỗi screen có đủ 13 dòng nghiệp vụ và 7 trạng thái.
- Quét các cụm từ biểu thị nội dung bỏ trống, dữ liệu mô phỏng hoặc hẹn xử lý ở lần sau.
- Quét không có yêu cầu build PWA/service worker/install/update/Web Push ngoài các câu nêu rõ “không áp dụng”.
- Kiểm liên kết Markdown nội bộ và branch sạch ngoài tài liệu Wave 1.

Kết quả kiểm riêng Wave 1: 12/12 thẻ đạt cấu trúc, 0 link hỏng, 0 cụm từ treo việc. Bộ kiểm tra BRD toàn repo hiện vẫn trả về năm phát hiện thuộc baseline trước Wave 1: một marker treo trong tài liệu `source-exact` cũ và bốn đường dẫn required bị ghép sai gốc `server/docs/docs`. Các phát hiện này không nằm trong 18 file thay đổi của BRD Wave 1; chúng được giữ làm đầu vào G11 thay vì bị che hoặc sửa lan ngoài phạm vi Cổng 2.

## Quyết định cần người dùng duyệt

Nếu Cổng 2 được duyệt, Pha 3 sẽ tạo:

1. Kiến trúc chi tiết và ADR delta cho 4 package.
2. Field Ledger 9 cột cho toàn bộ bảng thay đổi/thêm mới.
3. `docs/meta/doctype-meta.json`, View Policy và validator.
4. API/Zod/state machine/transaction/idempotency/permission design.
5. Migration/backfill/rollback, oracle fixtures và acceptance matrix.
6. Cổng 3 để duyệt thiết kế trước khi mở nhánh code.
