# AI HANDOFF

Ngày cập nhật: **2026-07-31**.

## Dự án

- Repository: `nguyentrieu210/forge`.
- Default branch: `hotfix/alumdoor-print-list-delete`.
- Working branch: `feat/purchase-fifo-staging-checksum-lock-20260731`.
- Draft PR: `#77` — `fix(purchase): lock staging backfill to reviewed checksum`.
- Base/default head khi mở nhánh: `f0768d59ff66d04c333fd290c120f7672a80ea96`.

## Mục tiêu

Ngăn staging/production backfill write chạy trên dữ liệu đã thay đổi sau khi checksum dry-run được review.

## Thay đổi

- `server/scripts/backfill-purchase-receipt-allocations.mjs`
  - mọi `--execute` bắt buộc `--expected-checksum`;
  - plan được recompute và checksum được so sánh trong cùng tiến trình trước bất kỳ D1 write nào;
  - activation dùng chung checksum gate;
  - thiếu/malformed/drift checksum đều fail closed.
- `server/tests/purchase-allocation-write-checksum.test.mjs`
  - thiếu checksum bị chặn trước khi đọc nguồn;
  - checksum drift bị chặn trước fixture/write protection;
  - checksum khớp đi qua approval gate.
- `server/docs/ALUMDOOR-PURCHASE-FIFO-ACTIVATION-RUNBOOK.md`
  - staging execute bắt buộc checksum đã review.

## Safety

- Không deploy Cloudflare.
- Không chạy backfill tenant thật.
- Không bật FIFO.
- Không sửa production secrets hoặc DNS.
- Không commit `server/work/`, `tmp/`, `.env`, backup hoặc generated evidence.

## Việc tiếp theo

1. Kiểm exact final head PR `#77`.
2. Đọc failed step nếu CI lỗi; chỉ sửa theo bằng chứng.
3. Khi đủ CI, cập nhật PR body và chuyển khỏi draft.
4. Sau merge mới chạy readiness trên staging/production-shaped copy.
5. Activation production vẫn cần fresh backup và explicit approval riêng.
