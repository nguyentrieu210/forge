# AI HANDOFF

Ngày cập nhật: **2026-08-03**.

Tài liệu này chỉ lưu facts, checkpoints và business invariants của Forge. Không định nghĩa quy trình làm việc cho AI.

## Repository

- Repository: `nguyentrieu210/forge`.
- GitHub lưu code, branch, PR, commit và release history.
- `CURRENT_STATUS.md` lưu trạng thái dự án; `NEXT_TASKS.md` lưu backlog.

## HRM operational 1.5

- PR `#261` squash-merge tại `b3dc2cf59ec5c85a977833da6edc986ac1bfe6fb`.
- HRM scope: recruitment, hire-to-retire, leave, attendance/overtime, payroll inputs, employee expenses, goals/appraisal/training.
- Salary Slip/Payroll Entry/GL là accounting source of truth; HRM cung cấp payroll inputs, không có payroll ledger cạnh tranh.
- Submitted Salary Slip khóa các source Attendance/Leave/OT/Salary Structure Assignment/Additional Salary đã dùng; correction đi qua cancel/amend/rerun.
- `VN Payroll Rule` có effective period, legal source, approval metadata và formula evidence; rule đã dùng là append-only.
- `formula_json` hiện là audited/versioned evidence, chưa phải statutory PIT/BHXH evaluator.

## Production release evidence

- Checkpoint: `a0ae5f4f00a6be7311efcaff87c4caabea60f6be`.
- `stage-client-bundle.mjs` có thể tạo `/release.json` chứa `releaseSha` + `bundleHash`.
- `/health` chứng minh service sống; `/release.json` dùng đối chiếu revision UI đang phục vụ.

## UI deploy implementation

- Workflow: `.github/workflows/manual-release-alu.yml` (`ALU Build and Deploy`).
- UI fast path hiện có trigger push cho các nhánh UI và build runtime + warehouse mobile trước khi deploy Gateway.
- Full ALU deploy vẫn tồn tại trong cùng workflow qua `workflow_dispatch`.
- Các thay đổi workflow gần đây tập trung giảm thời gian setup/build và giảm false-fail sau deploy.

## Website/CMS v1

- PR `#254` squash-merge tại `b25fc30b0f37d1218cafbb4dac40e37479bba0b9`.
- Public API allowlist: `forge.website.manifest`, `forge.website.page`.
- Public Website resolver tenant-scoped và published-only.

## Business checkpoints

- Warehouse Cash schema/controller/ledger thuộc `vn-accounting`; Alumdoor consume qua integration metadata/generic routes.
- `gl_entries` là money source of truth; balance/daily usage là projections rebuildable.
- Party dimension không đồng nghĩa settle AR/AP; invoice settlement dùng canonical Payment Entry/payment allocation.
- Generic Bulk View hiện master-only; transaction/submittable/ledger cần controller-backed flow riêng.
