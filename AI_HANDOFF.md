# AI HANDOFF

Ngày cập nhật: **2026-07-31**.

## Dự án

- Repository: `nguyentrieu210/forge`.
- Default branch: `hotfix/alumdoor-print-list-delete`.
- Working branch: `feat/purchase-fifo-activation-readiness-20260731`.
- Pull request: `#75` — draft.
- GitHub là nguồn sự thật cho code, CI và trạng thái release.

## Mục tiêu hiện tại

Hoàn tất Purchase/FIFO activation readiness mà không bật rollout và không đụng production.

## Thay đổi trên PR #75

- `server/scripts/prepare-purchase-fifo-activation.mjs`: wrapper read-only, chặn write/activate và bắt buộc evidence ngoài repo.
- `server/tests/purchase-fifo-activation-readiness.test.mjs`: regression cho safety guards.
- `server/docs/ALUMDOOR-PURCHASE-FIFO-ACTIVATION-RUNBOOK.md`: runbook staging/backfill/smoke/activation.
- `CURRENT_STATUS.md`, `NEXT_TASKS.md`, `AI_HANDOFF.md`: trạng thái và bước tiếp theo được làm gọn theo Purchase/FIFO.

## CI đã xác nhận

Trên head trước commit tài liệu `d586456e6e8b13f6097e19e7832c0032dd942745`:

- CI `30644592982`: PASS.
- PR Validation `30644592947`: PASS.
- Sales Feature CI `30644590752`: PASS.
- Inventory and Manufacturing CI `30644590579`: PASS.
- Purchase Feature CI `30644590592`: PASS.
- UI Pull Request Validation `30644593053`: đang chạy browser QA/auth smoke tại thời điểm handoff.

Commit tài liệu mới sẽ kích hoạt lại CI; phải kiểm exact final head trước khi chuyển PR khỏi draft hoặc merge.

## Safety state

- FIFO rollout vẫn **disabled**.
- Không deploy Cloudflare.
- Không backfill tenant thật.
- Không sửa production secrets hoặc DNS.
- Không commit `server/work/`, `tmp/`, `.env`, backup SQL hoặc generated evidence.

## Việc tiếp theo

1. Lấy exact final head của PR `#75`.
2. Kiểm đủ sáu workflow trên exact final head.
3. Nếu xanh toàn bộ, chuyển PR khỏi draft.
4. Sau merge mới chuẩn bị staging tenant/production-shaped copy và chạy read-only readiness.
5. Không execute backfill hoặc activation production nếu chưa có explicit approval riêng.
