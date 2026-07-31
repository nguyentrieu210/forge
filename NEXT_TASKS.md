# NEXT TASKS

Ngày cập nhật: **2026-07-31**.

## P0 — chốt PR #77

1. Kiểm exact final head của `feat/purchase-fifo-staging-checksum-lock-20260731`.
2. Bắt buộc PASS:
   - Purchase Feature CI;
   - CI;
   - PR Validation;
   - UI Pull Request Validation;
   - Sales Feature CI;
   - Inventory and Manufacturing CI.
3. Nếu lỗi, đọc đúng failed step và log trước khi sửa.
4. Khi tất cả xanh, cập nhật PR body và chuyển khỏi draft.
5. Không merge khi checksum regression hoặc Purchase build chưa PASS.

## P0 — staging readiness sau merge

1. Chọn staging tenant hoặc production-shaped sanitized copy.
2. Chạy read-only readiness và lưu evidence ngoài repository.
3. Review checksum SHA-256, `unresolved_count=0`, counts và PO-level rows.
4. Execute staging phải dùng:
   - `--confirm <exact-tenant>`;
   - `--expected-checksum <reviewed-sha256>`;
   - named actor;
   - output ngoài repository.
5. Xác minh stored checksum/counts khớp và rollout vẫn `enabled=0`.

## P0 — functional acceptance

- Purchase Order submit;
- Purchase Receipt preview/submit;
- partial và multiple-source FIFO;
- cancel Receipt;
- close/reverse settlement;
- manual override với permission/reason;
- supplier debt report/filter/export;
- desktop/mobile;
- contention/retry và latency evidence.

## P0 — activation preparation

- Fresh production read-only dry-run.
- Fresh production backup.
- Exact CI-green SHA, deployed Worker version, checksum và named actor.
- Explicit approval riêng cho production activation.

## Không được làm

- Không deploy Cloudflare nếu chưa được yêu cầu rõ.
- Không sửa production secrets hoặc DNS.
- Không bật FIFO production trong PR `#77`.
- Không commit `.env`, `server/work/`, `tmp/`, backup hoặc generated reports.
- Không chỉnh migration đã áp dụng; forward-fix bằng migration mới.
