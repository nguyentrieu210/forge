# CURRENT STATUS

Ngày cập nhật: **2026-07-31**.

## Repository

- Repository: `nguyentrieu210/forge`.
- Default branch: `hotfix/alumdoor-print-list-delete`.
- Working branch: `feat/purchase-fifo-staging-checksum-lock-20260731`.
- Draft PR: `#77` — `fix(purchase): lock staging backfill to reviewed checksum`.
- Base/default head sau release preparation: `89e9a532c63a7a94ba3f3fc123b9ada3a1816303`.

## Bán hàng — legacy Item Price Unicode-UOM hotfix đã release production

- Lỗi production: Sales Order child grid có thể để trống `Đơn giá` dù tồn tại Item Price legacy hợp lệ, ví dụ `Giá niêm yết + TRỤC 114_1.8LY + Mét = 180000 VND`.
- Nguyên nhân: preview probe tên exact `<price_list>:<item_code>:<uom>` trước; UOM Unicode như `Mét` có thể trả lỗi transport/routing khác `404` và chặn bản ghi authoritative legacy `<price_list>:<item_code>`.
- Feature PR `#78` squash-merge SHA `60c604de69804b9daf9fb90bf9a5d6e86bb3af2d`.
- Exact feature head `0da6bf6dbdba9b81f5f3195e7ec54b93c4ef51f6`; cả sáu workflow PASS:
  - CI `30645713937`;
  - PR Validation `30645714000`;
  - Sales Feature CI `30645713973`;
  - Purchase Feature CI `30645714032`;
  - Inventory and Manufacturing CI `30645713952`;
  - UI Pull Request Validation `30645713926`.
- Release preparation PR `#80` squash-merge SHA `89e9a532c63a7a94ba3f3fc123b9ada3a1816303`, khóa workflow vào exact target SHA `60c604de69804b9daf9fb90bf9a5d6e86bb3af2d`.
- Execution PR `#83` đã đóng **không merge** sau release.
- Release run `30646396613`, job `91208710455`: **SUCCESS**.
- Backup tenant: PASS; recorded migrations: PASS; deploy: PASS; production smoke: PASS.
- Tenant Worker: `cloudforge-tenant-alu`.
- Production version ID: `7738ee39-bb39-4a38-bf8d-5e2e1834e572`.
- Deployment time: `2026-07-31T16:17:08.332Z`.
- `/health = 200`; unauthenticated boot = `403`.
- Không deploy Gateway, không sửa DNS/secrets, FIFO rollout vẫn **disabled**.
- Còn thiếu functional production smoke có đăng nhập để xác minh child grid tự điền đúng `180000 VND` và không lấy chéo UOM.

## Purchase/FIFO

### Đã hoàn tất

- PR `#63` hoàn tất lifecycle correction và browser QA.
- Tenant production code/migration đã release; Worker hiện hành đã được thay bởi sales hotfix release nêu trên.
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

## Gate còn lại trước FIFO activation

1. PR `#77` CI xanh và merge.
2. Chọn staging tenant hoặc production-shaped sanitized copy.
3. Read-only dry-run, `unresolved_count=0`, review checksum/PO rows.
4. Execute staging bằng chính checksum approved; rollout phải vẫn `enabled=0`.
5. Authenticated business smoke và contention/latency evidence.
6. Fresh production backup và explicit activation approval riêng.

## Safety

- Không bật FIFO production.
- Không sửa secrets/DNS.
- Không commit `.env`, `server/work/`, `tmp/`, backup hoặc generated evidence.
