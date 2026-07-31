# FORGE EPIC STATUS

Ngày cập nhật: **2026-08-01**.

## Snapshot GitHub

- Repository: `nguyentrieu210/forge`.
- Default branch: `hotfix/alumdoor-print-list-delete`.
- Default head sau CI cleanup: `60e19f0a6f498a2471a14210ec6939b3bdf1a0fd`.
- CI cleanup PR #127: `DONE / MERGED`.
- GitHub là nguồn sự thật cho code, PR, mergeability và CI.

## Platform status

| Hạng mục | PR | Trạng thái | Evidence |
|---|---:|---|---|
| Dừng duplicate build và agent loop | #127 | `DONE / MERGED` | Head `a2dd1fe...`; merge `60e19f0...`; 6 exact-head workflows SUCCESS |

Không còn platform cleanup ACTIVE. Chỉ mở platform task mới khi có lỗi cụ thể được chứng minh bằng log.

## Quy tắc điều phối

1. Một epic chỉ có một branch và một PR canonical.
2. Focused test xanh trước khi push.
3. Không thay head khi CI đang chạy.
4. `CI` là nơi duy nhất chạy full test + typecheck + build.
5. `PR Validation` chỉ làm policy/changed-file gate.
6. Feature workflow chỉ chạy focused tests đúng phạm vi hoặc PASS nhanh.
7. UI/browser/auth chỉ chạy khi thay đổi liên quan.
8. Production observation không chạy trên PR.
9. Cấm workflow `*once*`, transport/sync workflow và hidden trigger.
10. Release chỉ từ exact merged SHA qua dedicated release workflow.

## Hàng đợi nghiệp vụ canonical

| Thứ tự | Epic | PR/nhánh canonical | Trạng thái | Điều kiện chuyển bước |
|---|---|---|---|---|
| 1 | Sales-to-Production | Chưa có branch sạch | `NEXT / CLEAN REBUILD` | Dựng từ exact default; source/test thật; focused gate + full CI xanh; final diff không file tạm |
| 2 | Purchase authenticated QA | PR #103 đóng, chỉ dùng tham khảo | `QUEUED / CLEAN REBUILD` | Sales merge; branch mới; authenticated desktop/mobile lifecycle xanh |
| 3 | Finance | PR #15 chỉ dùng tham khảo | `QUEUED / REBUILD` | Dựng lại từ current default; allocation, statements, balances và UI hoàn chỉnh |
| 4 | Daily ledger | Chưa có PR | `QUEUED` | Immutable snapshot, adjustment workflow, quyền và reconciliation |
| 5 | Warranty / Capacity | Chưa có PR | `QUEUED` | Warranty/accounting lifecycle và capacity/overtime policy |
| 6 | End-to-end acceptance | Chưa có PR | `QUEUED` | Authenticated journey toàn chuỗi PASS |

## PR đã dừng

- #103: Purchase QA stale/diverged; không reopen.
- #107: Sales transport cũ; không reopen.
- #119: Sales branch đổi head và thêm workflow one-shot; không reopen.
- #122: docs cleanup cũ, bị #127 thay thế; không reopen.

Branch cũ chỉ được dùng để đọc hoặc trích từng file đã review, không merge nguyên nhánh.

## CI architecture hiện hành

### Docs-only PR

- CI, Sales, Purchase, Inventory và UI check vẫn xuất hiện.
- CI và các feature/UI check đi fast path, không cài dependencies.
- PR Validation chỉ kiểm policy.
- Không production observation hoặc release.

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

- Không deploy Cloudflare hoặc sửa production secret/DNS nếu chưa có lệnh rõ.
- Không bật FIFO.
- Không mutate dữ liệu khách hàng ngoài smoke an toàn có cleanup.
- Không commit `.env`, `server/work/`, `tmp`, backup hoặc generated evidence.
