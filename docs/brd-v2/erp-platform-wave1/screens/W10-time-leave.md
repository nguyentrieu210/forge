# W10 — Chấm công, ca & nghỉ

## Khối 1 — Định danh

- Route: `/hr/time`; route con `/attendance`, `/shifts`, `/leave`, `/corrections`.
- Tác nhân: Employee, Line Manager, HR User/Manager, Payroll read.
- Dữ liệu: Attendance, Employee Checkin, Shift Type/Assignment, Leave Policy/Allocation/Application, Holiday List.

## Khối 2 — Layout desktop/mobile

- Desktop: lịch + bảng ngoại lệ; roster theo tuần; leave balance/requests; ba cột queue duyệt/correction.
- Mobile: “Hôm nay” card check-in/out hoặc request correction; lịch tháng gọn; request form full-screen; action duyệt bottom sheet.
- Không coi geolocation/device là bằng chứng duy nhất; mọi event có device/source/idempotency và chính sách riêng tư rõ.

### Khối 2b — 13 nghiệp vụ bắt buộc

| Mục | Quyết định |
|---|---|
| #7 Kanban | Exception/leave approval board; shift roster dùng calendar, không kéo vượt policy. |
| #8 AI | Giải thích balance/exception theo nguồn; không tự chấm công, sửa giờ hoặc duyệt nghỉ. |
| #18 Vòng đời | Attendance `draft→verified→locked/corrected`; leave `draft→pending→approved/rejected/cancelled`; shift versioned. |
| #2 Xóa | Checkin/audit không xóa; correction tạo event; draft request có thể soft-delete. |
| #4 Báo cáo | Attendance, overtime, absence, leave balance, exception aging; KPI drill-down. |
| #5+#12 Thông báo | In-app/email/Zalo cho ca sắp tới, thiếu check-out, leave status, manager SLA; không Web Push. |
| #6 Barcode | QR/kiosk check-in là tùy chọn có signed nonce và device policy; không nhận QR tĩnh replay. |
| #10 Media/QR/OCR | Bằng chứng correction/leave R2 private; QR chỉ là input, server chốt scope/time/device. |
| #11 In | Timesheet/attendance/leave report và đơn nghỉ PDF theo quyền. |
| #13 Mã tự động | Request/correction/shift assignment code server cấp; device event có external id unique. |
| #14 Lịch | Roster, holiday, leave, attendance đều có calendar; timezone theo branch. |
| #15 Tiện ích VN | Chip hôm nay/hôm qua, giờ ca, ngày tương đối, queue duyệt tiếp, badge ngoại lệ, cỡ chữ 3 mức. |
| #19 Master data | Shift, Leave Type/Policy, Holiday List, correction reason, device là master versioned. |

## Khối 3 — Component

| Component | Hành vi | Quyền |
|---|---|---|
| `TodayTimeCardMobile` / `AttendanceToolbarDesktop` | check event/request correction + policy status | employee own/HR |
| `ShiftRoster` | employee×date, overlap warnings, publish version | HR roles |
| `LeaveCalendarBalance` | balance, holiday, overlap, manager coverage | employee/manager/HR |
| `TimeExceptionQueue` | missing/duplicate/late/overtime/device anomalies | HR/manager scope |
| `CorrectionApprovalPanel` | source events, before/proposed/after, reason/evidence | approver |

## Khối 4 — Hành động

| Hành động | Validate/server | Thành công/lỗi |
|---|---|---|
| Check in/out | employee link, policy, device nonce/idempotency | event timeline; duplicate returns existing event |
| Publish shift roster | overlap, contract, rest policy, effectivity | versioned assignments + notifications |
| Gửi/duyệt leave | balance, overlap, holiday, manager tree, SoD | allocation updated atomically |
| Yêu cầu/duyệt correction | locked source, reason/evidence, approver | correction event; không sửa log gốc |
| Lock payroll inputs | HR/Payroll approval + exception zero | immutable input snapshot/hash |

## Khối 5 — Autofill

- Employee/company/branch/timezone từ session link; shift từ assignment hiệu lực.
- Leave dates tính working days từ holiday/shift policy; hiện công thức và dirty provenance.
- Correction prefill source event, không thay proposed time người dùng đã sửa.

## Khối 6 — 7 trạng thái

| Trạng thái | Hiển thị |
|---|---|
| Loading | Skeleton today/calendar/queue. |
| Chưa có dữ liệu | Nêu chưa có roster/allocation và CTA đúng role. |
| Lọc không ra | Xóa filter/date range. |
| Error | Device/policy/overlap lỗi cụ thể + việc tiếp theo. |
| Thiếu quyền | Own/team/org scope chốt server; 403 direct API. |
| Saved/success | Rung nhẹ nếu browser hỗ trợ và user bật; timeline/status highlight. |
| Mạng gián đoạn | Không ghi check-in/duyệt offline; giữ request draft, không queue/PWA. |
