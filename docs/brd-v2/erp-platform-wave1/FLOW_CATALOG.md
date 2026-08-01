# Flow Catalog — ERP Platform Wave 1

Mọi bước ghi dữ liệu dùng idempotency key, optimistic lock và audit cùng transaction. Lỗi hiển thị tiếng Việt theo công thức “chuyện gì xảy ra + làm gì tiếp”; không mất form/filter.

## F01 — Thiết lập cây tổ chức

| Bước | Tác nhân | Hành động | Server chốt | Kết quả |
|---|---|---|---|---|
| 1 | Owner | Tạo Company | mã/MST duy nhất | Company draft. |
| 2 | Chief Accountant | Chọn currency, fiscal start, accounting model | recent-auth + policy | Company active. |
| 3 | HR Manager | Tạo Branch/Department | cùng company, cây không chu trình | Cây tổ chức versioned. |
| 4 | System Manager | Gán user scope | scope là tập con quyền người gán | Assignment hiệu lực. |
| 5 | Auditor | Xuất evidence | read-only + audit export | Hồ sơ cấu hình. |

Nhánh lỗi: trùng MST/mã → link bản ghi hiện có; parent tạo chu trình → chỉ rõ node gây vòng; đổi accounting model sau phát sinh sổ → chặn và hướng dẫn migration được duyệt.

## F02 — Publish quyền và SoD

| Bước | Tác nhân | Hành động | Server chốt | Kết quả |
|---|---|---|---|---|
| 1 | System Manager | Soạn Role Policy | action/field/row DSL whitelist | Draft version. |
| 2 | System Manager | Mô phỏng theo user/resource | deny-by-default compiler | Effective permission diff. |
| 3 | Auditor | Kiểm SoD | conflict graph | Danh sách block/warn. |
| 4 | Owner khác người soạn | Publish | recent-auth + four-eyes | Version active. |
| 5 | System | Revoke cache/session nếu cần | version bump | Quyền mới có hiệu lực và audit. |

Nhánh lỗi: policy làm owner mất đường cứu hộ → chặn; người soạn tự duyệt → chặn SoD; expression ngoài whitelist → 422; policy conflict → chỉ ra role/action cụ thể.

## F03 — Duyệt và ủy quyền

| Bước | Tác nhân | Hành động | Server chốt | Kết quả |
|---|---|---|---|---|
| 1 | Người lập | Submit chứng từ | validate + kỳ + scope | Pending đúng cấp. |
| 2 | Engine | Tính approver | type, amount, branch, SoD | Approval task. |
| 3 | Approver/Delegate | Approve/reject | quyền tại thời điểm bấm, delegation hiệu lực | Bước duyệt append-only. |
| 4 | Engine | Chuyển cấp/post queue | tất cả bước required pass | Approved hoặc rejected. |

Nhánh lỗi: hết hạn ủy quyền → 403 và chuyển approver gốc; chứng từ đã đổi sau submit → invalidate approval cũ; cùng actor lập + duyệt khi SoD block → từ chối.

## F04 — Publish ruleset kế toán/pháp lý

| Bước | Tác nhân | Hành động | Server chốt | Kết quả |
|---|---|---|---|---|
| 1 | Tax Specialist | Nhập văn bản, scope, hiệu lực | field pháp lý bắt buộc | Rule draft. |
| 2 | Accountant | Map account/form/scenario | account active + coverage | Mapping draft. |
| 3 | Test runner | Chạy fixture/golden cases | deterministic + expected output | Evidence. |
| 4 | Chief Accountant + legal signer | Approve/publish | four-eyes + no overlap | Rule effective theo ngày. |

Nhánh lỗi: overlap ruleset cùng scope → chặn; thiếu source/approval → không publish; fixture lệch → giữ draft; kỳ lịch sử giữ version cũ, không hồi tố âm thầm.

## F05 — Chứng từ đến sổ cái

| Bước | Tác nhân | Hành động | Server chốt | Kết quả |
|---|---|---|---|---|
| 1 | Accountant | Tạo draft từ source doc | source còn hiệu lực, dimension đủ | Draft JE/invoice/payment. |
| 2 | Engine | Tính account/tax/dimension | ruleset theo posting date | Preview + rule trace. |
| 3 | Approver | Approve | policy + SoD | Approved. |
| 4 | Chief Accountant | Post | kỳ, debit=credit, idempotency | GL/subledger append-only. |
| 5 | Accountant | Reverse/amend khi sai | lý do + link original | Reversal/new amendment. |

Nhánh lỗi: hard lock → chặn; soft close → chỉ adjustment đủ lý do/duyệt; mất cân bằng → chỉ rõ dòng; account hết hiệu lực → đề nghị account map hợp lệ; double-submit → trả kết quả cũ.

## F06 — Đối soát kế toán

| Bước | Tác nhân | Hành động | Server chốt | Kết quả |
|---|---|---|---|---|
| 1 | Engine | Tạo snapshot AR/AP/bank/subledger/GL | cùng `as_of` | Expected/actual. |
| 2 | Accountant | Xem exception queue | row scope + mask | Case có nguyên nhân gợi ý. |
| 3 | Accountant | Match hoặc lập adjustment | không sửa ledger trực tiếp | Resolution draft. |
| 4 | Chief Accountant | Duyệt/post resolution | SoD + kỳ | Case resolved. |
| 5 | Auditor | Drill source→GL→report | read-only lineage | Evidence export. |

Nhánh lỗi: snapshot khác thời điểm → không cho so; bank line match nhiều chứng từ → cần người chọn; chênh lệch rounding ngoài policy → chặn; case không có resolution ref không được đóng.

## F07 — Khóa và mở lại kỳ

| Bước | Tác nhân | Hành động | Server chốt | Kết quả |
|---|---|---|---|---|
| 1 | Chief Accountant | Chạy close checklist | reconciliation/tax/payroll gates | Ready/blocked list. |
| 2 | Chief Accountant | Soft close | không còn blocker P0 | Chỉ adjustment được duyệt. |
| 3 | Auditor | Xác nhận evidence | hash/report snapshots | Evidence pack. |
| 4 | Chief Accountant + Owner | Hard lock | four-eyes | Mọi post bị khóa. |
| 5 | Owner + Auditor | Reopen khẩn cấp | recent-auth, lý do, timebox | Tạm open + alert + audit. |

Nhánh lỗi: còn payroll/GL mismatch hoặc e-invoice lỗi → chặn; reopen không timebox → chặn; hết timebox tự relock và báo owner.

## F08 — Hire-to-payroll-to-GL

| Bước | Tác nhân | Hành động | Server chốt | Kết quả |
|---|---|---|---|---|
| 1 | HR User | Tạo Employee + Contract | mã duy nhất, scope, contract dates | Employee active. |
| 2 | HR/Employee | Chấm công, nghỉ, ca, bổ sung | chống trùng/overlap + approval | Inputs được chốt. |
| 3 | Payroll User | Preview payroll | input hash + rule version | Salary slips draft. |
| 4 | Payroll Manager | Verify/approve | gross-net reconcile + exceptions zero | Payroll approved. |
| 5 | Accountant | Tạo accounting batch | account/dimension mapping | JE draft. |
| 6 | Chief Accountant | Post | JE balance + kỳ open | GL + payable. |
| 7 | Employee | Xem/tải phiếu lương | own-record + mask | Payslip có version/print audit. |

Nhánh lỗi: input thay đổi sau preview → invalidated và rerun; nhân viên thiếu bank/tax/rule → exception; duplicate payroll period/employee → chặn; payroll và GL lệch → không post.

## F09 — Self-service và manager approval

| Bước | Tác nhân | Hành động | Server chốt | Kết quả |
|---|---|---|---|---|
| 1 | Employee | Gửi leave/advance/correction | own employee + policy | Pending request. |
| 2 | Line Manager | Duyệt hàng đợi | manager tree + delegation | Approved/rejected. |
| 3 | HR/Payroll | Xử lý nghiệp vụ sau duyệt | role + scope | Attendance/leave/payroll input. |
| 4 | Employee | Theo dõi timeline | own-record | Trạng thái và lý do minh bạch. |

Nhánh lỗi: không liên kết Employee↔User → chặn và hướng dẫn HR; vượt balance/limit → nêu số còn lại; manager vắng → delegation hợp lệ hoặc escalated theo policy.

## F10 — Backup và restore rehearsal

| Bước | Tác nhân | Hành động | Server chốt | Kết quả |
|---|---|---|---|---|
| 1 | Cron/Operator | Tạo backup | resolve đúng customer DB, checksum | Snapshot R2 private. |
| 2 | Operator | Chọn restore clone | không ghi đè production mặc định | Clone isolated. |
| 3 | Engine | Restore + migrate | schema/version compatible | Clone running. |
| 4 | Verifier | Đếm/hash/reconcile ledgers | fixture + query set | Pass/fail evidence. |
| 5 | Auditor | Ký rehearsal | mọi check pass | RPO/RTO evidence. |

Nhánh lỗi: checksum sai → quarantine; thiếu binding → fail-closed; reconcile lệch → không chứng nhận; in-place restore cần break-glass + hai người duyệt.

## F11 — Release và rollback

| Bước | Tác nhân | Hành động | Server chốt | Kết quả |
|---|---|---|---|---|
| 1 | Release Manager | Tạo candidate từ SHA | working tree/release manifest sạch | Candidate draft. |
| 2 | CI/Verifier | Chạy unit/integration/e2e/oracle/security/perf/restore | suite required | Gate summary. |
| 3 | Release Manager | Canary | backup + migration dry-run + all green | Canary cohort. |
| 4 | Operator | Quan sát SLO/reconciliation | error/latency/business invariants | Rollout hoặc pause. |
| 5 | Operator | Rollback khi vi phạm | artifact + migration policy | Phiên bản trước, incident trace. |

Nhánh lỗi: một gate đỏ → không deploy; canary ledger mismatch → rollback ngay; rollback schema không tương thích → dùng forward fix theo runbook đã test.

## F12 — Sự cố production

| Bước | Tác nhân | Hành động | Server chốt | Kết quả |
|---|---|---|---|---|
| 1 | Monitor/Operator | Mở incident | dedupe alert | Incident SEV. |
| 2 | Operator | Khoanh tenant/module/release | correlation/trace | Blast radius. |
| 3 | Incident Commander | Pause jobs/release hoặc rollback | break-glass + audit | Giảm ảnh hưởng. |
| 4 | Domain owner | Reconcile dữ liệu | invariant queries | Dữ liệu an toàn. |
| 5 | Owner/Auditor | Đóng + action items | evidence/root cause | PIR và backlog trace. |

Nhánh lỗi: không xác định scope → ưu tiên fail-closed cho mutation nhạy cảm; audit/ledger nghi hỏng → legal hold và chỉ đọc; không đóng incident khi reconciliation chưa xanh.
