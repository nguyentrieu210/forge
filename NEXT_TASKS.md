# NEXT TASKS

Ngày cập nhật: **2026-07-31**.

## P0 — Verify stable CI/CD PR

1. Mở draft PR từ `chore/optimize-ci-cd-stable-20260731` vào `hotfix/alumdoor-print-list-delete`.
2. Lấy exact final HEAD và merge commit SHA.
3. Xác minh branch behind `0`, conflict-free và mergeable.
4. Kiểm:
   - `PR Validation`;
   - `Business Domain CI`;
   - `UI Pull Request Validation` nếu scope phù hợp.
5. Đọc đúng failed step/log; không sửa code nếu job chưa checkout hoặc không có steps.
6. Kiểm branch protection không còn yêu cầu các check đã xóa.
7. Giữ PR draft tới khi required checks PASS.
8. Không merge nếu người dùng chưa yêu cầu rõ.

## P0 — Nếu Actions không tạo run

1. Kiểm repository Actions permissions/settings.
2. Kiểm billing/spending limit, policy và runner availability.
3. Kiểm workflow YAML/expression trên PR merge ref.
4. Phân loại là pre-run/configuration/infrastructure nếu không có steps/log.
5. Không tạo commit nghiệp vụ để chữa runner chưa chạy.

## P1 — Dry verification immutable Gateway release

Sau khi CI/CD PR merge và có yêu cầu riêng:

1. Chạy `Gateway Release Candidate` trên exact CI-green SHA.
2. Xác minh artifact `release.json` có đúng SHA và immutable version ID.
3. Không promote production trong cùng checkpoint candidate.
4. Khi được yêu cầu release, dùng cùng SHA/version ID trong `Gateway Production Release`.
5. Xác minh production release không build frontend lại.
6. Ghi run ID, version ID, smoke và provider evidence vào `CURRENT_STATUS.md`.

## P1 — Production version evidence sau Purchase release

1. Đọc run/job/artifact của execution PR #72.
2. Ghi Tenant Worker version ID mới nhất, backup, migration, deploy và smoke.
3. Xác nhận FIFO vẫn disabled.

## P1 — Functional smoke

### Sales price autofill

- Kiểm Price List + Item + UOM tự điền giá.
- Đổi UOM/Price List không lấy chéo giá.
- Legacy/non-canonical Item Price vẫn khớp theo field.
- Lưu rồi huỷ/xoá chứng từ thử an toàn.

### Dialog child-table dropdown

- Mouse wheel cuộn dropdown dài.
- Chạm biên thì relay về child grid.
- Kiểm Item/UOM/Warehouse, bảng lớn và bảng gọn.
- Không còn lựa chọn gần đây.

### Purchase/FIFO

- Browser/business smoke PO → Receipt → cancel → settlement/reverse/report.
- Trước activation: staging backfill/checksum, `unresolved_count=0`, latency/contention evidence, backup mới và explicit approval.

## Runbook bắt buộc

Mọi AI tiếp tục phải đọc:

- `AI_HANDOFF.md`.
- `CURRENT_STATUS.md`.
- `NEXT_TASKS.md`.
- `docs/runbooks/AI_CI_CD_RUNBOOK.md`.
- `docs/runbooks/AI_RELEASE.md`.

Không tạo workflow mới nếu workflow hiện có đáp ứng được và chưa ghi điều kiện xóa.

## Safety

- Không deploy Cloudflare hoặc migrate D1 trong CI/CD PR.
- Không sửa production secrets.
- FIFO giữ disabled.
- Không commit `.env`, `.dev.vars`, `server/work/`, `tmp/`, backup hoặc generated artifacts.
