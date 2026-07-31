# FORGE EPIC STATUS

Ngày cập nhật: **2026-08-01**.

## Snapshot GitHub

- Repository: `nguyentrieu210/forge`.
- Default branch: `hotfix/alumdoor-print-list-delete`.
- Current release/default head: `fd0a3e697a25dc3907c5e7aa751a593ad8c01628`.
- Inventory Slice D merge: `a7e6ef65b2352f596e285ea34d8e6438dff11a95` — PR #82.
- Production workflow fix: `fd0a3e697a25dc3907c5e7aa751a593ad8c01628` — PR #130.
- GitHub là nguồn sự thật cho code, CI, release runs và artifacts.

## Platform và release status

| Hạng mục | PR | Trạng thái | Evidence |
|---|---:|---|---|
| Dừng duplicate build và agent loop | #127 | `DONE / MERGED` | Merge `60e19f0...`; scoped CI active |
| Inventory physical-stock Slice D foundation | #82 | `DONE / MERGED / RELEASED` | Merge `a7e6ef6...`; app, Gateway và tenant production PASS |
| Tenant/Gateway production workflow planning fix | #130 | `DONE / MERGED` | Merge `fd0a3e69...`; exact-head CI + scoped gates SUCCESS |

Không còn platform/release task ACTIVE cho Slice D. Chỉ mở task mới khi có lỗi cụ thể được chứng minh bằng log hoặc smoke.

## Production evidence

| Target | Run | Head | Version | Kết quả |
|---|---:|---|---|---|
| Alumdoor app Worker | `30657418272` | `e54de092...` | `cbd99611-daf3-4190-b1e4-fc2b4ce74227` | SUCCESS; provider identity + bindings PASS |
| Gateway/runtime | `30659230293` | `fd0a3e69...` | `7a3c1130-4c7e-4089-96b9-9b6fcc7a2ca7` | SUCCESS; health/root 200, guest 403, exact SHA visible |
| alu Tenant Worker | `30659229116` | `fd0a3e69...` | `c5db02b4-eee9-4da8-8c3f-f5a346b2230c` | SUCCESS; backup, migration, deploy, health/auth/report smoke PASS |

FIFO vẫn disabled. Không sửa DNS hoặc production secrets.

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
10. Release chỉ từ exact merged SHA qua dedicated production workflow.
11. Migration production phải có backup/recovery trước execute.

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
- #122: docs cleanup cũ; không reopen.
- #128: temporary production inspector; đã đóng, không merge.

Branch cũ chỉ dùng để đọc hoặc trích từng file đã review, không merge nguyên nhánh.

## Definition of Done toàn hệ thống

- Sáu epic nghiệp vụ đều `DONE`.
- Không còn PR canonical mở.
- Exact merged SHA có CI và release evidence tương ứng.
- Authenticated end-to-end acceptance PASS.
- Critical/High blocker bằng 0.
- FIFO chỉ đổi trạng thái khi có lệnh riêng và đủ backup/checksum/rollback.

## Safety

- Không sửa production secret hoặc DNS nếu chưa có lệnh riêng.
- Không xóa Cloudflare resource.
- Không bật FIFO.
- Không mutate dữ liệu khách hàng ngoài smoke an toàn có cleanup.
- Không commit `.env`, `server/work/`, `tmp`, backup, credential hoặc generated evidence.
