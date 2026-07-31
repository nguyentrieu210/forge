# FORGE EPIC STATUS

Ngày cập nhật: **2026-08-01**.

## Snapshot GitHub

- Repository: `nguyentrieu210/forge`.
- Default branch: `hotfix/alumdoor-print-list-delete`.
- Default head tại snapshot: `b832b56a31a72fa30dc6397d12d81d42fb4a3eb1`.
- Branch điều phối: `docs/stop-agent-loop-20260801`.
- GitHub là nguồn sự thật cho code, PR, mergeability và CI.

## Trạng thái khẩn cấp

Vòng chạy nhiều agent đã được dừng.

| PR | Epic | Kết quả |
|---|---|---|
| #107 | Sales-to-Production cũ | Đã đóng, superseded bởi #119 |
| #103 | Purchase authenticated QA | Đã đóng, branch diverged/mergeable=false |
| #119 | Sales-to-Production mới | Đã đóng, đổi head liên tục và final diff còn workflow/trigger one-shot |

Tại snapshot này không có PR nghiệp vụ canonical đang mở.

## Bằng chứng vòng lặp

- #119 đã đổi qua nhiều head trong khi required checks đang chạy.
- PR body vẫn ghi `7830ed336e9149abc25e24e1759754e827a966d0`, trong khi head sau đó là `4712d946...` rồi `73faad7c...`.
- Mỗi lần synchronize kích lại CI, PR Validation, Sales, Purchase, Inventory/Manufacturing và UI validation.
- Head `4712d946...` có toàn bộ required workflows FAILURE.
- Lỗi gốc chỉ là 3 server unit contract failures, nhưng agent lại tạo workflow `Fix Sales Production Tests Once` thay vì sửa trực tiếp branch.

## Quy tắc điều phối mới

1. Mỗi epic chỉ có một PR canonical.
2. Tạm thời chỉ một epic nghiệp vụ ACTIVE.
3. Không workflow/payload/trigger one-shot trong feature branch.
4. Không đổi head trong khi CI đang chạy.
5. Focused tests phải xanh trước khi mở PR hoặc chạy full CI.
6. PR stale/conflict/diverged không được tiếp tục chạy CI.
7. PR body phải khớp exact head.
8. Một lượt CI phải được đọc log và phân loại trước khi có lượt push tiếp theo.
9. Sau mỗi merge hoặc đóng PR canonical phải cập nhật bốn file handoff.

## Hàng đợi canonical

| Thứ tự | Epic | PR/nhánh canonical | Trạng thái | Điều kiện chuyển bước |
|---|---|---|---|---|
| 1 | Sales-to-Production | Chưa có PR; #119 chỉ là nguồn tham khảo | `BLOCKED / CLEAN REBUILD` | Branch mới từ current default; sửa trực tiếp 3 contract test; diff semantic; focused tests xanh; một exact head; full CI một lượt |
| 2 | Purchase authenticated QA | Chưa có PR; #103 chỉ là nguồn tham khảo | `QUEUED / CLEAN REBUILD` | Dựng branch sạch sau P0; Desktop + Pixel 7 lifecycle xanh; full CI xanh |
| 3 | Finance | #15 chỉ là nguồn tham khảo | `QUEUED / REBUILD` | Dựng lại từ default; hoàn thiện allocation, statements, balances và UI |
| 4 | Daily ledger | Chưa có PR | `QUEUED` | Immutable daily snapshot, adjustment workflow, permission và reconciliation |
| 5 | Warranty / Capacity | Chưa có PR | `QUEUED` | Lifecycle lỗi/bảo hành và capacity/overtime scheduling |
| 6 | End-to-end acceptance | Chưa có PR | `QUEUED` | Authenticated journey toàn chuỗi PASS |

## Lỗi P0 cần sửa

Head phân tích: `4712d946c8020f4111a976ce117ae1490f895064`.

Sales Feature CI run `30656395267`, job `91241708739`:

- 697 tests;
- 694 pass;
- 3 fail.

Lỗi:

- brief actual `2.0.35`, test catalog audit expected `2.0.34`;
- brief actual `2.0.35`, test item model expected `2.0.34`;
- permission fixture có thêm `Production Request`, assertion cũ chưa cập nhật.

Đây là lỗi phải sửa trực tiếp trong source/test, không tạo workflow tự sửa.

## Definition of Done toàn hệ thống

- Sáu epic đều `DONE`.
- Không còn PR nghiệp vụ canonical mở.
- Exact merged SHA có CI và release evidence tương ứng.
- Authenticated end-to-end acceptance PASS.
- Critical/High blocker bằng 0.
- FIFO chỉ đổi trạng thái khi có lệnh riêng và đủ backup/checksum/rollback.

## Safety

- Không deploy Cloudflare trong đợt điều phối này.
- Không sửa production secret hoặc DNS.
- Không bật FIFO.
- Không mutate dữ liệu khách hàng.
- Không commit `.env`, `server/work/`, `tmp`, backup hoặc generated evidence.
