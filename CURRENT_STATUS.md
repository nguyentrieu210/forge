# CURRENT STATUS

Ngày cập nhật: **2026-08-01**.

## Repository

- Repository: `nguyentrieu210/forge`.
- Default branch: `hotfix/alumdoor-print-list-delete`.
- Default head sau CI cleanup: `60e19f0a6f498a2471a14210ec6939b3bdf1a0fd`.
- CI cleanup PR: #127.
- Canonical queue: `EPIC_STATUS.md`.

## CI cleanup — DONE

PR #127 đã squash-merge từ exact head `a2dd1fe684b17eb7acf71f0413c96143fcf540e7`.

| Workflow | Run | Kết quả |
|---|---:|---|
| CI | `30658270361` | SUCCESS |
| PR Validation | `30658270951` | SUCCESS |
| Sales Feature CI | `30658272023` | SUCCESS |
| Purchase Feature CI | `30658271484` | SUCCESS |
| Inventory and Manufacturing CI | `30658270984` | SUCCESS |
| UI Pull Request Validation | `30658270824` | SUCCESS |

Không có production observation hoặc release job chạy trên PR này.

## Thay đổi đã vào default

- `CI` chỉ chạy push trên default và PR vào default.
- Docs-only có fast path không cài dependency.
- `PR Validation` là policy gate nhẹ, không duplicate test/typecheck/build và không deploy.
- Sales/Purchase/Inventory giữ required check nhưng chỉ chạy focused gate đúng phạm vi.
- UI/browser/auth QA chỉ chạy khi file liên quan thay đổi.
- Production observation không trigger trên mọi PR.
- One-shot Sales sync workflow và hidden trigger đã bị xóa.
- Dedicated release workflows vẫn tồn tại riêng.

## Hành vi đã xác minh

- Một exact head duy nhất được giữ suốt lượt CI của #127.
- Full test, typecheck và build chạy một lần trong CI.
- Sales, Purchase và Inventory focused tests đều xanh.
- UI build và Alumdoor browser QA xanh.
- Purchase browser QA và auth smoke được skip đúng vì #127 không sửa phạm vi Purchase/auth.
- PR Validation hoàn tất nhanh, không cài dependencies.

## Trạng thái nghiệp vụ

1. Sales-to-Production — `NEXT / CLEAN REBUILD`.
2. Purchase authenticated QA — `QUEUED / CLEAN REBUILD`.
3. Finance — `QUEUED / REBUILD`.
4. Daily ledger — `QUEUED`.
5. Warranty / Capacity — `QUEUED`.
6. End-to-end acceptance — `QUEUED`.

Toàn hệ thống chưa đạt end-to-end acceptance.

## PR không được reopen

- #103: Purchase QA stale/diverged.
- #107: Sales transport cũ.
- #119: Sales branch đổi head và mang workflow one-shot.
- #122: docs cleanup cũ, đã bị #127 thay thế.

## Lỗi còn lại

- Chưa có PR Sales-to-Production sạch trên default mới.
- Purchase authenticated desktop/mobile QA chưa được dựng lại.
- Finance, daily ledger, warranty/capacity và whole-process acceptance còn thiếu.

## Safety

- Không deploy Cloudflare trong đợt cleanup.
- Không sửa production secret hoặc DNS.
- Không bật FIFO.
- Không mutate tenant data.
- Không commit `.env`, `server/work/`, `tmp`, backup hoặc generated evidence.
