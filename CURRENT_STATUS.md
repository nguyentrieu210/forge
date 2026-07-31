# CURRENT STATUS

Ngày cập nhật: **2026-07-31**.

## Repository

- Repository: `nguyentrieu210/forge`.
- Default branch: `hotfix/alumdoor-print-list-delete`.
- Working branch: `feat/purchase-fifo-staging-checksum-lock-20260731`.
- Draft PR: `#77` — `fix(purchase): lock staging backfill to reviewed checksum`.
- Base/default head: `f0768d59ff66d04c333fd290c120f7672a80ea96`.

## Purchase/FIFO

### Đã hoàn tất

- PR `#63` hoàn tất lifecycle correction và browser QA.
- Tenant production code/migration đã release; Worker hiện hành `88c508a7-f3f7-4844-9c8b-85a02bc362f3`.
- PR `#75` thêm read-only readiness wrapper, safety regression và activation runbook; squash merge `f0768d59ff66d04c333fd290c120f7672a80ea96`.
- FIFO rollout vẫn **disabled**.

### PR #77 — checksum lock cho write mode

Lỗ hổng vận hành được xử lý:

- trước đây staging `--execute` không bắt buộc checksum đã review;
- dữ liệu có thể thay đổi giữa dry-run và execute mà write vẫn tiếp tục;
- activation đã có checksum gate nhưng staging backfill chưa có cùng bảo vệ.

Cách sửa:

- mọi `--execute` bắt buộc `--expected-checksum`;
- plan hiện tại được recompute và so với checksum approved trước D1 mutation;
- missing/malformed/drift checksum fail closed;
- activation tái sử dụng cùng gate;
- runbook staging command đã thêm checksum bắt buộc;
- regression CLI bao phủ missing, mismatch và matching checksum.

## Verification

- Chưa chạy tenant thật hoặc Cloudflare.
- GitHub Actions sẽ là nguồn xác nhận test/typecheck/build trên exact final head PR `#77`.

## Gate còn lại trước activation

1. PR `#77` CI xanh và merge.
2. Chọn staging tenant hoặc production-shaped sanitized copy.
3. Read-only dry-run, `unresolved_count=0`, review checksum/PO rows.
4. Execute staging bằng chính checksum approved; rollout phải vẫn `enabled=0`.
5. Authenticated business smoke và contention/latency evidence.
6. Fresh production backup và explicit activation approval riêng.

## Safety

- Không deploy Cloudflare.
- Không backfill tenant thật trong PR này.
- Không sửa secrets/DNS/production.
- Không commit `.env`, `server/work/`, `tmp/`, backup hoặc generated evidence.
