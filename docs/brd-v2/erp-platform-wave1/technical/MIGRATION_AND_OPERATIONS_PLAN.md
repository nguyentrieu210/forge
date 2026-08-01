# Kế hoạch migration, vận hành và rollback — ERP Platform Wave 1

Tài liệu này chỉ là thiết kế. Không migration nào được chạy trước khi Cổng 3 được duyệt và Pha 5 có backup/dry-run.

## 1. Nguyên tắc

- Additive trước, backfill idempotent, đọc tương thích hai phiên bản, rồi mới bật write path mới.
- Không đổi/xóa field/table cũ trong Wave 1; không rename phá vỡ manifest.
- Mỗi migration lưu version/checksum/kết quả; chạy lại không tạo trùng.
- Mỗi tenant migrate độc lập; thất bại tenant A không làm tenant B tiếp tục nhầm trạng thái.
- Ledger/audit không backfill bằng suy đoán. Trường thiếu nguồn được đánh `needs_review`/`need_legal_check` và chặn post.

## 2. Lát cắt migration

| Lát cắt | Additive | Backfill/kiểm tra | Feature gate |
|---|---|---|---|
| G03 | cài 6 DocType policy/security, role, workflow, index/projection cần thiết | Company/Branch/Department tree; user scope; conflict SoD | `erp_wave1_org_security` |
| G01 | cài policy/legal/TT99/tax/e-invoice/reconciliation; mở rộng period/JE | regime theo fiscal year, COA mapping coverage, opening/GL balance, legal source | `erp_wave1_vn_accounting` |
| G02 | nâng HRM manifest, field permission, payroll orchestration | Employee org links, contract dates, attendance duplicate, payroll mapping | `erp_wave1_hr_payroll` |
| G11 | ops DocType, schedules, evidence/backup config | backup baseline, restore clone, suite registry | `erp_wave1_reliability` |

## 3. TT99/2026 transition

1. Chụp bất biến source: company, fiscal year, regime cũ, COA, opening/trial balance, forms và reports.
2. Xác định applicability theo ngày bắt đầu năm tài chính; với doanh nghiệp từ 01/01/2026 trở đi, TT99 là kiểm tra lõi bắt buộc.
3. Nạp Legal Rule và các template Appendix I/II/III/IV có nguồn/chữ ký duyệt; thiếu bất kỳ module nào giữ `need_legal_check=true`.
4. Tạo TT99 Transition Map source account → target account, giữ legal code tách khỏi dimension quản trị.
5. Preview opening conversion; tổng debit/credit và trial balance trước/sau phải khớp theo chính sách rounding.
6. Chạy oracle report song song với chế độ cũ trong canary; không post nếu mismatch.
7. Publish policy theo fiscal-year boundary; giao dịch lịch sử tiếp tục dùng version cũ, không hồi tố âm thầm.

VAT/CIT/PIT/e-invoice/XML được migrate ở ruleset riêng, không lấy nhãn TT99 làm bằng chứng hợp lệ.

## 4. HR/payroll transition

- Employee phải có company/branch/department hợp lệ; record thiếu chuyển queue sửa dữ liệu, không tự gán mặc định.
- Bank/tax/insurance được chuẩn hóa và mask; bản gốc chỉ giữ theo chính sách retention đã duyệt.
- Contract/shift/attendance overlap được report, không tự ghi đè.
- Payroll đầu tiên chạy shadow: cùng input frozen, so gross/deduction/net theo employee và tổng batch với kết quả hiện hành.
- Chỉ khi zero unexplained variance mới cho approve/post. JE payroll có source batch duy nhất và rule trace.

## 5. Bảng vật lý/projection dự kiến

Kernel hiện hữu tiếp tục là source. Chỉ tạo projection nếu query JSON không đạt SLO hoặc cần UNIQUE D1 không biểu đạt an toàn:

| Tên dự kiến | Mục đích | Rollback |
|---|---|---|
| `erp_effective_scope_index` | user → company/branch/department, version policy | drop projection sau khi tắt feature; source DocType giữ nguyên |
| `erp_rule_effectivity_index` | loại rule/scope/effective interval/published version | rebuild từ DocType; không phải source pháp lý |
| `hr_attendance_unique_index` | employee/date guard bổ sung nếu index JSON hiện hữu thiếu | giữ migration `0035` nếu đã đủ; không tạo trùng |
| `ops_artifact_index` | backup/evidence checksum/R2 lookup | rebuild từ ops DocType/R2 manifest |

Pha 5 phải kiểm tra migration thực tế trước khi quyết định tạo. Không tạo bảng chỉ để “đúng thiết kế”.

## 6. Backup, canary và rollback

Trước mỗi tenant rollout: backup D1 + manifest/schema checksum + R2 inventory; xác minh artifact đọc được. Canary theo cohort nhỏ, theo dõi API error/latency, mutation conflicts, debit-credit, payroll totals, reconciliation và permission-denied anomaly.

Rollback ưu tiên:

1. Tắt feature flag/write path mới.
2. Roll back Worker/app manifest tương thích ngược.
3. Giữ bảng/field additive và dữ liệu mới ở trạng thái chỉ đọc; không xóa ledger/audit.
4. Nếu schema không backward-compatible, dùng forward fix đã rehearsal; không chạy downgrade phá dữ liệu.
5. Mở Incident Record, liên kết release/backup/evidence và reconcile trước khi đóng.

Restore production tại chỗ là break-glass, cần Owner + Auditor/Operator độc lập, recent-auth và cửa sổ được phê duyệt. Mặc định mọi rehearsal restore vào clone không thể route từ hostname production.

## 7. Reconciliation sau migration

- Count/hash theo DocType và trạng thái.
- Company/Branch/Department không orphan/cycle.
- Employee/Attendance/Payroll unique không vi phạm.
- GL tổng Nợ = tổng Có theo voucher/company/period; opening/trial balance khớp.
- Payroll batch tổng employee = gross/deduction/net và JE tương ứng.
- Rule version/effective interval không overlap; source/chữ ký/legal check đủ.
- File/XML/backup R2 checksum và quyền private đúng.
- Audit/outbox/receipt count khớp mutation sample.

Một check đỏ giữ tenant ở canary/feature-off; tuyệt đối không “chấp nhận tạm” với chênh lệch ledger hoặc quyền.
