# NEXT TASKS

Ngày cập nhật: **2026-07-31**.

## P0 — Hoàn tất PR #69

1. Lấy exact final HEAD và merge commit SHA của `chore/optimize-ci-cd-v2-20260731`.
2. Xác minh PR vẫn mergeable và không chậm default.
3. Kiểm workflow/check trên exact final HEAD:
   - `PR Validation`;
   - `Business Domain CI` nếu GitHub nhận workflow mới trên PR;
   - `UI Pull Request Validation` nếu scope phù hợp.
4. Đọc đúng failed step/log; không sửa code nếu job chưa checkout hoặc không có steps.
5. Kiểm branch protection required check names, đặc biệt các check cũ từ workflow đã xóa.
6. Giữ PR draft cho tới khi required checks PASS.
7. Không merge nếu người dùng chưa yêu cầu rõ.

## P0 — Actions không tạo run/status

Nếu exact final HEAD vẫn không có run:

1. Kiểm Actions repository settings và quyền chạy workflow.
2. Kiểm billing/spending limit, policy và runner availability.
3. Kiểm workflow YAML/expression trên default và PR merge ref.
4. Kiểm event `pull_request` có được tạo cho draft/synchronize hay không.
5. Phân loại là pre-run/configuration/infrastructure blocker nếu không có steps/log.
6. Không tạo commit nghiệp vụ để chữa một runner chưa chạy.

## P0 — Workflow inventory sau merge

Workflow mục tiêu:

- `pr-validation.yml`.
- `business-domain-ci.yml`.
- `ui-pr-validation.yml`.
- `gateway-release-candidate.yml`.
- `gateway-production-release.yml`.
- `tenant-production-release.yml`.
- `purchase-completion-apply.yml` tạm thời cho PR #63.

Sau khi PR #63 kết thúc:

1. Xác nhận không còn gate phụ thuộc `purchase-completion-apply.yml`.
2. Xóa workflow tạm.
3. Cập nhật runbook/status.

## P1 — Dry verification cho immutable release

Không deploy production trong PR #69.

Sau khi PR merge và có yêu cầu riêng:

1. Chạy `Gateway Release Candidate` trên exact CI-green SHA.
2. Kiểm artifact `release.json` có đúng target SHA và immutable version ID.
3. Không promote production trong cùng checkpoint candidate.
4. Khi được yêu cầu release, nhập đúng SHA/version ID vào `Gateway Production Release`.
5. Xác minh workflow không build frontend lại.
6. Ghi run ID, version ID, smoke và provider evidence vào `CURRENT_STATUS.md`.

## P1 — Functional production smoke: Sales price autofill

- Tenant production version hiện hành: `7542bba4-dc20-4794-8c92-9d26af349531`.
- Dùng tài khoản và dữ liệu thử có thể huỷ/xoá an toàn.

Kiểm:

1. Price List + Item + UOM tự điền đơn giá/thành tiền.
2. Đổi UOM không lấy chéo giá.
3. Đổi Price List tải lại giá.
4. Item Price tên legacy/non-canonical vẫn khớp theo field.
5. Disabled/malformed/duplicate active prices không trở thành rate hợp lệ.
6. Lưu chứng từ thử để xác minh server authoritative, rồi huỷ/xoá.

## P1 — Functional production smoke: Dialog child-table dropdown

- Gateway production version hiện hành: `b0d0ce5b-408c-47ab-a734-fa55ba4d9c00`.

Kiểm sau hard refresh:

1. Mouse wheel cuộn được dropdown list dài.
2. Khi dropdown chạm biên, wheel relay về child grid nếu còn khoảng cuộn.
3. Kiểm Item, UOM, Warehouse ở bảng lớn và bảng gọn.
4. Không còn nhóm lựa chọn gần đây.
5. Không ghi credential/cookie/dữ liệu khách hàng vào evidence.

## Purchase/FIFO — browser QA và activation gate

- FIFO rollout vẫn **disabled**.
- Không coi deploy code là approval kích hoạt.

Trước activation:

1. Staging migration/backfill dry-run.
2. Review unresolved report và checksum.
3. `unresolved_count=0`.
4. Staging smoke PO → Receipt → cancel → settlement/manual override → report.
5. Kiểm contention/latency.
6. Backup production mới.
7. Explicit approval riêng.

## Runbook bắt buộc

Mọi AI tiếp tục phải đọc:

- `AI_HANDOFF.md`.
- `CURRENT_STATUS.md`.
- `NEXT_TASKS.md`.
- `docs/runbooks/AI_CI_CD_RUNBOOK.md`.
- `docs/runbooks/AI_RELEASE.md`.

Không tạo workflow mới nếu workflow hiện có đáp ứng được và chưa ghi điều kiện xóa.

## Safety

- Không deploy Cloudflare hoặc migrate D1 trong PR #69.
- Không sửa production secrets.
- FIFO giữ disabled.
- Không commit `.env`, `.dev.vars`, `server/work/`, `tmp/`, backup hoặc generated artifacts.
