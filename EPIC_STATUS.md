# FORGE EPIC STATUS

Ngày cập nhật: **2026-08-01**.

## Snapshot GitHub

- Repository: `nguyentrieu210/forge`.
- Default branch: `hotfix/alumdoor-print-list-delete`.
- Default head khi đồng bộ branch sửa CI: `04c33c0193815196bd6f10492be77fe64d175bbe`.
- Branch điều phối hiện tại: `ci/stop-duplicate-builds-20260801`.
- GitHub là nguồn sự thật cho code, PR, mergeability và CI.

## Luồng platform đang ACTIVE

| Hạng mục | Branch | Trạng thái | Điều kiện hoàn tất |
|---|---|---|---|
| Dừng duplicate build và agent loop | `ci/stop-duplicate-builds-20260801` | `ACTIVE / CI CLEANUP` | Exact-head checks xanh; xóa one-shot transport; CI scoped; merge vào default |

Không mở thêm platform cleanup hoặc business PR cho tới khi luồng này merge.

## Quy tắc điều phối mới

1. Một epic chỉ có một branch và một PR canonical.
2. Không thay head khi CI đang chạy.
3. `CI` là nơi duy nhất chạy full test + typecheck + build.
4. `PR Validation` chỉ làm policy/changed-file gate.
5. Feature workflow chỉ chạy focused tests đúng phạm vi hoặc PASS nhanh.
6. UI/browser/auth chỉ chạy khi thay đổi liên quan.
7. Production observation không chạy trên PR.
8. Cấm workflow `*once*`, transport/sync workflow và hidden trigger.
9. Release chỉ từ exact merged SHA qua dedicated release workflow.

## Hàng đợi nghiệp vụ canonical

| Thứ tự | Epic | PR/nhánh canonical | Trạng thái | Điều kiện chuyển bước |
|---|---|---|---|---|
| 1 | Sales-to-Production | Chưa có branch sạch | `BLOCKED / WAIT CI CLEANUP` | CI cleanup merge; dựng branch từ exact default; source/test thật; focused gate + full CI xanh |
| 2 | Purchase authenticated QA | PR #103 đóng, chỉ làm nguồn tham khảo | `QUEUED / CLEAN REBUILD` | Sales merge; dựng branch mới; authenticated desktop/mobile lifecycle xanh |
| 3 | Finance | PR #15 chỉ làm nguồn tham khảo | `QUEUED / REBUILD` | Dựng lại từ current default; allocation, statements, balances và UI hoàn chỉnh |
| 4 | Daily ledger | Chưa có PR | `QUEUED` | Immutable snapshot, adjustment workflow, quyền và reconciliation |
| 5 | Warranty / Capacity | Chưa có PR | `QUEUED` | Warranty/accounting lifecycle và capacity/overtime policy |
| 6 | End-to-end acceptance | Chưa có PR | `QUEUED` | Authenticated journey toàn chuỗi PASS |

## PR đã dừng

- #103: Purchase QA stale/diverged; không reopen.
- #107: Sales transport cũ; không reopen.
- #119: Sales branch đổi head và thêm workflow one-shot; không reopen.
- #122: docs-only cleanup cũ; superseded bởi branch CI cleanup hiện tại.

Branch cũ chỉ được dùng để đọc hoặc trích từng file đã review, không merge nguyên nhánh.

## CI architecture sau khi cleanup merge

### Mọi PR

- Required check names vẫn xuất hiện.
- Check không liên quan PASS nhanh, không cài dependencies.
- Push mới cùng PR hủy run cũ.

### Code PR

- Một full `CI`.
- Focused Sales/Purchase/Inventory gate theo scope.
- UI/browser/auth gate theo scope.
- Không deploy trong PR validation.

### Sau merge

- Dedicated release workflow đánh giá path và exact merged SHA.
- Không dùng trigger tạm để chở code hoặc ép release.

## Definition of Done toàn hệ thống

- Sáu epic nghiệp vụ đều `DONE`.
- Không còn PR canonical mở.
- Exact merged SHA có CI và release evidence tương ứng.
- Authenticated end-to-end acceptance PASS.
- Critical/High blocker bằng 0.
- FIFO chỉ đổi trạng thái khi có lệnh riêng và đủ backup/checksum/rollback.

## Safety

- Không deploy Cloudflare trong đợt CI cleanup.
- Không sửa production secret hoặc DNS.
- Không bật FIFO.
- Không mutate dữ liệu khách hàng.
- Không commit `.env`, `server/work/`, `tmp`, backup hoặc generated evidence.
