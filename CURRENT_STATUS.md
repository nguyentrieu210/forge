# CURRENT STATUS

Ngày cập nhật: **2026-07-31**. Workspace vận hành chuẩn: `C:\Forge`.

## Repository

- Repository: `nguyentrieu210/forge`.
- Default branch: `hotfix/alumdoor-print-list-delete`.
- Working branch: `fix/purchase-readiness-symlink-docs-20260731`.
- GitHub là nguồn sự thật cho code, PR, CI và release evidence.
- Không commit `.env`, `.dev.vars`, secret, `server/work/`, `tmp/`, backup SQL hoặc generated artifacts.

## Forward-fix sau PR #75

- PR `#75` đã squash-merge thành `f0768d59ff66d04c333fd290c120f7672a80ea96`.
- PR này thêm Purchase/FIFO activation readiness wrapper, regression và runbook; FIFO vẫn **disabled**.
- Hai vấn đề hậu merge đang được sửa trên nhánh hiện tại:
  1. output path guard chỉ kiểm lexical path, chưa chặn symlink ngoài repository trỏ ngược vào source tree;
  2. `AI_HANDOFF.md`, `CURRENT_STATUS.md`, `NEXT_TASKS.md` bị thu hẹp thành Purchase-only và làm mất trạng thái Sales, Inventory, RBAC và release history.
- Script đã được đổi sang kiểm physical path qua existing ancestor + `realpathSync`.
- Regression mới tạo symlink ngoài repository trỏ vào `server/work/evidence` và bắt buộc guard từ chối.
- Chưa deploy Cloudflare, chưa backfill tenant, chưa sửa secret/DNS và chưa bật FIFO.

## Purchase/FIFO

- Lifecycle correction PR `#63` merge SHA `ac0c2241b2dc16abfd16b4b3e70943d8bbff8476`.
- Migration `0032_purchase_reversed_window_corrections.sql` đã áp dụng production.
- Tenant release run `30643069110`: backup, migration, deploy và smoke **PASS**.
- Tenant Worker hiện hành: `88c508a7-f3f7-4844-9c8b-85a02bc362f3`.
- Browser QA desktop/mobile và exact-head workflows của PR #63 đã PASS.
- Gate còn lại trước activation: staging/production-shaped dry-run, checksum review, `unresolved_count=0`, staging execute, authenticated business smoke, contention/latency evidence, fresh backup và approval riêng.

## Bán hàng

- Multi-UOM pricing/stock preview đã triển khai từ PR `#25`.
- Item picker filtering PR `#53` merge SHA `48fa4d77eefb46384272550f8f6c0699ed054fa6`.
- Price autofill fallback PR `#65` merge SHA `db2d5abd8273a5a6c266ba7343554ebeac27618c` và đã release Tenant production.
- Follow-up Unicode/legacy Item Price PR `#74` vẫn cần được theo dõi riêng; không được coi production acceptance hoàn tất chỉ vì unit/browser harness xanh.
- Functional acceptance còn lại: Item filter, multi-UOM không lấy chéo giá/tồn, đổi bảng giá reload rate, legacy/non-canonical Item Price và authoritative save-time pricing.

## UI child table

- Bỏ recent links PR `#58` merge SHA `db1cac83438f1d99ad9689005a7dd6e6d7979068`.
- Wheel scrolling thực tế trong Dialog dropdown PR `#62` merge SHA `b3dd1d15a1b52de698d0874b29feae79efe7ed6c`.
- Gateway production version hiện hành: `b0d0ce5b-408c-47ab-a734-fa55ba4d9c00`.
- Vẫn cần functional production smoke có đăng nhập cho bảng gọn/mở rộng, dropdown Item/UOM/Warehouse và boundary relay.

## Inventory và Manufacturing

- Slice A Item catalog/audit/validator có review score `96/100`, Critical/High = 0.
- Physical stock Slice B và manufacturing lifecycle/UI là các luồng riêng, không được ghi đè bởi handoff Purchase.
- Audit/report generated evidence phải nằm ngoài repository và không chứa dữ liệu khách hàng thô.

## RBAC

- Slice A PR `#37`, Slice B PR `#45` và post-merge QA PR `#48` đã merge.
- Regression hậu merge: `server/tests/rbac-post-merge-qa.test.mjs`.
- Staging/browser QA user lifecycle, role refresh, revoke và tenant isolation vẫn là việc riêng.

## Release automation

- Gateway release phải khóa exact target SHA, build/stage, deploy, smoke và provider evidence.
- Tenant release giữ backup → recorded migration → deploy → smoke → Wrangler version evidence.
- Execution PR chỉ dùng kích hoạt release và phải đóng không merge sau khi hoàn tất.
- Không dùng endpoint smoke đơn thuần để thay thế authenticated functional acceptance.

## Safety

- D1 migration append-only; forward-fix bằng migration mới.
- Không deploy Cloudflare hoặc sửa production secrets nếu chưa có yêu cầu rõ.
- Không kích hoạt FIFO khi chưa đủ staging evidence, checksum, backup và explicit approval.
