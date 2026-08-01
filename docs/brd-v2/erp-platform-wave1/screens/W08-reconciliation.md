# W08 — Đối soát & control tower

## Khối 1 — Định danh

- Route: `/accounting/reconciliation`; route con `/runs/:id`, `/cases/:id`.
- Tác nhân: General Accountant, Chief Accountant, Payroll Manager read, Auditor.
- Dữ liệu: Reconciliation Run/Case, snapshot facts, bank/AR/AP/subledger/GL/payroll/tax references.

## Khối 2 — Layout desktop/mobile

- Desktop: KPI chênh lệch + filter `as_of`; ba cột exception queue → match/detail → lineage/resolution; bảng tổng expected/actual/difference.
- Mobile: case cards ưu tiên số tiền/risk/age; detail và resolution là hai màn stack; bulk action nằm trên bottom bar, không che nav.
- Run lớn là job nền có progress/cancel an toàn; result snapshot immutable; không so số lấy ở hai thời điểm khác nhau.

### Khối 2b — 13 nghiệp vụ bắt buộc

| Mục | Quyết định |
|---|---|
| #7 Kanban | Case board `open→investigating→proposed→resolved/reopened`; mobile action sheet. |
| #8 AI | Gợi ý nguyên nhân/match từ dữ liệu được phép, kèm nguồn/confidence; không tự đóng case/post adjustment. |
| #18 Vòng đời | Run `queued→running→completed/failed`; Case như trên, close cần resolution ref. |
| #2 Xóa | Snapshot/case không xóa; run lỗi archive theo retention. |
| #4 Báo cáo | Aging chênh lệch, match rate, unresolved amount, root cause; mọi KPI drill-down. |
| #5+#12 Thông báo | In-app/email/Zalo cho case quá hạn/chênh lớn/run fail; gom theo owner/ngày; không Web Push. |
| #6 Barcode | Không áp dụng; bank reference/VietQR là text match có checksum/policy. |
| #10 Media/QR/OCR | Bank statement/evidence private; OCR/parser tạo staging, không post trực tiếp. |
| #11 In | Reconciliation statement, case evidence, close pack PDF/XLSX. |
| #13 Mã tự động | Run/case/adjustment proposal code server cấp. |
| #14 Lịch | Calendar run schedule, case due date và close milestone. |
| #15 Tiện ích VN | VND, tìm 4 số cuối/mã chuyển khoản, hàng tổng ghim, queue mode, màu quá hạn/âm nhất quán. |
| #19 Master data | Match rule, tolerance, reason, owner routing là settings versioned; ngưỡng không hardcode. |

## Khối 3 — Component

| Component | Hành vi | Quyền |
|---|---|---|
| `ReconciliationRunPanel` | type/scope/as_of/progress/evidence | Accountant |
| `ExceptionQueueDesktop` / `CaseCardsMobile` | sort risk/value/age, bulk assign | scoped accounting roles |
| `MatchWorkbench` | candidates, amounts, dates, references, confidence | Accountant |
| `LineageResolutionPanel` | source/subledger/GL/report + proposal/ref | Accountant/Chief/Auditor |
| `ReconciliationDashboard` | KPIs compare period and drill-down | read permission |

## Khối 4 — Hành động

| Hành động | Validate/server | Thành công/lỗi |
|---|---|---|
| Chạy đối soát | same `as_of`, scope, no duplicate active run | job + immutable snapshot |
| Match/unmatch | totals/tolerance, optimistic lock | case progress; conflict 409 có latest data |
| Đề xuất adjustment | reason/account/dimension/period | linked draft JE, chưa post |
| Duyệt resolution | Chief khác người đề xuất, SoD, document posted | resolved + audit/lineage |
| Reopen case | new evidence/reversal | reopened event, không sửa lịch sử |

## Khối 5 — Autofill

- `as_of` mặc định cuối ngày/kỳ gần nhất; scope từ company/branch switch.
- Candidate match theo amount/date/reference/party, hiện lý do/confidence; không tự commit.
- Resolution template theo case kind; account/tolerance lấy settings versioned, không ghi đè dirty.

## Khối 6 — 7 trạng thái

| Trạng thái | Hiển thị |
|---|---|
| Loading | Skeleton KPI/queue/detail; job progress thật. |
| Chưa có dữ liệu | CTA chạy reconciliation theo quyền. |
| Lọc không ra | Hiện filter chips và xóa lọc. |
| Error | Run/case/panel lỗi độc lập, retry an toàn + correlation ID. |
| Thiếu quyền | Amount/source fields mask; cross-branch API 403. |
| Saved/success | Case highlight/chuyển cột, toast có “Duyệt tiếp”. |
| Mạng gián đoạn | Không match/resolve/run; giữ note draft, không queue/PWA. |
