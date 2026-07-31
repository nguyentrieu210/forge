# NEXT TASKS

Ngày cập nhật: **2026-07-31**.

## P0 — chốt PR #75

1. Đợi CI chạy lại trên exact final head sau commit tài liệu.
2. Nếu mọi workflow PASS, chuyển PR `#75` khỏi draft.
3. Không merge nếu UI browser QA hoặc auth smoke chưa PASS.

## P0 — staging readiness

1. Chọn staging tenant hoặc production-shaped copy phù hợp.
2. Chạy read-only readiness command theo `server/docs/ALUMDOOR-PURCHASE-FIFO-ACTIVATION-RUNBOOK.md`.
3. Lưu report/evidence ngoài repository.
4. Review:
   - checksum SHA-256;
   - `unresolved_count=0`;
   - PO-level checksum rows;
   - không có ambiguous legacy child-row mapping.
5. Chỉ sau review mới execute backfill trên staging.
6. Xác minh sau backfill:
   - ledger counts khớp plan;
   - stored checksum khớp approved checksum;
   - `unresolved_count=0`;
   - rollout vẫn `enabled=0`.

## P0 — functional acceptance

Chạy authenticated business smoke trên dữ liệu thử kiểm soát:

- Purchase Order submit;
- Purchase Receipt allocation preview và submit;
- partial/multiple-source FIFO;
- cancel Receipt;
- close settlement window;
- reverse settlement;
- manual allocation override với reason/permission;
- supplier debt report/filter/export;
- desktop và mobile.

## P0 — activation preparation

- Thu contention/retry và latency evidence.
- Tạo fresh production backup ngay trước activation.
- Ghi exact target SHA, checksum, actor và approval.
- Activation là thao tác riêng; không gộp vào deploy code/migration.
- Không bật FIFO production khi chưa có explicit approval.

## Không được làm

- Không deploy Cloudflare nếu chưa được yêu cầu rõ.
- Không sửa production secrets hoặc DNS.
- Không commit `server/work/`, `tmp/`, `.env`, backup hoặc generated reports.
- Không chỉnh migration đã áp dụng; forward-fix bằng migration mới.
