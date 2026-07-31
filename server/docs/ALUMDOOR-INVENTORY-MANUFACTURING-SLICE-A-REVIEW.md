# ALUMDOOR INVENTORY / MANUFACTURING SLICE A REVIEW

Ngày review: **2026-07-31**.

Phạm vi review: PR `#27`, Slice A của nhánh `feat/inventory-manufacturing-item-catalog-20260731`.

Nguồn metadata authoritative: `server/briefs/alumdoor-v2.json`, version `2.0.34`.

## Kết luận

- Điểm review: **96/100**.
- Critical finding: **0**.
- High finding: **0** sau remediation.
- Merge quality threshold `>=95`: **PASS**.
- Merge execution gate: **chưa mở** cho tới khi GitHub Actions chạy thành công trên exact final HEAD.

Điểm số đánh giá chất lượng implementation trong phạm vi Slice A. Nó không thay thế CI, staging hoặc audit dữ liệu live.

## Rubric

| Hạng mục | Tối đa | Điểm | Bằng chứng |
|---|---:|---:|---|
| Business fit và scope discipline | 15 | 15 | BRD, technical plan, authoritative metadata v2.0.34, không mở rộng sang migration/production |
| Runtime correctness | 25 | 24 | composed Worker entrypoint, partial-save merge, fail-closed service binding, server-side Item invariants |
| Audit integrity và privacy | 20 | 19 | deterministic checksum, redaction, read-only CLI, disabled-row preservation, output ngoài repository |
| Automated tests và CI design | 20 | 18 | HTTP validator regression, planner/CLI tests, SQL/brief/lint/test/typecheck/build workflows; current provider run vẫn pre-run blocked |
| Operational safety | 10 | 10 | không mutation, không migration, không deploy, không secret, report raw ngoài Git |
| Documentation và maintainability | 10 | 10 | BRD, technical plan, audit guide, review scorecard và canonical handoff files |
| **Tổng** | **100** | **96** | **PASS threshold** |

## Findings và remediation

### F-01 — Remote audit bỏ mất Item disabled

- Mức trước sửa: **High**.
- Nguyên nhân: query `master_records` lọc `disabled=0`, trong khi report công bố `active_items` và `disabled_items`.
- Sửa tại `server/scripts/audit-alumdoor-catalog.mjs`:
  - đọc cả active và disabled master rows;
  - đưa trạng thái `disabled` vào JSON audit;
  - document row vẫn override master row theo `source_rank`.
- Regression:
  - disabled Item được đếm nhưng không tạo active-readiness finding;
  - source regression chặn việc tái xuất hiện `disabled=0`.
- Trạng thái: **Resolved**.

### F-02 — Service Item chưa chặn batch/serial tracking

- Mức trước sửa: **High**.
- Nguyên nhân: runtime invariant chặn kho/UOM/reorder nhưng chưa chặn `has_batch_no` và `has_serial_no`, không khớp audit planner.
- Sửa tại `server/apps-src/alumdoor-worker/src/item-catalog-invariants.ts`.
- Regression tại `server/tests/alumdoor-item-validator.test.mjs`.
- Trạng thái: **Resolved**.

### F-03 — Partial-save có fallback network khi thiếu service binding

- Mức trước sửa: **High**.
- Nguyên nhân: validator dùng global `fetch()` nếu `PLATFORM` binding vắng mặt, tạo đường hành vi không đúng kiến trúc service-binding.
- Sửa: fail closed khi thiếu `PLATFORM`; không gọi mạng ngoài binding.
- Trạng thái: **Resolved**.

### F-04 — Runtime cho phép stage/supply rỗng

- Mức trước sửa: **Medium**.
- Nguyên nhân: runtime chỉ từ chối enum sai khi field có giá trị, trong khi planner coi rỗng là invalid.
- Sửa: non-service Item bắt buộc có `material_stage` và `supply_type` thuộc enum cho phép.
- Regression cho cả field rỗng và enum sai.
- Trạng thái: **Resolved**.

### F-05 — Generated report có thể mặc định rơi vào repository

- Mức trước sửa: **Medium**.
- Sửa:
  - output mặc định sang OS temporary directory;
  - từ chối mọi `--output` nằm trong repository, kể cả report redacted.
- Regression cho default output và forbidden repository output.
- Trạng thái: **Resolved**.

## Acceptance criteria đã chứng minh bằng code/test

1. Audit command không có write/apply/fix mode.
2. Fixture, brief và tenant source dùng cùng planner.
3. Finding code, severity, counts và checksum deterministic.
4. Redacted finding không chứa document name hoặc referenced business value.
5. Source rỗng không được coi là catalog sạch.
6. Disabled Item được đếm nhưng không bị đánh lỗi readiness active.
7. Service Item bị chặn stock/manufacturing/batch/serial/reorder configuration.
8. Non-service Item bắt buộc có stage/supply hợp lệ.
9. Purchase/manufacturing eligibility được kiểm server-side.
10. Partial save ghép current record trước khi kiểm invariant.
11. Missing `PLATFORM` binding fail closed.
12. Report generated không được ghi trong repository.

## Gaps không phải code defect của Slice A

### Live tenant audit

Audit tenant `alu` vẫn cần chạy read-only và redacted từ môi trường vận hành có Cloudflare credential. Việc này là gate trước remediation dữ liệu và trước Slice B/C, không yêu cầu để merge công cụ audit/validator vào source branch.

### GitHub Actions current-head evidence

Các run hiện hành thất bại trước checkout/`Set up job`; job record không có steps và downloadable log không tồn tại. Cùng hiện tượng xảy ra trên nhiều workflow độc lập trong repository. Không test assertion, typecheck hoặc build command nào chạy trong các run đó.

Phân loại: **GitHub Actions pre-run infrastructure/configuration blocker, cause chưa đủ bằng chứng để thu hẹp**.

Không được chuyển PR sang ready hoặc merge cho tới khi required workflows PASS trên exact final HEAD.

## Merge checklist

- [x] Scope/BRD/plan approved.
- [x] Review score `96/100`.
- [x] Critical = 0.
- [x] High = 0.
- [x] Default branch synchronized.
- [x] PR conflict-free/mergeable sau sync gần nhất.
- [x] No migration, deploy, secret or production mutation.
- [ ] Inventory and Manufacturing CI PASS trên exact final HEAD.
- [ ] PR Validation PASS trên exact final HEAD.
- [ ] Chuyển PR khỏi draft sau khi hai check trên xanh.

## Rollback

Slice A không có migration hoặc data mutation. Rollback là revert các commit của PR, đưa Alumdoor Worker entrypoint về `src/index.ts`, và bỏ command/workflow audit. Không cần database rollback.
