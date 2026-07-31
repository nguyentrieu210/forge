# CURRENT STATUS

Ngày cập nhật: **2026-08-01**.

## Repository

- Repository: `nguyentrieu210/forge`.
- Default branch: `hotfix/alumdoor-print-list-delete`.
- Default head tại snapshot: `b832b56a31a72fa30dc6397d12d81d42fb4a3eb1`.
- Handoff branch: `docs/stop-agent-loop-20260801`.
- Canonical queue: `EPIC_STATUS.md`.

## Trạng thái tổng thể

- Toàn hệ thống chưa đạt end-to-end acceptance.
- Nền tảng Kho, BOM/Work Order, Purchase core, Sales MVP, RBAC và runtime workspace đã merge.
- Không có PR nghiệp vụ nào đang đủ điều kiện merge.
- Vòng chạy nhiều agent đã được dừng bằng cách đóng ba PR không còn hợp lệ: #107, #103 và #119.

## Vì sao chạy lâu nhưng không xong

### Sales-to-Production

- #107 và #119 cùng làm một epic.
- #115 đã merge workflow/trigger vận chuyển thay vì code nghiệp vụ.
- #119 đổi head nhiều lần trong khi CI đang chạy.
- Mỗi lần đổi head kích lại 6–8 workflow.
- Final diff #119 lại chứa workflow/trigger sửa test một lần, nên chưa phải final diff có thể merge.

### Purchase QA

- #103 chạy được phần lớn CI nhưng branch đã diverged và từng behind default 112 commit.
- Vì mergeable=false, dù CI xanh vẫn phải dựng lại trên current default và chạy lại.

## Lỗi exact của PR #119

Head đã phân tích: `4712d946c8020f4111a976ce117ae1490f895064`.

Required workflows đều FAILURE. Sales Feature CI run `30656395267`, job `91241708739` thất bại ở `Server unit tests`:

- 697 tests chạy;
- 694 pass;
- 3 fail.

Ba lỗi:

1. `alumdoor-catalog-audit.test.mjs` kỳ vọng brief `2.0.34`, actual `2.0.35`.
2. `alumdoor-item-model.test.mjs` kỳ vọng brief `2.0.34`, actual `2.0.35`.
3. Assertion permission cũ chưa tính `Production Request` mới.

Sau lỗi này head #119 lại đổi sang `73faad7c2ccb0007fa9bed8ce63ec98da6263d87`, PR body vẫn ghi SHA cũ và final diff thêm workflow/trigger one-shot. PR #119 đã đóng, chưa merge.

## Hàng đợi hiện tại

### 1. Sales-to-Production — BLOCKED / CLEAN REBUILD

- Không có PR canonical đang mở.
- #107 đóng, superseded.
- #119 đóng, giữ branch làm nguồn code/test tham khảo.
- Việc cần làm là rebuild sạch, sửa ba contract test trực tiếp và khóa head trước full CI.

### 2. Purchase authenticated QA — QUEUED / CLEAN REBUILD

- #103 đóng, không merge.
- Dựng lại từ default sau khi Sales-to-Production ổn định.
- Chỉ mang các file QA cần thiết, không merge lịch sử diverged.

### 3. Finance — QUEUED / REBUILD

- #15 chỉ dùng làm nguồn tham khảo.
- Chưa mở nhánh mới cho tới khi một epic trước được giải phóng.

### 4. Daily ledger — QUEUED

- Chưa có PR canonical.

### 5. Warranty / Capacity — QUEUED

- Chưa có PR canonical.

### 6. End-to-end acceptance — QUEUED

- Chỉ chạy khi năm epic trước đã merge và có evidence.

## Quy tắc chống vòng lặp

- Một epic, một PR.
- Tạm thời chỉ một epic nghiệp vụ ACTIVE.
- Không workflow/payload/trigger one-shot trong feature diff.
- Không đổi head trong khi CI chạy.
- Focused tests phải xanh trước full CI.
- Không chạy CI cho branch stale/conflict/diverged.
- Không dùng số workflow run hoặc số commit làm bằng chứng hoàn thành.

## Thay đổi trong đợt điều phối

- Đóng #107 và ghi rõ bị #119 thay thế.
- Đóng #103 vì diverged/mergeable=false.
- Đóng #119 vì đổi head liên tục và tái tạo workflow/trigger tạm.
- Không sửa application code.
- Không deploy, migration, secret, DNS hoặc dữ liệu production.

## Safety

- FIFO vẫn disabled.
- Không commit `.env`, `server/work/`, `tmp`, backup hoặc generated evidence.
